/**
 * Landmarks Management Module
 * Handles landmark state across multiple models
 */

class LandmarkManager {
    constructor() {
        // Map of filepath -> landmarks array
        this.landmarksPerFile = new Map();
        // Map of filepath -> boundary indices array
        this.boundariesPerFile = new Map();
        this.currentFilePath = null;
    }

    /**
     * Set the current file being edited
     */
    setCurrentFile(filepath) {
        this.currentFilePath = filepath;
        if (!this.landmarksPerFile.has(filepath)) {
            this.landmarksPerFile.set(filepath, []);
        }
        if (!this.boundariesPerFile.has(filepath)) {
            this.boundariesPerFile.set(filepath, []);
        }
    }

    /**
     * Add a landmark to the current file
     */
    addLandmark(landmark) {
        if (!this.currentFilePath) return;

        const landmarks = this.landmarksPerFile.get(this.currentFilePath);
        landmarks.push(landmark);
    }

    /**
     * Get landmarks for the current file
     */
    getCurrentLandmarks() {
        if (!this.currentFilePath) return [];
        return this.landmarksPerFile.get(this.currentFilePath) || [];
    }

    /**
     * Set landmarks for a specific file
     */
    setLandmarks(filepath, landmarks) {
        this.landmarksPerFile.set(filepath, landmarks);
    }

    /**
     * Update landmarks for current file from viewer
     */
    updateFromViewer(landmarks) {
        if (!this.currentFilePath) return;
        this.landmarksPerFile.set(this.currentFilePath, landmarks);
    }

    /**
     * Reset landmarks for current file
     */
    resetCurrentLandmarks() {
        if (!this.currentFilePath) return;
        this.landmarksPerFile.set(this.currentFilePath, []);
    }

    /**
     * Set boundary indices for current file
     */
    setBoundaryIndices(indices) {
        if (!this.currentFilePath) return;
        this.boundariesPerFile.set(this.currentFilePath, indices);
    }

    /**
     * Get boundary indices for current file
     */
    getCurrentBoundaries() {
        if (!this.currentFilePath) return [];
        return this.boundariesPerFile.get(this.currentFilePath) || [];
    }

    /**
     * Get all files with their landmarks and boundaries for saving
     */
    getAllFilesData() {
        const data = [];
        for (const [filepath, landmarks] of this.landmarksPerFile) {
            data.push({
                filepath: filepath,
                landmarks: landmarks,
                boundaryIndices: this.boundariesPerFile.get(filepath) || []
            });
        }
        return data;
    }

    /**
     * Clear all data
     */
    clearAll() {
        this.landmarksPerFile.clear();
        this.boundariesPerFile.clear();
        this.currentFilePath = null;
    }

    /**
     * Check if any file has landmarks
     */
    hasAnyLandmarks() {
        for (const landmarks of this.landmarksPerFile.values()) {
            if (landmarks.length > 0) return true;
        }
        return false;
    }
}

// Export to window
window.LandmarkManager = LandmarkManager;
