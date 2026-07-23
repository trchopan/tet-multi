# Contributing

## Workflow

1. Start from an up-to-date `main` branch.
2. Create a focused branch for each change.
3. Keep the worktree scoped to the requested change.
4. Run the relevant checks before committing.
5. Open a pull request against `main`.

## Branch Names

Use lowercase, short, hyphen-separated names with a category prefix:

- `feat/<short-description>` for user-facing features
- `fix/<short-description>` for bug fixes
- `chore/<short-description>` for tooling, maintenance, or documentation
- `test/<short-description>` for test-only changes
- `refactor/<short-description>` for behavior-preserving code changes

Example: `chore/layout-screenshot-harness`

## Commits

Use an imperative, conventional-commit style subject:

```text
<type>: <short description>
```

Keep the subject concise and describe the user-visible or engineering change.
Do not include generated screenshots, build output, secrets, or local environment
files in commits.

Examples:

- `feat: add room readiness state`
- `fix: reject stale input sequences`
- `chore: add multiplayer layout screenshot harness`

## Pull Requests

Use the same conventional-commit subject as the PR title. The body should include:

- A concise summary of the change
- Important implementation or compatibility notes
- Exact verification commands and outcomes
- Known limitations, warnings, or follow-up work

Keep pull requests focused. Separate unrelated refactors or formatting changes
into another pull request.

## Verification

Run the smallest relevant checks during development. Before requesting review,
run the full repository gate:

```bash
bun run verify
```

For layout screenshot changes, also run:

```bash
bun run screenshots
```

Generated screenshots and reports are written to `local/screenshots` and are
ignored by Git. Do not commit them unless a task explicitly requires versioned
visual fixtures.

## Review Expectations

- Preserve the architecture and authority boundaries in `AGENTS.md` and `SPEC.md`.
- Add or update tests with behavior changes.
- Treat client input and protocol data as untrusted.
- Keep deterministic game behavior independent of UI and network APIs.
- Report failed checks accurately; do not claim unexecuted tests passed.
