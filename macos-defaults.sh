#!/usr/bin/env bash
set -euo pipefail

# Essential macOS defaults for development
# Run once on a new machine: bash ~/dotfiles-essentials/macos-defaults.sh

# ── Keyboard & Input ──

# Disable press-and-hold for keys in favor of key repeat
defaults write NSGlobalDomain ApplePressAndHoldEnabled -bool false

# Blazingly fast keyboard repeat rate
defaults write NSGlobalDomain KeyRepeat -int 1
defaults write NSGlobalDomain InitialKeyRepeat -int 10

# Disable smart quotes, dashes, autocorrect, auto-capitalization
defaults write NSGlobalDomain NSAutomaticQuoteSubstitutionEnabled -bool false
defaults write NSGlobalDomain NSAutomaticDashSubstitutionEnabled -bool false
defaults write NSGlobalDomain NSAutomaticPeriodSubstitutionEnabled -bool false
defaults write NSGlobalDomain NSAutomaticCapitalizationEnabled -bool false
defaults write NSGlobalDomain NSAutomaticSpellingCorrectionEnabled -bool false

# Enable full keyboard access for all controls (e.g. Tab in modal dialogs)
defaults write NSGlobalDomain AppleKeyboardUIMode -int 3

# ── Trackpad ──

# Tap to click
defaults write com.apple.driver.AppleBluetoothMultitouch.trackpad Clicking -bool true
defaults -currentHost write NSGlobalDomain com.apple.mouse.tapBehavior -int 1

# Disable "natural" scrolling
defaults write NSGlobalDomain com.apple.swipescrolldirection -bool false

# ── Finder ──

# Show hidden files
defaults write com.apple.finder AppleShowAllFiles -bool true

# Show path bar and status bar
defaults write com.apple.finder ShowPathbar -bool true
defaults write com.apple.finder ShowStatusBar -bool true

# Search the current folder by default
defaults write com.apple.finder FXDefaultSearchScope -string "SCcf"

# Avoid creating .DS_Store files on network or USB volumes
defaults write com.apple.desktopservices DSDontWriteNetworkStores -bool true
defaults write com.apple.desktopservices DSDontWriteUSBStores -bool true

# ── Dock ──

# Minimize windows using scale effect
defaults write com.apple.dock mineffect -string "scale"

# Don't show recent applications
defaults write com.apple.dock show-recents -bool false

# ── Locale ──

defaults write NSGlobalDomain AppleLanguages -array "en" "nl"
defaults write NSGlobalDomain AppleLocale -string "en_GB@currency=EUR"
defaults write NSGlobalDomain AppleMeasurementUnits -string "Centimeters"
defaults write NSGlobalDomain AppleMetricUnits -bool true
sudo systemsetup -settimezone "Europe/Copenhagen" > /dev/null

# ── Misc ──

# Expand save panel by default
defaults write NSGlobalDomain NSNavPanelExpandedStateForSaveMode -bool true
defaults write NSGlobalDomain NSNavPanelExpandedStateForSaveMode2 -bool true

# Save to disk (not to iCloud) by default
defaults write NSGlobalDomain NSDocumentSaveNewDocumentsToCloud -bool false

# Disable the "Are you sure you want to open this application?" dialog
defaults write com.apple.LaunchServices LSQuarantine -bool false

# Disable boot sound
sudo nvram SystemAudioVolume=" "
sudo nvram StartupMute=%01

echo "Done. Some changes require a logout/restart to take effect."
