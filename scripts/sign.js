'use strict';

/**
 * sign.js — Custom codesign wrapper for macOS 14/15 (Sonoma/Sequoia).
 *
 * On macOS 14+, the kernel automatically adds `com.apple.provenance` to
 * extracted files. Codesign with --options runtime rejects this attribute
 * as "detritus". Using --no-strict skips that check while keeping the
 * rest of the signing process (timestamp, hardened runtime, entitlements).
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const IDENTITY = 'Developer ID Application: Ramon Andrio (HJ64CW9JJ2)';

// Entitlements shipped with electron-builder (covers all Electron helpers)
const DEFAULT_ENTITLEMENTS = path.join(
    __dirname,
    '../node_modules/app-builder-lib/templates/entitlements.mac.plist'
);

exports.default = async function sign(configuration) {
    const filePath = configuration.path;

    // Determine entitlements: use the file-specific ones if provided, else default
    const entitlements = configuration.entitlements || DEFAULT_ENTITLEMENTS;

    // Clear whatever xattrs we can before signing
    try {
        execSync(`xattr -cr "${filePath}" 2>/dev/null || true`);
    } catch (_) {}

    const cmd = [
        'codesign',
        '--sign', `"${IDENTITY}"`,
        '--force',
        '--timestamp',
        '--options', 'runtime',
        '--no-strict',                  // ignore com.apple.provenance on macOS 14+
        '--entitlements', `"${entitlements}"`,
        `"${filePath}"`
    ].join(' ');

    execSync(cmd, { stdio: 'inherit' });
};
