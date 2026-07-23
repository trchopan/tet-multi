# AGENTS.md

## Mission

Build the application defined in `SPEC.md` as a production-quality static web application.

The target is a casual, leader-authoritative, peer-to-peer multiplayer Tetris game supporting two to six players over WebRTC DataChannels with manual copy/paste signaling.

Do not introduce a backend, signaling service, database, cloud function, Firebase dependency, or QR-code workflow.

## Source of Truth

Priority order:

1. `SPEC.md`
2. Existing automated tests
3. Existing project conventions
4. This file
5. Reasonable engineering judgment

When requirements conflict, preserve the product constraints in `SPEC.md`.

## Non-Negotiable Architecture

- Static web application only.
- React + TypeScript + Vite unless the repository already uses an equivalent approved stack.
- WebRTC star topology.
- One leader browser.
- Up to five guest browsers.
- One unique `RTCPeerConnection` and offer per guest.
- Manual offer/answer exchange through copyable text.
- Non-trickle ICE.
- Leader-authoritative simulation.
- Guests send inputs, not canonical game results.
- Canvas-based board rendering.
- No QR generation.
- No custom backend.
- No Firebase, Supabase, hosted database, or realtime service.
- No TURN dependency in version one.

## Working Method

Implement incrementally. Keep the repository runnable after every meaningful change.

Prefer small, testable modules over large components. Keep network protocol, game simulation, rendering, and UI state separated.

Do not attempt the entire application in one monolithic pass.

## Required Delivery Phases

### Phase 1: Project Foundation

Deliver:

- Vite TypeScript application
- React setup
- Linting
- Formatting
- Vitest
- Playwright
- Basic route or screen state
- Static production build

Verify:

```bash
npm install
npm run lint
npm run test
npm run build
```

Use the package manager already present in the repository. If none exists, use npm.

### Phase 2: Pure Tetris Engine

Build the engine without React, Canvas, WebRTC, or DOM dependencies.

Required modules:

- Board representation
- Tetromino definitions
- Seven-bag randomizer
- Seeded PRNG
- Spawn logic
- Movement
- Collision
- Rotation and wall kicks
- Locking
- Hold
- Next queue
- Line clearing
- Scoring metadata
- Attack calculation
- Garbage cancellation and application
- Elimination
- Serialization

Required properties:

- Fixed integer ticks
- Deterministic under identical seed and inputs
- No `Math.random()` in engine code
- No hidden global mutable state
- Comprehensive tests

Do not continue to multiplayer networking until the engine tests are stable.

### Phase 3: Single-Player UI

Build:

- Canvas renderer
- Keyboard input
- Game loop
- Local board
- Hold display
- Next queue
- Ghost piece
- Basic score and status

Keep render state separate from simulation state.

Verify smooth local play before adding multiplayer.

### Phase 4: Six-Board Match UI

Build a responsive board grid that supports two to six players.

Requirements:

- Desktop 3x2 layout for six players
- Narrow-screen 2x3 fallback
- Local board emphasis
- Remote-board rendering
- Player name and status
- Eliminated overlay
- Pending-garbage indicator

Use mocked player states first.

### Phase 5: Signaling Codec

Implement manual signaling independently from the lobby UI.

Required functions:

```ts
encodeSignalingPayload(payload): string
decodeSignalingPayload(text): SignalingPayload
waitForIceGatheringComplete(pc): Promise<void>
```

Requirements:

- Versioned payload
- `PT1.` prefix
- JSON serialization
- Compression where appropriate
- Base64url encoding
- Runtime validation
- Clear typed errors
- Round-trip tests
- Malformed-input tests
- Payload-role validation

Never use `eval` or executable serialization.

### Phase 6: WebRTC Connection Layer

Implement reusable abstractions for:

- Leader peer slot
- Guest peer
- Peer connection lifecycle
- DataChannel lifecycle
- ICE timeout
- Connection timeout
- Cleanup
- Ping/pong
- Diagnostics

Leader API should conceptually support:

```ts
createInvite(slotId): Promise<string>
acceptAnswer(slotId, answerText): Promise<void>
closeSlot(slotId): void
sendTo(slotId, message): void
broadcast(message): void
```

Guest API should conceptually support:

```ts
acceptOffer(offerText): Promise<string>
waitForConnection(): Promise<void>
send(message): void
close(): void
```

Exact names may differ, but capabilities must remain explicit and testable.

### Phase 7: Lobby

Implement:

