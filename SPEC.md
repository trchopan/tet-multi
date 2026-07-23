# SPEC.md

## Project Title

Peer-to-Peer Multiplayer Tetris for the Web

## 1. Objective

Build a browser-based multiplayer Tetris game for up to six players. The application is deployed as a static website only. It must not require a custom backend, hosted database, signaling server, Firebase, or managed game service.

Players connect directly using WebRTC DataChannels. One browser acts as the leader and authoritative game engine. The leader creates a unique WebRTC offer for each joining player and shares it through an external messaging channel such as Slack, Discord, Messenger, email, or another chat application. Each player returns an answer string through the same channel.

The game displays all participants simultaneously in a responsive six-board layout.

## 2. Core Constraints

- Maximum of six players.
- One leader and up to five guests.
- Static hosting only.
- No custom backend.
- No Firebase, Supabase, hosted database, or signaling service.
- No QR-code workflow.
- WebRTC signaling is manual through copyable text payloads.
- Each guest receives a unique WebRTC offer.
- The leader is the authoritative simulation host.
- WebRTC DataChannels carry all gameplay traffic after connection setup.
- Public STUN may be used.
- TURN is not required for the initial implementation.
- If a direct connection cannot be established without TURN, the player must receive a clear error.
- Leader disconnection ends the active match in version one.

## 3. Recommended Stack

### Frontend

- TypeScript
- Vite
- React
- HTML Canvas 2D for board rendering
- CSS Grid for the six-board layout
- Web Workers for the leader simulation loop if practical
- Native WebRTC APIs

### Testing

- Vitest for unit tests
- Playwright for browser integration and multiplayer setup flows

### Optional Libraries

Use only when they materially simplify the implementation.

- `pako` or `fflate` for signaling-payload compression
- `zod` for runtime message validation
- `nanoid` for local identifiers

Avoid introducing a multiplayer framework, game server framework, or state-management library unless clearly justified.

## 4. Product Experience

### 4.1 Home Screen

The home screen has two primary actions:

- Create Room
- Join Room

It may also include:

- Display-name input
- Controls/settings link
- Audio toggle
- About/connectivity explanation

### 4.2 Leader Room Setup

After selecting Create Room, the leader enters a lobby.

The lobby provides five guest slots:

```text
Slot 2: Empty
Slot 3: Empty
Slot 4: Empty
Slot 5: Empty
Slot 6: Empty
```

Each slot supports:

- Create Invite
- Copy Offer
- Paste Answer
- Connect
- Cancel/Reset Slot
- Connection status
- Guest display name after handshake
- Ping after connection

Expected slot states:

```text
EMPTY
CREATING_OFFER
WAITING_FOR_ANSWER
CONNECTING
CONNECTED
FAILED
CLOSED
```

A separate `RTCPeerConnection` must be created for every guest slot. Offers must never be reused across players.

### 4.3 Guest Join Flow

The guest selects Join Room and sees:

- Display-name field
- Offer input area
- Join/Create Answer button
- Copy Answer button
- Connection status

Flow:

1. Guest pastes the leader's offer.
2. Browser validates and decodes the offer.
3. Browser creates a peer connection.
4. Browser sets the remote description.
5. Browser creates and gathers a complete non-trickle ICE answer.
6. Browser displays a copyable answer string.
7. Guest sends the answer to the leader through an external chat application.
8. Leader pastes the answer into the corresponding slot.
9. WebRTC DataChannel opens.
10. Guest joins the lobby.

### 4.4 Lobby

The lobby displays:

- All connected players
- Ready state
- Leader badge
- Connection quality or ping
- Room status
- Start Match button available only to the leader

The leader may start when at least two players are connected and ready.

Recommended initial behavior:

- Leader is automatically ready.
- Guests explicitly toggle Ready.
- Joining is disabled once a match starts.
- Rejoining during an active match is not required in version one.

### 4.5 Match Layout

Desktop default:

```text
+----------------+----------------+----------------+
| Player 1       | Player 2       | Player 3       |
| Board          | Board          | Board          |
+----------------+----------------+----------------+
| Player 4       | Player 5       | Player 6       |
| Board          | Board          | Board          |
+----------------+----------------+----------------+
```

Requirements:

