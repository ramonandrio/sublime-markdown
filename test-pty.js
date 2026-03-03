const pty = require('node-pty');

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

const { execSync } = require('child_process');

// Encontrar la ruta real de claude (si está disponible en $PATH)
let claudePath = 'claude';
try {
    claudePath = execSync('which claude', { env: { ...process.env, PATH: mergedPath } }).toString().trim();
} catch (e) {
    console.log('No se pudo encontrar "claude" en el PATH mergeado.');
}

const ptyProcess = pty.spawn('/bin/bash', [], {
    name: 'xterm-color',
    cols: 80,
    rows: 30,
    cwd: process.cwd(),
    env: { ...process.env, PATH: mergedPath, FORCE_COLOR: '0' }
});

console.log('Spawned Claude. Waiting for output...');

ptyProcess.onData((data) => {
    console.log(`[STDOUT]: ${data}`);
});

setTimeout(() => {
    console.log(`Escribiendo comando: ${claudePath} --dangerously-skip-permissions`);
    ptyProcess.write(claudePath + ' --dangerously-skip-permissions\r');
}, 500);

setTimeout(() => {
    console.log('Test finished. Killing proc.');
    ptyProcess.kill();
}, 5000);