- Create Room flow
- Five leader connection slots
- Join Room flow
- Copy offer
- Paste answer
- Copy answer
- Connection status
- Lobby handshake
- Display names
- Ready state
- Leader-only start

Do not hide WebRTC errors behind generic messages. Surface useful connection-state information.

### Phase 8: Leader-Authoritative Multiplayer

Implement canonical match simulation on the leader.

Required behavior:

- Leader initializes every player's board.
- Leader owns piece sequence and match tick.
- Guests send sequenced inputs.
- Leader validates inputs.
- Leader simulates all players.
- Leader broadcasts canonical updates.
- Guests render all boards.
- Guests cannot submit score, attacks, clears, or board snapshots as authority.

Use a clean protocol layer with exhaustive message handling.

### Phase 9: Prediction and Reconciliation

Implement guest-local prediction for responsive controls.

Minimum:

- Sequence every local input.
- Retain unacknowledged inputs.
- Apply immediate local movement prediction.
- Receive authoritative state with acknowledgment.
- Replace canonical base state.
- Reapply valid unacknowledged inputs.

Do not predict line clears, garbage, elimination, or winner state.

Add tests for:

- Correct acknowledgment
- Duplicate input handling
- Out-of-order input rejection
- Reconciliation after correction
- Snapshot replacement

### Phase 10: Garbage and Match Completion

Implement:

- Attack calculation
- Target selection
- Garbage cancellation
- Queued garbage
- Garbage application
- Elimination
- Last-player-standing winner
- Finished-match screen
- Rematch lobby

All of these remain leader-authoritative.

### Phase 11: Failure Handling and Polish

Implement:

- Guest disconnect behavior
- Leader disconnect behavior
- Hidden-leader-tab pause
- Connection timeout
- Protocol-error handling
- Payload-size limits
- Message-rate limits
- Accessibility pass
- Reduced-motion support
- Production diagnostics toggle

## Code Quality Rules

### TypeScript

- Enable strict mode.
- Avoid `any`.
- Prefer discriminated unions for protocol messages.
- Make impossible states difficult to represent.
- Use exhaustive `switch` statements.
- Validate all untrusted runtime data.

### React

- Keep components focused on presentation and orchestration.
- Do not place game-engine logic inside components.
- Do not place WebRTC state machines inside JSX event handlers.
- Clean up effects, listeners, timers, workers, peer connections, and DataChannels.
- Avoid unnecessary global state.

### Game Engine

- Pure functions where practical.
- Explicit state transitions.
- Integer ticks.
- Seeded randomness.
- No DOM access.
- No rendering dependencies.
- No network dependencies.

### Networking

- Treat all incoming data as hostile.
- Parse and validate before dispatch.
- Enforce maximum payload size.
- Enforce per-peer message-rate limits.
- Ignore stale match IDs and stale revisions.
- Deduplicate sequence numbers.
- Close peers that repeatedly violate protocol.
- Never trust guest-reported canonical outcomes.

### Rendering

- Canvas rendering must be stateless with respect to simulation.
- Account for `devicePixelRatio`.
- Avoid creating objects in hot render loops when unnecessary.
- Prefer one animation frame loop for the match screen.
- Remote board rendering may be simplified before reducing simulation quality.

## Protocol Guidance

Use a versioned envelope similar to:

```ts
interface MessageEnvelope<TType extends string, TPayload> {
  protocol: "p2p-tetris";
  version: 1;
  matchId: string | null;
  senderId: string;
  sequence: number;
  sentAt: number;
  type: TType;
  payload: TPayload;
}
```

Keep protocol definitions in one module.

Required practices:

- Central encode/decode functions
- Central schema validation
- Exhaustive handler registration
- Clear protocol-error responses
- No component-specific ad hoc messages
- No circular imports between protocol and UI

## Simulation Guidance

The leader loop should use fixed steps.

Conceptual approach:

```ts
const tickMs = 1000 / 60;
let accumulator = 0;
let previous = performance.now();

function frame(now: number) {
  accumulator += now - previous;
  previous = now;

  while (accumulator >= tickMs) {
    processQueuedInputs();
    simulateOneTick();
    accumulator -= tickMs;
  }

  publishUpdatesIfNeeded();
  requestAnimationFrame(frame);
}
```

A Web Worker is preferred for the leader engine if it does not complicate correctness. Correctness and testability take precedence over worker adoption.

Do not use frame delta directly for game rules.

## State Update Guidance

