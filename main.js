const { app, BrowserWindow, dialog, ipcMain, Menu, Notification, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { createServer } = require('./server.js');

app.setName('CompassAI');

// Logs solo en desarrollo; en producción se silencian
const log = (...args) => { if (!app.isPackaged) console.log(...args); };
const warn = (...args) => { if (!app.isPackaged) console.warn(...args); };

// Map to keep track of each window and its associated server
// Format: map.set(webContentsId, { window, server })
const windowData = new Map();

async function createWindow(initialDir) {
    // Spin up a new Express server uniquely tied to this window on a random available port
    const serverInstance = await createServer(initialDir);
    const port = serverInstance.port || serverInstance.address().port;

    const mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        title: "CompassAI",
        titleBarStyle: 'hiddenInset',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            webviewTag: true,
            preload: path.join(__dirname, 'preload.js')
        }
    });

    mainWindow.on('page-title-updated', (e) => {
        e.preventDefault();
    });

    // Register this instance
    const webContentsId = mainWindow.webContents.id;
    windowData.set(webContentsId, {
        window: mainWindow,
        server: serverInstance
    });

    mainWindow.on('closed', () => {
        // Cleanup when this specific window is closed
        // Note: webContents is already destroyed at this point, use the saved id
        serverInstance.close();
        windowData.delete(webContentsId);
        // Sus terminales quedarían huérfanos (nadie puede volver a verlos).
        try { require('./terminal-manager').killByOwner(webContentsId); } catch (_) {}
    });

    // Bloquear DevTools en producción también por atajo de teclado
    if (app.isPackaged) {
        mainWindow.webContents.on('before-input-event', (event, input) => {
            const devToolsShortcut =
                (input.key === 'F12') ||
                (input.key === 'I' && input.alt && input.meta); // Cmd+Option+I
            if (devToolsShortcut) event.preventDefault();
        });
    }

    // Redirigir links externos (http/https) al navegador del SO en lugar de
    // dejar que Electron abra una BrowserWindow nueva. Cubre cualquier
    // window.open o <a target="_blank"> en cualquier parte del renderer.
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        try {
            const u = new URL(url);
            if (u.protocol === 'http:' || u.protocol === 'https:') {
                shell.openExternal(url);
                return { action: 'deny' };
            }
        } catch {}
        // blob:, file:, about:blank, etc. — se mantienen dentro de Electron
        return { action: 'allow' };
    });

    mainWindow.loadURL(`http://localhost:${port}`);
    return mainWindow;
}

// Function to get the server tied to the IPC request sender
function getServerFromSender(webContentsId) {
    const data = windowData.get(webContentsId);
    if (!data) {
        warn(`[main] getServerFromSender: no window registered for webContents id=${webContentsId}`);
        return null;
    }
    return data.server;
}

