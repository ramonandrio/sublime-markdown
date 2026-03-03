/**
 * CHAT.JS - Gestor del Terminal (Fase 4: xterm.js)
 */

let Terminal, FitAddon;

if (typeof window.require !== 'undefined') {
    Terminal = window.require('@xterm/xterm').Terminal;
    FitAddon = window.require('@xterm/addon-fit').FitAddon;
}

class TerminalController {
    constructor() {
        this.instances = new Map(); // id -> { id, domBody, tabBtn, term, fitAddon, resizeObserver }
        this.activeInstanceId = null;
        this.isElectron = typeof window.require !== 'undefined';
        this.ipcRenderer = this.isElectron ? window.require('electron').ipcRenderer : null;

        this.initDOM();
        this.bindEvents();
        this.setupIPC();
    }

    initDOM() {
        this.panel = document.getElementById('bottomTerminalPanel');
        this.resizer = document.getElementById('horizontalResizer');
        this.tabsContainer = document.getElementById('terminalTabsContainer');
        this.bodyContainer = document.getElementById('terminalBodyContainer');

        // Hide legacy input if present
        const inputArea = document.querySelector('.terminal-input-area');
        if (inputArea) inputArea.style.display = 'none';

        this.newTerminalBtn = document.getElementById('newTerminalBtn');
        this.closePanelBtn = document.getElementById('closeTerminalPanelBtn');
        this.toolbarClaudeBtn = document.getElementById('toolbarClaudeBtn');
        this.splitViewContainer = document.querySelector('.split-view-container');

        this.isResizing = false;
        this.lastY = 0;
    }

    bindEvents() {
        if (!this.panel) return;

        this.newTerminalBtn.addEventListener('click', () => this.createNewInstance());
        this.closePanelBtn.addEventListener('click', () => this.togglePanel(false));

        if (this.toolbarClaudeBtn) {
            this.toolbarClaudeBtn.addEventListener('click', () => {
                if (this.activeInstanceId && this.ipcRenderer) {
                    this.ipcRenderer.send('terminal-input', {
                        id: this.activeInstanceId,
                        input: 'claude --dangerously-skip-permissions\r'
                    });

                    const inst = this.instances.get(this.activeInstanceId);
                    if (inst && inst.term) {
                        inst.term.focus();
                    }
                }
            });
        }

        this.resizer.addEventListener('mousedown', (e) => {
            this.isResizing = true;
            this.lastY = e.clientY;
            this.resizer.classList.add('is-resizing');
            document.body.style.cursor = 'row-resize';
            document.body.style.userSelect = 'none';
        });

        document.addEventListener('mousemove', (e) => {
            if (!this.isResizing) return;
            const deltaY = e.clientY - this.lastY;
            this.lastY = e.clientY;

            const currentHeight = this.panel.offsetHeight;
            const newHeight = Math.max(100, currentHeight - deltaY);

            if (newHeight < window.innerHeight - 100) {
                this.panel.style.height = `${newHeight}px`;
            }
        });

        document.addEventListener('mouseup', () => {
            if (this.isResizing) {
                this.isResizing = false;
                this.resizer.classList.remove('is-resizing');
                document.body.style.cursor = '';
                document.body.style.userSelect = '';

                // Disparar resize de la terminal activa al soltar el resizer
                if (this.activeInstanceId) {
                    const inst = this.instances.get(this.activeInstanceId);
                    if (inst && inst.fitAddon) {
                        inst.fitAddon.fit();
                        this.ipcRenderer.send('terminal-resize', {
                            id: inst.id, cols: inst.term.cols, rows: inst.term.rows
                        });
                    }
                }
            }
        });

        // Window resize global debounce
        window.addEventListener('resize', () => {
            if (this.activeInstanceId) {
                clearTimeout(this.resizeTimeout);
                this.resizeTimeout = setTimeout(() => {
                    const inst = this.instances.get(this.activeInstanceId);
                    if (inst && inst.fitAddon && this.panel.style.display !== 'none') {
                        inst.fitAddon.fit();
                        this.ipcRenderer.send('terminal-resize', {
                            id: inst.id, cols: inst.term.cols, rows: inst.term.rows
                        });
                    }
                }, 100);
            }
        });
    }

    setupIPC() {
        if (!this.ipcRenderer) return;

        this.ipcRenderer.on('terminal-output', (event, { id, data, type }) => {
            if (this.instances.has(id)) {
                this.instances.get(id).term.write(data);
            }
        });

        this.ipcRenderer.on('terminal-exit', (event, { id, code }) => {
            if (this.instances.has(id)) {
                this.instances.get(id).term.writeln(`\r\n[Proceso terminado con código ${code}]`);
            }
        });
    }

    togglePanel(show) {
        if (show) {
            this.panel.style.display = 'flex';
            this.resizer.style.display = 'block';

            // Refit al mostrar
            if (this.activeInstanceId) {
                setTimeout(() => {
                    const inst = this.instances.get(this.activeInstanceId);
                    if (inst && inst.fitAddon) {
                        inst.fitAddon.fit();
                        const nameSpan = inst.tabBtn.querySelector('.terminal-tab-name');
                        if (!nameSpan || nameSpan.contentEditable !== 'true') {
                            inst.term.focus();
                        }
                    }
                }, 50);
            }
        } else {
            this.panel.style.display = 'none';
            this.resizer.style.display = 'none';
        }
    }

    openTerminal() {
        this.createNewInstance();
    }

