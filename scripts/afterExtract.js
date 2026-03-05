const { execSync } = require('child_process');

exports.default = async function (context) {
    if (context.electronPlatformName !== 'darwin') {
        return;
    }

    // context.appOutDir in afterExtract points to the extracted electron app bundle directly
    // e.g. dist/mac-arm64/Electron.app or similar
    console.log(`[Hooks] afterExtract - Deep cleaning extended attributes in ${context.appOutDir}...`);

    try {
        const script = `
        find "${context.appOutDir}" -type f -exec sh -c '
            xattr -c "$1" 2>/dev/null
            xattr -d com.apple.FinderInfo "$1" 2>/dev/null
            xattr -d com.apple.ResourceFork "$1" 2>/dev/null
        ' sh {} \\;
        `;
        execSync(script);
        execSync(`xattr -cr "${context.appOutDir}" 2>/dev/null || true`);
        console.log('[Hooks] afterExtract - Extended attributes fully cleared.');
    } catch (e) {
        console.warn('[Hooks] afterExtract - Non-fatal error during xattr cleanup:', e.message);
    }
};
