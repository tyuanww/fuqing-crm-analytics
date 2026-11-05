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
