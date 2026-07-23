# Neon Drop

Neon Drop is a browser-based falling-block game built as one Bun process with
a static SvelteKit client. The multiplayer server and deterministic game
engine are being added incrementally; this foundation currently serves the
static application shell and health endpoint.

## Setup

Requirements:

- Bun 1.3.5 or newer

Install dependencies and run the checks:

```bash
bun install --frozen-lockfile
bun run verify
```

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

The production build uses SvelteKit's static adapter with `index.html` as the
SPA fallback. The Bun server serves that artifact, applies cache policy, and
reserves `/ws` for the later native WebSocket implementation.

## Implementation Decisions

- The foundation uses a small Bun HTTP handler instead of an additional HTTP
  framework, preserving the single-process deployment required by `SPEC.md`.
- The health response is implemented in both the development SvelteKit route
  and the production Bun handler so `/health` works in either mode. The Bun
  handler is authoritative in production.
- WebSocket, protocol, game engine, and gameplay UI behavior are intentionally
  deferred to their dependent tickets.

## Current Limitations

The current phase does not yet include rooms, WebSockets, gameplay, keyboard
controls, or Canvas rendering.

Browser-based E2E tests are deferred to ticket 012; `bun run test:e2e` exits
successfully with that status until those tests are introduced.
