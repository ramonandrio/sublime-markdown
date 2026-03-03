const pty = require('node-pty');
const { v4: uuidv4 } = require('uuid');
const os = require('os');

class TerminalManager {
    constructor() {
        this.terminals = new Map();
    }

    startTerminal(cwd, command, onData, onExit) {
        const id = uuidv4();
        const shell = os.platform() === 'win32' ? 'powershell.exe' : process.env.SHELL || 'bash';

        const envPath = process.env.PATH || '';
        const home = process.env.HOME || '';
        const extraPaths = [
            '/usr/local/bin',
            '/opt/homebrew/bin',
            `${home}/.local/bin`,
            `${home}/.npm-global/bin`,
            `${home}/.nvm/versions/node/current/bin`,
        ].filter(Boolean).join(':');

        const mergedPath = `${envPath}:${extraPaths}`;
        const processEnv = { ...process.env, PATH: mergedPath, TERM: 'xterm-256color', COLORTERM: 'truecolor' };

        const ptyProcess = pty.spawn(shell, [], {
            name: 'xterm-256color',
            cols: 80,
            rows: 24,
            cwd: cwd || process.env.HOME,
            env: processEnv
        });

        this.terminals.set(id, {
            ptyProcess,
            onData,
            onExit
        });

        ptyProcess.onData((data) => {
            if (onData) onData(id, data, 'stdout');
        });

        ptyProcess.onExit((e) => {
            if (onExit) onExit(id, e.exitCode);
            this.terminals.delete(id);
        });

        return id;
    }

    writeToTerminal(id, input) {
        const session = this.terminals.get(id);
        if (session && session.ptyProcess) {
            session.ptyProcess.write(input);
        }
    }

    resizeTerminal(id, cols, rows) {
        const session = this.terminals.get(id);
        if (session && session.ptyProcess && cols > 0 && rows > 0) {
            session.ptyProcess.resize(cols, rows);
        }
    }

    killTerminal(id) {
        const session = this.terminals.get(id);
        if (session && session.ptyProcess) {
            session.ptyProcess.kill();
            this.terminals.delete(id);
        }
    }

    killAll() {
        for (const [id, session] of this.terminals.entries()) {
            if (session.ptyProcess) session.ptyProcess.kill();
        }
        this.terminals.clear();
    }
}

module.exports = new TerminalManager();