- Use CSS Grid.
- Support between two and six players.
- Empty slots are hidden after match start.
- The local player's board is visually emphasized.
- Remote boards remain fully visible.
- Layout adapts to smaller screens.
- A two-column by three-row layout is acceptable on narrow screens.
- Each board includes player name, status, pending garbage, and elimination state.

## 5. Game Rules

Implement a modern guideline-inspired Tetris ruleset. Exact visual branding must not copy protected Tetris assets.

### 5.1 Board

- Width: 10 cells
- Visible height: 20 cells
- Hidden spawn rows: at least 2

### 5.2 Pieces

- Seven tetrominoes
- Seven-bag randomizer
- Shared deterministic piece sequence generated by the leader
- Next queue with at least five visible pieces
- Hold piece
- One hold per active piece

### 5.3 Movement

- Left
- Right
- Soft drop
- Hard drop
- Rotate clockwise
- Rotate counterclockwise
- Hold

### 5.4 Rotation

Implement Super Rotation System behavior or a compatible documented equivalent.

### 5.5 Timing

- Fixed-step simulation
- Recommended simulation rate: 60 ticks per second
- Rendering is decoupled from simulation
- Gravity increases over time or level
- Configurable DAS and ARR are optional for version one

### 5.6 Line Clears and Attacks

Minimum supported attacks:

- Single
- Double
- Triple
- Tetris
- T-spin single
- T-spin double
- T-spin triple if implemented correctly
- Back-to-back bonus
- Combo bonus

Document the attack table in code and tests.

### 5.7 Garbage

- Garbage is generated by the authoritative leader.
- Garbage attacks are queued before application.
- Garbage cancellation is supported.
- Garbage has one hole per row.
- Hole selection is controlled by the leader.
- Garbage is applied after a configurable delay or on piece lock.
- Clients must never decide their own received garbage.

### 5.8 Targeting

Initial target mode:

- Random active opponent

Optional future modes:

- Manual target
- Attackers
- Badges
- Knockout priority

### 5.9 Elimination and Winner

- A player is eliminated when a new piece cannot spawn or locks above the valid board area.
- Eliminated players remain visible as spectators.
- The last non-eliminated player wins.
- The leader broadcasts the final result.

## 6. Authority Model

The leader owns the canonical game state for all players.

The leader is responsible for:

- Match clock
- Simulation tick
- Piece sequence
- Input ordering
- Movement validation
- Piece locking
- Rotation validation
- Line detection
- Attack calculation
- Garbage routing and application
- Elimination
- Winner determination
- Canonical snapshots

Guests must not send authoritative board state, score, line clears, attacks, or elimination results.

Guests send only player intent and protocol-level messages.

## 7. Client Prediction

Local input should feel immediate.

Guest behavior:

1. Apply local movement prediction for the local active piece.
2. Assign each input a monotonically increasing sequence number.
3. Send the input to the leader.
4. Retain unacknowledged inputs.
5. Receive authoritative state and latest acknowledged input sequence.
6. Replace local state with authoritative state.
7. Reapply remaining unacknowledged inputs when valid.

The leader remains authoritative for:

- Piece locks
- Line clears
- Garbage
- Spawn state
- Elimination

For version one, a simplified prediction model is acceptable:

- Predict horizontal motion, rotation, soft drop, and hard-drop animation.
- Accept authoritative correction on every lock.
- Do not allow guest-predicted line clears or garbage.

## 8. Network Topology

Use a WebRTC star topology.

```text
Guest 2 ----\
Guest 3 -----\
Guest 4 ------ Leader
Guest 5 -----/
Guest 6 ----/
```

Connections:

- Leader: up to five peer connections
- Guest: one peer connection

The leader relays canonical updates to all guests.

No guest-to-guest peer connections are required.

## 9. Manual Signaling

### 9.1 Non-Trickle ICE

Manual signaling must use non-trickle ICE.

Before producing a copyable offer or answer:

- Set local description.
- Wait until `iceGatheringState` is `complete`.
- Include gathered ICE candidates in the SDP payload.

This keeps the exchange to one offer string and one answer string per connection.

### 9.2 Payload Format

Use a versioned envelope.

