# Dotfiles

Minimal GNU Stow dotfiles for macOS (Apple Silicon).

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

`setup.sh` handles everything: SSH key generation, brew packages, oh-my-zsh + plugins + Powerlevel10k, symlinks, macOS defaults, and Node.js. Already-installed tools are skipped. The remote is switched to SSH automatically after key setup.

After restart, run `p10k configure` to set up your prompt.

## Syncing Between Machines

Configs are symlinked into `~/dotfiles` via Stow, so edits go straight to the repo.

```bash
# On machine you edited configs on:
cd ~/dotfiles
git add -A && git commit -m "update aliases" && git push

# On other machine — pull updates (symlinks auto-update):
cd ~/dotfiles && git pull

# If new stow packages were added, also run:
./setup.sh
```

## Structure

| Package | Contents |
|---------|----------|
| `git/` | `.gitconfig`, `.gitignore_global` |
| `zsh/` | `.zshrc`, `.zprofile` |
| `shell/` | `.aliases` |
| `karabiner/` | Caps Lock → Meh Key remap |

## Adding Packages

```bash
mkdir ~/dotfiles/newpkg
# Add files mirroring $HOME structure
stow -d ~/dotfiles -t ~ newpkg
# Add to PACKAGES array in setup.sh
```

## Secrets

`~/.secrets` is sourced by `.zshrc` but not tracked. Format: `export KEY=value`.
