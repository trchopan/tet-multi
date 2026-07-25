# Multiplayer Falling-Block Game Specification

## 1. Document status

- **Status:** Implementation specification
- **Target runtime:** Bun with TypeScript
- **Frontend:** Svelte 5 SPA built with SvelteKit and `@sveltejs/adapter-static`
- **Transport:** Native Bun server-side WebSockets
- **Maximum players per room:** 6
- **Persistence:** None for the MVP; all rooms and matches exist in process memory
- **Deployment model:** One Bun process serving both the WebSocket endpoint and static SPA assets

This document is authoritative for the initial implementation. When implementation details are not explicitly defined, choose the smallest solution consistent with this specification and record the decision in the repository README.

---

## 2. Product summary

Build a browser-based, real-time, multiplayer falling-block game for 2–5 players. Each player controls an independent 10-column board. All active boards are available in a responsive layout, with opponents collapsible on mobile. A Bun server owns the authoritative game state, validates player input, advances every board, resolves attacks, and broadcasts state snapshots to all clients in the room.

The application must run as one deployable Bun service:

```text
Browser clients
      │
      ├── HTTP GET / and assets
      └── WebSocket /ws
              │
              ▼
       Single Bun process
       ├── Static SPA server
       ├── Room manager
       ├── Authoritative game loop
       └── WebSocket sessions
```

The first release prioritizes correctness, deterministic behavior, clear code boundaries, and reliable play on ordinary internet connections. It does not need accounts, matchmaking, a database, spectators, bots, rankings, or horizontal scaling.

---

## 3. Goals

1. Allow a player to create a room and share a short room code or URL.
2. Allow 2–5 players to join the same room from modern desktop browsers.
3. Show all player boards in real time on every client.
4. Make the server authoritative for all gameplay and match outcomes.
5. Keep local controls responsive through client-side visual prediction and server reconciliation.
6. Support disconnect and reconnect without immediately forfeiting the player.
7. Provide deterministic, unit-testable game rules independent of Svelte and WebSockets.
8. Keep the repository simple enough for one engineer or coding agent to understand and maintain.

---

## 4. Non-goals

The MVP must not include:

- User accounts or authentication
- Persistent profiles, rankings, match history, or statistics
- Database storage
- Public matchmaking or a room browser
- Spectators
- Voice or text chat
- Multiple server instances sharing rooms
- Serverless or edge-runtime deployment
- Replay files
- Custom rule editors
- Paid services such as Firebase, Supabase, hosted pub/sub, or managed game backends
- Pixel-perfect reproduction of any commercial falling-block product

The game may use familiar falling-block mechanics, but all visual assets, names, sounds, and branding must be original or permissively licensed.

---

## 5. Primary user flow

### 5.1 Create a room

1. The user opens the root page.
2. The user enters a display name containing 1–20 visible characters.
3. The user selects **Create room**.
4. The server creates a room with a six-character code.
5. The creator becomes the room host.
6. The browser navigates to `/room/{ROOM_CODE}`.
7. The lobby displays a copyable invite URL.

### 5.2 Join a room

1. The user opens an invite URL or enters a room code on the home page.
2. The user enters a display name.
3. The client opens `/ws` and sends a `join_room` message.
4. The server either accepts the player or returns a structured error.
5. The player appears in the lobby.

### 5.3 Start a match

1. Every non-host player marks themselves ready.
2. The host marks themselves ready.
3. The host selects **Start match**.
4. Start is allowed only when:
   - There are at least 2 connected players.
   - There are no more than 5 players.
   - Every connected player is ready.
   - No countdown or match is already active.
5. The server broadcasts a three-second countdown.
6. The server starts all boards on the same authoritative tick.

### 5.4 Finish and replay

1. A player is eliminated on top-out or after their reconnect grace period expires.
2. The last non-eliminated player wins.
3. If all remaining players top out on the same authoritative tick, the match is a draw among those players.
4. The result screen shows placement and basic match statistics.
5. All connected players return to an unready lobby state when the host selects **Return to lobby**.

---

## 6. Browser support

Support the current stable versions of:

- Chrome
- Edge
- Firefox
- Safari on macOS

The MVP is desktop-first. The UI may display a clear unsupported-device notice below a practical minimum viewport width, but it must remain readable on tablets.

Required browser APIs:

- WebSocket
- Canvas 2D
- `requestAnimationFrame`
- `crypto.randomUUID`
- `localStorage`
- `ResizeObserver`

---

## 7. Technology choices

### 7.1 Runtime and package manager

- Use Bun for dependency installation, scripts, tests, and production runtime.
- Declare the selected Bun version in the `packageManager` field of `package.json` and commit `bun.lock`.
- Use TypeScript with strict mode enabled.
- Do not add Express, Hono, Elysia, Socket.IO, or another HTTP/WebSocket framework unless a requirement cannot be met with `Bun.serve`.

### 7.2 Frontend

- Use Svelte 5 and SvelteKit.
- Build a static SPA with `@sveltejs/adapter-static` and a fallback page.
- Disable SSR for the application shell.
- Use Svelte runes for new reactive code.
- Render game boards with Canvas 2D.
- Use ordinary HTML for lobby controls, buttons, dialogs, labels, and result views.

### 7.3 Validation

Use one small runtime schema library shared by client and server. **Valibot is preferred** for protocol validation. Zod is acceptable if already present. Do not trust TypeScript types at runtime.

### 7.4 Testing

- Use `bun test` for engine, room, protocol, and server unit tests.
- Use Vitest only if required for Svelte component tests.
- Use Playwright for a small end-to-end suite with multiple browser contexts.

