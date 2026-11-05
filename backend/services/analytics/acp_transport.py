"""ACP stdio transport: the second implementation of the five-operation seam.

P3-3a named ``transport.HostTransport`` over the Host's loopback HTTP bridge.
P3-3b adds the ACP path the P3-3 design selects for the external half: the run
kernel owns a child ``dsh --profile analytics-acp`` process and speaks the
Agent Client Protocol (standard JSON-RPC 2.0, newline-delimited) over the
child's stdin/stdout. The child's stdout is the protocol channel ONLY; every
diagnostic goes to stderr, which this transport drains into the module logger.
A line on stdout that is not ACP JSON-RPC is contamination and fails the
child; it is never skipped or logged as ordinary output.

Operation mapping (the seam's required request/response fields are unchanged)
-----------------------------------------------------------------------------
=================  ==========================================================
operation          ACP exchange
=================  ==========================================================
health             ``initialize`` (once per child) + ``session/list``; proves
                   the transport and the session store are alive, NEVER that
                   an agent is ready (rc.5 session/list carries no status)
dispatch           ``session/new`` (or ``session/resume`` after a child exit)
                   then one asynchronous ``session/prompt``; returns
                   ``{"accepted": true}`` after the request is written
observe            the in-flight prompt's settlement + drained
                   ``session/update`` tool-call projection; no extra RPC
cancel             one ``session/cancel`` notification (fire-and-forget,
                   never an acknowledgement); returns ``{"accepted": true}``
identity           NOT SUPPORTED in this slice: ACP has no equivalent of the
                   Host's CRM identity observation, so this transport exposes
                   it through ``capabilities`` and raises
                   ``AcpUnsupportedOperation`` (the resolver maps that to the
                   same retryable ``IDENTITY_UNAVAILABLE`` 503)
=================  ==========================================================

Termination mapping (rc.5 ``turnEndToStopReason``, ``acp/src/codec.ts:14-35``)
------------------------------------------------------------------------------
``end_turn`` with at least one observed tool call -> ``SUCCEEDED``; the
dispatcher still decides whether a *successful* step backs it. ``end_turn``
with no tool call -> ``UNKNOWN``: rc.5 collapses ``blocked`` (which the bridge
maps to ``NEEDS_INPUT``) and ``aborted`` into the same ``end_turn``, so the
only fail-closed reading for a no-tool turn is "cannot prove success". Every
automation family in scope calls a server-side tool, so a text-only turn is not
a valid completion. ``cancelled`` -> ``CANCELLED`` (rc.5 also collapses
``interrupted`` and explicit cancellation here). ``max_tokens``,
``max_turn_requests``, ``refusal`` and a JSON-RPC prompt error -> ``FAILED``.
Any other reason -> ``UNKNOWN``. Only a settled prompt response proves exit:
a cancel receipt, a write success or a process signal never does. If the child
dies, the prompt's settlement is lost and ``observe`` raises, so the
dispatcher records one ``UNKNOWN`` and keeps the slot; it never fabricates an
outcome from process exit.

Correlation
-----------
``tool_call_id`` is the ACP ``toolCallId`` projected from rc.5
``event.data.callId`` (``acp/src/updates.ts:52-94``), so a completed
``tool_call_update`` is the same successful-call evidence the journal fold
produces. The session's single in-flight prompt is the correlation window: a
second dispatch for a session with an unsettled prompt fails closed. The
transport keeps its ACP session id in memory, keyed by the kernel
``session_id``; after a child exit it tries ``session/resume`` and only falls
back to ``session/new`` on a definitive JSON-RPC rejection (a timeout is
ambiguous and is never retried).

Profile wiring is a separate, generated artifact: ``scripts/dsh-b0/acp-profile.mjs``
writes ``<DSH_HOME>/profiles/analytics-acp`` (the shipped ``acp`` template plus
the workbench ``./tools`` row), locks its patch/entry bytes and can assert the
composed tree through ``dsh --profile analytics-acp --dump-config``. The
deployment installs the workbench package into that profile; ``from_config``
therefore accepts the command/args, workspace and private ``DSH_HOME`` as
deployment configuration. Until that profile is installed, selecting
``transport=acp`` fails closed at health (admission closed) rather than
silently using the bridge.
"""

