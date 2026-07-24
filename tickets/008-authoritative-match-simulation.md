# 008: Authoritative Match Simulation

## Goal

Run synchronized multiplayer matches on the server using the pure engine.

## Scope

- Room match lifecycle and countdown.
- One global fixed-timestep scheduler.
- One authoritative engine per player.
- Input sequencing, ordering, deduplication, and rate limits.
- Normative tick ordering.
- Snapshot generation and 20 Hz broadcasting.
- Match finish and result snapshots.

## Acceptance Criteria

- Two to five clients share one authoritative match.
- Clients can send actions only.
- Clients cannot submit board, score, attack, or result state.
- Repeated deterministic inputs produce identical outcomes.
- Match winner and draw results agree across clients.
- The server does not send normal gameplay snapshots at 60 Hz.

## Dependencies

- 005 and 007.
