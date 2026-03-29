# CompassAI Shell Integration for bash
# Emits OSC 633 sequences for command tracking

# Guard: only load once
[[ -n "$__COMPASSAI_SHELL_INTEGRATION" ]] && return
__COMPASSAI_SHELL_INTEGRATION=1

# Source user's bashrc
[[ -f ~/.bash_profile ]] && source ~/.bash_profile
[[ -f ~/.bashrc ]] && source ~/.bashrc

__compassai_cmd_started=0

# DEBUG trap: fires before each command (preexec equivalent)
__compassai_preexec() {
    # Skip if this is the prompt command itself
    [[ "$BASH_COMMAND" == "$PROMPT_COMMAND" ]] && return
    [[ "$BASH_COMMAND" == __compassai_* ]] && return

    if (( ! __compassai_cmd_started )); then
        __compassai_cmd_started=1
        printf '\e]633;E;%s\a' "$BASH_COMMAND"
        printf '\e]633;C\a'
    fi
}
trap '__compassai_preexec' DEBUG

# PROMPT_COMMAND: fires before each prompt (precmd equivalent)
__compassai_precmd() {
    local exit_code=$?

    if (( __compassai_cmd_started )); then
        printf '\e]633;D;%s\a' "$exit_code"
        __compassai_cmd_started=0
    fi

    printf '\e]633;A\a'
}

# Append to existing PROMPT_COMMAND
if [[ -z "$PROMPT_COMMAND" ]]; then
    PROMPT_COMMAND="__compassai_precmd"
else
    PROMPT_COMMAND="__compassai_precmd;$PROMPT_COMMAND"
fi

# Initial prompt start
printf '\e]633;A\a'
