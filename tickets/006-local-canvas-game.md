# 006: Local Canvas Game

## Goal

Make the deterministic engine playable in the browser before networking is
introduced.

## Scope

- Stateless Canvas 2D renderer.
- Hidden-row cropping and ghost piece.
- Hold and preview displays.
- Keyboard mapping and DAS/ARR input module.
- Local fixed-step browser loop.
- Responsive canvas sizing and device-pixel-ratio scaling.
- Accessible status and reduced-motion behavior.

## Acceptance Criteria

- One player can play and complete a local game.
- Canvas, event handlers, timers, and animation frames clean up on unmount.
- Gameplay keys do not scroll the page while the game has control focus.
- Renderer tests cover board dimensions and coordinate mapping.
- Renderer code does not mutate simulation state.

## Dependencies

- 004.
