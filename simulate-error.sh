#!/bin/bash

# Script to simulate the Electron Framework loading error by removing symlinks

# Find the electron directory (works with any version)
ELECTRON_DIR=$(find node_modules/.pnpm -maxdepth 2 -name "electron@*" -type d | head -1)

if [ -z "$ELECTRON_DIR" ]; then
    echo "❌ Electron not found"
    exit 1
fi

ELECTRON_BASE="$ELECTRON_DIR/node_modules/electron/dist/Electron.app/Contents/Frameworks"

echo "Simulating Electron Framework error..."
echo "This will remove critical symlinks in the framework directories"

# Remove all framework symlinks
for framework_dir in "$ELECTRON_BASE"/*.framework; do
    if [ -d "$framework_dir" ]; then
        framework_name=$(basename "$framework_dir" .framework)
        
        # Remove main framework symlink
        if [ -L "$framework_dir/$framework_name" ]; then
            rm "$framework_dir/$framework_name"
            echo "✓ Removed symlink: $framework_name"
        fi
        
        # Remove Current symlink in Versions
        if [ -L "$framework_dir/Versions/Current" ]; then
            rm "$framework_dir/Versions/Current"
            echo "✓ Removed symlink: Versions/Current"
        fi
        
        # Remove Resources and Helpers symlinks
        for link in "Resources" "Helpers"; do
            if [ -L "$framework_dir/$link" ]; then
                rm "$framework_dir/$link"
                echo "✓ Removed symlink: $link"
            fi
        done
    fi
done

echo ""
echo "Error condition created!"
echo "To verify the error, run: pnpm dev:desktop"
echo "To fix, run: pnpm fix:electron OR ./fix-electron.sh"