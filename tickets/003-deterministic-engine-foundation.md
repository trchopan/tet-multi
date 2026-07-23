# 003: Deterministic Engine Foundation

## Goal

Implement the pure deterministic board and piece simulation foundation.

## Scope

- Seeded PRNG.
- Independent deterministic seven-bag streams.
- Tetromino definitions.
- 10 × 24 internal board.
- Spawn positions.
- Collision and placement.
- Horizontal movement.
- State serialization and deterministic hashing.

## Acceptance Criteria

- `src/game` has no DOM, Svelte, Bun, timer, network, or `Math.random()`
  dependencies.
- Same seed, roster index, and inputs produce identical state hashes.
- Board, bag, collision, spawn, and serialization tests pass.
- Hidden-row indexing follows `SPEC.md`.

## Dependencies

- 002.
