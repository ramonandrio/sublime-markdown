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

// Tema de color compartido por todos los terminales
const TERM_THEME = {
    background: '#FAFAFA',
    foreground: '#5C6166',
    cursor: '#F29718',
    cursorAccent: '#FAFAFA',
    selectionBackground: 'rgba(54, 163, 217, 0.2)',
    black:   '#5C6166', red:     '#F07178', green:   '#86B300', yellow:  '#F29718',
    blue:    '#36A3D9', magenta: '#A37ACC', cyan:    '#4CBF99', white:   '#8A9199',
    brightBlack: '#ADB1B8', brightRed:     '#F07178', brightGreen:   '#86B300',
    brightYellow: '#F29718', brightBlue:   '#36A3D9', brightMagenta: '#A37ACC',
    brightCyan:   '#4CBF99', brightWhite:  '#D5D8DA'
};

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

        term.onData(input => this.ipcRenderer?.send('terminal-input', { id: ptyId, input }));

        this.panes.set(ptyId, { ptyId, term, fit, leafNode, tabId, linkedFileId: options.fileId || null,
            _writeBuf: '', _writeTimer: null });

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
