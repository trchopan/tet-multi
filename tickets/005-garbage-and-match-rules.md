# 005: Garbage and Match Rules

## Goal

Implement deterministic competitive rules independently of networking.

## Scope

- Garbage packets and activation delay.
- Garbage cancellation.
- Deterministic garbage holes.
- Garbage application and top-out.
- Automatic target selection and retargeting.
- Elimination and placement.
- Simultaneous elimination and draw handling.

## Acceptance Criteria

- Attack calculations match the specification tables.
- Garbage delivery and targeting are deterministic.
- Scripted attack/replay tests produce identical results.
- Spawn collision and garbage top-out are covered by tests.
- Engine state remains serializable and reproducible.

## Dependencies

- 004.
