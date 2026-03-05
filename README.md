# CompassAI — Guía de desarrollo y distribución

## Ejecutar en local

```bash
npm install
npm start          # Servidor Express (modo web, sin Electron)
npm run start:app  # App Electron completa
```

## Generar un build

### Build de test (sin firma de Apple)

Para pruebas propias o compartir con colegas de confianza. No requiere cuenta de Apple Developer.

```bash
npm run build:test
```

Genera `dist/CompassAI-test.dmg`. Al abrirlo, la primera vez hay que hacer **clic derecho → Abrir** para saltarse Gatekeeper (la app no está notarizada).

**Qué hace internamente el script:**
1. Empaqueta con electron-builder usando `electron-builder.test.config.js` (sin notarización, sin hardenedRuntime)
2. Limpia extended attributes (xattrs) del `.app` con `xattr -cr`
3. Firma con ad-hoc signing (`codesign --sign -`), suficiente para ejecutar localmente
4. Crea el DMG con `hdiutil`

### Build de producción (notarizado, para distribución real)

Requiere un certificado de **Apple Developer** instalado en el Mac y las credenciales en `.env`.

```bash
npm run build:mac
```

Genera un DMG firmado y notarizado en `dist/`. Tus colegas pueden instalarlo sin ningún aviso de Gatekeeper.

**Credenciales necesarias en `.env`:**
```
APPLE_ID=tu@email.com
APPLE_APP_SPECIFIC_PASSWORD=xxxx-xxxx-xxxx-xxxx
APPLE_TEAM_ID=XXXXXXXXXX
```

El `.env` está en `.gitignore` — nunca lo subas al repositorio.

## Estructura del proyecto

```
markdown-viewer/
├── main.js                         # Main process de Electron (IPC, ventanas, terminal)
├── server.js                       # Servidor Express por ventana (puerto aleatorio)
├── terminal-manager.js             # Gestión de PTY con node-pty
├── public/
│   ├── index.html                  # UI principal
│   ├── app.js                      # Lógica frontend
│   ├── chat.js                     # TerminalController (xterm.js)
│   └── styles.css
├── scripts/
│   ├── afterExtract.js             # Hook: limpia xattrs tras extraer Electron
│   ├── clear-xattr.js              # Hook: limpia xattrs tras empaquetar
│   └── notarize.js                 # Hook: notariza con Apple (solo build:mac)
├── templates/compassai/            # Workspace PM-OS preconfigurado que se copia al crear workspace nuevo
├── build/
│   └── icon.icns                   # Icono de la app
├── electron-builder.test.config.js # Config de build de test (en .gitignore)
└── .env                            # Credenciales Apple (en .gitignore)
```

## Notas conocidas

### electron-builder 26 + macOS Sequoia (15.x)

Hay un conjunto de bugs conocidos al hacer build en macOS 14/15 con electron-builder 26. Estos son los workarounds aplicados:

**1. Rutas de hooks deben llevar `./`**
Las rutas de `afterExtract`, `afterPack` y `afterSign` en `package.json` deben empezar por `./`. Sin él, electron-builder 26 interpreta la ruta como un módulo de Node.js, intenta importar el directorio raíz del proyecto, carga `main.js` fuera de contexto Electron, y explota.

**2. `com.apple.FinderInfo` en binarios de Electron**
macOS 14/15 añade automáticamente `com.apple.FinderInfo` a los directorios `.app` cada vez que son accedidos. Esto hace que `codesign` falle con "resource fork, Finder information, or similar detritus not allowed". Los workarounds aplicados:
- `"additionalArguments": ["--no-strict"]` en la config mac para que el signing ignore este atributo
- `"strictVerify": false` para deshabilitar la verificación post-signing de electron-builder
- `"notarize": false` para deshabilitar la notarización interna de electron-builder (que también corre `codesign --strict`)
- El hook `afterSign` (`notarize.js`) usa `xcrun notarytool` directamente en lugar de `@electron/notarize`, que internamente también corre `codesign --strict`

**3. Módulos nativos**
`node-pty` se recompila automáticamente para la versión de Electron al hacer el build. No hace falta ejecutar `electron-rebuild` manualmente.

**4. Multi-ventana**
Cada ventana levanta su propio servidor Express en un puerto aleatorio. Al cerrar la ventana, el servidor se destruye.
