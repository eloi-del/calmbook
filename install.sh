#!/usr/bin/env bash
# Builds the calm Facebook app, installs it on the phone plugged in over USB, and opens it.
#   ./install.sh            -> opens the app
#   ./install.sh settings   -> opens the Calm mode panel directly
set -euo pipefail
cd "$(dirname "$0")"

./gradlew assembleDebug --console=plain -q

echo "Waiting for the phone (USB debugging allowed)..."
adb wait-for-usb-device
adb install -r app/build/outputs/apk/debug/app-debug.apk

case "${1:-}" in
  settings|reglages)
    adb shell am start -a fr.perso.calmbook.SETTINGS -n fr.perso.calmbook/.MainActivity ;;
  *)
    adb shell am start -n fr.perso.calmbook/.MainActivity ;;
esac
