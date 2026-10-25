# AGENTS.md

## Project docs

Read before changing code:

- `docs/concept.md` — vision, decisions, phases, AI contracts, data model
- `docs/conventions.md` — rules for changes, definition of done
- `docs/architecture.md` — packages, boundaries, layers
- `docs/testing.md` — what and how to test

## Public repo

This repo is public. Never put secrets, tokens, Cloudflare AUD/team domain, e-mail addresses or other personal data in issues, comments, code or docs. Self-hosted runners are used only by the deploy workflow, on `push` to `master` or a manual `workflow_dispatch` of `master`, never by workflows that run on pull requests.

## Worktree agents

Implementing a ticket in its own worktree (e.g. an `/implement-spec` implementer): follow `docs/agents/worktrees.md`.

## Agent skills

### Issue tracker

Issues live in GitHub Issues for `yordanalexandrov/family` (via the `gh` CLI). See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
