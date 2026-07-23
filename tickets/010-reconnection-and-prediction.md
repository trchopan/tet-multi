# 010: Reconnection and Prediction

## Goal

Add network resilience and responsive local control without weakening server
authority.

## Scope

- Cryptographic reconnect tokens.
- Room-scoped local token storage.
- Reconnect grace-period handling.
- Socket replacement.
- Exponential reconnect backoff.
- Local input prediction.
- Snapshot acknowledgement and reconciliation.
- Opponent interpolation.
- Ping/pong latency and clock-offset estimation.

## Acceptance Criteria

- Reconnect within 20 seconds restores the same session.
- Expired or invalid tokens are rejected safely.
- Duplicate, stale, delayed, and rejected inputs reconcile correctly.
- Local movement remains responsive under simulated latency.
- Authoritative score, garbage, elimination, and winner state are never
  predicted.

## Dependencies

- 008 and 009.
