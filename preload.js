// preload.js — corre en el renderer ANTES que tu UI, con acceso a Node.
// Expone una API estrecha en window.api vía contextBridge, de forma que el
// renderer no necesita ni nodeIntegration ni acceso directo a `require`.

const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('api', {
    // ── Invoke (request/response) ────────────────────────────────────────────
    selectFolder: () => ipcRenderer.invoke('select-folder'),
    selectFile:   () => ipcRenderer.invoke('select-file'),

    // Abre una URL externa (http/https) en el navegador por defecto del SO.
    // Otros protocolos devuelven false sin abrir nada.
    openExternal: (url) => ipcRenderer.invoke('open-external', url),

    // Abre un fichero .html del workspace local en el navegador del SO.
    // Path relativo al ROOT_DIR; validado en main.
    openPathInBrowser: (relPath) => ipcRenderer.invoke('open-path-in-browser', relPath),

    // Proxy HTTP a Ollama (típicamente http://localhost:11434). Sólo para
    // listar modelos — la conversación la lleva el CLI `ollama` en un terminal.
    ollamaApiRequest: (payload) => ipcRenderer.invoke('ollama-api-request', payload),

    protoServerStart: (folderPath) => ipcRenderer.invoke('proto-server-start', folderPath),
    protoServerStop:  (folderPath) => ipcRenderer.invoke('proto-server-stop', folderPath),

    terminalStart: (opts) => ipcRenderer.invoke('terminal-start', opts),

    // Persistencia del scrollback (recuperación tras cierre/crash)
    terminalHistorySave:   (payload) => ipcRenderer.invoke('terminal-history-save', payload),
    terminalHistoryReveal: ()        => ipcRenderer.invoke('terminal-history-reveal'),

    // ── Send (fire-and-forget) ───────────────────────────────────────────────
    terminalInput:  (id, input)       => ipcRenderer.send('terminal-input',  { id, input }),
    terminalKill:   (id)              => ipcRenderer.send('terminal-kill',   { id }),
    terminalResize: (id, cols, rows)  => ipcRenderer.send('terminal-resize', { id, cols, rows }),
    // Ruta del settings.json con los hooks de estado (o null si no se pudo crear)
    agentHooksSettings: () => ipcRenderer.invoke('agent-hooks-settings'),
    // Registros de /objetivo: cabecera para el panel y abrir con la app del SO
    objectiveRead: (filePath) => ipcRenderer.invoke('objective-read', filePath),
    objectiveOpen: (filePath) => ipcRenderer.invoke('objective-open', filePath),
    terminalNotify: (payload)         => ipcRenderer.send('terminal-notify', payload),
    setWindowTitle: (payload)         => ipcRenderer.send('set-window-title', payload),

    // ── Listeners (main → renderer) ──────────────────────────────────────────
    // El callback recibe el payload directamente (sin el `event` de IPC, que
    // no se puede pasar a través del bridge porque contiene refs internas).
    onTerminalOutput: (cb) => ipcRenderer.on('terminal-output', (_event, payload) => cb(payload)),
    onTerminalExit:   (cb) => ipcRenderer.on('terminal-exit',   (_event, payload) => cb(payload)),
    onSoftRefresh:    (cb) => ipcRenderer.on('soft-refresh',    () => cb()),
    onFocusPane:      (cb) => ipcRenderer.on('focus-pane',      (_event, payload) => cb(payload)),
    onAgentStatus:    (cb) => ipcRenderer.on('agent-status',    (_event, payload) => cb(payload)),

    // ── Helpers no-IPC ───────────────────────────────────────────────────────
    // webUtils.getPathForFile(file) — devuelve la ruta absoluta de un File
    // arrastrado desde el SO (drag & drop). Necesario porque el File del
    // renderer no expone .path con contextIsolation: true.
    getPathForFile: (file) => webUtils.getPathForFile(file),
});
