# Dotfiles (Essentials)

Minimal GNU Stow dotfiles for macOS (Apple Silicon). Only the bare necessities.

## Setup

```bash
# 1. Install Homebrew
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
eval "$(/opt/homebrew/bin/brew shellenv)"

# 2. SSH keys
ssh-keygen -t ed25519 -C "your@email.com"
eval "$(ssh-agent -s)" && ssh-add ~/.ssh/id_ed25519
# Add to GitHub: https://github.com/settings/keys

# 3. Clone and install
git clone git@github.com:Trolzie/dotfiles.git ~/dotfiles-essentials
cd ~/dotfiles-essentials
./install.sh

# 4. macOS defaults (keyboard repeat, disable smart quotes, etc.)
bash ~/dotfiles-essentials/macos-defaults.sh
```

## Structure

| Package | Contents |
|---------|----------|
| `git/` | `.gitconfig`, `.gitignore_global` |
| `zsh/` | `.zshrc`, `.zprofile` |
| `shell/` | `.aliases` |
| `karabiner/` | Caps Lock → Meh Key remap |

Standalone scripts:
- `macos-defaults.sh` — essential macOS input/keyboard/Finder defaults
- `Brewfile` — minimal Homebrew packages (~20)

## Adding packages later

```bash
# Create a new stow package
mkdir ~/dotfiles-essentials/newpkg
# Add files mirroring $HOME structure
stow -d ~/dotfiles-essentials -t ~ newpkg
# Add to PACKAGES array in install.sh
```

## Secrets

`~/.secrets` is sourced by `.zshrc` but not tracked. Format: `export KEY=value`.
