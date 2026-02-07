## Build sysimage for OS3D
## Creates a precompiled system image for dramatically faster startup
##
## Usage: julia --project=. build/build_sysimage.jl
##
## Output: dist/os3d_sysimage.so (Linux), dist/os3d_sysimage.dll (Windows),
##         dist/os3d_sysimage.dylib (macOS)

using PackageCompiler

# Determine output extension based on platform
const SYSIMAGE_EXT = if Sys.iswindows()
    "dll"
elseif Sys.isapple()
    "dylib"
else
    "so"
end

const PROJECT_DIR = dirname(@__DIR__)
const DIST_DIR = joinpath(PROJECT_DIR, "dist")
const SYSIMAGE_PATH = joinpath(DIST_DIR, "os3d_sysimage.$SYSIMAGE_EXT")

# Create dist directory
mkpath(DIST_DIR)

# All packages used by both the Genie app and ICP workers
const PACKAGES = [
    "Genie",
    "HTTP",
    "JSON3",
    "NearestNeighbors",
    "StatsBase",
    "Statistics",
    "MultivariateStats",
    "LinearAlgebra",
    "SharedArrays",
]

@info "Building OS3D sysimage..."
@info "  Project: $PROJECT_DIR"
@info "  Output:  $SYSIMAGE_PATH"
@info "  Packages: $(join(PACKAGES, ", "))"
@info "  Platform: $(Sys.MACHINE)"
@info ""
@info "This may take 5-15 minutes..."

create_sysimage(
    PACKAGES;
    sysimage_path=SYSIMAGE_PATH,
    precompile_execution_file=joinpath(@__DIR__, "precompile_workload.jl"),
    project=PROJECT_DIR,
)

@info "Sysimage built successfully: $SYSIMAGE_PATH"
@info "Size: $(round(filesize(SYSIMAGE_PATH) / 1024 / 1024, digits=1)) MB"