---

## 8. Repository layout

Use a single repository and one root package:

```text
.
├── AGENTS.md
├── SPEC.md
├── README.md
├── package.json
├── bun.lock
├── tsconfig.json
├── svelte.config.js
├── vite.config.ts
├── static/
│   └── favicon.svg
├── src/
│   ├── shared/
│   │   ├── constants.ts
│   │   ├── protocol.ts
│   │   ├── schemas.ts
│   │   └── types.ts
│   ├── game/
│   │   ├── board.ts
│   │   ├── engine.ts
│   │   ├── garbage.ts
│   │   ├── pieces.ts
│   │   ├── random.ts
│   │   ├── rotation.ts
│   │   ├── scoring.ts
│   │   └── __tests__/
│   ├── server/
│   │   ├── index.ts
│   │   ├── config.ts
│   │   ├── room-manager.ts
│   │   ├── room.ts
│   │   ├── session.ts
│   │   ├── snapshot.ts
│   │   └── __tests__/
│   ├── lib/
│   │   ├── client/
│   │   │   ├── game-session.svelte.ts
│   │   │   ├── input.ts
│   │   │   ├── prediction.ts
│   │   │   ├── renderer.ts
│   │   │   └── websocket.ts
│   │   └── components/
│   │       ├── BoardCanvas.svelte
│   │       ├── GameGrid.svelte
│   │       ├── HomeForm.svelte
│   │       ├── Lobby.svelte
│   │       ├── PlayerCard.svelte
│   │       └── Results.svelte
│   └── routes/
│       ├── +layout.ts
│       ├── +page.svelte
│       └── room/
│           └── [code]/
│               └── +page.svelte
├── e2e/
│   └── multiplayer.spec.ts
└── scripts/
    └── verify.ts
```

The game engine under `src/game` must not import Svelte, DOM APIs, Bun WebSocket types, timers, or server room classes.

---

## 9. Domain terminology

- **Room:** Lobby and zero or more matches associated with one invite code.
- **Host:** Player currently authorized to start matches and return results to the lobby.
- **Session:** One logical player identity, including reconnect token and current WebSocket.
- **Match:** One synchronized competition inside a room.
- **Tick:** One authoritative fixed simulation step.
- **Snapshot:** Server-created representation of the current room and game state.
- **Input:** A player action submitted to the server with a monotonically increasing sequence number.
- **Attack:** Garbage lines generated by a line clear after cancellation rules.
- **Top-out:** A board reaches a state that eliminates the player.

---

## 10. Room rules

### 10.1 Room code

- Exactly six uppercase characters.
- Alphabet: `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`.
- Exclude visually ambiguous characters such as `I`, `O`, `0`, and `1`.
- Codes are case-insensitive on input and normalized to uppercase.
- Generate codes with cryptographically secure randomness.
- Retry on collision.

### 10.2 Capacity

- Minimum players to start: 2.
- Maximum player sessions in a room: 6.
- Reconnecting sessions continue to occupy a slot during the grace period.
- Joining during a countdown or active match is rejected with `MATCH_IN_PROGRESS`.

### 10.3 Host behavior

- The room creator is initially host.
- If the host disconnects, they remain host during the reconnect grace period.
- If the host leaves explicitly or their grace period expires, host status moves to the connected player with the earliest `joinedAt` timestamp.
- Host migration is broadcast immediately.
- If no connected players remain, the room is removed after the empty-room timeout.

### 10.4 Room expiration

- Empty room timeout: 5 minutes.
- Finished match with no connected players: delete after 1 minute.
- A room containing connected players has no fixed expiration in the MVP.

### 10.5 Display names

- Trim leading and trailing whitespace.
- Length: 1–20 Unicode code points.
- Reject control characters and line breaks.
- Names need not be unique. The UI disambiguates duplicate names using a short player suffix.
- Escape names as text. Never inject them as HTML.

### 10.6 Computer players

- A host may add or remove computer players while the room is in the lobby.
- Computer players count toward the five-player room capacity.
- A room may contain up to four computer players, allowing one human to play
  against one to four computers.
- The host selects a difficulty independently for each computer before adding
  it: `Beginner`, `Challenger`, or `Legendary`.
- `Beginner` uses slower reactions and a deliberately broad, immediate-board
  placement policy without hold or lookahead evaluation.
- `Challenger` uses medium pacing and immediate-board evaluation with hold
  evaluation but no next-piece lookahead.
- `Legendary` preserves the strongest current policy: hold evaluation, bounded
  next-piece lookahead, and the existing action cadence.
- Computer players are server-owned sessions with no WebSocket or reconnect
  grace period and are automatically ready.
- Computer actions are generated by a deterministic, rule-based placement
  policy and enter the same authoritative input queue as human actions.
- The policy evaluates legal rotations and columns using line clears, height,
  holes, and surface bumpiness. It chooses among the strongest few placements
  and uses a short reaction delay for a mild challenge.
- Computer players never become room host and are removed when no human room
  presence remains.

---

## 11. Match lifecycle

```text
LOBBY
  │ host starts, all ready, >=2 players
  ▼
COUNTDOWN (3 seconds)
  │
  ▼
PLAYING
  │ one survivor or simultaneous final top-out
  ▼
FINISHED
  │ host returns room
  └──────────────────────────────► LOBBY
```

Room phases:

```ts
type RoomPhase = "lobby" | "countdown" | "playing" | "finished";
```

Player match states:

