const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Configurar el directorio raíz que queremos explorar.
// Por defecto es el directorio padre, pero se puede pasar por argumento CLI.
// Ejemplo: node server.js /ruta/a/mi/carpeta
let ROOT_DIR = process.env.PMOS_ROOT_DIR || path.resolve(__dirname, '..');
if (process.argv[2] && !process.argv[2].startsWith('--')) {
    ROOT_DIR = path.resolve(process.cwd(), process.argv[2]);
}


// Verificar que el directorio existe
if (!fs.existsSync(ROOT_DIR) || !fs.statSync(ROOT_DIR).isDirectory()) {
    console.error(`Error: El directorio "${ROOT_DIR}" no existe o no es una carpeta válida.`);
    process.exit(1);
}
// Servir archivos estáticos del frontend
app.use(express.static(path.join(__dirname, 'public')));
// Servir node_modules para que el frontend pueda cargar xterm.css
app.use('/node_modules', express.static(path.join(__dirname, 'node_modules')));
// Middleware para parsear JSON bodies
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
            // Ignorar carpetas de sistema comunes para mantenerlo limpio
            if (file === 'node_modules' || file === 'markdown-viewer') {
                continue;
            }

            const fullPath = path.join(dirPath, file);
            try {
                const stat = fs.statSync(fullPath);

                if (stat.isDirectory()) {
                    item.children.push(getDirectoryTree(fullPath, basePath));
                } else if (file.endsWith('.md')) { // Solo incluir archivos Markdown
                    item.children.push({
                        name: file,
                        path: path.relative(ROOT_DIR, fullPath),
                        type: 'file',
                        size: stat.size
                    });
                }
            } catch (err) {
                console.error(`Error reading stat for ${fullPath}:`, err.message);
            }
        }

        // Ordenar: primero directorios, luego archivos alfabéticamente
        item.children.sort((a, b) => {
            if (a.type === b.type) {
                return a.name.localeCompare(b.name);
            }
            return a.type === 'directory' ? -1 : 1;
        });

    } catch (err) {
        console.error(`Error reading directory ${dirPath}:`, err.message);
    }

    return item;
}

// API: Obtener el árbol de archivos Markdown
app.get('/api/tree', (req, res) => {
    try {
        const tree = getDirectoryTree(ROOT_DIR);
        res.json(tree);
    } catch (err) {
        res.status(500).json({ error: 'Failed to generate directory tree', details: err.message });
    }
});

// API: Leer el contenido de un archivo Markdown
app.get('/api/file', (req, res) => {
    const filePath = req.query.path;

    if (!filePath) {
        return res.status(400).json({ error: 'File path parameter is required' });
    }

    // Prevenir directory traversal
    const safePath = path.resolve(ROOT_DIR, filePath);
    if (!safePath.startsWith(ROOT_DIR)) {
        return res.status(403).json({ error: 'Access denied: Directory traversal detected' });
    }

    try {
        const content = fs.readFileSync(safePath, 'utf8');
        res.type('text/plain').send(content);
    } catch (err) {
        console.error(`Error reading file ${safePath}:`, err.message);
        res.status(404).json({ error: 'File not found or cannot be read' });
    }
});

// API: Guardar el contenido de un archivo Markdown
app.post('/api/file', (req, res) => {
    const filePath = req.body.path;
    const content = req.body.content;

    if (!filePath || content === undefined) {
        return res.status(400).json({ error: 'File path and content are required' });
    }

    // Prevenir directory traversal
    const safePath = path.resolve(ROOT_DIR, filePath);
    if (!safePath.startsWith(ROOT_DIR)) {
        return res.status(403).json({ error: 'Access denied: Directory traversal detected' });
    }

    try {
        fs.writeFileSync(safePath, content, 'utf8');
        res.json({ success: true, message: 'File saved successfully' });
    } catch (err) {
        console.error(`Error saving file ${safePath}:`, err.message);
        res.status(500).json({ error: 'Error saving file', details: err.message });
    }
});

// API: Crear una nueva carpeta
app.post('/api/folder', (req, res) => {
    const folderPath = req.body.path;

    if (!folderPath) {
        return res.status(400).json({ error: 'Folder path is required' });
    }

    // Prevenir directory traversal
    const safePath = path.resolve(ROOT_DIR, folderPath);
    if (!safePath.startsWith(ROOT_DIR)) {
        return res.status(403).json({ error: 'Access denied: Directory traversal detected' });
    }

    try {
        if (!fs.existsSync(safePath)) {
            fs.mkdirSync(safePath, { recursive: true });
            res.json({ success: true, message: 'Folder created successfully' });
        } else {
            res.status(400).json({ error: 'Folder already exists' });
        }
    } catch (err) {
        console.error(`Error creating folder ${safePath}:`, err.message);
        res.status(500).json({ error: 'Error creating folder', details: err.message });
    }
});

// API: Set ROOT_DIR dynamically (Para SublimeOS Electron)
app.post('/api/set-root', (req, res) => {
    const { newRoot } = req.body;
    if (!newRoot || !fs.existsSync(newRoot) || !fs.statSync(newRoot).isDirectory()) {
        return res.status(400).json({ error: 'Directorio inválido o inexistente' });
    }
    ROOT_DIR = newRoot;
    res.json({ success: true, rootDir: ROOT_DIR });
});

const server = app.listen(PORT, () => {
    console.log(`Markdown Viewer server running at:`);
    console.log(`- http://localhost:${PORT}`);
    console.log(`- Targeting directory: ${ROOT_DIR}`);
});

module.exports = Object.assign(server, {
    getRootDir: () => ROOT_DIR
});
