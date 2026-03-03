const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('path');

let mainWindow;
let server;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        title: "SublimeOS (Sublime Markdown)",
        titleBarStyle: 'hiddenInset', // Adds a native Mac feel
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    const port = server.address().port;
    mainWindow.loadURL(`http://localhost:${port}`);
}

// === TERMINAL IPC HANDLERS ===
ipcMain.handle('terminal-start', async (event, { cwd, command }) => {
    try {
        const terminalManager = require('./terminal-manager');
        const activeCwd = cwd || (server && server.getRootDir ? server.getRootDir() : process.env.PMOS_ROOT_DIR) || process.env.HOME;

        const id = terminalManager.startTerminal(
            activeCwd,
            command,
            // onData: enviar output al frontend
            (id, data, type) => {
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('terminal-output', { id, data, type });
                }
            },
            // onExit: notificar cierre
            (id, code) => {
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('terminal-exit', { id, code });
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
ipcMain.handle('select-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory', 'createDirectory'],
        title: 'Selecciona tu base documental (Carpeta SublimeOS)',
        buttonLabel: 'Abrir en SublimeOS'
    });
    if (!result || result.canceled || result.filePaths.length === 0) {
        return null;
    }
    return result.filePaths[0];
});

app.whenReady().then(() => {
    // Start with a generic directory. The frontend will override this via API
    process.env.PMOS_ROOT_DIR = path.resolve(__dirname, '..');
    server = require('./server.js');

    if (server.listening) {
        createWindow();
    } else {
        server.on('listening', () => {
            createWindow();
        });
    }

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0 && server) {
            createWindow();
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
    if (server) {
        server.close();
    }
});