```ts
type PlayerMatchState =
  | "waiting"
  | "playing"
  | "disconnected"
  | "eliminated";
```

A disconnected player’s engine continues to advance during the grace period. This prevents disconnecting from being used as a pause exploit.

---

## 12. Board and piece rules

### 12.1 Board dimensions

- Width: 10 cells.
- Visible height: 20 cells.
- Hidden spawn area: 4 rows.
- Internal board dimensions: 10 × 24.
- Coordinate origin: top-left.
- X increases rightward; Y increases downward.

### 12.2 Pieces

Support seven tetromino types:

```ts
type PieceKind = "I" | "J" | "L" | "O" | "S" | "T" | "Z";
```

Use a deterministic seven-bag randomizer:

1. Shuffle all seven piece kinds with a seeded PRNG.
2. Consume the bag in order.
3. Generate a new shuffled bag when exhausted.
4. All players in a match use the same room piece seed and therefore the same infinite bag sequence.
5. Each player has an independent sequence cursor.

Do not use `Math.random()` inside deterministic game logic.

### 12.3 Rotation

Implement Super Rotation System-style piece states and wall kicks:

- Four rotation states: `0`, `R`, `2`, `L`.
- Separate kick tables for I and JLSTZ pieces.
- O rotation is visually stable and must not translate unexpectedly.
- Support clockwise and counterclockwise rotation.
- Rotation tests must cover wall, floor, stack, and blocked-kick cases.

### 12.4 Hold

- One hold slot per player.
- Hold may be used once per active piece.
- First hold stores the current piece and draws the next piece.
- Later holds swap the current piece with the held piece.
- A held or swapped-in piece starts at its normal spawn position and rotation.

### 12.5 Preview

Show the next five pieces.

### 12.6 Ghost piece

The client shows the hard-drop landing position as a translucent ghost. The ghost is presentation-only and must be derived from authoritative or predicted local state.

---

## 13. Timing and movement

The server uses a fixed timestep of 60 ticks per second:

```ts
const TICK_RATE = 60;
const TICK_MS = 1000 / TICK_RATE;
```

Use an accumulator and clamp a single elapsed-time contribution to 250 ms to avoid a runaway catch-up loop.

### 13.1 Gravity

- Initial gravity interval: 800 ms per cell.
- Level: `Math.floor(totalLinesCleared / 10)`.
- Gravity interval: `max(80, 800 * 0.85 ** level)` milliseconds.
- Apply enough gravity steps to account for accumulated elapsed time.

### 13.2 Lock behavior

- Lock delay: 500 ms after the active piece first touches the stack or floor.
- Successful movement or rotation while grounded resets the lock timer.
- Maximum grounded lock resets per piece: 15.
- Hard drop locks immediately.
- When lock delay expires, merge the piece, clear lines, resolve attacks, and spawn the next piece.

### 13.3 Keyboard repeat

Client input handling defaults:

- Delayed auto shift (DAS): 140 ms.
- Auto repeat rate (ARR): 40 ms.
- Soft drop repeat interval: 35 ms.
- Opposite-direction behavior: the most recently pressed horizontal direction wins.
- Key-repeat behavior must be generated by the game input module, not browser `KeyboardEvent.repeat` alone.

### 13.4 Default controls

| Action | Primary key | Alternate key |
|---|---:|---:|
| Move left | Left Arrow | A |
| Move right | Right Arrow | D |
| Soft drop | Down Arrow | S |
| Hard drop | Space | W |
| Rotate clockwise | Up Arrow | X |
| Rotate counterclockwise | Z | Q |
| Hold | C | Shift |

Prevent default browser scrolling for active gameplay keys while the game canvas has control focus.

### 13.5 Touch controls

The local board accepts primary touch-pointer swipes in addition to keyboard
controls:

- A horizontal swipe of at least 32 CSS pixels moves left or right.
- An upward swipe of at least 32 CSS pixels rotates clockwise.
- A downward swipe of at least 32 CSS pixels emits one soft-drop action
  immediately.
- A second consecutive downward swipe completed within 300 ms emits one hard-drop
  action instead.
- Taps and diagonal gestures without a dominant axis are ignored.
- A non-downward gesture, cancelled gesture, or lost pointer capture resets the
  pending double-down sequence.
- Mouse, pen, and non-primary touch pointers do not generate gameplay input.
- The local board disables browser touch handling while preserving keyboard focus
  and controls.

---

## 14. Line clears, score, and attacks

### 14.1 Basic score

Score is informative and does not determine the winner.

| Clear | Base score × (`level + 1`) |
|---|---:|
| Single | 100 |
| Double | 300 |
| Triple | 500 |
| Four-line clear | 800 |
| T-spin mini, no line | 100 |
| T-spin, no line | 400 |
| T-spin mini single | 200 |
| T-spin single | 800 |
| T-spin double | 1200 |
| T-spin triple | 1600 |
| Soft drop | 1 per cell |
| Hard drop | 2 per cell |

### 14.2 Base garbage attack

| Clear | Garbage lines |
|---|---:|
| Single | 0 |
| Double | 1 |
| Triple | 2 |
| Four-line clear | 4 |
| T-spin mini single | 1 |
| T-spin single | 2 |
| T-spin double | 4 |
| T-spin triple | 6 |

### 14.3 Back-to-back

Eligible clears:

- Four-line clear
- T-spin line clear

A consecutive eligible clear after the first adds one garbage line. A non-eligible line clear breaks back-to-back. A placement with no line clear does not break it.

### 14.4 Combo

