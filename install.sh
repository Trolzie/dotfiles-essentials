#!/usr/bin/env bash
set -euo pipefail

DOTFILES="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGES=(git shell zsh karabiner)

# ── Prerequisites ──

if ! command -v brew &>/dev/null; then
  echo "Error: Homebrew is required. Install from https://brew.sh"
  exit 1
fi

if ! command -v stow &>/dev/null; then
  echo "Installing stow..."
  brew install stow
fi

# ── Homebrew packages ──

if [ -f "$DOTFILES/Brewfile" ]; then
  echo "Installing Homebrew packages..."
  brew bundle --file="$DOTFILES/Brewfile" --no-lock
fi

# ── oh-my-zsh ──

if [ ! -d "$HOME/.oh-my-zsh" ]; then
  echo "Installing oh-my-zsh..."
  RUNZSH=no sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)"
fi

# ── zsh plugins ──

ZSH_CUSTOM="${ZSH_CUSTOM:-$HOME/.oh-my-zsh/custom}"

if [ ! -d "$ZSH_CUSTOM/plugins/zsh-syntax-highlighting" ]; then
  echo "Installing zsh-syntax-highlighting..."
  git clone https://github.com/zsh-users/zsh-syntax-highlighting.git "$ZSH_CUSTOM/plugins/zsh-syntax-highlighting"
fi

if [ ! -d "$ZSH_CUSTOM/plugins/zsh-autosuggestions" ]; then
  echo "Installing zsh-autosuggestions..."
  git clone https://github.com/zsh-users/zsh-autosuggestions.git "$ZSH_CUSTOM/plugins/zsh-autosuggestions"
fi

# ── Powerlevel10k ──

if [ ! -d "$ZSH_CUSTOM/themes/powerlevel10k" ]; then
  echo "Installing Powerlevel10k..."
  git clone --depth=1 https://github.com/romkatv/powerlevel10k.git "$ZSH_CUSTOM/themes/powerlevel10k"
fi

# ── nvm ──

if [ ! -d "$HOME/.nvm" ]; then
  echo "Installing nvm..."
  PROFILE=/dev/null bash -c "$(curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh)"
fi

# ── Stow ──

mkdir -p "$HOME/bin" "$HOME/.config"

# Remove oh-my-zsh's default .zshrc so stow can place ours
[ -f "$HOME/.zshrc" ] && [ ! -L "$HOME/.zshrc" ] && mv "$HOME/.zshrc" "$HOME/.zshrc.pre-stow"

echo "Stowing packages..."
for pkg in "${PACKAGES[@]}"; do
  if [ -d "$DOTFILES/$pkg" ]; then
    echo "  Stowing $pkg..."
    stow -d "$DOTFILES" -t "$HOME" "$pkg"
  fi
done

echo ""
echo "Done! Next steps:"
echo "  1. source ~/.zshrc"
echo "  2. nvm install --lts"
echo "  3. bash ~/dotfiles-essentials/macos-defaults.sh"
echo "  4. Copy ~/.secrets from secure backup (chmod 600)"
