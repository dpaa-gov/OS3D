// OS3D Comparison Viewer — Three.js point cloud visualization
// Heatmap (distance) + Dual-color (identity) modes
// Adapted from QA3D's Viewer module

const ComparisonViewer = (function () {
    'use strict';

    let scene, camera, renderer, controls;
    let fixedCloud = null, movingCloud = null;
    let legendEl = null;
    let currentMode = 'heatmap'; // 'heatmap' or 'dual'
    let storedData = null;
    let containerId = null;
    let initialized = false;
    let currentColormap = 'green-red';
    let currentPointSize = 1.5;

    // ── Colormap definitions ────────────────────────
    const colormaps = {
        'green-red': {
            label: 'Green → Red',
            css: 'linear-gradient(to right, #00ff1a, #ffff00, #ff0000)',
            map(t) {
                let r, g, b;
                if (t < 0.5) {
                    r = t * 2; g = 1.0; b = 0.1 * (1 - t * 2);
                } else {
                    r = 1.0; g = 1.0 - (t - 0.5) * 2; b = 0.0;
                }
                return { r, g, b };
            }
        },
        'viridis': {
            label: 'Viridis',
            css: 'linear-gradient(to right, #440154, #31688e, #35b779, #fde725)',
            map(t) {
                // Sampled control points from matplotlib viridis
                const stops = [
                    [0.267, 0.004, 0.329],  // dark purple
                    [0.283, 0.141, 0.458],
                    [0.254, 0.265, 0.530],
                    [0.207, 0.372, 0.553],
                    [0.164, 0.471, 0.558],
                    [0.128, 0.567, 0.551],
                    [0.135, 0.659, 0.518],
                    [0.267, 0.749, 0.441],
                    [0.478, 0.821, 0.318],
                    [0.741, 0.873, 0.150],
                    [0.993, 0.906, 0.144]   // bright yellow
                ];
                return sampleStops(stops, t);
            }
        },
        'inferno': {
            label: 'Inferno',
            css: 'linear-gradient(to right, #000004, #420a68, #932667, #dd513a, #fca50a, #fcffa4)',
            map(t) {
                const stops = [
                    [0.001, 0.000, 0.014],  // near-black
                    [0.133, 0.027, 0.329],
                    [0.341, 0.063, 0.431],
                    [0.545, 0.114, 0.380],
                    [0.735, 0.216, 0.263],
                    [0.878, 0.376, 0.122],
                    [0.957, 0.553, 0.039],
                    [0.982, 0.733, 0.114],
                    [0.945, 0.894, 0.319],
                    [0.988, 1.000, 0.644]   // light yellow
                ];
                return sampleStops(stops, t);
            }
        }
    };

    function sampleStops(stops, t) {
        const n = stops.length - 1;
        const idx = t * n;
        const lo = Math.min(Math.floor(idx), n - 1);
        const hi = lo + 1;
        const f = idx - lo;
        return {
            r: stops[lo][0] + (stops[hi][0] - stops[lo][0]) * f,
            g: stops[lo][1] + (stops[hi][1] - stops[lo][1]) * f,
            b: stops[lo][2] + (stops[hi][2] - stops[lo][2]) * f
        };
    }

    function distanceToColor(t) {
        return colormaps[currentColormap].map(t);
    }

    // ── Initialize (deferred) ───────────────────────
    function init(id) {
        containerId = id;
    }

    function ensureInitialized() {
        if (initialized) return;
        initialized = true;

        const container = document.getElementById(containerId);
        if (!container) return;

        container.innerHTML = '';

        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x1a1d23);

        camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 10000);
        camera.position.set(0, 0, 300);

        renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setSize(container.clientWidth, container.clientHeight);
        container.appendChild(renderer.domElement);

        controls = new THREE.TrackballControls(camera, renderer.domElement);
        controls.rotateSpeed = 1.2;
        controls.zoomSpeed = 1.2;
        controls.panSpeed = 0.3;
        controls.staticMoving = true;
        controls.mouseButtons = {
            LEFT: 0,     // left-click rotates (no landmarks here)
            MIDDLE: 1,
            RIGHT: 2
        };

        // Ambient light only (point clouds don't need directional)
        scene.add(new THREE.AmbientLight(0xffffff, 1.0));

        // Resize handling
        const ro = new ResizeObserver(() => {
            const w = container.clientWidth;
            const h = container.clientHeight;
            camera.aspect = w / h;
            camera.updateProjectionMatrix();
            renderer.setSize(w, h);
            controls.handleResize();
        });
        ro.observe(container);

        animate();
    }

    function animate() {
        requestAnimationFrame(animate);
        if (controls) controls.update();
        if (renderer && scene && camera) renderer.render(scene, camera);
    }

    // ── Build point cloud geometry ──────────────────
    function createPointCloud(coords, colors, size) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(coords, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

        const material = new THREE.PointsMaterial({
            size: size || 1.5,
            vertexColors: true,
            sizeAttenuation: true
        });

        return new THREE.Points(geometry, material);
    }

    // ── Load visualization results ──────────────────
    function loadResults(data) {
        ensureInitialized();
        storedData = data;

        // Remove old clouds
        if (fixedCloud) { scene.remove(fixedCloud); fixedCloud.geometry.dispose(); }
        if (movingCloud) { scene.remove(movingCloud); movingCloud.geometry.dispose(); }

        const fixedCoords = new Float32Array(data.fixedCoords);
        const movingCoords = new Float32Array(data.movingCoords);
        const fixedDists = data.fixedDistances;
        const movingDists = data.movingDistances;

        const nFixed = fixedDists.length;
        const nMoving = movingDists.length;

        storedData.nFixed = nFixed;
        storedData.nMoving = nMoving;
        storedData.fixedCoordsF32 = fixedCoords;
        storedData.movingCoordsF32 = movingCoords;

        // Find color scale range — cap at 95th percentile to avoid outlier domination
        // (boundary vertices and noise would otherwise wash out the gradient)
        const allDists = fixedDists.concat(movingDists).sort((a, b) => a - b);
        const minDist = allDists[0];
        const p95Index = Math.floor(allDists.length * 0.95);
        const maxDist = allDists[Math.min(p95Index, allDists.length - 1)];
        storedData.minDist = minDist;
        storedData.maxDist = maxDist;

        // Compute heatmap colors
        const range = maxDist - minDist || 1;

        storedData.fixedHeatColors = new Float32Array(nFixed * 3);
        for (let i = 0; i < nFixed; i++) {
            const t = Math.min(1, Math.max(0, (fixedDists[i] - minDist) / range));
            const c = distanceToColor(t);
            storedData.fixedHeatColors[i * 3] = c.r;
            storedData.fixedHeatColors[i * 3 + 1] = c.g;
            storedData.fixedHeatColors[i * 3 + 2] = c.b;
        }

        storedData.movingHeatColors = new Float32Array(nMoving * 3);
        for (let i = 0; i < nMoving; i++) {
            const t = Math.min(1, Math.max(0, (movingDists[i] - minDist) / range));
            const c = distanceToColor(t);
            storedData.movingHeatColors[i * 3] = c.r;
            storedData.movingHeatColors[i * 3 + 1] = c.g;
            storedData.movingHeatColors[i * 3 + 2] = c.b;
        }

        // Dual-color: fixed = bright gold, moving = vivid blue
        storedData.fixedDualColors = new Float32Array(nFixed * 3);
        for (let i = 0; i < nFixed; i++) {
            storedData.fixedDualColors[i * 3] = 1.0;
            storedData.fixedDualColors[i * 3 + 1] = 0.78;
            storedData.fixedDualColors[i * 3 + 2] = 0.15;
        }

        storedData.movingDualColors = new Float32Array(nMoving * 3);
        for (let i = 0; i < nMoving; i++) {
            storedData.movingDualColors[i * 3] = 0.25;
            storedData.movingDualColors[i * 3 + 1] = 0.55;
            storedData.movingDualColors[i * 3 + 2] = 1.0;
        }

        // Default to heatmap mode
        applyMode('heatmap');
        fitCamera(fixedCoords, movingCoords);
        buildLegend(minDist, maxDist);
    }

    function applyMode(mode) {
        currentMode = mode;
        if (!storedData) return;

        if (fixedCloud) { scene.remove(fixedCloud); fixedCloud.geometry.dispose(); }
        if (movingCloud) { scene.remove(movingCloud); movingCloud.geometry.dispose(); }

        if (mode === 'heatmap') {
            fixedCloud = createPointCloud(storedData.fixedCoordsF32, storedData.fixedHeatColors, currentPointSize);
            movingCloud = createPointCloud(storedData.movingCoordsF32, storedData.movingHeatColors, currentPointSize);
            // Show legend
            if (legendEl) legendEl.style.display = '';
        } else {
            fixedCloud = createPointCloud(storedData.fixedCoordsF32, storedData.fixedDualColors, currentPointSize);
            movingCloud = createPointCloud(storedData.movingCoordsF32, storedData.movingDualColors, currentPointSize);
            // Hide legend in dual mode
            if (legendEl) legendEl.style.display = 'none';
        }

        scene.add(fixedCloud);
        scene.add(movingCloud);
    }

    function toggleMode() {
        applyMode(currentMode === 'heatmap' ? 'dual' : 'heatmap');
        return currentMode;
    }

    function getMode() { return currentMode; }

    // ── Fit camera to bounding box ──────────────────
    function fitCamera(coords1, coords2) {
        let minX = Infinity, minY = Infinity, minZ = Infinity;
        let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

        const updateBounds = (coords) => {
            for (let i = 0; i < coords.length; i += 3) {
                if (coords[i] < minX) minX = coords[i];
                if (coords[i] > maxX) maxX = coords[i];
                if (coords[i + 1] < minY) minY = coords[i + 1];
                if (coords[i + 1] > maxY) maxY = coords[i + 1];
                if (coords[i + 2] < minZ) minZ = coords[i + 2];
                if (coords[i + 2] > maxZ) maxZ = coords[i + 2];
            }
        };

        updateBounds(coords1);
        updateBounds(coords2);

        const cx = (minX + maxX) / 2;
        const cy = (minY + maxY) / 2;
        const cz = (minZ + maxZ) / 2;
        const size = Math.max(maxX - minX, maxY - minY, maxZ - minZ);

        camera.position.set(cx, cy, cz + size * 1.5);
        controls.target.set(cx, cy, cz);
        controls.update();
    }

    // ── Color legend bar ────────────────────────────
    function buildLegend(minDist, maxDist) {
        if (legendEl) legendEl.remove();

        const container = renderer.domElement.parentElement;
        legendEl = document.createElement('div');
        legendEl.className = 'color-legend';
        const gradientCss = colormaps[currentColormap].css;
        legendEl.innerHTML = `
            <div class="legend-bar">
                <div class="legend-gradient" style="background: ${gradientCss}"></div>
            </div>
            <div class="legend-labels">
                <span>${minDist.toFixed(2)}</span>
                <span>${((minDist + maxDist) / 2).toFixed(2)}</span>
                <span>${maxDist.toFixed(2)}</span>
            </div>
            <div class="legend-title">Distance (mm)</div>
        `;
        container.appendChild(legendEl);
    }

    function setPointSize(size) {
        currentPointSize = size;
        if (fixedCloud) fixedCloud.material.size = size;
        if (movingCloud) movingCloud.material.size = size;
    }

    function clear() {
        if (fixedCloud) { scene.remove(fixedCloud); fixedCloud.geometry.dispose(); fixedCloud = null; }
        if (movingCloud) { scene.remove(movingCloud); movingCloud.geometry.dispose(); movingCloud = null; }
        if (legendEl) { legendEl.remove(); legendEl = null; }
        storedData = null;
    }

    function setColormap(name) {
        if (!colormaps[name]) return;
        currentColormap = name;
        if (!storedData) return;

        // Recompute heatmap colors from stored distances
        const range = storedData.maxDist - storedData.minDist || 1;

        for (let i = 0; i < storedData.nFixed; i++) {
            const t = Math.min(1, Math.max(0, (storedData.fixedDistances[i] - storedData.minDist) / range));
            const c = distanceToColor(t);
            storedData.fixedHeatColors[i * 3] = c.r;
            storedData.fixedHeatColors[i * 3 + 1] = c.g;
            storedData.fixedHeatColors[i * 3 + 2] = c.b;
        }

        for (let i = 0; i < storedData.nMoving; i++) {
            const t = Math.min(1, Math.max(0, (storedData.movingDistances[i] - storedData.minDist) / range));
            const c = distanceToColor(t);
            storedData.movingHeatColors[i * 3] = c.r;
            storedData.movingHeatColors[i * 3 + 1] = c.g;
            storedData.movingHeatColors[i * 3 + 2] = c.b;
        }

        // Refresh clouds if in heatmap mode
        if (currentMode === 'heatmap') {
            applyMode('heatmap');
        }

        // Update legend gradient
        buildLegend(storedData.minDist, storedData.maxDist);
    }

    return { init, loadResults, toggleMode, getMode, setPointSize, setColormap, clear };
})();
