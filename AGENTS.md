# Agent Instructions

This is a public dotfiles repo. Treat safety and documentation as part of every change.

## Required habits

- Keep `README.md` up to date whenever you add, remove, rename, or materially change a package, script, tool, setup step, dependency, or workflow.
- Keep `sync.sh` `PACKAGES` in sync with stowed package directories.
- Keep `.gitignore` in sync with generated files, caches, backups, sessions, and local-only state.
- Prefer small, targeted commits. Do not include unrelated local changes unless explicitly asked.

## Secret safety

Never commit secrets or runtime credentials. This includes:

- API keys, OAuth tokens, GitHub tokens, passwords, private keys, recovery codes, session cookies.
- `~/.secrets`, `.env*`, `auth.json`, `subscription-cache.json`, logs, sessions, caches, and generated app backups.
- Any value matching common token prefixes such as `ghp_`, `github_pat_`, `sk-`, or private-key blocks.

`~/.secrets` is intentionally local and sourced by `zsh/.zshrc`. If a secret is needed, instruct the user to place it there; do not add it to the repo.

Before committing or making public-safety claims, run a secret scan such as:

```bash
rg -n -i '(ghp_|github_pat_|sk-[A-Za-z0-9]|BEGIN .*PRIVATE KEY|GH_TOKEN=|API_KEY=|TOKEN=|PASSWORD=)' . --glob '!/.git/**'
git status --short
```

If a secret is found, remove it from the repo/worktree, ensure it is ignored, and tell the user to rotate it if it may have been exposed.

## Stow conventions

Packages mirror `$HOME` paths. For example:

- `zsh/.zshrc` -> `~/.zshrc`
- `pi/.pi/agent/extensions/*.ts` -> `~/.pi/agent/extensions/*.ts`
- `claude/.claude/settings.json` -> `~/.claude/settings.json`

When adding a new stowed package:

1. Create a top-level package directory.
2. Mirror the desired `$HOME` path inside it.
3. Add the package name to `PACKAGES` in `sync.sh`.
4. Document it in `README.md`.
5. Add ignores for generated/local files.

## Public repo mindset

Assume every tracked file and every commit pushed to GitHub is public. Avoid adding personal machine state unless it is intentional, useful, sanitized, and documented.