// Function to setup application menu (to allow Cmd+N for new windows)
function setupMenu() {
    const isMac = process.platform === 'darwin';
    const template = [
        ...(isMac ? [{
            label: app.name,
            submenu: [
                { role: 'about' },
                { type: 'separator' },
                { role: 'services' },
                { type: 'separator' },
                { role: 'hide' },
                { role: 'hideOthers' },
                { role: 'unhide' },
                { type: 'separator' },
                { role: 'quit' }
            ]
        }] : []),
        {
            label: 'File',
            submenu: [
                {
                    label: 'New Window',
                    accelerator: 'CmdOrCtrl+N',
                    click: () => createWindow()
                },
                { type: 'separator' },
                {
                    label: 'Abrir historial de terminales',
                    click: () => {
                        try {
                            const dir = TERM_HISTORY_DIR();
                            fs.mkdirSync(dir, { recursive: true });
                            shell.openPath(dir);
                        } catch (_) {}
                    }
                },
                isMac ? { role: 'close' } : { role: 'quit' }
            ]
        },
        {
            label: 'Edit',
            submenu: [
                { role: 'undo' },
                { role: 'redo' },
                { type: 'separator' },
                { role: 'cut' },
                { role: 'copy' },
                { role: 'paste' },
                ...(isMac ? [
                    { role: 'pasteAndMatchStyle' },
                    { role: 'delete' },
                    { role: 'selectAll' },
                    { type: 'separator' },
                    {
                        label: 'Speech',
                        submenu: [
                            { role: 'startSpeaking' },
                            { role: 'stopSpeaking' }
                        ]
                    }
                ] : [
                    { role: 'delete' },
                    { type: 'separator' },
                    { role: 'selectAll' }
                ])
            ]
        },
        {
            label: 'View',
            submenu: [
                {
                    label: 'Reload',
                    accelerator: 'CmdOrCtrl+R',
                    click: (_, focusedWindow) => {
                        if (focusedWindow) {
                            focusedWindow.webContents.send('soft-refresh');
                        }
                    }
                },
                {
                    label: 'Force Reload',
                    accelerator: 'CmdOrCtrl+Shift+R',
                    click: (_, focusedWindow) => {
                        if (!focusedWindow) return;
                        // Una recarga completa destruye todos los panes de terminal.
                        // Es fácil pulsar Cmd+Shift+R creyendo estar en Chrome, así que
                        // si hay terminales vivos pedimos confirmación antes de recargar.
                        // Sólo cuentan los terminales de ESTA ventana.
                        const ownerId = focusedWindow.webContents.id;
                        let liveTerms = 0;
                        try { liveTerms = require('./terminal-manager').count(ownerId); } catch (_) {}
                        if (liveTerms > 0) {
                            const choice = dialog.showMessageBoxSync(focusedWindow, {
                                type: 'warning',
                                buttons: ['Cancelar', 'Recargar de todos modos'],
                                defaultId: 0,
                                cancelId: 0,
                                message: 'Recarga completa',
                                detail: `Hay ${liveTerms} terminal(es) abierto(s). Una recarga completa los cerrará y perderás las sesiones en marcha.\n\n(¿Querías recargar una pestaña de Chrome en vez de CompassAI?)`,
                            });
                            if (choice === 0) return; // Cancelar
                        }
                        // Tras recargar, el renderer ya no ve esos PTYs: cerrarlos de
                        // verdad en vez de dejarlos vivos y huérfanos.
                        try { require('./terminal-manager').killByOwner(ownerId); } catch (_) {}
                        focusedWindow.reload();
                    }
                },
                ...(!app.isPackaged ? [{ role: 'toggleDevTools' }] : []),
                { type: 'separator' },
                {
                    label: 'Actual Size',
                    accelerator: 'CommandOrControl+0',
                    click: (_, focusedWindow) => {
                        if (focusedWindow) focusedWindow.webContents.setZoomLevel(0);
                    }
                },
                {
                    label: 'Zoom In',
                    accelerator: 'CommandOrControl+Plus',
                    click: (_, focusedWindow) => {
                        if (!focusedWindow) return;
                        const lvl = focusedWindow.webContents.getZoomLevel();
                        focusedWindow.webContents.setZoomLevel(lvl + 0.5);
                    }
                },
                {
                    label: 'Zoom In (=)',
                    accelerator: 'CommandOrControl+=',
                    visible: false,
                    click: (_, focusedWindow) => {
                        if (!focusedWindow) return;
                        const lvl = focusedWindow.webContents.getZoomLevel();
                        focusedWindow.webContents.setZoomLevel(lvl + 0.5);
                    }
                },
                {
                    label: 'Zoom Out',
                    accelerator: 'CommandOrControl+-',
                    click: (_, focusedWindow) => {
                        if (!focusedWindow) return;
                        const lvl = focusedWindow.webContents.getZoomLevel();
                        focusedWindow.webContents.setZoomLevel(lvl - 0.5);
                    }
                },
                { type: 'separator' },
                { role: 'togglefullscreen' }
            ]
        },
        {
            label: 'Window',
            submenu: [
                { role: 'minimize' },
                { role: 'zoom' },
                ...(isMac ? [
                    { type: 'separator' },
                    { role: 'front' },
                    { type: 'separator' },
                    { role: 'window' }
                ] : [
                    { role: 'close' }
                ])
            ]
        }
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
}

// Buffer de salida PTY por terminal.
// Implementa DEC Synchronized Output (\x1b[?2026h / \x1b[?2026l):
// cuando detectamos el marker de inicio, retenemos el buffer hasta recibir
// el marker de fin, y entonces enviamos el bloque completo de una vez.
// Así xterm.js nunca ve el estado intermedio "línea borrada" sin su redraw.
const ptyOutputBufs = new Map(); // terminalId → { data, immediate, inSync, syncTimeout }

const SYNC_BEGIN      = '\x1b[?2026h';
const SYNC_END        = '\x1b[?2026l';
const SYNC_TIMEOUT_MS = 80;  // máx ms esperando fin-sync antes de forzar flush

function flushPtyBuf(terminalId, targetWindow) {
    const buf = ptyOutputBufs.get(terminalId);
    if (!buf) return;
    if (buf.syncTimeout) { clearTimeout(buf.syncTimeout); buf.syncTimeout = null; }
    buf.immediate = null;
    buf.inSync    = false;
    const data = buf.data;
    buf.data = '';
    if (data && !targetWindow.isDestroyed()) {
        targetWindow.webContents.send('terminal-output', { id: terminalId, data });
    }
}

// === TERMINAL IPC HANDLERS ===
ipcMain.handle('terminal-start', async (event, { cwd, command }) => {
    log('[BACKEND] Recibida petición terminal-start');
    try {
        const terminalManager = require('./terminal-manager');
        const senderId = event.sender.id;
        const server = getServerFromSender(senderId);

        const activeCwd = cwd || (server && typeof server.getRootDir === 'function' ? server.getRootDir() : null) || process.env.PMOS_ROOT_DIR || process.env.HOME;
        log('[BACKEND] Iniciando PTY en CWD:', activeCwd);

        const id = terminalManager.startTerminal(
            activeCwd,
            command,
            // onData: batching con detección de DEC Synchronized Output y full-clear.
            // - Sync markers (ESC[?2026h/l): esperamos al fin antes de enviar.
            // - Full clear (ESC[2J, patrón de Gemini): retenemos CLEAR_HOLD_MS para
            //   capturar el redraw que llega justo después, evitando que xterm.js
            //   renderice el frame en blanco intermedio que produce el parpadeo.
            (id, data) => {
                const targetWindow = windowData.get(senderId)?.window;
                if (!targetWindow || targetWindow.isDestroyed()) return;

                let buf = ptyOutputBufs.get(id);
                if (!buf) {
                    buf = { data: '', immediate: null, inSync: false, syncTimeout: null };
                    ptyOutputBufs.set(id, buf);
                }
                buf.data += data;

                // Actualizar estado sync
                if (data.includes(SYNC_BEGIN)) buf.inSync = true;
                if (data.includes(SYNC_END))   buf.inSync = false;

                if (buf.inSync) {
                    // Dentro de bloque sync: esperar al fin. Safety timeout por si nunca llega.
                    if (buf.immediate) { clearImmediate(buf.immediate); buf.immediate = null; }
                    if (!buf.syncTimeout) {
                        buf.syncTimeout = setTimeout(() => flushPtyBuf(id, targetWindow), SYNC_TIMEOUT_MS);
                    }
                } else if (buf.syncTimeout) {
                    // Ya hay un timeout activo (bloque sync): acumular sin interrumpir.
                } else {
                    // Datos normales: flush en la próxima vuelta del event loop.
                    // El renderer agrupa todo lo que llegue en el mismo frame RAF.
                    if (!buf.immediate) {
                        buf.immediate = setImmediate(() => flushPtyBuf(id, targetWindow));
                    }
                }
            },
            // onExit: limpiar buffer y notificar cierre
            (id, code) => {
                ptyOutputBufs.delete(id);
                const targetWindow = windowData.get(senderId)?.window;
                if (targetWindow && !targetWindow.isDestroyed()) {
                    targetWindow.webContents.send('terminal-exit', { id, code });
                }
            },
            senderId
        );
        log('[BACKEND] Terminal iniciada con éxito. ID:', id);
        return { ok: true, id };
    } catch (err) {
        console.error('[BACKEND] ERROR al iniciar terminal:', err);
        return { ok: false, error: err.message };
    }
});

ipcMain.on('terminal-input', (event, { id, input }) => {
    const terminalManager = require('./terminal-manager');
    terminalManager.writeToTerminal(id, input);
});

ipcMain.on('terminal-kill', (event, { id }) => {
    const terminalManager = require('./terminal-manager');
    terminalManager.killTerminal(id);
});

ipcMain.on('terminal-resize', (event, { id, cols, rows }) => {
    const terminalManager = require('./terminal-manager');
    terminalManager.resizeTerminal(id, cols, rows);
});

// === APP IPC HANDLERS ===
ipcMain.handle('select-folder', async (event) => {
    const senderId = event.sender.id;
    const targetWindow = windowData.get(senderId)?.window;

    const result = await dialog.showOpenDialog(targetWindow, {
        properties: ['openDirectory', 'createDirectory'],
        title: 'Selecciona tu base documental (Carpeta CompassAI)',
        buttonLabel: 'Abrir en CompassAI'
    });
    if (!result || result.canceled || result.filePaths.length === 0) {
        return null;
    }
    return result.filePaths[0];
});

ipcMain.handle('select-file', async (event) => {
    const senderId = event.sender.id;
    const targetWindow = windowData.get(senderId)?.window;

    const result = await dialog.showOpenDialog(targetWindow, {
        properties: ['openFile', 'multiSelections'],
        title: 'Adjuntar archivos al terminal',
        buttonLabel: 'Adjuntar'
    });
    if (!result || result.canceled || result.filePaths.length === 0) {
        return null;
    }
    return result.filePaths;
});

// Abrir URLs externas en el navegador por defecto del sistema. Validamos
// protocolo para no exponer file:/javascript:/protocolos custom a través
// del bridge — sólo http(s).
ipcMain.handle('open-external', async (event, url) => {
    if (typeof url !== 'string') return false;
    try {
        const u = new URL(url);
        if (u.protocol === 'http:' || u.protocol === 'https:') {
            await shell.openExternal(url);
            return true;
        }
    } catch {}
    return false;
});

// Abrir un fichero .html del workspace local en el navegador del SO.
// Valida que la ruta resuelta esté dentro del ROOT_DIR de la ventana
// y que la extensión sea html/htm — evita exponer un open-arbitrary-file.
ipcMain.handle('open-path-in-browser', async (event, relPath) => {
    if (typeof relPath !== 'string' || !relPath) return false;
    const server = getServerFromSender(event.sender.id);
    if (!server || typeof server.getRootDir !== 'function') return false;
    const rootDir = server.getRootDir();
    const safePath = path.resolve(rootDir, relPath);
    if (safePath !== rootDir && !safePath.startsWith(rootDir + path.sep)) return false;
    const lower = safePath.toLowerCase();
    if (!lower.endsWith('.html') && !lower.endsWith('.htm')) return false;
    if (!fs.existsSync(safePath) || !fs.statSync(safePath).isFile()) return false;
    await shell.openExternal('file://' + safePath);
    return true;
});

ipcMain.on('set-window-title', (event, data) => {
    const senderId = event.sender.id;
    const targetWindow = windowData.get(senderId)?.window;
    if (targetWindow && !targetWindow.isDestroyed()) {
        const title = typeof data === 'string' ? data : data.title;
        const representedPath = typeof data === 'object' ? data.path : null;
        
        targetWindow.setTitle(title);
        if (representedPath && fs.existsSync(representedPath) && fs.statSync(representedPath).isFile()) {
            targetWindow.setRepresentedFilename(representedPath);
        }
    }
});

// ---- Terminal scrollback history (crash/close recovery) ----
// Persiste el texto plano visible de cada pane de terminal en userData, para
// que un cierre accidental de pane o de la app no se lleve el output por
// delante. NO son los transcripts de Claude Code (esos los gestiona su CLI):
// esto es el buffer tal cual se ve en pantalla, legible en el propio visor.
const TERM_HISTORY_DIR = () => path.join(app.getPath('userData'), 'terminal-history');
const TERM_HISTORY_MAX_FILES = 60; // conservar los N logs más recientes

function pruneTerminalHistory() {
    try {
        const dir = TERM_HISTORY_DIR();
        if (!fs.existsSync(dir)) return;
        const files = fs.readdirSync(dir)
            .filter(f => f.endsWith('.log'))
            .map(f => ({ f, m: fs.statSync(path.join(dir, f)).mtimeMs }))
            .sort((a, b) => b.m - a.m);
        for (const { f } of files.slice(TERM_HISTORY_MAX_FILES)) {
            try { fs.unlinkSync(path.join(dir, f)); } catch (_) {}
        }
    } catch (err) { warn('[term-history] prune falló:', err.message); }
}

ipcMain.handle('terminal-history-save', async (event, { id, title, profile, cwd, text } = {}) => {
    if (typeof id !== 'string' || !id || typeof text !== 'string') return false;
    // Sanea el id para usarlo como nombre de fichero (uuid, pero por si acaso).
    const safeId = id.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 128);
    try {
        const dir = TERM_HISTORY_DIR();
        await fs.promises.mkdir(dir, { recursive: true });
        const header =
            `# Terminal: ${title || profile || 'terminal'}\n` +
            `# Perfil: ${profile || '?'}  ·  cwd: ${cwd || '?'}\n` +
            `# Guardado: ${new Date().toISOString()}  ·  id: ${id}\n` +
            `${'─'.repeat(60)}\n`;
        // Asíncrono: no bloquear el proceso principal (IPC/PTY) con varios MB.
        await fs.promises.writeFile(path.join(dir, `${safeId}.log`), header + text, { encoding: 'utf8', mode: 0o600 });
        return true;
    } catch (err) {
        warn('[term-history] no se pudo guardar:', err.message);
        return false;
    }
});

