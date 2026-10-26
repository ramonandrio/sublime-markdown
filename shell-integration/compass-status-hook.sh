#!/bin/sh
# CompassAI — hook de estado para sesiones de Claude Code lanzadas desde la app.
#
# Claude Code lo ejecuta en cada evento (SessionStart, UserPromptSubmit,
# PreToolUse, Notification, Stop, SessionEnd) con el JSON del evento por stdin.
# Solo copia ese JSON a un fichero en COMPASS_STATUS_DIR; main.js lo vigila,
# lo lee y lo borra. Nunca bloquea ni falla: ante cualquier problema sale con 0
# y la sesión de Claude sigue exactamente igual.
#
# COMPASS_PANE_ID y COMPASS_STATUS_DIR los pone terminal-manager.js en el
# entorno de cada PTY. Fuera de CompassAI no están definidos y no hace nada.

[ -n "$COMPASS_PANE_ID" ] && [ -d "$COMPASS_STATUS_DIR" ] || exit 0

tmp=$(mktemp "$COMPASS_STATUS_DIR/.tmp.XXXXXX" 2>/dev/null) || exit 0
if cat > "$tmp" 2>/dev/null; then
    # rename atómico: main.js nunca ve un fichero a medio escribir
    mv "$tmp" "$COMPASS_STATUS_DIR/$COMPASS_PANE_ID.${tmp##*.}.evt" 2>/dev/null || rm -f "$tmp"
else
    rm -f "$tmp"
fi
exit 0
