#!/usr/bin/env bash
set -euo pipefail

DOTFILES="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGES=(git shell zsh karabiner)
TOTAL_STEPS=7
STEP=0

# ── Helpers ──

step() {
  STEP=$((STEP + 1))
  echo ""
  echo "── Step $STEP/$TOTAL_STEPS: $1 ──"
}

ok()   { echo "  ✓ $1"; }
info() { echo "  → $1"; }
warn() { echo "  ⚠ $1"; }

pause() {
  echo ""
  read -rp "  Press Enter to continue..." </dev/tty
}

# ── Step 1: Homebrew ──

step "Homebrew"

if command -v brew &>/dev/null; then
  ok "Already installed"
else
  info "Installing Homebrew..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  eval "$(/opt/homebrew/bin/brew shellenv)"
  ok "Installed"
fi

# ── Step 2: SSH Keys ──

step "SSH Keys"

if [ -f "$HOME/.ssh/id_ed25519" ]; then
  ok "Key exists at ~/.ssh/id_ed25519"
else
  info "Generating SSH key..."
  ssh-keygen -t ed25519 -C "tlrc1984@gmail.com" </dev/tty
  eval "$(ssh-agent -s)" > /dev/null 2>&1
  ssh-add "$HOME/.ssh/id_ed25519"
  ok "Key generated"
  echo ""
  echo "  Your public key:"
  echo ""
  cat "$HOME/.ssh/id_ed25519.pub"
  echo ""
  warn "Add this key to GitHub: https://github.com/settings/keys"
  pause
fi

# ── Step 3: Brew packages ──

step "Brew packages"

if [ -f "$DOTFILES/Brewfile" ]; then
  info "Installing packages (skipping already installed)..."
  brew bundle --file="$DOTFILES/Brewfile" --no-lock --no-upgrade 2>&1 | while IFS= read -r line; do
    case "$line" in
      *"already installed"*|*"already an App"*|*"Skipping"*)
        pkg=$(echo "$line" | sed 's/.*install //' | sed 's/ .*//')
        ok "$pkg (already installed)"
        ;;
      *"Installing"*|*"Downloading"*)
        pkg=$(echo "$line" | sed 's/.*install //' | sed 's/ .*//')
        info "Installing $pkg..."
        ;;
    esac
  done
  ok "All packages ready"
else
  warn "No Brewfile found, skipping"
fi

# ── Step 4: Shell setup ──

step "Shell (oh-my-zsh + plugins + Powerlevel10k)"

ZSH_CUSTOM="${ZSH_CUSTOM:-$HOME/.oh-my-zsh/custom}"

if [ -d "$HOME/.oh-my-zsh" ]; then
  ok "oh-my-zsh already installed"
else
  info "Installing oh-my-zsh..."
  RUNZSH=no sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)"
  ok "oh-my-zsh installed"
fi

if [ -d "$ZSH_CUSTOM/plugins/zsh-syntax-highlighting" ]; then
  ok "zsh-syntax-highlighting already installed"
else
  info "Installing zsh-syntax-highlighting..."
  git clone --quiet https://github.com/zsh-users/zsh-syntax-highlighting.git "$ZSH_CUSTOM/plugins/zsh-syntax-highlighting"
  ok "zsh-syntax-highlighting installed"
fi

if [ -d "$ZSH_CUSTOM/plugins/zsh-autosuggestions" ]; then
  ok "zsh-autosuggestions already installed"
else
  info "Installing zsh-autosuggestions..."
  git clone --quiet https://github.com/zsh-users/zsh-autosuggestions.git "$ZSH_CUSTOM/plugins/zsh-autosuggestions"
  ok "zsh-autosuggestions installed"
fi

if [ -d "$ZSH_CUSTOM/themes/powerlevel10k" ]; then
  ok "Powerlevel10k already installed"
else
  info "Installing Powerlevel10k..."
  git clone --quiet --depth=1 https://github.com/romkatv/powerlevel10k.git "$ZSH_CUSTOM/themes/powerlevel10k"
  ok "Powerlevel10k installed"
fi

# ── Step 5: Stow symlinks ──

step "Symlinks"

mkdir -p "$HOME/bin" "$HOME/.config"

# Back up oh-my-zsh's default .zshrc if it exists
if [ -f "$HOME/.zshrc" ] && [ ! -L "$HOME/.zshrc" ]; then
  mv "$HOME/.zshrc" "$HOME/.zshrc.pre-stow"
  info "Backed up existing .zshrc to .zshrc.pre-stow"
