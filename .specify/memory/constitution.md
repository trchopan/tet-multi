<!--
Sync Impact Report:
- Version change: 1.0.0 → 1.1.0
- Bump rationale: MINOR bump. Materially expanded Governance section with formal amendment procedure, semantic versioning policy, and compliance review expectations. Refined all Core Principles with RFC 2119 requirement language (MUST / MUST NOT).
- Modified principles:
  - I. Server Authority and Protocol Safety: Reinforced with explicit RFC 2119 MUST / MUST NOT directives.
  - II. Determinism and Reproducibility (NON-NEGOTIABLE): Reinforced with explicit RFC 2119 MUST / MUST NOT directives.
  - III. Architecture Boundaries & Clean Domain Design: Explicitly formalized unidirectional boundary rules.
  - IV. Single-Process Simplicity: Reinforced with explicit RFC 2119 MUST / MUST NOT directives.
  - V. Automated Testing & Verification Gates: Reinforced with explicit RFC 2119 MUST directives.
- Added sections: None (formalized governance subsections within Governance).
- Removed sections: None.
- Follow-up TODOs: None.
-->

# tet-multi Constitution

## Core Principles

### I. Server Authority and Protocol Safety
The server MUST be authoritative for all game simulation, state transitions, scoring, attacks, eliminations, and match outcomes.
- Clients MUST send sequenced user inputs only, and MUST NOT transmit board states, scores, line clears, attacks, or match results.
- Every inbound message MUST undergo strict runtime schema validation using Valibot before processing.
- Malformed, oversized, or unauthorized messages MUST be rejected or closed cleanly without leaking internal error details or crashing the process.

### II. Determinism and Reproducibility (NON-NEGOTIABLE)
All game engines MUST be strictly deterministic and testable in isolation.
- Game logic, bot policies, and room outcomes MUST NOT use `Math.random()`. All randomness MUST derive from an explicit 32-bit PRNG state seeded per match or room.
- Engine state transitions MUST NOT read wall-clock time (`Date.now()`, `performance.now()`). Game time MUST advance exclusively through fixed integer ticks.
- Given identical match seed, player roster, and ordered input sequence, engine states, snapshots, and state hashes MUST be 100% reproducible across test runs and replays.

### III. Architecture Boundaries & Clean Domain Design
The system MUST adhere to strict, unidirectional modular boundaries:
- **`src/games/<game-id>/domain`**: Pure business logic, state machines, and mathematical rules. Strictly forbidden: DOM, Canvas, Svelte, WebSockets, network calls, or async timers (`setTimeout`, `setInterval`).
- **`src/games/<game-id>/application`**: Implements `GameEngine`, driving tick processing and snapshot extraction.
- **`src/games/<game-id>/bot`**: Server-side AI bots running on fixed tick delays, evaluating cloned engine states.
- **`src/server`**: HTTP/WebSocket lifecycle, room management, fixed-timestep scheduler (60 Hz), rate limiting, and backpressure handling.
- **`src/lib/client`**: UI state, unified input handling, Canvas 2D rendering, local prediction/reconciliation, and opponent interpolation.
- **`src/shared`**: Wire contracts, Valibot schemas, and constants genuinely shared between client and server.

### IV. Single-Process Simplicity
The application MUST run as a single deployable Bun service.
- One Bun process MUST serve static SPA assets and handle native WebSocket connections (`/ws`).
- External databases, message brokers, or third-party web frameworks (Express, Hono, Elysia, Socket.IO) MUST NOT be introduced unless formally amended in `SPEC.md`.
- Room and session state MUST reside in memory. Reconnect tokens MUST use 128-bit cryptographic randomness with bounded grace periods.

### V. Automated Testing & Verification Gates
Correctness and tests MUST precede visual polish or premature optimization.
- Every behavioral addition or bug fix MUST include automated regression tests.
- Core simulation engines MUST maintain comprehensive unit tests and deterministic replay test suites.
- All code changes MUST satisfy the complete verification pipeline (`bun run verify`) prior to release or task completion.

## Technology Stack & Constraints

- **Runtime & Package Manager:** Bun (1.3.5 or newer).
- **Language:** Strict TypeScript (`strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`).
- **Frontend Framework:** Svelte 5 using runes (`$state`, `$derived`, `$effect`), built with SvelteKit and `@sveltejs/adapter-static`.
- **Rendering:** Canvas 2D per board or shared canvas view with `ResizeObserver` and HiDPI/device-pixel-ratio scaling.
- **Transport:** Native `Bun.serve` WebSockets with 60 Hz simulation and 20 Hz snapshot broadcasting.
- **Validation:** Valibot schemas at all inbound and network boundary layers.

## Quality Gates

Before declaring any feature, milestone, or task complete, the following gates MUST pass:
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

- **Authority & Source of Truth**: This Constitution and `AGENTS.md` define the non-negotiable operational and architectural rules for coding agents and contributors. `SPEC.md` serves as the functional and product source of truth. Feature specifications created under `.specify/` or `specs/` MUST align with this Constitution.
- **Amendment Procedure**: Any amendment to this Constitution MUST be explicitly proposed, documented in `.specify/memory/constitution.md`, and accompanied by corresponding updates to `AGENTS.md` and `README.md` if operational rules change. Material architectural decisions MUST be recorded in `README.md` under **Implementation decisions**.
- **Versioning Policy**: Semantic versioning (MAJOR.MINOR.PATCH) is strictly applied to this Constitution:
  - **MAJOR**: Backward-incompatible principle removals, structural architecture redefinitions, or governance restructuring.
  - **MINOR**: Addition of new core principles, new constraint sections, or materially expanded governance rules.
  - **PATCH**: Clarifications, wording refinements, typo corrections, or non-semantic formatting updates.
- **Compliance & Review Expectations**: All pull requests, code reviews, and agent tasks MUST verify compliance with this Constitution. Architectural complexity MUST be explicitly justified; the smallest design consistent with `SPEC.md` is mandatory.

**Version**: 1.1.0 | **Ratified**: 2026-08-27 | **Last Amended**: 2026-08-27
