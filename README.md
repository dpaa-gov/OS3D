# Osteometric Sorting 3D (OS3D) v0.1.0

![Version](https://img.shields.io/badge/version-0.1.0-blue)
![Julia](https://img.shields.io/badge/Julia-1.11+-9558B2?logo=julia&logoColor=white)
![Linux](https://img.shields.io/badge/Linux-tested-success?logo=linux&logoColor=white)
![Windows](https://img.shields.io/badge/Windows-failing-red?logo=windows&logoColor=white)
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
git clone https://github.com/dpaa-gov/OS3D
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

The browser will open automatically when the servers are ready. Closing the browser tab will automatically shut down both servers after ~15 seconds.

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

The package script builds the sysimage automatically — single command.

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

The bundle includes the Julia runtime, sysimage, all packages, and app source — users don't need Julia installed.

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


- [x] **Migrate to threading** — replaced two-process `Distributed.jl` architecture with single-process `Threads.@spawn`
- [ ] **Migrate build to PackageCompiler `create_app`** — convert sysimage build to a fully compiled standalone app (like QA3D)
- [ ] Test normalized Hausdorff distance for fragmentary remains
- [ ] Check vertex counts in Artec real-time fusion models and evaluate mesh reduction
- [ ] macOS standalone bundle
- [x] Add "completed in" elapsed time to comparison results
- [ ] **ICP: Avoid rebuilding KD-tree every iteration in `matching!()` (`point_to_plane.jl`)** — major GC pressure, rebuilds tree every ICP iteration per comparison
- [ ] **ICP: Pre-allocate buffers for SVD/covariance/normals to reduce per-iteration allocations** — threads share one heap, heavy allocation triggers frequent stop-the-world GC
- [ ] **ICP: Tune GC with `GC.gc(false)` between comparisons or `JULIA_GC_THREADS`** — threaded ICP ~33% slower than Distributed (8 min vs 6 min on 205×205) due to GC contention
- [ ] ICP: Batch boundary filtering with `Set` instead of row-by-row matrix copies (`fragment_landmarks.jl`)
- [ ] ICP: Reuse fixed point cloud PointCloud/normals/KDTree across pairs in `OMS_worker` (`icp.jl`)
- [ ] ICP: Pre-allocate vertex matrix in XYZ parser instead of `Vector{Vector}` conversion (`xyz_reader.jl`)
- [ ] ICP: Gate `@info` logging behind a verbose flag to reduce I/O contention
- [ ] `Pkg.instantiate()` fails on HTTP/MbedTLS due to parallel precompilation race condition (works manually with `using HTTP`)

### Windows (Partially Tested)

Remaining:
- [ ] Windows installer for the compiled app
- [ ] Audit all file path handling in `routes.jl` and `lib/` for edge cases with Windows `\` vs `/`

## License

GPL-2.0