Combo starts at `-1` before a clear. Each consecutive piece placement that clears at least one line increments it. A placement with no clear resets it to `-1`.

Combo garbage bonus:

| Combo index | Bonus |
|---|---:|
| 0–1 | 0 |
| 2–3 | 1 |
| 4–5 | 2 |
| 6–7 | 3 |
| 8+ | 4 |

### 14.5 Perfect clear

If the board is empty after line clearing, add 10 garbage lines.

### 14.6 T-spin detection

A T-spin requires:

1. The locked piece is T.
2. The most recent successful player action affecting the piece was a rotation.
3. At least three of the four diagonal cells around the T rotation center are occupied or outside the board.

Classify mini versus full using the two front corner cells for the final rotation state and whether the successful kick was the final SRS kick. Keep this logic isolated and covered by tests.

### 14.7 Incoming garbage cancellation

Before sending an attack to another player:

1. Cancel pending incoming garbage from oldest packet to newest.
2. One outgoing line cancels one incoming line.
3. Only the remaining outgoing attack is sent.
4. If all outgoing attack is consumed, remaining incoming garbage stays queued.

### 14.8 Garbage delivery

- Garbage packets have an activation delay of 500 ms.
- Ready garbage rises only after the current piece locks and its line clear resolves.
- Applying garbage shifts the board upward.
- Each row has one hole.
- All rows in one attack packet use the same hole.
- The hole is selected with a deterministic room garbage PRNG.
- A new attack packet selects a new hole independently.
- If shifted blocks or newly added garbage exceed the hidden area, the player tops out.

### 14.9 Targeting

The MVP uses automatic targeting:

- Target one random connected, non-eliminated opponent.
- Exclude the attacker.
- Choose a target at the time the outgoing packet is created.
- Use the authoritative room PRNG.
- If the target is eliminated before delivery, retarget to another valid opponent.
- If no opponent remains, discard the attack.

Manual targeting is outside MVP scope.

---

## 15. Top-out and match result

A player is eliminated when any of these occur:

1. A new piece cannot be placed at its spawn position after the previous piece locks and clears resolve.
2. Locking a piece leaves occupied cells in the hidden spawn area and the next spawn cannot resolve it.
3. Incoming garbage shifts occupied cells above the internal board.
4. The player disconnects and does not reconnect before the grace period expires.
5. The session explicitly leaves during a match.

Placement order is determined by elimination tick, then by player join order for stable display only. Players eliminated on the same tick share the same placement rank. The last surviving player is the winner.

---

## 16. Authoritative simulation

### 16.1 Ownership

The Bun server owns:

- Room phase and countdown
- Match seed and PRNG state
- Piece queues
- Every board and active piece
- Hold and previews
- Gravity, lock delay, and line clears
- Score, combo, back-to-back, and attacks
- Garbage queues
- Elimination and winner determination
- Last processed input sequence for each player

Clients own only:

- Keyboard collection
- Local visual prediction
- Rendering and interpolation
- UI state unrelated to game authority
- Reconnect token storage

### 16.2 Global loop

Use one process-level scheduler for all rooms, not one `setInterval` per board.

Recommended structure:

```ts
let previous = performance.now();
let accumulator = 0;

setInterval(() => {
  const now = performance.now();
  accumulator += Math.min(now - previous, 250);
  previous = now;

  while (accumulator >= TICK_MS) {
    roomManager.fixedUpdate();
    accumulator -= TICK_MS;
  }
}, TICK_MS);
```

The implementation must avoid depending on exact timer wake-up precision.

### 16.3 Input processing

- Each gameplay input has a player-local `sequence` integer.
- Sequence starts at 1 after `match_started`.
- Reject sequence numbers less than or equal to the last accepted sequence.
- Queue accepted inputs and apply them in sequence order at the start of a simulation tick.
- Limit accepted gameplay input messages to 120 per second per player with a short burst allowance.
- Ignore movement input before the match start tick or after elimination.
- Treat hard drop and hold as edge-triggered actions.

### 16.4 Snapshot rate

- Simulation: 60 Hz.
- Normal room snapshots while playing: 20 Hz.
- Lobby snapshots: on change plus a 5-second heartbeat.
- Send an immediate snapshot after join, reconnect, elimination, phase change, or match finish.
- Full authoritative snapshots are acceptable for the MVP.

Do not send snapshots at 60 Hz.

---

## 17. WebSocket protocol

### 17.1 Transport rules

- Endpoint: `/ws`.
- Use secure `wss://` automatically when the page uses HTTPS.
- Messages are JSON UTF-8 text for the MVP.
- Every message has a `type` string.
- Client and server validate all inbound messages.
- Maximum inbound message size: 16 KiB.
- Close malformed or abusive connections after repeated violations.

### 17.2 Protocol version

```ts
export const PROTOCOL_VERSION = 2;
```

The first client message must be `hello`. Reject incompatible versions.

### 17.3 Client-to-server messages

```ts
type ClientMessage =
  | {
      type: "hello";
      protocolVersion: 2;
      clientId: string;
    }
  | {
      type: "create_room";
      requestId: string;
      displayName: string;
    }
  | {
      type: "join_room";
      requestId: string;
      roomCode: string;
      displayName: string;
      reconnectToken?: string;
    }
  | {
      type: "set_ready";
      ready: boolean;
    }
	| {
      type: "start_match";
    }
	| {
      type: "add_computer";
      difficulty: "beginner" | "challenger" | "legendary";
    }
  | {
      type: "remove_computer";
      playerId: string;
    }
  | {
      type: "input";
      matchId: string;
      sequence: number;
      action:
        | "move_left"
        | "move_right"
        | "soft_drop"
        | "hard_drop"
        | "rotate_cw"
        | "rotate_ccw"
        | "hold";
    }
  | {
      type: "return_to_lobby";
    }
  | {
      type: "leave_room";
    }
  | {
      type: "ping";
      nonce: string;
      clientTime: number;
    };
```

