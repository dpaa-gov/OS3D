#!/bin/bash
## OS3D Linux Packaging Script
## Builds a standalone compiled application using PackageCompiler create_app
##
## Usage: bash build/package.sh
##
## Prerequisites:
##   - Julia 1.11+ installed and on PATH
##   - Project dependencies installed (Pkg.instantiate)
##
## Output: dist/OS3D-v{VERSION}-linux-x86_64.tar.gz

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Version — use VERSION file if present, else fallback
if [ -f "$PROJECT_DIR/VERSION" ]; then
    VERSION=$(cat "$PROJECT_DIR/VERSION" | tr -d '[:space:]')
else
    VERSION="0.1.0"
fi

ARCH=$(uname -m)
BUNDLE_NAME="OS3D-v${VERSION}-linux-${ARCH}"
DIST_DIR="$PROJECT_DIR/dist"
COMPILED_DIR="$DIST_DIR/OS3D-compiled"
STAGE_DIR="$DIST_DIR/$BUNDLE_NAME"

echo ""
echo "╔═══════════════════════════════════════════╗"
echo "║     OS3D Linux Bundle Builder             ║"
echo "╠═══════════════════════════════════════════╣"
echo "║  Version:  $VERSION"
echo "║  Arch:     $ARCH"
echo "║  Output:   $BUNDLE_NAME.tar.gz"
echo "╚═══════════════════════════════════════════╝"
echo ""

# Step 1: Build compiled application
echo "1. Building compiled application (create_app)..."
julia --project="$PROJECT_DIR" "$SCRIPT_DIR/build_sysimage.jl"

if [ ! -d "$COMPILED_DIR" ]; then
    echo "ERROR: Compiled app build failed — $COMPILED_DIR not found"
    exit 1
fi

# Step 2: Stage the compiled app
echo "2. Staging bundle..."
rm -rf "$STAGE_DIR"
cp -r "$COMPILED_DIR" "$STAGE_DIR"

# Step 3: Copy runtime assets into the bundle
echo "3. Copying runtime assets..."
cp -r "$PROJECT_DIR/public" "$STAGE_DIR/"
cp -r "$PROJECT_DIR/views" "$STAGE_DIR/"
cp "$PROJECT_DIR/Manifest.toml" "$STAGE_DIR/share/julia/"

# Step 4: Create archive
echo "4. Creating archive..."
cd "$DIST_DIR"
tar czf "${BUNDLE_NAME}.tar.gz" "$BUNDLE_NAME"

ARCHIVE_SIZE=$(du -sh "${BUNDLE_NAME}.tar.gz" | cut -f1)

echo ""
echo "╔═══════════════════════════════════════════╗"
echo "║  Bundle created successfully!             ║"
echo "╠═══════════════════════════════════════════╣"
echo "║  Archive: dist/${BUNDLE_NAME}.tar.gz"
echo "║  Size:    $ARCHIVE_SIZE"
echo "╚═══════════════════════════════════════════╝"
echo ""
echo "To distribute:"
echo "  1. Upload ${BUNDLE_NAME}.tar.gz"
echo "  2. Users extract and run: bin/os3d"