    async createNewInstance() {
        if (!this.ipcRenderer || !Terminal) {
            alert('Las terminales reales solo están disponibles en modo nativo (PM-OS).');
            return;
        }

        this.togglePanel(true);

        const currentDir = window.appCtrl && window.appCtrl.currentRootDir
            ? window.appCtrl.currentRootDir
            : null;

        const res = await this.ipcRenderer.invoke('terminal-start', {
            cwd: currentDir,
            command: 'bash'
        });

        if (res.success) {
            let tabName = `Terminal ${this.instances.size + 1}`;
            if (window.appCtrl && window.appCtrl.getActiveTabName) {
                const activeName = window.appCtrl.getActiveTabName();
                if (activeName) {
                    tabName = activeName;
                }
            }
            this.createInstanceUI(res.id, tabName);
            this.setActiveInstance(res.id);
        } else {
            alert('Error iniciando terminal: ' + res.error);
        }
    }

    createInstanceUI(id, name) {
        // Tab Btn
        const tabBtn = document.createElement('div');
        tabBtn.className = 'terminal-tab';
        tabBtn.innerHTML = `
            <span title="Doble clic para renombrar" class="terminal-tab-name">${name}</span>
            <div class="terminal-tab-close" title="Cerrar"><svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg></div>
        `;

        const nameSpan = tabBtn.querySelector('.terminal-tab-name');

        // Lógica para renombrar
        nameSpan.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            nameSpan.contentEditable = 'true';
            nameSpan.focus();

            // Seleccionar todo el texto
            const selection = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(nameSpan);
            selection.removeAllRanges();
            selection.addRange(range);
        });

        nameSpan.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                nameSpan.blur();
            }
        });

        nameSpan.addEventListener('blur', () => {
            nameSpan.contentEditable = 'false';
            if (!nameSpan.textContent.trim()) {
                nameSpan.textContent = name; // restaurar si está vacío
            }
        });

        tabBtn.addEventListener('click', (e) => {
            if (e.target.closest('.terminal-tab-close')) {
                this.closeInstance(id);
            } else if (nameSpan.contentEditable !== 'true') {
                this.setActiveInstance(id);
            }
        });

        this.tabsContainer.insertBefore(tabBtn, this.tabsContainer.lastElementChild);

        // Body View
        const domBody = document.createElement('div');
        domBody.className = 'terminal-view xterm-container';
        domBody.style.display = 'none';
        domBody.style.height = '100%';
        domBody.style.width = '100%';
        domBody.style.padding = '8px';
        domBody.style.boxSizing = 'border-box';

        this.bodyContainer.appendChild(domBody);

        // Xterm.js Initialization
        const term = new Terminal({
            cursorBlink: true,
            fontFamily: 'JetBrains Mono, Menlo, Courier, monospace',
            fontSize: 13,
            lineHeight: 1.2,
            theme: {
                background: getComputedStyle(document.documentElement).getPropertyValue('--bg-panel').trim() || '#f9f9f9',
                foreground: getComputedStyle(document.documentElement).getPropertyValue('--text-color').trim() || '#333333',
                cursor: getComputedStyle(document.documentElement).getPropertyValue('--text-color').trim() || '#333333',
                selectionBackground: 'rgba(0, 102, 255, 0.3)'
            },
            convertEol: true
        });

        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);

        term.open(domBody);

        // Enviar inputs al PTY
        term.onData(data => {
            this.ipcRenderer.send('terminal-input', { id, input: data });
        });

        // Resize Observer para auto-ajuste al arrastrar el splitview superior o la ventana
        const resizeObserver = new ResizeObserver(() => {
            if (domBody.style.display !== 'none') {
                fitAddon.fit();
                this.ipcRenderer.send('terminal-resize', { id, cols: term.cols, rows: term.rows });
            }
        });
        resizeObserver.observe(domBody);

        this.instances.set(id, { id, tabBtn, domBody, term, fitAddon, resizeObserver });
    }

    setActiveInstance(id) {
        this.activeInstanceId = id;

        for (const [instId, inst] of this.instances.entries()) {
            if (instId === id) {
                inst.tabBtn.classList.add('active');
                inst.domBody.style.display = 'block';
                // Obligar fit de repintado
                setTimeout(() => {
                    inst.fitAddon.fit();
                    this.ipcRenderer.send('terminal-resize', { id, cols: inst.term.cols, rows: inst.term.rows });
                    const nameSpan = inst.tabBtn.querySelector('.terminal-tab-name');
                    if (!nameSpan || nameSpan.contentEditable !== 'true') {
                        inst.term.focus();
                    }
                }, 10);
            } else {
                inst.tabBtn.classList.remove('active');
                inst.domBody.style.display = 'none';
            }
        }
    }

    closeInstance(id) {
        if (!this.instances.has(id)) return;

        if (this.ipcRenderer) {
            this.ipcRenderer.send('terminal-kill', { id });
        }

        const inst = this.instances.get(id);
        inst.resizeObserver.disconnect();
        inst.term.dispose();
        inst.tabBtn.remove();
        inst.domBody.remove();
        this.instances.delete(id);

        if (this.activeInstanceId === id) {
            if (this.instances.size > 0) {
                const firstId = this.instances.keys().next().value;
                this.setActiveInstance(firstId);
            } else {
                this.activeInstanceId = null;
                this.togglePanel(false);
            }
        }
    }
}

if (typeof window !== 'undefined') {
    window.addEventListener('DOMContentLoaded', () => {
        window.terminalCtrl = new TerminalController();
    });
}
