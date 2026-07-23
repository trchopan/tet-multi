---
description: Conclude and hand off the current ticket
agent: build
---
Conclude the current work and ready for handoff.

Run the repository's formatting, type-checking, and test commands. Inspect the final diff against the ticket acceptance criteria, `SPEC.md`, and `AGENTS.md`. Mark done for the ticket checklist.

Commit the completed ticket autonomously after verification. Before committing, inspect
the working tree and stage only files changed for this ticket. Do not stage secrets,
captured SDP payloads, environment files, generated artifacts, or unrelated user changes.
Use a concise commit message that explains the ticket outcome. If verification fails,
fix the issue before committing; do not create a knowingly failing commit.

Report:

- Files changed
- Acceptance criteria satisfied
- Verification commands and results
- Remaining risks or follow-up work
