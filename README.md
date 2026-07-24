# tet-multi

tet-multi is a browser-based falling-block game built as one Bun process with
a static SvelteKit client. The multiplayer server and deterministic game
engine run in one deployable process. The client supports room creation, lobby
flow, authoritative multiplayer snapshots, reconnection, prediction, and match
results.

Play the live demo at [tet.chop.dev](https://tet.chop.dev) or view the project on
[GitHub](https://github.com/trchopan/tet-multi).

## Setup

Requirements:

- Bun 1.3.5 or newer

Install dependencies and run the checks:

```bash
bun install --frozen-lockfile
bun run verify
```

Run the browser suite independently with:

```bash
bun run test:e2e
```

Capture the multiplayer layout at mobile and desktop sizes for 2–5 players:

```bash
bun run screenshots
```

Images are written to `local/screenshots` using the `players-{count}-{viewport}.png`
name pattern. The same directory receives `overflow-report.json`, which records
document dimensions, horizontal and vertical overflow, local-canvas visibility,
and elements extending beyond either viewport edge.
Screenshot runs start a fresh test server rather than reusing an existing process.

The first run may require `bunx playwright install chromium`.

Build and run the production artifact:

```bash
bun run build
bun run start
```

The server listens on `http://localhost:3000` by default. `PORT`, `HOST`, and
`STATIC_ROOT` may be set for local deployment. `GET /health` returns the
process liveness response `{ "status": "ok" }`.

Use `bun run dev` to start the Vite frontend and Bun server together. The
frontend is available at `http://localhost:5173` and proxies `/health` and
`/ws` to the Bun server on port `3000`.

## Repository Direction

- `src/routes` contains the static SvelteKit application shell.
- `src/server` contains the Bun HTTP boundary and will later own WebSockets.
- `src/game` will contain deterministic rules without browser or server APIs.
- `src/shared` will contain contracts shared by the client and server.
- `static` contains original static assets.

## Local Controls

Focus the game board, then use the following controls:

- Left / A and Right / D: move
- Down / S: soft drop
- Space / W: hard drop
- Up / X: rotate clockwise
- Z / Q: rotate counterclockwise
- C / Shift: hold

The production build uses SvelteKit's static adapter with `index.html` as the
SPA fallback. The Bun server serves that artifact and the native `/ws` room
lobby endpoint from one process.

Run the deterministic synthetic load check with:

```bash
bun run test:performance
```

It advances 50 five-player rooms for 600 fixed ticks in one Bun process, using
one human and four computer players per room to exercise the bot workload. The
check warns if average global tick work reaches 8 ms or aggregate traffic
exceeds the SPEC's approximate 400 KiB/s target, and fails if a five-player
snapshot reaches 20 KiB. Results are machine-dependent and printed as JSON.

An optional non-root container is available:

```bash
docker build -t tet-multi .
docker run --rm -p 3000:3000 -e ALLOWED_ORIGINS=http://localhost:3000 tet-multi
```

### Docker Compose Deployment

The included Compose file runs the app on port `3000`. Set
`PUBLIC_BASE_URL` and `ALLOWED_ORIGINS` to the public HTTPS origin used by your
deployment. The repository's live demo is [tet.chop.dev](https://tet.chop.dev),
and the source code is available on [GitHub](https://github.com/trchopan/tet-multi).

```bash
PUBLIC_BASE_URL=https://your-domain.example \
ALLOWED_ORIGINS=https://your-domain.example \
docker compose up -d --build
```

## Implementation Decisions

- The foundation uses a small Bun HTTP handler instead of an additional HTTP
  framework, preserving the single-process deployment required by `SPEC.md`.
- The health response is implemented in both the development SvelteKit route
  and the production Bun handler so `/health` works in either mode. The Bun
  handler is authoritative in production.
- Protocol contracts use Valibot schemas shared by the Bun server and browser
  client. Protocol version `1`, the 16 KiB inbound message limit, and the error
  code union are stable wire-contract values.
- Room codes are normalized to uppercase and display names are trimmed at the
  protocol boundary. Protocol timestamps use Unix epoch milliseconds, while
  simulation ticks remain separate authoritative integer counters.
- The game engine uses a 32-bit explicit-state PRNG. Each seven-bag stream is
  derived from the match seed and stable roster index, so player iteration and
  socket order cannot affect piece generation.
- Engine coordinates use the internal 10 x 24 board directly: rows 0-3 are
  hidden spawn rows and rows 4-23 are visible. Board serialization is a copied
  row-major number array, and engine hashes use canonical JSON with FNV-1a.
- SRS rotation uses standard JLSTZ and I kick tables, while O remains visually
  stable. The pure engine owns fixed-tick gravity, lock delay, hold, preview,
  line clearing, scoring, combo, back-to-back, T-spin, and perfect-clear state.
- Garbage packets use a 30-tick activation delay, FIFO cancellation, and one
  deterministic hole per packet. Pure match rules use an explicit room PRNG for
  target selection, retarget delayed attacks when needed, and assign stable
  elimination placements with same-tick draws.
- Local browser sessions create a seed with `crypto.randomUUID`; the engine
  remains deterministic for any explicit seed used by tests or future replays.
- The local client advances the engine at 60 fixed ticks per second with a
  250ms elapsed-time clamp. Canvas rendering displays only the 20 visible rows,
  while the four hidden spawn rows remain engine-only.
- Canvas sizing uses `ResizeObserver` and device-pixel-ratio backing dimensions.
  Browser listeners, observers, and animation frames are disposed when the
  board component unmounts.
- Room state is held in memory by `RoomManager`; room codes use the specified
  alphabet and reconnect tokens use 128 bits of cryptographic randomness.
- Matches are simulated by one process-wide fixed-timestep scheduler at 60 Hz.
  Each room owns one authoritative engine per player, accepts only sequenced
  actions, and broadcasts ordinary playing snapshots at 20 Hz.
- Room lifecycle tests use injected clocks, IDs, seeds, tokens, and sockets so
  countdowns, grace expiry, host migration, and cleanup remain deterministic.
- WebSocket upgrades reject unconfigured origins in production, and malformed
  or excessively frequent messages are closed without exposing server errors.
- Server configuration is parsed and validated once at startup. Production
  logs are structured JSON with token and address fields redacted; development
  logs remain readable. WebSocket upgrades use per-IP connection limits and
  room creation uses a separate sliding-window limit.
- Outbound snapshots use a bounded replaceable slot per socket while critical
  control messages are retained in a capped queue. Persistent congestion closes
  the client cleanly rather than allowing unbounded memory growth.
- The fixed scheduler reports excessive lag, and SIGINT/SIGTERM stop new joins,
  stop simulation, close active sockets, and stop the Bun server.
- Development WebSocket connections use the Vite-provided server port to connect
  directly to Bun instead of traversing Vite's WebSocket proxy. This avoids noisy
  proxy pipe errors when a browser reloads or closes a room connection.
- The multiplayer client keeps WebSocket/session state outside visual
  components, stores reconnect tokens by room code, retries transient
  disconnects with bounded exponential backoff, and uses authoritative
  snapshots for lobby, countdown, boards, and results. Local prediction is
  limited to active-piece movement and is rebuilt from acknowledged snapshots;
  scoring, garbage, and match outcomes remain server-owned. Opponent pieces
  interpolate between recent snapshots and snap for discrete events. Ping/pong
  samples provide informational latency and lowest-RTT clock-offset estimates.
- Computer players are server-owned lobby participants. The host can add up to
  four computers, counted within the five-player room capacity, and remove them
  before starting a match. Their deterministic rule-based controller evaluates
  legal placements on cloned engine states, selects among the strongest few,
  and submits delayed actions through the same authoritative room input queue.
- Active matches use a viewport-sized `100dvh` shell. The local board scales from
  available height, while mobile keeps opponent boards behind the existing toggle
  so the playable board and controls remain visible without page scrolling.
- Active gameplay prioritizes the local board with a hold rail, visual next-piece
  previews, compact live statistics, and a denser opponent rail. Connection state
  is shown in the match header and keyboard help is collapsed until requested.

## Current Limitations

- The performance harness measures deterministic room update and JSON snapshot
  work, not browser rendering FPS or physical-network bandwidth. Aggregate
  five-client snapshot traffic currently exceeds the approximate SPEC target and
  remains a documented optimization item.
- Docker image verification depends on Docker being installed in the execution
  environment.

## Release Verification

`bun run verify` performs formatting, type checks, Svelte checks, unit tests,
the production build, Playwright browser tests, and static production artifact
checks. Browser tests use two isolated contexts against the real Bun process
and cover create, join, ready, start, input propagation, reconnect, scripted
game completion, winner agreement, and host return-to-lobby.

The E2E completion path uses a deterministic test-only top-out fixture route
that is registered only under `NODE_ENV=test`; it is not part of the public
protocol and is unavailable in production.