```ts
interface SignalingPayload {
  protocol: "p2p-tetris-signaling";
  version: 1;
  roomId: string;
  slotId: string;
  peerId: string;
  role: "offer" | "answer";
  createdAt: number;
  description: RTCSessionDescriptionInit;
}
```

Requirements:

- Serialize as JSON.
- Compress before encoding when beneficial.
- Encode using base64url.
- Prefix with a recognizable marker such as `PT1.`.
- Validate protocol, version, role, and required fields before use.
- Reject malformed or unsupported payloads.
- Do not execute or evaluate payload content.

Example shape:

```text
PT1.<base64url-compressed-payload>
```

### 9.3 Offer Lifecycle

Each offer:

- Belongs to exactly one leader slot.
- Is used by one guest only.
- Expires locally after a configurable timeout.
- Can be reset by the leader.
- Must not be reused after a failed or closed connection unless the peer connection is fully recreated.

## 10. WebRTC Configuration

Initial configuration:

```ts
const config: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" }
  ]
};
```

The STUN list must be isolated in configuration so it can be changed later.

The UI must explain:

- Direct peer connectivity is not guaranteed.
- Some corporate, mobile, or restrictive networks require TURN.
- This version intentionally does not provide TURN.

## 11. DataChannels

Version one may use a single reliable ordered DataChannel per guest.

```ts
pc.createDataChannel("game", {
  ordered: true
});
```

The protocol must be designed so a second channel can be added later.

Potential future split:

- `events`: reliable and ordered
- `state`: unordered with limited retransmission

## 12. Wire Protocol

All messages must use a versioned envelope.

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

Runtime validation is required for every received message.

### 12.1 Lobby Messages

- `hello`
- `welcome`
- `player_joined`
- `player_left`
- `ready_changed`
- `lobby_state`
- `start_match`
- `connection_ping`
- `connection_pong`
- `protocol_error`

### 12.2 Gameplay Messages

Guest to leader:

- `input`
- `snapshot_request`
- `ping`
- `client_status`

Leader to guest:

- `match_initialized`
- `authoritative_player_state`
- `board_delta`
- `full_snapshot`
- `piece_locked`
- `lines_cleared`
- `garbage_queued`
- `garbage_applied`
- `player_eliminated`
- `match_ended`
- `pause_state`
- `pong`
- `protocol_error`

### 12.3 Input Message

```ts
interface InputPayload {
  playerId: string;
  inputSequence: number;
  clientTick: number;
  action:
    | "left_down"
    | "left_up"
    | "right_down"
    | "right_up"
    | "soft_drop_down"
    | "soft_drop_up"
    | "hard_drop"
    | "rotate_cw"
    | "rotate_ccw"
    | "hold";
}
```

### 12.4 Snapshot

A full snapshot contains enough data for a client to reconstruct the entire match:

- Match ID
- Leader tick
- Match status
- Player order
- Piece-sequence position
- Per-player board
- Active piece
- Hold piece
- Next queue
- Score
- Lines
- Combo
- Back-to-back state
- Pending garbage
- Elimination state
- Latest acknowledged input sequence
- Winner if match ended

## 13. State Synchronization

The leader sends updates:

- Immediately for important state transitions
- At a regular lightweight update interval during active play
- As a complete snapshot periodically

Recommended values:

- Simulation: 60 Hz
- Player-state updates: 15-30 Hz
- Full snapshot: every 1-2 seconds
- Ping: every 2-5 seconds

Every canonical state must include:

- Leader tick
- Revision number
- Latest acknowledged input sequence per player

Clients must request a full snapshot when:

- Revision gaps are detected
- Validation fails
- A delta cannot be applied
- A local checksum differs from the leader checksum

## 14. Determinism

The leader is authoritative, so perfect cross-browser determinism is not mandatory for correctness. However, the simulation should still be deterministic under identical inputs for testing.

Requirements:

- Avoid `Math.random()` inside the game engine.
- Use an explicit seeded PRNG.
- Keep game-engine logic free of DOM dependencies.
- Represent simulation time using integer ticks.
- Avoid frame-duration-dependent movement.

## 15. Rendering

Use Canvas 2D.

Each board renderer supports:

