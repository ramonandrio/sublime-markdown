/**
 * CHAT.JS - Terminal con split de paneles estilo tmux
 *
 * Para revertir: cp chat.js.pre-split-backup chat.js && cp styles.css.pre-split-backup styles.css
 *
 * Atajos de teclado (cuando el panel de terminal está abierto):
 *   Ctrl+Shift+D  →  dividir horizontalmente (izquierda / derecha)
 *   Ctrl+Shift+E  →  dividir verticalmente   (arriba / abajo)
 *   Ctrl+Shift+W  →  cerrar panel activo
 */

let Terminal, FitAddon, WebglAddon, WebLinksAddon;

function loadTerminalLibs() {
    if (Terminal) return true;
    try {
        if (typeof window.require !== 'undefined') {
            const xterm = window.require('@xterm/xterm');
            Terminal = xterm.Terminal || xterm;
            FitAddon = window.require('@xterm/addon-fit').FitAddon;
            try { WebglAddon = window.require('@xterm/addon-webgl').WebglAddon; } catch (_) {}
            try { WebLinksAddon = window.require('@xterm/addon-web-links').WebLinksAddon; } catch (_) {}
            return !!Terminal;
        }
    } catch (e) { console.error('Error xterm libs:', e); }
    return false;
}

// Temas de terminal por pane (inspirados en macOS Terminal.app)
const PANE_THEMES = {
    'Basic': {
        background: '#FAFAFA', foreground: '#5C6166', cursor: '#F29718', cursorAccent: '#FAFAFA',
        selectionBackground: 'rgba(54, 163, 217, 0.2)',
        black: '#5C6166', red: '#F07178', green: '#86B300', yellow: '#F29718',
        blue: '#36A3D9', magenta: '#A37ACC', cyan: '#4CBF99', white: '#8A9199',
        brightBlack: '#ADB1B8', brightRed: '#F07178', brightGreen: '#86B300',
        brightYellow: '#F29718', brightBlue: '#36A3D9', brightMagenta: '#A37ACC',
        brightCyan: '#4CBF99', brightWhite: '#D5D8DA',
        _meta: { dark: false, headerBg: '#f0f0f0', headerFg: '#888', headerBorder: '#e0e0e0', dot: '#FAFAFA' }
    },
    'Pro': {
        background: '#1A1A1A', foreground: '#F2F2F2', cursor: '#4DD2FF', cursorAccent: '#1A1A1A',
        selectionBackground: 'rgba(77, 210, 255, 0.25)',
        black: '#000000', red: '#FF6B6B', green: '#69FF94', yellow: '#FFEE54',
        blue: '#6CB6FF', magenta: '#D2A8FF', cyan: '#76E3EA', white: '#C7C7C7',
        brightBlack: '#686868', brightRed: '#FF6B6B', brightGreen: '#69FF94',
        brightYellow: '#FFEE54', brightBlue: '#6CB6FF', brightMagenta: '#D2A8FF',
        brightCyan: '#76E3EA', brightWhite: '#FFFFFF',
        _meta: { dark: true, headerBg: '#111111', headerFg: '#999', headerBorder: '#333', dot: '#1A1A1A' }
    },
    'Ocean': {
        background: '#1B2B34', foreground: '#CDD3DE', cursor: '#6699CC', cursorAccent: '#1B2B34',
        selectionBackground: 'rgba(102, 153, 204, 0.25)',
        black: '#1B2B34', red: '#EC5F67', green: '#99C794', yellow: '#FAC863',
        blue: '#6699CC', magenta: '#C594C5', cyan: '#5FB3B3', white: '#CDD3DE',
        brightBlack: '#65737E', brightRed: '#EC5F67', brightGreen: '#99C794',
        brightYellow: '#FAC863', brightBlue: '#6699CC', brightMagenta: '#C594C5',
        brightCyan: '#5FB3B3', brightWhite: '#D8DEE9',
        _meta: { dark: true, headerBg: '#152028', headerFg: '#65737E', headerBorder: '#2B3F4B', dot: '#1B2B34' }
    },
    'Grass': {
        background: '#13381E', foreground: '#D0E8C8', cursor: '#73C936', cursorAccent: '#13381E',
        selectionBackground: 'rgba(115, 201, 54, 0.2)',
        black: '#0A2414', red: '#E55A5A', green: '#73C936', yellow: '#C6C43F',
        blue: '#5DABCF', magenta: '#B771DC', cyan: '#5FD79D', white: '#D0E8C8',
        brightBlack: '#4A7A5B', brightRed: '#E55A5A', brightGreen: '#73C936',
        brightYellow: '#C6C43F', brightBlue: '#5DABCF', brightMagenta: '#B771DC',
        brightCyan: '#5FD79D', brightWhite: '#E8F5E2',
        _meta: { dark: true, headerBg: '#0D2A16', headerFg: '#5A8A6A', headerBorder: '#1A4A2A', dot: '#13381E' }
    },
    'Homebrew': {
        background: '#0A0A0A', foreground: '#00FF00', cursor: '#00FF00', cursorAccent: '#0A0A0A',
        selectionBackground: 'rgba(0, 255, 0, 0.15)',
        black: '#0A0A0A', red: '#FF0000', green: '#00FF00', yellow: '#FFFF00',
        blue: '#0066FF', magenta: '#FF00FF', cyan: '#00FFFF', white: '#CCCCCC',
        brightBlack: '#555555', brightRed: '#FF0000', brightGreen: '#00FF00',
        brightYellow: '#FFFF00', brightBlue: '#0066FF', brightMagenta: '#FF00FF',
        brightCyan: '#00FFFF', brightWhite: '#FFFFFF',
        _meta: { dark: true, headerBg: '#050505', headerFg: '#00AA00', headerBorder: '#1A3A1A', dot: '#0A0A0A' }
    },
    'Man Page': {
        background: '#FEF49C', foreground: '#000000', cursor: '#7F7F7F', cursorAccent: '#FEF49C',
        selectionBackground: 'rgba(0, 0, 0, 0.15)',
        black: '#000000', red: '#CC0000', green: '#00A600', yellow: '#999900',
        blue: '#0000B2', magenta: '#B200B2', cyan: '#00A6B2', white: '#CCCCCC',
        brightBlack: '#666666', brightRed: '#E50000', brightGreen: '#00D900',
        brightYellow: '#E5E500', brightBlue: '#0000FF', brightMagenta: '#E500E5',
        brightCyan: '#00E5E5', brightWhite: '#E5E5E5',
        _meta: { dark: false, headerBg: '#F0E88C', headerFg: '#666600', headerBorder: '#D4CC6A', dot: '#FEF49C' }
    },
    'Novel': {
        background: '#DFDBC3', foreground: '#3B2322', cursor: '#3B2322', cursorAccent: '#DFDBC3',
        selectionBackground: 'rgba(59, 35, 34, 0.15)',
        black: '#3B2322', red: '#CC0000', green: '#00A600', yellow: '#999900',
        blue: '#0000B2', magenta: '#B200B2', cyan: '#00A6B2', white: '#CCCCCC',
        brightBlack: '#666666', brightRed: '#E50000', brightGreen: '#00D900',
        brightYellow: '#E5E500', brightBlue: '#0000FF', brightMagenta: '#E500E5',
        brightCyan: '#00E5E5', brightWhite: '#E5E5E5',
        _meta: { dark: false, headerBg: '#D0CCA8', headerFg: '#6B5B4B', headerBorder: '#BBB48E', dot: '#DFDBC3' }
    },
    'Red Sands': {
        background: '#7A2D21', foreground: '#D7C9A7', cursor: '#D7C9A7', cursorAccent: '#7A2D21',
        selectionBackground: 'rgba(215, 201, 167, 0.2)',
        black: '#000000', red: '#FF6640', green: '#00CC00', yellow: '#FFCC00',
        blue: '#0099CC', magenta: '#CC00FF', cyan: '#00CCCC', white: '#D7C9A7',
        brightBlack: '#555555', brightRed: '#FF6640', brightGreen: '#00CC00',
        brightYellow: '#FFCC00', brightBlue: '#0099CC', brightMagenta: '#CC00FF',
        brightCyan: '#00CCCC', brightWhite: '#FFFFFF',
        _meta: { dark: true, headerBg: '#5E2219', headerFg: '#BDA888', headerBorder: '#4A1A12', dot: '#7A2D21' }
    },
    'Silver Aerogel': {
        background: '#929292', foreground: '#000000', cursor: '#000000', cursorAccent: '#929292',
        selectionBackground: 'rgba(0, 0, 0, 0.2)',
        black: '#000000', red: '#BB0000', green: '#00BB00', yellow: '#BBBB00',
        blue: '#0000BB', magenta: '#BB00BB', cyan: '#00BBBB', white: '#BBBBBB',
        brightBlack: '#555555', brightRed: '#FF5555', brightGreen: '#55FF55',
        brightYellow: '#FFFF55', brightBlue: '#5555FF', brightMagenta: '#FF55FF',
        brightCyan: '#55FFFF', brightWhite: '#FFFFFF',
        _meta: { dark: false, headerBg: '#858585', headerFg: '#333', headerBorder: '#7A7A7A', dot: '#929292' }
    },
    'Solid Colors': {
        background: '#000000', foreground: '#FFFFFF', cursor: '#FFFFFF', cursorAccent: '#000000',
        selectionBackground: 'rgba(255, 255, 255, 0.2)',
        black: '#000000', red: '#FF0000', green: '#00FF00', yellow: '#FFFF00',
        blue: '#0000FF', magenta: '#FF00FF', cyan: '#00FFFF', white: '#FFFFFF',
        brightBlack: '#808080', brightRed: '#FF0000', brightGreen: '#00FF00',
        brightYellow: '#FFFF00', brightBlue: '#0000FF', brightMagenta: '#FF00FF',
        brightCyan: '#00FFFF', brightWhite: '#FFFFFF',
        _meta: { dark: true, headerBg: '#000000', headerFg: '#808080', headerBorder: '#333', dot: '#000000' }
    },
    'Clear Dark': {
        background: '#262626', foreground: '#E0E0E0', cursor: '#BBBBBB', cursorAccent: '#262626',
        selectionBackground: 'rgba(187, 187, 187, 0.2)',
        black: '#000000', red: '#E06C75', green: '#98C379', yellow: '#E5C07B',
        blue: '#61AFEF', magenta: '#C678DD', cyan: '#56B6C2', white: '#ABB2BF',
        brightBlack: '#5C6370', brightRed: '#E06C75', brightGreen: '#98C379',
        brightYellow: '#E5C07B', brightBlue: '#61AFEF', brightMagenta: '#C678DD',
        brightCyan: '#56B6C2', brightWhite: '#FFFFFF',
        _meta: { dark: true, headerBg: '#1C1C1C', headerFg: '#888', headerBorder: '#383838', dot: '#262626' }
    },
    'Clear Light': {
        background: '#FFFFFF', foreground: '#383A42', cursor: '#526FFF', cursorAccent: '#FFFFFF',
        selectionBackground: 'rgba(82, 111, 255, 0.15)',
        black: '#383A42', red: '#E45649', green: '#50A14F', yellow: '#C18401',
        blue: '#4078F2', magenta: '#A626A4', cyan: '#0184BC', white: '#A0A1A7',
        brightBlack: '#4F525E', brightRed: '#E45649', brightGreen: '#50A14F',
        brightYellow: '#C18401', brightBlue: '#4078F2', brightMagenta: '#A626A4',
        brightCyan: '#0184BC', brightWhite: '#FAFAFA',
        _meta: { dark: false, headerBg: '#F0F0F0', headerFg: '#888', headerBorder: '#E0E0E0', dot: '#FFFFFF' }
    }
};

