# AGENTS.md

## Mission

Build the application defined in `SPEC.md`: a production-quality, browser-based, 2–5 player falling-block game using a single Bun/TypeScript server, native WebSockets, and a static Svelte 5 SPA.

`SPEC.md` is the product and technical source of truth. This file defines how coding agents must work in the repository.

---

## 1. Priorities

Apply these priorities in order:

1. Correct deterministic game behavior
2. Server authority and protocol safety
3. Automated tests
4. Network resilience
5. Clear architecture and maintainability
6. Responsive user experience
7. Performance optimization
8. Visual polish

Do not trade correctness or tests for visual polish.

---

## 2. Non-negotiable constraints

- Runtime and package manager: Bun.
- Language: strict TypeScript.
- Frontend: Svelte 5 with SvelteKit as a static SPA.
- WebSockets: native `Bun.serve` WebSocket support.
- One production process serves both static assets and `/ws`.
- Rooms are in memory; no database or external backend service.
- Room capacity is five players.
- The server is authoritative.
- Clients send inputs only, not board state, score, line clears, attacks, or results.
- The core game engine is deterministic and independent of UI, WebSocket, and timer APIs.
- Use runtime validation for every inbound protocol message.
- Use Canvas 2D for board rendering.
- Add tests with each behavior change.
- Do not introduce Socket.IO, Express, Hono, Elysia, Redux, a database, or a hosted service unless the specification is formally changed.

---

## 3. Start-of-task procedure

Before editing:

1. Read `SPEC.md` completely.
2. Read this file completely.
3. Inspect `README.md`, `package.json`, `bun.lock`, and relevant source files.
4. Run the smallest relevant existing test or check to establish baseline behavior.
5. Identify the milestone and acceptance criteria affected by the task.
6. Form a short implementation plan in the agent’s work log or response.

Do not assume a file or API exists without inspecting it.

---

## 4. Decision policy

When a detail is unspecified:

1. Choose the smallest design consistent with `SPEC.md`.
2. Prefer standard platform and Bun APIs over new dependencies.
3. Preserve deterministic behavior.
4. Preserve server authority.
5. Keep protocol compatibility explicit.
6. Record material decisions in `README.md` under **Implementation decisions**.

Ask for human input only when choices materially conflict with the specification or would create incompatible product behavior. Do not block on cosmetic choices.

If official Bun or Svelte APIs changed, follow the current official documentation while preserving the behavior required by `SPEC.md`.

---

## 5. Implementation order

Work milestone by milestone. Do not start a later milestone by bypassing an unfinished dependency.

### Phase A: Foundation

- Initialize Bun/Svelte project.
- Configure strict TypeScript, formatting, linting, tests, and scripts.
- Establish shared constants, types, and runtime schemas.
- Create a minimal health route and static SPA build.

### Phase B: Pure game engine

- Seeded PRNG and seven-bag queue
- Piece definitions and SRS rotations
- Board collision and placement
- Gravity and lock delay
- Hold and preview
- Line clearing, score, combo, and back-to-back
- T-spin and perfect clear
- Garbage queue and cancellation
- Deterministic state hashing for tests

### Phase C: Multiplayer room server

- WebSocket handshake and protocol validation
- Sessions and reconnect tokens
- Room create/join/leave
- Host migration and readiness
- Fixed-timestep room updates
- Input queues and sequence validation
- Snapshot creation and broadcasting
- Match lifecycle and results

### Phase D: Svelte client

- Home and room routing
- WebSocket connection state
- Lobby UI
- Canvas renderer and responsive grid
- Keyboard input with DAS/ARR
- Local prediction and reconciliation
- Opponent interpolation
- Results and return to lobby

### Phase E: Hardening

- Reconnection
- Backpressure handling
- Origin checks and rate limits
- Accessibility
- Multi-context Playwright tests
- Load/performance harness
- Production build and Dockerfile

---

## 6. Architecture boundaries

### 6.1 `src/game`

Allowed:

- Plain TypeScript
- Deterministic data structures
- Explicit state and pure helpers
- Injected seeds and inputs

Forbidden:

- Svelte imports
- DOM or Canvas APIs
- `WebSocket` or Bun server types
- `setTimeout`, `setInterval`, or wall-clock reads
- `Math.random()`
- Network calls
- `localStorage`

The engine receives elapsed ticks or milliseconds from its caller. It does not schedule itself.

### 6.2 `src/server`

Responsibilities:

