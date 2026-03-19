#!/bin/bash
set -e
cd /Users/ramonandrio/Documents/SublimeOS/markdown-viewer

echo "0. Limpiando volúmenes CompassAI previos..."
hdiutil eject "/Volumes/CompassAI" 2>/dev/null || true
hdiutil eject "/Volumes/CompassAI 1" 2>/dev/null || true

echo "1. Creando imagen escribible..."
rm -f dist/CompassAI-writable.dmg
hdiutil create -size 400m -volname "CompassAI" -fs HFS+J dist/CompassAI-writable.dmg

echo "2. Montando..."
MOUNT_POINT=$(hdiutil attach dist/CompassAI-writable.dmg | grep "Apple_HFS" | sed 's/.*Apple_HFS[[:space:]]*//')
echo "   Montado en: $MOUNT_POINT"

echo "3. Copiando app..."
ditto dist/mac-arm64/CompassAI.app "$MOUNT_POINT/CompassAI.app"
ln -s /Applications "$MOUNT_POINT/Applications"

echo "4. Desmontando..."
hdiutil detach "$MOUNT_POINT"

echo "5. Convirtiendo a comprimido..."
hdiutil convert dist/CompassAI-writable.dmg -format UDZO -o dist/CompassAI-arm64-v2.dmg -ov

echo "6. Limpiando..."
rm dist/CompassAI-writable.dmg

echo "DMG listo: dist/CompassAI-arm64-v2.dmg"
