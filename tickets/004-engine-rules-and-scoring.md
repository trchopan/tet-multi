# 004: Engine Rules and Scoring

## Goal

Complete deterministic single-player gameplay rules required by local play and
authoritative multiplayer.

## Scope

- SRS rotation and kick tables.
- Gravity and fixed-tick advancement.
- Lock delay and grounded reset limit.
- Hard and soft drop.
- Hold and five-piece preview queue.
- Line clearing.
- Score, level, combo, and back-to-back.
- T-spin and perfect-clear detection.

## Acceptance Criteria

- A complete local game can be simulated without UI or network dependencies.
- Rotation, lock, scoring, T-spin, combo, and line-clear tests pass.
- Known replay fixtures produce stable hashes.
- Rotation behavior covers wall, floor, stack, and blocked-kick cases.

## Dependencies

- 003.