fi

for pkg in "${PACKAGES[@]}"; do
  if [ -d "$DOTFILES/$pkg" ]; then
    stow -d "$DOTFILES" -t "$HOME" --adopt "$pkg" 2>/dev/null || stow -d "$DOTFILES" -t "$HOME" "$pkg"
    ok "Stowed $pkg"
  fi
done

# ── Step 6: macOS defaults ──

step "macOS defaults"

info "Setting keyboard repeat, disabling smart quotes, Finder prefs..."

# Keyboard & Input
defaults write NSGlobalDomain ApplePressAndHoldEnabled -bool false
defaults write NSGlobalDomain KeyRepeat -int 1
defaults write NSGlobalDomain InitialKeyRepeat -int 10
defaults write NSGlobalDomain NSAutomaticQuoteSubstitutionEnabled -bool false
defaults write NSGlobalDomain NSAutomaticDashSubstitutionEnabled -bool false
defaults write NSGlobalDomain NSAutomaticPeriodSubstitutionEnabled -bool false
defaults write NSGlobalDomain NSAutomaticCapitalizationEnabled -bool false
defaults write NSGlobalDomain NSAutomaticSpellingCorrectionEnabled -bool false
defaults write NSGlobalDomain AppleKeyboardUIMode -int 3

# Trackpad
defaults write com.apple.driver.AppleBluetoothMultitouch.trackpad Clicking -bool true
defaults -currentHost write NSGlobalDomain com.apple.mouse.tapBehavior -int 1
defaults write NSGlobalDomain com.apple.swipescrolldirection -bool false

# Finder
defaults write com.apple.finder AppleShowAllFiles -bool true
defaults write com.apple.finder ShowPathbar -bool true
defaults write com.apple.finder ShowStatusBar -bool true
defaults write com.apple.finder FXDefaultSearchScope -string "SCcf"
defaults write com.apple.desktopservices DSDontWriteNetworkStores -bool true
defaults write com.apple.desktopservices DSDontWriteUSBStores -bool true

# Dock
defaults write com.apple.dock mineffect -string "scale"
defaults write com.apple.dock show-recents -bool false

# Locale
defaults write NSGlobalDomain AppleLanguages -array "en" "nl"
defaults write NSGlobalDomain AppleLocale -string "en_GB@currency=EUR"
defaults write NSGlobalDomain AppleMeasurementUnits -string "Centimeters"
defaults write NSGlobalDomain AppleMetricUnits -bool true

# Misc
defaults write NSGlobalDomain NSNavPanelExpandedStateForSaveMode -bool true
defaults write NSGlobalDomain NSNavPanelExpandedStateForSaveMode2 -bool true
defaults write NSGlobalDomain NSDocumentSaveNewDocumentsToCloud -bool false
defaults write com.apple.LaunchServices LSQuarantine -bool false

# These need sudo — skip if not available
if sudo -n true 2>/dev/null; then
  sudo systemsetup -settimezone "Europe/Copenhagen" > /dev/null 2>&1
  sudo nvram SystemAudioVolume=" " 2>/dev/null
  sudo nvram StartupMute=%01 2>/dev/null
  ok "All defaults set (including boot sound + timezone)"
else
  warn "Skipped boot sound + timezone (need sudo). Run with sudo later if needed."
  ok "User defaults set"
fi

# ── Step 7: Node.js ──

step "Node.js (nvm)"

export NVM_DIR="$HOME/.nvm"

if [ -d "$NVM_DIR" ]; then
  ok "nvm already installed"
else
  info "Installing nvm..."
  PROFILE=/dev/null bash -c "$(curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh)"
  ok "nvm installed"
fi

# Load nvm and install LTS if not present
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
if command -v nvm &>/dev/null; then
  if nvm ls --no-colors 2>/dev/null | grep -q "lts"; then
    ok "Node.js LTS already installed"
  else
    info "Installing Node.js LTS..."
    nvm install --lts
    ok "Node.js LTS installed"
  fi
fi

# ── Done ──

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  All done! Restart your terminal, then run:"
echo ""
echo "    p10k configure"
echo ""
echo "  to set up your prompt theme."
echo ""
echo "  Optional: copy ~/.secrets from your backup"
echo "    chmod 600 ~/.secrets"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
