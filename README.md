# Osteometric Sorting 3D (OS3D) v0.1.0

![Build](https://img.shields.io/badge/build-passing-brightgreen)
![Julia](https://img.shields.io/badge/Julia-1.11-9558B2?logo=julia&logoColor=white)
![Linux](https://img.shields.io/badge/Linux-passing-brightgreen?logo=linux&logoColor=white)
![Windows](https://img.shields.io/badge/Windows-untested-lightgrey?logo=windows&logoColor=white)
![Status](https://img.shields.io/badge/status-in%20development-yellow)

A web-based application for 3D mesh visualization, anatomical landmarking, and osteometric comparison analysis using ICP (Iterative Closest Point) registration.

## Features

- **3D Mesh Visualization**: Load and view PLY mesh files with Three.js
- **Landmark Placement**: Click to place anatomical landmarks on 3D models
- **Hole Detection**: Automatic boundary/hole detection on meshes
- **Batch Processing**: Process multiple PLY files and export to XYZ format
- **Distributed ICP Comparison**: Compare left/right bone pairs using distributed computing

## Architecture

OS3D runs as a single Julia process:
- **Genie Web App** (port 8000): Handles web UI, file browsing, landmarking, and ICP comparisons
- **ICP comparisons** run in-process using Julia's built-in threading (`Threads.@spawn`)

## System Requirements

OS3D uses Julia's built-in threading for parallel ICP comparisons. All threads share a single process and runtime, so memory usage is much lower than the previous multi-process architecture.

```
Base RAM ≈ 500 MB – 1 GB (Julia runtime + loaded packages + web server)
Per-thread ≈ 5 – 20 MB (loaded meshes, KD-trees, normals)
```

Each thread loads its own copy of the fixed and moving point clouds during comparison, so memory does scale with thread count — but at ~5–20 MB per thread (for typical 10K–50K vertex scans), not the ~300 MB per worker from the previous Distributed architecture.

> **Recommended:** Julia 1.11+ with 4+ threads. Launch Julia with `--threads=auto` (used by `start.sh`) to use all available cores.

---

## Quick Start (Standalone Bundle)

Pre-built bundles include a compiled `os3d` executable, Julia runtime, all packages with artifacts, and web assets — **no installation required**.

### Download

Download the latest release for your platform:
- `OS3D-v0.1.0-linux-x86_64.tar.gz` (Linux)
- `OS3D-v0.1.0-windows-x86_64.zip` (Windows)

### Run

```bash
# Linux
tar xzf OS3D-v0.1.0-linux-x86_64.tar.gz
cd OS3D-v0.1.0-linux-x86_64
./os3d.sh
```

```cmd
REM Windows — extract the zip, then:
cd OS3D-v0.1.0-windows-x86_64
bin\os3d.exe
```

The app opens in a browser window automatically. Closing the browser will automatically shut down the server after ~15 seconds.

---

## Development Setup

For developers who want to run from source or contribute.

### Requirements

- Julia 1.11+
- Required packages (see `Project.toml`)

### Install Dependencies

```bash
git clone https://github.com/dpaa-gov/OS3D
cd OS3D
julia --project=. -e "using Pkg; Pkg.instantiate()"
```

### Run (Development Mode)

```bash
# Linux
./start.sh

# Windows
start.bat
```

The browser will open automatically when the server is ready. Closing the browser tab will automatically shut down the server after ~15 seconds.

### Build Compiled App (Optional — Standalone Distribution)

Use PackageCompiler to create a standalone compiled executable. No Julia installation required on the target machine.

**Linux:**
```bash
bash build/package.sh
# Output: dist/OS3D-v0.1.0-linux-x86_64.tar.gz
```

**Windows:**
```cmd
build\package.bat
REM Output: dist\OS3D-v0.1.0-windows-x86_64.zip
```

**Windows Installer** (optional, requires [Inno Setup 6+](https://jrsoftware.org/isinfo.php)):
```cmd
iscc build\installer.iss
```
Output: `dist\OS3D-v0.1.0-windows-setup.exe` — standard setup wizard with Start Menu and desktop shortcuts.

Build time is approximately 5–15 minutes. The bundle includes a compiled `os3d` executable, Julia runtime, all packages with artifacts, and web assets.

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
Boundary vertices (detected holes/fragment edges) are expanded by one ring of mesh neighbors for conservative margin detection. These are excluded from the distance calculation:
- Boundary points are **excluded as measurement sources**
- Correspondences **to boundary points are ignored**

### Initial Alignment (Landmark-Based)
If 3+ matching landmarks are present in both meshes, a rigid alignment is computed before ICP refinement. The moving mesh X-axis is mirrored for left/right comparison.

**Algorithm: Center → Rotate → Uncenter**

1. **Center**: Subtract each landmark set's centroid (`cm`, `cf`) — both sets move to origin
2. **Rotate**: SVD of the centered cross-covariance matrix gives the optimal rotation `R`
3. **Uncenter**: Place the rotated data at the fixed landmark centroid position

```julia
# compute_rotation centers landmarks internally for SVD
R = compute_rotation(mov_coords, fix_coords)
# One-liner: center on moving centroid, rotate, place at fixed centroid
X_mov = (X_mov .- cm) * R .+ cf
```

Centering the landmarks before SVD ensures the rotation captures only orientation, not position — so alignment works regardless of how far apart the bones are in space. The "uncenter" step (`.+ cf`) places the result where the fixed cloud lives, not at the origin.

**Landmark Requirements**

- **Minimum**: 3 non-collinear (not in a straight line) landmarks are required to uniquely determine a rigid rotation in 3D
- **Recommended**: 5–6 landmarks per bone end. More landmarks overdetermine the rotation, making SVD find the best-fit and improving robustness to placement error
- **Placement**: Landmarks should be spread across the bone surface, not clustered together. Collinear or tightly grouped landmarks leave rotational ambiguity — the bone can spin around the line/cluster and still satisfy the landmark alignment

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
│   ├── OS3D.jl             # Module entry point + julia_main()
│   ├── routes.jl           # API endpoints
│   ├── lib/
│   │   ├── comparison.jl       # ICP comparison runner
│   │   ├── ply_handler.jl      # PLY/XYZ file handling
│   │   └── hole_detection.jl
│   └── icp/
│       ├── icp.jl              # Main ICP algorithm
│       ├── xyz_reader.jl       # XYZ file parser
│       ├── point_to_plane.jl   # Point-to-plane ICP
│       ├── point_to_point.jl   # Point-to-point matching
│       ├── knn_ind_dst.jl      # KNN utilities
│       ├── fragment_landmarks.jl   # Boundary-aware Hausdorff
│       └── alignment_landmarks.jl  # Landmark-based alignment
├── app.jl              # Dev mode entry point
├── start.sh            # Dev startup script (Linux)
├── start.bat           # Dev startup script (Windows)
├── VERSION             # Version number
├── build/
│   ├── build_sysimage.jl   # PackageCompiler create_app builder
│   ├── precompile_workload.jl
│   ├── package.sh          # Linux bundle builder
│   └── package.bat         # Windows bundle builder
├── views/
│   └── index.html
└── public/
    ├── css/
    └── js/
```

## Logs

App output is printed to stdout. When launched via the compiled executable without a terminal, output is suppressed.

## Citation

If you use this software, please cite it as:

> Lynch, J.J. 2026. OS3D. Osteometric Sorting 3D. Version 0.1.0. Defense POW/MIA Accounting Agency, Offutt AFB, NE.

## Future Features

- **Use mesh face normals directly for ICP**: Currently, surface normals are estimated from the point cloud via KNN (`estimate_normals!`). Since the input originates from PLY meshes with face connectivity, the true vertex normals could be computed from adjacent face normals and carried through the XYZ pipeline. This would eliminate the KNN-based normal estimation step and may improve ICP convergence accuracy, particularly on sharp ridges or thin features where estimated normals can be unreliable.

## TODO

- [ ] Test normalized Hausdorff distance for fragmentary remains
- [ ] Check vertex counts in Artec real-time fusion models and evaluate mesh reduction
- [x] ~~ICP: Avoid rebuilding KD-tree every iteration in `matching!()`~~ — **not possible unconditionally**: tree is on the moving cloud which transforms every iteration
- [ ] ICP: Skip KD-tree rebuild in later iterations when `‖dH - I‖ < ε` — correspondences unlikely to change near convergence; rebuild early iterations + every Nth iteration or based on transform magnitude
- [x] **ICP: Pre-allocate buffers for SVD/covariance/normals to reduce per-iteration allocations** — **done: 7 min → 6:15 (zero-alloc `transform!` + pre-computed query points)**
  > **Note:** The `transform!` rewrite uses scalar R×point+t instead of BLAS matrix multiply. IEEE 754 floating-point is not associative, so operation order differences can cause ~1e-16 per-op rounding drift. In 205×205 testing, 42,024/42,025 distances were bit-identical; 1 pair near a convergence boundary differed by 0.033 (0.09%). This is expected and harmless for ICP.
- [x] ~~ICP: Tune GC with `GC.gc(false)` between comparisons~~ — **tested: made it slower** (overhead of per-pair GC calls > benefit, since allocations are already reduced by previous optimizations)
- [x] ICP: Batch boundary filtering with `Set` instead of row-by-row matrix copies (`fragment_landmarks.jl`) — **done: single-pass filtering, ~2s gain**
- [x] ICP: Reuse fixed point cloud PointCloud/normals/KDTree across pairs in `OMS_worker` (`icp.jl`) — **done: 9 min → 7 min (22% faster)**
- [ ] ICP: Pre-allocate vertex matrix in XYZ parser instead of `Vector{Vector}` conversion (`xyz_reader.jl`)
- [ ] ICP: Gate `@info` logging behind a verbose flag to reduce I/O contention
- [ ] CSV Export: Prompt user for save location using File System Access API (`showSaveFilePicker`) with fallback to auto-download
- [ ] Benchmark thread scaling on bigbox (64 cores/128 threads) — test 16/32/64/128 threads to find optimal cap after GC optimizations
- [ ] `Pkg.instantiate()` fails on HTTP/MbedTLS due to parallel precompilation race condition (works manually with `using HTTP`)

## License

GPL-2.0