ipcMain.handle('terminal-history-reveal', () => {
    try {
        const dir = TERM_HISTORY_DIR();
        fs.mkdirSync(dir, { recursive: true });
        shell.openPath(dir);
        return dir;
    } catch (err) {
        warn('[term-history] no se pudo abrir la carpeta:', err.message);
        return null;
    }
});

// ---- Ollama API proxy (localhost or remote) ----
// Sólo para inspección (listar modelos vía /api/tags). La conversación la
// lleva el CLI `ollama` dentro de un terminal — aquí no proxyamos chat ni
// streaming. Timeout corto: si Ollama no está corriendo, el "Detectar"
// debe fallar rápido sin congelar la UI.
const OLLAMA_TIMEOUT_MS = 3000;

ipcMain.handle('ollama-api-request', async (event, { endpoint, path: apiPath, method = 'GET', body = null } = {}) => {
    let url;
    try {
        url = new URL(apiPath || '/api/tags', endpoint || 'http://localhost:11434');
    } catch {
        return { ok: false, error: 'Endpoint inválido', data: null };
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        return { ok: false, error: 'Endpoint debe ser http(s)', data: null };
    }
    const lib = url.protocol === 'https:' ? require('https') : require('http');
    return new Promise((resolve) => {
        const options = {
            hostname: url.hostname,
            port: url.port || (url.protocol === 'https:' ? 443 : 80),
            path: url.pathname + url.search,
            method,
            headers: { 'Accept': 'application/json' }
        };
        if (body) options.headers['Content-Type'] = 'application/json';

        const req = lib.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, data: JSON.parse(data) });
                } catch {
                    resolve({ ok: false, status: res.statusCode, data: null });
                }
            });
        });
        req.setTimeout(OLLAMA_TIMEOUT_MS, () => {
            req.destroy();
            resolve({ ok: false, error: 'timeout', data: null });
        });
        req.on('error', (err) => resolve({ ok: false, error: err.message, data: null }));
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
});

