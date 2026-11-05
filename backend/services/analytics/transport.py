"""Host transport seam for the five private bridge operations.

P3-2 centralized the bridge calls; this module names the seam so the dispatcher
depends on an interface instead of the concrete loopback HTTP client. The wire
contract is unchanged: no new operation, no removed port, no ACP code.

Data shape
----------
Every operation is ``call(operation, payload)``. ``operation`` is one of
``TRANSPORT_OPERATIONS``; ``payload`` is a JSON object and a successful call
returns a JSON object. Any exception is a transport failure.

=================  ==========================================  ============================================
operation          request object (required fields)          success response object
=================  ==========================================  ============================================
health             ``{}``                                      ``{"ready": true}``
dispatch           run_id, attempt_id, session_id,             ``{"accepted": true}`` (other receipt fields
                   request_id, payload                         are ignored)
observe            run_id, attempt_id, session_id,             run_id, attempt_id, session_id,
                   request_id                                  execution_exited, outcome,
                                                               successful_call_ids, optional error_code
cancel             run_id, attempt_id, session_id,             ``{"accepted": true}`` (receipt only, never
                   request_id                                  exit proof)
identity           session_id                                  ``{"session_id": ..., "identity": {...}}``
                                                               or ``{"session_id": ..., "denied":
                                                               "UNAUTHENTICATED"|"FORBIDDEN"}``
=================  ==========================================  ============================================

``outcome`` is one of ``OUTCOMES``; ``error_code`` is ``MODEL_FAILED`` or
``EXECUTION_UNKNOWN``. The four correlation fields must round-trip unchanged
in observe evidence: the dispatcher rejects an uncorrelated observation. The
dispatcher sends the persisted dispatch intent as the dispatch, observe and
cancel envelope, so those payloads also carry ``payload``, ``payload_hash``
and ``deadline_ms``; extra request fields pass through unchanged and the Host
ignores everything except the documented required fields.

Failure mapping (preserved by this seam)
----------------------------------------
* health: admission closes; the tick claims and dispatches nothing.
* dispatch: one ``UNKNOWN`` observation, the dispatch attempt count is not
  reset and the same intent is reconciled by later observe calls; never a
  blind resend.
* observe: one ``UNKNOWN`` observation while the unique active slot stays
  held; only a later correlated observe can settle the run.
* cancel: one ``UNKNOWN`` observation while the slot stays held; a cancel
  receipt is never exit evidence, only observe is.
* identity: the resolver maps any failure to ``IDENTITY_UNAVAILABLE`` (503,
  retryable), exactly as before.

The concrete loopback HTTP client (``runtime.HostBridge``) implements this
protocol structurally. ``runtime.py`` and ``first_purchase/native_identity.py``
are part of the pinned standalone-kernel file list, so they type against this
module without importing it at runtime (``TYPE_CHECKING`` only); the seam adds
no runtime dependency and no package file.

``RoutedTransport`` is the canary-only implementation of the same protocol: it
owns one bridge and one ACP transport and sends each dispatch/observe/cancel to
the transport persisted on the intent. It is constructed only for
``transport=canary``; the default bridge runtime never imports it.
"""

from __future__ import annotations

from typing import Any, Final, Mapping, Protocol, runtime_checkable

OPERATIONS: Final[tuple[str, ...]] = ("health", "dispatch", "observe", "cancel", "identity")
TRANSPORT_OPERATIONS: Final[frozenset[str]] = frozenset(OPERATIONS)
CORRELATION_FIELDS: Final[tuple[str, ...]] = ("run_id", "attempt_id", "session_id", "request_id")
OBSERVATION_FIELDS: Final[tuple[str, ...]] = CORRELATION_FIELDS + (
    "execution_exited", "outcome", "successful_call_ids",
)
OUTCOMES: Final[frozenset[str]] = frozenset(
    {"RUNNING", "UNKNOWN", "SUCCEEDED", "FAILED", "CANCELLED", "NEEDS_INPUT"}
)


@runtime_checkable
class HostTransport(Protocol):
    """The five documented bridge operations; one loopback HTTP transport today.

    The protocol is structural on purpose: the pinned standalone kernel ships
    ``runtime.py`` without this module, so the concrete bridge cannot inherit
    from the protocol at import time. ``test_analytics_transport`` asserts the
    concrete class conforms and that every operation routes through this call.
    """

    def call(self, operation: str, payload: Mapping[str, Any]) -> dict[str, Any]:
        """Run one documented operation; raise on any transport failure."""


class RoutedTransport:
    """Canary-only router: the persisted intent transport owns the operation.

    ``transport=bridge`` and ``transport=acp`` keep one concrete transport for
    the whole runtime; only the canary computes a different transport per
    intent. Routing here reads ``payload["transport"]`` (the value persisted in
    ``dispatch_intents``), never a fresh policy decision, so a retry or a
    restart reconciles the same path. Any other value raises instead of
    falling back to the bridge. ``identity`` remains bridge-only because the
    ACP seam has no identity operation, and ``health`` requires both owned
    paths: admission closes rather than dispatching half a canary.
    """

    def __init__(self, bridge: HostTransport, acp: HostTransport | None = None, *,
                 canary_reason: str | None = None):
        if not callable(getattr(bridge, "call", None)):
            raise ValueError("routed transport requires a bridge transport")
        if acp is not None and not callable(getattr(acp, "call", None)):
            raise ValueError("routed ACP transport must implement call")
        self.bridge = bridge
        self.acp = acp
        self.canary_available = acp is not None
        self.canary_reason = canary_reason

    @property
    def callback_token(self):
        """Expose the ACP callback token so the ACP routes mount in canary mode."""
        return getattr(self.acp, "callback_token", None)

    def attach_binding_sink(self, sink) -> None:
        attach = getattr(self.acp, "attach_binding_sink", None)
        if callable(attach):
            attach(sink)

    def close(self) -> None:
        close = getattr(self.acp, "close", None)
        if callable(close):
            close()

    def call(self, operation: str, payload: Mapping[str, Any]) -> dict[str, Any]:
        if operation not in TRANSPORT_OPERATIONS:
            raise ValueError("unsupported transport operation")
        if operation == "health":
            bridge_ready = self.bridge.call("health", {}).get("ready") is True
            if self.acp is None:
                return {"ready": bridge_ready, "transports": {"bridge": bridge_ready}}
            acp_ready = self.acp.call("health", {}).get("ready") is True
            return {"ready": bridge_ready and acp_ready,
                    "transports": {"bridge": bridge_ready, "acp": acp_ready}}
        if operation == "identity":
            return self.bridge.call(operation, payload)
        recorded = payload.get("transport") if isinstance(payload, Mapping) else None
        if recorded == "bridge":
            return self.bridge.call(operation, payload)
        if recorded == "acp" and self.acp is not None:
            return self.acp.call(operation, payload)
        raise ValueError("dispatch intent has no executable recorded transport")

