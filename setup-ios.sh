#!/usr/bin/env bash
# ============================================================
# Deiza — iOS Setup Script (run on macOS with Xcode installed)
# ============================================================
set -euo pipefail

echo "🚀 Deiza iOS Setup"
echo "===================="

# Check prerequisites
command -v node >/dev/null 2>&1 || { echo "❌ Node.js not found. Install from https://nodejs.org"; exit 1; }
command -v npm  >/dev/null 2>&1 || { echo "❌ npm not found."; exit 1; }
xcode-select -p >/dev/null 2>&1 || { echo "❌ Xcode not found. Install from App Store."; exit 1; }
command -v pod >/dev/null 2>&1 || { echo "❌ CocoaPods not found. Run: sudo gem install cocoapods"; exit 1; }

NODE_VER=$(node -v | tr -d 'v' | cut -d. -f1)
if [ "$NODE_VER" -lt 18 ]; then
  echo "❌ Node.js 18+ required. Current: $(node -v)"; exit 1
fi

echo "✅ Prerequisites OK"
echo ""

# 1. Install dependencies
echo "📦 Installing npm packages..."
npm install

# 2. Build web app
echo "🔨 Building web app..."
npm run build

# 3. Add iOS platform (skip if already added)
if [ ! -d "ios" ]; then
  echo "📱 Adding iOS platform..."
  npx cap add ios
else
  echo "📱 iOS platform already present — syncing..."
fi

# 4. Generate icon & splash assets
echo "🎨 Generating iOS icons and splash screens..."
npx @capacitor/assets generate --ios

# 5. Merge Info.plist permissions
echo "🔒 Adding iOS permissions to Info.plist..."
PLIST="ios/App/App/Info.plist"
if [ -f "$PLIST" ]; then
  # Use PlistBuddy to add keys if not present
  PB="/usr/libexec/PlistBuddy"

  add_if_missing() {
    local key="$1"; local type="$2"; local val="$3"
    if ! $PB -c "Print :$key" "$PLIST" >/dev/null 2>&1; then
      $PB -c "Add :$key $type $val" "$PLIST"
      echo "  + $key"
    fi
  }

  add_if_missing "NSMicrophoneUsageDescription" "string" "Deiza necesita acceso al micrófono para grabar mensajes de voz."
  add_if_missing "NSCameraUsageDescription"     "string" "Deiza necesita acceso a la cámara para adjuntar fotos a tus mensajes."
  add_if_missing "NSPhotoLibraryUsageDescription"    "string" "Deiza necesita acceso a tus fotos para adjuntarlas a tus mensajes."
  add_if_missing "NSPhotoLibraryAddUsageDescription" "string" "Deiza puede guardar imágenes en tu biblioteca de fotos."

  # Background modes for push notifications
  if ! $PB -c "Print :UIBackgroundModes" "$PLIST" >/dev/null 2>&1; then
    $PB -c "Add :UIBackgroundModes array" "$PLIST"
    $PB -c "Add :UIBackgroundModes:0 string fetch" "$PLIST"
    $PB -c "Add :UIBackgroundModes:1 string remote-notification" "$PLIST"
    echo "  + UIBackgroundModes (fetch, remote-notification)"
  fi
else
  echo "  ⚠️  Info.plist not found — run 'npx cap add ios' first"
fi

# 6. Sync Capacitor
echo "🔄 Syncing Capacitor..."
npx cap sync ios

# 7. Done
echo ""
echo "✅ iOS setup complete!"
echo ""
echo "Next steps:"
echo "  1. Open Xcode:          npx cap open ios"
echo "  2. Select your team:    Xcode → Signing & Capabilities → Team"
echo "  3. Set Bundle ID:       org.deiza.app (or your custom ID)"
echo "  4. Connect your iPhone and tap ▶ Run"
echo "  5. For App Store:       Product → Archive → Distribute App"
