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
        this.toolbarSkillsBtn = document.getElementById('toolbarSkillsBtn');
        this.toolbarSetupBtn = document.getElementById('toolbarSetupBtn');
        this.toolbarPrdBtn = document.getElementById('toolbarPrdBtn');
        this.toolbarAttachBtn = document.getElementById('toolbarAttachBtn');
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
                    const inst = this.instances.get(this.activeInstanceId);
                    if (!inst) return;

                    if (!inst.isClaudeActive) {
                        this.ipcRenderer.send('terminal-input', {
                            id: this.activeInstanceId,
                            input: 'claude --dangerously-skip-permissions\r'
                        });
                        inst.isClaudeActive = true;
                    } else {
                        // Si Claude está corriendo, enviar /exit
                        this.ipcRenderer.send('terminal-input', {
                            id: this.activeInstanceId,
                            input: '/exit'
                        });
                        inst.isClaudeActive = false;
                    }

                    this.updateClaudeBtnUI();

                    if (inst.term) {
                        inst.term.focus();
                    }
                }
            });
        }

        if (this.toolbarSkillsBtn) {
            this.toolbarSkillsBtn.addEventListener('click', () => {
                if (this.activeInstanceId && this.ipcRenderer) {
                    const inst = this.instances.get(this.activeInstanceId);
                    if (!inst || !inst.isClaudeActive) return;

                    this.ipcRenderer.send('terminal-input', {
                        id: this.activeInstanceId,
                        input: '/skills'
                    });

                    if (inst.term) {
                        inst.term.focus();
                    }
                }
            });
        }

        if (this.toolbarSetupBtn) {
            this.toolbarSetupBtn.addEventListener('click', () => {
                if (this.activeInstanceId && this.ipcRenderer) {
                    const inst = this.instances.get(this.activeInstanceId);
                    if (!inst || !inst.isClaudeActive) return;

                    this.ipcRenderer.send('terminal-input', {
                        id: this.activeInstanceId,
                        input: '/setup'
                    });

                    if (inst.term) {
                        inst.term.focus();
                    }
                }
            });
        }

        if (this.toolbarPrdBtn) {
            this.toolbarPrdBtn.addEventListener('click', () => {
                if (this.activeInstanceId && this.ipcRenderer) {
                    const inst = this.instances.get(this.activeInstanceId);
                    if (!inst || !inst.isClaudeActive) return;

                    this.ipcRenderer.send('terminal-input', {
                        id: this.activeInstanceId,
                        input: '/prd-draft'
                    });

                    if (inst.term) {
                        inst.term.focus();
                    }
                }
            });
        }

        if (this.toolbarAttachBtn) {
            this.toolbarAttachBtn.addEventListener('click', async () => {
                if (this.activeInstanceId && this.ipcRenderer) {
                    const inst = this.instances.get(this.activeInstanceId);
                    if (!inst || !inst.isClaudeActive) return;

                    const filePaths = await this.ipcRenderer.invoke('select-file');
                    if (filePaths && filePaths.length > 0) {
                        this.insertFilePaths(filePaths);
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
                const inst = this.instances.get(id);

                // Always write data to the terminal so nothing is swallowed
                inst.term.write(data);

                if (type === 'auth_error' && inst.isClaudeActive && !inst._authAlertShown) {
                    // Only show the alert when Claude was running (not during login flow)
                    inst._authAlertShown = true;
                    inst.isClaudeActive = false;
                    this.updateClaudeBtnUI();

                    setTimeout(() => {
                        window.alert('Tu sesión de Claude CLI ha expirado.\nDebes escribir /login en la terminal y pulsar Enter para volver a identificarte con tu cuenta Pro/Team.');
                        inst._authAlertShown = false;
                    }, 500);
                } else if (inst.isClaudeActive && typeof data === 'string') {
                    // Detect when Claude exits back to the shell prompt
                    const claudeExitPatterns = [
                        'Bye!',               // Claude CLI farewell message
                        '> Human:',           // some versions echo this on exit
                        '\x1b[?25h\r\n$',     // bash prompt reappearing
                    ];
                    const exited = claudeExitPatterns.some(p => data.includes(p));
                    if (exited) {
                        inst.isClaudeActive = false;
                        this.updateClaudeBtnUI();
                    }
                }
            }
        });

        this.ipcRenderer.on('terminal-exit', (event, { id, code }) => {
            if (this.instances.has(id)) {
                const inst = this.instances.get(id);
                inst.term.writeln(`\r\n[Proceso terminado con código ${code}]`);

                // When the shell (bash) dies, Claude is also gone by definition.
                // Reset the flag so the toolbar shows "Arrancar Claude" again.
                if (inst.isClaudeActive) {
                    inst.isClaudeActive = false;
                    if (this.activeInstanceId === id) {
                        this.updateClaudeBtnUI();
                    }
                }
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
            alert('Las terminales reales solo están disponibles en modo nativo (CompassAI).');
            return;
        }

        this.togglePanel(true);

        const currentDir = window.appCtrl && window.appCtrl.currentRootDir
            ? window.appCtrl.currentRootDir
            : null;

        const res = await this.ipcRenderer.invoke('terminal-start', {
            cwd: currentDir
            // omitted command so it defaults to process.env.SHELL on the backend
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

        this.instances.set(id, { id, tabBtn, domBody, term, fitAddon, resizeObserver, isClaudeActive: false });

        // --- Drag & Drop support for file attachment ---
        // Prevent Electron from navigating to dropped files (global, idempotent)
        if (!TerminalController._dragPreventionInstalled) {
            document.addEventListener('dragover', (e) => e.preventDefault(), true);
            document.addEventListener('drop', (e) => e.preventDefault(), true);
            TerminalController._dragPreventionInstalled = true;
        }

        const dropOverlay = document.createElement('div');
        dropOverlay.className = 'terminal-drop-overlay';
        dropOverlay.innerHTML = '<div class="terminal-drop-label">📎 Suelta archivos aquí para adjuntar</div>';
        dropOverlay.style.cssText = 'display:none; position:absolute; inset:0; background:rgba(59,130,246,0.15); border:2px dashed rgba(59,130,246,0.6); border-radius:8px; z-index:100; align-items:center; justify-content:center;';
        dropOverlay.querySelector('.terminal-drop-label').style.cssText = 'background:rgba(59,130,246,0.9); color:white; padding:8px 20px; border-radius:6px; font-size:13px; font-weight:600; pointer-events:none;';
        domBody.style.position = 'relative';
        domBody.appendChild(dropOverlay);

        let dragCounter = 0;

        // Use the entire panel for dragenter so we catch events even over the xterm canvas
        const panelEl = this.panel;

        panelEl.addEventListener('dragenter', (e) => {
            e.preventDefault();
            dragCounter++;
            const inst = this.instances.get(id);
            if (inst && inst.isClaudeActive && this.activeInstanceId === id) {
                dropOverlay.style.display = 'flex';
            }
        });

        panelEl.addEventListener('dragleave', (e) => {
            e.preventDefault();
            dragCounter--;
            if (dragCounter <= 0) {
                dragCounter = 0;
                dropOverlay.style.display = 'none';
            }
        });

        panelEl.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = 'copy';
        });

        // The overlay itself accepts the drop (it covers the xterm canvas)
        dropOverlay.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dragCounter = 0;
            dropOverlay.style.display = 'none';

            const inst = this.instances.get(id);
            if (!inst || !inst.isClaudeActive) return;

            // Check for internal file tree drag (text/plain with relative path)
            const internalPath = e.dataTransfer.getData('text/plain');
            if (internalPath && !e.dataTransfer.files.length) {
                this.insertFilePaths([internalPath]);
                return;
            }

            // External file drag from Finder
            const files = e.dataTransfer.files;
            if (files && files.length > 0) {
                const paths = [];
                for (let i = 0; i < files.length; i++) {
                    if (files[i].path) {
                        paths.push(files[i].path);
                    }
                }
                if (paths.length > 0) {
                    this.insertFilePaths(paths);
                }
            }
        });

        // Also handle drop on the domBody itself as a fallback
        domBody.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dragCounter = 0;
            dropOverlay.style.display = 'none';

            const inst = this.instances.get(id);
            if (!inst || !inst.isClaudeActive) return;

            const internalPath = e.dataTransfer.getData('text/plain');
            if (internalPath && !e.dataTransfer.files.length) {
                this.insertFilePaths([internalPath]);
                return;
            }

            const files = e.dataTransfer.files;
            if (files && files.length > 0) {
                const paths = [];
                for (let i = 0; i < files.length; i++) {
                    if (files[i].path) {
                        paths.push(files[i].path);
                    }
                }
                if (paths.length > 0) {
                    this.insertFilePaths(paths);
                }
            }
        });
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

        this.updateClaudeBtnUI();
    }

    updateClaudeBtnUI() {
        if (!this.toolbarClaudeBtn || !this.activeInstanceId) return;

        const inst = this.instances.get(this.activeInstanceId);
        if (inst) {
            if (inst.isClaudeActive) {
                this.toolbarClaudeBtn.innerHTML = `
                    <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                    Terminar Claude
                `;
                this.toolbarClaudeBtn.style.color = 'var(--text-color)';

                if (this.toolbarSkillsBtn) {
                    this.toolbarSkillsBtn.style.display = 'flex';
                }
                if (this.toolbarSetupBtn) {
                    this.toolbarSetupBtn.style.display = 'flex';
                }
                if (this.toolbarSkillsBtn) {
                    this.toolbarSkillsBtn.style.display = 'flex';
                }
                if (this.toolbarPrdBtn) {
                    this.toolbarPrdBtn.style.display = 'flex';
                }
                if (this.toolbarAttachBtn) {
                    this.toolbarAttachBtn.style.display = 'flex';
                }
            } else {
                this.toolbarClaudeBtn.innerHTML = `
                    <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                    Arrancar Claude
                `;
                this.toolbarClaudeBtn.style.color = 'var(--text-color)';

                if (this.toolbarSetupBtn) {
                    this.toolbarSetupBtn.style.display = 'none';
                }
                if (this.toolbarSkillsBtn) {
                    this.toolbarSkillsBtn.style.display = 'none';
                }
                if (this.toolbarPrdBtn) {
                    this.toolbarPrdBtn.style.display = 'none';
                }
                if (this.toolbarAttachBtn) {
                    this.toolbarAttachBtn.style.display = 'none';
                }
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

    insertFilePaths(paths) {
        if (!this.activeInstanceId || !this.ipcRenderer) return;
        const inst = this.instances.get(this.activeInstanceId);
        if (!inst || !inst.isClaudeActive) return;

        const text = paths.join(' ');
        this.ipcRenderer.send('terminal-input', {
            id: this.activeInstanceId,
            input: text
        });

        if (inst.term) {
            inst.term.focus();
        }
    }
}

if (typeof window !== 'undefined') {
    window.addEventListener('DOMContentLoaded', () => {
        window.terminalCtrl = new TerminalController();
    });
}
