#!/bin/bash
## OS3D Linux Packaging Script
## Creates a self-contained distributable bundle
##
## Usage: bash build/package.sh
##
## Prerequisites:
##   - Julia installed and on PATH
##   - Project dependencies installed (Pkg.instantiate)
##   - Sysimage already built (julia --project=. build/build_sysimage.jl)
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

# Step 1: Build sysimage
echo "1. Building sysimage..."
mkdir -p "$DIST_DIR"
julia --project="$PROJECT_DIR" "$SCRIPT_DIR/build_sysimage.jl"

# Check sysimage exists
SYSIMAGE="$DIST_DIR/os3d_sysimage.so"
if [ ! -f "$SYSIMAGE" ]; then
    echo "ERROR: Sysimage build failed — $SYSIMAGE not found"
    exit 1
fi

# Clean staging directory
rm -rf "$STAGE_DIR"
mkdir -p "$STAGE_DIR"

echo "2. Copying application source..."
for item in app.jl routes.jl Project.toml Manifest.toml icp lib views public CITATION.cff README.md; do
    if [ -e "$PROJECT_DIR/$item" ]; then
        cp -r "$PROJECT_DIR/$item" "$STAGE_DIR/"
    fi
done

echo "2. Copying sysimage..."
mkdir -p "$STAGE_DIR/dist"
cp "$SYSIMAGE" "$STAGE_DIR/dist/"

echo "3. Copying launcher..."
cp "$SCRIPT_DIR/launcher.sh" "$STAGE_DIR/launcher.sh"
chmod +x "$STAGE_DIR/launcher.sh"
cp "$SCRIPT_DIR/OS3D.desktop" "$STAGE_DIR/OS3D.desktop"
chmod +x "$STAGE_DIR/OS3D.desktop"

echo "4. Bundling Julia runtime..."
JULIA_HOME=$(julia -e 'print(Sys.BINDIR)')
JULIA_BASE=$(dirname "$JULIA_HOME")

mkdir -p "$STAGE_DIR/julia"
cp -r "$JULIA_BASE/bin" "$STAGE_DIR/julia/"
cp -r "$JULIA_BASE/lib" "$STAGE_DIR/julia/"
cp -r "$JULIA_BASE/share" "$STAGE_DIR/julia/"
if [ -d "$JULIA_BASE/include" ]; then
    cp -r "$JULIA_BASE/include" "$STAGE_DIR/julia/"
fi

echo "5. Copying package depot (only required packages)..."
DEPOT_PATH=$(julia -e 'print(first(DEPOT_PATH))')

# Get the list of packages actually used by this project
REQUIRED_PKGS=$(julia --project="$PROJECT_DIR" -e '
    using Pkg
    deps = Pkg.dependencies()
    for (uuid, info) in deps
        # Only include packages that have a source directory
        if info.source !== nothing && isdir(info.source)
            println(info.source)
        end
    end
')

mkdir -p "$STAGE_DIR/.julia/packages"

# Copy only the required package source directories
while IFS= read -r pkg_path; do
    [ -z "$pkg_path" ] && continue
    # Extract the package name and hash from the path
    # Path format: ~/.julia/packages/PkgName/HASH/
    pkg_name=$(basename "$(dirname "$pkg_path")")
    pkg_hash=$(basename "$pkg_path")

    mkdir -p "$STAGE_DIR/.julia/packages/$pkg_name"
    cp -r "$pkg_path" "$STAGE_DIR/.julia/packages/$pkg_name/$pkg_hash"
done <<< "$REQUIRED_PKGS"

# Copy required artifacts (binary dependencies)
if [ -d "$DEPOT_PATH/artifacts" ]; then
    echo "   Copying artifacts (binary dependencies)..."
    cp -r "$DEPOT_PATH/artifacts" "$STAGE_DIR/.julia/"
fi

# Skip compiled/ — the sysimage handles precompilation

echo "6. Creating run script with DEPOT_PATH..."
cat > "$STAGE_DIR/os3d.sh" << 'LAUNCHER_EOF'
#!/bin/bash
## OS3D - Click to Run
APP_DIR="$(cd "$(dirname "$0")" && pwd)"
export JULIA_DEPOT_PATH="$APP_DIR/.julia"
exec "$APP_DIR/launcher.sh" "$@"
LAUNCHER_EOF
chmod +x "$STAGE_DIR/os3d.sh"

# Print size breakdown before archiving
echo ""
echo "Size breakdown:"
du -sh "$STAGE_DIR/julia/"   2>/dev/null | awk '{print "  Julia runtime:  " $1}'
du -sh "$STAGE_DIR/dist/"    2>/dev/null | awk '{print "  Sysimage:       " $1}'
du -sh "$STAGE_DIR/.julia/"  2>/dev/null | awk '{print "  Package depot:  " $1}'
du -sh "$STAGE_DIR/public/"  2>/dev/null | awk '{print "  Web assets:     " $1}'
echo ""

echo "7. Creating archive..."
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
echo "  2. Users extract and run: ./os3d.sh"