### 17.4 Server-to-client messages

```ts
type ServerMessage =
  | {
      type: "hello_ack";
      protocolVersion: 2;
      serverTime: number;
    }
  | {
      type: "room_joined";
      requestId: string;
      roomCode: string;
      playerId: string;
      reconnectToken: string;
      hostPlayerId: string;
    }
  | {
      type: "room_snapshot";
      snapshot: RoomSnapshot;
    }
  | {
      type: "match_started";
      matchId: string;
      seed: string;
      startTick: number;
      serverTime: number;
    }
  | {
      type: "error";
      requestId?: string;
      code: ErrorCode;
      message: string;
      recoverable: boolean;
    }
  | {
      type: "pong";
      nonce: string;
      clientTime: number;
      serverTime: number;
    };
```

### 17.5 Snapshot shape

For the MVP, encode each board as a row-major `number[]` of length 240. Values:

- `0`: empty
- `1`: I
- `2`: J
- `3`: L
- `4`: O
- `5`: S
- `6`: T
- `7`: Z
- `8`: garbage

```ts
interface RoomSnapshot {
  protocolVersion: 2;
  roomCode: string;
  phase: RoomPhase;
  hostPlayerId: string;
  serverTick: number;
  serverTime: number;
  countdownEndsAt?: number;
  matchId?: string;
  winnerPlayerIds?: string[];
  players: PlayerSnapshot[];
}

interface PlayerSnapshot {
  playerId: string;
  displayName: string;
  shortId: string;
  playerType: "human" | "computer";
  computerDifficulty?: "beginner" | "challenger" | "legendary";
  joinedAt: number;
  connected: boolean;
  ready: boolean;
  isHost: boolean;
  matchState: PlayerMatchState;
  placement?: number;
  eliminatedAtTick?: number;
  board?: number[];
  activePiece?: {
    kind: PieceKind;
    x: number;
    y: number;
    rotation: 0 | 1 | 2 | 3;
  };
  hold?: PieceKind;
  next?: PieceKind[];
  score?: number;
  lines?: number;
  level?: number;
  combo?: number;
  backToBack?: boolean;
  incomingGarbage?: number;
  lastProcessedInput?: number;
}
```

Fields not relevant in the lobby may be omitted.

### 17.6 Error codes

```ts
type ErrorCode =
  | "INVALID_MESSAGE"
  | "PROTOCOL_MISMATCH"
  | "NOT_JOINED"
  | "ROOM_NOT_FOUND"
  | "ROOM_FULL"
  | "MATCH_IN_PROGRESS"
  | "INVALID_NAME"
  | "NOT_HOST"
  | "NOT_READY"
  | "INSUFFICIENT_PLAYERS"
  | "INVALID_PHASE"
  | "INVALID_RECONNECT_TOKEN"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR"
  | "COMPUTER_LIMIT"
  | "INVALID_PLAYER";
```

Errors shown to users must be understandable. Internal stack traces must never be sent to clients.

---

## 18. Reconnection

### 18.1 Token

- Issue a cryptographically random reconnect token when a room session is created.
- Token length: at least 128 bits of entropy.
- Store it in `localStorage`, scoped by room code.
- Never put the token in a URL.
- Compare tokens without logging them.

### 18.2 Grace period

- Reconnect grace period: 20 seconds.
- On unexpected close, mark the player disconnected and record `reconnectDeadline`.
- Keep their room slot and current engine state.
- Their game continues to advance.
- A valid reconnect replaces the old socket and receives an immediate full snapshot.
- If an old socket is still open, close it with a replacement-session code.
- When the deadline expires during a match, eliminate the player.
- When it expires in the lobby, remove the session.

### 18.3 Client retry

Use exponential backoff with jitter:

```text
0.5 s, 1 s, 2 s, 4 s, then 5 s maximum
```

Stop automatic attempts after the server rejects the reconnect token or the room no longer exists. Show a visible connection state at all times.

---

## 19. Client prediction and reconciliation

Prediction is required for the local active piece but not for opponents.

### 19.1 Local flow

1. Assign a sequence number to the input.
2. Apply the input immediately to a client-side prediction engine.
3. Send the input to the server.
4. Receive a snapshot containing `lastProcessedInput`.
5. Replace predicted state with the authoritative local state.
6. Remove acknowledged inputs.
7. Reapply unacknowledged inputs in order.

The client prediction engine must use the same pure movement and collision functions as the server where practical. It must not independently advance authoritative line clears, score, garbage targeting, or match outcome.

### 19.2 Opponent rendering

- Render opponents directly from snapshots.
- Interpolate active-piece Y movement between recent snapshots for visual smoothness.
- Never extrapolate an opponent for more than 150 ms.
- Snap to the newest authoritative state after a line clear, hard drop, garbage rise, or elimination.

### 19.3 Clock offset

Estimate server clock offset from `ping`/`pong` round trips using the sample with the lowest recent round-trip time. Display latency as informational only.

---

## 20. Backpressure and connection health