from __future__ import annotations

import json
import logging
import os
import subprocess
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, BinaryIO, Callable, Final, Mapping, Protocol

from . import transport

PROTOCOL_VERSION: Final[int] = 1
DEFAULT_COMMAND: Final[str] = "dsh"
DEFAULT_ARGS: Final[tuple[str, ...]] = ("--profile", "analytics-acp")
CONNECT_ATTEMPTS: Final[int] = 2
EOF_GRACE_SECONDS: Final[float] = 1.0
MAX_PROMPT_CHARS: Final[int] = 8000

# The seam's five names minus the one this transport cannot serve.
CAPABILITIES: Final[frozenset[str]] = frozenset({"health", "dispatch", "observe", "cancel"})


class AcpTransportError(RuntimeError):
    """Any failure of one ACP transport operation; the seam's only failure type."""


class AcpUnsupportedOperation(AcpTransportError):
    """The operation exists on the seam but has no ACP equivalent."""


class AcpProtocolError(AcpTransportError):
    """The child answered outside the ACP JSON-RPC contract."""


class AcpContaminationError(AcpProtocolError):
    """The child wrote non-protocol bytes to stdout."""


class AcpChildExited(AcpTransportError):
    """The child process or its protocol stream went away."""


class _RpcError(AcpTransportError):
    """A definitive JSON-RPC error response (safe to act on, unlike a timeout)."""

    def __init__(self, method: str, error: Any):
        code = error.get("code") if isinstance(error, dict) else None
        message = error.get("message") if isinstance(error, dict) else None
        super().__init__(f"ACP {method} failed: {code}: {message}")
        self.method = method
        self.code = code


class AcpChild(Protocol):
    """The injectable child-process surface; a ``subprocess.Popen`` subset."""

    stdin: BinaryIO
    stdout: BinaryIO
    stderr: BinaryIO | None

    def poll(self) -> int | None: ...

    def kill(self) -> None: ...

    def wait(self, timeout: float | None = None) -> int: ...


def spawn_acp_child(argv: list[str], *, cwd: str, env: Mapping[str, str]) -> AcpChild:
    """Default production spawn: the child inherits no protocol on stderr."""
    return subprocess.Popen(
        argv,
        cwd=cwd,
        env=dict(env),
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )


@dataclass
class _Prompt:
    run_id: str
    attempt_id: str
    request_id: str
    tool_calls: dict[str, str] = field(default_factory=dict)
    stop_reason: str | None = None
    error: str | None = None
    settled: bool = False
    settlement_lost: bool = False

    def successful_call_ids(self) -> list[str]:
        return [call_id for call_id, status in self.tool_calls.items() if status == "completed"]


@dataclass
class _Session:
    session_id: str
    acp_session_id: str | None = None
    generation: int = 0
    prompt: _Prompt | None = None
    lock: threading.Lock = field(default_factory=threading.Lock)


@dataclass
class _Pending:
    """One outstanding JSON-RPC id; a prompt response is settled, not awaited."""

    method: str
    event: threading.Event | None = None
    prompt: _Prompt | None = None
    response: dict | None = None
    error: str | None = None
    rpc_error: Any = None


def _as_object(value: Any) -> dict | None:
    return value if isinstance(value, dict) else None


