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

let Terminal, FitAddon;

function loadTerminalLibs() {
    if (Terminal) return true;
    try {
        if (typeof window.require !== 'undefined') {
            const xterm = window.require('@xterm/xterm');
            Terminal = xterm.Terminal || xterm;
            FitAddon = window.require('@xterm/addon-fit').FitAddon;
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
            if (pane) pane.term.write(data);
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

    // ── Resizer del panel principal (entre content y terminal) ────────────────
    _initPanelResizer() {
        let isResizing = false;

        this.resizer.addEventListener('mousedown', (e) => {
            isResizing = true;
            document.body.style.cursor = 'row-resize';
            this.resizer.classList.add('is-resizing');
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isResizing) return;
            const newH = window.innerHeight - e.clientY;
            if (newH > 100 && newH < window.innerHeight * 0.8) {
                this.panel.style.height = `${newH}px`;
                this._fitAllVisible();
            }
        });

        document.addEventListener('mouseup', () => {
            if (!isResizing) return;
            isResizing = false;
            document.body.style.cursor = 'default';
            this.resizer.classList.remove('is-resizing');
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
            cursorBlink: true,
            fontFamily:  'JetBrains Mono, Menlo, Monaco, Courier New, monospace',
            fontSize:    13,
            lineHeight:  1.2,
            theme:       TERM_THEME,
            convertEol:  true
        });
        const fit = new FitAddon();
        term.loadAddon(fit);
        term.open(termEl);
        term.onData(input => this.ipcRenderer?.send('terminal-input', { id: ptyId, input }));

        this.panes.set(ptyId, { ptyId, term, fit, leafNode, tabId, linkedFileId: options.fileId || null });

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

        // Escapa y concatena las rutas con espacios (sin \r: el usuario decide cuándo ejecutar)
        const text = paths.map(p => `"${p}"`).join(' ');
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
                // Throttle fit() con RAF para no llamarlo en cada pixel del drag
                if (rafId) cancelAnimationFrame(rafId);
                rafId = requestAnimationFrame(() => { this._fitAllInNode(splitNode); rafId = null; });
            };

            const onUp = () => {
                splitNode.resizerEl.classList.remove('is-resizing');
                document.body.style.cursor = '';
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
    _fitLeaf(leafNode) {
        const pane = this.panes.get(leafNode.ptyId);
        if (!pane) return;
        try {
            pane.fit.fit();
            this.ipcRenderer?.send('terminal-resize', {
                id:   leafNode.ptyId,
                cols: pane.term.cols,
                rows: pane.term.rows
            });
        } catch (_) {}
    }

    _fitAllInNode(node) {
        this._walkLeaves(node, (leaf) => this._fitLeaf(leaf));
    }

    _fitAllVisible() {
        if (!this.activeTabId) return;
        const tab = this.tabs.get(this.activeTabId);
        if (tab?.rootNode) this._fitAllInNode(tab.rootNode);
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