- Configure Bun WebSocket idle timeout appropriately for game sessions.
- Send application-level ping messages every 5 seconds while connected.
- Consider the connection stale after 15 seconds without any server message.
- Do not enqueue unlimited snapshots for a slow client.
- If `send` indicates backpressure, mark the socket congested and skip replaceable snapshots.
- On the WebSocket `drain` callback, send only the newest pending snapshot.
- Critical messages such as `room_joined`, `error`, and phase transitions must not be silently discarded.
- Close persistently congested connections cleanly.

---

## 21. HTTP and static SPA behavior

Required HTTP routes:

| Method | Route | Behavior |
|---|---|---|
| GET | `/health` | Return JSON `{ "status": "ok" }` |
| GET | `/ws` | Upgrade valid WebSocket requests |
| GET | `/assets/*` | Serve built static assets with correct MIME type and cache headers |
| GET | `/*` | Serve the SPA fallback for client-side routes |

Production cache policy:

- Fingerprinted JS/CSS/assets: `public, max-age=31536000, immutable`.
- SPA HTML fallback: `no-cache`.
- Health endpoint: `no-store`.

Development may use Vite for the frontend and Bun watch mode for the server, but `bun run dev` must start the complete application with one command.

---

## 22. User interface requirements

### 22.1 Home

- Original game title and visual identity.
- Display-name input.
- **Create room** button.
- Room-code input and **Join room** button.
- Keyboard-control summary.
- Inline validation and server errors.

### 22.2 Lobby

- Room code and copy invite button.
- Player list with host, ready, and connection indicators.
- Local ready toggle.
- Start button visible to host.
- Start button disabled with an explanatory reason when conditions are unmet.
- Maximum capacity indicator, e.g. `4 / 6`.

### 22.3 Game grid

For five players on desktop, use a primary local board with compact opponent cards that also show opponent boards. On mobile, opponent cards are hidden by default and revealed with a toggle.

```text
5 players: primary local board plus four compact opponent boards
5 players: 3 columns, centered final row
4 players: 2 × 2
3 players: 3 × 1 or 2 + 1 depending on width
2 players: 2 × 1
```

Requirements:

- The local board is visually emphasized.
- Every card shows player name, status, board, incoming garbage, score, and connection status.
- Local card additionally shows hold, five-piece preview, and controls.
- Boards preserve a 1:2 visible aspect ratio.
- Board sizing responds to viewport changes without recreating the game session.
- Canvas rendering must account for `devicePixelRatio` for sharp output.

### 22.4 Countdown

Show `3`, `2`, `1`, `GO` based on server time, not local timers alone.

### 22.5 Results

Show:

- Winner or draw
- Placement
- Score
- Lines cleared
- Attack sent
- Maximum combo
- Disconnect status if relevant

The host receives a **Return to lobby** button. Other players see a waiting state.

### 22.6 Accessibility

- All non-canvas controls are keyboard accessible.
- Buttons and inputs have visible focus styles.
- Do not communicate status only through color.
- Canvas has an accessible label describing whose board it is and current status.
- Respect `prefers-reduced-motion` for nonessential animations.
- Use sufficient text/background contrast.

---

## 23. Visual and audio direction

- Use an original neutral arcade visual style.
- Do not copy logos, layouts, sound effects, fonts, or branded visual treatments from commercial falling-block products.
- Tetromino colors must be configurable in one theme module.
- Sound is optional for the MVP. If included, it must have a mute control and use original or permissively licensed assets.

---

## 24. Security and abuse resistance

- Validate every client message at runtime.
- Enforce room membership on all room actions.
- Enforce host authorization on start and return-to-lobby actions.
- Rate-limit connection attempts per IP using an in-memory sliding window.
- Rate-limit room creation per IP.
- Rate-limit gameplay input per session.
- Cap inbound message size.
- Reject unexpected object keys where practical.
- Do not deserialize executable data.
- Do not use `eval`, `new Function`, or dynamic code loading.
- Generate IDs and tokens with cryptographic randomness.
- Do not log reconnect tokens or complete IP addresses at normal log level.
- Escape all user-supplied strings.
- Configure production origin checking for WebSocket upgrades using `ALLOWED_ORIGINS`.
- Return generic internal errors to clients and structured details only in server logs.

Because the MVP is single-process and unauthenticated, room codes are convenience secrets, not strong access control.

---

## 25. Configuration

Environment variables:

| Name | Default | Description |
|---|---:|---|
| `PORT` | `3000` | HTTP/WebSocket port |
| `HOST` | `0.0.0.0` | Bind host |
| `NODE_ENV` | `development` | Runtime mode |
| `PUBLIC_BASE_URL` | inferred | Invite-link origin |
| `ALLOWED_ORIGINS` | local origin in dev | Comma-separated accepted WebSocket origins |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, or `error` |
| `ROOM_EMPTY_TTL_MS` | `300000` | Empty room expiry |
| `RECONNECT_GRACE_MS` | `20000` | Reconnect grace period |

Parse configuration once at startup, validate it, and fail fast on invalid values.

---

## 26. Logging and observability

Use structured JSON logs in production and readable logs in development.

Log events:

- Server started and stopped
- Room created and deleted
- Player joined, reconnected, disconnected, and removed
- Host migrated
- Match countdown, start, finish, and result
- Protocol validation failure counts
- Rate-limit events
- Unexpected server errors

Never log every simulation tick or ordinary movement input at info level.

`GET /health` verifies process liveness. It does not need to inspect every room.

---

## 27. Performance targets

On a typical modern laptop running one Bun process:

