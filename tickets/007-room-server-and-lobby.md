# 007: Room Server and Lobby

## Goal

Implement rooms, sessions, WebSocket handshake, and lobby lifecycle on Bun.

## Scope

- Bun HTTP server and `/ws` endpoint.
- Hello handshake.
- Room creation and joining.
- Room codes and five-player capacity.
- Display names.
- Host ownership and migration.
- Ready state and leave handling.
- Lobby snapshots.
- Structured errors and logging.

## Acceptance Criteria

- Two to five clients can join a room.
- A seventh client is rejected without disrupting the room.
- Only the host can start or return to lobby.
- Host migration and room cleanup are tested.
- Malformed messages cannot crash the server.
- Static assets and `/ws` are served by the same Bun application.

## Dependencies

- 001 and 002.
