# Dotfiles

Minimal GNU Stow dotfiles for macOS (Apple Silicon).

## New Machine Setup

```bash
# 1. Install Homebrew
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
eval "$(/opt/homebrew/bin/brew shellenv)"

# 2. Clone and run
git clone git@github.com:Trolzie/dotfiles-essentials.git ~/dotfiles
cd ~/dotfiles
./setup.sh
```

That's it. `setup.sh` handles everything in order: Homebrew, SSH keys, brew packages, oh-my-zsh + plugins + Powerlevel10k, symlinks, macOS defaults, and Node.js. Already-installed tools are skipped.

After restart, run `p10k configure` to set up your prompt.

## Structure

| Package | Contents |
|---------|----------|
| `git/` | `.gitconfig`, `.gitignore_global` |
| `zsh/` | `.zshrc`, `.zprofile` |
| `shell/` | `.aliases` |
| `karabiner/` | Caps Lock → Meh Key remap |

## Adding packages later

```bash
mkdir ~/dotfiles/newpkg
# Add files mirroring $HOME structure
stow -d ~/dotfiles -t ~ newpkg
# Add to PACKAGES array in setup.sh
```

## Secrets

`~/.secrets` is sourced by `.zshrc` but not tracked. Format: `export KEY=value`.
