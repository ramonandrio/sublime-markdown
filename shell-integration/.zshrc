# CompassAI ZDOTDIR bootstrap
# Sourced instead of the user's .zshrc via the ZDOTDIR trick.

# Restore original ZDOTDIR so user dotfiles load from the right place
ZDOTDIR="${__COMPASSAI_USER_ZDOTDIR:-$HOME}"

# Source the user's real .zshrc if it exists
[[ -f "$ZDOTDIR/.zshrc" ]] && source "$ZDOTDIR/.zshrc"

# Load shell integration hooks (after user config so we get the final prompt)
source "$__COMPASSAI_SHELL_DIR/shellIntegration-rc.zsh"
