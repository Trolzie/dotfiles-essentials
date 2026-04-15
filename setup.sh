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

# Always ensure brew is in PATH (even on re-runs where .zprofile isn't stowed yet)
if [ -x /opt/homebrew/bin/brew ]; then
  eval "$(/opt/homebrew/bin/brew shellenv)"
  ok "Already installed"
elif command -v brew &>/dev/null; then
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
  ssh-add --apple-use-keychain "$HOME/.ssh/id_ed25519"
  ok "Key generated"

  # Persist key across reboots via macOS Keychain
  if [ ! -f "$HOME/.ssh/config" ]; then
    cat > "$HOME/.ssh/config" << 'SSHEOF'
Host *
  AddKeysToAgent yes
  UseKeychain yes
  IdentityFile ~/.ssh/id_ed25519
SSHEOF
    chmod 600 "$HOME/.ssh/config"
    ok "SSH config created (key will persist across reboots)"
  fi
  echo ""
  echo "  Your public key:"
  echo ""
  cat "$HOME/.ssh/id_ed25519.pub"
  echo ""
  warn "Add this key to GitHub: https://github.com/settings/keys"
  pause
fi

# Switch remote to SSH if currently HTTPS (supports initial HTTPS clone)
if git -C "$DOTFILES" remote get-url origin 2>/dev/null | grep -q "^https://"; then
  git -C "$DOTFILES" remote set-url origin "git@github.com:Trolzie/dotfiles-essentials.git"
  ok "Switched git remote to SSH"
fi

# ── Step 3: Brew packages ──

step "Brew packages"

if [ -f "$DOTFILES/Brewfile" ]; then
  info "Installing packages (skipping already installed)..."
  if ! brew bundle --file="$DOTFILES/Brewfile" --no-lock --no-upgrade; then
    warn "Some packages may have failed — check output above"
  fi
  ok "Brew bundle complete"
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

if ! command -v stow &>/dev/null; then
  info "stow not found, installing..."
  brew install stow
fi

mkdir -p "$HOME/bin" "$HOME/.config"

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
defaults write com.apple.finder _FXShowPosixPathInTitle -bool true
defaults write com.apple.finder FXDefaultSearchScope -string "SCcf"
defaults write com.apple.finder FXEnableExtensionChangeWarning -bool false
defaults write com.apple.finder FXPreferredViewStyle -string "Nlsv"
defaults write com.apple.finder DisableAllAnimations -bool true
defaults write NSGlobalDomain AppleShowAllExtensions -bool true
defaults write com.apple.desktopservices DSDontWriteNetworkStores -bool true
defaults write com.apple.desktopservices DSDontWriteUSBStores -bool true

# Dock
defaults write com.apple.dock autohide -bool true
defaults write com.apple.dock autohide-delay -float 0
defaults write com.apple.dock autohide-time-modifier -float 0
defaults write com.apple.dock tilesize -int 34
defaults write com.apple.dock mineffect -string "scale"
defaults write com.apple.dock show-recents -bool false
defaults write com.apple.dock launchanim -bool false
defaults write com.apple.dock expose-animation-duration -float 0.1
defaults write com.apple.dock minimize-to-application -bool true

# Animations (universalaccess is protected on newer macOS — needs sudo or System Settings)
defaults write com.apple.universalaccess reduceMotion -bool true 2>/dev/null || true
defaults write NSGlobalDomain NSAutomaticWindowAnimationsEnabled -bool false
defaults write NSGlobalDomain NSWindowResizeTime -float 0.001

# Screenshots
defaults write com.apple.screencapture disable-shadow -bool true

# Time Machine
defaults write com.apple.TimeMachine DoNotOfferNewDisksForBackup -bool true

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

# Restart affected apps so changes apply immediately
killall Dock 2>/dev/null || true
killall Finder 2>/dev/null || true
killall SystemUIServer 2>/dev/null || true
ok "Dock and Finder restarted"

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
  if nvm which "lts/*" &>/dev/null; then
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
echo "  Optional: copy ~/.secrets from your backup"
echo "    chmod 600 ~/.secrets"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
