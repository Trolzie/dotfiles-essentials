# ── Powerlevel10k instant prompt ──
if [[ -r "${XDG_CACHE_HOME:-$HOME/.cache}/p10k-instant-prompt-${(%):-%n}.zsh" ]]; then
  source "${XDG_CACHE_HOME:-$HOME/.cache}/p10k-instant-prompt-${(%):-%n}.zsh"
fi

# ── Oh My Zsh ──
export ZSH="$HOME/.oh-my-zsh"
ZSH_THEME="powerlevel10k/powerlevel10k"
plugins=(git zsh-syntax-highlighting zsh-autosuggestions)
source $ZSH/oh-my-zsh.sh

# ── PATH ──
export BUN_INSTALL="$HOME/.bun"
export PATH="$HOME/go/bin:$HOME/bin:$BUN_INSTALL/bin:$HOME/.npm-global/bin:$PATH"

# ── Environment ──
export EDITOR='nvim'
export LANG='en_US.UTF-8'
export LC_ALL='en_US.UTF-8'
export GPG_TTY=$(tty)

# ── nvm ──
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"

# ── bun ──
[ -s "$HOME/.bun/_bun" ] && source "$HOME/.bun/_bun"

# ── Aliases ──
[[ -f ~/.aliases ]] && source ~/.aliases

# ── Powerlevel10k config ──
[[ ! -f ~/.p10k.zsh ]] || source ~/.p10k.zsh

# ── Secrets (not tracked in git) ──
[[ -f ~/.secrets ]] && source ~/.secrets
