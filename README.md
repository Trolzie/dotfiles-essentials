# Dotfiles Essentials

Minimal, public-safe GNU Stow dotfiles for macOS Apple Silicon.

This repo is my portable baseline for getting a fresh Mac into a familiar working state quickly: shell, terminal, Git, tmux, keyboard remaps, AI coding assistants, package installs, and macOS defaults.

## What I use this for

- **New machine bootstrap** — `setup.sh` installs prerequisites, applies macOS defaults, installs Node.js via nvm, installs Claude Code, then runs `sync.sh`.
- **Package management** — `Brewfile` installs core CLI tools, terminal apps, fonts, AI tooling, and productivity apps with Homebrew.
- **Symlinked config management** — GNU Stow maps package directories in this repo into `$HOME`.
- **Shell environment** — zsh, oh-my-zsh, Powerlevel10k, aliases, exports, and shared shell helpers.
- **Git defaults** — global Git config, ignores, signing identity, and GitHub SSH URL rewriting.
- **Terminal workflow** — tmux config, sessionizer script, Ghostty/font setup, and fzf/ripgrep/jq/lazygit tooling.
- **Keyboard workflow** — Karabiner Elements config for Caps Lock → Meh key remapping.
- **AI coding assistants** — Claude Code settings/statusline and pi coding-agent extensions.
- **macOS preferences** — keyboard repeat, Finder/Dock preferences, trackpad behavior, locale, screenshots, and other defaults.
- **Safe secret handling** — secrets live in `~/.secrets` or tool-specific runtime files, never in Git.

## New Machine Setup

```bash
# 1. Install Homebrew (also installs Xcode CLT)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
eval "$(/opt/homebrew/bin/brew shellenv)"

# 2. Authenticate with GitHub (browser-based, no password needed)
brew install gh
gh auth login

# 3. Clone and run setup
gh repo clone Trolzie/dotfiles-essentials ~/dotfiles
cd ~/dotfiles
./setup.sh
```

`setup.sh` handles first-time setup: Homebrew, SSH keys, oh-my-zsh + plugins + Powerlevel10k, macOS defaults, Node.js via nvm, Claude Code, brew packages, and Stow symlinks. Already-installed tools are skipped. The remote is switched to SSH automatically after key setup.

After restart, run:

```bash
p10k configure
```

## Syncing Between Machines

Configs are symlinked into `~/dotfiles` via Stow, so edits to stowed files go straight to the repo.

```bash
# On machine you edited configs on:
cd ~/dotfiles
git add -A && git commit -m "update dotfiles" && git push

# On other machine — pull and sync:
cd ~/dotfiles && git pull
./sync.sh
```

`sync.sh` pulls latest changes, runs `brew bundle`, stows all packages, restores adopted repo files, and pushes any intentional repo changes.

## Structure

| Package/File | Purpose |
|--------------|---------|
| `Brewfile` | Homebrew taps, formulae, casks, fonts, and apps |
| `setup.sh` | First-time machine bootstrap |
| `sync.sh` | Ongoing brew + Stow sync |
| `git/` | `.gitconfig`, `.gitignore_global` |
| `zsh/` | `.zshrc`, `.zprofile` |
| `shell/` | `.aliases` |
| `bin/` | Personal helper scripts, including `tmux-sessionizer` |
| `karabiner/` | Caps Lock → Meh key remap |
| `tmux/` | tmux configuration and plugin setup |
| `claude/` | Claude Code settings + statusline |
| `pi/` | pi coding-agent extensions |
| `AGENTS.md` | Instructions for coding agents working in this repo |
| `CLAUDE.md` | Same repo instructions for Claude Code |

## AI tooling

### Claude Code

The `claude/` package stows Claude settings and a statusline script into `~/.claude/`.

### pi

The `pi/` package stows global pi extensions into `~/.pi/agent/extensions/`:

- `custom-footer.ts` — compact footer with repo, branch, session, model, thinking level, topic, totals, context, and usage windows.
- `subscription-status.ts` — provider/account status, OAuth/API-key indicator, context bar, and `/sub-label` + `/sub-refresh`.
- `tab-topic.ts` — auto-generates a short session topic, stores it as the session name, and updates terminal/tmux title. Adds `/topic`.

Runtime pi files are intentionally not tracked:

- `~/.pi/agent/auth.json`
- `~/.pi/agent/subscription-cache.json`
- `~/.pi/agent/sessions/`

## Adding Packages

```bash
mkdir ~/dotfiles/newpkg
# Add files mirroring $HOME structure
stow -d ~/dotfiles -t ~ newpkg
# Add to PACKAGES array in sync.sh
```

When adding a package, also update:

- `README.md` — document what it is for.
- `sync.sh` — add it to `PACKAGES` if it should be stowed.
- `.gitignore` — ignore generated files, caches, backups, and secrets.

## Secrets and public-safety rules

This repo is public, so do not commit credentials or machine-local runtime state.

`~/.secrets` is sourced by `.zshrc` but not tracked. Format:

```bash
export KEY=value
```

Before committing, check for secrets:

```bash
rg -n -i '(ghp_|github_pat_|sk-[A-Za-z0-9]|BEGIN .*PRIVATE KEY|GH_TOKEN=|API_KEY=|TOKEN=|PASSWORD=)' . --glob '!/.git/**'
git status --short
```

Never track:

- API keys, OAuth tokens, passwords, private keys, recovery codes, or session cookies.
- `~/.secrets`, `.env*`, `auth.json`, caches, logs, local sessions, or app backup directories.
- Machine-specific generated state unless intentionally sanitized and documented.
