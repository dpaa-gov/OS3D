/**
 * Three.js PLY Viewer Module
 * Handles 3D model rendering and interaction
 */

class ThreeViewer {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.model = null;
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.landmarkSpheres = [];
        this.landmarkCount = 0;
        this.nextLandmarkNumber = 1;
        this.isLoading = false;
        this.onLandmarkPlaced = null;
        this.onLandmarkMoved = null;
        this.isInitialized = false;
        // Reposition state (shift+click to pick up, click to drop)
        this._repositioning = null; // { index, sphere, label } when active
        this.sensitivityMultiplier = 1.0;
        // Boundary visualization
        this.boundaryIndices = [];
        this.originalVertexColors = false;
        // Pan-tracking for guide crosshair
        this._guideAnchorTarget = null;   // controls.target when crosshair shown / slider used
        this._guideCrosshairBase = null;  // crosshair position at anchor time
        this._controlsChangeHandler = null;
        this.onGuideCrosshairMoved = null; // callback({x,y,z}) for slider sync
    }

    init() {
        if (this.isInitialized) return;

        // Clear any placeholder content
        this.container.innerHTML = '';

        // Scene setup
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x1a1d23);

        // Camera setup
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;
        this.camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 10000);
        this.camera.position.set(0, 0, 300);

        // Renderer setup
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(width, height);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.container.appendChild(this.renderer.domElement);

        // Controls — TrackballControls for free rotation (no pole locking)
        this.controls = new THREE.TrackballControls(this.camera, this.renderer.domElement);
        this.controls.rotateSpeed = 1.2;
        this.controls.zoomSpeed = 1.2;
        this.controls.panSpeed = 0.8;
        this.controls.noRotate = false;
        this.controls.staticMoving = true;
        // TrackballControls: LEFT→ROTATE, MIDDLE→ZOOM, RIGHT→PAN
        // We want: right-click=rotate, middle=zoom, left=landmarks (disabled)
        // So: button 2 (right) triggers ROTATE, button 1 triggers ZOOM, PAN disabled
        this.controls.mouseButtons = {
            LEFT: 2,     // right-click triggers ROTATE
            MIDDLE: -1,  // drag-zoom disabled (scroll still zooms)
            RIGHT: 1     // middle-click triggers PAN
        };

        // Lighting — two opposing directions for depth without washing out
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
        this.scene.add(ambientLight);

        const light1 = new THREE.DirectionalLight(0xffffff, 0.8);
        light1.position.set(1, 1, 1);
        this.scene.add(light1);

        const light2 = new THREE.DirectionalLight(0xffffff, 0.5);
        light2.position.set(-1, -1, -1);
        this.scene.add(light2);

        // Grid removed for cleaner visualization

        // Event listeners — store reference so dispose() can remove them
        this._clickHandler = (e) => this.onMouseClick(e);
        this.container.addEventListener('click', this._clickHandler);

        // Escape cancels landmark repositioning
        this._keyHandler = (e) => {
            if (e.key === 'Escape' && this._repositioning) {
                this._cancelReposition();
            }
        };
        document.addEventListener('keydown', this._keyHandler);

        // Use ResizeObserver for proper container resize detection
        this.resizeObserver = new ResizeObserver(() => this.onWindowResize());
        this.resizeObserver.observe(this.container);

        // Start render loop
        this.animate();
        this.isInitialized = true;
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }

    onWindowResize() {
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
        this.controls.handleResize();
        this.controls.update();
    }

    /**
     * Load a PLY model from a file path via the API
     * @param {string} filepath - Full path to the PLY file
     * @param {Array} existingLandmarks - Optional existing landmarks to restore
     */
    async loadModelFromPath(filepath, existingLandmarks = []) {
        this.isLoading = true;

        // Cancel any active reposition
        this._repositioning = null;
        this.container.style.cursor = '';

        // Remove existing model and null the reference immediately
        // so no phantom clicks can interact with disposed geometry during async loading
        if (this.model) {
            this.scene.remove(this.model);
            this.model.geometry.dispose();
            this.model.material.dispose();
            this.model = null;
        }

        // Clear landmarks and boundary highlights
        this.clearLandmarkSpheres();
        this.clearBoundaryHighlights();

        try {
            // Load raw PLY bytes via Electron IPC
            const bytes = await window.os3d.invoke('read_ply_raw', { path: filepath });
            const arrayBuffer = new Uint8Array(bytes).buffer;

            // Load PLY geometry
            const loader = new THREE.PLYLoader();
            const geometry = loader.parse(arrayBuffer);

            geometry.computeVertexNormals();
            geometry.computeBoundingSphere();

            // Create material
            // Bone-like ivory/cream color for anatomical visualization
            const material = new THREE.MeshPhongMaterial({
                color: 0xf5e6d3,
                specular: 0x222222,
                shininess: 25,
                side: THREE.DoubleSide,
                flatShading: false
            });

            this.model = new THREE.Mesh(geometry, material);
            this.scene.add(this.model);

            // Center camera on model
            this.centerOnModel();

            // Load existing landmarks if any
            if (existingLandmarks && existingLandmarks.length > 0) {
                for (const lm of existingLandmarks) {
                    this.addLandmarkSphere(lm.x, lm.y, lm.z, lm.index);
                }
            }


            // NOTE: Do NOT set isLoading = false here.
            // The caller (loadCurrentModel) must finish syncing
            // nextLandmarkNumber before unblocking clicks.
            return true;
        } catch (error) {
            console.error('Error loading mesh:', error);
            this.isLoading = false;  // On error, unblock since caller won't
            return false;
        }
    }

    centerOnModel() {
        if (!this.model) return;

        const box = new THREE.Box3().setFromObject(this.model);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());

        // Reset controls target to center
        this.controls.target.copy(center);

        // Position camera to see the whole model
        const maxDim = Math.max(size.x, size.y, size.z);
        const fov = this.camera.fov * (Math.PI / 180);
        let cameraDistance = maxDim / (2 * Math.tan(fov / 2));
        cameraDistance *= 1.5; // Add some padding

        this.camera.position.copy(center);
        this.camera.position.z += cameraDistance;
        this.camera.lookAt(center);

        // Adapt control sensitivity to model size so small and large bones
        // feel consistent. 120 is the "baseline" radius for default speeds.
        const radius = this.model.geometry.boundingSphere
            ? this.model.geometry.boundingSphere.radius
            : maxDim / 2;
        const speedFactor = Math.max(0.5, Math.min(2.5, 120 / radius));
        this.lastSpeedFactor = speedFactor;
        this.controls.rotateSpeed = 1.2 * speedFactor * this.sensitivityMultiplier;
        this.controls.zoomSpeed = 1.2 * speedFactor * this.sensitivityMultiplier;

        this.controls.update();
    }

    onMouseClick(event) {
        if (!this.model || this.isLoading || event.button !== 0) return;

        // Calculate mouse position in normalized device coordinates
        const rect = this.container.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.camera);

        // --- If repositioning, drop the landmark at the new mesh location ---
        if (this._repositioning) {
            let intersects;
            if (this.model instanceof THREE.Points) {
                this.raycaster.params.Points.threshold = 2;
                intersects = this.raycaster.intersectObject(this.model);
            } else {
                intersects = this.raycaster.intersectObject(this.model);
            }

            if (intersects.length > 0) {
                const p = intersects[0].point;
                const info = this._repositioning;

                // Move sphere + label to new position
                info.sphere.position.set(p.x, p.y, p.z);
                if (info.label) {
                    info.label.position.set(p.x + 3.5, p.y + 3.5, p.z + 3.5);
                }

                // Restore sphere opacity
                info.sphere.material.opacity = 0.9;
                info.sphere.material.needsUpdate = true;

                // Notify app
                if (this.onLandmarkMoved) {
                    this.onLandmarkMoved({ index: info.index, x: p.x, y: p.y, z: p.z });
                }

                this._repositioning = null;
                this.container.style.cursor = '';
            }
            return;
        }

        // --- Shift+click: pick up the nearest landmark for repositioning ---
        if (event.shiftKey) {
            // Raycast against mesh surface to get a 3D point
            let intersects;
            if (this.model instanceof THREE.Points) {
                this.raycaster.params.Points.threshold = 2;
                intersects = this.raycaster.intersectObject(this.model);
            } else {
                intersects = this.raycaster.intersectObject(this.model);
            }

            if (intersects.length > 0) {
                const clickPoint = intersects[0].point;

                // Find the closest landmark sphere to this 3D point
                const spheres = this.landmarkSpheres.filter(
                    o => o.userData.landmarkIndex !== undefined && !o.userData.landmarkLabel
                );
                if (spheres.length === 0) return;

                let closest = null;
                let closestDist = Infinity;
                for (const s of spheres) {
                    const d = clickPoint.distanceTo(s.position);
                    if (d < closestDist) {
                        closestDist = d;
                        closest = s;
                    }
                }

                if (closest) {
                    const idx = closest.userData.landmarkIndex;
                    const label = this.landmarkSpheres.find(
                        o => o.userData.forLandmarkIndex === idx
                    );

                    // Visual feedback — dim the sphere while repositioning
                    closest.material.opacity = 0.4;
                    closest.material.needsUpdate = true;

                    this._repositioning = { index: idx, sphere: closest, label };
                    this.container.style.cursor = 'crosshair';
                }
            }
            return;
        }

        // --- Normal click: place a new landmark ---
        let intersects;
        if (this.model instanceof THREE.Points) {
            this.raycaster.params.Points.threshold = 2;
            intersects = this.raycaster.intersectObject(this.model);
        } else {
            intersects = this.raycaster.intersectObject(this.model);
        }

        if (intersects.length > 0) {
            const point = intersects[0].point;
            const landmarkIndex = this.nextLandmarkNumber;
            this.landmarkCount++;

            this.addLandmarkSphere(point.x, point.y, point.z, landmarkIndex);

            if (this.onLandmarkPlaced) {
                this.onLandmarkPlaced({
                    index: landmarkIndex,
                    x: point.x,
                    y: point.y,
                    z: point.z
                });
            }
        }
    }

    _cancelReposition() {
        if (!this._repositioning) return;
        this._repositioning.sphere.material.opacity = 0.9;
        this._repositioning.sphere.material.needsUpdate = true;
        this._repositioning = null;
        this.container.style.cursor = '';
    }

    // Distinct color per landmark index — consistent across all models
    getLandmarkColor(index) {
        const palette = [
            '#7c3aed', // L1  — purple
            '#dc2626', // L2  — red
            '#0d9488', // L3  — teal
            '#ea580c', // L4  — orange
            '#db2777', // L5  — pink
            '#ca8a04', // L6  — amber
            '#2563eb', // L7  — blue
            '#16a34a', // L8  — green
            '#6366f1', // L9  — indigo
            '#0891b2', // L10 — cyan
            '#9333ea', // L11 — violet
            '#e11d48', // L12 — rose
            '#059669', // L13 — emerald
            '#d97706', // L14 — yellow-orange
            '#4f46e5', // L15 — deep indigo
            '#0284c7', // L16 — sky blue
            '#be185d', // L17 — magenta
            '#65a30d', // L18 — lime
            '#7c2d12', // L19 — brown
            '#475569', // L20 — slate
        ];
        return palette[(index - 1) % palette.length];
    }

    addLandmarkSphere(x, y, z, index) {
        const color = this.getLandmarkColor(index);
        const colorHex = parseInt(color.replace('#', '0x'));

        const geometry = new THREE.SphereGeometry(1.5, 16, 16);
        const material = new THREE.MeshBasicMaterial({
            color: colorHex,
            transparent: true,
            opacity: 0.9
        });
        const sphere = new THREE.Mesh(geometry, material);
        sphere.position.set(x, y, z);
        sphere.userData.landmarkIndex = index;

        this.scene.add(sphere);
        this.landmarkSpheres.push(sphere);

        // Add label sprite
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = 64;
        canvas.height = 64;

        context.fillStyle = color;
        context.beginPath();
        context.arc(32, 32, 30, 0, 2 * Math.PI);
        context.fill();

        context.fillStyle = 'white';
        context.font = 'bold 32px Arial';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(index.toString(), 32, 32);

        const texture = new THREE.CanvasTexture(canvas);
        const spriteMaterial = new THREE.SpriteMaterial({
            map: texture,
            depthTest: false,
            depthWrite: false
        });
        const sprite = new THREE.Sprite(spriteMaterial);
        sprite.position.set(x + 3.5, y + 3.5, z + 3.5);
        sprite.scale.set(8, 8, 1);
        sprite.userData.landmarkLabel = true;
        sprite.userData.forLandmarkIndex = index;

        this.scene.add(sprite);
        this.landmarkSpheres.push(sprite);
    }

    clearLandmarkSpheres() {
        for (const obj of this.landmarkSpheres) {
            this.scene.remove(obj);
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) {
                if (obj.material.map) obj.material.map.dispose();
                obj.material.dispose();
            }
        }
        this.landmarkSpheres = [];
        this.landmarkCount = 0;
        this.nextLandmarkNumber = 1;
    }

    /**
     * Get current landmarks as array
     */
    getLandmarks() {
        const landmarks = [];
        for (const obj of this.landmarkSpheres) {
            if (obj.userData.landmarkIndex) {
                landmarks.push({
                    index: obj.userData.landmarkIndex,
                    x: obj.position.x,
                    y: obj.position.y,
                    z: obj.position.z
                });
            }
        }
        return landmarks.sort((a, b) => a.index - b.index);
    }

    resetLandmarks() {
        this.clearLandmarkSpheres();
        this.landmarkCount = 0;
        this.nextLandmarkNumber = 1;
    }

    /**
     * Set the number that will be assigned to the next placed landmark
     */
    setNextLandmarkNumber(num) {
        this.nextLandmarkNumber = num;
    }

    /**
     * Set sensitivity multiplier for rotate/zoom controls
     * @param {number} multiplier - Scale factor (0.5 = slower, 3.0 = faster)
     */
    setSensitivity(multiplier) {
        this.sensitivityMultiplier = multiplier;
        if (this.controls && this.lastSpeedFactor) {
            this.controls.rotateSpeed = 1.2 * this.lastSpeedFactor * multiplier;
            this.controls.zoomSpeed = 1.2 * this.lastSpeedFactor * multiplier;
        }
    }

    /**
     * Remove a landmark (sphere + label) by its landmark index number
     */
    removeLandmarkByIndex(landmarkIndex) {
        const toRemove = this.landmarkSpheres.filter(obj =>
            obj.userData.landmarkIndex === landmarkIndex || obj.userData.forLandmarkIndex === landmarkIndex
        );
        for (const obj of toRemove) {
            this.scene.remove(obj);
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) {
                if (obj.material.map) obj.material.map.dispose();
                obj.material.dispose();
            }
        }
        this.landmarkSpheres = this.landmarkSpheres.filter(obj =>
            obj.userData.landmarkIndex !== landmarkIndex && obj.userData.forLandmarkIndex !== landmarkIndex
        );
        this.landmarkCount = Math.max(0, this.landmarkCount - 1);
    }

    /**
     * Update a landmark's label number (for renumbering)
     */
    updateLandmarkNumber(oldIndex, newIndex) {
        // Update sphere userData
        for (const obj of this.landmarkSpheres) {
            if (obj.userData.landmarkIndex === oldIndex) {
                obj.userData.landmarkIndex = newIndex;
            }
        }
        // Remove old label and create new one
        const labelToRemove = this.landmarkSpheres.filter(obj => obj.userData.forLandmarkIndex === oldIndex);
        for (const obj of labelToRemove) {
            this.scene.remove(obj);
            if (obj.material) {
                if (obj.material.map) obj.material.map.dispose();
                obj.material.dispose();
            }
        }
        this.landmarkSpheres = this.landmarkSpheres.filter(obj => obj.userData.forLandmarkIndex !== oldIndex);

        // Find the sphere to get position and update its color
        const sphere = this.landmarkSpheres.find(obj => obj.userData.landmarkIndex === newIndex);
        if (sphere) {
            // Update sphere color
            const color = this.getLandmarkColor(newIndex);
            sphere.material.color.set(parseInt(color.replace('#', '0x')));

            // Create new label sprite
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.width = 64;
            canvas.height = 64;

            context.fillStyle = color;
            context.beginPath();
            context.arc(32, 32, 30, 0, 2 * Math.PI);
            context.fill();

            context.fillStyle = 'white';
            context.font = 'bold 32px Arial';
            context.textAlign = 'center';
            context.textBaseline = 'middle';
            context.fillText(newIndex.toString(), 32, 32);

            const texture = new THREE.CanvasTexture(canvas);
            const spriteMaterial = new THREE.SpriteMaterial({
                map: texture,
                depthTest: false,
                depthWrite: false
            });
            const sprite = new THREE.Sprite(spriteMaterial);
            sprite.position.set(sphere.position.x + 3.5, sphere.position.y + 3.5, sphere.position.z + 3.5);
            sprite.scale.set(8, 8, 1);
            sprite.userData.landmarkLabel = true;
            sprite.userData.forLandmarkIndex = newIndex;

            this.scene.add(sprite);
            this.landmarkSpheres.push(sprite);
        }
    }

    /**
     * Highlight boundary vertices by coloring them directly on the mesh
     * @param {Array} indices - 0-indexed vertex indices to highlight
     */
    highlightBoundaryVertices(indices) {
        // Clear existing boundary visualization
        this.clearBoundaryHighlights();

        if (!this.model || !indices || indices.length === 0) return;

        const geometry = this.model.geometry;
        const positions = geometry.getAttribute('position');
        if (!positions) return;

        const vertexCount = positions.count;

        // Create color attribute if it doesn't exist
        if (!geometry.getAttribute('color')) {
            const colors = new Float32Array(vertexCount * 3);
            // Default: bone ivory color (0xf5e6d3)
            const boneR = 0xf5 / 255, boneG = 0xe6 / 255, boneB = 0xd3 / 255;
            for (let i = 0; i < vertexCount; i++) {
                colors[i * 3] = boneR;
                colors[i * 3 + 1] = boneG;
                colors[i * 3 + 2] = boneB;
            }
            geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        }

        const colorAttr = geometry.getAttribute('color');

        // Set boundary vertex colors to amber/orange (0xf59e0b)
        const highlightR = 0xf5 / 255, highlightG = 0x9e / 255, highlightB = 0x0b / 255;

        const indexSet = new Set(indices);
        for (const idx of indexSet) {
            if (idx >= 0 && idx < vertexCount) {
                colorAttr.setXYZ(idx, highlightR, highlightG, highlightB);
            }
        }
        colorAttr.needsUpdate = true;

        // Enable vertex colors on the material
        this.model.material.vertexColors = true;
        this.model.material.color.set(0xffffff); // Neutral so vertex colors show correctly
        this.model.material.needsUpdate = true;
        this.originalVertexColors = true;

        this.boundaryIndices = indices;
    }

    /**
     * Clear boundary visualization by resetting vertex colors
     */
    clearBoundaryHighlights() {
        if (this.model && this.originalVertexColors) {
            const geometry = this.model.geometry;
            const colorAttr = geometry.getAttribute('color');
            if (colorAttr) {
                // Reset all vertices to bone color
                const boneR = 0xf5 / 255, boneG = 0xe6 / 255, boneB = 0xd3 / 255;
                for (let i = 0; i < colorAttr.count; i++) {
                    colorAttr.setXYZ(i, boneR, boneG, boneB);
                }
                colorAttr.needsUpdate = true;
            }
            // Restore original material settings
            this.model.material.vertexColors = false;
            this.model.material.color.set(0xf5e6d3);
            this.model.material.needsUpdate = true;
            this.originalVertexColors = false;
        }
        this.boundaryIndices = [];
    }



    // ══════════════════════════════════════════════════════════
    // Guide Landmark — Crosshair placement in 3D space
    // ══════════════════════════════════════════════════════════

    /**
     * Show the guide landmark crosshair at the bone centroid
     * Returns {x, y, z, bbox} — the initial position and bounding box for slider ranges
     */
    showGuideCrosshair() {
        if (!this.model) return null;

        // Remove existing crosshair if any
        this.hideGuideCrosshair();

        // Compute bone centroid and bounding box
        const positions = this.model.geometry.getAttribute('position');
        let cx = 0, cy = 0, cz = 0;
        const n = positions.count;
        let minX = Infinity, minY = Infinity, minZ = Infinity;
        let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
        for (let i = 0; i < n; i++) {
            const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
            cx += x; cy += y; cz += z;
            minX = Math.min(minX, x); maxX = Math.max(maxX, x);
            minY = Math.min(minY, y); maxY = Math.max(maxY, y);
            minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
        }
        cx /= n; cy /= n; cz /= n;

        // Extend bounding box for slider range
        // Long axis gets much more room (150%) so crosshair can reach into missing anatomy
        // Short axes get modest extension (50%)
        const ranges = [maxX - minX, maxY - minY, maxZ - minZ];
        const maxRange = Math.max(...ranges);
        const extFactorX = (ranges[0] === maxRange) ? 1.5 : 0.5;
        const extFactorY = (ranges[1] === maxRange) ? 1.5 : 0.5;
        const extFactorZ = (ranges[2] === maxRange) ? 1.5 : 0.5;
        const extX = (maxX - minX) * extFactorX;
        const extY = (maxY - minY) * extFactorY;
        const extZ = (maxZ - minZ) * extFactorZ;

        // Crosshair size — proportional to bone
        const armLength = Math.max(extX, extY, extZ) * 0.6;

        // Create crosshair lines — color-coded per axis (R=X, G=Y, B=Z)
        const makeMat = (color) => new THREE.LineBasicMaterial({
            color, depthTest: false, depthWrite: false, linewidth: 2
        });
        const xMat = makeMat(0xff4444); // red
        const yMat = makeMat(0x44cc44); // green
        const zMat = makeMat(0x4488ff); // blue

        // X axis line (red)
        const hGeo = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(-armLength, 0, 0),
            new THREE.Vector3(armLength, 0, 0)
        ]);
        const hLine = new THREE.Line(hGeo, xMat);

        // Y axis line (green)
        const vGeo = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(0, -armLength, 0),
            new THREE.Vector3(0, armLength, 0)
        ]);
        const vLine = new THREE.Line(vGeo, yMat);

        // Z axis line (blue)
        const dGeo = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(0, 0, -armLength),
            new THREE.Vector3(0, 0, armLength)
        ]);
        const dLine = new THREE.Line(dGeo, zMat);

        // Group all lines
        this._guideCrosshair = new THREE.Group();
        this._guideCrosshair.add(hLine, vLine, dLine);
        this._guideCrosshair.position.set(cx, cy, cz);
        this._guideCrosshair.renderOrder = 999;
        this.scene.add(this._guideCrosshair);

        // Add center sphere (small dot at intersection)
        const dotGeo = new THREE.SphereGeometry(armLength * 0.06, 8, 8);
        const dotMat = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            depthTest: false,
            depthWrite: false,
            transparent: true,
            opacity: 0.8
        });
        const dot = new THREE.Mesh(dotGeo, dotMat);
        this._guideCrosshair.add(dot);

        // ─── Pan-tracking: anchor controls.target so panning moves crosshair ───
        this._guideAnchorTarget = this.controls.target.clone();
        this._guideCrosshairBase = new THREE.Vector3(cx, cy, cz);
        this._controlsChangeHandler = () => this._onControlsChange();
        this.controls.addEventListener('change', this._controlsChangeHandler);

        return {
            x: cx, y: cy, z: cz,
            bbox: {
                minX: minX - extX, maxX: maxX + extX,
                minY: minY - extY, maxY: maxY + extY,
                minZ: minZ - extZ, maxZ: maxZ + extZ
            }
        };
    }

    /**
     * Called each frame controls emit 'change' — applies pan delta to crosshair
     */
    _onControlsChange() {
        if (!this._guideCrosshair || !this._guideAnchorTarget) return;
        const delta = new THREE.Vector3().subVectors(
            this.controls.target, this._guideAnchorTarget
        );
        // Only act if there's meaningful pan movement
        if (delta.lengthSq() < 1e-10) return;
        const newPos = new THREE.Vector3().addVectors(this._guideCrosshairBase, delta);
        this._guideCrosshair.position.copy(newPos);
        // Notify app so sliders stay in sync
        if (this.onGuideCrosshairMoved) {
            this.onGuideCrosshairMoved({ x: newPos.x, y: newPos.y, z: newPos.z });
        }
    }

    /**
     * Update crosshair position from sliders
     */
    updateGuideCrosshairPosition(x, y, z) {
        if (!this._guideCrosshair) return;
        this._guideCrosshair.position.set(x, y, z);
        // Re-anchor so subsequent pans are relative to this slider position
        if (this.controls) {
            this._guideAnchorTarget = this.controls.target.clone();
            this._guideCrosshairBase = new THREE.Vector3(x, y, z);
        }
    }

    /**
     * Get current crosshair position
     */
    getGuideCrosshairPosition() {
        if (!this._guideCrosshair) return null;
        const p = this._guideCrosshair.position;
        return { x: p.x, y: p.y, z: p.z };
    }

    /**
     * Confirm guide landmark — replace crosshair with a diamond marker
     * Returns the guide landmark data {index: 1, x, y, z, type: 'guide'}
     */
    confirmGuideLandmark() {
        if (!this._guideCrosshair) return null;

        const pos = this._guideCrosshair.position.clone();
        this.hideGuideCrosshair();

        // Create diamond-shaped marker (octahedron) — distinct from regular sphere landmarks
        const geo = new THREE.OctahedronGeometry(2.0, 0);
        const mat = new THREE.MeshBasicMaterial({
            color: 0x00e5ff,
            transparent: true,
            opacity: 0.9,
            depthTest: false,
            depthWrite: false
        });
        const diamond = new THREE.Mesh(geo, mat);
        diamond.position.copy(pos);
        diamond.userData.guideLandmark = true;
        diamond.userData.guideIndex = 1;
        diamond.renderOrder = 999;
        this.scene.add(diamond);

        // Add "G1" label
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = 64;
        canvas.height = 64;
        ctx.fillStyle = '#00e5ff';
        ctx.beginPath();
        ctx.arc(32, 32, 30, 0, 2 * Math.PI);
        ctx.fill();
        ctx.fillStyle = 'black';
        ctx.font = 'bold 28px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('G1', 32, 32);

        const texture = new THREE.CanvasTexture(canvas);
        const spriteMat = new THREE.SpriteMaterial({
            map: texture,
            depthTest: false,
            depthWrite: false
        });
        const sprite = new THREE.Sprite(spriteMat);
        sprite.position.set(pos.x + 3.5, pos.y + 3.5, pos.z + 3.5);
        sprite.scale.set(8, 8, 1);
        sprite.userData.guideLandmarkLabel = true;
        sprite.userData.forGuideIndex = 1;
        sprite.renderOrder = 999;
        this.scene.add(sprite);

        // Store references for removal
        this._guideLandmarkObjects = [diamond, sprite];

        return { index: 1, x: pos.x, y: pos.y, z: pos.z, type: 'guide' };
    }

    /**
     * Remove confirmed guide landmark
     */
    removeGuideLandmark() {
        this.hideGuideCrosshair();
        if (this._guideLandmarkObjects) {
            for (const obj of this._guideLandmarkObjects) {
                this.scene.remove(obj);
                if (obj.geometry) obj.geometry.dispose();
                if (obj.material) {
                    if (obj.material.map) obj.material.map.dispose();
                    obj.material.dispose();
                }
            }
            this._guideLandmarkObjects = null;
        }
    }

    /**
     * Get guide landmark data if one exists
     */
    getGuideLandmark() {
        if (!this._guideLandmarkObjects || this._guideLandmarkObjects.length === 0) return null;
        const diamond = this._guideLandmarkObjects[0];
        return {
            index: 1,
            x: diamond.position.x,
            y: diamond.position.y,
            z: diamond.position.z,
            type: 'guide'
        };
    }

    /**
     * Hide the crosshair (cancel or after confirm)
     */
    hideGuideCrosshair() {
        // Remove pan-tracking listener
        if (this._controlsChangeHandler && this.controls) {
            this.controls.removeEventListener('change', this._controlsChangeHandler);
            this._controlsChangeHandler = null;
        }
        this._guideAnchorTarget = null;
        this._guideCrosshairBase = null;

        if (this._guideCrosshair) {
            this.scene.remove(this._guideCrosshair);
            // Dispose all children
            this._guideCrosshair.traverse(child => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) child.material.dispose();
            });
            this._guideCrosshair = null;
        }
    }

    dispose() {
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
        }
        // Remove click handler to prevent ghost handlers after clear+reload
        if (this._clickHandler) {
            this.container.removeEventListener('click', this._clickHandler);
            this._clickHandler = null;
        }
        if (this._keyHandler) {
            document.removeEventListener('keydown', this._keyHandler);
            this._keyHandler = null;
        }
        this._repositioning = null;
        if (this.renderer) {
            this.renderer.dispose();
        }
        if (this.model) {
            this.scene.remove(this.model);
            this.model.geometry.dispose();
            this.model.material.dispose();
        }
        this.clearLandmarkSpheres();
        this.isInitialized = false;
    }
}

// Export to window
window.ThreeViewer = ThreeViewer;