- Settled blocks
- Active piece
- Ghost piece
- Garbage indicator
- Line-clear animation
- Player name
- Ready/alive/eliminated state
- Connection-lost overlay

Rendering requirements:

- The local board is highlighted.
- Canvas scales cleanly with device pixel ratio.
- Rendering does not mutate game state.
- Remote boards may use lower animation detail if performance requires it.
- Six active boards must remain smooth on a typical modern laptop.

## 16. Input

Default keyboard mapping:

| Action | Key |
|---|---|
| Move left | ArrowLeft |
| Move right | ArrowRight |
| Soft drop | ArrowDown |
| Hard drop | Space |
| Rotate clockwise | ArrowUp or X |
| Rotate counterclockwise | Z |
| Hold | C or Shift |
| Pause request | Escape |

Requirements:

- Prevent browser scrolling for active game controls.
- Ignore repeated one-shot actions where appropriate.
- Track keydown and keyup for held movement.
- Allow remapping as a future extension.

## 17. Match Lifecycle

```text
HOME
  -> LEADER_LOBBY or GUEST_SIGNALING
  -> CONNECTED_LOBBY
  -> COUNTDOWN
  -> PLAYING
  -> FINISHED
  -> REMATCH_LOBBY or HOME
```

Leader-only transitions:

- Start match
- Pause match
- Resume match
- End match
- Start rematch

If the leader tab becomes hidden during an active match:

- Detect `visibilitychange`.
- Pause the authoritative simulation.
- Broadcast the pause state.
- Show a clear reason.

## 18. Failure Handling

### 18.1 Guest Disconnect

- Leader marks the guest disconnected.
- During lobby: remove or allow slot reset.
- During match: eliminate or forfeit the guest after a short grace period.
- Broadcast the result.

### 18.2 Leader Disconnect

Version-one behavior:

- All guests detect DataChannel closure.
- Match ends immediately.
- Display `Leader disconnected`.
- Return to the home screen or preserve final local state for review.

No automatic leader migration is required.

### 18.3 Signaling Errors

Provide specific messages for:

- Invalid payload
- Wrong payload role
- Unsupported version
- Expired invite
- Slot mismatch
- ICE failure
- Connection timeout
- DataChannel failure
- Duplicate answer

### 18.4 Protocol Errors

- Reject invalid messages.
- Do not crash the match.
- Rate-limit repeated protocol errors.
- Disconnect peers sending persistently invalid data.

## 19. Security Model

This is a casual peer-hosted game, not a cheat-proof ranked platform.

Security requirements:

- Treat all guest messages as untrusted.
- Validate message shape and ranges.
- Limit message size.
- Limit message rate.
- Never use `eval`, dynamic function construction, or HTML injection.
- Sanitize display names.
- Do not trust guest-reported score, board, line clear, or attack values.
- Leader validates all inputs against canonical state.
- Use cryptographically random local IDs where practical.
- Do not persist signaling payloads or game state unless explicitly added later.

Privacy note:

- WebRTC peer connections may reveal network-related metadata to peers depending on browser behavior and network setup.
- Document that the leader establishes a direct connection with each guest.

## 20. Accessibility

Minimum requirements:

- Keyboard-operable lobby and signaling controls
- Visible focus indicators
- Sufficient contrast
- Text status for connection and ready state
- Reduced-motion support for nonessential effects
- Screen-reader labels for buttons and signaling fields

Gameplay itself may be primarily visual, but setup and status flows must be accessible.

## 21. Persistence

Use local storage only for non-sensitive preferences:

- Display name
- Volume
- Control preferences
- Visual settings

Do not store:

- Offers
- Answers
- Peer connection details
- Active match snapshots

unless explicitly required for debugging behind a development-only flag.

## 22. Suggested Module Structure

