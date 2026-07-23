# 009: Multiplayer Client UI

## Goal

Implement the connected client experience from home screen through match
results.

## Scope

- WebSocket client/session state.
- Home and room routing.
- Lobby UI.
- Server-time countdown.
- Six-board responsive grid.
- Player cards and Canvas rendering from snapshots.
- Results screen.
- Return-to-lobby behavior.
- Copyable invite URL.

## Acceptance Criteria

- Home, lobby, countdown, playing, and results states work in browser contexts.
- Six boards remain readable on desktop and tablets.
- The local player is visually emphasized.
- Connection and validation errors are announced accessibly.
- Finished snapshots show winner, draw, placement, and match statistics.

## Dependencies

- 006, 007, and 008.