// Tema default (sin _meta para xterm)
const TERM_THEME = (() => { const t = Object.assign({}, PANE_THEMES['Basic']); delete t._meta; return t; })();

// =============================================================================
// TerminalController
// =============================================================================
class TerminalController {
    constructor() {
        // tabs:  tabId → { tabId, tabBtn, containerEl, rootNode, activeLeafPtyId, linkedFileId }
        this.tabs  = new Map();
        // panes: ptyId → { ptyId, term, fit, leafNode, tabId, linkedFileId }
        this.panes = new Map();
        this.activeTabId = null;
        this._skipNotify = false;

        this.ipcRenderer = (typeof window.require !== 'undefined')
            ? window.require('electron').ipcRenderer : null;

        // Callback para comunicación bidireccional con app.js
        this.onTerminalActivated = null;

        const init = () => {
            this.panel          = document.getElementById('bottomTerminalPanel');
            this.resizer        = document.getElementById('horizontalResizer');
            this.tabsContainer  = document.getElementById('terminalTabsContainer');
            this.bodyContainer  = document.getElementById('terminalBodyContainer');

            document.getElementById('newTerminalBtn')
                ?.addEventListener('click', () => this.createTab());
            document.getElementById('closeTerminalPanelBtn')
                ?.addEventListener('click', () => this.closeAll());

            // Botón "Adjuntar" de la toolbar: abre picker nativo y envía rutas al pane activo
            document.getElementById('toolbarAttachBtn')
                ?.addEventListener('click', () => this._attachFilesFromPicker());

            this._initPanelResizer();
            this._initIpc();
            this._initKeyboard();
        };

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', init);
        } else {
            init();
        }
    }

    // ── IPC ──────────────────────────────────────────────────────────────────
    _initIpc() {
        if (!this.ipcRenderer) return;

        this.ipcRenderer.on('terminal-output', (event, { id, data }) => {
            const pane = this.panes.get(id);
            if (!pane) return;
            pane._writeBuf = (pane._writeBuf || '') + data;
            pane._recentOutput = ((pane._recentOutput || '') + data).slice(-2000);
            // Debounce: reiniciamos el timer con cada chunk nuevo para acumular
            // todo un ciclo de actualización de Gemini (cursor move + clear + redraw + status bar)
            // antes de escribir. El wrap con ESC[?2026h/l hace el render atómico en xterm.js v6.
            if (pane._writeTimer) clearTimeout(pane._writeTimer);
            pane._writeTimer = setTimeout(() => {
                const buf = pane._writeBuf;
                pane._writeBuf = '';
                pane._writeTimer = null;
                pane.term.write('\x1b[?2026h' + buf + '\x1b[?2026l');
            }, 16);

            // Detección de caída de output: para procesos interactivos (Claude, etc.)
            // Status bar updates: 58-103 bytes. Respuesta real: >200 bytes.
            const significantOutput = data.length > 200;
            if (significantOutput) {
                const now = Date.now();
                if (!pane._activityStart) pane._activityStart = now;
                pane._lastSignificantOutput = now;
                pane._activityNotified = false;

                // Indicador visual de actividad en la pestaña
                const tab = this.tabs.get(pane.tabId);
                const cmd = (pane.shellState?.currentCommand || '').trim().toLowerCase();
                const isClaudeCmd = /^(claude|claude\s)/.test(cmd);
                pane._isClaudeCmd = isClaudeCmd;
                const thinkingClass = isClaudeCmd ? 'claude-thinking' : 'terminal-busy';
                if (tab) {
                    tab.tabBtn.classList.remove('claude-thinking', 'terminal-busy', 'claude-waiting');
                    tab.tabBtn.classList.add(thinkingClass);
                }

                // Timer: si no hay output significativo en 8s, la respuesta terminó
                if (pane._silenceTimer) clearTimeout(pane._silenceTimer);
                pane._silenceTimer = setTimeout(() => {
                    const activityDuration = (pane._lastSignificantOutput || now) - pane._activityStart;
                    if (pane._activityNotified) return;
                    pane._activityStart = null;
                    pane._silenceTimer = null;
                    pane._activityNotified = true;

                    // Actualizar indicador visual
                    if (tab) {
                        tab.tabBtn.classList.remove('claude-thinking', 'terminal-busy', 'claude-waiting');
                        if (pane._isClaudeCmd && this._needsUserAction(pane._recentOutput || '')) {
                            tab.tabBtn.classList.add('claude-waiting');
                        }
                    }

                    // Solo notificar si hubo actividad significativa >= 5s
                    if (activityDuration >= 5000) {
                        this._onCommandFinished(id, {
                            command: pane.shellState?.currentCommand || 'Respuesta completada',
                            exitCode: 0,
                            duration: activityDuration
                        });
                    }
                }, 8000);
            }
        });

        this.ipcRenderer.on('terminal-exit', (event, { id }) => {
            // El PTY terminó inesperadamente
            if (this.panes.has(id)) this.closePane(id);
        });
    }

    // ── Atajos de teclado ─────────────────────────────────────────────────────
    _initKeyboard() {
        document.addEventListener('keydown', (e) => {
            if (!this.activeTabId) return;
            if (this.panel.style.display === 'none') return;
            const tab = this.tabs.get(this.activeTabId);
            if (!tab?.activeLeafPtyId) return;

            if (e.ctrlKey && e.shiftKey) {
                if (e.key === 'D') { e.preventDefault(); this.splitPane(tab.activeLeafPtyId, 'h'); }
                if (e.key === 'E') { e.preventDefault(); this.splitPane(tab.activeLeafPtyId, 'v'); }
                if (e.key === 'W') { e.preventDefault(); this.closePane(tab.activeLeafPtyId); }
            }
        });
    }

    // ── Bloquear/desbloquear iframes y webviews durante el drag ─────────────
    // Sin esto, cuando el cursor entra en un iframe (Coda, Notion, HTML preview)
    // durante un resize, el iframe captura los eventos del ratón y el drag se pierde.
    _blockEmbeds(block) {
        const style = block ? 'none' : '';
        document.querySelectorAll('iframe, webview').forEach(el => {
            el.style.pointerEvents = style;
        });
    }

    // ── Resizer del panel principal (entre content y terminal) ────────────────
    _initPanelResizer() {
        let isResizing = false;

        this.resizer.addEventListener('mousedown', (e) => {
            isResizing = true;
            document.body.style.cursor = 'row-resize';
            this.resizer.classList.add('is-resizing');
            this._blockEmbeds(true);
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isResizing) return;
            const newH = window.innerHeight - e.clientY;
            if (newH > 100 && newH < window.innerHeight * 0.8) {
                this.panel.style.height = `${newH}px`;
                this._fitAllVisible(false);
            }
        });

        document.addEventListener('mouseup', () => {
            if (!isResizing) return;
            isResizing = false;
            document.body.style.cursor = 'default';
            this.resizer.classList.remove('is-resizing');
            this._blockEmbeds(false);
            this._fitAllVisible();
        });
    }

    // ── Crear nueva pestaña con un único pane ─────────────────────────────────
    async createTab(options = {}) {
        if (!loadTerminalLibs()) return;
        if (!this.ipcRenderer) return;

        // Auto-vincular con el archivo activo (igual que antes)
        if (!options.fileId && window.app?.getActiveTabId) {
            const id   = window.app.getActiveTabId();
            const name = window.app.getActiveTabName();
            const alreadyLinked = [...this.panes.values()].some(p => p.linkedFileId === id);
            if (id && !alreadyLinked) { options.fileId = id; options.fileName = name; }
        }

        const tabId = crypto.randomUUID();
        const label = options.fileName || 'Terminal';

        // Botón de pestaña
        const tabBtn = document.createElement('div');
        tabBtn.className = 'terminal-tab';
        tabBtn.dataset.tabId = tabId;
        tabBtn.innerHTML = `<span class="terminal-tab-name">${label}</span><div class="terminal-tab-close">×</div>`;

        let clickTimer = null;
        tabBtn.addEventListener('click', (e) => {
            if (e.target.classList.contains('terminal-tab-close')) {
                this.closeTab(tabId);
                return;
            }
            const span = tabBtn.querySelector('span');
            if (span.contentEditable === 'true') return;

            if (clickTimer) {
                clearTimeout(clickTimer);
                clickTimer = null;
            } else {
                clickTimer = setTimeout(() => {
                    this.switchTab(tabId);
                    clickTimer = null;
                }, 250);
            }
        });

        tabBtn.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; }
            this._renameTab(tabId);
        });

        this.tabsContainer.appendChild(tabBtn);

        // Contenedor de la pestaña (fill absolute en terminal-body)
        const containerEl = document.createElement('div');
        containerEl.className = 'terminal-tab-view';
        this.bodyContainer.appendChild(containerEl);

        const tab = {
            tabId,
            tabBtn,
            containerEl,
            rootNode: null,
            activeLeafPtyId: null,
            linkedFileId: options.fileId || null
        };
        this.tabs.set(tabId, tab);

        // Mostrar panel
        this.panel.style.display = 'flex';
        this.resizer.style.display = 'block';

        // Lanzar PTY
        const ptyRes = await this.ipcRenderer.invoke('terminal-start', { cwd: null });
        if (!ptyRes?.ok) { this.closeTab(tabId); return; }

        // Crear nodo hoja y montarlo
        const leafNode = this._makeLeafNode(ptyRes.id, tabId, options);
        tab.rootNode = leafNode;
        containerEl.appendChild(leafNode.el);

        this.switchTab(tabId);

        // Doble RAF: asegura que el layout está pintado antes de medir el contenedor
        requestAnimationFrame(() => requestAnimationFrame(() => {
            this._fitLeaf(leafNode);
            this.panes.get(ptyRes.id)?.term.focus();
        }));
    }

    // ── Crear nodo hoja: un PTY + xterm ──────────────────────────────────────
    _makeLeafNode(ptyId, tabId, options = {}) {
        const leafNode = { type: 'leaf', ptyId, el: null, termEl: null, parent: null };

        // Contenedor del pane
        const el = document.createElement('div');
        el.className = 'pane-leaf';
        el.dataset.ptyId = ptyId;

        // Cabecera del pane
        const header = document.createElement('div');
        header.className = 'pane-header';
        header.innerHTML = `
            <span class="pane-title">${options.fileName || 'Terminal'}</span>
            <div class="pane-header-actions">
                <div class="pane-theme-picker">
                    <button class="pane-btn pane-theme-btn" title="Tema del pane">
                        <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" stroke-width="1.3">
                            <circle cx="5.5" cy="5.5" r="4.5"/>
                            <circle cx="5.5" cy="5.5" r="2" fill="currentColor"/>
                        </svg>
                    </button>
                    <div class="pane-theme-dropdown"></div>
                </div>
                <button class="pane-btn pane-split-h-btn" title="Dividir horizontalmente — arriba/abajo (Ctrl+Shift+D)">
                    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" stroke-width="1.5">
                        <rect x="0.5" y="0.5" width="10" height="10" rx="1.5"/>
                        <line x1="0.5" y1="5.5" x2="10.5" y2="5.5"/>
                    </svg>
                </button>
                <button class="pane-btn pane-split-v-btn" title="Dividir verticalmente — lado a lado (Ctrl+Shift+E)">
                    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" stroke-width="1.5">
                        <rect x="0.5" y="0.5" width="10" height="10" rx="1.5"/>
                        <line x1="5.5" y1="0.5" x2="5.5" y2="10.5"/>
                    </svg>
                </button>
                <button class="pane-btn pane-close-btn" title="Cerrar pane (Ctrl+Shift+W)">×</button>
            </div>`;

        // Área del terminal xterm
        const termEl = document.createElement('div');
        termEl.className = 'pane-terminal';

        el.appendChild(header);
        el.appendChild(termEl);

        leafNode.el     = el;
        leafNode.termEl = termEl;

        // Motor xterm.js
        const term = new Terminal({
            cursorBlink: false, // el blink interfiere con redraws rápidos de TUIs (Gemini, etc.)
            fontFamily:  'JetBrains Mono, Menlo, Monaco, Courier New, monospace',
            fontSize:    13,
            lineHeight:  1.2,
            theme:       TERM_THEME,
            convertEol:  true,
            overviewRulerWidth: 0, // deshabilita el overview ruler (menos trabajo de render)
        });
        const fit = new FitAddon();
        term.loadAddon(fit);
        if (WebLinksAddon) {
            term.loadAddon(new WebLinksAddon());
        }
        term.open(termEl);

        // WebGL renderer: reduce el flickering del status bar de TUIs como Gemini
        if (WebglAddon) {
            try {
                const webgl = new WebglAddon();
                webgl.onContextLoss(() => webgl.dispose()); // fallback si pierde contexto GPU
                term.loadAddon(webgl);
            } catch (_) { /* fallback al canvas renderer si WebGL no está disponible */ }
        }

        // Link provider: rutas de archivo clickeables que abren en el visor
        // Link provider: rutas de archivo clickeables que abren en el visor
        const VIEWABLE_EXT = new Set(['md','html','htm','txt','js','jsx','ts','tsx','css','scss',
            'json','yaml','yml','xml','svg','py','rb','go','rs','java','c','cpp','h',
            'sh','bash','zsh','toml','ini','cfg','env','log','sql','graphql','vue',
            'svelte','astro','php','swift','kt','cs','r','lua','zig','mjs','cjs']);
        const _isViewable = (p) => VIEWABLE_EXT.has(p.split('.').pop().toLowerCase());
        const _isInProject = (p) => {
            const root = localStorage.getItem('pmos_last_folder');
            if (!root) return false;
            // Ruta absoluta dentro del proyecto
            if (p.startsWith('/')) return p.startsWith(root + '/') || p === root;
            // Ruta relativa: siempre está dentro del proyecto (CWD = root)
            return !p.startsWith('..');
        };
        term.registerLinkProvider({
            provideLinks: (lineNumber, callback) => {
                const buf = term.buffer.active;
                // Concatenar líneas wrapped para obtener el texto lógico completo
                // Buscar la primera línea real (no wrapped) hacia arriba
                let startRow = lineNumber - 1;
                while (startRow > 0 && buf.getLine(startRow)?.isWrapped) startRow--;
                let fullText = '';
                const rowLengths = []; // longitud de cada fila visual
                for (let r = startRow; r < buf.length; r++) {
                    const l = buf.getLine(r);
                    if (!l) break;
                    if (r > startRow && !l.isWrapped) break;
                    // No recortar espacios en filas intermedias (wrapped) para preservar
                    // espacios en el punto de corte al concatenar
                    const nextIsWrapped = buf.getLine(r + 1)?.isWrapped;
                    const t = l.translateToString(!nextIsWrapped);
                    rowLengths.push(t.length);
                    fullText += t;
                }
                // Normalizar Unicode (macOS usa NFD, terminal usa NFC)
                fullText = fullText.normalize('NFC');
                const links = [];
                const root = (localStorage.getItem('pmos_last_folder') || '').normalize('NFC');
                // Convertir offset en fullText a {x, y} de terminal
                const offsetToPos = (offset) => {
                    let remaining = offset;
                    for (let i = 0; i < rowLengths.length; i++) {
                        if (remaining < rowLengths[i]) {
                            return { x: remaining + 1, y: startRow + i + 1 };
                        }
                        remaining -= rowLengths[i];
                    }
                    const lastRow = startRow + rowLengths.length - 1;
                    return { x: rowLengths[rowLengths.length - 1] + 1, y: lastRow + 1 };
                };
                const addLink = (filePath, startOffset, len) => {
                    if (!_isViewable(filePath)) return;
                    const start = offsetToPos(startOffset);
                    const end = offsetToPos(startOffset + len);
                    // Solo añadir si esta línea visual forma parte del rango
                    if (lineNumber < start.y || lineNumber > end.y) return;
                    if (links.some(l => l.range.start.x === start.x && l.range.start.y === start.y)) return;
                    const fp = filePath;
                    links.push({
                        range: { start, end },
                        text: fp,
                        activate: () => { if (window.openFileInViewer) window.openFileInViewer(fp); }
                    });
                };
                // 1) Rutas absolutas del proyecto (con o sin espacios, multi-línea)
                if (root) {
                    let searchFrom = 0;
                    while (true) {
                        const idx = fullText.indexOf(root + '/', searchFrom);
                        if (idx === -1) break;
                        const after = fullText.slice(idx);
                        const extRe = /\.(\w+)/g;
                        let em, found = null;
                        while ((em = extRe.exec(after)) !== null) {
                            if (VIEWABLE_EXT.has(em[1].toLowerCase())) { found = em; break; }
                        }
                        if (found) {
                            const fullLen = found.index + found[0].length;
                            addLink(after.slice(0, fullLen), idx, fullLen);
                            searchFrom = idx + fullLen;
                        } else {
                            searchFrom = idx + root.length;
                        }
                    }
                }
                // 2) Rutas entre comillas: "/.../file.ext"
                const quotedRe = /["'](\/[^"']+\.\w+)["']/g;
                let m;
                while ((m = quotedRe.exec(fullText)) !== null) {
                    if (_isInProject(m[1])) addLink(m[1], m.index + 1, m[1].length);
                }
                // 3) Rutas con backslash-escaped spaces: /path/some\ file.ext
                const escRe = /(\/(?:[^\s\\]|\\.)+\.\w+)/g;
                while ((m = escRe.exec(fullText)) !== null) {
                    const clean = m[1].replace(/\\ /g, ' ').replace(/\\\\/g, '\\');
                    if (_isInProject(clean)) addLink(clean, m.index, m[1].length);
                }
                // 4) Rutas relativas sin espacios: ./path/file.ext, dir/file.ext
                const relRe = /(?:^|[\s"'(])(\.{0,2}\/[\w.@\-/]+\.\w+)(?::(\d+))?/g;
                while ((m = relRe.exec(fullText)) !== null) {
                    const startIdx = m.index + m[0].indexOf(m[1]);
                    addLink(m[1], startIdx, m[1].length);
                }
                // 5) Nombres de archivo conocidos del proyecto (sin ruta, con espacios)
                //    También detecta nombres truncados con "..." (ej: "Playbook de Evals...md")
                const projectFiles = typeof window.getProjectFiles === 'function' ? window.getProjectFiles() : [];
                for (const file of projectFiles) {
                    const name = file.name.normalize('NFC');
                    // Match exacto
                    let idx = 0;
                    while (true) {
                        const pos = fullText.indexOf(name, idx);
                        if (pos === -1) break;
                        if (!links.some(l => {
                            const ls = l.range.start.y === startRow + 1 ? l.range.start.x - 1 : 0;
                            return pos >= ls && pos < ls + l.text.length;
                        })) {
                            addLink(file.path, pos, name.length);
                        }
                        idx = pos + name.length;
                    }
                    // Match truncado: "prefijo...ext" donde el archivo real es "prefijo<rest>.ext"
                    const dotIdx = name.lastIndexOf('.');
                    if (dotIdx === -1) continue;
                    const ext = name.slice(dotIdx); // ".md"
                    // Buscar patrón: cualquier texto + "..." + extensión
                    const truncSuffix = '...' + ext;
                    let ti = 0;
                    while (true) {
                        const tpos = fullText.indexOf(truncSuffix, ti);
                        if (tpos === -1) break;
                        // Retroceder para encontrar el inicio del nombre truncado
                        // Buscar el separador anterior (│, |, \n, inicio de línea, "- ")
                        let tstart = tpos;
                        while (tstart > 0 && fullText[tstart - 1] !== '│' && fullText[tstart - 1] !== '|' &&
                               fullText[tstart - 1] !== '\n') {
                            tstart--;
                        }
                        // Quitar espacios iniciales y "- "
                        while (tstart < tpos && fullText[tstart] === ' ') tstart++;
                        if (fullText.slice(tstart, tstart + 2) === '- ') tstart += 2;
                        const truncName = fullText.slice(tstart, tpos + truncSuffix.length);
                        const prefix = truncName.slice(0, truncName.indexOf('...'));
                        // Verificar que el nombre real empieza con este prefijo
                        if (prefix.length >= 3 && name.startsWith(prefix) && name.endsWith(ext)) {
                            if (!links.some(l => {
                                const ls = l.range.start.y === startRow + 1 ? l.range.start.x - 1 : 0;
                                return tstart >= ls && tstart < ls + l.text.length;
                            })) {
                                addLink(file.path, tstart, truncName.length);
                            }
                        }
                        ti = tpos + truncSuffix.length;
                    }
                }
                callback(links.length ? links : undefined);
            }
        });

        // Shell Integration: parsear OSC 633 para tracking de comandos
        const shellState = {
            commandStartTime: null,
            currentCommand: null,
            commandRunning: false,
        };
        term.parser.registerOscHandler(633, (data) => {
            const parts = data.split(';');
            const type = parts[0];
            switch (type) {
                case 'A': // Prompt start
                    break;
                case 'C': { // Command executed (preexec)
                    shellState.commandRunning = true;
                    shellState.commandStartTime = Date.now();
                    // Mostrar spinner en la pestaña
                    const pC = this.panes.get(ptyId);
                    const tC = this.tabs.get(pC?.tabId);
                    if (tC) {
                        tC.tabBtn.classList.remove('claude-thinking', 'terminal-busy');
                        tC.tabBtn.classList.add('terminal-busy');
                    }
                    break;
                }
                case 'D': { // Command finished (precmd) — D;exitCode
                    if (!shellState.commandRunning) break;
                    const exitCode = parseInt(parts[1] || '0', 10);
                    const duration = Date.now() - (shellState.commandStartTime || Date.now());
                    // Cancelar timer de silencio para evitar doble notificación
                    const p = this.panes.get(ptyId);
                    if (p?._silenceTimer) { clearTimeout(p._silenceTimer); p._silenceTimer = null; }
                    p._activityStart = null;
                    // Quitar indicador visual de la pestaña
                    const t = this.tabs.get(p?.tabId);
                    if (t) t.tabBtn.classList.remove('claude-thinking', 'terminal-busy', 'claude-waiting');
                    this._onCommandFinished(ptyId, {
                        command: shellState.currentCommand,
                        exitCode,
                        duration
                    });
                    shellState.commandRunning = false;
                    shellState.currentCommand = null;
                    shellState.commandStartTime = null;
                    break;
                }
                case 'E': // Command text — E;command
                    shellState.currentCommand = parts.slice(1).join(';');
                    break;
            }
            return true; // handled, don't render
        });

        term.onData(input => this.ipcRenderer?.send('terminal-input', { id: ptyId, input }));

        this.panes.set(ptyId, { ptyId, term, fit, leafNode, tabId, linkedFileId: options.fileId || null,
            _writeBuf: '', _writeTimer: null, shellState, themeName: 'Basic' });

        // Activar pane al hacer click en él
        el.addEventListener('mousedown', () => this._setActiveLeaf(tabId, ptyId));

        // Doble click en el título → renombrar pane
        const titleEl = header.querySelector('.pane-title');
        titleEl.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            this._renamePaneTitle(titleEl);
        });

        // Botones de split y cierre
        header.querySelector('.pane-split-h-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            this.splitPane(ptyId, 'h');
        });
        header.querySelector('.pane-split-v-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            this.splitPane(ptyId, 'v');
        });
        header.querySelector('.pane-close-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            this.closePane(ptyId);
        });

        // Selector de tema por pane
        const themePicker = header.querySelector('.pane-theme-picker');
        const themeBtn = header.querySelector('.pane-theme-btn');
        const themeDropdown = header.querySelector('.pane-theme-dropdown');

        // Construir items del dropdown
        for (const name of Object.keys(PANE_THEMES)) {
            const item = document.createElement('button');
            item.className = 'pane-theme-item' + (name === 'Basic' ? ' active' : '');
            item.dataset.theme = name;
            const dot = document.createElement('span');
            dot.className = 'pane-theme-dot';
            dot.style.background = PANE_THEMES[name].background;
            const isDark = PANE_THEMES[name]._meta.dark;
            dot.style.border = `1px solid ${isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.15)'}`;
            item.appendChild(dot);
            item.appendChild(document.createTextNode(name));
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                this._applyPaneTheme(ptyId, name);
                themeDropdown.classList.remove('open');
            });
            themeDropdown.appendChild(item);
        }

        themeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            // Cerrar cualquier otro dropdown abierto
            document.querySelectorAll('.pane-theme-dropdown.open').forEach(d => {
                if (d !== themeDropdown) d.classList.remove('open');
            });
            const isOpen = themeDropdown.classList.toggle('open');
            if (isOpen) {
                // Posicionar con fixed para escapar overflow:hidden de los padres
                const btnRect = themeBtn.getBoundingClientRect();
                const ddHeight = themeDropdown.scrollHeight;
                const ddWidth = themeDropdown.offsetWidth || 160;
                // Preferir abrir hacia abajo; si no cabe, abrir hacia arriba
                let top = btnRect.bottom + 2;
                if (top + ddHeight > window.innerHeight - 8) {
                    top = btnRect.top - ddHeight - 2;
                    if (top < 8) top = 8; // fallback: pegar arriba
                }
                // Alinear a la derecha del botón para no salirse por la derecha
                let left = btnRect.right - ddWidth;
                if (left < 8) left = 8;
                themeDropdown.style.top = top + 'px';
                themeDropdown.style.left = left + 'px';
                // Limitar altura al espacio disponible
                const maxH = Math.min(ddHeight, window.innerHeight - top - 8);
                themeDropdown.style.maxHeight = maxH + 'px';
            }
        });

        // Cerrar dropdown al hacer click fuera, scroll o resize
        const closeDropdown = (e) => {
            if (!themePicker.contains(e.target)) themeDropdown.classList.remove('open');
        };
        const closeDropdownAlways = () => themeDropdown.classList.remove('open');
        document.addEventListener('click', closeDropdown);
        window.addEventListener('resize', closeDropdownAlways);
        // Limpiar listeners cuando se destruya el pane
        el._themeCleanup = () => {
            document.removeEventListener('click', closeDropdown);
            window.removeEventListener('resize', closeDropdownAlways);
        };

        // ── Drag-and-drop: desde sidebar (text/plain) o desde el Finder/OS (Files) ──
        el.addEventListener('dragover', (e) => {
            const types = e.dataTransfer.types;
            if (!types.includes('text/plain') && !types.includes('Files') && !types.includes('text/uri-list')) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
            el.classList.add('pane-drop-target');
        });

        el.addEventListener('dragleave', (e) => {
            if (!el.contains(e.relatedTarget)) {
                el.classList.remove('pane-drop-target');
            }
        });

        // Captura en fase de captura para interceptar ANTES de que xterm.js
        // consuma el drop en su canvas y llame a stopPropagation
        el.addEventListener('drop', (e) => {
            const types = e.dataTransfer.types;
            const hasFiles = (e.dataTransfer.files?.length > 0)
                || types.includes('text/uri-list')
                || types.includes('text/plain');
            if (!hasFiles) return; // drops no-archivo: dejar que xterm los gestione

            e.preventDefault();
            e.stopPropagation(); // evitar que xterm también los procese
            el.classList.remove('pane-drop-target');

            // 1. File.path — propiedad de Electron en objetos File del SO
            if (e.dataTransfer.files?.length > 0) {
                const paths = Array.from(e.dataTransfer.files).map(f => f.path).filter(Boolean);
                if (paths.length > 0) { this._sendPathToPane(ptyId, ...paths); return; }
            }

            // 2. text/uri-list — fallback macOS/Linux (file:///ruta)
            const uriList = e.dataTransfer.getData('text/uri-list');
            if (uriList) {
                const paths = uriList.split(/\r?\n/)
                    .map(u => u.trim())
                    .filter(u => u.startsWith('file://') && !u.startsWith('#'))
                    .map(u => { try { return decodeURIComponent(new URL(u).pathname); } catch { return null; } })
                    .filter(Boolean);
                if (paths.length > 0) { this._sendPathToPane(ptyId, ...paths); return; }
            }

            // 3. text/plain — ruta directa del sidebar
            const filePath = e.dataTransfer.getData('text/plain');
            if (filePath) this._sendPathToPane(ptyId, filePath);
        }, true /* capture */);

        return leafNode;
    }

    // ── Enviar ruta(s) al PTY de un pane ─────────────────────────────────────
    _sendPathToPane(ptyId, ...paths) {
        const pane = this.panes.get(ptyId);
        if (!pane) return;

        // Activa el pane receptor y mueve el foco
        const tab = this.tabs.get(pane.tabId);
        if (tab) this._setActiveLeaf(pane.tabId, ptyId);
        pane.term.focus();

        // Escapa las rutas para la shell: sustituye cada carácter problemático
        // dentro de comillas simples (POSIX). Las comillas simples dentro de la
        // propia ruta se cierran, escapan con \' y se vuelven a abrir.
        const shellEscape = p => "'" + p.replace(/'/g, "'\\''") + "'";
        const text = paths.map(shellEscape).join(' ');
        this.ipcRenderer?.send('terminal-input', { id: ptyId, input: text });
    }

    // ── Attach desde picker nativo (botón toolbarAttachBtn) ──────────────────
    async _attachFilesFromPicker() {
        if (!this.ipcRenderer) return;
        const activeId = this.getActiveTerminalId();
        if (!activeId) return;

        const filePaths = await this.ipcRenderer.invoke('select-file');
        if (!filePaths || filePaths.length === 0) return;

        this._sendPathToPane(activeId, ...filePaths);
    }

    // ── Aplicar tema a un pane individual ────────────────────────────────────
    _applyPaneTheme(ptyId, themeName) {
        const pane = this.panes.get(ptyId);
        if (!pane) return;
        const theme = PANE_THEMES[themeName];
        if (!theme) return;

        pane.themeName = themeName;
        const { term, leafNode } = pane;
        const meta = theme._meta;
        const bg = theme.background;

        // Actualizar tema de xterm (excluir _meta)
        const xtermTheme = Object.assign({}, theme);
        delete xtermTheme._meta;
        term.options.theme = xtermTheme;

        // Actualizar backgrounds del pane vía inline style
        const el = leafNode.el;
        el.style.background = bg;
        const termEl = leafNode.termEl;
        termEl.style.background = bg;

        // xterm viewport y screen
        const viewport = termEl.querySelector('.xterm-viewport');
        const screen = termEl.querySelector('.xterm-screen');
        if (viewport) viewport.style.setProperty('background-color', bg, 'important');
        if (screen) screen.style.setProperty('background-color', bg, 'important');

        // Adaptar cabecera al tema
        const header = el.querySelector('.pane-header');
        if (header) {
            header.style.background = meta.headerBg;
            header.style.borderBottomColor = meta.headerBorder;
        }
        const title = el.querySelector('.pane-title');
        if (title) title.style.color = meta.headerFg;

        // Adaptar botones del header
        el.querySelectorAll('.pane-btn').forEach(btn => {
            btn.style.color = meta.headerFg;
        });

        // Marcar item activo en el dropdown
        el.querySelectorAll('.pane-theme-item').forEach(item => {
            item.classList.toggle('active', item.dataset.theme === themeName);
        });

        // Forzar refresh del WebGL renderer si está activo
        try { term.refresh(0, term.rows - 1); } catch (_) {}
    }

    // ── Dividir un pane ───────────────────────────────────────────────────────
    async splitPane(ptyId, dir) {
        if (!this.ipcRenderer) return;
        const pane = this.panes.get(ptyId);
        if (!pane) return;
        const tab = this.tabs.get(pane.tabId);
        if (!tab) return;

        const oldLeaf = pane.leafNode;

        // Lanzar nuevo PTY
        const ptyRes = await this.ipcRenderer.invoke('terminal-start', { cwd: null });
        if (!ptyRes?.ok) return;

        const newLeaf = this._makeLeafNode(ptyRes.id, pane.tabId);

        // Construir nodo split
        const splitEl = document.createElement('div');
        splitEl.className = dir === 'h' ? 'pane-split-h' : 'pane-split-v';

        const resizerEl = document.createElement('div');
        resizerEl.className = dir === 'h' ? 'pane-resizer-h' : 'pane-resizer-v';

        const splitNode = {
            type: 'split',
            dir,
            ratio: 0.5,
            children: [oldLeaf, newLeaf],
            el: splitEl,
            resizerEl,
            parent: oldLeaf.parent
        };

        oldLeaf.parent = splitNode;
        newLeaf.parent = splitNode;

        // Aplicar flex inicial (50/50)
        this._applyRatio(splitNode);

        // Sustituir en el DOM PRIMERO (mientras oldLeaf.el aún es hijo de su padre actual)
        const parentNode = splitNode.parent;
        if (!parentNode) {
            // El leaf era la raíz — containerEl.replaceChildren saca oldLeaf.el del DOM
            tab.rootNode = splitNode;
            tab.containerEl.replaceChildren(splitEl);
        } else {
            // replaceChild requiere que oldLeaf.el sea hijo de parentNode.el en este momento
            const idx = parentNode.children.indexOf(oldLeaf);
            parentNode.children[idx] = splitNode;
            parentNode.el.replaceChild(splitEl, oldLeaf.el);
        }

        // Ahora sí podemos meter oldLeaf.el dentro de splitEl (ya está desconectado de su padre anterior)
        splitEl.appendChild(oldLeaf.el);
        splitEl.appendChild(resizerEl);
        splitEl.appendChild(newLeaf.el);

        this._initPaneResizer(splitNode);

        // Doble RAF: espera a que el layout esté estable antes de medir y hacer fit
        requestAnimationFrame(() => requestAnimationFrame(() => {
            this._fitLeaf(oldLeaf);
            this._fitLeaf(newLeaf);
            this._setActiveLeaf(pane.tabId, ptyRes.id);
            this.panes.get(ptyRes.id)?.term.focus();
        }));
    }

    // ── Cerrar un pane ────────────────────────────────────────────────────────
    closePane(ptyId) {
        const pane = this.panes.get(ptyId);
        if (!pane) return;

        this.ipcRenderer?.send('terminal-kill', { id: ptyId });
        pane.term.dispose();
        // Limpiar listener del theme dropdown
        if (pane.leafNode.el._themeCleanup) pane.leafNode.el._themeCleanup();
        this.panes.delete(ptyId);

        const leafNode    = pane.leafNode;
        const parentSplit = leafNode.parent;

        if (!parentSplit) {
            // Era el único pane → cerrar la pestaña completa
            this.closeTab(pane.tabId);
            return;
        }

        // Encontrar el hermano
        const siblingIdx = parentSplit.children[0] === leafNode ? 1 : 0;
        const sibling    = parentSplit.children[siblingIdx];

        // El hermano sube al lugar del split padre
        sibling.parent       = parentSplit.parent;
        sibling.el.style.flex      = '';
        sibling.el.style.minWidth  = '';
        sibling.el.style.minHeight = '';

        const grandParent = parentSplit.parent;
        const tab = this.tabs.get(pane.tabId);

        if (!grandParent) {
            tab.rootNode = sibling;
            tab.containerEl.replaceChildren(sibling.el);
        } else {
            const idx = grandParent.children.indexOf(parentSplit);
            grandParent.children[idx] = sibling;
            grandParent.el.replaceChild(sibling.el, parentSplit.el);
        }

        // Activar el primer leaf disponible
        const firstLeaf = this._firstLeaf(tab.rootNode);
        if (firstLeaf) {
            setTimeout(() => {
                this._setActiveLeaf(pane.tabId, firstLeaf.ptyId);
                this._fitAllInNode(tab.rootNode);
                this.panes.get(firstLeaf.ptyId)?.term.focus();
            }, 50);
        }
    }

    // ── Cerrar una pestaña completa ───────────────────────────────────────────
    closeTab(tabId) {
        const tab = this.tabs.get(tabId);
        if (!tab) return;

        // Matar todos los PTYs de la pestaña
        [...this.panes.values()]
            .filter(p => p.tabId === tabId)
            .forEach(p => {
                this.ipcRenderer?.send('terminal-kill', { id: p.ptyId });
                p.term.dispose();
                this.panes.delete(p.ptyId);
            });

        tab.tabBtn.remove();
        tab.containerEl.remove();
        this.tabs.delete(tabId);

        if (this.tabs.size === 0) {
            this.panel.style.display  = 'none';
            this.resizer.style.display = 'none';
            this.activeTabId = null;
        } else {
            // Activar la siguiente pestaña disponible
            const nextId = [...this.tabs.keys()].at(-1);
            this.switchTab(nextId);
        }
    }

    // ── Cambiar pestaña activa ────────────────────────────────────────────────
    switchTab(tabId) {
        this.activeTabId = tabId;

        this.tabs.forEach((tab, id) => {
            const isActive = id === tabId;
            tab.tabBtn.classList.toggle('active', isActive);
            tab.containerEl.style.display = isActive ? 'flex' : 'none';
        });

        const tab = this.tabs.get(tabId);
        if (!tab) return;

        const leafPtyId = tab.activeLeafPtyId ?? this._firstLeaf(tab.rootNode)?.ptyId;
        if (leafPtyId) {
            setTimeout(() => {
                this._setActiveLeaf(tabId, leafPtyId);
                this._fitAllInNode(tab.rootNode);
                this.panes.get(leafPtyId)?.term.focus();
            }, 50);
        }

        // Notificar a app.js para la vinculación bidireccional con archivos
        if (!this._skipNotify && tab.linkedFileId && typeof this.onTerminalActivated === 'function') {
            this.onTerminalActivated(tab.linkedFileId);
        }
    }

    // ── Detectar si Claude necesita acción del usuario ─────────────────────────
    _needsUserAction(rawOutput) {
        const clean = rawOutput.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
                               .replace(/\x1b\][^\x07]*\x07/g, '')
                               .replace(/\x1b\].*?\x1b\\/g, '');
        return /Do you want to proceed|Enter to select|Esc to cancel/i.test(clean);
    }

    // ── Notificación cuando un comando largo termina ──────────────────────────
    _onCommandFinished(ptyId, info) {
        const THRESHOLD_MS = 15000; // 15 segundos
        if (!info || info.duration < THRESHOLD_MS) return;

        // Solo notificar si el terminal no tiene el foco
        const pane = this.panes.get(ptyId);
        if (!pane) return;
        const termHasFocus = pane.term.textarea === document.activeElement;
        if (document.hasFocus() && termHasFocus) return;

        // Info del pane y tab
        const paneName = pane.leafNode?.el?.querySelector('.pane-title')?.textContent || 'Terminal';
        const cmdText = info.command || 'Comando';
        const seconds = (info.duration / 1000).toFixed(0);
        const status = info.exitCode === 0 ? '✓ Completado' : `✗ Error (código ${info.exitCode})`;

        const notifData = {
            title: `${paneName} — ${status}`,
            body: `$ ${cmdText}  ·  ${seconds}s`
        };
        if (this.ipcRenderer) {
            this.ipcRenderer.send('terminal-notify', notifData);
        }
    }

    // ── Marcar leaf como activo (foco visual) ─────────────────────────────────
    _setActiveLeaf(tabId, ptyId) {
        const tab = this.tabs.get(tabId);
        if (!tab) return;
        tab.activeLeafPtyId = ptyId;

        // Actualizar borde de acento en todos los leaves del tab
        this._walkLeaves(tab.rootNode, (leaf) => {
            leaf.el.classList.toggle('pane-leaf-active', leaf.ptyId === ptyId);
        });
    }

    // ── Resizer entre panes ───────────────────────────────────────────────────
    _initPaneResizer(splitNode) {
        splitNode.resizerEl.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();

            // 'h' = split horizontal = línea horizontal = paneles arriba/abajo → arrastrar en Y
            // 'v' = split vertical   = línea vertical   = paneles lado a lado  → arrastrar en X
            const isH       = splitNode.dir === 'h';
            const totalSize = isH ? splitNode.el.offsetHeight : splitNode.el.offsetWidth;

            splitNode.resizerEl.classList.add('is-resizing');
            document.body.style.cursor = isH ? 'row-resize' : 'col-resize';
            this._blockEmbeds(true);

            let lastPos = isH ? e.clientY : e.clientX;
            let rafId   = null;

            const onMove = (ev) => {
                const pos   = isH ? ev.clientY : ev.clientX;
                const delta = pos - lastPos;
                lastPos = pos;

                const child0Size = isH
                    ? splitNode.children[0].el.offsetHeight
                    : splitNode.children[0].el.offsetWidth;

                splitNode.ratio = Math.max(0.1, Math.min(0.9, (child0Size + delta) / totalSize));
                this._applyRatio(splitNode);
                // Throttle fit() con RAF; solo visual (sin notificar al PTY) durante el drag
                if (rafId) cancelAnimationFrame(rafId);
                rafId = requestAnimationFrame(() => { this._fitAllInNode(splitNode, false); rafId = null; });
            };

            const onUp = () => {
                splitNode.resizerEl.classList.remove('is-resizing');
                document.body.style.cursor = '';
                this._blockEmbeds(false);
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
                if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
                // Fit final con doble RAF para que el layout esté asentado
                requestAnimationFrame(() => requestAnimationFrame(() => this._fitAllInNode(splitNode)));
            };

            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        });
    }

    _applyRatio(splitNode) {
        splitNode.children[0].el.style.flex      = String(splitNode.ratio);
        splitNode.children[0].el.style.minWidth  = '0';
        splitNode.children[0].el.style.minHeight = '0';
        splitNode.children[1].el.style.flex      = String(1 - splitNode.ratio);
        splitNode.children[1].el.style.minWidth  = '0';
        splitNode.children[1].el.style.minHeight = '0';
    }

    // ── Fit helpers ───────────────────────────────────────────────────────────
    // notifyPty: si es false, solo redimensiona xterm.js visualmente sin enviar
    // el resize al PTY. Esto evita que la shell redibuje el prompt en cada pixel
    // del drag — el resize real se envía una sola vez al soltar el ratón.
    _fitLeaf(leafNode, notifyPty = true) {
        const pane = this.panes.get(leafNode.ptyId);
        if (!pane) return;
        try {
            pane.fit.fit();
            if (notifyPty) {
                this.ipcRenderer?.send('terminal-resize', {
                    id:   leafNode.ptyId,
                    cols: pane.term.cols,
                    rows: pane.term.rows
                });
            }
        } catch (_) {}
    }

    _fitAllInNode(node, notifyPty = true) {
        this._walkLeaves(node, (leaf) => this._fitLeaf(leaf, notifyPty));
    }

    _fitAllVisible(notifyPty = true) {
        if (!this.activeTabId) return;
        const tab = this.tabs.get(this.activeTabId);
        if (tab?.rootNode) this._fitAllInNode(tab.rootNode, notifyPty);
    }

    // ── Recorrido del árbol de nodos ──────────────────────────────────────────
    _walkLeaves(node, fn) {
        if (!node) return;
        if (node.type === 'leaf') { fn(node); return; }
        node.children.forEach(child => this._walkLeaves(child, fn));
    }

    _firstLeaf(node) {
        if (!node) return null;
        if (node.type === 'leaf') return node;
        return this._firstLeaf(node.children[0]);
    }

    // ── Renombrar título de un pane (doble click en pane-title) ──────────────
    _renamePaneTitle(titleEl) {
        const oldName = titleEl.textContent;

        titleEl.contentEditable = 'true';
        titleEl.classList.add('editing');
        titleEl.focus();

        const range = document.createRange();
        range.selectNodeContents(titleEl);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);

        const finish = (save) => {
            if (titleEl.contentEditable === 'false') return;
            titleEl.contentEditable = 'false';
            titleEl.classList.remove('editing');
            titleEl.textContent = (save && titleEl.textContent.trim())
                ? titleEl.textContent.trim()
                : oldName;
            titleEl.onkeydown = null;
            titleEl.onblur    = null;
        };

        titleEl.onkeydown = (e) => {
            e.stopPropagation();
            if (e.key === 'Enter')  { e.preventDefault(); finish(true);  }
            if (e.key === 'Escape') { e.preventDefault(); finish(false); }
        };
        titleEl.onblur = () => finish(true);
    }

    // ── Renombrar pestaña (doble click) ───────────────────────────────────────
    _renameTab(tabId) {
        const tab = this.tabs.get(tabId);
        if (!tab) return;

        const span    = tab.tabBtn.querySelector('span');
        const oldName = span.textContent;

        span.contentEditable = 'true';
        span.classList.add('editing');

        setTimeout(() => {
            span.focus();
            const range = document.createRange();
            range.selectNodeContents(span);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
        }, 10);

        const finish = (save) => {
            if (span.contentEditable === 'false') return;
            span.contentEditable = 'false';
            span.classList.remove('editing');
            span.textContent = (save && span.textContent.trim()) ? span.textContent.trim() : oldName;
            span.onkeydown = null;
            span.onblur    = null;
        };

        span.onkeydown = (e) => {
            e.stopPropagation();
            if (e.key === 'Enter')  { e.preventDefault(); finish(true);  }
            if (e.key === 'Escape') { e.preventDefault(); finish(false); }
        };
        span.onblur = () => finish(true);
    }

    // ── API pública (usada por app.js) ────────────────────────────────────────
    openTerminal(options)    { return this.createTab(options); }
    getActiveTerminalId()    { return this.tabs.get(this.activeTabId)?.activeLeafPtyId ?? null; }
    sendInput(id, data)      { this.ipcRenderer?.send('terminal-input', { id, input: data }); }

    activateTerminalForFile(fileId) {
        for (const [tabId, tab] of this.tabs) {
            if (tab.linkedFileId === fileId) {
                this.panel.style.display   = 'flex';
                this.resizer.style.display = 'block';
                this._skipNotify = true;
                this.switchTab(tabId);
                this._skipNotify = false;
                return;
            }
        }
    }

    closeAll() {
        [...this.tabs.keys()].forEach(id => this.closeTab(id));
    }

    // Alias legacy (por compatibilidad)
    refreshActiveTerminalSize() { this._fitAllVisible(); }
}

window.terminalCtrl = new TerminalController();