- Support at least 50 simultaneous five-player rooms in a synthetic server test without simulation falling more than 100 ms behind for sustained periods.
- Keep average server tick work below 8 ms at that load.
- Keep a normal full five-player JSON snapshot under 20 KiB where practical.
- Keep normal outbound traffic below approximately 400 KiB/s per five-player room at 20 snapshots/s.
- Maintain 60 FPS rendering on a current desktop browser with five visible boards.
- Avoid per-frame Svelte object churn for board cells; Canvas drawing should consume compact arrays.

These are engineering targets, not a commitment to horizontal scaling.

---

## 28. Test requirements

### 28.1 Game engine unit tests

At minimum:

- Seven-bag contains every piece exactly once per bag.
- Same seed produces the same sequence.
- Different seeds generally produce different sequences.
- Collision against walls, floor, and occupied cells.
- Clockwise and counterclockwise rotations with SRS kicks.
- Hold restrictions and swap behavior.
- Gravity accumulation.
- Lock delay and reset limit.
- Single, double, triple, and four-line clears.
- Combo and back-to-back progression.
- T-spin classification.
- Perfect clear detection.
- Garbage cancellation and delayed application.
- Spawn collision and garbage top-out.
- Deterministic replay of a known input sequence.

### 28.2 Room/server unit tests

- Code generation and collision retry.
- Capacity enforcement.
- Ready and start authorization.
- Three-second countdown transition.
- Host migration.
- Join rejection during active match.
- Reconnect success and invalid-token rejection.
- Grace-period elimination/removal.
- Input sequence deduplication.
- Input rate limiting.
- Simultaneous elimination and draw handling.
- Room cleanup.
- Snapshot validation against shared schema.

### 28.3 Frontend tests

- Home form validation.
- Lobby ready state and disabled start reason.
- Board canvas resize behavior.
- Keyboard input mapping and DAS/ARR.
- Touch swipe mapping, pointer capture, focus, cancellation, and double-swipe
  timing.
- Reconnect status transitions.
- Prediction reconciliation with acknowledged and pending inputs.

### 28.4 End-to-end tests

Use Playwright browser contexts to verify:

1. Player A creates a room.
2. Player B joins by code.
3. Both ready; host starts.
4. Both receive the same match ID and countdown.
5. Input from A changes A’s board on both clients.
6. B disconnects and reconnects within the grace period.
7. An intentionally scripted top-out finishes the match.
8. Both clients display the same winner.
9. Host returns the room to the lobby.
10. A touch-enabled client can move the local active piece with a swipe without
    changing an opponent board.

A test-only server control may inject deterministic board fixtures, but it must be unavailable in production builds.

---

## 29. Required scripts

The root `package.json` must provide:

```json
{
  "scripts": {
    "dev": "...",
    "build": "...",
    "start": "...",
    "check": "...",
    "typecheck": "...",
    "lint": "...",
    "format": "...",
    "test": "...",
    "test:watch": "...",
    "test:e2e": "...",
    "verify": "..."
  }
}
```

Expected behavior:

- `bun run dev`: starts frontend and server development processes.
- `bun run build`: produces the static client and production server artifacts.
- `bun run start`: runs the production Bun server.
- `bun run check`: runs Svelte checks.
- `bun run typecheck`: runs TypeScript without emitting.
- `bun run lint`: checks formatting and lint rules.
- `bun run format`: formats the repository.
- `bun test`: runs unit tests.
- `bun run test:e2e`: runs Playwright tests.
- `bun run verify`: runs all non-watch quality gates in a stable order.

---

## 30. Build and deployment

The production build must be runnable as:

```bash
bun install --frozen-lockfile
bun run build
bun run start
```

Provide a multi-stage Dockerfile as an optional deployment path. The final image must:

- Run as a non-root user.
- Expose the configured port.
- Include only production files and built assets.
- Provide a health check against `/health`.
- Handle `SIGTERM` by stopping new joins, closing sockets, and exiting promptly.

No database or external service is required.

---

## 31. Implementation milestones

### Milestone 1: Repository and deterministic local engine

Deliver:

- Bun/Svelte project skeleton
- Shared strict TypeScript configuration
- Pure game engine
- Canvas single-player renderer
- Keyboard controls
- Engine tests

Exit criteria:

- One local player can play a complete game.
- Engine tests cover board, pieces, rotation, lock, and line clearing.
- Same seed plus same inputs produces identical state hashes.

### Milestone 2: Rooms and lobby

Deliver:

- Bun HTTP/WebSocket server
- Protocol schemas
- Room manager
- Create/join/leave
- Host and ready state
- Static SPA serving

Exit criteria:

- Six browser tabs can join one room.
- Capacity, host migration, and invalid messages are tested.

### Milestone 3: Authoritative multiplayer match

Deliver:

- Global fixed-timestep loop
- Per-player authoritative engines
- Countdown
- Input sequencing
- Snapshots
- Six-board grid
- Match finish

Exit criteria:

- Two to five clients can complete a match and agree on the winner.
- Clients cannot submit board or score state.

### Milestone 4: Competitive rules

Deliver:

- Garbage attacks
- Cancellation
- Automatic targeting
- Combo, back-to-back, T-spin, and perfect clear logic
- Incoming-garbage UI

Exit criteria:

- Attack calculations and deterministic targeting are unit tested.
- Scripted attacks produce identical results across repeated runs.

### Milestone 5: Network resilience and responsiveness

Deliver:

- Local prediction and reconciliation
- Opponent interpolation
- Ping/latency estimation
- Backpressure handling
- Reconnection and grace period

Exit criteria:

- Local movement remains visually immediate under simulated 100 ms latency.
- Reconnect within 20 seconds restores the session.
- Slow clients do not create unbounded snapshot queues.

