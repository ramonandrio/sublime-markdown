# CompassAI Shell Integration for zsh
# Emits OSC 633 sequences for command tracking (precmd/preexec)

# Guard: only load once
[[ -n "$__COMPASSAI_SHELL_INTEGRATION" ]] && return
__COMPASSAI_SHELL_INTEGRATION=1

# Track state
__compassai_cmd_started=0
__compassai_cmd_start_time=0

# precmd: fires BEFORE the prompt is drawn (i.e. after a command finishes)
__compassai_precmd() {
    local exit_code=$?

    # If a command was running, emit "command finished" with exit code
    if (( __compassai_cmd_started )); then
        printf '\e]633;D;%s\a' "$exit_code"
        __compassai_cmd_started=0
    fi

    # Emit "prompt start"
    printf '\e]633;A\a'
}

# preexec: fires AFTER the user presses Enter, BEFORE the command runs
__compassai_preexec() {
    __compassai_cmd_started=1
    __compassai_cmd_start_time=$EPOCHSECONDS

    # Emit "command line text" (encode newlines)
    local cmd="${1//\\n/ }"
    printf '\e]633;E;%s\a' "$cmd"

    # Emit "command executed"
    printf '\e]633;C\a'
}

# Register hooks using zsh's add-zsh-hook (safe with other plugins)
autoload -Uz add-zsh-hook
add-zsh-hook precmd __compassai_precmd
add-zsh-hook preexec __compassai_preexec

# Emit initial prompt start for the first prompt
printf '\e]633;A\a'
