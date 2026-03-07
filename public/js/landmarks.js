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
        // Track which files have unsaved changes
        this.dirtyFiles = new Set();
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
        this.dirtyFiles.add(this.currentFilePath);
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
        const existing = this.landmarksPerFile.get(this.currentFilePath) || [];
        // Only mark dirty if landmarks actually changed
        const changed = JSON.stringify(existing) !== JSON.stringify(landmarks);
        this.landmarksPerFile.set(this.currentFilePath, landmarks);
        if (changed) {
            this.dirtyFiles.add(this.currentFilePath);
        }
    }

    /**
     * Reset landmarks for current file
     */
    resetCurrentLandmarks() {
        if (!this.currentFilePath) return;
        this.landmarksPerFile.set(this.currentFilePath, []);
        this.dirtyFiles.add(this.currentFilePath);
    }

    /**
     * Remove a single landmark by its index number from current file
     */
    removeLandmark(landmarkIndex) {
        if (!this.currentFilePath) return;
        const landmarks = this.landmarksPerFile.get(this.currentFilePath);
        if (!landmarks) return;
        this.landmarksPerFile.set(
            this.currentFilePath,
            landmarks.filter(lm => lm.index !== landmarkIndex)
        );
        this.dirtyFiles.add(this.currentFilePath);
    }

    /**
     * Rename a landmark's index number
     * Returns false if newIndex already exists
     */
    renameLandmark(oldIndex, newIndex) {
        if (!this.currentFilePath) return false;
        const landmarks = this.landmarksPerFile.get(this.currentFilePath);
        if (!landmarks) return false;

        // Check for duplicates
        if (landmarks.some(lm => lm.index === newIndex)) {
            return false;
        }

        const lm = landmarks.find(l => l.index === oldIndex);
        if (lm) {
            lm.index = newIndex;
            this.dirtyFiles.add(this.currentFilePath);
        }
        return true;
    }

    /**
     * Get the next available (unused) landmark number for current file
     */
    getNextAvailableNumber(startFrom = 1) {
        if (!this.currentFilePath) return startFrom;
        const landmarks = this.landmarksPerFile.get(this.currentFilePath) || [];
        const usedNumbers = new Set(landmarks.map(lm => lm.index));
        let num = startFrom;
        while (usedNumbers.has(num)) {
            num++;
        }
        return num;
    }

    /**
     * Check if a landmark number is already used for current file
     */
    isNumberUsed(num) {
        if (!this.currentFilePath) return false;
        const landmarks = this.landmarksPerFile.get(this.currentFilePath) || [];
        return landmarks.some(lm => lm.index === num);
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
        for (const filepath of this.dirtyFiles) {
            const landmarks = this.landmarksPerFile.get(filepath);
            // Only include files that have landmarks placed
            if (!landmarks || landmarks.length === 0) continue;
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
        this.dirtyFiles.clear();
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

    /**
     * Clear the dirty set after a successful save
     */
    clearDirty() {
        this.dirtyFiles.clear();
    }

    /**
     * Get count of unsaved files
     */
    getDirtyCount() {
        return this.dirtyFiles.size;
    }
}

// Export to window
window.LandmarkManager = LandmarkManager;