- HTTP and WebSocket lifecycle
- Runtime validation
- Session and room ownership
- Authoritative global tick loop
- Input rate limiting and sequencing
- Snapshot production
- Reconnection and cleanup
- Structured logs

Do not place rendering or Svelte state here.

### 6.3 `src/lib/client`

Responsibilities:

- Browser WebSocket client
- Client connection state
- Input collection
- Prediction and reconciliation
- Render scheduling
- Local persistence of reconnect tokens

Do not decide authoritative score, attacks, elimination, or winner here.

### 6.4 `src/shared`

Store only data contracts and constants genuinely shared by client and server. Do not turn it into a miscellaneous utilities directory.

---

## 7. State design rules

- Favor explicit serializable state over behavior-heavy classes.
- Keep authoritative match state owned by one `Room` instance.
- Keep one `GameEngineState` per active player.
- Store PRNG state explicitly so deterministic tests can clone and compare it.
- Keep input queues ordered by sequence.
- Avoid hidden module-global mutable state other than the top-level room manager and scheduler wiring.
- Never expose mutable server state objects directly to WebSocket serialization; build snapshot DTOs.
- Clone or freeze fixtures used by tests.

---

## 8. Determinism rules

A match must be reproducible from:

- Protocol/game rules version
- Match seed
- Ordered player roster
- Ordered accepted input events with server ticks
- Disconnect/elimination events

Requirements:

- No `Math.random()` in game or room outcome logic.
- No wall-clock reads inside engine state transitions.
- Use integer tick counts for authoritative timing where possible.
- Define stable iteration order; do not rely on incidental object-key order for game decisions.
- Resolve simultaneous events in documented order.
- Add a deterministic replay test whenever a race-condition bug is fixed.

Recommended per-tick order:

1. Apply room lifecycle transitions scheduled for the tick.
2. Apply queued player inputs in player join order and input sequence order.
3. Advance gravity and lock timers for each active player.
4. Resolve locks and line clears.
5. Calculate outgoing attacks.
6. Cancel incoming garbage.
7. Choose targets and enqueue remaining attacks.
8. Apply ready garbage according to rules.
9. Resolve top-outs and eliminations.
10. Resolve match completion.
11. Increment or finalize the tick state.

Do not change this ordering casually; it is observable game behavior.

---

## 9. Protocol rules

- Define protocol types and schemas together.
- Validate client and server message fixtures in tests.
- Treat protocol fields as untrusted even when the frontend is in the same repository.
- Include `protocolVersion` in handshake and snapshots.
- Add a new message type rather than overloading unrelated fields.
- Keep error codes stable and machine-readable.
- Never send stack traces, reconnect tokens, internal rate-limit keys, or full IP addresses to clients.
- Reject duplicate or stale gameplay sequences.
- A protocol-breaking change requires incrementing `PROTOCOL_VERSION` and updating tests and documentation.

For the MVP, keep JSON readable. Do not implement binary encoding until all acceptance criteria pass and profiling proves it useful.

---

## 10. WebSocket rules

- Use one `/ws` endpoint.
- A socket is unaffiliated until it completes `hello` and joins or creates a room.
- Associate socket metadata through Bun’s typed WebSocket data field.
- One logical session may have only one active socket.
- On reconnect, replace and close the previous socket.
- Cap message size and validate before dispatch.
- Rate-limit before expensive work.
- Treat snapshots as replaceable under backpressure.
- Preserve critical control messages.
- Clean all socket references on close.
- Test unexpected close, normal leave, reconnect, replacement connection, and grace expiry separately.

---

## 11. Simulation loop rules

- Use one global fixed-timestep scheduler for all rooms.
- Do not create one timer per player.
- Do not use variable-delta game rules.
- Clamp long elapsed intervals before catch-up.
- Avoid an unbounded while-loop after process suspension.
- Measure and expose scheduler lag in development diagnostics.
- Room deletion must not mutate the room collection unsafely during iteration; queue removals or iterate over a stable copy.

Use dependency-injected clocks in room cleanup tests. Do not make tests sleep for real TTL durations.

---

## 12. Svelte rules

- Use Svelte 5 runes for new state modules.
- Keep the WebSocket/session store outside visual components.
- Components receive narrow props and emit clear actions.
- Avoid one reactive component per board cell.
- Render boards through one Canvas per player card.
- Use `ResizeObserver` and device-pixel-ratio scaling.
- Start `requestAnimationFrame` only while a game view is mounted and stop it on destruction.
- Do not reconnect the WebSocket because a component rerendered.
- Do not put authoritative engine logic in `.svelte` files.
- Keep forms and buttons semantic and keyboard accessible.

