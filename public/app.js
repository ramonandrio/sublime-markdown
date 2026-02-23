document.addEventListener('DOMContentLoaded', () => {
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

    // Welcome screen
    const welcomeLocalBtn = document.getElementById('welcomeLocalBtn');
    const welcomeGitHubBtn = document.getElementById('welcomeGitHubBtn');
    const githubRepoSelector = document.getElementById('githubRepoSelector');
    const githubUserInfo = document.getElementById('githubUserInfo');
    const repoSearchInput = document.getElementById('repoSearchInput');
    const repoList = document.getElementById('repoList');
    const githubLogoutBtn = document.getElementById('githubLogoutBtn');
    const githubSetup = document.getElementById('githubSetup');
    const tokenInput = document.getElementById('tokenInput');
    const saveTokenBtn = document.getElementById('saveTokenBtn');

    // State
    let openTabs = [];
    let activeTabId = null;
    let isEditorOpen = false;
    let isTocOpen = false;
    let currentGitHubRepo = null;
    let allRepos = [];

    // Configurar Marked.js
    marked.setOptions({
        highlight: function (code, lang) {
            const language = hljs.getLanguage(lang) ? lang : 'plaintext';
            return hljs.highlight(code, { language }).value;
        },
        langPrefix: 'hljs language-',
        breaks: true,
        gfm: true
    });

    // ===================================
    // FLUJO DE INICIO
    // ===================================

    showWelcomeScreen();

    function showWelcomeScreen() {
        welcomeScreen.style.display = 'flex';
        appContainer.style.display = 'none';
        githubRepoSelector.style.display = 'none';
        githubSetup.style.display = 'none';
    }

    function showApp() {
        welcomeScreen.style.display = 'none';
        appContainer.style.display = 'flex';
    }

    // ===================================
    // WELCOME SCREEN BUTTONS
    // ===================================

    // Carpeta local
    welcomeLocalBtn.addEventListener('click', async () => {
        try {
            const dirHandle = await window.showDirectoryPicker();
            showApp();
            await renderLocalFolder(dirHandle);
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
        githubRepoSelector.style.display = 'none';
        showWelcomeScreen();
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

        showApp();
        fileTreeContainer.innerHTML = '<div class="loading-state">Cargando archivos del repositorio...</div>';

        try {
            const treeData = await GitHubAPI.getRepoTree(currentGitHubRepo.owner, currentGitHubRepo.repo);
            fileTreeContainer.innerHTML = '';
            const rootEl = renderTreeItem(treeData, true);
            fileTreeContainer.appendChild(rootEl);
        } catch (err) {
            fileTreeContainer.innerHTML = `<div class="error-state">Error: ${err.message}</div>`;
        }
    }

    // ===================================
    // BOTONES DE LA APP PRINCIPAL
    // ===================================

    // Abrir carpeta local (desde dentro de la app)
    const openFolderBtn = document.getElementById('openFolderBtn');
    if (openFolderBtn) {
        openFolderBtn.addEventListener('click', async () => {
            try {
                const dirHandle = await window.showDirectoryPicker();
                currentGitHubRepo = null;
                await renderLocalFolder(dirHandle);
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
            renderTabs();
            showWelcomeScreen();
        });
    }

    // Toggle Editor
    toggleSplitBtn.addEventListener('click', () => {
        isEditorOpen = !isEditorOpen;
        updateEditorVisibility();
    });

    // Toggle Sidebar
    const toggleSidebarBtn = document.getElementById('toggleSidebarBtn');
    const sidebar = document.querySelector('.sidebar');
    toggleSidebarBtn.addEventListener('click', () => {
        sidebar.classList.toggle('collapsed');
        toggleSidebarBtn.classList.toggle('collapsed');
    });

    // Toggle TOC
    toggleTocBtn.addEventListener('click', () => {
        isTocOpen = !isTocOpen;
        updateTocVisibility();
    });

    // Guardar
    saveFileBtn.addEventListener('click', () => saveActiveFile());

    // Atajo ⌘+S / Ctrl+S
    document.addEventListener('keydown', (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 's') {
            e.preventDefault();
            saveActiveFile();
        }
    });

    // Editor Input: Live preview
    markdownEditor.addEventListener('input', () => {
        const activeTab = openTabs.find(t => t.id === activeTabId);
        if (!activeTab) return;

        activeTab.rawContent = markdownEditor.value;
        activeTab.dirty = true;

        const rawHtml = marked.parse(activeTab.rawContent);
        activeTab.content = DOMPurify.sanitize(rawHtml);
        markdownContent.innerHTML = activeTab.content;

        if (isTocOpen) generateTOC();
        renderTabs();
    });

    // ===================================
    // CARPETA LOCAL (File System Access API)
    // ===================================

    async function renderLocalFolder(dirHandle) {
        fileTreeContainer.innerHTML = '<div class="loading-state">Leyendo carpeta...</div>';
        try {
            const treeData = await getTreeFromHandle(dirHandle, '');
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
            if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;

            if (entry.kind === 'directory') {
                item.children.push(await getTreeFromHandle(entry, pathPrefix + dirHandle.name + '/'));
            } else if (entry.name.endsWith('.md')) {
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
        const itemContainer = document.createElement('div');
        itemContainer.className = 'tree-item-container';

        const itemRow = document.createElement('div');
        itemRow.className = `tree-item ${item.type}`;
        itemRow.dataset.path = item.path || item.name;

        const iconWrapper = document.createElement('span');
        iconWrapper.className = 'icon-wrapper';

        const label = document.createElement('span');
        label.className = 'item-label';
        label.textContent = item.name;

        if (item.type === 'directory') {
            const chevron = document.createElement('span');
            chevron.className = 'chevron';
            chevron.innerHTML = '▶';
            if (isExpanded) {
                chevron.classList.add('expanded');
                chevron.innerHTML = '▼';
            }
            iconWrapper.appendChild(chevron);

            const folderIcon = document.createElement('span');
            folderIcon.className = 'folder-icon';
            iconWrapper.appendChild(folderIcon);

            itemRow.appendChild(iconWrapper);
            itemRow.appendChild(label);
            itemContainer.appendChild(itemRow);

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
                chevron.innerHTML = isCurrentlyExpanded ? '▶' : '▼';
            });

        } else {
            const fileIcon = document.createElement('span');
            fileIcon.className = 'file-icon icon-md';
            iconWrapper.appendChild(fileIcon);

            itemRow.appendChild(iconWrapper);
            itemRow.appendChild(label);
            itemContainer.appendChild(itemRow);

            itemRow.addEventListener('click', (e) => {
                e.stopPropagation();
                openFileTab(item);
            });
        }

        return itemContainer;
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
                isGitHub: !!currentGitHubRepo && !item.handle,
                githubMeta: currentGitHubRepo ? { ...currentGitHubRepo, sha: item.sha } : null,
                content: null,
                rawContent: null,
                dirty: false
            };
            openTabs.push(existingTab);
            renderTabs();
            await loadFileContent(existingTab);
        }

        setActiveTab(fileId);
    }

    function renderTabs() {
        tabsContainer.innerHTML = '';
        openTabs.forEach(tabData => {
            const tabEl = document.createElement('div');
            tabEl.className = `tab ${tabData.id === activeTabId ? 'active' : ''}`;
            tabEl.style.display = 'flex';

            const dirtyDot = tabData.dirty ? '<span class="dirty-dot">●</span>' : '';
            tabEl.innerHTML = `
                <span class="file-icon"></span>
                <span class="filename" title="${tabData.path || tabData.name}">${tabData.name}${dirtyDot}</span>
                <button class="close-tab">×</button>
            `;

            tabEl.addEventListener('click', (e) => {
                if (!e.target.classList.contains('close-tab')) setActiveTab(tabData.id);
            });

            tabEl.querySelector('.close-tab').addEventListener('click', (e) => {
                e.stopPropagation();
                closeTab(tabData.id);
            });

            tabsContainer.appendChild(tabEl);
        });
    }

    function setActiveTab(fileId) {
        activeTabId = fileId;
        renderTabs();

        document.querySelectorAll('.tree-item').forEach(el => el.classList.remove('active'));
        if (fileId) {
            const activeTreeItem = document.querySelector(`.tree-item[data-path="${fileId}"]`);
            if (activeTreeItem) activeTreeItem.classList.add('active');
        }

        const activeTab = openTabs.find(t => t.id === fileId);

        if (activeTab) {
            editorToolbar.style.display = 'flex';
            if (activeTab.content) {
                markdownContent.innerHTML = activeTab.content;
                if (isTocOpen) generateTOC();
            } else {
                markdownContent.innerHTML = '<div class="loading-state">Cargando Markdown...</div>';
            }
            markdownEditor.value = activeTab.rawContent !== null ? activeTab.rawContent : '';
        } else {
            editorToolbar.style.display = 'none';
            isEditorOpen = false;
            updateEditorVisibility();
            markdownContent.innerHTML = `
                <div class="welcome-screen">
                    <h1>Markdown Viewer</h1>
                    <p>Selecciona un archivo <code>.md</code> del panel izquierdo para comenzar.</p>
                </div>
            `;
            markdownEditor.value = '';
        }
    }

    function closeTab(fileId) {
        const tab = openTabs.find(t => t.id === fileId);
        if (tab && tab.dirty) {
            if (!confirm(`El archivo "${tab.name}" tiene cambios sin guardar. ¿Cerrar de todos modos?`)) return;
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
            }
        }
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

            if (tabData.isLocal) {
                // File System Access API
                const file = await tabData.handle.getFile();
                markdownText = await file.text();
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
            const rawHtml = marked.parse(markdownText);
            tabData.content = DOMPurify.sanitize(rawHtml);

            if (tabData.id === activeTabId) {
                markdownContent.innerHTML = tabData.content;
                markdownEditor.value = tabData.rawContent;
                if (isTocOpen) generateTOC();
            }

        } catch (error) {
            console.error('Error opening file:', error);
            tabData.content = `<div class="error-state"><h3>Error al cargar</h3><p>${error.message}</p></div>`;
            tabData.rawContent = '';
            if (tabData.id === activeTabId) {
                markdownContent.innerHTML = tabData.content;
            }
        }
    }

    // ===================================
    // GUARDADO
    // ===================================

    async function saveActiveFile() {
        const activeTab = openTabs.find(t => t.id === activeTabId);
        if (!activeTab) return;

        const originalText = saveFileBtn.innerHTML;

        try {
            if (activeTab.isLocal) {
                // File System Access API
                const writable = await activeTab.handle.createWritable();
                await writable.write(activeTab.rawContent);
                await writable.close();
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
            renderTabs();

            saveFileBtn.innerHTML = `
                <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="margin-right: 4px;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
                ¡Guardado!
            `;
            saveFileBtn.style.backgroundColor = '#2da44e';
            setTimeout(() => {
                saveFileBtn.innerHTML = originalText;
                saveFileBtn.style.backgroundColor = '';
            }, 1500);

        } catch (error) {
            console.error('Error saving file:', error);
            alert(`Error al guardar: ${error.message}`);
        }
    }

    // ===================================
    // VISIBILIDAD DEL EDITOR
    // ===================================

    function updateEditorVisibility() {
        if (isEditorOpen) {
            editorPanel.style.display = 'flex';
            toggleSplitBtn.innerHTML = `
                <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="margin-right: 4px;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path></svg>
                Vista Previa
            `;
        } else {
            editorPanel.style.display = 'none';
            toggleSplitBtn.innerHTML = `
                <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="margin-right: 4px;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
                Editar
            `;
        }
    }

    // ===================================
    // VISIBILIDAD DEL TOC
    // ===================================

    function updateTocVisibility() {
        if (isTocOpen) {
            tocPanel.style.display = 'flex';
            toggleTocBtn.classList.add('active');
            toggleTocBtn.style.backgroundColor = 'var(--bg-hover)';
            generateTOC();
        } else {
            tocPanel.style.display = 'none';
            toggleTocBtn.classList.remove('active');
            toggleTocBtn.style.backgroundColor = '';
        }
    }

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
        markdownEditor.scrollTop = Math.max(0, targetScrollTop - parseFloat(cs.paddingTop) - lineHeight);
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
        const currentScroll = markdownEditor.scrollTop;
        const editorHeight = markdownEditor.clientHeight;
        const targetTop = targetScrollTop - parseFloat(cs.paddingTop);

        if (targetTop < currentScroll || targetTop > currentScroll + editorHeight - lineHeight * 2) {
            markdownEditor.scrollTop = Math.max(0, targetTop - lineHeight * 2);
        }
    }

});
