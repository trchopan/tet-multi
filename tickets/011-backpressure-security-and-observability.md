# 011: Backpressure, Security, and Observability

## Goal

Harden the server for hostile input, slow connections, and operational failure.

## Scope

- WebSocket origin checks.
- Message-size enforcement.
- Connection, room-creation, and input rate limits.
- Snapshot replacement under backpressure.
- Critical-message preservation.
- Structured logging.
- Scheduler lag diagnostics.
- Production configuration parsing.
- Graceful shutdown.

## Acceptance Criteria

- Slow clients do not create unbounded queues.
- Invalid origins and abusive clients are rejected.
- Tokens and full IP addresses are not logged.
- A room failure does not stop other rooms.
- Shutdown closes sockets and stops new joins.
- Configuration validation fails fast for invalid values.

## Dependencies

- 007, 008, and 010.
