# tet-multi Constitution

## Core Principles

### I. Server Authority and Protocol Safety
The server is authoritative for all game simulation, state transitions, scoring, attacks, eliminations, and match outcomes.
- Clients send sequenced user inputs only, never board states, scores, line clears, or results.
- Every inbound message must undergo strict runtime schema validation (Valibot).
- Malformed, oversized, or unauthorized messages must be rejected or closed safely without leaking internal details or crashing the process.

### II. Determinism and Reproducibility (NON-NEGOTIABLE)
All game engines must be strictly deterministic and testable in isolation.
- Zero `Math.random()` in game logic, bot policies, or room outcomes. All randomness must derive from explicit 32-bit PRNG states seeded per match/room.
- Zero wall-clock reads (`Date.now()`, `performance.now()`) inside engine state transitions. Game time advances exclusively via fixed integer ticks.
- Given the same match seed, player roster, and ordered input sequence, engine states and hashes must be 100% reproducible across test runs and replays.

### III. Architecture Boundaries & Clean Domain Design
The system adheres to strict modular boundaries:
- **`src/games/<game-id>/domain`**: Pure business logic, state machines, and mathematical rules. Strictly forbidden: DOM, Canvas, Svelte, WebSockets, or async timers.
- **`src/games/<game-id>/application`**: Implements `GameEngine`, driving tick processing and snapshot extraction.
- **`src/games/<game-id>/bot`**: Server-side AI bots running on fixed tick delays, evaluating cloned engine states.
- **`src/server`**: HTTP/WebSocket lifecycle, room management, fixed-timestep scheduler (60 Hz), rate limiting, and backpressure.
- **`src/lib/client`**: UI state, unified input handling, Canvas 2D rendering, local prediction/reconciliation, and opponent interpolation.
- **`src/shared`**: Wire contracts, Valibot schemas, and constants genuinely shared between client and server.

### IV. Single-Process Simplicity
The application must run as a single deployable Bun service.
- One Bun process serves static SPA assets and handles native WebSocket connections (`/ws`).
- No databases, external message brokers, or third-party web frameworks (Express, Hono, Elysia, Socket.IO) unless the specification is formally amended.
- Room and session state reside in memory. Reconnect tokens use 128-bit cryptographic randomness with bounded grace periods.

### V. Automated Testing & Verification Gates
Correctness and tests precede visual polish or premature optimization.
- Every behavioral addition or bug fix must include automated regression tests.
- Core simulation engines must maintain unit and deterministic replay test suites.
- All code changes must satisfy the full verification pipeline before release: formatting, linting, type-checking, Svelte checks, unit tests, production build, Playwright E2E browser tests, and performance benchmarks.

## Technology Stack & Constraints

- **Runtime & Package Manager:** Bun (1.3.5 or newer).
- **Language:** Strict TypeScript (`strict: true`, `noUncheckedIndexedAccess: true`).
- **Frontend Framework:** Svelte 5 using runes (`$state`, `$derived`, `$effect`), built with SvelteKit and `@sveltejs/adapter-static`.
- **Rendering:** Canvas 2D per board or shared canvas view with `ResizeObserver` and HiDPI/DPR scaling.
- **Transport:** Native `Bun.serve` WebSockets with 60 Hz simulation and 20 Hz snapshot broadcasting.
- **Validation:** Valibot schemas at boundaries.

## Quality Gates

Before declaring any feature, milestone, or task complete, the following gates must pass:
```bash
bun run lint
bun run typecheck
bun run check
bun test
bun run build
bun run test:e2e
bun run test:performance
bun run verify:production
```
Or simply:
```bash
bun run verify
```

## Governance

- This Constitution and `AGENTS.md` define the non-negotiable operational and architectural rules for coding agents and contributors.
- `SPEC.md` serves as the functional and product source of truth.
- Feature specifications created under `.specify/` or `specs/` must align with this Constitution.
- When an implementation choice is unspecified, choose the smallest design consistent with `SPEC.md` and document material decisions in `README.md`.

**Version**: 1.0.0 | **Ratified**: 2026-08-27 | **Last Amended**: 2026-08-27