```text
src/
  app/
    App.tsx
    routes.ts
  ui/
    HomeScreen.tsx
    LeaderLobby.tsx
    GuestJoin.tsx
    ConnectedLobby.tsx
    MatchScreen.tsx
    PlayerBoard.tsx
    ConnectionSlot.tsx
  game/
    engine.ts
    board.ts
    pieces.ts
    rotation.ts
    randomizer.ts
    scoring.ts
    garbage.ts
    targeting.ts
    types.ts
    constants.ts
  network/
    peer.ts
    leaderNetwork.ts
    guestNetwork.ts
    signalingCodec.ts
    ice.ts
    protocol.ts
    protocolValidation.ts
    connectionState.ts
  simulation/
    leaderSimulation.ts
    prediction.ts
    reconciliation.ts
    snapshots.ts
  render/
    canvasRenderer.ts
    boardLayout.ts
    animation.ts
  input/
    keyboard.ts
    bindings.ts
  state/
    appState.ts
    lobbyState.ts
    matchState.ts
  workers/
    leader.worker.ts
  utils/
    ids.ts
    clock.ts
    assertions.ts
    logging.ts
  tests/
```

The game engine and protocol types must not depend on React.

## 23. Testing Requirements

### 23.1 Unit Tests

Cover:

- Seven-bag generation
- Seed reproducibility
- Collision detection
- Piece movement
- Rotation and wall kicks
- Piece locking
- Line detection and clearing
- Hold behavior
- Spawn collision
- Attack calculation
- Garbage cancellation
- Garbage application
- Elimination
- Target selection
- Input sequencing
- Reconciliation
- Snapshot serialization
- Signaling codec round-trip
- Message validation

### 23.2 Integration Tests

Cover:

- Leader creates offer
- Guest creates answer
- Leader accepts answer
- DataChannel opens
- Lobby handshake completes
- Ready state syncs
- Match starts
- Guest input reaches leader
- Leader state reaches all guests
- Player elimination broadcasts
- Leader disconnect ends match

Where browser automation cannot use real external network paths reliably, use two or more browser contexts on the same machine.

### 23.3 Performance Tests

Validate:

- Six boards render smoothly.
- Leader can simulate six players at 60 ticks per second.
- Snapshot encoding remains small and fast.
- Message processing does not grow without bounds.
- No unbounded queues exist.

## 24. Development Diagnostics

Development-only diagnostics should include:

- Peer connection state
- ICE connection state
- ICE gathering state
- DataChannel state
- Ping
- Message counts
- Bytes sent/received
- Leader tick
- State revision
- Last acknowledged input
- Snapshot requests
- Protocol errors

Diagnostics must be easy to disable in production.

## 25. Deployment

The application must build to static assets.

Supported deployment targets include:

- GitHub Pages
- Cloudflare Pages
- Netlify static hosting
- Vercel static output

Requirements:

- HTTPS is mandatory for production WebRTC usage.
- No server-side rendering dependency.
- No runtime server functions.
- No secret environment variables required.
- STUN configuration may be supplied at build time through a public configuration value.

## 26. Acceptance Criteria

The project is complete when all of the following are true:

1. A leader can create five independent connection offers.
2. A guest can paste an offer and generate a single answer string.
3. A leader can paste the answer and establish a WebRTC DataChannel.
4. Up to five guests can connect to one leader simultaneously.
5. All connected players appear in a lobby.
6. Ready state synchronizes through the leader.
7. The leader can start a match with two to six players.
8. Each player can control only their own piece.
9. The leader authoritatively simulates all boards.
10. All clients display all active boards in real time.
11. Piece locks, line clears, garbage, elimination, and winner state are leader-authoritative.
12. Local controls remain responsive through prediction.
13. Authoritative corrections reconcile without breaking the match.
14. Periodic snapshots recover from missed or invalid deltas.
15. Leader disconnect ends the match with a clear message.
16. A failed direct WebRTC connection produces an actionable error.
17. The application runs from static hosting without a custom backend.
18. Core game-engine and signaling modules have automated tests.

## 27. Out of Scope for Version One

- Hosted matchmaking
- Accounts
- Ranked play
- Persistent statistics
- Spectators who join after match start
- Automatic leader migration
- TURN service
- Voice chat
- Mobile touch controls
- Public room directory
- Anti-cheat guarantees against a malicious leader
- Reconnection into an active match
- Cross-room chat

## 28. Future Extensions

- Optional TURN configuration
- Automated signaling through an optional service
- Leader migration using pre-established peer mesh
- Spectator mode
- Replay files
- Touch controls
- Gamepad support
- Custom rule presets
- Ranked server-authoritative mode
- Voice chat
- Public/private room codes
- Tournament brackets