// === TERMINAL NOTIFICATIONS ===
// El paneId viaja end-to-end (renderer → main → notif → click → renderer)
// para que al clicar la notif aterricemos en la pestaña + pane exactos.
ipcMain.on('terminal-notify', (event, { paneId, title, body }) => {
    if (!Notification.isSupported()) return;
    const n = new Notification({ title, body });
    n.on('click', () => {
        const win = BrowserWindow.fromWebContents(event.sender);
        if (win) { win.show(); win.focus(); }
        if (paneId && !event.sender.isDestroyed()) {
            event.sender.send('focus-pane', { paneId });
        }
    });
    n.show();
});

// === PROTOTYPE SERVER (servir carpetas como servidor estático) ===
const protoServers = new Map(); // folderPath → { server, port }

ipcMain.handle('proto-server-start', async (event, folderPath) => {
    // Si ya hay un servidor para esa carpeta, devolver el puerto existente
    if (protoServers.has(folderPath)) {
        return { ok: true, port: protoServers.get(folderPath).port };
    }

    try {
        const protoApp = require('express')();
        protoApp.use(require('express').static(folderPath));
        // Fallback: servir index.html para SPA
        protoApp.use((req, res) => {
            const indexPath = path.join(folderPath, 'index.html');
            if (fs.existsSync(indexPath)) {
                res.sendFile(indexPath);
            } else {
                res.status(404).send('Not found');
            }
        });

        const server = protoApp.listen(0, '127.0.0.1', () => {
            const port = server.address().port;
            protoServers.set(folderPath, { server, port });
            log(`[proto-server] Serving ${folderPath} on port ${port}`);
        });

        // Esperar a que el servidor esté listo
        await new Promise((resolve) => server.on('listening', resolve));
        return { ok: true, port: protoServers.get(folderPath).port };
    } catch (err) {
        return { ok: false, error: err.message };
    }
});

