# Osteometric Sorting 3D (OS3D) v1.0.0

![Build](https://img.shields.io/badge/build-passing-brightgreen)
![Julia](https://img.shields.io/badge/Julia-1.11-9558B2?logo=julia&logoColor=white)
![Electron](https://img.shields.io/badge/Electron-34-47848F?logo=electron&logoColor=white)
![Linux](https://img.shields.io/badge/Linux-passing-brightgreen?logo=linux&logoColor=white)
![Windows](https://img.shields.io/badge/Windows-untested-lightgrey?logo=windows&logoColor=white)
![Status](https://img.shields.io/badge/status-in%20development-yellow)

A desktop application for osteometric comparison analysis using ICP (Iterative Closest Point) registration. Built with Electron + Julia.

## Features

- **3D Mesh Visualization**: Load and view PLY mesh files with Three.js
- **Landmark Placement**: Click to place anatomical landmarks on 3D models
- **Hole Detection**: Automatic boundary/hole detection on meshes
- **Batch Processing**: Process multiple PLY files and export to XYZ format
- **Threaded ICP Comparison**: Compare left/right bone pairs using multithreaded computing (up to 56 threads)

## Architecture

```
┌─────────────────────────────────────────┐
│       Electron BrowserWindow            │
│  HTML/CSS/JS + Three.js 3D viewer       │
└──────────────┬──────────────────────────┘
               │ ipcRenderer.invoke()
┌──────────────┴──────────────────────────┐
│       Electron Main Process (Node.js)   │
│  IPC handlers, file I/O, sidecar mgmt   │
└──────────────┬──────────────────────────┘
               │ stdin/stdout JSON
┌──────────────┴──────────────────────────┐
│         Julia Sidecar (OS3D.jl)         │
│  PLY processing, hole detection, ICP    │
└─────────────────────────────────────────┘
```

- **Frontend**: Vanilla JS + Three.js in an Electron BrowserWindow
- **Electron main process**: Handles window management, file system access, and IPC
- **Julia sidecar**: Runs as a subprocess, communicating via JSON over stdin/stdout. Handles PLY processing, hole detection, landmark management, and ICP comparisons

## System Requirements

- **RAM**: ~500 MB – 1 GB base (Julia runtime + packages), ~5–20 MB per thread during comparisons
- **Julia**: 1.11+ with 4+ threads recommended
- **Node.js**: 18+ with npm

---

## Quick Start (Development Mode)

### 1. Clone and install dependencies

```bash
git clone https://github.com/dpaa-gov/OS3D
cd OS3D

# Julia dependencies
julia --project=. -e "using Pkg; Pkg.instantiate()"

# Node/Electron dependencies
npm install
```

### 2. Run the app

```bash
npm run dev
```

## Building for Distribution

The build process has two steps: compile the Julia sidecar, then build the Electron app.

### Step 1: Compile the Julia Sidecar

```bash
julia build/build_sysimage.jl
```

This uses PackageCompiler to create a standalone Julia executable in `sidecar/`. Takes 5–15 minutes.

### Step 2: Build the Electron App

```bash
npm run build
```

**Output by platform:**

| Platform | Output |
|----------|--------|
| **Linux** | `dist/OS3D-1.0.0.AppImage` |
| **Windows** | `dist/OS3D Setup 1.0.0.exe` |

### Windows Installer

On a Windows machine with Julia and Node.js installed:

```cmd
julia build\build_sysimage.jl
npm run build
```

---

## Data Preparation (Artec Studio)

When scanning bones with Artec Studio, follow these steps to prepare models for OS3D:

1. **Start with Real-Time Fusion models** — use the real-time fusion output from each scan as your starting point. This saves significant processing time compared to building meshes from raw frames.
2. **Stitch fusion models** — if multiple scans are needed, align and stitch the real-time fusion models together.
3. **Edit fracture margins** — after creating the final mesh, manually edit the fracture margins (broken edges) using Artec Studio's mesh editing tools. Clean, well-defined margins are required for OS3D's boundary detection to work correctly.
4. **Reduce mesh density (optional)** — real-time fusion models can be very high-poly. To reduce, use the **Mesh Optimization** tool, select **"By triangle quantity"**, and enter the percentage of triangles to keep (e.g., 10% to reduce the mesh by 90%). This reduces file size and speeds up ICP comparisons without significantly affecting accuracy.
5. **Export as PLY** — export the final mesh as a binary PLY file for use in OS3D.

> **Important:** If fracture margins are not properly cleaned up in Artec Studio, the automatic boundary detection in OS3D may miss edges or produce inaccurate results.

---

## Example Data

Sample PLY files are included in `test/example_data/` for testing:

```
test/example_data/
├── test1_right.ply
├── test2_left.ply
└── test3_left.ply
```

Use these to verify the landmarking, boundary detection, and ICP comparison workflows.

---

## Usage

### Process Tab
1. Click **Browse** to select a folder containing PLY files
2. Navigate through models with **← Back** / **Next →**
3. Click on the 3D model to place landmarks
4. Click **Detect Holes** to mark boundary vertices
5. Click **Save All** to export all files to XYZ format

### Analysis Tab
1. Click **Browse** to select a folder containing XYZ files
2. Files are automatically sorted into Left/Right based on filename
3. Adjust **Hausdorff Percentage** (default 0.95)
4. Click **Run Comparisons** to start ICP analysis
5. Use **Best Matches Count** slider (1–20) to control top matches displayed
6. View results in **Best Matches** or **All Results** tabs
7. Click **Export CSV** to save results

## ICP Algorithm Details

The comparison uses point-to-plane ICP with the following features:

### Distance Metric
- **Bidirectional Hausdorff Distance**: Calculates distances in both directions (fixed→moving and moving→fixed) and takes the maximum
- **Percentile-based**: Uses the Nth percentile (default 95th) instead of true maximum for robustness to outliers

### Boundary Handling
Boundary vertices (detected holes/fragment edges) are expanded by one ring of mesh neighbors for conservative margin detection. These are excluded from the distance calculation:
- Boundary points are **excluded as measurement sources**
- Correspondences **to boundary points are ignored**

### Initial Alignment (Landmark-Based)
If 3+ matching landmarks are present in both meshes, a rigid alignment is computed before ICP refinement. The moving mesh X-axis is mirrored for left/right comparison.

**Landmark Requirements**

- **Minimum**: 3 non-collinear landmarks are required to uniquely determine a rigid rotation in 3D
- **Recommended**: 5–6 landmarks per bone end for robust alignment
- **Placement**: Landmarks should be spread across the bone surface, not clustered together

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
├── src/
│   ├── OS3D.jl                 # Module entry + sidecar command dispatcher
│   ├── lib/
│   │   ├── comparison.jl       # ICP comparison runner
│   │   ├── ply_handler.jl      # PLY/XYZ file handling
│   │   └── hole_detection.jl   # Boundary vertex detection
│   └── icp/
│       ├── icp.jl              # Main ICP algorithm
│       ├── xyz_reader.jl       # XYZ file parser
│       ├── point_to_plane.jl   # Point-to-plane ICP
│       ├── point_to_point.jl   # Point-to-point matching
│       ├── knn_ind_dst.jl      # KNN utilities
│       ├── fragment_landmarks.jl   # Boundary-aware Hausdorff
│       └── alignment_landmarks.jl  # Landmark-based alignment
├── public/
│   ├── index.html              # Main UI
│   ├── css/styles.css          # Styling
│   └── js/
│       ├── app.js              # Application logic
│       ├── three_viewer.js     # Three.js 3D viewer
│       ├── landmarks.js        # Landmark management
│       └── lib/                # Three.js libraries
├── build/
│   ├── build_sysimage.jl       # PackageCompiler build script
│   └── precompile_workload.jl  # AOT precompilation workload
├── main.js                     # Electron main process
├── preload.js                  # Electron IPC bridge
├── app.jl                      # Dev mode entry point
├── package.json                # Electron + build config
└── Project.toml                # Julia dependencies
```

## Future Features

- **Use mesh face normals directly for ICP**: Currently, surface normals are estimated from the point cloud via KNN. Since the input originates from PLY meshes with face connectivity, true vertex normals could be computed from adjacent face normals and carried through the XYZ pipeline.

## TODO

- [ ] Test normalized Hausdorff distance for fragmentary remains
- [ ] Check vertex counts in Artec real-time fusion models and evaluate mesh reduction
- [ ] ICP: Skip KD-tree rebuild in later iterations when `‖dH - I‖ < ε`
- [ ] ICP: Pre-allocate vertex matrix in XYZ parser instead of `Vector{Vector}` conversion
- [ ] Benchmark thread scaling on bigbox (64 cores/128 threads)

<details>
<summary>Completed</summary>

- [x] Migrate from Genie web server to Tauri desktop app
- [x] Migrate from Tauri to Electron
- [x] ICP: Pre-allocate buffers for SVD/covariance/normals — **7 min → 6:15**
- [x] ICP: Batch boundary filtering with `Set` — **single-pass filtering, ~2s gain**
- [x] ICP: Reuse fixed PointCloud across pairs — **9 min → 7 min (22% faster)**
- [x] ICP: Removed per-pair `@info` logging
- [x] CSV Export: Save location prompt via Tauri native dialog

</details>

## Citation

If you use this software, please cite it as:

> Lynch, J.J. 2026. OS3D. Osteometric Sorting 3D. Version 1.0.0. Defense POW/MIA Accounting Agency, Offutt AFB, NE.

## License

GNU General Public License v2.0