class AcpTransport:
    """The five seam operations over one child ACP process.

    ``spawn`` is injectable so the tests drive an in-process fake ACP child over
    real pipes; production passes :func:`spawn_acp_child`. All RPC traffic is
    newline-delimited JSON on the child's stdin/stdout. ``call`` is synchronous
    and raises ``AcpTransportError`` on every failure; the dispatch/observe/
    cancel failure mapping is the dispatcher's, identical to the bridge path.
    """

    capabilities = CAPABILITIES

    def __init__(
        self,
        *,
        cwd: str,
        env: Mapping[str, str] | None = None,
        command: str = DEFAULT_COMMAND,
        args: tuple[str, ...] | list[str] = DEFAULT_ARGS,
        spawn: Callable[..., AcpChild] = spawn_acp_child,
        timeout: float = 30.0,
        logger: logging.Logger | None = None,
    ):
        if not isinstance(cwd, str) or not os.path.isabs(cwd):
            raise ValueError("ACP workspace cwd must be an absolute path")
        if not isinstance(command, str) or not command:
            raise ValueError("ACP child command must be a non-empty string")
        argv = [command, *(str(arg) for arg in args)]
        if any(not arg for arg in argv):
            raise ValueError("ACP child arguments must be non-empty strings")
        if not callable(spawn):
            raise ValueError("ACP child spawn factory must be callable")
        if not isinstance(timeout, (int, float)) or timeout <= 0:
            raise ValueError("ACP timeout must be positive")
        self.cwd = cwd
        self.argv = tuple(argv)
        self.env = dict(env or {})
        self.timeout = float(timeout)
        self.logger = logger or logging.getLogger(__name__)
        self._spawn = spawn
        self._state_lock = threading.RLock()
        self._io_lock = threading.RLock()
        self._spawn_lock = threading.Lock()
        self._child: AcpChild | None = None
        self._generation = 0
        self._dead = False
        self._closed = False
        self._next_id = 0
        self._pending: dict[int, _Pending] = {}
        self._sessions: dict[str, _Session] = {}
        self._kernel_by_acp: dict[str, str] = {}
        self._reader: threading.Thread | None = None

    # -- construction -----------------------------------------------------

    @classmethod
    def from_config(cls, config: Mapping[str, Any]) -> "AcpTransport":
        """Build from the run-kernel JSON config; fail closed on missing wiring."""
        if config.get("transport", "bridge") != "acp":
            raise ValueError("AcpTransport.from_config requires transport=acp")
        cwd = config.get("acp_cwd")
        if not isinstance(cwd, str) or not os.path.isabs(cwd):
            raise ValueError("transport=acp requires an absolute acp_cwd")
        if not os.path.isdir(cwd):
            raise ValueError("transport=acp requires acp_cwd to be an existing directory")
        state_dir = config.get("state_dir")
        home = config.get("acp_home")
        if home is None and isinstance(state_dir, str) and state_dir:
            home = os.path.join(state_dir, "acp-home")
        if not isinstance(home, str) or not os.path.isabs(home):
            raise ValueError("transport=acp requires an absolute acp_home or state_dir")
        home_path = Path(home)
        home_path.mkdir(mode=0o700, parents=True, exist_ok=True)
        command = config.get("acp_command", DEFAULT_COMMAND)
        args = config.get("acp_args", list(DEFAULT_ARGS))
        if (not isinstance(command, str) or not command
                or not isinstance(args, list) or any(not isinstance(arg, str) or not arg for arg in args)):
            raise ValueError("acp_command/acp_args must be explicit strings")
        extra = config.get("acp_env", {})
        if not isinstance(extra, dict) or any(
                not isinstance(key, str) or not key or not isinstance(value, str) for key, value in extra.items()):
            raise ValueError("acp_env must be a string-to-string mapping")
        timeout_ms = config.get("acp_timeout_ms", 30_000)
        if type(timeout_ms) is not int or timeout_ms <= 0:
            raise ValueError("acp_timeout_ms must be a positive integer")
        env = dict(os.environ)
        env.update(extra)
        # The ACP harness gets its own home; it must never resume a session
        # that belongs to the web host's store (design R7).
        env["DSH_HOME"] = str(home_path)
        return cls(cwd=cwd, env=env, command=command, args=args, timeout=timeout_ms / 1000)

    # -- seam -------------------------------------------------------------

    def supports(self, operation: str) -> bool:
        return operation in self.capabilities

    def call(self, operation: str, payload: Mapping[str, Any]) -> dict[str, Any]:
        """Run one seam operation; every failure is a transport failure."""
        if operation not in transport.OPERATIONS:
            raise ValueError("unsupported transport operation")
        if operation not in self.capabilities:
            raise AcpUnsupportedOperation(
                f"ACP transport has no {operation} operation (bridge-only in P3-3b)")
        handler = getattr(self, "_" + operation)
        try:
            return handler(dict(payload))
        except AcpTransportError:
            raise
        except Exception as error:  # noqa: BLE001 - the seam maps any failure
            raise AcpTransportError(f"ACP {operation} failed: {error}") from error

    def close(self) -> None:
        """Stop the child: stdin EOF first, then bounded kill escalation."""
        with self._spawn_lock:
            if self._closed:
                return
            self._closed = True
            if self._child is not None:
                self._fail_child(self._generation, AcpTransportError("ACP transport closed"), quiet=True)
            self._retire_child_locked(kill=False)

    # -- operations -------------------------------------------------------

    def _health(self, payload: Mapping[str, Any]) -> dict[str, Any]:
        generation = self._ensure_child()
        response = self._request("session/list", {}, generation, timeout=self.timeout)
        if not isinstance(response.get("sessions"), list):
            raise AcpProtocolError("ACP session/list did not return a session list")
        return {"ready": True}

    def _dispatch(self, payload: Mapping[str, Any]) -> dict[str, Any]:
        run_id, attempt_id, session_id, request_id = _correlation(payload)
        text = _prompt_text(payload, session_id, request_id)
        generation = self._ensure_child()
        session = self._activate_session(session_id, generation)
        with session.lock:
            # A prompt whose settlement died with its child can never be
            # in flight again; only a genuinely live prompt blocks the slot.
            if (session.prompt is not None and not session.prompt.settled
                    and not session.prompt.settlement_lost):
                raise AcpTransportError("an ACP prompt is already in flight for this session")
            prompt = _Prompt(run_id, attempt_id, request_id)
            session.prompt = prompt
            try:
                rpc_id = self._allocate_id()
                pending = _Pending("session/prompt", prompt=prompt)
                self._write_request(rpc_id, "session/prompt", {
                    "sessionId": session.acp_session_id,
                    "prompt": [{"type": "text", "text": text}],
                }, pending, generation)
            except Exception as error:
                session.prompt = None
                raise AcpTransportError(f"ACP dispatch failed: {error}") from error
        self.logger.debug("acp: dispatched run %s attempt %s (rpc %s)", run_id, attempt_id, rpc_id)
        return {"accepted": True}

    def _observe(self, payload: Mapping[str, Any]) -> dict[str, Any]:
        _run_id, attempt_id, session_id, request_id = _correlation(payload)
        with self._state_lock:
            session = self._sessions.get(session_id)
            prompt = session.prompt if session is not None else None
            session_generation = session.generation if session is not None else 0
        if prompt is None or prompt.attempt_id != attempt_id or prompt.request_id != request_id:
            # No correlation in this process: an unknown observation keeps the
            # slot held, exactly like a bridge observation without journal entry.
            return _observation(payload, False, "UNKNOWN", [])
        if prompt.settlement_lost:
            raise AcpChildExited("ACP prompt settlement was lost with the child process")
        if not prompt.settled:
            # The process poll is authoritative even before the reader reports
            # EOF: a dead child can never settle this prompt.
            if not self._child_alive() or session_generation != self._generation:
                raise AcpChildExited("ACP child holding the prompt is gone")
            return _observation(payload, False, "RUNNING", [])
        outcome, error_code, exited = _classify_prompt(prompt)
        return _observation(payload, exited, outcome, prompt.successful_call_ids(), error_code)

    def _cancel(self, payload: Mapping[str, Any]) -> dict[str, Any]:
        _run_id, attempt_id, session_id, request_id = _correlation(payload)
        with self._state_lock:
            session = self._sessions.get(session_id)
            if session is None or session.acp_session_id is None:
                raise AcpTransportError("no ACP session to cancel")
            prompt = session.prompt
        if (prompt is not None and not prompt.settled
                and (prompt.attempt_id != attempt_id or prompt.request_id != request_id)):
            raise AcpTransportError("cancel does not belong to the in-flight prompt")
        if not self._child_alive() or session.generation != self._generation:
            raise AcpChildExited("ACP child is not the one that holds this session")
        self._write_notification("session/cancel", {"sessionId": session.acp_session_id})
        # Fire-and-forget by contract: no ack exists and none is invented. Only
        # the prompt response settles the run; observe remains the exit proof.
        return {"accepted": True}

    # -- child lifecycle --------------------------------------------------

    def _ensure_child(self) -> int:
        with self._spawn_lock:
            if self._closed:
                raise AcpTransportError("ACP transport is closed")
            if self._child is not None and not self._dead and self._child.poll() is None:
                return self._generation
            self._retire_child_locked(kill=True)
            failures: list[Exception] = []
            for _attempt in range(CONNECT_ATTEMPTS):
                try:
                    self._start_child_locked()
                    return self._generation
                except Exception as error:  # noqa: BLE001 - bounded reconnect
                    failures.append(error)
                    self._retire_child_locked(kill=True)
            raise AcpTransportError(f"ACP child failed to start: {failures[-1]}") from failures[-1]

    def _start_child_locked(self) -> None:
        generation = self._generation + 1
        child = self._spawn(list(self.argv), cwd=self.cwd, env=self.env)
        if child.stdin is None or child.stdout is None:
            raise AcpTransportError("ACP spawn returned a child without protocol pipes")
        self._child = child
        self._generation = generation
        self._dead = False
        self._reader = threading.Thread(
            target=self._read_loop, args=(child, generation), name=f"acp-reader-{generation}", daemon=True)
        self._reader.start()
        if child.stderr is not None:
            threading.Thread(target=self._stderr_loop, args=(child.stderr, generation),
                             name=f"acp-stderr-{generation}", daemon=True).start()
        response = self._request("initialize", {
            "protocolVersion": PROTOCOL_VERSION,
            "clientCapabilities": {},
            "clientInfo": {"name": "dsh-analytics-run-kernel", "version": "b0"},
        }, generation, timeout=self.timeout)
        if response.get("protocolVersion") != PROTOCOL_VERSION:
            raise AcpProtocolError(
                f"ACP protocol version mismatch: {response.get('protocolVersion')!r}")
        self.logger.info("acp: child %s initialized (%s)", generation, self.argv[0])

    def _retire_child_locked(self, *, kill: bool) -> None:
        child, self._child = self._child, None
        if child is not None and not self._dead:
            # A dead process can win the poll() race before its reader sees EOF;
            # fail the exchanges here so a prompt can never stay "in flight".
            self._fail_child(self._generation, AcpChildExited("ACP child exited"))
        self._dead = True
        if child is None:
            return
        try:
            child.stdin.close()
        except Exception:  # noqa: BLE001 - a closed pipe is already retired
            pass
        if not kill:
            deadline = time.monotonic() + EOF_GRACE_SECONDS
            while time.monotonic() < deadline and child.poll() is None:
                time.sleep(0.01)
        if child.poll() is None:
            try:
                child.kill()
            except Exception:  # noqa: BLE001 - record no teardown failure here
                pass
        try:
            child.wait(timeout=EOF_GRACE_SECONDS)
        except Exception:  # noqa: BLE001 - reader EOF still retires the transport
            pass
        for stream in (child.stdout, child.stderr):
            try:
                if stream is not None:
                    stream.close()
            except Exception:  # noqa: BLE001
                pass
        reader, self._reader = self._reader, None
        if reader is not None and reader is not threading.current_thread():
            reader.join(timeout=EOF_GRACE_SECONDS)

    def _child_alive(self) -> bool:
        with self._state_lock:
            return self._child is not None and not self._dead and self._child.poll() is None

    def _fail_child(self, generation: int, error: Exception, *, quiet: bool = False) -> None:
        """Fail every outstanding exchange exactly once for this child."""
        with self._state_lock:
            if generation != self._generation or self._dead:
                return
            self._dead = True
            pending, self._pending = list(self._pending.values()), {}
            for item in pending:
                if item.prompt is not None:
                    item.prompt.settlement_lost = True
                    item.prompt.error = str(error)
                else:
                    item.error = str(error)
                    if item.event is not None:
                        item.event.set()
            for session in self._sessions.values():
                if session.generation == generation:
                    session.generation = 0
        if not quiet:
            self.logger.warning("acp: child %s failed: %s", generation, error)

    # -- JSON-RPC ---------------------------------------------------------

    def _allocate_id(self) -> int:
        with self._io_lock:
            self._next_id += 1
            return self._next_id

    def _request(self, method: str, params: Mapping[str, Any], generation: int, *, timeout: float) -> dict:
        rpc_id = self._allocate_id()
        pending = _Pending(method, event=threading.Event())
        try:
            self._write_request(rpc_id, method, params, pending, generation)
        except Exception as error:  # noqa: BLE001 - a write failure is a dead child
            self._fail_child(generation, AcpTransportError(f"ACP {method} write failed: {error}"))
            raise AcpTransportError(f"ACP {method} write failed: {error}") from error
        if not pending.event.wait(timeout):
            with self._io_lock:
                self._pending.pop(rpc_id, None)
            raise AcpTransportError(f"ACP {method} timed out")
        if pending.rpc_error is not None:
            raise _RpcError(method, pending.rpc_error)
        if pending.error is not None:
            raise AcpTransportError(pending.error)
        return pending.response if pending.response is not None else {}

    def _write_request(self, rpc_id: int, method: str, params: Mapping[str, Any],
                       pending: _Pending, generation: int) -> None:
        message = {"jsonrpc": "2.0", "id": rpc_id, "method": method, "params": dict(params)}
        with self._io_lock:
            if generation != self._generation:
                raise AcpChildExited("ACP child changed before the request was written")
            self._pending[rpc_id] = pending
            try:
                self._write_locked(message)
            except Exception:
                self._pending.pop(rpc_id, None)
                raise

    def _write_notification(self, method: str, params: Mapping[str, Any]) -> None:
        generation = self._generation
        try:
            with self._io_lock:
                self._write_locked({"jsonrpc": "2.0", "method": method, "params": dict(params)})
        except Exception as error:  # noqa: BLE001 - broken pipe means a dead child
            self._fail_child(generation, AcpTransportError(f"ACP {method} write failed: {error}"))
            raise AcpTransportError(f"ACP {method} write failed: {error}") from error

    def _write_locked(self, message: Mapping[str, Any]) -> None:
        child = self._child
        if child is None or child.stdin is None or self._dead:
            raise AcpChildExited("ACP child is not running")
        payload = json.dumps(message, ensure_ascii=True, separators=(",", ":")).encode("utf-8") + b"\n"
        child.stdin.write(payload)
        child.stdin.flush()

    # -- reader -----------------------------------------------------------

    def _read_loop(self, child: AcpChild, generation: int) -> None:
        try:
            while True:
                try:
                    raw = child.stdout.readline()
                except (OSError, ValueError):
                    break
                if not raw:
                    break
                self._handle_line(raw, generation)
                if generation != self._generation:
                    break
        except Exception as error:  # noqa: BLE001 - never lose the child for the reader thread
            self._fail_child(generation, AcpContaminationError(f"ACP reader failed: {error}"))
        finally:
            if generation == self._generation and not self._dead:
                self._fail_child(generation, AcpChildExited("ACP child closed its stdout"))

    def _handle_line(self, raw: bytes, generation: int) -> None:
        try:
            text = raw.decode("utf-8").strip()
        except UnicodeDecodeError as error:
            self._contaminated(generation, f"ACP stdout is not UTF-8: {error}")
            return
        if not text:
            return
        try:
            message = json.loads(text)
        except json.JSONDecodeError:
            self._contaminated(generation, "ACP stdout is not JSON-RPC")
            return
        if not isinstance(message, dict) or message.get("jsonrpc") != "2.0":
            self._contaminated(generation, "ACP stdout line is not JSON-RPC 2.0")
            return
        if "method" in message:
            if not isinstance(message["method"], str):
                self._contaminated(generation, "ACP stdout method is not a string")
                return
            if message.get("id") is None:
                self._handle_notification(message, generation)
            else:
                self._handle_server_request(message)
            return
        if "id" not in message or not ({"result", "error"} & set(message)):
            self._contaminated(generation, "ACP stdout line is neither request nor response")
            return
        self._handle_response(message)

    def _contaminated(self, generation: int, detail: str) -> None:
        error = AcpContaminationError(detail)
        self._fail_child(generation, error)
        with self._state_lock:
            child = self._child if generation == self._generation else None
        if child is not None:
            # Kill without the spawn lock: this runs on the reader thread, and
            # _ensure_child may be waiting for that reader under the lock.
            try:
                child.kill()
            except Exception:  # noqa: BLE001 - the next call retires the corpse
                pass

    def _handle_response(self, message: Mapping[str, Any]) -> None:
        with self._io_lock:
            pending = self._pending.pop(message["id"], None)
        if pending is None:
            self.logger.warning("acp: response for unknown request id %r", message["id"])
            return
        if pending.prompt is not None:
            with self._state_lock:
                if "error" in message:
                    pending.prompt.error = str(message["error"])
                else:
                    result = _as_object(message.get("result"))
                    stop_reason = result.get("stopReason") if result else None
                    if isinstance(stop_reason, str):
                        pending.prompt.stop_reason = stop_reason
                    else:
                        pending.prompt.error = "ACP prompt response has no stopReason"
                pending.prompt.settled = True
            return
        if "error" in message:
            pending.rpc_error = message["error"]
            pending.error = f"ACP {pending.method} error: {message['error']}"
        else:
            result = _as_object(message.get("result"))
            if result is None:
                pending.error = f"ACP {pending.method} response is not an object"
            else:
                pending.response = result
        if pending.event is not None:
            pending.event.set()

    def _handle_notification(self, message: Mapping[str, Any], generation: int) -> None:
        if message.get("method") != "session/update":
            self.logger.debug("acp: ignoring notification %r", message.get("method"))
            return
        params = _as_object(message.get("params"))
        update = _as_object(params.get("update")) if params else None
        session_id = params.get("sessionId") if params else None
        if update is None or not isinstance(session_id, str):
            self._contaminated(generation, "ACP session/update has no session or update object")
            return
        with self._state_lock:
            kernel_id = self._kernel_by_acp.get(session_id)
            session = self._sessions.get(kernel_id) if kernel_id is not None else None
            prompt = session.prompt if session is not None else None
            # Updates are ordered before the prompt response on the same stream;
            # anything later cannot belong to a still-settling prompt.
            if prompt is None or prompt.settled:
                return
            kind = update.get("sessionUpdate")
            call_id = update.get("toolCallId")
            if kind in {"tool_call", "tool_call_update"} and isinstance(call_id, str):
                status = update.get("status")
                prompt.tool_calls[call_id] = status if isinstance(status, str) else "in_progress"

    def _handle_server_request(self, message: Mapping[str, Any]) -> None:
        method = message.get("method")
        rpc_id = message.get("id")
        if method == "session/request_permission":
            # K is a machine policy channel, never a human: answer fail-closed
            # without inferring any durable grant (design R2).
            self.logger.warning("acp: permission request auto-rejected")
            self._respond(rpc_id, {"outcome": {"outcome": "cancelled"}})
            return
        self.logger.warning("acp: rejecting unsupported client method %r", method)
        self._respond_error(rpc_id, -32601, f"method not supported: {method}")

    def _respond(self, rpc_id: Any, result: Mapping[str, Any]) -> None:
        try:
            with self._io_lock:
                self._write_locked({"jsonrpc": "2.0", "id": rpc_id, "result": dict(result)})
        except Exception as error:  # noqa: BLE001 - response failure is a dead child
            self._fail_child(self._generation, AcpTransportError(f"ACP response write failed: {error}"))

    def _respond_error(self, rpc_id: Any, code: int, message: str) -> None:
        try:
            with self._io_lock:
                self._write_locked({"jsonrpc": "2.0", "id": rpc_id,
                                    "error": {"code": code, "message": message}})
        except Exception as error:  # noqa: BLE001
            self._fail_child(self._generation, AcpTransportError(f"ACP response write failed: {error}"))

    def _stderr_loop(self, stderr: BinaryIO, generation: int) -> None:
        """stderr is the only log channel; it is never parsed as protocol."""
        try:
            for raw in iter(stderr.readline, b""):
                if not raw:
                    break
                self.logger.debug("acp[%s] stderr: %s", generation, raw.decode("utf-8", "replace").rstrip())
        except (OSError, ValueError):
            return

    # -- sessions ---------------------------------------------------------

    def _activate_session(self, session_id: str, generation: int) -> _Session:
        with self._state_lock:
            session = self._sessions.get(session_id)
            if session is None:
                session = _Session(session_id)
                self._sessions[session_id] = session
        with session.lock:
            if session.acp_session_id is not None and session.generation == generation:
                return session
            if session.acp_session_id is not None:
                try:
                    self._request("session/resume", {
                        "sessionId": session.acp_session_id,
                        "cwd": self.cwd,
                        "mcpServers": [],
                    }, generation, timeout=self.timeout)
                except _RpcError as error:
                    # Definitive rejection: the persisted session is gone or its
                    # cwd moved. A timeout stays ambiguous and is not retried.
                    self.logger.warning("acp: session/resume rejected (%s); creating a new session", error)
                    session.acp_session_id = None
                else:
                    session.generation = generation
                    self._remember_acp_session(session)
                    return session
            response = self._request("session/new", {"cwd": self.cwd, "mcpServers": []},
                                     generation, timeout=self.timeout)
            acp_session_id = response.get("sessionId")
            if not isinstance(acp_session_id, str) or not acp_session_id:
                raise AcpProtocolError("ACP session/new returned no session id")
            session.acp_session_id = acp_session_id
            session.generation = generation
            self._remember_acp_session(session)
            return session

    def _remember_acp_session(self, session: _Session) -> None:
        with self._state_lock:
            self._kernel_by_acp[session.acp_session_id] = session.session_id


