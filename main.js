const { app, BrowserWindow, dialog, ipcMain, Menu } = require('electron');
const path = require('path');
const { createServer } = require('./server.js');

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
            contextIsolation: false
        }
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

    mainWindow.loadURL(`http://localhost:${port}`);
    return mainWindow;
}

// Function to get the server tied to the IPC request sender
function getServerFromSender(webContentsId) {
    const data = windowData.get(webContentsId);
    if (!data) {
        console.warn(`[main] getServerFromSender: no window registered for webContents id=${webContentsId}`);
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
                { role: 'toggleDevTools' },
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

// === TERMINAL IPC HANDLERS ===
ipcMain.handle('terminal-start', async (event, { cwd, command }) => {
    try {
        const terminalManager = require('./terminal-manager');
        const senderId = event.sender.id;
        const server = getServerFromSender(senderId);

        const activeCwd = cwd || (server && typeof server.getRootDir === 'function' ? server.getRootDir() : null) || process.env.PMOS_ROOT_DIR || process.env.HOME;

        const id = terminalManager.startTerminal(
            activeCwd,
            command,
            // onData: enviar output al frontend
            (id, data, type) => {
                const targetWindow = windowData.get(senderId)?.window;
                if (targetWindow && !targetWindow.isDestroyed()) {
                    targetWindow.webContents.send('terminal-output', { id, data, type });
                }
            },
            // onExit: notificar cierre
            (id, code) => {
                const targetWindow = windowData.get(senderId)?.window;
                if (targetWindow && !targetWindow.isDestroyed()) {
                    targetWindow.webContents.send('terminal-exit', { id, code });
                }
            }
        );
        return { success: true, id };
    } catch (err) {
        return { success: false, error: err.message };
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
    const targetDir = path.join(parentDir, workspaceName);
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