---

## 13. Client prediction rules

- Prediction applies only to the local active piece and immediate control feedback.
- Authoritative snapshots always win.
- Track unacknowledged inputs by sequence.
- Rebuild predicted state from the newest authoritative state and pending inputs.
- Do not predict random targeting, opponent garbage, winner, score, or line-clear consequences that the server has not confirmed.
- Correct small position errors smoothly when safe; snap immediately after discrete events.
- Unit-test reconciliation with packet delay, duplicate snapshot, stale snapshot, and rejected input scenarios.

A simpler no-prediction implementation is acceptable only before Milestone 5; it is not final acceptance.

---

## 14. Rendering rules

- Use one theme mapping piece values to colors.
- Keep renderer input independent of Svelte stores.
- Clear and redraw the complete board when its render state changes; the board is small enough that premature dirty-cell optimization is unnecessary.
- Avoid allocations in the inner per-cell draw loop.
- Draw in this order:
  1. Background
  2. Locked cells
  3. Garbage cells
  4. Ghost piece
  5. Active piece
  6. Grid or subtle overlays
  7. Elimination/connection overlay
- Maintain a correct 10:20 visible board ratio.
- Hidden rows are never drawn.
- Add renderer tests around coordinate mapping and resize calculations; pixel snapshots are optional.

---

## 15. Error handling

- Validate at boundaries and use typed domain errors internally.
- A malformed message must not crash the process.
- One faulty room must not stop the global loop for other rooms.
- Catch room update errors, log context, and close/terminate the affected room safely if state integrity is uncertain.
- Surface recoverable errors inline in the UI.
- For nonrecoverable protocol errors, send an error when possible and close cleanly.
- Never silently ignore unexpected exceptions.

---

## 16. Logging

Use structured event names and stable fields.

Good:

```ts
logger.info("match_started", {
  roomCode,
  matchId,
  playerCount,
});
```

Avoid:

```ts
console.log("started game!!!!", room);
```

Never log:

- Reconnect tokens
- Entire snapshots at info level
- Every input at info level
- Full IP addresses at ordinary log level
- User data as HTML

Debug logging must be removable through `LOG_LEVEL` without code changes.

---

## 17. Dependency policy

Before adding a dependency:

1. Confirm the platform, Bun, Svelte, or existing dependency cannot reasonably perform the task.
2. Prefer small, maintained packages with TypeScript support.
3. Check license compatibility.
4. Avoid overlapping libraries.
5. Document why the dependency is needed.
6. Commit the lockfile change.

Expected dependencies are limited to Svelte/SvelteKit tooling, one schema validator, formatting/linting tools, and test tools.

Do not add a general-purpose state manager for this project.

---

## 18. TypeScript standards

- Enable `strict`, `noUncheckedIndexedAccess`, and `exactOptionalPropertyTypes` where compatible.
- Avoid `any`; use `unknown` plus validation.
- Prefer discriminated unions for messages and state transitions.
- Use branded types or constructors for identifiers when it prevents mix-ups.
- Keep exported functions explicitly typed.
- Avoid non-null assertions except at proven initialization boundaries.
- Use exhaustive `switch` statements with a `never` check.
- Prefer readonly inputs where mutation is unnecessary.
- Use meaningful domain names instead of abbreviations.

---

## 19. Testing workflow

For each change:

1. Write or identify a failing test that captures the required behavior.
2. Implement the smallest correct change.
3. Run the focused test.
4. Run nearby test suites.
5. Run type checking and Svelte checks.
6. Before completion, run `bun run verify`.

Bug fixes must include regression tests unless technically impossible. If impossible, explain why in the final report.

Do not weaken or delete assertions merely to make tests pass. Update tests only when behavior is intentionally changed by the specification.

---

## 20. Quality gates

A task is not complete until relevant gates pass:

```bash
bun install --frozen-lockfile
bun run format
bun run lint
bun run typecheck
bun run check
bun test
bun run build
bun run test:e2e
```

Use `bun run verify` when available. During development, focused commands are encouraged, but the full verification command is required before declaring a milestone complete.

If a gate cannot run in the environment, report the exact command, error, and which checks did run. Do not claim success without evidence.

---

## 21. Commit and change discipline

- Keep changes scoped to the current task.
- Do not rewrite unrelated files.
- Do not perform broad formatting changes mixed with functional changes.
- Preserve public APIs unless the task requires a change.
- Update docs in the same change as behavior.
- Keep generated build output out of version control unless the repository explicitly requires it.
- Never commit secrets, local environment files, or reconnect tokens.

