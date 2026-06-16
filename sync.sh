#!/usr/bin/env bash
set -euo pipefail

DOTFILES="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGES=(git shell zsh karabiner tmux bin claude pi)

# ── Helpers ──

ok()   { echo "  ✓ $1"; }
info() { echo "  → $1"; }
warn() { echo "  ⚠ $1"; }

# ── Pull latest ──

echo ""
echo "── Pull ──"

git -C "$DOTFILES" pull --rebase --autostash
ok "Up to date"

# ── Brew packages ──

echo ""
echo "── Brew packages ──"

# Ensure brew is in PATH
if [ -x /opt/homebrew/bin/brew ]; then
  eval "$(/opt/homebrew/bin/brew shellenv)"
fi

if [ -f "$DOTFILES/Brewfile" ]; then
  info "Installing packages..."
  brew bundle --file="$DOTFILES/Brewfile" --no-lock --no-upgrade --verbose || true

  # Verify formulas — brew bundle can silently skip packages
  for formula in $(grep '^brew ' "$DOTFILES/Brewfile" | sed 's/brew "//;s/".*//'); do
    if ! brew list "$formula" &>/dev/null; then
      info "Installing $formula (missed by bundle)..."
      brew install "$formula" || warn "Failed to install $formula"
    fi
  done

  # Verify casks — brew bundle can silently skip these too
  for cask in $(grep '^cask ' "$DOTFILES/Brewfile" | sed 's/cask "//;s/"//'); do
    if ! brew list --cask "$cask" &>/dev/null; then
      info "Installing $cask (missed by bundle)..."
      brew install --cask "$cask" || warn "Failed to install $cask"
    fi
  done

  ok "All packages ready"
else
  warn "No Brewfile found, skipping"
fi

# ── Stow symlinks ──

echo ""
echo "── Symlinks ──"

if ! command -v stow &>/dev/null; then
  info "stow not found, installing..."
  brew install stow
fi

mkdir -p "$HOME/bin" "$HOME/.config" "$HOME/projects"

# Stow with --adopt: if a target file already exists (e.g. .zprofile from
# Homebrew, .zshrc from oh-my-zsh), adopt it into the repo then restore
# our version via git checkout. This handles ANY conflict automatically.
for pkg in "${PACKAGES[@]}"; do
  if [ -d "$DOTFILES/$pkg" ]; then
    stow -d "$DOTFILES" -t "$HOME" -R --adopt "$pkg"
    ok "Stowed $pkg"
  fi
done

# Restore our versions (--adopt may have overwritten repo files with local ones)
git -C "$DOTFILES" checkout -- .

# ── Push changes ──

echo ""
echo "── Push ──"

if git -C "$DOTFILES" diff --quiet && git -C "$DOTFILES" diff --cached --quiet && [ -z "$(git -C "$DOTFILES" ls-files --others --exclude-standard)" ]; then
  ok "Nothing to push"
else
  git -C "$DOTFILES" add -A
  git -C "$DOTFILES" commit -m "sync dotfiles"
  git -C "$DOTFILES" push
  ok "Changes pushed"
fi

echo ""
echo "  ✓ Sync complete"
