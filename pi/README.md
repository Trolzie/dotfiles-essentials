# pi extensions

Custom extensions for [pi](https://github.com/badlogic/pi-mono) that get
stowed into `~/.pi/agent/extensions/`.

| File | What it does |
|------|--------------|
| `subscription-status.ts` | Footer status: active OAuth subscription (email + org), API-key indicator, and a minimal context-usage progress bar. Adds `/sub-label`, `/sub-refresh`. |
| `tab-topic.ts` | Auto-summarises the conversation into a 4-8 word topic and pushes it as the terminal/tmux tab title (also persists as the session name for `/resume`). Adds `/topic`, `/topic <text>`, `/topic c`, `/topic r`. |
| `custom-footer.ts` | Replaces pi's two-line footer with a slim layout that drops the token/cost row and folds a per-repo coloured background into the cwd, plus right-aligned model + thinking level. |

## Runtime data (NOT stowed)

These live in `~/.pi/agent/` directly and are intentionally machine-local:

- `auth.json` — OAuth tokens / API keys (secrets)
- `subscription-cache.json` — auto-fetched profile info per OAuth fingerprint

## tmux requirement

`tab-topic.ts` calls `tmux rename-window` directly, but for OSC titles
to also work, `~/.tmux.conf` needs `setw -g allow-rename on` (already
set in `dotfiles/tmux/.tmux.conf`).
