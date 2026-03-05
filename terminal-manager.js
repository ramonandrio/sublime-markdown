'use strict';

/**
 * terminal-manager.js
 *
 * Manages real PTY (pseudo-terminal) instances using node-pty.
 * Each instance is identified by a UUID-like id and holds a reference to
 * the underlying node-pty process together with its lifecycle callbacks.
 *
 * Public API (consumed by main.js IPC handlers):
 *   startTerminal(cwd, command, onData, onExit) -> id (string)
 *   writeToTerminal(id, input)
 *   killTerminal(id)
 *   resizeTerminal(id, cols, rows)
 *   killAll()
 */

const pty = require('node-pty');
const crypto = require('crypto');
const os = require('os');

// crypto.randomUUID() is available since Node 14.17 – no extra dependency needed
const uuidv4 = () => crypto.randomUUID();

// Map: id -> { ptyProcess, onData, onExit }
const terminals = new Map();

/**
 * Spawn a new PTY process and register it.
 *
 * @param {string|null}  cwd      - Working directory for the shell
 * @param {string}       command  - Shell executable (e.g. 'bash', 'zsh')
 * @param {Function}     onData   - Called with (id, data, type) on stdout/stderr
 * @param {Function}     onExit   - Called with (id, exitCode) when process exits
 * @returns {string}              - Unique id for the new terminal instance
 */
function startTerminal(cwd, command, onData, onExit) {
    const id = uuidv4();

    // Resolve a sane working directory
    const workingDir = cwd && require('fs').existsSync(cwd) ? cwd : os.homedir();

    // Pick the shell: honour the explicit `command` arg, then env, then platform default
    const shell = command || process.env.SHELL || (process.platform === 'win32' ? 'cmd.exe' : 'bash');

    // Make it a login shell so it loads ~/.zshrc / ~/.bash_profile and sets $PATH
    const args = process.platform === 'win32' ? [] : ['-l'];

    // Spawn with sensible defaults
    const ptyProcess = pty.spawn(shell, args, {
        name: 'xterm-256color',
        cols: 80,
        rows: 24,
        cwd: workingDir,
        env: {
            ...process.env,
            TERM: 'xterm-256color',
            COLORTERM: 'truecolor'
        }
    });

    // Forward PTY output to the renderer
    ptyProcess.onData((data) => {
        // Detect Claude CLI auth error (401 / authentication_error)
        const type = detectAuthError(data) ? 'auth_error' : 'data';
        try {
            onData(id, data, type);
        } catch (_) { /* window may have been destroyed */ }
    });

    // Notify renderer when the process exits
    ptyProcess.onExit(({ exitCode }) => {
        terminals.delete(id);
        try {
            onExit(id, exitCode);
        } catch (_) { }
    });

    terminals.set(id, { ptyProcess, onData, onExit });

    return id;
}

/**
 * Send raw input (keystrokes / text) to a running terminal.
 *
 * @param {string} id     - Terminal instance id
 * @param {string} input  - Data to write (may include escape sequences)
 */
function writeToTerminal(id, input) {
    const entry = terminals.get(id);
    if (entry) {
        try {
            entry.ptyProcess.write(input);
        } catch (err) {
            console.error(`[terminal-manager] writeToTerminal error (id=${id}):`, err.message);
        }
    }
}

/**
 * Resize a terminal to the given columns / rows (triggered by UI resize events).
 *
 * @param {string} id   - Terminal instance id
 * @param {number} cols - New column count
 * @param {number} rows - New row count
 */
function resizeTerminal(id, cols, rows) {
    const entry = terminals.get(id);
    if (entry) {
        try {
            entry.ptyProcess.resize(
                Math.max(1, Math.floor(cols)),
                Math.max(1, Math.floor(rows))
            );
        } catch (err) {
            console.error(`[terminal-manager] resizeTerminal error (id=${id}):`, err.message);
        }
    }
}

/**
 * Kill a single terminal instance and clean up resources.
 *
 * @param {string} id - Terminal instance id
 */
function killTerminal(id) {
    const entry = terminals.get(id);
    if (entry) {
        try {
            entry.ptyProcess.kill();
        } catch (_) { }
        terminals.delete(id);
    }
}

/**
 * Kill all active terminal instances (called on app quit).
 */
function killAll() {
    for (const [id, entry] of terminals.entries()) {
        try {
            entry.ptyProcess.kill();
        } catch (_) { }
    }
    terminals.clear();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Heuristic check: does a chunk of PTY output indicate a Claude auth failure?
 * Returns true if the string contains the known 401 / authentication_error pattern.
 *
 * @param {string} data
 * @returns {boolean}
 */
function detectAuthError(data) {
    return (
        typeof data === 'string' &&
        (data.includes('authentication_error') || data.includes('"status":401'))
    );
}

module.exports = {
    startTerminal,
    writeToTerminal,
    resizeTerminal,
    killTerminal,
    killAll
};
