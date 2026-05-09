document.addEventListener('DOMContentLoaded', () => {
    if (window.api) {
        document.body.classList.add('electron-mode');
    }

    // --- ELEMENTOS DEL DOM ---
    const welcomeScreen = document.getElementById('welcomeScreen');
    const appContainer = document.getElementById('appContainer');
    const fileTreeContainer = document.getElementById('fileTreeContainer');
    const markdownContent = document.getElementById('markdownContent');
    const tabsContainer = document.getElementById('tabsContainer');
    const editorToolbar = document.getElementById('editorToolbar');
    const toggleSplitBtn = document.getElementById('toggleSplitBtn');
    const saveFileBtn = document.getElementById('saveFileBtn');
    const editorPanel = document.getElementById('editorPanel');
    const markdownEditor = document.getElementById('markdownEditor');
    const toggleTocBtn = document.getElementById('toggleTocBtn');
    const tocPanel = document.getElementById('tocPanel');
    const tocList = document.getElementById('tocList');
    const previewPanel = document.getElementById('previewPanel');
    const lineNumbers  = document.getElementById('lineNumbers');
    const editorLineMirror = document.getElementById('editorLineMirror');

    // --- LINE NUMBERS (scroll-anchored via shared container + mirror height) ---
    function updateLineNumbers() {
        if (!lineNumbers) return;
        // Skip measurement when the editor panel is hidden — dimensions would be 0
        if (editorPanel && editorPanel.style.display === 'none') return;
        const lines = markdownEditor.value.split('\n');

        // Resize textarea to fit content (parent container scrolls)
        markdownEditor.style.height = 'auto';
        markdownEditor.style.height = markdownEditor.scrollHeight + 'px';

        // Measure each line's rendered height using the mirror div
        const mirror = editorLineMirror;
        const editorWidth = markdownEditor.clientWidth
            - parseFloat(getComputedStyle(markdownEditor).paddingLeft)
            - parseFloat(getComputedStyle(markdownEditor).paddingRight);
        if (editorWidth <= 0) return;
        mirror.style.width = editorWidth + 'px';

        const lineHeight = parseFloat(getComputedStyle(markdownEditor).lineHeight);
        const spans = [];

        for (let i = 0; i < lines.length; i++) {
            // Use a non-breaking space for empty lines so the mirror still has height
            mirror.textContent = lines[i] || '\u00a0';
            const h = mirror.offsetHeight;
            // Round to nearest multiple of lineHeight to keep alignment clean
            const adjustedH = Math.max(lineHeight, Math.ceil(h / lineHeight) * lineHeight);
            spans.push(`<span style="height:${adjustedH}px;line-height:${adjustedH}px">${i + 1}</span>`);
        }

        lineNumbers.innerHTML = spans.join('');
    }

    markdownEditor.addEventListener('input', updateLineNumbers);
    // No scroll sync needed — parent .editor-with-lines scrolls both together

    // Welcome screen
    const welcomeLocalBtn = document.getElementById('welcomeLocalBtn');
    const welcomeGitHubBtn = document.getElementById('welcomeGitHubBtn');
    const welcomeCompassAIBtn = document.getElementById('welcomeCompassAIBtn');
    const githubRepoSelector = document.getElementById('githubRepoSelector');
    const githubUserInfo = document.getElementById('githubUserInfo');
    const repoSearchInput = document.getElementById('repoSearchInput');
    const repoList = document.getElementById('repoList');
    const githubLogoutBtn = document.getElementById('githubLogoutBtn');
    const githubSetup = document.getElementById('githubSetup');
    const tokenInput = document.getElementById('tokenInput');
    const saveTokenBtn = document.getElementById('saveTokenBtn');
    const sourceIndicator = document.getElementById('sourceIndicator');

    // Search Modal
    const searchModal = document.getElementById('searchModal');
    const searchInput = document.getElementById('searchInput');
    const searchResults = document.getElementById('searchResults');
    const searchSpinner = document.getElementById('searchSpinner');

    // State
    let openTabs = [];
    let activeTabId = null;
    let isEditorOpen = false;
    let isTocOpen = false;
    let currentGitHubRepo = null;
    let currentLocalFolderHandle = null;
    let currentNodeServer = false;
    let allRepos = [];
    let expandedFolders = new Set();
    let splitGroups = []; // Array de { left: tabId, right: tabId } — pares de tabs emparejados
    let splitFlexPct = 50; // porcentaje del panel izquierdo (para recordar el resize)

    // Busca el splitGroup al que pertenece un tabId, o null
    function findSplitGroupFor(tabId) {
        return splitGroups.find(g => g.left === tabId || g.right === tabId) || null;
    }

    // Bloquear webviews/iframes durante drag resize
    function _blockWebviews() {
        document.querySelectorAll('webview, iframe').forEach(el => { el.style.pointerEvents = 'none'; });
    }
    function _unblockWebviews() {
        document.querySelectorAll('webview, iframe').forEach(el => { el.style.pointerEvents = ''; });
    }

    // Context menu compartido (sidebar + tabs)
    let activeContextMenu = null;
    function removeContextMenu() {
        document.querySelectorAll('.tab-context-menu').forEach(el => el.remove());
        activeContextMenu = null;
    }
    document.addEventListener('click', removeContextMenu);

    // Search State
    let localSearchIndex = new Map(); // path -> { path, name, rawContent }
    let isSearchModalOpen = false;
    let searchDebounceTimer = null;
    let searchSelectedIndex = -1;
    let currentSearchResults = [];
    let isIndexing = false;

    function showCustomPrompt(message, defaultValue) {
        return new Promise((resolve) => {
            const modal = document.getElementById('customPromptModal');
            const title = document.getElementById('customPromptTitle');
            const input = document.getElementById('customPromptInput');
            const btnOk = document.getElementById('customPromptOk');
            const btnCancel = document.getElementById('customPromptCancel');

            if (!modal) {
                const res = prompt(message, defaultValue);
                resolve(res);
                return;
            }

            title.textContent = message;
            input.value = defaultValue || '';
            modal.style.display = 'flex';
            setTimeout(() => input.focus(), 50);

            const cleanup = () => {
                btnOk.removeEventListener('click', onOk);
                btnCancel.removeEventListener('click', onCancel);
                input.removeEventListener('keydown', onKey);
                modal.style.display = 'none';
            };

            const onOk = () => {
                cleanup();
                resolve(input.value);
            };

            const onCancel = () => {
                cleanup();
                resolve(null);
            };

            const onKey = (e) => {
                if (e.key === 'Enter') onOk();
                if (e.key === 'Escape') onCancel();
            };

            btnOk.addEventListener('click', onOk);
            btnCancel.addEventListener('click', onCancel);
            input.addEventListener('keydown', onKey);
        });
    }

    function updateSourceIndicator() {
        if (!sourceIndicator) return;

        let projectName = 'CompassAI';

        if (currentLocalFolderHandle) {
            projectName = currentLocalFolderHandle.name;
            sourceIndicator.textContent = 'LOCAL';
            sourceIndicator.title = `Carpeta Local: ${currentLocalFolderHandle.name}`;
        } else if (currentNodeServer) {
            let folderName = 'Servidor Local';
            if (window.api) {
                const lastFolder = localStorage.getItem('pmos_last_folder');
                if (lastFolder) {
                    const parts = lastFolder.split(/[/\\]/).filter(Boolean);
                    if (parts.length > 0) {
                        folderName = parts[parts.length - 1];
                    }
                }
            }
            projectName = folderName;
            sourceIndicator.textContent = 'LOCAL';
            sourceIndicator.title = `Servidor Node Local: ${folderName}`;
        } else if (currentGitHubRepo) {
            projectName = currentGitHubRepo.repo;
            sourceIndicator.textContent = 'GITHUB';
            sourceIndicator.title = `GitHub: ${currentGitHubRepo.fullName}`;
        } else {
            sourceIndicator.textContent = '';
            sourceIndicator.title = '';
        }

        let formattedTitle = projectName;
        if (projectName === 'Servidor Local') {
            formattedTitle = 'CompassAI';
        }

        document.title = formattedTitle;

        if (window.api) {
            try {
                let representedPath = null;
                if (currentNodeServer) {
                    representedPath = localStorage.getItem('pmos_last_folder');
                }
                window.api.setWindowTitle({
                    title: formattedTitle,
                    path: representedPath
                });
            } catch (err) {
                console.error('Error setting native window title via IPC', err);
            }
        }
    }

    // Undo/Redo: historial por tab { tabId: { undoStack: [], redoStack: [] } }
    let tabHistory = {};
    let historyTimer = null;

    // Configurar Marked.js
    const renderer = new marked.Renderer();
    const originalLink = renderer.link.bind(renderer);
    renderer.link = function (token) {
        const html = originalLink(token);
        // Add target="_blank" to all links
        return html.replace('<a ', '<a target="_blank" rel="noopener noreferrer" ');
    };

    marked.setOptions({
        renderer,
        highlight: function (code, lang) {
            const language = hljs.getLanguage(lang) ? lang : 'plaintext';
            return hljs.highlight(code, { language }).value;
        },
        langPrefix: 'hljs language-',
        breaks: true,
        gfm: true
    });

    // ===================================
    // PERSISTENCIA DE WORKSPACE (IndexedDB)
    // ===================================

    const WorkspaceDB = (() => {
        const DB_NAME = 'MarkdownViewerDB';
        const STORE_NAME = 'workspace';
        const NOTES_STORE = 'notes';
        const SETTINGS_STORE = 'settings';

        function getDB() {
            return new Promise((resolve, reject) => {
                const request = indexedDB.open(DB_NAME, 3);
                request.onerror = () => reject(request.error);
                request.onsuccess = () => resolve(request.result);
                request.onupgradeneeded = (e) => {
                    const db = e.target.result;
                    if (!db.objectStoreNames.contains(STORE_NAME)) {
                        db.createObjectStore(STORE_NAME);
                    }
                    if (!db.objectStoreNames.contains(NOTES_STORE)) {
                        db.createObjectStore(NOTES_STORE);
                    }
                    if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
                        db.createObjectStore(SETTINGS_STORE, { keyPath: 'key' });
                    }
                };
            });
        }

        async function save(state) {
            const db = await getDB();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(STORE_NAME, 'readwrite');
                const store = tx.objectStore(STORE_NAME);
                const request = store.put(state, 'current_state');
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        }

        async function load() {
            const db = await getDB();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(STORE_NAME, 'readonly');
                const store = tx.objectStore(STORE_NAME);
                const request = store.get('current_state');
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        }

        async function saveNote(fileId, text) {
            const db = await getDB();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(NOTES_STORE, 'readwrite');
                const store = tx.objectStore(NOTES_STORE);
                const request = store.put({ text, updatedAt: Date.now() }, fileId);
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        }

        async function loadNote(fileId) {
            const db = await getDB();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(NOTES_STORE, 'readonly');
                const store = tx.objectStore(NOTES_STORE);
                const request = store.get(fileId);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        }

        async function deleteNote(fileId) {
            const db = await getDB();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(NOTES_STORE, 'readwrite');
                const store = tx.objectStore(NOTES_STORE);
                const request = store.delete(fileId);
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        }

        return { save, load, getDB, saveNote, loadNote, deleteNote };
    })();

    async function saveWorkspaceState() {
        if (!currentGitHubRepo && !currentLocalFolderHandle && !currentNodeServer) return;

        const state = {
            type: currentGitHubRepo ? 'github' : (currentNodeServer ? 'node' : 'local'),
            currentGitHubRepo,
            localFolderHandle: currentLocalFolderHandle,
            currentNodeServer,
            activeTabId,
            expandedFolders: [...expandedFolders],
            codaPages: window._getCodaPages ? window._getCodaPages() : [],
            openTabs: openTabs.map(t => ({
                id: t.id,
                name: t.name,
                path: t.path,
                handle: t.handle,
                isLocal: t.isLocal,
                isNode: t.isNode,
                isGitHub: t.isGitHub,
                isHtml: t.isHtml,
                isCoda: t.isCoda,
                codaId: t.codaId,
                codaEmbedUrl: t.codaEmbedUrl,
                githubMeta: t.githubMeta,
                content: t.isCoda ? '' : t.content,
                rawContent: t.isCoda ? '' : t.rawContent,
                savedContent: t.isCoda ? '' : t.savedContent,
                dirty: t.dirty
            }))
        };

        try {
            await WorkspaceDB.save(state);
        } catch (err) {
            console.error("Error guardando workspace en IndexedDB:", err);
        }
    }

    // ===================================
    // FLUJO DE INICIO
    // ===================================

    initApp();

    async function initApp() {
        await GitHubAPI.init(); // carga el token cifrado desde el keychain del sistema
        const state = await WorkspaceDB.load();
        if (state && (state.currentGitHubRepo || state.localFolderHandle || state.currentNodeServer)) {
            // Restore state
            currentGitHubRepo = state.currentGitHubRepo;
            currentLocalFolderHandle = state.localFolderHandle;
            currentNodeServer = state.currentNodeServer || false;
            openTabs = state.openTabs || [];
            activeTabId = state.activeTabId;
            expandedFolders = new Set(state.expandedFolders || []);

            // Restore Coda pages (will render the sidebar list)
            if (state.codaPages && window._setCodaPages) {
                window._setCodaPages(state.codaPages);
            }

            // En CompassAI nativo (Electron), los handles locales del navegador no sirven.
            // Si venimos de versiones antiguas, forzamos la limpieza de ese estado.
            if (window.api && currentLocalFolderHandle) {
                currentLocalFolderHandle = null;
                openTabs = []; // Evitamos pestañas rotas de sesiones pasadas
            }

            // Regenerate Blob URLs for HTML files since they don't survive browser reloads
            openTabs.forEach(t => {
                // Retroactive fix for tabs saved before isHtml was added to state
                if (t.isHtml === undefined && t.name && t.name.endsWith('.html')) {
                    t.isHtml = true;
                }

                if (t.isHtml && t.rawContent) {
                    const blob = new Blob([t.rawContent], { type: 'text/html' });
                    const url = URL.createObjectURL(blob);
                    t.content = `
                        <div class="html-preview-wrapper">
                            <div id="htmlPreviewFrame" class="html-preview-frame desktop">
                                <iframe src="${url}" sandbox="allow-scripts allow-same-origin" style="width:100%; height:100%; border:none; background:white; display:block;"></iframe>
                            </div>
                        </div>
                    `;
                    t.blobUrl = url;
                }
            });

            // Mover showApp() dentro de cada condición para asegurar que solo se muestra si la restauración es exitosa
            // showApp(); // <- QUITAR ESTO DE AQUÍ GENERAL.

            // Render Sidebar
            if (currentGitHubRepo) {
                showApp();
                fileTreeContainer.innerHTML = '<div class="loading-state">Cargando archivos del repositorio...</div>';
                try {
                    const treeData = await GitHubAPI.getRepoTree(currentGitHubRepo.owner, currentGitHubRepo.repo);
                    if (typeof flattenTreeToPaths === 'function') flatSearchPaths = flattenTreeToPaths(treeData);
                    fileTreeContainer.innerHTML = '';
                    fileTreeContainer.appendChild(renderTreeItem(treeData, true));
                } catch (err) {
                    fileTreeContainer.innerHTML = `<div class="error-state">Error: ${err.message}</div>`;
                }
            } else if (currentNodeServer) {
                // Si estamos en CompassAI (Electron nativo)
                if (window.api) {
                    const lastFolder = localStorage.getItem('pmos_last_folder');
                    if (lastFolder) {
                        try {
                            const res = await fetch('/api/set-root', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ newRoot: lastFolder })
                            });
                            if (res.ok) {
                                showApp();
                                await renderNodeFolder();
                            } else {
                                // La ruta ya no existe: limpiar estado para no reintentar en cada recarga
                                currentNodeServer = false;
                                openTabs = [];
                                activeTabId = null;
                                localStorage.removeItem('pmos_last_folder');
                                await saveWorkspaceState();
                                showWelcomeScreen();
                                return;
                            }
                        } catch (e) {
                            // Error de red u otro: ídem, limpiar y mostrar bienvenida
                            currentNodeServer = false;
                            openTabs = [];
                            activeTabId = null;
                            localStorage.removeItem('pmos_last_folder');
                            await saveWorkspaceState();
                            showWelcomeScreen();
                            return;
                        }
                    } else {
                        // No hay carpeta guardada: limpiar y mostrar bienvenida
                        currentNodeServer = false;
                        await saveWorkspaceState();
                        showWelcomeScreen();
                        return;
                    }
                } else {
                    // Si estamos en modo web sirviendo con node server.js tradicional
                    showApp();
                    await renderNodeFolder();
                }
            } else if (currentLocalFolderHandle) {
                showApp(); // Mostrar app primero para enseñar el botón de restaurar si hiciera falta
                const hasPerm = await verifyPermission(currentLocalFolderHandle, false);
                if (hasPerm) {
                    await renderLocalFolder(currentLocalFolderHandle);
                } else {
                    fileTreeContainer.innerHTML = `
                        <div style="padding: 20px; text-align: center;">
                            <p style="margin-bottom: 12px; font-size: 0.85rem; color: var(--text-muted);">
                                Para restaurar la carpeta local, haz clic abajo.
                            </p>
                            <button id="restoreLocalBtn" class="action-btn" style="background: var(--bg-hover); padding: 6px 16px; margin: 0 auto; border: 1px solid var(--border-color);">
                                Restaurar Sesión
                            </button>
                        </div>
                    `;
                    document.getElementById('restoreLocalBtn').addEventListener('click', async () => {
                        const verified = await verifyPermission(currentLocalFolderHandle, true);
                        if (verified) {
                            await renderLocalFolder(currentLocalFolderHandle);
                        }
                    });
                }
            }

            // Restore Main Area
            if (activeTabId) {
                setActiveTab(activeTabId);
            } else {
                renderTabs();
            }
        } else {
            showWelcomeScreen();
        }
    }

    async function renderNodeFolder() {
        fileTreeContainer.innerHTML = '<div class="loading-state">Cargando árbol del servidor...</div>';
        try {
            const res = await fetch('/api/tree');
            if (!res.ok) throw new Error('Error al cargar árbol del servidor local');
            const treeData = await res.json();
            if (typeof flattenTreeToPaths === 'function') flatSearchPaths = flattenTreeToPaths(treeData);

            // start local indexing loosely for node
            if (typeof startNodeIndexing === 'function') startNodeIndexing(treeData);

            fileTreeContainer.innerHTML = '';
            fileTreeContainer._treeData = treeData;
            const rootEl = renderTreeItem(treeData, true);
            fileTreeContainer.appendChild(rootEl);
        } catch (err) {
            fileTreeContainer.innerHTML = `<div class="error-state">Error: ${err.message}</div>`;
        }
    }

    async function verifyPermission(fileHandle, request = false) {
        const options = { mode: 'readwrite' };
        if ((await fileHandle.queryPermission(options)) === 'granted') {
            return true;
        }
        if (request && (await fileHandle.requestPermission(options)) === 'granted') {
            return true;
        }
        return false;
    }

    function showWelcomeScreen() {
        welcomeScreen.style.display = 'flex';
        appContainer.style.display = 'none';
        githubRepoSelector.style.display = 'none';
        githubSetup.style.display = 'none';
    }

    function showApp() {
        welcomeScreen.style.display = 'none';
        appContainer.style.display = 'flex';
        updateSourceIndicator();
    }

    // ===================================
    // WELCOME SCREEN BUTTONS
    // ===================================

    // Carpeta local
    welcomeLocalBtn.addEventListener('click', async () => {
        try {
            // 1. Detección primero para CompassAI (Electron)
            if (window.api) {
                const folderPath = await window.api.selectFolder();

                if (!folderPath) return; // Usuario canceló el popup nativo de Mac

                // Notificar al backend de la nueva ruta elegida
                const res = await fetch('/api/set-root', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ newRoot: folderPath })
                });

                if (res.ok) {
                    currentGitHubRepo = null;
                    currentLocalFolderHandle = null;
                    currentNodeServer = true;
                    localStorage.setItem('pmos_last_folder', folderPath);
                    showApp();
                    await renderNodeFolder();
                    saveWorkspaceState();
                    return;
                } else {
                    alert('Error al establecer la carpeta en CompassAI. Comprueba los permisos.');
                    return;
                }
            }

            // 2. Comprobar si tenemos el servidor backend Node local corriendo de fondo (Web Mode)
            const res = await fetch('/api/tree').catch(() => null);
            if (res && res.ok) {
                currentGitHubRepo = null;
                currentLocalFolderHandle = null;
                currentNodeServer = true;
                showApp();
                await renderNodeFolder();
                saveWorkspaceState();
                return;
            }

            // 3. Fallback final: usar File System Access API nativa (Web Browser Mode)
            const dirHandle = await window.showDirectoryPicker();
            currentGitHubRepo = null;
            currentNodeServer = false;
            currentLocalFolderHandle = dirHandle;
            showApp();
            await renderLocalFolder(dirHandle);
            saveWorkspaceState();
        } catch (err) {
            if (err.name !== 'AbortError') {
                alert('Error al abrir carpeta: ' + err.message);
            }
        }
    });

    // GitHub
    welcomeGitHubBtn.addEventListener('click', async () => {
        if (GitHubAPI.isAuthenticated()) {
            await showGitHubRepos();
        } else {
            githubSetup.style.display = 'block';
            tokenInput.value = '';
            tokenInput.focus();
        }
    });

    // CompassAI
    if (welcomeCompassAIBtn) {
        welcomeCompassAIBtn.addEventListener('click', async () => {
            const workspaceName = await showCustomPrompt('Nombre del workspace (carpeta):', 'CompassAI');
            if (!workspaceName) return;

            if (window.api) {
                // Modo Electron (Nativo)
                const result = await window.api.createCompassaiWorkspace(workspaceName);

                if (!result.success) {
                    if (result.error !== 'Cancelado por el usuario') {
                        alert('Error: ' + result.error);
                    }
                    return;
                }

                await applyNewWorkspace(result.path);
            } else {
                // Modo Web (Fallback al backend normal)
                try {
                    const res = await fetch('/api/create-compassai-workspace', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ workspaceName })
                    });

                    const data = await res.json();

                    if (res.ok && data.success) {
                        await applyNewWorkspace(data.path);
                    } else {
                        alert('Error: ' + (data.error || 'Fallo desconocido'));
                    }
                } catch (err) {
                    alert('Error de red al crear workspace: ' + err.message);
                }
            }
        });
    }

    async function applyNewWorkspace(targetFolder) {
        // Set as current folder
        const res = await fetch('/api/set-root', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ newRoot: targetFolder })
        });

        if (res.ok) {
            currentGitHubRepo = null;
            currentLocalFolderHandle = null;
            currentNodeServer = true;
            localStorage.setItem('pmos_last_folder', targetFolder);
            showApp();
            await renderNodeFolder();
            saveWorkspaceState();

            // Abrir automáticamente START-HERE.md
            setTimeout(() => {
                const fakeItem = {
                    path: 'START-HERE.md',
                    name: 'START-HERE.md',
                    type: 'file'
                };
                openFileTab(fakeItem);
            }, 300);

            setTimeout(() => {
                if (window.terminalCtrl && window.terminalCtrl.openTerminal) {
                    // Abrir terminal y enviar el comando inicial de setup
                    window.terminalCtrl.openTerminal();
                    // Dar un pequeño margen para que el terminal se renderice y esté listo
                    setTimeout(() => {
                        const activeId = window.terminalCtrl.getActiveTerminalId();
                        if (activeId) {
                            window.terminalCtrl.sendInput(activeId, '/setup\r');
                        }
                    }, 1000);
                } else {
                    alert('Workspace creado. Abre el terminal de la app y ejecuta /setup para empezar.');
                }
            }, 500);
        } else {
            alert('Error al establecer la carpeta en CompassAI.');
        }
    }

    // Guardar Token
    saveTokenBtn.addEventListener('click', async () => {
        const token = tokenInput.value.trim();
        if (!token) {
            alert('Por favor introduce un token válido.');
            return;
        }
        GitHubAPI.setToken(token);
        githubSetup.style.display = 'none';
        try {
            await showGitHubRepos();
        } catch (err) {
            GitHubAPI.clearToken();
            alert('Token inválido: ' + err.message);
            githubSetup.style.display = 'block';
        }
    });

    // Logout GitHub
    githubLogoutBtn.addEventListener('click', () => {
        GitHubAPI.clearToken();
        currentGitHubRepo = null;
        currentNodeServer = false;
        activeTabId = null;
        openTabs = [];
        tabHistory = {};
        saveWorkspaceState();
        githubRepoSelector.style.display = 'none';

        // Force reload to completely clear any cached state in memory
        window.location.reload();
    });

    // ===================================
    // GITHUB: LISTAR REPOS
    // ===================================

    async function showGitHubRepos() {
        githubRepoSelector.style.display = 'block';
        githubSetup.style.display = 'none';
        repoList.innerHTML = '<div class="loading-state" style="padding: 16px;">Cargando repositorios...</div>';

        try {
            const user = await GitHubAPI.getUser();
            githubUserInfo.innerHTML = `
                <img src="${user.avatar_url}" alt="${user.login}">
                <span><strong>${user.name || user.login}</strong></span>
            `;

            // Cargar repos (varias páginas)
            allRepos = [];
            let page = 1;
            while (true) {
                const repos = await GitHubAPI.listRepos(page, 100);
                if (repos.length === 0) break;
                allRepos = allRepos.concat(repos);
                if (repos.length < 100) break;
                page++;
            }

            renderRepoList(allRepos);

            // Filtrar repos con el buscador
            repoSearchInput.addEventListener('input', () => {
                const query = repoSearchInput.value.toLowerCase();
                const filtered = allRepos.filter(r =>
                    r.full_name.toLowerCase().includes(query)
                );
                renderRepoList(filtered);
            });

        } catch (err) {
            repoList.innerHTML = `<div class="error-state" style="padding: 16px;">Error: ${err.message}</div>`;
        }
    }

    function renderRepoList(repos) {
        repoList.innerHTML = '';
        if (repos.length === 0) {
            repoList.innerHTML = '<div class="loading-state" style="padding: 16px;">Sin resultados</div>';
            return;
        }
        repos.forEach(repo => {
            const item = document.createElement('div');
            item.className = 'repo-item';
            item.innerHTML = `
                <div>
                    <div class="repo-name">${repo.name}</div>
                    <div class="repo-owner">${repo.full_name}</div>
                </div>
                ${repo.private ? '<span class="repo-private">Privado</span>' : ''}
            `;
            item.addEventListener('click', () => openGitHubRepo(repo));
            repoList.appendChild(item);
        });
    }

    async function openGitHubRepo(repo) {
        currentGitHubRepo = {
            owner: repo.owner.login,
            repo: repo.name,
            fullName: repo.full_name
        };
        currentLocalFolderHandle = null;

        showApp();
        fileTreeContainer.innerHTML = '<div class="loading-state">Cargando archivos del repositorio...</div>';

        try {
            const treeData = await GitHubAPI.getRepoTree(currentGitHubRepo.owner, currentGitHubRepo.repo);
            if (typeof flattenTreeToPaths === 'function') flatSearchPaths = flattenTreeToPaths(treeData);

            fileTreeContainer.innerHTML = '';
            const rootEl = renderTreeItem(treeData, true);
            fileTreeContainer.appendChild(rootEl);
            saveWorkspaceState();
        } catch (err) {
            fileTreeContainer.innerHTML = `<div class="error-state">Error: ${err.message}</div>`;
        }
    }

    // ===================================
    // BOTONES DE LA APP PRINCIPAL
    // ===================================

    // Abrir Terminal (Solo Electron)
    const openTerminalMenuBtn = document.getElementById('openTerminalMenuBtn');
    const menuTerminalDropdown = document.getElementById('menuTerminalProfileDropdown');
    if (openTerminalMenuBtn && window.api) {
        openTerminalMenuBtn.style.display = 'block';
        openTerminalMenuBtn.addEventListener('click', () => {
            if (window.terminalCtrl) {
                window.terminalCtrl.openTerminal();
            }
        });
        // Right-click: elegir perfil
        if (menuTerminalDropdown) {
            const profiles = [
                { id: 'terminal', label: 'Terminal',  icon: '>' },
                { id: 'claude',   label: 'Claude',    icon: '✦' },
                { id: 'gemini',   label: 'Gemini',    icon: '◆' },
                { id: 'openai',   label: 'ChatGPT',   icon: '●' },
            ];
            for (const profile of profiles) {
                const item = document.createElement('button');
                item.className = 'pane-profile-item';
                item.innerHTML = `<span class="pane-profile-icon">${profile.icon}</span>${profile.label}`;
                item.addEventListener('click', (e) => {
                    e.stopPropagation();
                    menuTerminalDropdown.classList.remove('open');
                    if (window.terminalCtrl) window.terminalCtrl.openTerminal({ profile: profile.id });
                });
                menuTerminalDropdown.appendChild(item);
            }
            openTerminalMenuBtn.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                e.stopPropagation();
                document.querySelectorAll('.pane-profile-dropdown.open, .pane-theme-dropdown.open').forEach(d => {
                    if (d !== menuTerminalDropdown) d.classList.remove('open');
                });
                const isOpen = menuTerminalDropdown.classList.toggle('open');
                if (isOpen) {
                    const btnRect = openTerminalMenuBtn.getBoundingClientRect();
                    const ddHeight = menuTerminalDropdown.scrollHeight;
                    const ddWidth = menuTerminalDropdown.offsetWidth || 140;
                    let top = btnRect.bottom + 2;
                    if (top + ddHeight > window.innerHeight - 8) top = btnRect.top - ddHeight - 2;
                    if (top < 8) top = 8;
                    let left = btnRect.right - ddWidth;
                    if (left < 8) left = 8;
                    menuTerminalDropdown.style.top = top + 'px';
                    menuTerminalDropdown.style.left = left + 'px';
                }
            });
            document.addEventListener('click', (e) => {
                if (!openTerminalMenuBtn.parentElement.contains(e.target)) menuTerminalDropdown.classList.remove('open');
            });
        }
    }

    // Abrir carpeta local (desde dentro de la app)
    const openFolderBtn = document.getElementById('openFolderBtn');
    if (openFolderBtn) {
        openFolderBtn.addEventListener('click', async () => {
            try {
                // 1. Detección primero para CompassAI (Electron)
                if (window.api) {
                        const folderPath = await window.api.selectFolder();

                    if (!folderPath) return; // Usuario canceló el popup nativo de Mac

                    // Notificar al backend de la nueva ruta elegida
                    const res = await fetch('/api/set-root', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ newRoot: folderPath })
                    });

                    if (res.ok) {
                        currentGitHubRepo = null;
                        currentLocalFolderHandle = null;
                        currentNodeServer = true;
                        localStorage.setItem('pmos_last_folder', folderPath);
                        showApp();
                        await renderNodeFolder();
                        saveWorkspaceState();
                        return;
                    } else {
                        alert('Error al establecer la carpeta en CompassAI. Comprueba los permisos.');
                        return;
                    }
                }

                // 2. Fallback final: Web Browser Mode
                const dirHandle = await window.showDirectoryPicker();
                currentGitHubRepo = null;
                currentNodeServer = false;
                currentLocalFolderHandle = dirHandle;
                await renderLocalFolder(dirHandle);
                saveWorkspaceState();
            } catch (err) {
                if (err.name !== 'AbortError') {
                    fileTreeContainer.innerHTML = `<div class="error-state">Error al abrir carpeta: ${err.message}</div>`;
                }
            }
        });
    }

    // Botón Home
    const homeBtn = document.getElementById('homeBtn');
    if (homeBtn) {
        homeBtn.addEventListener('click', () => {
            // Verificar si hay tabs dirty
            const dirtyTabs = openTabs.filter(t => t.dirty);
            if (dirtyTabs.length > 0) {
                if (!confirm('Hay archivos con cambios sin guardar. ¿Volver al inicio?')) return;
            }
            openTabs = [];
            activeTabId = null;
            currentGitHubRepo = null;
            currentLocalFolderHandle = null;
            currentNodeServer = false;
            renderTabs();
            showWelcomeScreen();
            saveWorkspaceState();
        });
    }

    // Toggle Editor
    toggleSplitBtn.addEventListener('click', () => {
        isEditorOpen = !isEditorOpen;
        updateEditorVisibility();
    });

    // Toggle Sidebar
    const sidebar = document.getElementById('sidebar');

    // Mobile sidebar drawer
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const sidebarOverlay = document.getElementById('sidebarOverlay');

    function isMobile() {
        return window.matchMedia('(max-width: 768px)').matches;
    }

    function openMobileSidebar() {
        sidebar.classList.add('mobile-open');
        sidebarOverlay.classList.add('active');
    }

    function closeMobileSidebar() {
        sidebar.classList.remove('mobile-open');
        sidebarOverlay.classList.remove('active');
    }

    mobileMenuBtn.addEventListener('click', () => {
        if (sidebar.classList.contains('mobile-open')) {
            closeMobileSidebar();
        } else {
            openMobileSidebar();
        }
    });

    sidebarOverlay.addEventListener('click', closeMobileSidebar);

    // Soft refresh: Cmd+R refresca árbol y documento activo, sin tocar terminales
    if (window.api) {
        window.api.onSoftRefresh(async () => {
            // 1. Refrescar árbol de archivos
            if (currentNodeServer) {
                await renderNodeFolder();
            } else if (currentGitHubRepo) {
                fileTreeContainer.innerHTML = '<div class="loading-state">Cargando archivos del repositorio...</div>';
                try {
                    const treeData = await GitHubAPI.getRepoTree(currentGitHubRepo.owner, currentGitHubRepo.repo);
                    if (typeof flattenTreeToPaths === 'function') flatSearchPaths = flattenTreeToPaths(treeData);
                    fileTreeContainer.innerHTML = '';
                    fileTreeContainer.appendChild(renderTreeItem(treeData, true));
                } catch (err) {
                    fileTreeContainer.innerHTML = `<div class="error-state">Error: ${err.message}</div>`;
                }
            } else if (currentLocalFolderHandle) {
                const treeData = await getTreeFromHandle(currentLocalFolderHandle, '');
                fileTreeContainer.innerHTML = '';
                fileTreeContainer.appendChild(renderTreeItem(treeData, true));
            }

            // 2. Recargar contenido del documento activo (si hay uno abierto)
            const activeTab = openTabs.find(t => t.id === activeTabId);
            if (activeTab) {
                await loadFileContent(activeTab);
                setActiveTab(activeTabId);
            }
        });
    }

    // Toggle TOC
    toggleTocBtn.addEventListener('click', () => {
        isTocOpen = !isTocOpen;
        updateTocVisibility();
    });


    // Guardar
    saveFileBtn.addEventListener('click', () => saveActiveFile());

    document.getElementById('openHtmlBtn').addEventListener('click', () => {
        const activeTab = openTabs.find(t => t.id === activeTabId);
        if (activeTab && activeTab.isHtml && activeTab.blobUrl) {
            window.open(activeTab.blobUrl, '_blank');
        }
    });

    document.getElementById('downloadHtmlBtn').addEventListener('click', () => {
        const activeTab = openTabs.find(t => t.id === activeTabId);
        if (activeTab && activeTab.isHtml && activeTab.rawContent) {
            const blob = new Blob([activeTab.rawContent], { type: 'text/html' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = activeTab.name || 'document.html';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }
    });

    document.querySelectorAll('.responsive-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const btnTarget = e.currentTarget;
            document.querySelectorAll('.responsive-btn').forEach(b => b.classList.remove('active'));
            btnTarget.classList.add('active');

            const viewType = btnTarget.dataset.view;
            const iframeContainer = document.getElementById('htmlPreviewFrame');
            if (iframeContainer) {
                iframeContainer.className = `html-preview-frame ${viewType}`;
            }
        });
    });

    // Atajos de teclado
    document.addEventListener('keydown', (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 's') {
            e.preventDefault();
            saveActiveFile();
        }
        // Undo: ⌘+Z / Ctrl+Z
        if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
            if (document.activeElement === markdownEditor) {
                e.preventDefault();
                performUndo();
            }
        }
        // Redo: ⌘+Shift+Z / Ctrl+Shift+Z
        if ((e.metaKey || e.ctrlKey) && e.key === 'z' && e.shiftKey) {
            if (document.activeElement === markdownEditor) {
                e.preventDefault();
                performRedo();
            }
        }
    });

    // Editor Input: Live preview + historial
    markdownEditor.addEventListener('input', () => {
        const activeTab = openTabs.find(t => t.id === activeTabId);
        if (!activeTab) return;

        activeTab.rawContent = markdownEditor.value;
        activeTab.dirty = (activeTab.rawContent !== activeTab.savedContent);

        const rawHtml = marked.parse(activeTab.rawContent);
        activeTab.content = DOMPurify.sanitize(rawHtml, { ADD_ATTR: ['target', 'rel'] });
        markdownContent.innerHTML = activeTab.content;

        // Actualizar split view si este tab es el partner visible
        const activeGroup = findSplitGroupFor(activeTabId);
        if (activeGroup && splitMarkdownContent) {
            const partnerId = activeGroup.left === activeTabId ? activeGroup.right : activeGroup.left;
            if (activeTab.id === partnerId) {
                splitMarkdownContent.innerHTML = activeTab.content;
            }
        }

        if (isTocOpen) generateTOC();
        renderTabs();

        // Guardar snapshot en historial (debounced 500ms)
        clearTimeout(historyTimer);
        historyTimer = setTimeout(() => {
            pushHistory(activeTabId);
            saveWorkspaceState();
        }, 500);
    });

    // --- UNDO / REDO ---

    function ensureHistory(tabId) {
        if (!tabHistory[tabId]) {
            tabHistory[tabId] = { undoStack: [], redoStack: [] };
        }
        return tabHistory[tabId];
    }

    function pushHistory(tabId) {
        const h = ensureHistory(tabId);
        const current = markdownEditor.value;
        const cursor = markdownEditor.selectionStart;
        // No guardar si es igual al último snapshot
        if (h.undoStack.length > 0 && h.undoStack[h.undoStack.length - 1].text === current) return;
        h.undoStack.push({ text: current, cursor });
        h.redoStack = []; // Limpiar redo al editar
        // Limitar a 100 snapshots
        if (h.undoStack.length > 100) h.undoStack.shift();
    }

    function initHistory(tabId, text) {
        const h = ensureHistory(tabId);
        h.undoStack = [{ text, cursor: 0 }];
        h.redoStack = [];
    }

    function performUndo() {
        if (!activeTabId) return;
        const h = ensureHistory(activeTabId);

        // Guardar estado actual en redo
        const current = markdownEditor.value;
        const cursor = markdownEditor.selectionStart;

        if (h.undoStack.length === 0) return;

        // Si el último undo es igual al actual, necesitamos el anterior
        let snapshot = h.undoStack[h.undoStack.length - 1];
        if (snapshot.text === current && h.undoStack.length > 1) {
            h.redoStack.push(h.undoStack.pop());
            snapshot = h.undoStack[h.undoStack.length - 1];
        } else if (snapshot.text === current) {
            return; // No hay más undo
        } else {
            // El estado actual no está guardado aún, guardarlo en redo
            h.redoStack.push({ text: current, cursor });
        }

        applySnapshot(snapshot);
    }

    function performRedo() {
        if (!activeTabId) return;
        const h = ensureHistory(activeTabId);
        if (h.redoStack.length === 0) return;

        // Guardar actual en undo
        pushHistory(activeTabId);

        const snapshot = h.redoStack.pop();
        applySnapshot(snapshot);
    }

    function applySnapshot(snapshot) {
        markdownEditor.value = snapshot.text;
        updateLineNumbers();
        markdownEditor.setSelectionRange(snapshot.cursor, snapshot.cursor);

        const activeTab = openTabs.find(t => t.id === activeTabId);
        if (activeTab) {
            activeTab.rawContent = snapshot.text;
            activeTab.dirty = (activeTab.rawContent !== activeTab.savedContent);
            const rawHtml = marked.parse(activeTab.rawContent);
            activeTab.content = DOMPurify.sanitize(rawHtml, { ADD_ATTR: ['target', 'rel'] });
            markdownContent.innerHTML = activeTab.content;
            if (isTocOpen) generateTOC();
            renderTabs();
            saveWorkspaceState();
        }
    }

    // ===================================
    // CARPETA LOCAL (File System Access API)
    // ===================================

    async function renderLocalFolder(dirHandle) {
        fileTreeContainer.innerHTML = '<div class="loading-state">Leyendo carpeta...</div>';
        try {
            const treeData = await getTreeFromHandle(dirHandle, '');
            if (typeof startLocalIndexing === 'function') startLocalIndexing(treeData);

            fileTreeContainer.innerHTML = '';
            const rootEl = renderTreeItem(treeData, true);
            fileTreeContainer.appendChild(rootEl);
        } catch (err) {
            fileTreeContainer.innerHTML = `<div class="error-state">Error leyendo carpeta: ${err.message}</div>`;
        }
    }

    async function getTreeFromHandle(dirHandle, pathPrefix) {
        const item = {
            name: dirHandle.name,
            path: pathPrefix + dirHandle.name,
            type: 'directory',
            children: []
        };

        for await (const entry of dirHandle.values()) {
            if (entry.name === 'node_modules') continue;

            if (entry.kind === 'directory') {
                item.children.push(await getTreeFromHandle(entry, pathPrefix + dirHandle.name + '/'));
            } else if (/\.(md|html|pdf|docx?|pptx?)$/i.test(entry.name)) {
                item.children.push({
                    name: entry.name,
                    path: pathPrefix + dirHandle.name + '/' + entry.name,
                    type: 'file',
                    handle: entry
                });
            }
        }

        item.children.sort((a, b) => {
            if (a.type === b.type) return a.name.localeCompare(b.name);
            return a.type === 'directory' ? -1 : 1;
        });

        return item;
    }

    // ===================================
    // RENDERIZADO DEL ÁRBOL
    // ===================================

    function renderTreeItem(item, isExpanded = false) {
        const itemPath = item.path || item.name;
        // Use saved expanded state if available
        if (item.type === 'directory' && expandedFolders.has(itemPath)) {
            isExpanded = true;
        }
        const itemContainer = document.createElement('div');
        itemContainer.className = 'tree-item-container';

        const itemRow = document.createElement('div');
        itemRow.className = `tree-item ${item.type}`;
        itemRow.dataset.path = item.path || item.name;

        const iconWrapper = document.createElement('span');
        iconWrapper.className = 'icon-wrapper';

        const label = document.createElement('span');
        label.className = 'item-label';
        label.title = item.path || item.name;

        // Detectar nomenclatura con corchetes al inicio: [TAG1][TAG2]Nombre
        const bracketMatch = item.name.match(/^((?:\[[^\]]*\])+)(.+)$/);
        if (bracketMatch) {
            const tags = document.createElement('span');
            tags.className = 'item-label-tags';
            tags.textContent = bracketMatch[1];
            const name = document.createElement('span');
            name.className = 'item-label-name';
            name.textContent = bracketMatch[2];
            label.appendChild(tags);
            label.appendChild(name);
        } else {
            label.textContent = item.name;
        }

        if (item.type === 'directory') {
            const chevron = document.createElement('span');
            chevron.className = 'chevron';
            chevron.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 5l7 7-7 7"/></svg>`;
            if (isExpanded) {
                chevron.classList.add('expanded');
                chevron.style.transform = 'rotate(90deg)';
            }
            iconWrapper.appendChild(chevron);

            const hasIndex = item.children && item.children.some(c => c.name === 'index.html');
            if (hasIndex) {
                const protoIcon = document.createElement('span');
                protoIcon.className = 'file-icon';
                protoIcon.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>`;
                iconWrapper.appendChild(protoIcon);
            }

            itemRow.appendChild(iconWrapper);
            itemRow.appendChild(label);

            // Botón copiar ruta de carpeta
            const rootDir = localStorage.getItem('pmos_last_folder') || '';
            const relativePath = item.path || item.name;
            const fullPath = rootDir ? (rootDir + '/' + relativePath) : relativePath;

            const actionsContainer = document.createElement('div');
            actionsContainer.style.display = 'flex';
            actionsContainer.style.alignItems = 'center';
            actionsContainer.appendChild(createCopyPathBtn(fullPath));
            if (hasIndex) {
                actionsContainer.appendChild(createServeBtn(fullPath, item.name));
            }

            itemRow.appendChild(actionsContainer);

            itemContainer.appendChild(itemRow);

            // Make directory items draggable for terminal attachment
            itemRow.draggable = true;
            itemRow.addEventListener('dragstart', (e) => {
                e.stopPropagation();
                e.dataTransfer.setData('text/plain', fullPath);
                e.dataTransfer.effectAllowed = 'copy';
            });

            const childrenContainer = document.createElement('div');
            childrenContainer.className = 'children-container';
            if (!isExpanded) childrenContainer.style.display = 'none';

            if (item.children && item.children.length > 0) {
                item.children.forEach(child => {
                    childrenContainer.appendChild(renderTreeItem(child, false));
                });
            } else {
                const emptyState = document.createElement('div');
                emptyState.className = 'tree-item empty';
                emptyState.textContent = '(vacío)';
                childrenContainer.appendChild(emptyState);
            }

            itemContainer.appendChild(childrenContainer);

            itemRow.addEventListener('click', (e) => {
                e.stopPropagation();
                const isCurrentlyExpanded = childrenContainer.style.display !== 'none';
                childrenContainer.style.display = isCurrentlyExpanded ? 'none' : 'block';
                chevron.classList.toggle('expanded');
                chevron.style.transform = isCurrentlyExpanded ? '' : 'rotate(90deg)';
                // Track expanded state
                if (isCurrentlyExpanded) {
                    expandedFolders.delete(itemPath);
                } else {
                    expandedFolders.add(itemPath);
                }
                saveWorkspaceState();
            });

        } else {

            const fileIcon = document.createElement('span');
            fileIcon.className = 'file-icon';
            const lowerName = item.name.toLowerCase();
            const fileDocBase = `<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>`;
            const fileSvgWithLabel = (label) => `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${fileDocBase}<text x="12" y="19" text-anchor="middle" font-size="7" font-weight="700" fill="currentColor" stroke="none" font-family="sans-serif">${label}</text></svg>`;
            if (lowerName.endsWith('.html')) {
                fileIcon.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>`;
            } else if (lowerName.endsWith('.pdf')) {
                fileIcon.innerHTML = fileSvgWithLabel('PDF');
            } else if (lowerName.endsWith('.doc') || lowerName.endsWith('.docx')) {
                fileIcon.innerHTML = fileSvgWithLabel('DOC');
            } else if (lowerName.endsWith('.ppt') || lowerName.endsWith('.pptx')) {
                fileIcon.innerHTML = fileSvgWithLabel('PPT');
            } else {
                fileIcon.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${fileDocBase}</svg>`;
            }
            iconWrapper.appendChild(fileIcon);

            itemRow.appendChild(iconWrapper);
            itemRow.appendChild(label);

            // Botón copiar ruta (visible en hover)
            const rootDir = localStorage.getItem('pmos_last_folder') || '';
            const relativePath = item.path || item.name;
            const fullPath = rootDir ? (rootDir + '/' + relativePath) : relativePath;
            itemRow.appendChild(createCopyPathBtn(fullPath));

            itemContainer.appendChild(itemRow);

            // Make file items draggable for terminal attachment
            itemRow.draggable = true;
            itemRow.addEventListener('dragstart', (e) => {
                const rootDir = localStorage.getItem('pmos_last_folder') || '';
                const relativePath = item.path || item.name;
                const absolutePath = rootDir ? (rootDir + '/' + relativePath) : relativePath;
                e.dataTransfer.setData('text/plain', absolutePath);
                e.dataTransfer.effectAllowed = 'copy';
            });

            itemRow.addEventListener('click', (e) => {
                e.stopPropagation();
                if (!/\.(md|html)$/i.test(item.name)) return;
                openFileTab(item);
                if (isMobile()) closeMobileSidebar();
            });
        }

        return itemContainer;
    }

    // Helper: crea un botón de copiar ruta para el sidebar
    function createCopyPathBtn(copyValue) {
        const btn = document.createElement('button');
        btn.className = 'copy-path-btn';
        btn.title = copyValue;
        btn.innerHTML = `<svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" stroke-width="2"/><path stroke-width="2" d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>`;
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            navigator.clipboard.writeText(copyValue);
            showToast('Ruta copiada', 'success');
        });
        return btn;
    }

    // Helper: crea un botón para servir una carpeta como prototipo
    function createServeBtn(folderPath, folderName) {
        const btn = document.createElement('button');
        btn.className = 'copy-path-btn'; // reutilizar estilo hover
        btn.title = 'Servir como prototipo';
        btn.innerHTML = `<svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            await openPrototypeTab(folderPath, folderName);
        });
        return btn;
    }

    // Abre un prototipo: levanta servidor estático y lo muestra en webview
    async function openPrototypeTab(folderPath, folderName) {
        if (!window.api) return;

        const tabId = `proto:${folderPath}`;
        const existing = openTabs.find(t => t.id === tabId);
        if (existing) { setActiveTab(tabId); return; }

        showToast(`Levantando servidor para ${folderName}...`, 'info', 2000);

        const result = await window.api.protoServerStart(folderPath);

        if (!result.ok) {
            showToast(`Error: ${result.error}`, 'warning', 4000);
            return;
        }

        const url = `http://localhost:${result.port}`;
        const tab = {
            id: tabId,
            name: `▶ ${folderName}`,
            path: null,
            handle: null,
            isLocal: false, isNode: false, isGitHub: false, isHtml: false,
            isCoda: true, // Reutilizar mecanismo webview
            codaId: tabId,
            codaEmbedUrl: url,
            protoFolderPath: folderPath,
            content: '', rawContent: '', savedContent: '', dirty: false
        };

        openTabs.push(tab);
        setActiveTab(tabId);
        saveWorkspaceState();
        showToast(`Prototipo servido en puerto ${result.port}`, 'success');
    }

    // ===================================
    // MANEJO DE PESTAÑAS (TABS)
    // ===================================

    async function openFileTab(item) {
        const fileId = item.path || item.name;
        let existingTab = openTabs.find(tab => tab.id === fileId);

        if (!existingTab) {
            existingTab = {
                id: fileId,
                name: item.name,
                path: item.path,
                handle: item.handle,
                isLocal: !!item.handle,
                isNode: currentNodeServer,
                isGitHub: !!currentGitHubRepo && !item.handle,
                isHtml: item.name.endsWith('.html'),
                githubMeta: currentGitHubRepo ? { ...currentGitHubRepo, sha: item.sha } : null,
                content: null,
                rawContent: null,
                savedContent: null,
                dirty: false
            };
            openTabs.push(existingTab);
            renderTabs();
            await loadFileContent(existingTab);
        }

        setActiveTab(fileId);
    }

    let draggedTabId = null;

    function renderTabs() {
        tabsContainer.innerHTML = '';
        openTabs.forEach((tabData, index) => {
            const tabEl = document.createElement('div');
            const isActive = tabData.id === activeTabId;
            const tabSplitGroup = findSplitGroupFor(tabData.id);
            const isInSplit = !!tabSplitGroup;
            const isSplitLeft = tabSplitGroup && tabData.id === tabSplitGroup.left;
            const isSplitRight = tabSplitGroup && tabData.id === tabSplitGroup.right;
            const isGroupActive = tabSplitGroup &&
                (tabSplitGroup.left === activeTabId || tabSplitGroup.right === activeTabId);
            tabEl.className = `tab${isActive || isGroupActive ? ' active' : ''}${isInSplit ? ' in-split-group' : ''}${isSplitLeft ? ' split-left' : ''}${isSplitRight ? ' split-right' : ''}`;
            tabEl.style.display = 'flex';
            tabEl.draggable = true;
            tabEl.dataset.tabIndex = index;

            const dirtyDot = (!tabData.isCoda && tabData.dirty) ? '<span class="dirty-dot">●</span>' : '';
            let iconHtml;
            if (tabData.protoFolderPath) {
                iconHtml = `<svg class="coda-tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
            } else if (tabData.isCoda) {
                iconHtml = `<svg class="coda-tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 9h6M9 12h6M9 15h4"/></svg>`;
            } else if (tabData.isHtml) {
                iconHtml = `<span class="file-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg></span>`;
            } else {
                iconHtml = `<span class="file-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></span>`;
            }
            tabEl.innerHTML = `
                ${iconHtml}
                <span class="filename" title="${tabData.path || tabData.name}">${tabData.name}</span>${dirtyDot}
                <button class="close-tab">×</button>
            `;

            tabEl.addEventListener('click', (e) => {
                if (e.target.classList.contains('close-tab')) return;
                setActiveTab(tabData.id);
            });

            tabEl.querySelector('.close-tab').addEventListener('click', (e) => {
                e.stopPropagation();
                closeTab(tabData.id);
            });

            // Drag reorder + drag path to terminal
            tabEl.addEventListener('dragstart', (e) => {
                draggedTabId = tabData.id;
                tabEl.classList.add('tab-dragging');
                e.dataTransfer.effectAllowed = 'copyMove';
                e.dataTransfer.setData('text/x-tab-reorder', tabData.id);

                // Ruta absoluta para arrastrar al terminal
                if (tabData.path) {
                    const rootDir = localStorage.getItem('pmos_last_folder') || '';
                    const absolutePath = rootDir ? (rootDir + '/' + tabData.path) : tabData.path;
                    e.dataTransfer.setData('text/plain', absolutePath);
                }
            });

            tabEl.addEventListener('dragend', () => {
                draggedTabId = null;
                tabEl.classList.remove('tab-dragging');
                document.querySelectorAll('.tab').forEach(t => t.classList.remove('tab-drag-over'));
            });

            tabEl.addEventListener('dragover', (e) => {
                if (!draggedTabId) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                tabEl.classList.add('tab-drag-over');
            });

            tabEl.addEventListener('dragleave', () => {
                tabEl.classList.remove('tab-drag-over');
            });

            tabEl.addEventListener('drop', (e) => {
                e.preventDefault();
                tabEl.classList.remove('tab-drag-over');
                if (!draggedTabId || draggedTabId === tabData.id) return;

                const fromIndex = openTabs.findIndex(t => t.id === draggedTabId);
                const toIndex = openTabs.findIndex(t => t.id === tabData.id);
                if (fromIndex === -1 || toIndex === -1) return;

                const [moved] = openTabs.splice(fromIndex, 1);
                openTabs.splice(toIndex, 0, moved);
                renderTabs();
                saveWorkspaceState();
            });

            // Context menu (clic derecho)
            tabEl.addEventListener('contextmenu', (e) => showTabContextMenu(e, tabData));

            tabsContainer.appendChild(tabEl);
        });

        updateSaveButtonState();
    }

    function updateSaveButtonState() {
        const activeTab = openTabs.find(t => t.id === activeTabId);
        if (activeTab && activeTab.dirty) {
            saveFileBtn.classList.add('btn-dirty');
            saveFileBtn.title = 'Hay cambios sin guardar (⌘+S)';
        } else {
            saveFileBtn.classList.remove('btn-dirty');
            saveFileBtn.title = 'Guardar (⌘+S)';
        }
    }

    function setActiveTab(fileId) {
        activeTabId = fileId;
        renderTabs();
        saveWorkspaceState();


        document.querySelectorAll('.tree-item').forEach(el => el.classList.remove('active'));
        if (fileId) {
            const activeTreeItem = document.querySelector(`.tree-item[data-path="${fileId}"]`);
            if (activeTreeItem) activeTreeItem.classList.add('active');
        }

        // Bidirectional tab link: if a terminal is linked to this document, switch to it too
        if (fileId && window.terminalCtrl && typeof window.terminalCtrl.activateTerminalForFile === 'function') {
            window.terminalCtrl.activateTerminalForFile(fileId);
        }

        const activeTab = openTabs.find(t => t.id === fileId);

        const previewPanel = document.getElementById('previewPanel');
        const editorPanel  = document.getElementById('editorPanel');
        const codaPanel    = document.getElementById('codaPanel');

        // Handle Coda tabs: show webview panel full-screen, hide everything else
        if (activeTab && activeTab.isCoda) {
            editorToolbar.style.display = 'none';
            if (previewPanel) previewPanel.style.display = 'none';
            if (editorPanel)  editorPanel.style.display  = 'none';
            if (codaPanel) {
                codaPanel.style.display = 'flex';
                codaPanel.style.flex = '1';
                codaPanel.style.width = '100%';
                codaPanel.style.height = '100%';
            }
            if (window._showCodaPanel) window._showCodaPanel(activeTab.codaEmbedUrl);
            return;
        } else {
            // Hide Coda panel and restore normal panels
            if (codaPanel) codaPanel.style.display = 'none';
            // Restore previewPanel (may have been hidden for Coda)
            if (previewPanel) previewPanel.style.display = 'flex';
        }

        if (activeTab) {
            editorToolbar.style.display = 'flex';
            const previewPanel = document.getElementById('previewPanel');

            // Lógica de botones de la Toolbar
            if (activeTab.isHtml) {
                document.getElementById('toggleSplitBtn').style.display = 'none';
                saveFileBtn.style.display = 'none';
                document.getElementById('openHtmlBtn').style.display = 'flex';
                document.getElementById('downloadHtmlBtn').style.display = 'flex';
                document.getElementById('htmlResponsiveToolbar').style.display = 'flex';

                previewPanel.style.padding = '0';
                markdownContent.style.maxWidth = 'none';
                markdownContent.style.height = '100%';
                markdownContent.style.flex = '1';
                markdownContent.style.display = 'flex';
                markdownContent.style.flexDirection = 'column';

                // Si el editor estaba abierto, lo cerramos forzosamente
                if (isEditorOpen) {
                    isEditorOpen = false;
                    updateEditorVisibility();
                }
            } else {
                document.getElementById('toggleSplitBtn').style.display = 'flex';
                saveFileBtn.style.display = 'flex';
                document.getElementById('openHtmlBtn').style.display = 'none';
                document.getElementById('downloadHtmlBtn').style.display = 'none';
                document.getElementById('htmlResponsiveToolbar').style.display = 'none';

                previewPanel.style.padding = '40px';
                markdownContent.style.maxWidth = '';
                markdownContent.style.height = '';
                markdownContent.style.flex = '';
                markdownContent.style.display = '';
                markdownContent.style.flexDirection = '';
            }

            if (activeTab.content) {
                markdownContent.innerHTML = activeTab.content;
                if (isTocOpen) generateTOC();
            } else {
                markdownContent.innerHTML = '<div class="loading-state">Cargando...</div>';
            }
            markdownEditor.value = activeTab.rawContent !== null ? activeTab.rawContent : '';
            updateLineNumbers();
            // Ensure undo history is initialized for this tab
            const h = tabHistory[fileId];
            if (!h || h.undoStack.length === 0) {
                initHistory(fileId, markdownEditor.value);
            }

            // Split view: mostrar u ocultar según el tab activo pertenezca al grupo
            const group = findSplitGroupFor(fileId);
            if (group) {
                showSplitForTab(fileId);
            } else {
                hideSplitPanels();
            }
        } else {
            editorToolbar.style.display = 'none';
            isEditorOpen = false;
            updateEditorVisibility();
            if (codaPanel) codaPanel.style.display = 'none';
            if (previewPanel) previewPanel.style.display = 'flex';
            markdownContent.innerHTML = `
                <div class="welcome-screen">
                    <h1 style="display: flex; align-items: center; gap: 10px;"><img src="/favicon.png" alt="" width="28" height="28" style="border-radius: 5px;"> CompassAI</h1>
                    <p>Selecciona un archivo <code>.md</code> del panel izquierdo para comenzar.</p>
                </div>
            `;
            markdownEditor.value = '';

            // Clear TOC
            const tocList = document.getElementById('tocList');
            if (tocList) {
                tocList.innerHTML = '<p class="toc-empty">Abre un archivo para ver su estructura.</p>';
            }

        }
    }

    function closeTab(fileId) {
        const tab = openTabs.find(t => t.id === fileId);
        if (tab && tab.dirty) {
            if (!confirm(`El archivo "${tab.name}" tiene cambios sin guardar. ¿Cerrar de todos modos?`)) return;
        }

        // Parar servidor de prototipo si lo tiene
        if (tab && tab.protoFolderPath && window.api) {
            window.api.protoServerStop(tab.protoFolderPath);
        }

        // Si el tab está en un split group, deshacer ese split
        const closingGroup = findSplitGroupFor(fileId);
        if (closingGroup) {
            removeSplitGroup(closingGroup);
        }

        const index = openTabs.findIndex(t => t.id === fileId);
        if (index !== -1) {
            openTabs.splice(index, 1);
            if (activeTabId === fileId) {
                if (openTabs.length > 0) {
                    setActiveTab(openTabs[Math.max(0, index - 1)].id);
                } else {
                    setActiveTab(null);
                }
            } else {
                renderTabs();
                saveWorkspaceState();
            }
        }
    }

    // ===================================
    // SPLIT VIEW (vista dividida tipo Chrome)
    // ===================================
    // splitGroups = [{ left, right }, ...] — pares de tabs emparejados
    // Al activar un tab de un par, se muestra el split. Al activar otro tab, vista completa.

    const splitPanel = document.getElementById('splitPanel');
    const splitDivider = document.getElementById('splitDivider');
    const splitMarkdownContent = document.getElementById('splitMarkdownContent');
    const splitPanelClose = document.getElementById('splitPanelClose');

    function createSplitGroup(leftTabId, rightTabId) {
        // Si alguno de los dos ya está en un split, quitar ese split primero
        const existingLeft = findSplitGroupFor(leftTabId);
        if (existingLeft) removeSplitGroup(existingLeft);
        const existingRight = findSplitGroupFor(rightTabId);
        if (existingRight) removeSplitGroup(existingRight);

        // Mover las pestañas para que estén juntas en openTabs
        const leftIdx = openTabs.findIndex(t => t.id === leftTabId);
        const rightIdx = openTabs.findIndex(t => t.id === rightTabId);
        if (leftIdx !== -1 && rightIdx !== -1 && Math.abs(leftIdx - rightIdx) !== 1) {
            const [rightTab] = openTabs.splice(openTabs.findIndex(t => t.id === rightTabId), 1);
            const newLeftIdx = openTabs.findIndex(t => t.id === leftTabId);
            openTabs.splice(newLeftIdx + 1, 0, rightTab);
        }

        splitGroups.push({ left: leftTabId, right: rightTabId });
        splitFlexPct = 50;
        setActiveTab(leftTabId);
    }

    function removeSplitGroup(group) {
        splitGroups = splitGroups.filter(g => g !== group);
        hideSplitPanels();
        renderTabs();
    }

    function closeSplitView() {
        // Cierra el split del tab activo
        const group = findSplitGroupFor(activeTabId);
        if (group) removeSplitGroup(group);
    }

    function hideSplitPanels() {
        splitDivider.style.display = 'none';
        splitPanel.style.display = 'none';
        splitMarkdownContent.innerHTML = '';
        const previewPanel = document.getElementById('previewPanel');
        previewPanel.style.flex = '1';
    }

    // Muestra el split con el contenido del tab compañero
    function showSplitForTab(activeId) {
        const splitGroup = findSplitGroupFor(activeId);
        if (!splitGroup) return;

        const partnerId = splitGroup.left === activeId ? splitGroup.right : splitGroup.left;
        const partnerTab = openTabs.find(t => t.id === partnerId);
        if (!partnerTab) {
            closeSplitView();
            return;
        }


        if (partnerTab.content) {
            splitMarkdownContent.innerHTML = partnerTab.content;
        } else {
            splitMarkdownContent.innerHTML = '<div class="loading-state">Cargando...</div>';
            loadSplitContent(partnerTab);
        }

        const previewPanel = document.getElementById('previewPanel');
        previewPanel.style.flex = `0 0 ${splitFlexPct}%`;
        splitPanel.style.flex = `0 0 ${100 - splitFlexPct}%`;

        splitDivider.style.display = 'block';
        splitPanel.style.display = 'flex';
    }

    async function loadSplitContent(tabData) {
        try {
            let markdownText = '';
            if (tabData.isLocal && tabData.handle) {
                const file = await tabData.handle.getFile();
                markdownText = await file.text();
            } else if (tabData.isNode) {
                const res = await fetch(`/api/file?path=${encodeURIComponent(tabData.path)}`);
                if (!res.ok) throw new Error('Error al leer el archivo');
                markdownText = await res.text();
            } else if (tabData.isGitHub) {
                const data = await GitHubAPI.getFileContent(
                    tabData.githubMeta.owner, tabData.githubMeta.repo, tabData.path
                );
                markdownText = data.content;
            }

            if (tabData.isHtml) {
                const blob = new Blob([markdownText], { type: 'text/html' });
                const url = URL.createObjectURL(blob);
                tabData.content = `<div class="html-preview-wrapper"><div class="html-preview-frame desktop"><iframe src="${url}" sandbox="allow-scripts allow-same-origin" style="width:100%; height:100%; border:none; background:white; display:block;"></iframe></div></div>`;
            } else {
                tabData.rawContent = markdownText;
                tabData.savedContent = markdownText;
                tabData.content = typeof marked !== 'undefined'
                    ? DOMPurify.sanitize(marked.parse(markdownText))
                    : markdownText;
            }

            // Actualizar si sigue siendo el partner visible
            const loadGroup = findSplitGroupFor(activeTabId);
            if (loadGroup) {
                const partnerId = loadGroup.left === activeTabId ? loadGroup.right : loadGroup.left;
                if (tabData.id === partnerId) {
                    splitMarkdownContent.innerHTML = tabData.content;
                }
            }
        } catch (err) {
            const errGroup = findSplitGroupFor(activeTabId);
            if (errGroup) {
                const partnerId = errGroup.left === activeTabId ? errGroup.right : errGroup.left;
                if (tabData.id === partnerId) {
                    splitMarkdownContent.innerHTML = `<div class="error-state">Error: ${err.message}</div>`;
                }
            }
        }
    }

    splitPanelClose.addEventListener('click', closeSplitView);

    // --- Split divider drag resize ---
    splitDivider.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const container = splitDivider.parentElement;
        const previewPanel = document.getElementById('previewPanel');
        const containerRect = container.getBoundingClientRect();

        const previewRect = previewPanel.getBoundingClientRect();
        const offsetLeft = previewRect.left - containerRect.left;
        const availableWidth = containerRect.width - offsetLeft;

        splitDivider.classList.add('dragging');
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        _blockWebviews();

        function onMouseMove(ev) {
            const x = ev.clientX - previewRect.left;
            const minPx = 150;
            const clamped = Math.max(minPx, Math.min(x, availableWidth - minPx));
            const pct = (clamped / availableWidth) * 100;

            previewPanel.style.flex = `0 0 ${pct}%`;
            splitPanel.style.flex = `0 0 ${100 - pct}%`;
            splitFlexPct = pct;
        }

        function onMouseUp() {
            splitDivider.classList.remove('dragging');
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            _unblockWebviews();
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        }

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });

    document.addEventListener('contextmenu', (e) => {
        if (!e.target.closest('.tab')) removeContextMenu();
    });

    function showTabContextMenu(e, tabData) {
        e.preventDefault();
        removeContextMenu();

        const menu = document.createElement('div');
        menu.className = 'tab-context-menu';

        const isActive = tabData.id === activeTabId;
        const isInSplit = !!findSplitGroupFor(tabData.id);
        const svgSplit = `<svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 3h6v18H9zM3 3h6v18H3z"/>
        </svg>`;

        if (isInSplit) {
            // Tab está en un split → ofrecer deshacer
            const unsplitItem = document.createElement('div');
            unsplitItem.className = 'tab-context-menu-item';
            unsplitItem.innerHTML = `${svgSplit} Deshacer vista dividida`;
            unsplitItem.addEventListener('click', () => {
                removeContextMenu();
                const group = findSplitGroupFor(tabData.id);
                if (group) removeSplitGroup(group);
            });
            menu.appendChild(unsplitItem);
        } else if (isActive && openTabs.length > 1) {
            // Tab activo, no en split → submenu con lista de tabs para emparejar
            const splitHeader = document.createElement('div');
            splitHeader.className = 'tab-context-menu-item';
            splitHeader.style.opacity = '0.5';
            splitHeader.style.cursor = 'default';
            splitHeader.style.fontSize = '0.7rem';
            splitHeader.innerHTML = `${svgSplit} Vista dividida con:`;
            menu.appendChild(splitHeader);

            openTabs.filter(t => t.id !== tabData.id).forEach(otherTab => {
                const pickItem = document.createElement('div');
                pickItem.className = 'tab-context-menu-item';
                pickItem.style.paddingLeft = '28px';
                pickItem.textContent = otherTab.name;
                pickItem.addEventListener('click', () => {
                    removeContextMenu();
                    createSplitGroup(tabData.id, otherTab.id);
                });
                menu.appendChild(pickItem);
            });
        } else if (!isActive) {
            // Tab no activo → ofrecer split directo con la pestaña activa
            const activeTab = openTabs.find(t => t.id === activeTabId);
            if (activeTab) {
                const splitItem = document.createElement('div');
                splitItem.className = 'tab-context-menu-item';
                splitItem.innerHTML = `${svgSplit} Vista dividida con "${activeTab.name}"`;
                splitItem.addEventListener('click', () => {
                    removeContextMenu();
                    createSplitGroup(activeTabId, tabData.id);
                });
                menu.appendChild(splitItem);
            }
        }

        // Copiar URL para prototipos
        if (tabData.protoFolderPath && tabData.codaEmbedUrl) {
            const copyUrlItem = document.createElement('div');
            copyUrlItem.className = 'tab-context-menu-item';
            copyUrlItem.innerHTML = `
                <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" stroke-width="2"/>
                    <path stroke-width="2" d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
                </svg>
                Copiar URL (${tabData.codaEmbedUrl})
            `;
            copyUrlItem.addEventListener('click', () => {
                removeContextMenu();
                navigator.clipboard.writeText(tabData.codaEmbedUrl);
                showToast('URL copiada al portapapeles', 'success');
            });
            menu.appendChild(copyUrlItem);
        }

        // Separador
        if (menu.children.length > 0) {
            const sep = document.createElement('div');
            sep.style.cssText = 'height: 1px; background: var(--border-color); margin: 4px 0;';
            menu.appendChild(sep);
        }

        // Cerrar pestaña
        const closeItem = document.createElement('div');
        closeItem.className = 'tab-context-menu-item';
        closeItem.innerHTML = `
            <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
            Cerrar pestaña
        `;
        closeItem.addEventListener('click', () => {
            removeContextMenu();
            closeTab(tabData.id);
        });
        menu.appendChild(closeItem);

        // Cerrar otras pestañas
        if (openTabs.length > 1) {
            const closeOthersItem = document.createElement('div');
            closeOthersItem.className = 'tab-context-menu-item';
            closeOthersItem.innerHTML = `
                <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
                </svg>
                Cerrar otras pestañas
            `;
            closeOthersItem.addEventListener('click', () => {
                removeContextMenu();
                const others = openTabs.filter(t => t.id !== tabData.id).map(t => t.id);
                others.forEach(id => closeTab(id));
            });
            menu.appendChild(closeOthersItem);
        }

        // Posicionar menú
        menu.style.left = e.clientX + 'px';
        menu.style.top = e.clientY + 'px';
        document.body.appendChild(menu);

        // Ajustar si se sale de pantalla
        const rect = menu.getBoundingClientRect();
        if (rect.right > window.innerWidth) menu.style.left = (window.innerWidth - rect.width - 8) + 'px';
        if (rect.bottom > window.innerHeight) menu.style.top = (window.innerHeight - rect.height - 8) + 'px';

        activeContextMenu = menu;
    }

    // ===================================
    // CARGA DE ARCHIVOS
    // ===================================

    async function loadFileContent(tabData) {
        try {
            if (tabData.id === activeTabId) {
                markdownContent.innerHTML = '<div class="loading-state">Leyendo archivo...</div>';
            }

            let markdownText = '';

            if (tabData.isLocal && tabData.handle) {
                // File System Access API
                const file = await tabData.handle.getFile();
                markdownText = await file.text();
            } else if (tabData.isNode) {
                // Node.js Backend API
                const res = await fetch(`/api/file?path=${encodeURIComponent(tabData.path)}`);
                if (!res.ok) throw new Error('Error al leer el archivo desde el servidor');
                markdownText = await res.text();
            } else if (tabData.isGitHub) {
                // GitHub API
                const data = await GitHubAPI.getFileContent(
                    tabData.githubMeta.owner,
                    tabData.githubMeta.repo,
                    tabData.path
                );
                markdownText = data.content;
                tabData.githubMeta.sha = data.sha; // Actualizar SHA para futuras escrituras
            }

            tabData.rawContent = markdownText;
            tabData.savedContent = markdownText;

            if (tabData.isHtml) {
                const blob = new Blob([markdownText], { type: 'text/html' });
                const url = URL.createObjectURL(blob);
                tabData.content = `
                    <div class="html-preview-wrapper">
                        <div id="htmlPreviewFrame" class="html-preview-frame desktop">
                            <iframe src="${url}" sandbox="allow-scripts allow-same-origin" style="width:100%; height:100%; border:none; background:white; display:block;"></iframe>
                        </div>
                    </div>
                `;
                tabData.blobUrl = url; // Guarda la url para descarga/nueva pestaña
            } else {
                const rawHtml = marked.parse(markdownText);
                tabData.content = DOMPurify.sanitize(rawHtml, { ADD_ATTR: ['target', 'rel'] });
            }

            if (tabData.id === activeTabId) {
                markdownContent.innerHTML = tabData.content;
                markdownEditor.value = tabData.rawContent;
                updateLineNumbers();
                initHistory(tabData.id, tabData.rawContent);
                if (isTocOpen) generateTOC();
            }
            // Actualizar split view si este tab es el partner visible
            const openGroup = findSplitGroupFor(activeTabId);
            if (openGroup && splitMarkdownContent) {
                const partnerId = openGroup.left === activeTabId ? openGroup.right : openGroup.left;
                if (tabData.id === partnerId) {
                    splitMarkdownContent.innerHTML = tabData.content;
                }
            }

        } catch (error) {
            console.error('Error opening file:', error);
            tabData.content = `<div class="error-state"><h3>Error al cargar</h3><p>${error.message}</p></div>`;
            tabData.rawContent = '';
            if (tabData.id === activeTabId) {
                markdownContent.innerHTML = tabData.content;
            }
            const errGroup2 = findSplitGroupFor(activeTabId);
            if (errGroup2 && splitMarkdownContent) {
                const partnerId = errGroup2.left === activeTabId ? errGroup2.right : errGroup2.left;
                if (tabData.id === partnerId) {
                    splitMarkdownContent.innerHTML = tabData.content;
                }
            }
        }
    }

    // ===================================
    // TOAST NOTIFICATIONS
    // ===================================

    let toastContainer = document.getElementById('toastContainer');
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'toastContainer';
        toastContainer.className = 'toast-container';
        document.body.appendChild(toastContainer);
    }

    function showToast(message, type = 'info', duration = 3500) {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = message;
        toastContainer.appendChild(toast);

        // Trigger animation
        requestAnimationFrame(() => toast.classList.add('show'));

        setTimeout(() => {
            toast.classList.remove('show');
            toast.addEventListener('transitionend', () => toast.remove());
        }, duration);
    }

    // ===================================
    // FILE WATCHER (Polling para cambios externos)
    // ===================================

    let lastTreeHash = null;

    // Helper para generar un "hash" rápido de los archivos que vemos
    function hashTreeData(data) {
        return JSON.stringify(data, (key, val) => key === 'children' ? val : val);
    }

    setInterval(async () => {
        // 1. Revisar si hay un árbol cargado para sondear cambios estructurales (archivos nuevos/eliminados)
        try {
            if (currentLocalFolderHandle) {
                // Generar vista en crudo de todo el directorio
                const newTreeData = await getTreeFromHandle(currentLocalFolderHandle, '');
                const currentHash = hashTreeData(newTreeData);

                if (lastTreeHash !== null && lastTreeHash !== currentHash) {
                    lastTreeHash = currentHash;
                    // Solo recargar si cambia:
                    fileTreeContainer.innerHTML = '';
                    const rootEl = renderTreeItem(newTreeData, true);
                    fileTreeContainer.appendChild(rootEl);
                } else {
                    lastTreeHash = currentHash;
                }
            } else if (currentNodeServer) {
                const res = await fetch('/api/tree').catch(() => null);
                if (res && res.ok) {
                    const newTreeData = await res.json();
                    const currentHash = hashTreeData(newTreeData);
                    if (lastTreeHash !== null && lastTreeHash !== currentHash) {
                        lastTreeHash = currentHash;
                        fileTreeContainer.innerHTML = '';
                        const rootEl = renderTreeItem(newTreeData, true);
                        fileTreeContainer.appendChild(rootEl);
                    } else {
                        lastTreeHash = currentHash;
                    }
                }
            } else if (currentGitHubRepo) {
                // Pedir el commit SHAs tree de github
                const newTreeData = await GitHubAPI.getRepoTree(currentGitHubRepo.owner, currentGitHubRepo.repo);
                const currentHash = hashTreeData(newTreeData);

                if (lastTreeHash !== null && lastTreeHash !== currentHash) {
                    lastTreeHash = currentHash;
                    fileTreeContainer.innerHTML = '';
                    const rootEl = renderTreeItem(newTreeData, true);
                    fileTreeContainer.appendChild(rootEl);
                } else {
                    lastTreeHash = currentHash;
                }
            }
        } catch (e) { /* ignore tree polling errors */ }

        // 2. Revisar archivos abiertos modificados externamente
        for (const tab of openTabs) {
            try {
                let newContent = null;

                if (tab.isLocal && tab.handle) {
                    const file = await tab.handle.getFile();
                    const diskContent = await file.text();
                    if (diskContent === tab.savedContent) continue;
                    newContent = diskContent;

                } else if (tab.isNode) {
                    const res = await fetch(`/api/file?path=${encodeURIComponent(tab.path)}`).catch(() => null);
                    if (res && res.ok) {
                        const diskContent = await res.text();
                        if (diskContent === tab.savedContent) continue;
                        newContent = diskContent;
                    } else {
                        continue;
                    }

                } else if (tab.isGitHub && tab.githubMeta) {
                    const data = await GitHubAPI.getFileContent(
                        tab.githubMeta.owner,
                        tab.githubMeta.repo,
                        tab.path
                    );
                    if (data.sha === tab.githubMeta.sha) continue;
                    newContent = data.content;
                    tab.githubMeta.sha = data.sha;

                } else {
                    continue;
                }

                // El archivo cambió externamente
                if (tab.dirty) {
                    showToast(`⚠️ <strong>${tab.name}</strong> modificado externamente (tienes cambios sin guardar)`, 'warning', 5000);
                    continue;
                }

                // Actualizar silenciosamente
                tab.rawContent = newContent;
                tab.savedContent = newContent;
                const rawHtml = marked.parse(newContent);
                tab.content = DOMPurify.sanitize(rawHtml, { ADD_ATTR: ['target', 'rel'] });

                if (tab.id === activeTabId) {
                    markdownContent.innerHTML = tab.content;
                    markdownEditor.value = tab.rawContent;
                    updateLineNumbers();
                    initHistory(tab.id, tab.rawContent);
                    if (isTocOpen) generateTOC();
                }

                renderTabs();
                saveWorkspaceState();
                showToast(`🔄 <strong>${tab.name}</strong> actualizado`, 'success');
            } catch (e) {
                // Ignorar errores de lectura
            }
        }
    }, 5000);

    // ===================================
    // CREATION
    // ===================================

    // ===================================
    // GUARDADO
    // ===================================

    async function saveActiveFile() {
        const activeTab = openTabs.find(t => t.id === activeTabId);
        if (!activeTab) return;

        const originalText = saveFileBtn.innerHTML;

        try {
            if (activeTab.isLocal && activeTab.handle) {
                // File System Access API
                const writable = await activeTab.handle.createWritable();
                await writable.write(activeTab.rawContent);
                await writable.close();
            } else if (activeTab.isNode) {
                // Node API
                const res = await fetch('/api/file', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ path: activeTab.path, content: activeTab.rawContent })
                });
                if (!res.ok) throw new Error('Error al guardar en el servidor local');
            } else if (activeTab.isGitHub) {
                // GitHub API — crea un commit
                const result = await GitHubAPI.saveFile(
                    activeTab.githubMeta.owner,
                    activeTab.githubMeta.repo,
                    activeTab.path,
                    activeTab.rawContent,
                    activeTab.githubMeta.sha
                );
                activeTab.githubMeta.sha = result.content.sha; // Actualizar SHA
            }

            activeTab.dirty = false;
            activeTab.savedContent = activeTab.rawContent;
            renderTabs();
            saveWorkspaceState();

            saveFileBtn.innerHTML = `
                <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="margin-right: 4px;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
                ¡Guardado!
            `;
            saveFileBtn.style.backgroundColor = '#2da44e';
            saveFileBtn.style.color = '#ffffff';
            setTimeout(() => {
                saveFileBtn.innerHTML = originalText;
                saveFileBtn.style.backgroundColor = 'var(--bg-selection)';
                saveFileBtn.style.color = 'white';
            }, 1500);

        } catch (error) {
            console.error('Error saving file:', error);
            alert(`Error al guardar: ${error.message}`);
        }
    }

    // ===================================
    // VISIBILIDAD DEL EDITOR
    // ===================================

    const editorResizer = document.getElementById('editorResizer');

    function updateEditorVisibility() {
        // If a Coda tab is active, the editor must stay hidden regardless of the toggle
        const activeTabId = document.querySelector('.tab.active')?.dataset.id;
        const activeTab = activeTabId ? openTabs.find(t => t.id === activeTabId) : null;
        if (activeTab && activeTab.isCoda) {
            editorPanel.style.display = 'none';
            editorResizer.style.display = 'none';
            return;
        }

        if (isEditorOpen) {
            editorPanel.style.display = 'flex';
            editorResizer.style.display = 'block';
            // Recalculate line numbers after the panel is visible so dimensions are correct
            requestAnimationFrame(() => updateLineNumbers());
            toggleSplitBtn.innerHTML = `
                <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="margin-right: 4px;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path></svg>
                Vista Previa
            `;
        } else {
            editorPanel.style.display = 'none';
            editorResizer.style.display = 'none';
            toggleSplitBtn.innerHTML = `
                <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="margin-right: 4px;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
                Editar
            `;
        }
    }

    // ===================================
    // VISIBILIDAD DEL TOC
    // ===================================

    const tocResizer = document.getElementById('tocResizer');

    function updateTocVisibility() {
        // Hide TOC for Coda tabs
        const activeTabId = document.querySelector('.tab.active')?.dataset.id;
        const activeTab = activeTabId ? openTabs.find(t => t.id === activeTabId) : null;
        if (activeTab && activeTab.isCoda) {
            tocPanel.style.display = 'none';
            tocResizer.style.display = 'none';
            return;
        }

        if (isTocOpen) {
            tocPanel.style.display = 'flex';
            tocResizer.style.display = 'block';
            toggleTocBtn.classList.add('active');
            toggleTocBtn.style.backgroundColor = 'var(--bg-hover)';
            generateTOC();
        } else {
            tocPanel.style.display = 'none';
            tocResizer.style.display = 'none';
            toggleTocBtn.classList.remove('active');
            toggleTocBtn.style.backgroundColor = '';
        }
    }

    // TOC resizer drag
    tocResizer.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const startX = e.clientX;
        const startWidth = tocPanel.offsetWidth;

        tocResizer.classList.add('dragging');
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        _blockWebviews();

        function onMouseMove(ev) {
            const delta = startX - ev.clientX;
            const newWidth = Math.max(120, startWidth + delta);
            tocPanel.style.width = newWidth + 'px';
        }

        function onMouseUp() {
            tocResizer.classList.remove('dragging');
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            _unblockWebviews();
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        }

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });

    // Editor / Preview resizer drag
    editorResizer.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const container = editorPanel.parentElement;
        const startX = e.clientX;
        const startWidth = editorPanel.offsetWidth;
        const containerWidth = container.offsetWidth;

        editorResizer.classList.add('dragging');
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        _blockWebviews();

        function onMouseMove(ev) {
            const delta = ev.clientX - startX;
            const newWidth = Math.max(200, Math.min(containerWidth - 200, startWidth + delta));
            editorPanel.style.width = newWidth + 'px';
            updateLineNumbers();
        }

        function onMouseUp() {
            editorResizer.classList.remove('dragging');
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            _unblockWebviews();
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        }

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });

    // ===================================
    // GENERACIÓN DE TOC
    // ===================================

    function generateTOC() {
        const headings = markdownContent.querySelectorAll('h1, h2, h3, h4, h5, h6');
        tocList.innerHTML = '';

        if (headings.length === 0) {
            tocList.innerHTML = '<p class="toc-empty">Sin encabezados en este documento.</p>';
            return;
        }

        headings.forEach((heading, index) => {
            if (!heading.id) {
                heading.id = 'heading-' + index + '-' + heading.textContent.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
            }

            const level = parseInt(heading.tagName.charAt(1));
            const tocItem = document.createElement('a');
            tocItem.className = 'toc-item';
            tocItem.dataset.level = level;
            tocItem.textContent = heading.textContent;
            tocItem.title = heading.textContent;

            tocItem.addEventListener('click', () => {
                heading.scrollIntoView({ behavior: 'smooth', block: 'start' });
                if (isEditorOpen) scrollEditorToHeading(heading.textContent, level);
                tocList.querySelectorAll('.toc-item').forEach(el => el.classList.remove('active'));
                tocItem.classList.add('active');
            });

            tocList.appendChild(tocItem);
        });

        setupScrollSpy(headings);
    }

    function setupScrollSpy(headings) {
        if (previewPanel._scrollSpyHandler) {
            previewPanel.removeEventListener('scroll', previewPanel._scrollSpyHandler);
        }

        const handler = () => {
            const scrollTop = previewPanel.scrollTop;
            const offset = 100;
            let activeHeading = null;

            headings.forEach(heading => {
                if (heading.offsetTop - offset <= scrollTop) activeHeading = heading;
            });

            if (activeHeading) {
                tocList.querySelectorAll('.toc-item').forEach(item => item.classList.remove('active'));
                tocList.querySelectorAll('.toc-item').forEach(item => {
                    if (item.textContent === activeHeading.textContent) item.classList.add('active');
                });
            }
        };

        previewPanel._scrollSpyHandler = handler;
        previewPanel.addEventListener('scroll', handler);
    }

    // ===================================
    // SCROLL SINCRONIZADO DEL EDITOR
    // ===================================

    function scrollEditorToHeading(headingText, level) {
        const rawContent = markdownEditor.value;
        const lines = rawContent.split('\n');
        const hashes = '#'.repeat(level);
        let targetLineIndex = -1;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line.startsWith(hashes + ' ')) {
                const lineText = line.replace(/^#+\s+/, '').replace(/\*\*/g, '').trim();
                if (lineText === headingText.trim()) {
                    targetLineIndex = i;
                    break;
                }
            }
        }

        if (targetLineIndex === -1) return;

        const mirror = document.createElement('div');
        const cs = getComputedStyle(markdownEditor);
        mirror.style.cssText = `
            position: absolute; visibility: hidden; overflow: hidden;
            width: ${markdownEditor.clientWidth}px;
            font-family: ${cs.fontFamily}; font-size: ${cs.fontSize};
            line-height: ${cs.lineHeight}; white-space: ${cs.whiteSpace};
            word-break: ${cs.wordBreak}; padding: ${cs.padding};
            border: ${cs.border}; box-sizing: ${cs.boxSizing};
        `;
        mirror.textContent = lines.slice(0, targetLineIndex).join('\n') + '\n';
        document.body.appendChild(mirror);
        const targetScrollTop = mirror.scrollHeight;
        document.body.removeChild(mirror);

        const lineHeight = parseFloat(cs.lineHeight) || 22;
        const scrollContainer = markdownEditor.closest('.editor-with-lines') || markdownEditor;
        scrollContainer.scrollTop = Math.max(0, targetScrollTop - parseFloat(cs.paddingTop) - lineHeight);
    }

    // ===================================
    // SINCRONIZACIÓN BIDIRECCIONAL (dblclick)
    // ===================================

    let _syncingSelection = false;

    // Preview → Editor
    previewPanel.addEventListener('dblclick', () => {
        if (!isEditorOpen || _syncingSelection) return;
        setTimeout(() => {
            const sel = window.getSelection();
            const word = sel.toString().trim();
            if (!word || word.length < 2 || /\s/.test(word)) return;

            _syncingSelection = true;
            setTimeout(() => { _syncingSelection = false; }, 200);

            const anchorNode = sel.anchorNode;
            const relPos = getRelativePositionInPreview(anchorNode, sel.anchorOffset);
            const rawContent = markdownEditor.value;
            const occurrences = findAllOccurrences(rawContent, word);
            if (occurrences.length === 0) return;

            const bestIdx = pickClosestOccurrence(occurrences, relPos, rawContent.length);
            markdownEditor.focus();
            markdownEditor.setSelectionRange(bestIdx, bestIdx + word.length);
            scrollEditorToCharIndex(bestIdx);
        }, 10);
    });

    // Editor → Preview
    markdownEditor.addEventListener('dblclick', () => {
        if (!isEditorOpen || _syncingSelection) return;
        const start = markdownEditor.selectionStart;
        const end = markdownEditor.selectionEnd;
        const word = markdownEditor.value.substring(start, end).trim();
        if (!word || word.length < 2 || /\s/.test(word)) {
            clearPreviewHighlight();
            return;
        }

        _syncingSelection = true;
        setTimeout(() => { _syncingSelection = false; }, 200);

        const relativePosition = start / markdownEditor.value.length;
        const cleanWord = stripMarkdown(word);
        highlightInPreview(cleanWord, relativePosition);
    });

    // Helper functions
    function findAllOccurrences(text, word) {
        const results = [];
        const lowerText = text.toLowerCase();
        const lowerWord = word.toLowerCase();
        let pos = 0;
        while (true) {
            const idx = lowerText.indexOf(lowerWord, pos);
            if (idx === -1) break;
            results.push(idx);
            pos = idx + 1;
        }
        return results;
    }

    function pickClosestOccurrence(occurrences, relativePos, totalLength) {
        let best = occurrences[0];
        let bestDiff = Infinity;
        for (const idx of occurrences) {
            const diff = Math.abs((idx / totalLength) - relativePos);
            if (diff < bestDiff) { bestDiff = diff; best = idx; }
        }
        return best;
    }

    function getRelativePositionInPreview(textNode, offset) {
        const allText = markdownContent.textContent;
        const walker = document.createTreeWalker(markdownContent, NodeFilter.SHOW_TEXT, null);
        let accumulated = 0;
        let node;
        while (node = walker.nextNode()) {
            if (node === textNode) return (accumulated + offset) / allText.length;
            accumulated += node.textContent.length;
        }
        return 0.5;
    }

    function stripMarkdown(text) {
        return text
            .replace(/\*{1,2}(.*?)\*{1,2}/g, '$1')
            .replace(/`{1,3}(.*?)`{1,3}/g, '$1')
            .replace(/^#{1,6}\s+/gm, '')
            .replace(/^\s*[-*+]\s+/gm, '')
            .replace(/^\s*\d+\.\s+/gm, '')
            .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
            .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
            .trim();
    }

    function highlightInPreview(text, relativePosition) {
        clearPreviewHighlight();
        if (!text || text.length < 2) return;

        const searchText = text.substring(0, 80).toLowerCase();
        const matches = [];
        const walker = document.createTreeWalker(markdownContent, NodeFilter.SHOW_TEXT, null);
        let node;
        let totalTextLength = 0;
        let nodePositions = [];

        while (node = walker.nextNode()) {
            nodePositions.push({ node, startPos: totalTextLength });
            totalTextLength += node.textContent.length;
        }

        for (const np of nodePositions) {
            const nodeText = np.node.textContent.toLowerCase();
            let searchFrom = 0;
            while (true) {
                const idx = nodeText.indexOf(searchText, searchFrom);
                if (idx === -1) break;
                matches.push({ node: np.node, idx, absPos: np.startPos + idx });
                searchFrom = idx + 1;
            }
        }

        if (matches.length === 0) return;

        let bestMatch = matches[0];
        if (matches.length > 1 && relativePosition !== undefined) {
            let bestDiff = Infinity;
            for (const m of matches) {
                const diff = Math.abs((m.absPos / totalTextLength) - relativePosition);
                if (diff < bestDiff) { bestDiff = diff; bestMatch = m; }
            }
        }

        try {
            const range = document.createRange();
            range.setStart(bestMatch.node, bestMatch.idx);
            range.setEnd(bestMatch.node, Math.min(bestMatch.idx + searchText.length, bestMatch.node.textContent.length));
            const mark = document.createElement('mark');
            mark.className = 'sync-highlight';
            mark.style.cssText = 'background-color: rgba(9, 105, 218, 0.15); border-radius: 2px; padding: 1px 0;';
            range.surroundContents(mark);
            mark.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } catch (e) { /* nodo cruzado */ }
    }

    function clearPreviewHighlight() {
        markdownContent.querySelectorAll('mark.sync-highlight').forEach(mark => {
            const parent = mark.parentNode;
            parent.replaceChild(document.createTextNode(mark.textContent), mark);
            parent.normalize();
        });
    }

    function scrollEditorToCharIndex(charIndex) {
        const rawContent = markdownEditor.value;
        const textBefore = rawContent.substring(0, charIndex);
        const lineIndex = textBefore.split('\n').length - 1;
        const lines = rawContent.split('\n');

        const mirror = document.createElement('div');
        const cs = getComputedStyle(markdownEditor);
        mirror.style.cssText = `
            position: absolute; visibility: hidden; overflow: hidden;
            width: ${markdownEditor.clientWidth}px;
            font-family: ${cs.fontFamily}; font-size: ${cs.fontSize};
            line-height: ${cs.lineHeight}; white-space: ${cs.whiteSpace};
            word-break: ${cs.wordBreak}; padding: ${cs.padding};
            border: ${cs.border}; box-sizing: ${cs.boxSizing};
        `;
        mirror.textContent = lines.slice(0, lineIndex).join('\n') + '\n';
        document.body.appendChild(mirror);
        const targetScrollTop = mirror.scrollHeight;
        document.body.removeChild(mirror);

        const lineHeight = parseFloat(cs.lineHeight) || 22;
        const targetTop = targetScrollTop - parseFloat(cs.paddingTop);

        const scrollContainer = markdownEditor.closest('.editor-with-lines') || markdownEditor;
        const currentScroll = scrollContainer.scrollTop;
        const containerHeight = scrollContainer.clientHeight;
        if (targetTop < currentScroll || targetTop > currentScroll + containerHeight - lineHeight * 2) {
            scrollContainer.scrollTop = Math.max(0, targetTop - lineHeight * 2);
        }
    }

    // ===================================
    // GLOBAL SEARCH (Cmd+P)
    // ===================================

    // Flat list of paths for current workspace
    let flatSearchPaths = [];

    function flattenTreeToPaths(node) {
        let paths = [];
        if (node.type === 'file' && node.name.endsWith('.md')) {
            paths.push({ path: node.path, name: node.name, type: 'file' });
        }
        if (node.children) {
            for (const child of node.children) {
                paths = paths.concat(flattenTreeToPaths(child));
            }
        }
        return paths;
    }

    async function startLocalIndexing(treeData) {
        flatSearchPaths = flattenTreeToPaths(treeData);
        localSearchIndex.clear();
        isIndexing = true;

        // Asynchronously load all files into memory
        for (const item of flatSearchPaths) {
            try {
                // Navegar hasta el handle del archivo
                const parts = item.path.split('/');
                let targetDir = currentLocalFolderHandle;
                if (parts.length > 1) {
                    for (let i = 1; i < parts.length - 1; i++) {
                        targetDir = await targetDir.getDirectoryHandle(parts[i]);
                    }
                }
                const fileName = parts[parts.length - 1];
                const fileHandle = await targetDir.getFileHandle(fileName);
                const file = await fileHandle.getFile();
                const content = await file.text();

                localSearchIndex.set(item.path, {
                    path: item.path,
                    name: item.name,
                    content: content.toLowerCase(),
                    rawContent: content
                });
            } catch (err) {
                console.warn("Error indexing file:", item.path, err);
            }
            // Pequeña pausa para no bloquear la UI
            await new Promise(r => setTimeout(r, 2));
        }
        isIndexing = false;
    }

    function openSearchModal() {
        if (!currentLocalFolderHandle && !currentGitHubRepo && !currentNodeServer) return;

        if (currentGitHubRepo) {
            showToast('La búsqueda global (Cmd+P) está desactivada para repositorios GitHub.', 'warning');
            return;
        }
        isSearchModalOpen = true;
        searchModal.style.display = 'flex';
        searchInput.value = '';
        searchResults.innerHTML = '';
        currentSearchResults = [];
        searchSelectedIndex = -1;
        searchInput.focus();
        searchSpinner.style.display = 'none';

        // Si no hay búsqueda aún, mostrar archivos recientes o simplemente la lista de paths
        if (flatSearchPaths.length === 0 && currentGitHubRepo && lastTreeHash) {
            // Reconstruimos la lista plana si tenemos el árbol (via hash o caché)
        }
    }

    function closeSearchModal() {
        isSearchModalOpen = false;
        searchModal.style.display = 'none';
        searchInput.blur();
        if (editorPanel.style.display === 'flex') {
            markdownEditor.focus();
        }
    }

    document.addEventListener('keydown', (e) => {
        // Cmd+P (Mac) or Ctrl+P (Win)
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'p') {
            e.preventDefault(); // Evitar imprimir
            if (isSearchModalOpen) closeSearchModal();
            else openSearchModal();
        }

        if (!isSearchModalOpen) return;

        // Navegación con teclado en el modal
        if (e.key === 'Escape') {
            e.preventDefault();
            closeSearchModal();
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (currentSearchResults.length > 0) {
                searchSelectedIndex = Math.min(searchSelectedIndex + 1, currentSearchResults.length - 1);
                updateSearchSelection();
            }
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (currentSearchResults.length > 0) {
                searchSelectedIndex = Math.max(searchSelectedIndex - 1, 0);
                updateSearchSelection();
            }
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (searchSelectedIndex >= 0 && searchSelectedIndex < currentSearchResults.length) {
                const selected = currentSearchResults[searchSelectedIndex];
                openFileFromSearch(selected);
                closeSearchModal();
            }
        }
    });

    function updateSearchSelection() {
        const items = searchResults.querySelectorAll('.search-result-item');
        items.forEach((item, index) => {
            if (index === searchSelectedIndex) {
                item.classList.add('selected');
                item.scrollIntoView({ block: 'nearest' });
            } else {
                item.classList.remove('selected');
            }
        });
    }

    function getSnippet(content, queryLower) {
        const idx = content.toLowerCase().indexOf(queryLower);
        if (idx === -1) return '';
        const start = Math.max(0, idx - 40);
        const end = Math.min(content.length, idx + queryLower.length + 40);
        let snippet = content.substring(start, end);
        if (start > 0) snippet = '...' + snippet;
        if (end < content.length) snippet = snippet + '...';
        return snippet.replace(/\n/g, ' ');
    }

    async function performSearch(query) {
        const q = query.toLowerCase().trim();
        searchResults.innerHTML = '';
        currentSearchResults = [];
        searchSelectedIndex = -1;

        if (!q) return;

        if (currentLocalFolderHandle) {
            // LOCAL: Buscar RAM instantáneamente
            let results = [];
            for (const [path, data] of localSearchIndex.entries()) {
                const pathMatch = path.toLowerCase().includes(q);
                const contentMatch = data.content.includes(q);

                if (pathMatch || contentMatch) {
                    results.push({
                        path: data.path,
                        name: data.name,
                        isTitleMatch: pathMatch,
                        snippet: contentMatch ? getSnippet(data.rawContent, q) : ''
                    });
                }
            }

            // Ordenar: Coincidencias en título primero
            results.sort((a, b) => {
                if (a.isTitleMatch && !b.isTitleMatch) return -1;
                if (!a.isTitleMatch && b.isTitleMatch) return 1;
                return a.name.localeCompare(b.name);
            });

            // Top 20 resultados
            currentSearchResults = results.slice(0, 20);
            renderSearchResults();

        } else if (currentNodeServer) {
            let pathResults = [];
            if (flatSearchPaths && flatSearchPaths.length > 0) {
                pathResults = flatSearchPaths
                    .filter(item => item.name.toLowerCase().includes(q) || item.path.toLowerCase().includes(q))
                    .map(item => ({
                        path: item.path,
                        name: item.name,
                        isTitleMatch: true,
                        snippet: ''
                    }));
                pathResults.sort((a, b) => a.name.localeCompare(b.name));
            }

            currentSearchResults = pathResults.slice(0, 20);
            renderSearchResults();

        } else if (currentGitHubRepo) {
            // GITHUB: 1. Instantly show path matches from flatSearchPaths
            let pathResults = [];
            if (flatSearchPaths && flatSearchPaths.length > 0) {
                pathResults = flatSearchPaths
                    .filter(item => item.name.toLowerCase().includes(q) || item.path.toLowerCase().includes(q))
                    .map(item => ({
                        path: item.path,
                        name: item.name,
                        isTitleMatch: true,
                        snippet: ''
                    }));

                pathResults.sort((a, b) => a.name.localeCompare(b.name));
            }

            currentSearchResults = pathResults.slice(0, 20);
            renderSearchResults();

            // GITHUB: 2. API Search for inside contents (asynchronously appended)
            searchSpinner.style.display = 'block';
            try {
                // API requiere algo de formato, evitamos rate limits
                const data = await GitHubAPI.searchCode(currentGitHubRepo.owner, currentGitHubRepo.repo, q);
                searchSpinner.style.display = 'none';

                if (data && data.items) {
                    const existingPaths = new Set(currentSearchResults.map(r => r.path));
                    const apiResults = data.items
                        .filter(item => !existingPaths.has(item.path))
                        .map(item => ({
                            path: item.path,
                            name: item.name,
                            isTitleMatch: item.name.toLowerCase().includes(q),
                            snippet: '... coincidencia en contenido ...'
                        }));

                    currentSearchResults = [...currentSearchResults, ...apiResults].slice(0, 20);
                    renderSearchResults();
                }
            } catch (err) {
                searchSpinner.style.display = 'none';
                if (currentSearchResults.length === 0) {
                    searchResults.innerHTML = `<div style="padding: 10px; color: var(--text-warning);">Buscar texto: ${err.message}</div>`;
                }
            }
        }
    }

    searchInput.addEventListener('input', (e) => {
        const query = e.target.value;
        clearTimeout(searchDebounceTimer);

        if (currentLocalFolderHandle) {
            // Local es instantáneo, poco debounce
            searchDebounceTimer = setTimeout(() => performSearch(query), 100);
        } else {
            // GitHub penaliza muchisimo el rate limit (10 por min), debounce alto
            searchDebounceTimer = setTimeout(() => performSearch(query), 800);
        }
    });

    function renderSearchResults() {
        searchResults.innerHTML = '';
        if (currentSearchResults.length === 0) {
            searchResults.innerHTML = `<div style="padding: 10px; color: var(--text-muted); font-size: 0.9rem;">No se encontraron resultados.</div>`;
            return;
        }

        currentSearchResults.forEach((res, index) => {
            const div = document.createElement('div');
            div.className = 'search-result-item';
            div.innerHTML = `
                <div class="search-result-title">
                    <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"></path></svg>
                    ${res.name}
                </div>
                <div class="search-result-path">${res.path}</div>
                ${res.snippet ? `<div class="search-result-snippet">${res.snippet}</div>` : ''}
            `;

            div.addEventListener('click', () => {
                openFileFromSearch(res);
                closeSearchModal();
            });

            // Hover manual tracking for keyboard sync
            div.addEventListener('mouseenter', () => {
                searchSelectedIndex = index;
                updateSearchSelection();
            });

            searchResults.appendChild(div);
        });

        // Set initial selection
        searchSelectedIndex = 0;
        updateSearchSelection();
    }

    function openFileFromSearch(result) {
        // Necesitamos construir el objeto 'item' que espera openFileTab()
        const fakeItem = {
            path: result.path,
            name: result.name,
            type: 'file'
        };
        openFileTab(fakeItem);
    }

    // Expose app controller to other scripts (like chat.js)
    window.appCtrl = {
        getActiveTabName: () => {
            if (!activeTabId) return null;
            const tab = openTabs.find(t => t.id === activeTabId);
            return tab ? tab.name : null;
        },
        get activeTabId() { return activeTabId; },
        get openTabs() { return openTabs; },
        setActiveTab: setActiveTab
    };

    // === SIDEBAR RESIZER ===
    const sidebarEl = document.getElementById('sidebar');
    const sidebarResizer = document.getElementById('sidebarResizer');

    if (sidebarEl && sidebarResizer) {
        let isResizingSidebar = false;

        sidebarResizer.addEventListener('mousedown', (e) => {
            isResizingSidebar = true;
            sidebarResizer.classList.add('is-resizing');
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
            _blockWebviews();
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isResizingSidebar) return;
            const newWidth = e.clientX;
            if (newWidth >= 150 && newWidth <= 800) {
                sidebarEl.style.width = newWidth + 'px';
                sidebarEl.style.transition = 'none';
            }
        });

        document.addEventListener('mouseup', () => {
            if (isResizingSidebar) {
                isResizingSidebar = false;
                sidebarResizer.classList.remove('is-resizing');
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
                sidebarEl.style.transition = '';
                _unblockWebviews();
            }
        });
    }

    // === HORIZONTAL RESIZER (FILE TREE / CODA) ===
    const fileTreeEl = document.getElementById('fileTreeContainer');
    const codaResizer = document.getElementById('codaResizer');

    if (sidebarEl && fileTreeEl && codaResizer) {
        let isResizingCoda = false;
        let startY, startHeight;

        codaResizer.addEventListener('mousedown', (e) => {
            isResizingCoda = true;
            codaResizer.classList.add('is-resizing');
            document.body.style.cursor = 'row-resize';
            document.body.style.userSelect = 'none';
            _blockWebviews();
            
            startY = e.clientY;
            startHeight = fileTreeEl.getBoundingClientRect().height;
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isResizingCoda) return;
            const deltaY = e.clientY - startY;
            const newHeight = startHeight + deltaY;
            
            // Limit minimum heights for both sections
            const minTreeHeight = 60;
            const minCodaHeight = 60;
            // Ensure there's space for header etc.
            const maxTreeHeight = sidebarEl.getBoundingClientRect().height - minCodaHeight - 50; 
            
            if (newHeight >= minTreeHeight && newHeight <= maxTreeHeight) {
                fileTreeEl.style.flex = 'none';
                fileTreeEl.style.height = newHeight + 'px';
            }
        });

        document.addEventListener('mouseup', () => {
            if (isResizingCoda) {
                isResizingCoda = false;
                codaResizer.classList.remove('is-resizing');
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
                _unblockWebviews();
            }
        });
    }

    // === HORIZONTAL RESIZER (CODA / NOTION) ===
    const codaSectionEl = document.getElementById('codaSection');
    const notionResizer = document.getElementById('notionResizer');

    if (sidebarEl && codaSectionEl && notionResizer) {
        let isResizingNotion = false;
        let startYNotion, startHeightNotion;

        notionResizer.addEventListener('mousedown', (e) => {
            isResizingNotion = true;
            notionResizer.classList.add('is-resizing');
            document.body.style.cursor = 'row-resize';
            document.body.style.userSelect = 'none';
            _blockWebviews();
            
            startYNotion = e.clientY;
            startHeightNotion = codaSectionEl.getBoundingClientRect().height;
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isResizingNotion) return;
            const deltaY = e.clientY - startYNotion;
            const newHeight = startHeightNotion + deltaY;
            
            const minCodaHeight = 60;
            const minNotionHeight = 60;
            const maxCodaHeight = sidebarEl.getBoundingClientRect().height - minNotionHeight - 100; // Account for tree and margins
            
            if (newHeight >= minCodaHeight && newHeight <= maxCodaHeight) {
                codaSectionEl.style.flex = 'none';
                codaSectionEl.style.height = newHeight + 'px';
            }
        });

        document.addEventListener('mouseup', () => {
            if (isResizingNotion) {
                isResizingNotion = false;
                notionResizer.classList.remove('is-resizing');
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
                _unblockWebviews();
            }
        });
    }

    // ============================================================
    // SETTINGS MODAL + CODA/NOTION PHASE 2 (API Key)
    // ============================================================
    (function () {
        const api = window.api || null;

        const modal        = document.getElementById('settingsModal');
        const settingsBtn  = document.getElementById('settingsBtn');
        const closeBtn     = document.getElementById('settingsCloseBtn');
        
        // Coda Elements
        const apiKeyInput  = document.getElementById('codaApiKeyInput');
        const toggleBtn    = document.getElementById('codaApiKeyToggle');
        const saveBtn      = document.getElementById('codaApiKeySave');
        const removeBtn    = document.getElementById('codaApiKeyRemove');
        const statusEl     = document.getElementById('codaApiKeyStatus');

        // Notion Elements
        const notionApiKeyInput  = document.getElementById('notionApiKeyInput');
        const notionToggleBtn    = document.getElementById('notionApiKeyToggle');
        const notionSaveBtn      = document.getElementById('notionApiKeySave');
        const notionRemoveBtn    = document.getElementById('notionApiKeyRemove');
        const notionStatusEl     = document.getElementById('notionApiKeyStatus');

        if (!modal || !settingsBtn) return;

        // ---- Persist API keys in IndexedDB via the existing WorkspaceDB ----
        const CODA_KEY_STORE = 'coda_api_key';
        const NOTION_KEY_STORE = 'notion_api_key';

        async function loadApiKey(storeName) {
            try {
                const db = await WorkspaceDB.getDB();
                return new Promise((res, rej) => {
                    const tx = db.transaction('settings', 'readonly');
                    const store = tx.objectStore('settings');
                    const req = store.get(storeName);
                    req.onsuccess = () => res(req.result?.value || null);
                    req.onerror  = () => res(null);
                });
            } catch { return null; }
        }

        async function saveApiKey(storeName, key) {
            try {
                const db = await WorkspaceDB.getDB();
                return new Promise((res, rej) => {
                    const tx = db.transaction('settings', 'readwrite');
                    const store = tx.objectStore('settings');
                    const req = store.put({ key: storeName, value: key });
                    req.onsuccess = () => res(true);
                    req.onerror  = () => res(false);
                });
            } catch { return false; }
        }

        async function deleteApiKey(storeName) {
            try {
                const db = await WorkspaceDB.getDB();
                return new Promise((res) => {
                    const tx = db.transaction('settings', 'readwrite');
                    const store = tx.objectStore('settings');
                    store.delete(storeName);
                    tx.oncomplete = () => res(true);
                });
            } catch { return false; }
        }

        // ---- Coda API helper ----
        async function codaGet(apiPath, apiKey) {
            if (!api) {
                // Fallback for non-Electron (dev): direct fetch (may fail CORS)
                const r = await fetch(`https://coda.io/apis/v1${apiPath}`, {
                    headers: { 'Authorization': `Bearer ${apiKey}` }
                });
                return { ok: r.ok, status: r.status, data: r.ok ? await r.json() : null };
            }
            return api.codaApiRequest({ path: apiPath, apiKey });
        }

        // ---- Notion API helper ----
        async function notionReq(apiPath, method = 'GET', body = null, apiKey) {
            if (!api) {
                const r = await fetch(`https://api.notion.com/v1${apiPath}`, {
                    method,
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'Notion-Version': '2022-06-28',
                        'Content-Type': 'application/json'
                    },
                    body: body ? JSON.stringify(body) : null
                });
                return { ok: r.ok, status: r.status, data: r.ok ? await r.json() : null };
            }
            return api.notionApiRequest({ path: apiPath, method, body, apiKey });
        }

        // ---- Open / Close modal ----
        function openModal() {
            modal.style.display = 'flex';
            
            // Coda
            loadApiKey(CODA_KEY_STORE).then(key => {
                if (key) {
                    apiKeyInput.value = key;
                    removeBtn.style.display = 'inline-flex';
                    setStatus(statusEl, '✓ Conectado', 'ok');
                } else {
                    apiKeyInput.value = '';
                    removeBtn.style.display = 'none';
                    setStatus(statusEl, '', '');
                }
            });

            // Notion
            loadApiKey(NOTION_KEY_STORE).then(key => {
                if (key) {
                    notionApiKeyInput.value = key;
                    notionRemoveBtn.style.display = 'inline-flex';
                    setStatus(notionStatusEl, '✓ Conectado', 'ok');
                } else {
                    notionApiKeyInput.value = '';
                    notionRemoveBtn.style.display = 'none';
                    setStatus(notionStatusEl, '', '');
                }
            });
        }

        function closeModal() { modal.style.display = 'none'; }

        settingsBtn.addEventListener('click', openModal);
        closeBtn.addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal.style.display !== 'none') closeModal();
        });

        // Toggle password visibility
        toggleBtn.addEventListener('click', () => {
            apiKeyInput.type = apiKeyInput.type === 'password' ? 'text' : 'password';
        });
        notionToggleBtn.addEventListener('click', () => {
            notionApiKeyInput.type = notionApiKeyInput.type === 'password' ? 'text' : 'password';
        });

        function setStatus(el, msg, cls) {
            el.textContent = msg;
            el.className = 'settings-status' + (cls ? ` ${cls}` : '');
        }

        // ---- Save & connect Coda ----
        saveBtn.addEventListener('click', async () => {
            const key = apiKeyInput.value.trim();
            if (!key) { setStatus(statusEl, 'Introduce tu API Key', 'err'); return; }

            setStatus(statusEl, 'Conectando...', '');
            saveBtn.disabled = true;

            const result = await codaGet('/whoami', key);
            saveBtn.disabled = false;

            if (result.ok && result.data) {
                await saveApiKey(CODA_KEY_STORE, key);
                currentCodaApiKey = key;
                removeBtn.style.display = 'inline-flex';
                setStatus(statusEl, `✓ Conectado como ${result.data.name || result.data.loginId || 'usuario'}`, 'ok');
                await loadCodaTree();
            } else {
                setStatus(statusEl, 'API Key inválida o sin conexión', 'err');
            }
        });

        // ---- Save & connect Notion ----
        notionSaveBtn.addEventListener('click', async () => {
            const key = notionApiKeyInput.value.trim();
            if (!key) { setStatus(notionStatusEl, 'Introduce tu API Key', 'err'); return; }

            setStatus(notionStatusEl, 'Conectando...', '');
            notionSaveBtn.disabled = true;

            const result = await notionReq('/users/me', 'GET', null, key);
            notionSaveBtn.disabled = false;

            if (result.ok && result.data) {
                await saveApiKey(NOTION_KEY_STORE, key);
                currentNotionApiKey = key;
                notionRemoveBtn.style.display = 'inline-flex';
                setStatus(notionStatusEl, `✓ Conectado como ${result.data.name || 'bot'}`, 'ok');
                await loadNotionTree();
            } else {
                setStatus(notionStatusEl, 'API Key inválida o sin conexión', 'err');
            }
        });

        // ---- Remove Coda ----
        removeBtn.addEventListener('click', async () => {
            await deleteApiKey(CODA_KEY_STORE);
            currentCodaApiKey = null;
            apiKeyInput.value = '';
            removeBtn.style.display = 'none';
            setStatus(statusEl, 'Desconectado', '');
            clearCodaApiTree();
        });

        // ---- Remove Notion ----
        notionRemoveBtn.addEventListener('click', async () => {
            await deleteApiKey(NOTION_KEY_STORE);
            currentNotionApiKey = null;
            notionApiKeyInput.value = '';
            notionRemoveBtn.style.display = 'none';
            setStatus(notionStatusEl, 'Desconectado', '');
            clearNotionApiTree();
        });

        // ---- Bootstrap on load ----
        let currentCodaApiKey = null;
        let currentNotionApiKey = null;

        loadApiKey(CODA_KEY_STORE).then(async key => {
            if (key) {
                currentCodaApiKey = key;
                await loadCodaTree();
            }
        });

        loadApiKey(NOTION_KEY_STORE).then(async key => {
            if (key) {
                currentNotionApiKey = key;
                await loadNotionTree();
            }
        });

        // ---- Load & render document tree ----
        async function loadCodaTree() {
            if (!currentCodaApiKey) return;
            const codaSection = document.getElementById('codaSection');
            const codaResizer = document.getElementById('codaResizer');
            if (!codaSection) return;

            codaSection.style.display = 'flex';
            if (codaResizer) codaResizer.style.display = 'block';

            // Show loading state
            let treeEl = codaSection.querySelector('.coda-api-tree');
            if (!treeEl) {
                treeEl = document.createElement('ul');
                treeEl.className = 'coda-api-tree';
                codaSection.appendChild(treeEl);
            }
            treeEl.innerHTML = '<li style="padding:6px 12px;font-size:0.78rem;color:var(--text-muted);">Cargando documentos...</li>';

            const result = await codaGet('/docs?limit=50', currentCodaApiKey);
            if (!result.ok || !result.data) {
                treeEl.innerHTML = '<li style="padding:6px 12px;font-size:0.78rem;color:#e53e3e;">Error al cargar docs</li>';
                return;
            }

            const docs = result.data.items || [];
            treeEl.innerHTML = '';

            if (docs.length === 0) {
                treeEl.innerHTML = '<li style="padding:6px 12px;font-size:0.78rem;color:var(--text-muted);">Sin documentos</li>';
                return;
            }

            docs.forEach(doc => {
                const li = document.createElement('li');
                li.className = 'coda-api-doc';
                li.innerHTML = `
                    <div class="coda-api-doc-header">
                        <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path d="M9 5l7 7-7 7"/></svg>
                        <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 9h6M9 12h6M9 15h4"/></svg>
                        <span>${doc.name}</span>
                    </div>
                    <ul class="coda-api-pages"></ul>
                `;

                const header = li.querySelector('.coda-api-doc-header');
                const pagesUl = li.querySelector('.coda-api-pages');
                let loaded = false;

                header.addEventListener('click', async () => {
                    li.classList.toggle('expanded');
                    if (li.classList.contains('expanded') && !loaded) {
                        loaded = true;
                        pagesUl.innerHTML = '<li style="padding:4px 8px;font-size:0.78rem;color:var(--text-muted);">Cargando p\u00e1ginas...</li>';

                         // ---- Fetch ALL pages (handle Coda pagination) ----
                        let allPages = [];
                        let nextPageToken = null;
                        let hasError = false;
                        let errorMsg = '';

                        try {
                            do {
                                const url = nextPageToken
                                    ? `/docs/${doc.id}/pages?pageToken=${encodeURIComponent(nextPageToken)}`
                                    : `/docs/${doc.id}/pages`;
                                const pr = await codaGet(url, currentCodaApiKey);
                                if (pr.ok && pr.data && Array.isArray(pr.data.items)) {
                                    allPages = allPages.concat(pr.data.items);
                                    nextPageToken = pr.data.nextPageToken || null;
                                } else {
                                    errorMsg = `HTTP ${pr.status} — ${JSON.stringify(pr.data).slice(0,120)}`;
                                    hasError = true;
                                    break;
                                }
                            } while (nextPageToken);
                        } catch (ex) {
                            hasError = true;
                            errorMsg = ex.message || String(ex);
                        }

                        console.log('[Coda] Loaded', allPages.length, 'pages, hasError:', hasError);
                        pagesUl.innerHTML = '';

                        if (hasError) {
                            pagesUl.innerHTML = `<li style="padding:4px 8px;font-size:0.78rem;color:#e53e3e;word-wrap:break-word;">Error: ${errorMsg}</li>`;
                        } else if (allPages.length > 0) {
                            // ---- Build parent→children map ----
                            const pageMap = {};
                            allPages.forEach(p => { pageMap[p.id] = { ...p, children: [] }; });

                            const rootPages = [];
                            allPages.forEach(p => {
                                const parentId = p.parent?.id;
                                if (parentId && pageMap[parentId]) {
                                    pageMap[parentId].children.push(pageMap[p.id]);
                                } else {
                                    rootPages.push(pageMap[p.id]);
                                }
                            });

                            // ---- Recursive tree renderer ----
                            function renderPageNode(pageNode, containerUl) {
                                const wrap = document.createElement('li');
                                wrap.className = 'coda-api-page-item-container';

                                const row = document.createElement('div');
                                row.className = 'coda-api-page-item';

                                const hasKids = pageNode.children.length > 0;
                                const arrowSvg = hasKids
                                    ? '<svg class="coda-folder-icon" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 5l7 7-7 7"/></svg>'
                                    : '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';

                                row.innerHTML = `${arrowSvg}<span>${pageNode.name}</span>`;
                                wrap.appendChild(row);

                                if (hasKids) {
                                    const childUl = document.createElement('ul');
                                    childUl.style.cssText = 'display:none;list-style:none;padding-left:14px;margin:0;';
                                    wrap.appendChild(childUl);

                                    pageNode.children.forEach(child => renderPageNode(child, childUl));

                                    const arrow = row.querySelector('.coda-folder-icon');
                                    if (arrow) {
                                        arrow.style.cursor = 'pointer';
                                        arrow.style.transition = 'transform 0.15s';
                                        arrow.addEventListener('click', (e) => {
                                            e.stopPropagation();
                                            const open = childUl.style.display === 'block';
                                            childUl.style.display = open ? 'none' : 'block';
                                            arrow.style.transform = open ? '' : 'rotate(90deg)';
                                        });
                                    }
                                }

                                row.addEventListener('click', () => openCodaApiPage(doc, pageNode, row));
                                const codaUrl = pageNode.browserLink || `https://coda.io/d/${doc.id}/${pageNode.id}`;
                                row.appendChild(createCopyPathBtn(codaUrl));
                                containerUl.appendChild(wrap);
                            }

                            rootPages.forEach(p => renderPageNode(p, pagesUl));

                        } else {
                            pagesUl.innerHTML = '<li style="padding:4px 8px;font-size:0.78rem;color:var(--text-muted);">Sin p\u00e1ginas</li>';
                        }
                    }
                });

                treeEl.appendChild(li);
            });
        }

        function clearCodaApiTree() {
            const codaSection = document.getElementById('codaSection');
            const codaResizer = document.getElementById('codaResizer');
            if (codaSection) codaSection.style.display = 'none';
            if (codaResizer) codaResizer.style.display = 'none';
            
            const treeEl = codaSection?.querySelector('.coda-api-tree');
            if (treeEl) treeEl.remove();
        }

        // ---- Refresh buttons ----
        document.getElementById('refreshCodaBtn')?.addEventListener('click', async (e) => {
            e.stopPropagation();
            const btn = e.currentTarget;
            btn.classList.add('spinning');
            await loadCodaTree();
            btn.classList.remove('spinning');
            showToast('Árbol de Coda actualizado', 'success');
        });

        document.getElementById('refreshNotionBtn')?.addEventListener('click', async (e) => {
            e.stopPropagation();
            const btn = e.currentTarget;
            btn.classList.add('spinning');
            await loadNotionTree();
            btn.classList.remove('spinning');
            showToast('Árbol de Notion actualizado', 'success');
        });

        // ---- Open a Coda page via API ----
        async function openCodaApiPage(doc, page, clickedEl) {
            // Mark active in tree
            document.querySelectorAll('.coda-api-page-item').forEach(el => el.classList.remove('active'));
            if (clickedEl) clickedEl.classList.add('active');

            // Check if already open
            const tabId = `coda-api:${doc.id}:${page.id}`;
            const existing = openTabs.find(t => t.id === tabId);
            if (existing) { setActiveTab(tabId); return; }

            // Use browserLink from the API — the exact correct Coda page URL
            const pageUrl = page.browserLink || `https://coda.io/d/${doc.id}/${page.id}`;

            const tab = {
                id: tabId,
                name: page.name,
                path: null,
                handle: null,
                isLocal: false, isNode: false, isGitHub: false, isHtml: false,
                isCoda: true,
                codaId: tabId,
                codaEmbedUrl: pageUrl,
                content: '', rawContent: '', savedContent: '', dirty: false
            };

            openTabs.push(tab);
            setActiveTab(tabId);
            saveWorkspaceState();
        }

        // ---- Load & render Notion tree ----
        async function loadNotionTree() {
            if (!currentNotionApiKey) return;
            const notionSection = document.getElementById('notionSection');
            const notionResizer = document.getElementById('notionResizer');
            if (!notionSection) return;

            notionSection.style.display = 'flex';
            if (notionResizer) notionResizer.style.display = 'block';

            let treeEl = notionSection.querySelector('.coda-api-tree'); // Reuse Coda classes for styling
            if (!treeEl) {
                treeEl = document.createElement('ul');
                treeEl.className = 'coda-api-tree notion-api-tree';
                notionSection.appendChild(treeEl);
            }
            treeEl.innerHTML = '<li style="padding:6px 12px;font-size:0.78rem;color:var(--text-muted);">Cargando docs...</li>';

            // Notion search endpoint retrieves pages/databases shared with integration
            const result = await notionReq('/search', 'POST', {
                "filter": { "value": "page", "property": "object" },
                "sort": { "direction": "descending", "timestamp": "last_edited_time" }
            }, currentNotionApiKey);

            if (!result.ok || !result.data) {
                treeEl.innerHTML = '<li style="padding:6px 12px;font-size:0.78rem;color:#e53e3e;">Error al cargar Notion</li>';
                return;
            }

            const pages = result.data.results || [];
            treeEl.innerHTML = '';

            if (pages.length === 0) {
                treeEl.innerHTML = '<li style="padding:6px 12px;font-size:0.78rem;color:var(--text-muted);">Sin páginas (recuerda compartir tus páginas en Notion)</li>';
                return;
            }

            pages.forEach(page => {
                const li = document.createElement('li');
                li.className = 'coda-api-page-item-container'; // Reuse class

                const row = document.createElement('div');
                row.className = 'coda-api-page-item';
                
                // Try to extract a title
                let title = 'Untitled';
                if (page.properties) {
                    const titleProp = Object.values(page.properties).find(p => p.type === 'title');
                    if (titleProp && titleProp.title && titleProp.title.length > 0) {
                        title = titleProp.title[0].plain_text;
                    }
                }
                
                row.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg><span>${title}</span>`;
                
                row.addEventListener('click', () => openNotionApiPage(page, title, row));
                const notionUrl = page.url || `https://notion.so/${page.id.replace(/-/g, '')}`;
                row.appendChild(createCopyPathBtn(notionUrl));

                li.appendChild(row);
                treeEl.appendChild(li);
            });
        }

        function clearNotionApiTree() {
            const notionSection = document.getElementById('notionSection');
            const notionResizer = document.getElementById('notionResizer');
            if (notionSection) notionSection.style.display = 'none';
            if (notionResizer) notionResizer.style.display = 'none';

            const treeEl = notionSection?.querySelector('.notion-api-tree');
            if (treeEl) treeEl.remove();
        }

        async function openNotionApiPage(page, title, clickedEl) {
            document.querySelectorAll('.coda-api-page-item').forEach(el => el.classList.remove('active'));
            if (clickedEl) clickedEl.classList.add('active');

            const tabId = `notion-api:${page.id}`;
            const existing = openTabs.find(t => t.id === tabId);
            if (existing) { setActiveTab(tabId); return; }

            // Using Notion webview Option A for now
            const pageUrl = page.url || `https://notion.so/${page.id.replace(/-/g, '')}`;

            const tab = {
                id: tabId,
                name: title,
                path: null,
                handle: null,
                isLocal: false, isNode: false, isGitHub: false, isHtml: false,
                isCoda: true, // Reuse coda webview mechanism for simplicity
                codaId: tabId,
                codaEmbedUrl: pageUrl,
                content: '', rawContent: '', savedContent: '', dirty: false
            };

            openTabs.push(tab);
            setActiveTab(tabId);
            saveWorkspaceState();
        }

        // Expose so Phase 1 can also call openModal
        window._openSettingsModal = openModal;
    })();

    // ============================================================
    // CODA INTEGRATION — Webview Panel Controls
    // ============================================================
    (function () {
        const codaPanel  = document.getElementById('codaPanel');
        let codaFrame  = document.getElementById('codaFrame');

        if (!codaPanel || !codaFrame) return;

        let currentWebviewUrl = '';

        // ---- Expose Coda panel switcher for setActiveTab ----
        window._showCodaPanel = (url) => {
            codaPanel.style.display = 'flex';
            if (url === currentWebviewUrl) return;
            currentWebviewUrl = url;
            // Forzar navegación: reemplazar el webview entero para evitar problemas de cache
            const parent = codaFrame.parentElement;
            const newFrame = codaFrame.cloneNode(false);
            newFrame.setAttribute('src', url);
            parent.replaceChild(newFrame, codaFrame);
            codaFrame = newFrame;
        };

        window._hideCodaPanel = () => {
            codaPanel.style.display = 'none';
            // Don't navigate away — preserve the session so login persists
        };
    })();

    // ============================================================
    // FIND BAR (Cmd+F / Ctrl+F)
    // ============================================================
    (function () {
        const findBar = document.getElementById('findBar');
        const findInput = document.getElementById('findInput');
        const findCount = document.getElementById('findCount');
        const findPrev = document.getElementById('findPrev');
        const findNext = document.getElementById('findNext');
        const findClose = document.getElementById('findClose');

        if (!findBar) return;

        let matches = [];   // Array of <mark> elements
        let currentIdx = -1;

        function clearHighlights() {
            // Replace each <mark> with its text content
            markdownContent.querySelectorAll('mark.find-highlight').forEach(m => {
                m.replaceWith(document.createTextNode(m.textContent));
            });
            // Merge adjacent text nodes to avoid fragmentation
            markdownContent.normalize();
            matches = [];
            currentIdx = -1;
            findCount.textContent = '';
        }

        function highlightQuery(query) {
            clearHighlights();
            if (!query) return;

            const regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
            const walker = document.createTreeWalker(markdownContent, NodeFilter.SHOW_TEXT, null);

            const textNodes = [];
            let node;
            while ((node = walker.nextNode())) {
                // Skip nodes inside the find bar
                if (findBar.contains(node)) continue;
                textNodes.push(node);
            }

            textNodes.forEach(textNode => {
                const text = textNode.nodeValue;
                if (!regex.test(text)) return;

                regex.lastIndex = 0;
                const frag = document.createDocumentFragment();
                let lastIndex = 0;
                let m;

                while ((m = regex.exec(text)) !== null) {
                    if (m.index > lastIndex) {
                        frag.appendChild(document.createTextNode(text.slice(lastIndex, m.index)));
                    }
                    const mark = document.createElement('mark');
                    mark.className = 'find-highlight';
                    mark.textContent = m[0];
                    frag.appendChild(mark);
                    matches.push(mark);
                    lastIndex = regex.lastIndex;
                }

                if (lastIndex < text.length) {
                    frag.appendChild(document.createTextNode(text.slice(lastIndex)));
                }

                textNode.replaceWith(frag);
            });

            updateCount();
            if (matches.length > 0) navigateTo(0);
        }

        function navigateTo(index) {
            if (matches.length === 0) return;
            if (currentIdx >= 0 && currentIdx < matches.length) {
                matches[currentIdx].classList.remove('find-current');
            }
            currentIdx = (index + matches.length) % matches.length;
            matches[currentIdx].classList.add('find-current');
            matches[currentIdx].scrollIntoView({ block: 'center', behavior: 'smooth' });
            updateCount();
        }

        function updateCount() {
            if (matches.length === 0) {
                findCount.textContent = findInput.value ? 'Sin resultados' : '';
            } else {
                findCount.textContent = `${currentIdx + 1} / ${matches.length}`;
            }
        }

        function openFindBar() {
            findBar.style.display = 'flex';
            findInput.focus();
            findInput.select();
        }

        function closeFindBar() {
            findBar.style.display = 'none';
            clearHighlights();
        }

        // Cmd+F / Ctrl+F
        document.addEventListener('keydown', (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
                e.preventDefault();
                openFindBar();
            }
            if (e.key === 'Escape' && findBar.style.display !== 'none') {
                e.preventDefault();
                closeFindBar();
            }
        });

        // Live search as user types (debounced)
        let searchTimer = null;
        findInput.addEventListener('input', () => {
            clearTimeout(searchTimer);
            searchTimer = setTimeout(() => highlightQuery(findInput.value), 150);
        });

        // Enter / Shift+Enter inside the input
        findInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (e.shiftKey) {
                    navigateTo(currentIdx - 1);
                } else {
                    navigateTo(currentIdx + 1);
                }
            }
        });

        findNext.addEventListener('click', () => navigateTo(currentIdx + 1));
        findPrev.addEventListener('click', () => navigateTo(currentIdx - 1));
        findClose.addEventListener('click', closeFindBar);
    })();

    // --- EXPOSICIÓN DE API PARA VÍNCULO CON TERMINAL ---
    window.app = {
        setActiveTab: (id) => setActiveTab(id),
        getActiveTabId: () => activeTabId,
        getActiveTabName: () => {
            const tab = openTabs.find(t => t.id === activeTabId);
            return tab ? tab.name : null;
        },
        showCustomPrompt: (msg, def) => showCustomPrompt(msg, def)
    };

    // Exponer openFileTab para que chat.js pueda abrir archivos desde el terminal
    window.openFileInViewer = (filePath) => {
        const rootDir = (localStorage.getItem('pmos_last_folder') || '').normalize('NFC');
        let pathForTab = filePath.normalize('NFC');
        // Si es ruta absoluta dentro del proyecto, convertir a relativa
        if (rootDir && pathForTab.startsWith(rootDir + '/')) {
            pathForTab = pathForTab.slice(rootDir.length + 1);
        }
        const name = pathForTab.split('/').pop();
        openFileTab({ path: pathForTab, name, type: 'file' });
    };

    // Exponer lista de archivos del proyecto para el link provider del terminal
    window.getProjectFiles = () => {
        function collect(node) {
            let files = [];
            if (node.type === 'file') files.push({ path: node.path, name: node.name });
            if (node.children) node.children.forEach(c => { files = files.concat(collect(c)); });
            return files;
        }
        const tree = fileTreeContainer?._treeData;
        return tree ? collect(tree) : [];
    };

    // Registrar callback en el controlador de terminal para activación bidireccional
    if (window.terminalCtrl) {
        window.terminalCtrl.onTerminalActivated = (fileId) => {
            // Buscamos si la tab ya está abierta (no debería ser necesario abrirla, solo activarla)
            const exists = openTabs.some(t => t.id === fileId);
            if (exists) {
                // Pasamos un flag interno o simplemente confiamos en que chat.js 
                // ya maneja la no-recursividad con su propio flag
                setActiveTab(fileId);
            }
        };
    }

});