def _correlation(payload: Mapping[str, Any]) -> tuple[str, str, str, str]:
    values = []
    for key in transport.CORRELATION_FIELDS:
        value = payload.get(key)
        if not isinstance(value, str) or not value or len(value) > 200:
            raise AcpTransportError(f"ACP payload has no valid {key}")
        values.append(value)
    return values[0], values[1], values[2], values[3]


def _prompt_text(payload: Mapping[str, Any], session_id: str, request_id: str) -> str:
    inner = _as_object(payload.get("payload"))
    if inner is None:
        raise AcpTransportError("ACP dispatch payload is not an object")
    native = _as_object(inner.get("native_request"))
    if native is not None:
        if native.get("sessionId") != session_id or native.get("requestId") != request_id:
            raise AcpTransportError("ACP native request is not bound to this dispatch")
        content = native.get("content")
        block = content[0] if isinstance(content, list) and len(content) == 1 else None
        text = block.get("text") if isinstance(block, dict) and block.get("type") == "text" else None
    else:
        text = inner.get("question")
    if not isinstance(text, str) or not text.strip() or len(text) > MAX_PROMPT_CHARS:
        raise AcpTransportError("ACP dispatch has no valid prompt text")
    return text


def _observation(payload: Mapping[str, Any], exited: bool, outcome: str,
                 successful_call_ids: list[str], error_code: str | None = None) -> dict[str, Any]:
    evidence = {key: payload[key] for key in transport.CORRELATION_FIELDS}
    evidence.update({
        "execution_exited": exited,
        "outcome": outcome,
        "successful_call_ids": successful_call_ids,
    })
    if exited and outcome == "FAILED" and error_code is not None:
        evidence["error_code"] = error_code
    return evidence


def _classify_prompt(prompt: _Prompt) -> tuple[str, str | None, bool]:
    """Map one settled ACP prompt onto the existing dispatcher evidence classes."""
    if prompt.error is not None:
        return "FAILED", "MODEL_FAILED", True
    stop_reason = prompt.stop_reason
    if stop_reason == "end_turn":
        if not prompt.tool_calls:
            # rc.5 collapses blocked/aborted into end_turn; without tool-call
            # evidence this is UNKNOWN, never a manufactured success.
            return "UNKNOWN", None, False
        return "SUCCEEDED", None, True
    if stop_reason == "cancelled":
        return "CANCELLED", None, True
    if stop_reason in {"max_tokens", "max_turn_requests", "refusal"}:
        return "FAILED", "MODEL_FAILED", True
    return "UNKNOWN", None, False
