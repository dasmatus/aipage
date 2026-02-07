#!/bin/bash
# Setup script for Safari Web Extension
# This script generates an Xcode project from the built extension

set -e

echo "Setting up Safari Web Extension..."

# Check if we're on macOS
if [[ "$OSTYPE" != "darwin"* ]]; then
    echo "Safari extension setup requires macOS"
    exit 1
fi

# Check if Xcode command line tools are installed
if ! command -v xcrun &> /dev/null; then
    echo "Xcode command line tools not found. Install with: xcode-select --install"
    exit 1
fi

# Ensure Safari build exists
if [ ! -d "dist-safari" ]; then
    echo "Building for Safari first..."
    bun run build:safari
fi

# Create safari directory if it doesn't exist
mkdir -p safari

# Generate Xcode project
echo "Generating Xcode project..."
xcrun safari-web-extension-converter \
    dist-safari \
    --app-name "EduPage AI Sidebar" \
    --bundle-identifier "dev.hesburger.edupage-ai-sidebar" \
    --macos-only \
    --project-location safari \
    --rebuild

echo "Safari extension Xcode project created in safari/"
echo ""
echo "Next steps:"
echo "1. Open the Xcode project: open safari/EduPage\ AI\ Sidebar.xcodeproj"
echo "2. Build and run the project in Xcode"
echo "3. Enable the extension in Safari preferences"
echo ""
echo "Note: For App Store distribution, you'll need an Apple Developer account"
