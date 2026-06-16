# Claude Code Instructions

This repo is public dotfiles. Follow the same rules as `AGENTS.md`.

## Always keep docs current

Update `README.md` whenever you add, remove, rename, or materially change a package, script, setup step, dependency, or workflow. If a new stowed package is added, also update `sync.sh` and the README structure table.

## Never expose secrets

Do not commit API keys, OAuth tokens, GitHub tokens, passwords, private keys, recovery codes, session cookies, `.env*`, `~/.secrets`, `auth.json`, caches, logs, sessions, or generated backup directories.

Before committing, scan for common secret patterns:

```bash
rg -n -i '(ghp_|github_pat_|sk-[A-Za-z0-9]|BEGIN .*PRIVATE KEY|GH_TOKEN=|API_KEY=|TOKEN=|PASSWORD=)' . --glob '!/.git/**'
git status --short
```

If a secret is found, remove it, make sure it is ignored, and tell the user to rotate it if it may have been exposed.

## Keep changes focused

Avoid committing unrelated local changes. Prefer targeted edits and small commits.
