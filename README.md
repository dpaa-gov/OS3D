# Osteometric Sorting 3D (OS3D) v0.0.1

A web-based application for 3D mesh visualization, anatomical landmarking, and osteometric comparison analysis using ICP (Iterative Closest Point) registration.

## Features

- **3D Mesh Visualization**: Load and view PLY mesh files with Three.js
- **Landmark Placement**: Click to place anatomical landmarks on 3D models
- **Hole Detection**: Automatic boundary/hole detection on meshes
- **Batch Processing**: Process multiple PLY files and export to XYZ format
- **Distributed ICP Comparison**: Compare left/right bone pairs using distributed computing

## Architecture

OS3D uses a two-process architecture:
- **Genie Web App** (port 8000): Handles web UI, file browsing, landmarking
- **ICP Server** (port 8001): Runs distributed ICP comparisons using N-2 CPU cores

## Requirements

- Julia 1.11+
- Required packages (see `Project.toml`)

## Installation

```bash
cd OS3D

# Install Julia dependencies
julia --project=. -e 'using Pkg; Pkg.instantiate()'
```

## Quick Start

```bash
# Start both servers
./start.sh
```

Then open http://127.0.0.1:8000 in your browser.

## Manual Startup

If you prefer to run servers separately:

```bash
# Terminal 1: Start ICP server
julia --project=. icp/server.jl

# Terminal 2: Start Genie app
julia --project=. app.jl
```

## Usage

### Process Tab
1. Click **Browse** to select a folder containing PLY files
2. Navigate through models with **← Back** / **Next →**
3. Click on the 3D model to place landmarks
4. Click **🕳️ Detect Holes** to mark boundary vertices
5. Click **💾 Save All** to export all files to XYZ format

### Analysis Tab
1. Click **Browse** to select a folder containing XYZ files
2. Files are automatically sorted into Left/Right based on filename
3. Adjust **Hausdorff Percentage** (default 0.95)
4. Click **▶️ Run Comparisons** to start distributed ICP analysis
5. View results in **Best Matches** or **All Results** tabs
6. Click **📥 Export CSV** to download results

## ICP Algorithm Details

The comparison uses point-to-plane ICP (Iterative Closest Point) with the following features:

### Distance Metric
- **Bidirectional Hausdorff Distance**: Calculates distances in both directions (fixed→moving and moving→fixed) and takes the maximum
- **Percentile-based**: Uses the Nth percentile (default 95th) instead of true maximum for robustness to outliers

### Boundary Handling
Boundary vertices (detected holes/fragment edges) are excluded from the distance calculation:
- Boundary points are **excluded as measurement sources**
- Correspondences **to boundary points are ignored** (distances where the nearest neighbor is a boundary vertex are discarded)

### Initial Alignment
If 3+ matching landmarks are present in both meshes, they are used for initial rigid alignment before ICP refinement. If landmarks are not present, ICP still runs but may require more iterations to converge.

## File Formats

### PLY Input
Standard PLY mesh files (binary or ASCII)

### XYZ Output
```
x y z           # regular vertex
x y z B         # boundary vertex
x y z L1        # landmark 1
x y z L2        # landmark 2
```

**File Naming Requirement**: For analysis, filenames must contain `left` or `right` (case-insensitive) to be sorted into the appropriate comparison group.

## Project Structure

```
OS3D/
├── app.jl              # Genie web server
├── routes.jl           # API endpoints
├── start.sh            # Startup script
├── lib/
│   ├── comparison.jl   # ICP server API client
│   ├── ply_handler.jl  # PLY/XYZ file handling
│   └── hole_detection.jl
├── icp/
│   ├── server.jl       # Distributed ICP HTTP server
│   ├── icp.jl          # Main ICP algorithm
│   ├── xyz_reader.jl   # XYZ file parser
│   ├── point_to_plane.jl
│   └── ...             # Other ICP components
├── views/
│   └── index.html
└── public/
    ├── css/
    └── js/
```

## Logs

- ICP server: `/tmp/icp_server.log`
- Genie app: `/tmp/genie.log` (when using nohup)

## Citation

If you use this software, please cite it as:

> Lynch, J.J. 2026. OS3D. Osteometric Sorting 3D. Version 0.0.1. Defense POW/MIA Accounting Agency, Offutt AFB, NE.

## TODO

- [ ] Verify boundary detection works for fragmentary remains using EMU models
- [ ] Convert old XYZRGB models to new XYZ format
- [ ] Verify lowest distances to the boundaries are discarded in the Hausdorff distance
- [ ] Package for standalone app
  - Consider PackageCompiler.jl for compiled distribution
  - Possibly maintain two branches: compiled vs. script-based

## License

GPL-2.0