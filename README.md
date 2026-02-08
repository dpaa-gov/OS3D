# Osteometric Sorting 3D (OS3D) v0.1.0

![Version](https://img.shields.io/badge/version-0.1.0-blue)
![Julia](https://img.shields.io/badge/Julia-1.11+-9558B2?logo=julia&logoColor=white)
![Linux](https://img.shields.io/badge/Linux-tested-success?logo=linux&logoColor=white)
![Windows](https://img.shields.io/badge/Windows-partial-yellow?logo=windows&logoColor=white)
![macOS](https://img.shields.io/badge/macOS-untested-lightgrey?logo=apple&logoColor=white)

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

## System Requirements

Memory usage scales with the number of CPU threads. Workers are calculated as `min(CPU_THREADS - 2, 64)`.

```
Total RAM ≈ 500 MB + (number_of_workers × 300 MB)
```

| CPU Threads | Workers | Estimated RAM |
|:-----------:|:-------:|:-------------:|
| 4           | 2       | ~1.1 GB       |
| 8           | 6       | ~2.3 GB       |
| 16          | 14      | ~4.7 GB       |
| 32          | 30      | ~9.5 GB       |
| 64          | 62      | ~19.1 GB      |
| 66+         | 64 (cap)| ~19.7 GB      |

> **Note:** Estimates assume typical bone scans in the 10K–50K vertex range. Larger meshes will increase per-worker memory.

---

## Quick Start (Standalone Bundle)

Pre-built bundles include Julia, all dependencies, and a precompiled sysimage — **no installation required**.

### Download

Download the latest release for your platform:
- `OS3D-v0.1.0-linux-x86_64.tar.gz` (Linux)
- `OS3D-v0.1.0-windows-x86_64.zip` (Windows)
- macOS build coming soon

### Run

```bash
# Linux
tar xzf OS3D-v0.1.0-linux-x86_64.tar.gz
cd OS3D-v0.1.0-linux-x86_64
./os3d.sh
```

```cmd
REM Windows — extract the zip, then:
os3d.bat
```

The app will start both servers and open in a browser window automatically. Closing the browser will automatically shut down the servers.

> **Note:** The ICP server takes 20–60 seconds to initialize (loading workers). Only launch once — do not double-click the launcher multiple times.

**Launch options:**

- **Console visible** (for debugging / viewing logs): `os3d.sh` (Linux) · `os3d.bat` (Windows)
- **Console hidden** (normal use, double-click): `OS3D.desktop` (Linux) · `OS3D.vbs` (Windows)

---

## Development Setup

For developers who want to run from source or contribute.

### Requirements

- Julia 1.11+
- Required packages (see `Project.toml`)

### Install Dependencies

```bash
cd OS3D
julia --project=. -e "using Pkg; Pkg.instantiate()"
```

### Run (Development Mode)

```bash
# Linux/macOS
./start.sh

# Windows
start.bat
```

Then open http://127.0.0.1:8000 in your browser. Closing the browser tab will automatically shut down both servers after ~15 seconds.

To run servers separately:

```bash
# Terminal 1: Start ICP server
julia --project=. icp/server.jl

# Terminal 2: Start Genie app
julia --project=. app.jl
```

### Build Sysimage (Optional — Faster Startup)

Use PackageCompiler to create a precompiled sysimage. This reduces package load time from ~4.4s to ~0.5s.

```bash
julia --project=. build/build_sysimage.jl
```

The sysimage is saved to `dist/os3d_sysimage.so` and is automatically used by the ICP server workers when present.

### Build Distributable Bundle

Prerequisites: Julia installed, dependencies resolved, sysimage built.

**Linux:**
```bash
julia --project=. build/build_sysimage.jl
bash build/package.sh
# Output: dist/OS3D-v0.1.0-linux-x86_64.tar.gz (~706 MB)
```

**Windows:**
```cmd
julia --project=. build\build_sysimage.jl
build\package.bat
REM Output: dist\OS3D-v0.1.0-windows-x86_64.zip
```

The bundle includes the Julia runtime, sysimage, all packages, and app source — users don't need Julia installed.

---

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
5. Use **Best Matches Count** slider (1–20) to control how many top matches to display
6. View results in **Best Matches** or **All Results** tabs
7. Click **📥 Export CSV** to download results

## ICP Algorithm Details

The comparison uses point-to-plane ICP with the following features:

### Distance Metric
- **Bidirectional Hausdorff Distance**: Calculates distances in both directions (fixed→moving and moving→fixed) and takes the maximum
- **Percentile-based**: Uses the Nth percentile (default 95th) instead of true maximum for robustness to outliers

### Boundary Handling
Boundary vertices (detected holes/fragment edges) are excluded from the distance calculation:
- Boundary points are **excluded as measurement sources**
- Correspondences **to boundary points are ignored**

### Initial Alignment
If 3+ matching landmarks are present in both meshes, they are used for initial rigid alignment before ICP refinement.

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

**File Naming Requirement**: For analysis, filenames must contain `left` or `right` (case-insensitive) to be sorted into comparison groups.

## Project Structure

```
OS3D/
├── app.jl              # Genie web server
├── routes.jl           # API endpoints
├── start.sh            # Dev startup script (Linux/macOS)
├── start.bat           # Dev startup script (Windows)
├── VERSION             # Version number
├── build/
│   ├── build_sysimage.jl   # Sysimage builder (PackageCompiler)
│   ├── precompile_workload.jl
│   ├── package.sh          # Linux bundle builder
│   ├── package.bat         # Windows bundle builder
│   ├── launcher.sh         # Linux launcher (for bundle)
│   ├── launcher.bat        # Windows launcher (for bundle)
│   ├── OS3D.desktop        # Linux app launcher (no terminal)
│   └── OS3D.vbs            # Windows silent launcher (no console)
├── lib/
│   ├── comparison.jl       # ICP server API client
│   ├── ply_handler.jl      # PLY/XYZ file handling
│   └── hole_detection.jl
├── icp/
│   ├── server.jl           # Distributed ICP HTTP server
│   ├── icp.jl              # Main ICP algorithm
│   ├── xyz_reader.jl       # XYZ file parser
│   ├── point_to_plane.jl   # Point-to-plane ICP
│   ├── point_to_point.jl   # Point-to-point matching
│   ├── knn_ind_dst.jl      # KNN utilities
│   ├── fragment_landmarks.jl   # Boundary-aware Hausdorff
│   └── alignment_landmarks.jl  # Landmark-based alignment
├── views/
│   └── index.html
└── public/
    ├── css/
    └── js/
```

## Logs

- ICP server: `/tmp/icp_server.log` (Linux) or `%TEMP%\os3d_icp.log` (Windows)
- Genie app: stdout (Linux) or `%TEMP%\os3d_genie.log` (Windows)

## Citation

If you use this software, please cite it as:

> Lynch, J.J. 2026. OS3D. Osteometric Sorting 3D. Version 0.1.0. Defense POW/MIA Accounting Agency, Offutt AFB, NE.

## TODO

- [ ] Verify boundary detection works for fragmentary remains using EMU models
- [ ] Convert old XYZRGB models to new XYZ format
- [ ] Verify lowest distances to the boundaries are discarded in the Hausdorff distance
- [ ] macOS standalone bundle
- [ ] ICP: Avoid rebuilding KD-tree every iteration in `matching!()` (`point_to_plane.jl`)
- [ ] ICP: Batch boundary filtering with `Set` instead of row-by-row matrix copies (`fragment_landmarks.jl`)
- [ ] ICP: Reuse fixed point cloud PointCloud/normals/KDTree across pairs in `OMS_worker` (`icp.jl`)
- [ ] ICP: Pre-allocate vertex matrix in XYZ parser instead of `Vector{Vector}` conversion (`xyz_reader.jl`)
- [ ] ICP: Gate `@info` logging behind a verbose flag to reduce I/O contention

- [ ] Verify packaged Windows bundle shuts down Julia processes after browser close (same `_exit` fix)

### Windows (Partially Tested)

Windows scripts and launchers exist and have been tested on a Windows VM. Core functionality works:
- ✅ PLY model loading (cross-platform path handling)
- ✅ File saving (path separator fixes)
- ✅ PID-based process monitoring (replaced unreliable curl/window-title approaches)
- ✅ Browse dialog starts at user's home directory

Remaining:
- [ ] Occasional app shutdown on VM — needs bare-metal Windows testing to confirm if VM-related
- [ ] Audit all file path handling in `routes.jl` and `lib/` for edge cases with Windows `\` vs `/`

## License

GPL-2.0