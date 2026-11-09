#!/usr/bin/env bash
# Compile l'appli Facebook calme, l'installe sur le téléphone branché en USB, et l'ouvre.
#   ./install.sh            -> ouvre l'appli
#   ./install.sh reglages   -> ouvre directement les réglages Mode calme
set -euo pipefail
cd "$(dirname "$0")"

./gradlew assembleDebug --console=plain -q

echo "En attente du téléphone (débogage USB autorisé)..."
adb wait-for-usb-device
adb install -r app/build/outputs/apk/debug/app-debug.apk

if [ "${1:-}" = "reglages" ]; then
  adb shell am start -a fr.perso.calmbook.SETTINGS -n fr.perso.calmbook/.MainActivity
else
  adb shell am start -n fr.perso.calmbook/.MainActivity
fi
