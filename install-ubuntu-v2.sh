#!/bin/bash

# Game Request Generator v2.0 - Ubuntu Installation Script
# This script installs the Game Request Generator v2.0 desktop application on Ubuntu

echo "🎮 Installing Game Request Generator v2.0 for Ubuntu..."
echo "ℹ️  Note: Package shows version 0.1.0 but contains all v2.0 features and improvements"

# Check if running on Ubuntu/Debian
if ! command -v dpkg &> /dev/null; then
    echo "❌ This installer is designed for Ubuntu/Debian systems only."
    exit 1
fi

# Path to the .deb package (this is functionally v2.0 with all improvements)
DEB_PACKAGE="src-tauri/target/release/bundle/deb/game-request-generator_0.1.0_amd64.deb"

# Check if package exists
if [ ! -f "$DEB_PACKAGE" ]; then
    echo "❌ Package not found: $DEB_PACKAGE"
    echo "Please ensure the application has been built first."
    exit 1
fi

# Install the package
echo "📦 Installing package..."
sudo dpkg -i "$DEB_PACKAGE"

# Install dependencies if needed
sudo apt-get install -f -y

echo "✅ Installation complete!"
echo ""
echo "🚀 To run the application:"
echo "   - Search for 'Game Request Generator v2' in your applications menu"
echo "   - Or run: game-request-generator"
echo ""
echo "📋 This v2.0 package includes:"
echo "   ✅ Fixed duplicate purchase event requests"
echo "   ✅ Calendar and time pickers for better UX"
echo "   ✅ Proper time_spent scaling across all events"
echo "   ✅ Event grouping by tokens"
echo "   ✅ Improved performance and code quality"
echo "   ✅ All the latest improvements and bug fixes"
