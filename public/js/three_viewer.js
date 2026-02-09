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
        this.onLandmarkPlaced = null;
        this.isInitialized = false;
        // Boundary visualization
        this.boundaryIndices = [];
        this.originalVertexColors = false;
    }

    init() {
        if (this.isInitialized) return;

        // Clear any placeholder content
        this.container.innerHTML = '';

        // Scene setup
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x1a1f2e);

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

        // Controls
        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.mouseButtons = {
            LEFT: null, // Reserved for landmark placement
            MIDDLE: THREE.MOUSE.DOLLY,
            RIGHT: THREE.MOUSE.ROTATE
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

        // Event listeners
        this.container.addEventListener('click', (e) => this.onMouseClick(e));

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
        this.controls.update();
    }

    /**
     * Load a PLY model from a file path via the API
     * @param {string} filepath - Full path to the PLY file
     * @param {Array} existingLandmarks - Optional existing landmarks to restore
     */
    async loadModelFromPath(filepath, existingLandmarks = []) {
        // Remove existing model
        if (this.model) {
            this.scene.remove(this.model);
            this.model.geometry.dispose();
            this.model.material.dispose();
        }

        // Clear landmarks and boundary highlights
        this.clearLandmarkSpheres();
        this.clearBoundaryHighlights();

        try {
            // Fetch the raw mesh file
            const response = await fetch('/api/ply/raw', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: filepath })
            });

            if (!response.ok) {
                throw new Error('Failed to load mesh file');
            }

            const arrayBuffer = await response.arrayBuffer();

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

            return true;
        } catch (error) {
            console.error('Error loading mesh:', error);
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
        this.controls.update();
    }

    onMouseClick(event) {
        if (!this.model || event.button !== 0) return; // Only left click

        // Calculate mouse position in normalized device coordinates
        const rect = this.container.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        // Perform raycast
        this.raycaster.setFromCamera(this.mouse, this.camera);

        let intersects;
        if (this.model instanceof THREE.Points) {
            // For point clouds, use a threshold
            this.raycaster.params.Points.threshold = 2;
            intersects = this.raycaster.intersectObject(this.model);
        } else {
            intersects = this.raycaster.intersectObject(this.model);
        }

        if (intersects.length > 0) {
            const point = intersects[0].point;
            this.landmarkCount++;
            const landmarkIndex = this.landmarkCount;

            this.addLandmarkSphere(point.x, point.y, point.z, landmarkIndex);

            // Callback to notify app
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

    addLandmarkSphere(x, y, z, index) {
        const geometry = new THREE.SphereGeometry(1, 16, 16);
        const material = new THREE.MeshBasicMaterial({
            color: 0x2563eb,
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

        context.fillStyle = '#2563eb';
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
        sprite.position.set(x + 2.5, y + 2.5, z + 2.5);
        sprite.scale.set(5, 5, 1);
        sprite.userData.landmarkLabel = true;

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



    dispose() {
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