Use a combination of:

- Immediate event messages
- Periodic authoritative player-state updates
- Periodic full snapshots

Every update should carry:

- Match ID
- Leader tick
- Revision
- Latest acknowledged input sequence

Do not send six complete boards on every animation frame.

A simple initial implementation may send complete compact player states at 15-30 Hz and full match snapshots every one to two seconds. Optimize only after profiling.

## Signaling UI Guidance

Leader slot workflow:

```text
Empty
 -> Create Invite
 -> Copy Offer
 -> Waiting for Answer
 -> Paste Answer
 -> Connecting
 -> Connected
```

Guest workflow:

```text
Paste Offer
 -> Validate
 -> Create Answer
 -> Copy Answer
 -> Waiting for Leader
 -> Connected
```

Text areas must:

- Support paste
- Support one-click copy
- Show validation errors
- Avoid logging full SDP payloads in production
- Clear sensitive temporary values after connection when practical

Do not add QR functionality.

## Error Messages

Errors must be specific and actionable.

Examples:

- `This invite is not a valid PT1 signaling payload.`
- `This payload is an answer, but an offer is required.`
- `This invite uses an unsupported protocol version.`
- `ICE gathering timed out. Try creating a new invite.`
- `A direct connection could not be established. This network may require TURN, which this version does not provide.`
- `The leader disconnected. The match has ended.`

Do not expose raw stack traces to players.

## Testing Expectations

Every phase must add or update tests.

Before considering a phase complete, run:

```bash
npm run lint
npm run test
npm run build
```

Run Playwright tests when UI or connection flows change.

For WebRTC browser tests:

- Use multiple browser contexts.
- Prefer Chromium first.
- Exchange generated signaling strings programmatically inside the test.
- Verify DataChannel open state.
- Verify message flow in both directions.
- Avoid depending on external messaging applications.

## Performance Budgets

Target on a typical modern laptop:

- Six-player leader simulation at 60 ticks per second
- Six board renderers at 60 frames per second where possible
- No persistent main-thread tasks over 50 ms during active play
- No unbounded input, message, or snapshot queues
- Full snapshot comfortably below DataChannel message-size limits

Measure before optimizing.

## Security and Abuse Limits

Add conservative defaults:

- Maximum display-name length
- Maximum signaling-text length
- Maximum DataChannel message length
- Maximum messages per second per peer
- Maximum queued inputs per peer
- Maximum future tick distance
- Maximum sequence-number jump

Invalid inputs should be ignored or rejected without corrupting state.

## Repository Hygiene

- Keep generated files out of source control unless required.
- Do not commit secrets.
- Do not commit captured SDP offers or answers.
- Document commands in `README.md`.
- Keep `SPEC.md` and `AGENTS.md` updated when implementation decisions materially change.
- Add an architecture section to `README.md`.

## Required README Content

The finished project README must include:

- What the application does
- Static-only architecture
- Leader-authoritative topology
- Manual signaling steps
- Local development commands
- Production build command
- Static deployment instructions
- Browser support
- STUN-only connectivity limitation
- Leader-disconnect limitation
- Testing commands

## Decision Rules

When choosing between alternatives:

1. Prefer correctness over cleverness.
2. Prefer deterministic engine behavior over animation convenience.
3. Prefer explicit state machines over implicit booleans.
4. Prefer testable pure modules over framework coupling.
5. Prefer a simple reliable DataChannel before premature channel optimization.
6. Prefer complete snapshots for recovery over complicated rollback.
7. Prefer ending the match on leader failure over incomplete migration logic.
8. Prefer useful error messages over silent retries.
9. Prefer static-host compatibility over server-dependent features.
10. Do not violate the no-backend constraint to simplify implementation.

## Definition of Done

Do not claim completion until:

- All acceptance criteria in `SPEC.md` are satisfied.
- Unit tests cover the core engine and protocol.
- Browser tests cover offer/answer exchange and DataChannel setup.
- Two to six local browser contexts can complete a match.
- Production build is static.
- No backend dependency exists.
- No Firebase or equivalent service exists.
- No QR workflow exists.
- Direct-connect failure is clearly explained.
- Leader disconnect terminates the match cleanly.
- Documentation is complete.

## Final Handoff

At completion, report:

- Implemented features
- Remaining known limitations
- Test results
- Build result
- Browser compatibility tested
- Any deliberate deviations from `SPEC.md`
- Suggested next improvements, ordered by impact
