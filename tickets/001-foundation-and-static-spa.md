# 001: Foundation and Static SPA

## Goal

Create the Bun, TypeScript, SvelteKit, and verification foundation for the
single-process application.

## Scope

- Scaffold SvelteKit with Svelte 5 and `@sveltejs/adapter-static`.
- Add strict TypeScript configuration and repository scripts.
- Add Bun lockfile and supported package-manager version.
- Add the `/health` route.
- Add static SPA fallback and root route.
- Replace obsolete README WebRTC architecture documentation.

## Acceptance Criteria

- `bun install --frozen-lockfile` succeeds.
- `bun run typecheck`, `bun run check`, `bun run build`, and `bun test` succeed.
- `/health` returns `{ "status": "ok" }`.
- The production artifact contains static client assets and no WebRTC code.
- No database, external service, or runtime secret is introduced.

## Dependencies

- None.
