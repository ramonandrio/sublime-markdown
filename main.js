const { app, BrowserWindow, dialog, ipcMain, Menu, safeStorage } = require('electron');
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
            nodeIntegration: true,
            contextIsolation: false,
            webviewTag: true
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
                { role: 'reload' },
                { role: 'forceReload' },
                ...(!app.isPackaged ? [{ role: 'toggleDevTools' }] : []),
                { type: 'separator' },
                { role: 'resetZoom' },
                { role: 'zoomIn' },
                { role: 'zoomOut' },
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

// === KEYSTORE (safeStorage) ===
// Cifra valores sensibles con el keychain del sistema operativo.
// Los datos cifrados se persisten en userData/keystore.json como base64.
const KEYSTORE_PATH = path.join(app.getPath('userData'), 'keystore.json');

function _readKeystore() {
    try {
        if (fs.existsSync(KEYSTORE_PATH)) return JSON.parse(fs.readFileSync(KEYSTORE_PATH, 'utf8'));
    } catch {}
    return {};
}

function _writeKeystore(store) {
    fs.writeFileSync(KEYSTORE_PATH, JSON.stringify(store), 'utf8');
}

ipcMain.handle('keystore-get', (event, key) => {
    if (!safeStorage.isEncryptionAvailable()) return null;
    const store = _readKeystore();
    if (!store[key]) return null;
    try { return safeStorage.decryptString(Buffer.from(store[key], 'base64')); }
    catch { return null; }
});

ipcMain.handle('keystore-set', (event, key, value) => {
    if (!safeStorage.isEncryptionAvailable()) return false;
    const store = _readKeystore();
    store[key] = safeStorage.encryptString(value).toString('base64');
    _writeKeystore(store);
    return true;
});

ipcMain.handle('keystore-remove', (event, key) => {
    const store = _readKeystore();
    delete store[key];
    _writeKeystore(store);
    return true;
});

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
            }
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

ipcMain.handle('create-compassai-workspace', async (event, workspaceName) => {
    const senderId = event.sender.id;
    const targetWindow = windowData.get(senderId)?.window;

    const result = await dialog.showOpenDialog(targetWindow, {
        properties: ['openDirectory', 'createDirectory'],
        title: 'Selecciona dónde crear tu workspace CompassAI',
        buttonLabel: 'Crear aquí'
    });

    if (!result || result.canceled || result.filePaths.length === 0) {
        return { success: false, error: 'Cancelado por el usuario' };
    }

    const parentDir = result.filePaths[0];

    // Validar que el nombre no contiene separadores de ruta ni caracteres nulos
    if (!workspaceName || /[/\\\0]/.test(workspaceName) || workspaceName === '.' || workspaceName === '..') {
        return { success: false, error: 'Nombre de workspace inválido' };
    }
    const targetDir = path.join(parentDir, workspaceName);
    // Verificar que el resultado final sigue dentro del directorio elegido
    if (!targetDir.startsWith(parentDir + path.sep)) {
        return { success: false, error: 'Nombre de workspace inválido' };
    }

    const templateDir = path.join(__dirname, 'templates', 'compassai');

    const fs = require('fs');

    // Helper function to recursively copy from asar to normal filesystem
    function copyDirFromAsar(src, dest) {
        if (!fs.existsSync(dest)) {
            fs.mkdirSync(dest, { recursive: true });
        }

        const entries = fs.readdirSync(src, { withFileTypes: true });
        for (const entry of entries) {
            const srcPath = path.join(src, entry.name);
            const destPath = path.join(dest, entry.name);

            if (entry.isDirectory()) {
                copyDirFromAsar(srcPath, destPath);
            } else {
                fs.copyFileSync(srcPath, destPath);
            }
        }
    }

    try {
        if (fs.existsSync(targetDir)) {
            return { success: false, error: 'La carpeta ya existe' };
        }

        copyDirFromAsar(templateDir, targetDir);

        return { success: true, path: targetDir };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

ipcMain.on('set-window-title', (event, data) => {
    const senderId = event.sender.id;
    const targetWindow = windowData.get(senderId)?.window;
    if (targetWindow && !targetWindow.isDestroyed()) {
        const title = typeof data === 'string' ? data : data.title;
        const representedPath = typeof data === 'object' ? data.path : null;
        
        targetWindow.setTitle(title);
        if (representedPath) {
            targetWindow.setRepresentedFilename(representedPath);
        }
    }
});

// ---- Coda API proxy (avoids CORS from renderer) ----
const HTTPS_TIMEOUT_MS = 10000; // 10 s máximo para cualquier request a APIs externas

ipcMain.handle('coda-api-request', async (event, { path: apiPath, apiKey }) => {
    const https = require('https');
    return new Promise((resolve) => {
        const options = {
            hostname: 'coda.io',
            path: `/apis/v1${apiPath}`,
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Accept': 'application/json'
            }
        };
        const req = https.request(options, (res) => {
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
        req.setTimeout(HTTPS_TIMEOUT_MS, () => {
            req.destroy();
            resolve({ ok: false, error: 'timeout', data: null });
        });
        req.on('error', (err) => resolve({ ok: false, error: err.message, data: null }));
        req.end();
    });
});

// ---- Notion API proxy (avoids CORS from renderer) ----
ipcMain.handle('notion-api-request', async (event, { path: apiPath, method = 'GET', body = null, apiKey }) => {
    const https = require('https');
    return new Promise((resolve) => {
        const options = {
            hostname: 'api.notion.com',
            path: `/v1${apiPath}`,
            method: method,
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Notion-Version': '2022-06-28',
                'Content-Type': 'application/json'
            }
        };
        const req = https.request(options, (res) => {
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
        req.setTimeout(HTTPS_TIMEOUT_MS, () => {
            req.destroy();
            resolve({ ok: false, error: 'timeout', data: null });
        });
        req.on('error', (err) => resolve({ ok: false, error: err.message, data: null }));
        if (body) {
            req.write(JSON.stringify(body));
        }
        req.end();
    });
});

app.whenReady().then(async () => {
    setupMenu();
    // Start with a generic directory. The frontend will override this via API per window.
    process.env.PMOS_ROOT_DIR = path.resolve(__dirname, '..');

    // Create initial window
    await createWindow();

    app.on('activate', async () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            await createWindow();
        }
    });
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
});
