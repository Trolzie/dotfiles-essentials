#!/bin/bash
# Claude Code status line — Catppuccin Mocha palette
input=$(cat)

# ─── Colors (ANSI true-color) ────────────────────────────────────
LAVENDER='\033[38;2;180;190;254m'
PEACH='\033[38;2;250;179;135m'
SUBTEXT='\033[38;2;166;173;200m'
GREEN='\033[38;2;166;227;161m'
YELLOW='\033[38;2;249;226;175m'
RED='\033[38;2;243;139;168m'
DIM='\033[38;2;69;71;90m'
BOLD='\033[1m'
RESET='\033[0m'

# ─── Data ─────────────────────────────────────────────────────────
MODEL=$(echo "$input" | jq -r '.model.display_name // "claude"')
PCT=$(echo "$input" | jq -r '.context_window.used_percentage // 0' | cut -d. -f1)
COST=$(echo "$input" | jq -r '.cost.total_cost_usd // 0')
DIR=$(echo "$input" | jq -r '.workspace.current_dir // ""')

# Git branch (from working directory)
BRANCH=""
if [ -n "$DIR" ] && [ -d "$DIR" ]; then
  BRANCH=$(git -C "$DIR" branch --show-current 2>/dev/null)
fi

# ─── Context bar ──────────────────────────────────────────────────
BAR_WIDTH=10
FILLED=$((PCT * BAR_WIDTH / 100))
EMPTY=$((BAR_WIDTH - FILLED))

if [ "$PCT" -ge 90 ]; then
  BAR_COLOR="$RED"
elif [ "$PCT" -ge 70 ]; then
  BAR_COLOR="$YELLOW"
else
  BAR_COLOR="$GREEN"
fi

BAR=""
for ((i = 0; i < FILLED; i++)); do BAR+="█"; done
for ((i = 0; i < EMPTY; i++)); do BAR+="░"; done

# ─── Cost ─────────────────────────────────────────────────────────
COST_FMT=$(printf '$%.2f' "$COST")

# ─── Output ───────────────────────────────────────────────────────
OUT="${LAVENDER}${BOLD}${MODEL}${RESET}"

if [ -n "$BRANCH" ]; then
  OUT+="  ${PEACH}${BRANCH}${RESET}"
fi

OUT+="  ${BAR_COLOR}${BAR}${RESET} ${SUBTEXT}${PCT}%${RESET}"
OUT+="  ${SUBTEXT}${COST_FMT}${RESET}"

printf '%b' "$OUT"