ipcMain.handle('proto-server-stop', async (event, folderPath) => {
    const entry = protoServers.get(folderPath);
    if (entry) {
        entry.server.close();
        protoServers.delete(folderPath);
        log(`[proto-server] Stopped server for ${folderPath}`);
    }
    return { ok: true };
});

// === ESTADO DE SESIONES DE CLAUDE (hooks) ===
// Las sesiones de Claude lanzadas desde CompassAI llevan `--settings` con unos
// hooks que ejecutan shell-integration/compass-status-hook.sh. Ese script
// deja el JSON de cada evento en AGENT_STATUS_DIR como <paneId>.<rnd>.evt;
// aquí lo leemos, lo borramos y lo reenviamos a la ventana dueña del PTY.
// Los hooks se SUMAN a los del usuario (~/.claude, proyecto, plugins): no
// sustituyen nada de su configuración.
const AGENT_STATUS_DIR = () => path.join(app.getPath('userData'), 'agent-status');
const AGENT_HOOKS_SETTINGS = () => path.join(app.getPath('userData'), 'claude-status-hooks.json');
const AGENT_HOOK_EVENTS = ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'Notification', 'Stop', 'StopFailure', 'SessionEnd'];

function setupAgentStatus() {
    const dir = AGENT_STATUS_DIR();
    try {
        fs.mkdirSync(dir, { recursive: true });
        // Restos de una ejecución anterior: los PTYs ya no existen.
        for (const f of fs.readdirSync(dir)) {
            try { fs.unlinkSync(path.join(dir, f)); } catch (_) {}
        }
        const script = path.join(__dirname.replace('app.asar', 'app.asar.unpacked'),
            'shell-integration', 'compass-status-hook.sh');
        const command = `sh ${JSON.stringify(script)}`;
        const hooks = {};
        for (const ev of AGENT_HOOK_EVENTS) {
            hooks[ev] = [{ hooks: [{ type: 'command', command, timeout: 5 }] }];
        }
        fs.writeFileSync(AGENT_HOOKS_SETTINGS(), JSON.stringify({ hooks }, null, 2));
    } catch (err) {
        warn('[agent-status] no se pudo preparar:', err.message);
        return;
    }

    process.env.COMPASS_STATUS_DIR = dir; // lo heredan los PTYs nuevos

    const pending = new Set();
    const consume = (name) => {
        if (!name.endsWith('.evt') || pending.has(name)) return;
        pending.add(name);
        const file = path.join(dir, name);
        let writtenAt = Date.now();
        fs.promises.stat(file)
            .then((st) => { writtenAt = st.mtimeMs; return fs.promises.readFile(file, 'utf8'); })
            .then((raw) => {
                fs.promises.unlink(file).catch(() => {});
                const paneId = name.split('.')[0];
                let payload;
                try { payload = JSON.parse(raw); } catch { return; }
                // Hora en que el hook lo escribió: el renderer la usa para
                // ordenar eventos que llegan casi a la vez (fs.watch no garantiza orden).
                payload.__writtenAt = writtenAt;
                const ownerId = require('./terminal-manager').getOwner(paneId);
                const win = ownerId != null ? windowData.get(ownerId)?.window : null;
                if (win && !win.isDestroyed()) {
                    win.webContents.send('agent-status', { paneId, payload: slimAgentPayload(payload) });
                }
            })
            .catch(() => {})
            .finally(() => pending.delete(name));
    };
    try {
        fs.watch(dir, (_type, name) => { if (name) consume(String(name)); });
    } catch (err) {
        warn('[agent-status] fs.watch falló:', err.message);
    }
}

