const { execSync } = require('child_process');
const path = require('path');

exports.default = async function (context) {
    if (context.electronPlatformName !== 'darwin') {
        return;
    }
    const appName = context.packager.appInfo.productFilename;
    const appPath = path.join(context.appOutDir, `${appName}.app`);
    console.log(`[Hooks] Deep cleaning extended attributes in ${appPath}...`);

    try {
        // Find ALL files and delete resource forks explicitly using bash string replacement instead of xargs
        // We use a bash script to handle paths with spaces/parentheses perfectly and avoid xargs limits
        const script = `
        find "${appPath}" -type f -exec sh -c '
            xattr -c "$1" 2>/dev/null
            xattr -d com.apple.FinderInfo "$1" 2>/dev/null
            xattr -d com.apple.ResourceFork "$1" 2>/dev/null
        ' sh {} \\;
        `;
        execSync(script);

        // Also do a recursive clear on the root app bundle
        execSync(`xattr -cr "${appPath}" 2>/dev/null || true`);

        // Remove AppleDouble (._*) resource fork files — codesign rejects them
        execSync(`find "${appPath}" -name "._*" -delete 2>/dev/null || true`);
        console.log('[Hooks] Extended attributes and AppleDouble files fully cleared.');
    } catch (e) {
        console.warn('[Hooks] Non-fatal error during xattr cleanup:', e.message);
    }
};
