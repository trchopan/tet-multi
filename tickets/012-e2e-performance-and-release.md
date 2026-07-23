# 012: E2E, Performance, and Release

## Goal

Verify and package the complete application for production use.

## Scope

- Playwright multi-context tests.
- Create, join, ready, and start flow.
- Shared match ID and winner verification.
- Reconnect flow.
- Scripted top-out.
- Host return-to-lobby.
- Synthetic room-load test.
- Optional non-root Dockerfile.
- Final README and implementation decisions.
- Full verification script.

## Acceptance Criteria

- `bun run verify` passes from a clean install.
- E2E tests cover the complete primary flow.
- Reconnection and winner agreement are tested in browser contexts.
- Performance targets are measured or documented with exact conditions.
- Production build serves static assets and `/ws` from one process.
- Docker image, when included, runs as non-root and exposes `/health`.

## Dependencies

- 010 and 011.