// Solo lo que pinta el panel: evita mandar al renderer tool_input enormes
// (p. ej. el contenido completo de un Write).
function slimAgentPayload(p) {
    const clip = (s, n) => (typeof s === 'string' ? (s.length > n ? s.slice(0, n) + '…' : s) : undefined);
    const input = p.tool_input || {};
    return {
        event: p.hook_event_name,
        sessionId: p.session_id,
        cwd: p.cwd,
        transcriptPath: p.transcript_path,
        message: clip(p.message, 400),
        notificationType: p.notification_type,
        lastMessage: clip(p.last_assistant_message, 600),
        prompt: clip(p.prompt, 200),
        tool: p.tool_name,
        toolTarget: clip(input.file_path || input.path || input.command || input.pattern || input.url || input.description, 160),
        filePath: clip(input.file_path, 1000), // ruta completa (p. ej. el registro de /objetivo)
        backgroundTasks: Array.isArray(p.background_tasks) ? p.background_tasks.length : 0,
        error: clip(p.error?.message || p.error, 300),
        source: p.source,
        reason: p.reason,
        at: p.__writtenAt || Date.now(),
    };
}

// ── Registros de la skill /objetivo (.objetivos/<nombre>.md) ──────────────
// Solo se aceptan rutas absolutas a un .md directamente dentro de una carpeta
// `.objetivos`: el renderer no puede usar esto para leer otros ficheros.
function objectivePath(p) {
    if (typeof p !== 'string' || !path.isAbsolute(p)) return null;
    const norm = path.normalize(p);
    if (!norm.endsWith('.md') || path.basename(path.dirname(norm)) !== '.objetivos') return null;
    return norm;
}