Suggested commit sequence for a feature:

1. Test fixture or schema changes
2. Core behavior
3. UI integration
4. Documentation and cleanup

When operating without commits, keep the same logical separation in the patch.

---

## 22. Prohibited shortcuts

Do not:

- Make the client authoritative.
- Trust client score or board payloads.
- Synchronize games by broadcasting keyboard events peer-to-peer.
- Use `Math.random()` for pieces, garbage holes, or targets.
- Drive server gameplay from snapshot timers.
- Send complete snapshots at 60 Hz.
- Create one `setInterval` per player.
- Store game state directly in Svelte components.
- Render 1,000+ reactive cell elements for five boards.
- Ignore WebSocket backpressure.
- Retry reconnect forever after a definitive rejection.
- Build a database, authentication system, or matchmaking service for the MVP.
- Add speculative abstraction layers without a current use.
- Optimize to binary protocol before measuring JSON.
- copy proprietary artwork, branding, audio, or exact commercial UI.

---

## 23. Security checklist

Before release verify:

- [ ] Every client message is schema validated.
- [ ] WebSocket origin is checked in production.
- [ ] Inbound message size is capped.
- [ ] Room creation and inputs are rate-limited.
- [ ] Reconnect tokens use secure randomness.
- [ ] Tokens are not logged or placed in URLs.
- [ ] Host-only actions verify authorization server-side.
- [ ] User names are rendered as text.
- [ ] Errors do not leak stack traces.
- [ ] Production runs without debug endpoints.
- [ ] Test fixture injection is unavailable in production.
- [ ] Dependencies and licenses are reviewed.

---

## 24. Performance checklist

Before release verify:

- [ ] Six boards render at 60 FPS on a normal laptop.
- [ ] Snapshot rate is 20 Hz during play.
- [ ] Slow clients skip obsolete snapshots.
- [ ] No unbounded per-socket queue exists.
- [ ] No per-tick logging exists at info level.
- [ ] The engine avoids avoidable allocations in hot loops.
- [ ] The global scheduler reports lag in diagnostics.
- [ ] Synthetic room load test meets `SPEC.md` targets or results are documented.

Do not optimize code that is not shown by profiling to be significant.

---

## 25. Accessibility checklist

- [ ] Home and lobby can be operated by keyboard.
- [ ] Focus is visible.
- [ ] Status is not color-only.
- [ ] Canvas has an accessible name/status description.
- [ ] Reduced-motion preference is respected.
- [ ] Text contrast is adequate.
- [ ] Connection and validation errors are announced accessibly.

---

## 26. Definition of done for a task

A task is done when:

1. Behavior matches `SPEC.md`.
2. Architecture boundaries remain intact.
3. Tests cover the behavior and pass.
4. Types, lint, Svelte checks, and build pass.
5. User-facing errors and edge cases are handled.
6. Relevant documentation is updated.
7. No secrets or generated clutter are introduced.
8. The final report states what changed and what was verified.

---

## 27. Definition of done for a milestone

A milestone is done only when:

- Every milestone deliverable in `SPEC.md` exists.
- Every milestone exit criterion is demonstrated by tests or a documented manual verification.
- `bun run verify` passes from a clean dependency install.
- The README contains setup and usage instructions current for that milestone.
- Known limitations are explicit.
- No placeholder implementation remains on the critical path.

---

## 28. Final report format

At the end of work, report:

### Implemented

Concise list of completed behavior and important files.

### Verification

List exact commands run and their outcomes.

### Decisions

List material decisions made where the specification allowed discretion.

### Remaining issues

List real limitations, failed checks, or follow-up work. Write `None` only when true.

Do not claim that a test, build, browser flow, or performance target passed unless it was actually executed.

---

## 29. First assignment for a fresh repository

When no implementation exists, perform Milestone 1 only:

1. Scaffold Bun + SvelteKit + Svelte 5.
2. Configure `adapter-static` SPA output.
3. Add strict TypeScript and repository scripts.
4. Implement seeded PRNG, seven-bag, pieces, board, collision, SRS rotation, hold, gravity, lock delay, and line clear.
5. Build a single-player Canvas page using the pure engine.
6. Add comprehensive engine tests.
7. Add README setup and control instructions.
8. Run the full verification available at this stage.

Do not begin multiplayer networking until the deterministic single-player engine and its tests are stable.
