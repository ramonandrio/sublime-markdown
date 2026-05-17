// preload.js — corre en el renderer ANTES que tu UI, con acceso a Node.
// Expone una API estrecha en window.api vía contextBridge, de forma que el
// renderer no necesita ni nodeIntegration ni acceso directo a `require`.

const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('api', {
    // ── Invoke (request/response) ────────────────────────────────────────────
    selectFolder: () => ipcRenderer.invoke('select-folder'),
    selectFile:   () => ipcRenderer.invoke('select-file'),

    codaApiRequest:   (payload) => ipcRenderer.invoke('coda-api-request', payload),
    notionApiRequest: (payload) => ipcRenderer.invoke('notion-api-request', payload),

    protoServerStart: (folderPath) => ipcRenderer.invoke('proto-server-start', folderPath),
    protoServerStop:  (folderPath) => ipcRenderer.invoke('proto-server-stop', folderPath),

    terminalStart: (opts) => ipcRenderer.invoke('terminal-start', opts),

    // ── Send (fire-and-forget) ───────────────────────────────────────────────
    terminalInput:  (id, input)       => ipcRenderer.send('terminal-input',  { id, input }),
    terminalKill:   (id)              => ipcRenderer.send('terminal-kill',   { id }),
    terminalResize: (id, cols, rows)  => ipcRenderer.send('terminal-resize', { id, cols, rows }),
    terminalNotify: (payload)         => ipcRenderer.send('terminal-notify', payload),
    setWindowTitle: (payload)         => ipcRenderer.send('set-window-title', payload),

    // ── Listeners (main → renderer) ──────────────────────────────────────────
    // El callback recibe el payload directamente (sin el `event` de IPC, que
    // no se puede pasar a través del bridge porque contiene refs internas).
    onTerminalOutput: (cb) => ipcRenderer.on('terminal-output', (_event, payload) => cb(payload)),
    onTerminalExit:   (cb) => ipcRenderer.on('terminal-exit',   (_event, payload) => cb(payload)),
    onSoftRefresh:    (cb) => ipcRenderer.on('soft-refresh',    () => cb()),

    // ── Helpers no-IPC ───────────────────────────────────────────────────────
    // webUtils.getPathForFile(file) — devuelve la ruta absoluta de un File
    // arrastrado desde el SO (drag & drop). Necesario porque el File del
    // renderer no expone .path con contextIsolation: true.
    getPathForFile: (file) => webUtils.getPathForFile(file),
});
