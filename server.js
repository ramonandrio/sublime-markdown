const express = require('express');
const fs = require('fs');
const path = require('path');

function createServer(initialDir) {
    const app = express();
    // Start on port 0 to automatically let the OS assign an available random port
    const PORT = 0;

    // Configurar el directorio raíz local para esta instancia exacta del servidor.
    let ROOT_DIR = initialDir || process.env.PMOS_ROOT_DIR || path.resolve(__dirname, '..');

    if (process.argv[2] && !process.argv[2].startsWith('--')) {
        ROOT_DIR = path.resolve(process.cwd(), process.argv[2]);
    }

    if (!fs.existsSync(ROOT_DIR) || !fs.statSync(ROOT_DIR).isDirectory()) {
        console.warn(`Aviso: El directorio principal "${ROOT_DIR}" no existe o no es carpeta.`);
    }

    // Servir archivos estáticos del frontend
    app.use(express.static(path.join(__dirname, 'public')));
    app.use('/node_modules', express.static(path.join(__dirname, 'node_modules')));
    app.use(express.json());

    // Función recursiva para obtener el árbol de directorios
    function getDirectoryTree(dirPath, basePath = '') {
        const relativePath = path.relative(ROOT_DIR, dirPath);
        const item = {
            name: path.basename(dirPath) || ROOT_DIR,
            path: relativePath,
            type: 'directory',
            children: []
        };

        try {
            const files = fs.readdirSync(dirPath);
            for (const file of files) {
                if (file === 'node_modules' || file === 'markdown-viewer') continue;

                const fullPath = path.join(dirPath, file);
                try {
                    const stat = fs.statSync(fullPath);
                    if (stat.isDirectory()) {
                        item.children.push(getDirectoryTree(fullPath, basePath));
                    } else if (file.endsWith('.md') || file.endsWith('.html')) {
                        item.children.push({
                            name: file,
                            path: path.relative(ROOT_DIR, fullPath),
                            type: 'file',
                            size: stat.size
                        });
                    }
                } catch (e) { }
            }
        } catch (e) { }

        item.children.sort((a, b) => {
            if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
            return a.name.localeCompare(b.name);
        });
        return item;
    }

    app.get('/api/tree', (req, res) => {
        try {
            const tree = getDirectoryTree(ROOT_DIR);
            res.json(tree);
        } catch (err) {
            res.status(500).json({ error: 'Error reading directory structure', details: err.message });
        }
    });

    app.get('/api/file', (req, res) => {
        const filePath = req.query.path;
        if (!filePath) return res.status(400).json({ error: 'File path is required' });

        const safePath = path.resolve(ROOT_DIR, filePath);
        if (!safePath.startsWith(ROOT_DIR)) {
            return res.status(403).json({ error: 'Access denied: Directory traversal detected' });
        }

        try {
            if (fs.existsSync(safePath) && fs.statSync(safePath).isFile()) {
                const content = fs.readFileSync(safePath, 'utf8');
                res.setHeader('Content-Type', 'text/plain; charset=utf-8');
                res.send(content);
            } else {
                res.status(404).json({ error: 'File not found' });
            }
        } catch (err) {
            res.status(500).json({ error: 'Error reading file', details: err.message });
        }
    });

    app.post('/api/file', (req, res) => {
        const { path: filePath, content } = req.body;
        if (!filePath || content === undefined) return res.status(400).json({ error: 'File path and content are required' });

        const safePath = path.resolve(ROOT_DIR, filePath);
        if (!safePath.startsWith(ROOT_DIR)) return res.status(403).json({ error: 'Access denied' });

        try {
            fs.writeFileSync(safePath, content, 'utf8');
            res.json({ success: true, message: 'File saved successfully' });
        } catch (err) {
            res.status(500).json({ error: 'Error saving file', details: err.message });
        }
    });

    app.post('/api/folder', (req, res) => {
        const folderPath = req.body.path;
        if (!folderPath) return res.status(400).json({ error: 'Folder path is required' });

        const safePath = path.resolve(ROOT_DIR, folderPath);
        if (!safePath.startsWith(ROOT_DIR)) return res.status(403).json({ error: 'Access denied' });

        try {
            if (!fs.existsSync(safePath)) {
                fs.mkdirSync(safePath, { recursive: true });
                res.json({ success: true, message: 'Folder created successfully' });
            } else {
                res.status(400).json({ error: 'Folder already exists' });
            }
        } catch (err) {
            res.status(500).json({ error: 'Error creating folder', details: err.message });
        }
    });

    app.post('/api/set-root', (req, res) => {
        const { newRoot } = req.body;
        if (!newRoot || !fs.existsSync(newRoot) || !fs.statSync(newRoot).isDirectory()) {
            return res.status(400).json({ error: 'Directorio inválido o inexistente' });
        }
        ROOT_DIR = newRoot;
        res.json({ success: true, rootDir: ROOT_DIR });
    });

    app.post('/api/create-compassai-workspace', (req, res) => {
        const { workspaceName } = req.body;
        if (!workspaceName) return res.status(400).json({ error: 'Falta el nombre del workspace' });

        // Crea el workspace como carpeta hermana al ROOT_DIR actual por defecto para la versión web
        const parentDir = path.resolve(ROOT_DIR, '..');
        const targetDir = path.join(parentDir, workspaceName);
        const templateDir = path.join(__dirname, 'templates', 'compassai');

        try {
            if (fs.existsSync(targetDir)) {
                return res.status(400).json({ error: 'La carpeta ya existe' });
            }
            if (!fs.existsSync(templateDir)) {
                return res.status(500).json({ error: 'La plantilla no existe en el servidor' });
            }
            fs.cpSync(templateDir, targetDir, { recursive: true });
            res.json({ success: true, path: targetDir });
        } catch (err) {
            res.status(500).json({ error: 'Error al crear la plantilla', details: err.message });
        }
    });

    // Provide the getter on the instance to query the state from main.js
    app.getRootDir = () => ROOT_DIR;

    return new Promise((resolve, reject) => {
        const server = app.listen(PORT, (err) => {
            if (err) return reject(err);
            const actualPort = server.address().port;
            console.log(`Markdown Viewer sub-server running at http://localhost:${actualPort} - Target dir: ${ROOT_DIR}`);

            // Adjuntar funciones helper
            Object.assign(server, {
                getRootDir: () => ROOT_DIR,
                port: actualPort
            });
            resolve(server);
        });
    });
}

// Fallback for direct node starts (like local testing)
if (require.main === module) {
    createServer().then(serverInstance => {
        console.log(`Fallback server started on port ${serverInstance.port}`);
    }).catch(console.error);
}

module.exports = { createServer };