// Devuelve los campos de la cabecera (front matter) que pinta el panel.
ipcMain.handle('objective-read', async (event, p) => {
    const file = objectivePath(p);
    if (!file) return null;
    try {
        const fh = await fs.promises.open(file, 'r');
        const { buffer, bytesRead } = await fh.read(Buffer.alloc(8192), 0, 8192, 0);
        await fh.close();
        const m = buffer.toString('utf8', 0, bytesRead).match(/^---\r?\n([\s\S]*?)\r?\n---/);
        if (!m) return null;
        const meta = {};
        for (const line of m[1].split(/\r?\n/)) {
            const kv = line.match(/^(\w+):\s*(.*)$/);
            // Los comentarios de la plantilla ("   # …") no forman parte del valor.
            if (kv) meta[kv[1]] = kv[2].replace(/\s{2,}#.*$/, '').trim().slice(0, 300);
        }
        return {
            objetivo: meta.objetivo || '', caso: meta.caso || '', paso: meta.paso || '',
            estado: meta.estado || '', esperando: meta.esperando || '', actualizado: meta.actualizado || '',
        };
    } catch { return null; }
});

// Abre el registro con la app por defecto (si está fuera de la carpeta del visor).
ipcMain.handle('objective-open', async (event, p) => {
    const file = objectivePath(p);
    if (!file) return false;
    return (await shell.openPath(file)) === '';
});

ipcMain.handle('agent-hooks-settings', () => {
    try {
        return fs.existsSync(AGENT_HOOKS_SETTINGS()) ? AGENT_HOOKS_SETTINGS() : null;
    } catch { return null; }
});

app.whenReady().then(async () => {
    setupMenu();
    setupAgentStatus();
    pruneTerminalHistory(); // limpiar logs de terminal antiguos al arrancar
    // Start with a generic directory. The frontend will override this via API per window.
    process.env.PMOS_ROOT_DIR = path.resolve(__dirname, '..');

    // Create initial window
    try {
        await createWindow();
    } catch (err) {
        showErrorDialog('No se pudo iniciar CompassAI', err.message || String(err));
        app.quit();
        return;
    }

    app.on('activate', async () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            try { await createWindow(); } catch (_) {}
        }
    });
});

// === ERROR HANDLING GLOBAL ===
// Muestra un diálogo nativo al usuario en caso de errores no capturados.
// En desarrollo también se imprime en consola para facilitar el debug.

function showErrorDialog(title, detail) {
    if (app.isReady()) {
        dialog.showErrorBox(title, detail);
    }
}

process.on('uncaughtException', (err) => {
    console.error('[uncaughtException]', err);
    showErrorDialog('Error inesperado', err.message || String(err));
});

process.on('unhandledRejection', (reason) => {
    console.error('[unhandledRejection]', reason);
    const msg = reason instanceof Error ? reason.message : String(reason);
    showErrorDialog('Error inesperado', msg);
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('will-quit', () => {
    try {
        const terminalManager = require('./terminal-manager');
        terminalManager.killAll();
    } catch (e) { }

    // Close all dangling servers
    windowData.forEach(data => {
        if (data.server) {
            try { data.server.close(); } catch (e) { }
        }
    });
    windowData.clear();

    // Close all prototype servers
    protoServers.forEach(entry => {
        try { entry.server.close(); } catch (e) { }
    });
    protoServers.clear();
});
