const path = require('path');
const dotenv = require('dotenv');
const { execSync } = require('child_process');
const fs = require('fs');

// Load environment variables from .env file in the root of the project
dotenv.config({ path: path.join(__dirname, '..', '.env') });

exports.default = async function notarizing(context) {
    const { electronPlatformName, appOutDir } = context;
    if (electronPlatformName !== 'darwin') {
        return;
    }

    const appleId = process.env.APPLE_ID;
    const appleIdPassword = process.env.APPLE_APP_SPECIFIC_PASSWORD;
    const teamId = process.env.APPLE_TEAM_ID;

    if (!appleId || !appleIdPassword || !teamId) {
        console.warn('[Notarize] Skipping: missing APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD or APPLE_TEAM_ID in .env');
        return;
    }

    const appName = context.packager.appInfo.productFilename;
    const appPath = path.join(appOutDir, `${appName}.app`);
    const zipPath = `${appPath}.zip`;

    console.log(`[Notarize] Submitting ${appName} to Apple Notary Service...`);

    try {
        // Create ZIP — ditto preserves all necessary metadata for notarization
        execSync(`ditto -c -k --sequesterRsrc --keepParent "${appPath}" "${zipPath}"`, { stdio: 'inherit' });

        // Submit via xcrun notarytool (bypasses @electron/notarize's codesign --strict pre-check)
        execSync(
            `xcrun notarytool submit "${zipPath}" --apple-id "${appleId}" --password "${appleIdPassword}" --team-id "${teamId}" --wait`,
            { stdio: 'inherit' }
        );

        // Staple the notarization ticket to the app bundle
        execSync(`xcrun stapler staple "${appPath}"`, { stdio: 'inherit' });

        console.log('[Notarize] Notarization and stapling complete!');
    } catch (error) {
        console.error('[Notarize] Failed:', error.message);
        throw error;
    } finally {
        // Clean up the temp ZIP
        try { fs.unlinkSync(zipPath); } catch (_) {}
    }
};