### Milestone 6: Hardening and release

Deliver:

- Rate limits and origin checks
- Accessibility pass
- Playwright multiplayer tests
- Performance test harness
- Dockerfile
- README with setup, architecture, controls, and limitations

Exit criteria:

- `bun run verify` passes from a clean checkout.
- Production build runs with one command.
- No critical or high-severity dependency findings remain without documentation.

---

## 32. Acceptance criteria

The implementation is accepted when all statements are true:

1. A new user can create a room and copy a working invite URL.
2. Between two and five users can join from separate browser contexts.
3. A seventh player is rejected without disrupting the room.
4. Only the host can start a match or return results to the lobby.
5. A match cannot start until all connected players are ready.
6. Every client displays every active board in a responsive grid.
7. The server alone decides piece generation, board state, attacks, elimination, and winner.
8. Clients send actions, never board states or scores.
9. The simulation advances at a fixed 60 Hz and snapshots are normally sent at 20 Hz.
10. The local board uses prediction and reconciliation.
11. A disconnected player can reconnect with their token within 20 seconds.
12. Host migration works when the host permanently leaves.
13. Garbage cancellation, targeting, and delivery follow this specification.
14. Match results are identical on all connected clients.
15. Invalid messages, duplicate input sequences, and excessive input rates are rejected safely.
16. Static Svelte assets and `/ws` are served by the same Bun application in production.
17. `bun run verify` passes.
18. The local board supports the specified primary-touch swipe controls.
19. The repository contains current `README.md`, `SPEC.md`, and `AGENTS.md` files.

---

## 33. Future extensions

These are explicitly deferred but the architecture should not make them impossible:

- Spectators
- Private room passwords
- Custom controls
- Replays from seed and input log
- Ranked matchmaking
- Persistent accounts and statistics
- Multiple attack targeting modes
- Binary snapshots and delta compression
- Horizontal room sharding
- Regional servers
- Gamepad support

Do not implement future extensions until the MVP acceptance criteria pass.

---

## 34. Technical references

Use current official documentation during implementation:

- Bun server-side WebSockets: https://bun.com/docs/runtime/http/websockets
- Bun HTTP server: https://bun.com/docs/runtime/http/server
- Bun HTML and static sites: https://bun.com/docs/bundler/html-static
- SvelteKit SPA guidance: https://svelte.dev/docs/kit/single-page-apps
- SvelteKit static adapter: https://svelte.dev/docs/kit/adapter-static
- Svelte lifecycle: https://svelte.dev/docs/svelte/lifecycle-hooks

When the current official API differs from an example or assumption in this specification, preserve the required behavior and adapt the implementation to the official API.

---

## 35. Implementation clarifications

The following rules resolve details that must remain consistent across the
engine, server, client, and tests.

### 35.1 Time domains

- `serverTick` is the authoritative simulation clock and advances only in
  fixed 60 Hz steps.
- Protocol `serverTime`, `countdownEndsAt`, and `reconnectDeadline` values are
  Unix epoch milliseconds.
- Game rules must not read wall-clock time. The server converts elapsed wall
  time into bounded fixed-timestep updates before calling the room simulation.

### 35.2 Deterministic player queues

- A match has one authoritative match seed.
- Each player receives an independent deterministic seven-bag stream derived
  from the match seed and their stable roster index.
- A player’s stream must not depend on object-key iteration order, socket order,
  or wall-clock values.
- The match seed and roster order are sufficient to reproduce every initial
  piece sequence.

### 35.3 Board snapshot indexing

- A serialized board is row-major with exactly 240 values for 10 × 24 cells.
- Rows `0` through `3` are hidden spawn rows.
- Canvas rendering displays rows `4` through `23` and never draws hidden rows.
- The board coordinate origin remains the top-left of the internal board.

### 35.4 Tick resolution order

For every authoritative tick, the server must resolve events in this order:

1. Apply room lifecycle transitions scheduled for the tick.
2. Apply accepted inputs grouped by player join order, then input sequence.
3. Advance gravity and lock timers for each active player.
4. Resolve locks, line clears, scoring, and outgoing attacks.
5. Cancel incoming garbage and enqueue remaining attacks.
6. Retarget delayed attacks whose target is no longer valid.
7. Apply ready garbage after the current piece resolution.
8. Resolve top-outs and disconnect expirations.
9. Resolve match completion and simultaneous final eliminations.
10. Increment or finalize the tick state.

Players eliminated on one tick are resolved as a group. Stable player join order
is used only where a deterministic iteration order is otherwise required.

### 35.5 Snapshot lifecycle

- `room_snapshot.phase` is authoritative for lobby, countdown, playing, and
  finished states.
- `match_started` announces the match identifier, seed, and authoritative start
  tick; it does not replace snapshots as the source of current state.
- Finished snapshots contain winner, draw, placement, and match statistics.
- Returning to the lobby clears match-only fields and sets every connected
  player to unready.

### 35.6 Reconnection phases

- A session may reconnect during lobby, countdown, or playing while its grace
  period is active.
- Reconnection during finished state restores room visibility but never resumes
  gameplay.
- An invalid or expired token returns `INVALID_RECONNECT_TOKEN` without
  revealing whether another session or token exists.

### 35.7 Test-only controls

- Deterministic board fixtures may be injected only through test-created room or
  server objects.
- Production HTTP routes, WebSocket messages, and builds must not register or
  expose fixture injection controls.
- End-to-end tests may use an isolated deterministic test configuration, but it
  must not change production authority or protocol behavior.
