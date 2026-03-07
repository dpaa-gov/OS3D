/**
 * ReferenceViewer — lightweight read-only 3D viewer for landmark reference.
 * Displays a previously-landmarked bone in a small sidebar panel so the user
 * can check landmark placement while working on other bones.
 */
class ReferenceViewer {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.model = null;
        this.landmarkSpheres = [];
        this.isInitialized = false;
        this.currentFilepath = null;
    }

    init() {
        if (this.isInitialized) return;

        this.container.innerHTML = '';

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x1a1f2e);

        const width = this.container.clientWidth || 250;
        const height = this.container.clientHeight || 250;
        this.camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 10000);
        this.camera.position.set(0, 0, 300);

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(width, height);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.container.appendChild(this.renderer.domElement);

        // TrackballControls — right-click to rotate, scroll to zoom, no landmark placement
        this.controls = new THREE.TrackballControls(this.camera, this.renderer.domElement);
        this.controls.rotateSpeed = 1.2;
        this.controls.zoomSpeed = 1.2;
        this.controls.panSpeed = 0.3;
        this.controls.noRotate = false;
        this.controls.mouseButtons = {
            LEFT: 2,     // right-click triggers ROTATE
            MIDDLE: 1,   // middle-click triggers ZOOM
            RIGHT: -1    // PAN disabled
        };

        // Lighting
        const ambient = new THREE.AmbientLight(0xffffff, 0.4);
        this.scene.add(ambient);

        const light1 = new THREE.DirectionalLight(0xffffff, 0.8);
        light1.position.set(1, 1, 1);
        this.scene.add(light1);

        const light2 = new THREE.DirectionalLight(0xffffff, 0.5);
        light2.position.set(-1, -1, -1);
        this.scene.add(light2);

        // Resize handling
        this.resizeObserver = new ResizeObserver(() => this.onResize());
        this.resizeObserver.observe(this.container);

        this.animate();
        this.isInitialized = true;
    }

    onResize() {
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;
        if (width === 0 || height === 0) return;

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
        this.controls.handleResize();
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        if (this.controls) this.controls.update();
        if (this.renderer && this.scene && this.camera) {
            this.renderer.render(this.scene, this.camera);
        }
    }

    /**
     * Load a PLY model with landmarks as a reference.
     * @param {string} filepath - Full path to the PLY file
     * @param {Array} landmarks - Array of {x, y, z, index} landmark objects
     */
    async loadReference(filepath, landmarks = []) {
        if (!this.isInitialized) this.init();

        // Clear existing model
        if (this.model) {
            this.scene.remove(this.model);
            this.model.geometry.dispose();
            this.model.material.dispose();
        }
        this.clearLandmarks();

        try {
            const bytes = await window.os3d.invoke('read_ply_raw', { path: filepath });
            const arrayBuffer = new Uint8Array(bytes).buffer;

            const loader = new THREE.PLYLoader();
            const geometry = loader.parse(arrayBuffer);
            geometry.computeVertexNormals();
            geometry.computeBoundingSphere();

            const material = new THREE.MeshPhongMaterial({
                color: 0xf5e6d3,
                specular: 0x222222,
                shininess: 25,
                side: THREE.DoubleSide,
                flatShading: false
            });

            this.model = new THREE.Mesh(geometry, material);
            this.scene.add(this.model);

            this.centerOnModel();

            // Add landmarks
            for (const lm of landmarks) {
                this.addLandmark(lm.x, lm.y, lm.z, lm.index);
            }

            this.currentFilepath = filepath;
            return true;
        } catch (error) {
            console.error('Reference viewer error:', error);
            return false;
        }
    }

    centerOnModel() {
        if (!this.model) return;

        const box = new THREE.Box3().setFromObject(this.model);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());

        this.controls.target.copy(center);

        const maxDim = Math.max(size.x, size.y, size.z);
        const fov = this.camera.fov * (Math.PI / 180);
        let cameraDistance = maxDim / (2 * Math.tan(fov / 2));
        cameraDistance *= 2.2; // Extra padding for small viewport

        this.camera.position.copy(center);
        this.camera.position.z += cameraDistance;
        this.camera.lookAt(center);
        this.controls.update();
    }

    /** Reuse the same color palette as the main viewer */
    getLandmarkColor(index) {
        const palette = [
            '#7c3aed', '#dc2626', '#0d9488', '#ea580c', '#db2777',
            '#ca8a04', '#2563eb', '#16a34a', '#6366f1', '#0891b2',
            '#9333ea', '#e11d48', '#059669', '#d97706', '#4f46e5',
            '#0284c7', '#be185d', '#65a30d', '#7c2d12', '#475569',
        ];
        return palette[(index - 1) % palette.length];
    }

    addLandmark(x, y, z, index) {
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
        this.scene.add(sphere);
        this.landmarkSpheres.push(sphere);

        // Label sprite
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = 64;
        canvas.height = 64;

        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(32, 32, 30, 0, 2 * Math.PI);
        ctx.fill();

        ctx.fillStyle = 'white';
        ctx.font = 'bold 32px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(index.toString(), 32, 32);

        const texture = new THREE.CanvasTexture(canvas);
        const spriteMaterial = new THREE.SpriteMaterial({
            map: texture,
            depthTest: false,
            depthWrite: false
        });
        const sprite = new THREE.Sprite(spriteMaterial);
        sprite.position.set(x + 3.5, y + 3.5, z + 3.5);
        sprite.scale.set(8, 8, 1);
        this.scene.add(sprite);
        this.landmarkSpheres.push(sprite);
    }

    clearLandmarks() {
        for (const obj of this.landmarkSpheres) {
            this.scene.remove(obj);
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) {
                if (obj.material.map) obj.material.map.dispose();
                obj.material.dispose();
            }
        }
        this.landmarkSpheres = [];
    }

    clear() {
        if (this.model) {
            this.scene.remove(this.model);
            this.model.geometry.dispose();
            this.model.material.dispose();
            this.model = null;
        }
        this.clearLandmarks();
        this.currentFilepath = null;
    }
}
