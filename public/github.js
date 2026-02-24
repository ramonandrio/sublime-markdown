// --- MÓDULO GITHUB API (con Personal Access Token) ---
// Simplificado: el usuario pega su token y listo

const GitHubAPI = (() => {
    const TOKEN_KEY = 'md_viewer_github_token';

    function getToken() {
        return localStorage.getItem(TOKEN_KEY);
    }

    function setToken(token) {
        localStorage.setItem(TOKEN_KEY, token);
    }

    function clearToken() {
        localStorage.removeItem(TOKEN_KEY);
    }

    function isAuthenticated() {
        return !!getToken();
    }

    // Llamada genérica a la API de GitHub
    async function apiCall(endpoint, options = {}) {
        const token = getToken();
        const headers = {
            'Accept': 'application/vnd.github.v3+json',
            ...options.headers
        };
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const response = await fetch(`https://api.github.com${endpoint}`, {
            cache: 'no-store',
            ...options,
            headers
        });

        if (response.status === 401) {
            clearToken();
            throw new Error('Token inválido o expirado. Por favor, introduce uno nuevo.');
        }

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.message || `Error HTTP ${response.status}`);
        }

        return response.json();
    }

    async function getUser() {
        return apiCall('/user');
    }

    async function listRepos(page = 1, perPage = 100) {
        return apiCall(`/user/repos?sort=updated&per_page=${perPage}&page=${page}&visibility=all&affiliation=owner,collaborator,organization_member`);
    }

    async function getRepoTree(owner, repo, branch = 'main') {
        try {
            const data = await apiCall(`/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`);
            return buildTreeFromGitHub(data.tree, repo);
        } catch (e) {
            if (branch === 'main') {
                const data = await apiCall(`/repos/${owner}/${repo}/git/trees/master?recursive=1`);
                return buildTreeFromGitHub(data.tree, repo);
            }
            throw e;
        }
    }

    function buildTreeFromGitHub(flatTree, repoName) {
        const root = { name: repoName, path: '', type: 'directory', children: [] };

        const mdFiles = flatTree.filter(item =>
            item.type === 'blob' && item.path.endsWith('.md')
        );

        for (const file of mdFiles) {
            const parts = file.path.split('/');
            let current = root;

            for (let i = 0; i < parts.length - 1; i++) {
                let dir = current.children.find(c => c.name === parts[i] && c.type === 'directory');
                if (!dir) {
                    dir = { name: parts[i], path: parts.slice(0, i + 1).join('/'), type: 'directory', children: [] };
                    current.children.push(dir);
                }
                current = dir;
            }

            current.children.push({
                name: parts[parts.length - 1],
                path: file.path,
                type: 'file',
                sha: file.sha
            });
        }

        sortTree(root);
        return root;
    }

    function sortTree(node) {
        if (node.children) {
            node.children.sort((a, b) => {
                if (a.type === b.type) return a.name.localeCompare(b.name);
                return a.type === 'directory' ? -1 : 1;
            });
            node.children.forEach(sortTree);
        }
    }

    // Función auxiliar para decodificar Base64 a UTF-8 de forma segura
    function base64ToUtf8(base64) {
        const binString = atob(base64);
        const bytes = new Uint8Array(binString.length);
        for (let i = 0; i < binString.length; i++) {
            bytes[i] = binString.charCodeAt(i);
        }
        return new TextDecoder('utf-8').decode(bytes);
    }

    // Función auxiliar para codificar UTF-8 a Base64 de forma segura
    function utf8ToBase64(text) {
        const bytes = new TextEncoder().encode(text);
        const binString = String.fromCodePoint(...bytes);
        return btoa(binString);
    }

    async function getFileContent(owner, repo, path) {
        const data = await apiCall(`/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`);
        return {
            content: base64ToUtf8(data.content),
            sha: data.sha
        };
    }

    async function saveFile(owner, repo, path, content, sha, message = 'Update via Markdown Viewer') {
        return apiCall(`/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message,
                content: utf8ToBase64(content),
                sha
            })
        });
    }

    async function searchCode(owner, repo, query) {
        // Forzamos buscar solo en archivos .md de este repo
        const q = encodeURIComponent(`${query} in:file repo:${owner}/${repo} extension:md`);
        return apiCall(`/search/code?q=${q}&per_page=20`);
    }

    return {
        getToken, setToken, clearToken, isAuthenticated,
        getUser, listRepos, getRepoTree, getFileContent, saveFile, searchCode
    };
})();
