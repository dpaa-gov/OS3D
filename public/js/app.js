/**
 * OS3D - Main Application Logic
 */

// ====== Notification Sound ======
function playCompletionChime() {
    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        const ctx = new AudioCtx();
        const gain = ctx.createGain();
        gain.connect(ctx.destination);
        gain.gain.setValueAtTime(0.25, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.8);

        const playTone = (freq, start, dur) => {
            const osc = ctx.createOscillator();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, start);
            osc.connect(gain);
            osc.start(start);
            osc.stop(start + dur);
        };

        playTone(523.25, ctx.currentTime, 0.2);        // C5
        playTone(659.25, ctx.currentTime + 0.15, 0.2); // E5
        playTone(783.99, ctx.currentTime + 0.3, 0.4);  // G5
    } catch (e) {
        // Audio not available — silently ignore
    }
}

// Global state
const app = {
    // Landmarks tab state
    landmarks: {
        viewer: null,
        manager: null,
        directory: '',
        plyFiles: [],
        currentIndex: 0,
        isLoading: false
    },
    // Analysis tab state
    analysis: {
        directory: '',
        leftFiles: [],
        rightFiles: [],
        results: [],
        bestMatches: [],
        activeResultsTab: 'best', // 'best' or 'all'
        isRunning: false,
        startTime: null,
        timerInterval: null,
        // Pagination
        allResultsPage: 1,
        bestMatchesPage: 1,
        resultsPerPage: 100
    },
    // Browser modal state
    browser: {
        currentPath: '/',
        targetInput: null,
        onSelect: null
    },
    // Reference viewer state
    reference: {
        viewer: null,
        isVisible: false
    }
};

// ====== Initialize ======
document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    initLandmarksTab();
    initAnalysisTab();
    initBrowserModal();
    initReferencePanel();
    initKeyboardShortcuts();
});

// ====== Keyboard Shortcuts ======
function initKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // Don't trigger shortcuts when typing in input fields
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        // Only apply shortcuts when landmarks tab is active
        const landmarksTab = document.getElementById('landmarks-tab');
        if (!landmarksTab || !landmarksTab.classList.contains('active')) return;

        const key = e.key;

        // Arrow keys — navigate models
        if (key === 'ArrowLeft') {
            e.preventDefault();
            const btn = document.getElementById('prev-model-btn');
            if (!btn.disabled) btn.click();
            return;
        }
        if (key === 'ArrowRight') {
            e.preventDefault();
            const btn = document.getElementById('next-model-btn');
            if (!btn.disabled) btn.click();
            return;
        }



        // Backspace — Reset Landmarks
        if (key === 'Backspace') {
            e.preventDefault();
            const btn = document.getElementById('reset-landmarks-btn');
            if (!btn.disabled) btn.click();
            return;
        }

        // R — Set as Reference
        if (key === 'r' || key === 'R') {
            e.preventDefault();
            const btn = document.getElementById('set-reference-btn');
            if (!btn.disabled) btn.click();
            return;
        }

        // Ctrl+S — Save All
        if ((e.ctrlKey || e.metaKey) && key === 's') {
            e.preventDefault();
            const btn = document.getElementById('global-save-btn');
            if (!btn.disabled) btn.click();
            return;
        }

        // Escape — Clear reference panel
        if (key === 'Escape' && app.reference.isVisible) {
            e.preventDefault();
            hideReferencePanel();
            return;
        }
    });
}

// ====== Tab Navigation ======
function initTabs() {
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.dataset.tab;

            // Update buttons
            tabButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Update content
            tabContents.forEach(content => {
                content.classList.remove('active');
                if (content.id === `${tabId}-tab`) {
                    content.classList.add('active');
                }
            });

            // Initialize viewer when landmarks tab is shown
            if (tabId === 'landmarks' && !app.landmarks.viewer) {
                // Will be initialized when first directory is loaded
            }
        });
    });
}

// ====== Landmarks Tab ======
function initLandmarksTab() {
    app.landmarks.manager = new LandmarkManager();

    // Browse button
    document.getElementById('landmark-browse-btn').addEventListener('click', () => {
        openBrowserModal(
            document.getElementById('landmark-path'),
            (path) => loadLandmarkDirectory(path)
        );
    });

    // Clear button
    document.getElementById('landmark-clear-btn').addEventListener('click', () => {
        clearLandmarkDirectory();
    });

    // Navigation buttons
    document.getElementById('prev-model-btn').addEventListener('click', () => {
        navigateModel(-1);
    });

    document.getElementById('next-model-btn').addEventListener('click', () => {
        navigateModel(1);
    });

    // Model counter input — jump to model number
    const counterInput = document.getElementById('model-counter-input');
    const jumpToModel = () => {
        const targetNum = parseInt(counterInput.value);
        if (isNaN(targetNum) || app.landmarks.isLoading) return;
        const targetIndex = Math.max(0, Math.min(targetNum - 1, app.landmarks.plyFiles.length - 1));
        if (targetIndex !== app.landmarks.currentIndex) {
            if (app.landmarks.viewer) {
                const currentLandmarks = app.landmarks.viewer.getLandmarks();
                app.landmarks.manager.updateFromViewer(currentLandmarks);
            }
            app.landmarks.currentIndex = targetIndex;
            loadCurrentModel();
        } else {
            counterInput.value = targetIndex + 1;
        }
    };
    counterInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            jumpToModel();
            counterInput.blur();
        }
    });
    counterInput.addEventListener('blur', jumpToModel);

    // Reset landmarks button
    document.getElementById('reset-landmarks-btn').addEventListener('click', () => {
        resetCurrentLandmarks();
    });

    // Global save button
    document.getElementById('global-save-btn').addEventListener('click', () => {
        saveAllLandmarks();
    });



    // Next landmark number input
    const nextNumInput = document.getElementById('next-landmark-num');
    nextNumInput.addEventListener('change', () => {
        const num = parseInt(nextNumInput.value);
        if (num >= 1 && app.landmarks.viewer) {
            app.landmarks.viewer.setNextLandmarkNumber(num);
            // Warn if number is already used
            if (app.landmarks.manager.isNumberUsed(num)) {
                nextNumInput.classList.add('input-warning');
            } else {
                nextNumInput.classList.remove('input-warning');
            }
        }
    });
    nextNumInput.addEventListener('input', () => {
        const num = parseInt(nextNumInput.value);
        if (num >= 1 && app.landmarks.manager.isNumberUsed(num)) {
            nextNumInput.classList.add('input-warning');
        } else {
            nextNumInput.classList.remove('input-warning');
        }
    });

    // Sensitivity slider
    const sensitivitySlider = document.getElementById('sensitivity-slider');
    const sensitivityValue = document.getElementById('sensitivity-value');
    sensitivitySlider.addEventListener('input', () => {
        const val = parseFloat(sensitivitySlider.value);
        sensitivityValue.textContent = val.toFixed(1);
        if (app.landmarks.viewer) {
            app.landmarks.viewer.setSensitivity(val);
        }
    });
    // Release focus after dragging so arrow keys go back to model navigation
    sensitivitySlider.addEventListener('change', () => {
        sensitivitySlider.blur();
    });
}

async function loadLandmarkDirectory(directory) {
    app.landmarks.directory = directory;
    document.getElementById('landmark-path').value = directory;

    // Show loading modal
    document.getElementById('loading-title').textContent = 'Loading Models';
    document.getElementById('loading-status').textContent = 'Scanning directory...';
    document.getElementById('elapsed-timer').textContent = '00:00';
    document.getElementById('loading-modal').classList.add('active');
    app.analysis.startTime = Date.now();
    startTimer();

    try {
        const data = await window.os3d.invoke('list_ply_files', { directory });

        if (data.error) {
            stopTimer();
            hideLoadingModal();
            alert('Error: ' + data.error);
            return;
        }

        app.landmarks.plyFiles = data.files;
        app.landmarks.currentIndex = 0;

        // Update UI
        document.getElementById('landmark-clear-btn').disabled = false;
        document.getElementById('global-save-btn').disabled = false;

        if (data.files.length > 0) {
            document.getElementById('loading-status').textContent = `Found ${data.files.length} models`;

            // Initialize viewer if needed
            if (!app.landmarks.viewer) {
                app.landmarks.viewer = new ThreeViewer('viewer-container');
                app.landmarks.viewer.init();
                app.landmarks.viewer.onLandmarkPlaced = (landmark) => {
                    app.landmarks.manager.addLandmark(landmark);
                    updateLandmarkList();
                    // Auto-advance to next available number
                    const nextNum = app.landmarks.manager.getNextAvailableNumber(landmark.index + 1);
                    app.landmarks.viewer.setNextLandmarkNumber(nextNum);
                    const nextNumInput = document.getElementById('next-landmark-num');
                    nextNumInput.value = nextNum;
                    nextNumInput.classList.remove('input-warning');
                };
                app.landmarks.viewer.onLandmarkMoved = (landmark) => {
                    // Update position in manager (sync from viewer, marks dirty)
                    const currentLandmarks = app.landmarks.viewer.getLandmarks();
                    app.landmarks.manager.updateFromViewer(currentLandmarks);
                    updateLandmarkList();
                };
            }

            // Import previously saved landmarks from processed/ folder
            document.getElementById('loading-status').textContent = 'Checking for saved landmarks...';
            try {
                const imported = await window.os3d.invoke('import_processed', { directory });
                if (imported.count > 0) {
                    document.getElementById('loading-status').textContent =
                        `Importing ${imported.count} saved files...`;

                    const processedPaths = new Set();
                    for (const file of imported.files) {
                        app.landmarks.manager.setCurrentFile(file.plyPath);
                        if (file.landmarks && file.landmarks.length > 0) {
                            app.landmarks.manager.setLandmarks(file.plyPath, file.landmarks);
                        }
                        if (file.boundaryIndices && file.boundaryIndices.length > 0) {
                            app.landmarks.manager.setBoundaryIndices(file.boundaryIndices);
                        }
                        processedPaths.add(file.plyPath);
                    }

                    // Find first unprocessed model, or start at 0 if all done
                    let firstUnprocessed = 0;
                    for (let i = 0; i < data.files.length; i++) {
                        if (!processedPaths.has(data.files[i])) {
                            firstUnprocessed = i;
                            break;
                        }
                    }
                    app.landmarks.currentIndex = firstUnprocessed;

                    document.getElementById('loading-status').textContent =
                        `Imported ${imported.count} saved files, loading model ${firstUnprocessed + 1}...`;
                }
            } catch (err) {
                console.warn('Could not import processed landmarks:', err);
            }

            // Set current file for manager before loading
            app.landmarks.manager.setCurrentFile(data.files[app.landmarks.currentIndex]);
            loadCurrentModel();
        } else {
            alert('No PLY files found in this directory');
        }

    } catch (error) {
        console.error('Error loading directory:', error);
        alert('Failed to load directory');
    } finally {
        stopTimer();
        hideLoadingModal();
    }
}




async function loadCurrentModel() {
    const files = app.landmarks.plyFiles;
    if (files.length === 0) return;

    // Prevent concurrent loading
    if (app.landmarks.isLoading) return;
    app.landmarks.isLoading = true;

    const filepath = files[app.landmarks.currentIndex];

    // Save current landmarks before switching (skip if no model loaded yet,
    // otherwise we'd overwrite imported landmarks with an empty array)
    if (app.landmarks.viewer && app.landmarks.viewer.model) {
        const currentLandmarks = app.landmarks.viewer.getLandmarks();
        app.landmarks.manager.updateFromViewer(currentLandmarks);
    }

    // Set current file in manager
    app.landmarks.manager.setCurrentFile(filepath);

    // Check if we have saved landmarks for this file
    const savedLandmarks = app.landmarks.manager.getCurrentLandmarks();

    try {
        // Load model using the new method that handles binary PLY files
        const success = await app.landmarks.viewer.loadModelFromPath(filepath, savedLandmarks);

        if (!success) {
            alert('Failed to load model: ' + filepath);
            return;
        }

        // Update UI
        updateModelInfo();
        updateLandmarkList();
        updateNavigationButtons();

        // Sync next landmark number input to the next available for this model
        const nextNum = app.landmarks.manager.getNextAvailableNumber();
        app.landmarks.viewer.setNextLandmarkNumber(nextNum);
        const nextNumInput = document.getElementById('next-landmark-num');
        nextNumInput.value = nextNum;
        nextNumInput.classList.remove('input-warning');

        // Re-apply boundary highlights if previously detected, otherwise auto-detect
        const storedBoundaries = app.landmarks.manager.getCurrentBoundaries();
        if (storedBoundaries.length > 0) {
            app.landmarks.viewer.highlightBoundaryVertices(storedBoundaries);
        } else {
            // Auto-detect boundaries silently (no loading modal)
            autoDetectHoles(filepath);
        }

        // NOW unblock clicks — all post-load state (nextLandmarkNumber etc.)
        // is synced. Before this point, loadModelFromPath intentionally
        // keeps isLoading=true to prevent phantom landmark placement.
        app.landmarks.viewer.isLoading = false;
    } finally {
        app.landmarks.isLoading = false;
    }
}

function navigateModel(direction) {
    // Prevent navigation while loading
    if (app.landmarks.isLoading) return;

    const newIndex = app.landmarks.currentIndex + direction;

    if (newIndex >= 0 && newIndex < app.landmarks.plyFiles.length) {
        // Save current landmarks
        if (app.landmarks.viewer) {
            const currentLandmarks = app.landmarks.viewer.getLandmarks();
            app.landmarks.manager.updateFromViewer(currentLandmarks);
        }

        app.landmarks.currentIndex = newIndex;
        loadCurrentModel();
    }
}

function updateModelInfo() {
    const files = app.landmarks.plyFiles;
    const index = app.landmarks.currentIndex;

    const filename = files[index] ? files[index].split(/[/\\]/).pop() : 'No model loaded';
    document.getElementById('current-model-name').textContent = filename;
    document.getElementById('model-counter-input').value = index + 1;
    document.getElementById('model-counter-input').max = files.length;
    document.getElementById('model-total').textContent = files.length;
}

function updateNavigationButtons() {
    const index = app.landmarks.currentIndex;
    const total = app.landmarks.plyFiles.length;

    document.getElementById('prev-model-btn').disabled = index === 0;
    document.getElementById('next-model-btn').disabled = index >= total - 1;
    document.getElementById('reset-landmarks-btn').disabled = total === 0;

    document.getElementById('set-reference-btn').disabled = total === 0;
    document.getElementById('model-counter-input').disabled = total === 0;
}

function updateLandmarkList() {
    const list = document.getElementById('landmark-list');
    const landmarks = app.landmarks.viewer ? app.landmarks.viewer.getLandmarks() : [];

    if (landmarks.length === 0) {
        list.innerHTML = '<p class="placeholder-text">Click on the model to place landmarks</p>';
        return;
    }

    list.innerHTML = landmarks.map(lm => {
        const color = app.landmarks.viewer ? app.landmarks.viewer.getLandmarkColor(lm.index) : '#2563eb';
        return `
        <div class="landmark-item" data-landmark-index="${lm.index}">
            <span class="landmark-color-dot" style="background:${color}"></span>
            <span class="index editable-index" title="Click to renumber" style="color:${color}">${lm.index}</span>
            <span class="coords">(${lm.x.toFixed(2)}, ${lm.y.toFixed(2)}, ${lm.z.toFixed(2)})</span>
            <button class="landmark-delete-btn" title="Remove landmark">✕</button>
        </div>
    `}).join('');

    // Attach click handlers for editable index badges
    list.querySelectorAll('.editable-index').forEach(badge => {
        badge.addEventListener('click', (e) => {
            const item = e.target.closest('.landmark-item');
            const oldIndex = parseInt(item.dataset.landmarkIndex);
            const currentVal = e.target.textContent;

            // Replace badge with an input
            const input = document.createElement('input');
            input.type = 'number';
            input.min = '1';
            input.value = currentVal;
            input.className = 'landmark-rename-input';
            e.target.replaceWith(input);
            input.focus();
            input.select();

            const commitRename = () => {
                const newIndex = parseInt(input.value);
                if (isNaN(newIndex) || newIndex < 1) {
                    updateLandmarkList(); // revert
                    return;
                }
                if (newIndex === oldIndex) {
                    updateLandmarkList(); // no change
                    return;
                }
                const success = app.landmarks.manager.renameLandmark(oldIndex, newIndex);
                if (!success) {
                    alert(`Landmark #${newIndex} already exists.`);
                    updateLandmarkList(); // revert
                    return;
                }
                app.landmarks.viewer.updateLandmarkNumber(oldIndex, newIndex);
                updateLandmarkList();
                // Update next-landmark input in case it should change
                const nextNum = app.landmarks.manager.getNextAvailableNumber();
                const nextNumInput = document.getElementById('next-landmark-num');
                nextNumInput.value = nextNum;
                app.landmarks.viewer.setNextLandmarkNumber(nextNum);
                nextNumInput.classList.remove('input-warning');
            };

            input.addEventListener('blur', commitRename);
            input.addEventListener('keydown', (ev) => {
                if (ev.key === 'Enter') {
                    ev.preventDefault();
                    input.blur();
                }
                if (ev.key === 'Escape') {
                    updateLandmarkList(); // revert
                }
            });
        });
    });

    // Attach click handlers for delete buttons
    list.querySelectorAll('.landmark-delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const item = e.target.closest('.landmark-item');
            const lmIndex = parseInt(item.dataset.landmarkIndex);

            // Remove from manager and viewer
            app.landmarks.manager.removeLandmark(lmIndex);
            app.landmarks.viewer.removeLandmarkByIndex(lmIndex);
            updateLandmarkList();

            // Update next-landmark input
            const nextNum = app.landmarks.manager.getNextAvailableNumber();
            const nextNumInput = document.getElementById('next-landmark-num');
            nextNumInput.value = nextNum;
            app.landmarks.viewer.setNextLandmarkNumber(nextNum);
            nextNumInput.classList.remove('input-warning');
        });
    });
}

function resetCurrentLandmarks() {
    if (!app.landmarks.viewer) return;

    app.landmarks.viewer.resetLandmarks();
    app.landmarks.manager.resetCurrentLandmarks();
    updateLandmarkList();

    // Reset next landmark input to 1
    const nextNumInput = document.getElementById('next-landmark-num');
    nextNumInput.value = 1;
    if (app.landmarks.viewer) {
        app.landmarks.viewer.setNextLandmarkNumber(1);
    }
    nextNumInput.classList.remove('input-warning');
}



// Silent auto-detect: no loading modal, no error alerts.
// Called automatically on model load when no boundaries are stored.
async function autoDetectHoles(filepath) {
    if (!app.landmarks.viewer) return;

    try {
        const data = await window.os3d.invoke('detect_holes', { path: filepath });

        // Verify the user hasn't navigated away while we were waiting
        const currentFilepath = app.landmarks.plyFiles[app.landmarks.currentIndex];
        if (currentFilepath !== filepath) return;

        if (data.error) {
            console.warn('Auto hole detection failed:', data.error);
            return;
        }

        if (data.boundaryIndices && data.boundaryIndices.length > 0) {
            app.landmarks.viewer.highlightBoundaryVertices(data.boundaryIndices);
            app.landmarks.manager.setBoundaryIndices(data.boundaryIndices);
            console.log(`Auto-detected ${data.count} boundary vertices`);
        } else {
            app.landmarks.manager.setBoundaryIndices([]);
        }
    } catch (error) {
        console.warn('Auto hole detection error:', error);
    }
}

function clearLandmarkDirectory() {
    // Hide reference panel if open
    if (app.reference.isVisible) {
        hideReferencePanel();
    }

    if (app.landmarks.viewer) {
        app.landmarks.viewer.dispose();
        app.landmarks.viewer = null;
    }

    app.landmarks.manager.clearAll();
    app.landmarks.directory = '';
    app.landmarks.plyFiles = [];
    app.landmarks.currentIndex = 0;

    // Reset UI
    document.getElementById('landmark-path').value = '';
    document.getElementById('landmark-clear-btn').disabled = true;
    document.getElementById('global-save-btn').disabled = true;
    document.getElementById('prev-model-btn').disabled = true;
    document.getElementById('next-model-btn').disabled = true;
    document.getElementById('reset-landmarks-btn').disabled = true;

    document.getElementById('set-reference-btn').disabled = true;
    document.getElementById('current-model-name').textContent = 'No model loaded';
    document.getElementById('model-counter-input').value = 0;
    document.getElementById('model-counter-input').disabled = true;
    document.getElementById('model-total').textContent = '0';
    document.getElementById('landmark-list').innerHTML = '<p class="placeholder-text">Click on the model to place landmarks</p>';

    // Reset next landmark number input
    const nextNumInput = document.getElementById('next-landmark-num');
    nextNumInput.value = 1;
    nextNumInput.classList.remove('input-warning');

    // Restore placeholder
    const container = document.getElementById('viewer-container');
    container.innerHTML = `
        <div class="viewer-placeholder">
            <span class="placeholder-icon">📦</span>
            <p>Select a directory to load PLY models</p>
        </div>
    `;
}

async function saveAllLandmarks() {
    // Save current viewer landmarks first
    if (app.landmarks.viewer) {
        const currentLandmarks = app.landmarks.viewer.getLandmarks();
        app.landmarks.manager.updateFromViewer(currentLandmarks);
    }

    const filesData = app.landmarks.manager.getAllFilesData();

    if (filesData.length === 0) {
        alert('No unsaved changes');
        return;
    }

    // Show loading modal — set text before making visible
    document.getElementById('loading-title').textContent = 'Saving Files';
    document.getElementById('loading-status').textContent = `Saving ${filesData.length} file(s) to processed folder...`;
    document.getElementById('elapsed-timer').textContent = '00:00';
    document.getElementById('loading-modal').classList.add('active');

    // Start timer
    app.analysis.startTime = Date.now();
    startTimer();

    try {
        const data = await window.os3d.invoke('save_all_landmarks', {
            files: filesData,
            sourceDirectory: app.landmarks.directory
        });

        // Hide loading modal and stop timer
        stopTimer();
        hideLoadingModal();

        if (data.success) {
            app.landmarks.manager.clearDirty();
        } else {
            alert('Some files failed to save: ' + JSON.stringify(data.errors));
        }

    } catch (error) {
        // Hide loading modal on error
        stopTimer();
        hideLoadingModal();
        console.error('Error saving landmarks:', error);
        alert('Failed to save landmarks');
    }
}

// ====== Reference Viewer Panel ======

function initReferencePanel() {
    app.reference.viewer = new ReferenceViewer('ref-viewer-container');

    // Set as Reference button
    document.getElementById('set-reference-btn').addEventListener('click', () => {
        setCurrentAsReference();
    });

    // Clear button
    document.getElementById('ref-clear-btn').addEventListener('click', () => {
        hideReferencePanel();
    });
}

function showReferencePanel() {
    app.reference.isVisible = true;
    const panel = document.getElementById('reference-panel');
    const layout = document.querySelector('.landmarks-layout');
    panel.classList.remove('reference-hidden');
    layout.classList.add('ref-visible');
    // Trigger resize after animation so the viewer picks up its new size
    setTimeout(() => {
        if (app.reference.viewer && app.reference.viewer.isInitialized) {
            app.reference.viewer.onResize();
        }
        // Also resize main viewer since it changed size
        if (app.landmarks.viewer && app.landmarks.viewer.isInitialized) {
            app.landmarks.viewer.onWindowResize();
        }
    }, 350);
}

function hideReferencePanel() {
    app.reference.isVisible = false;
    const panel = document.getElementById('reference-panel');
    const layout = document.querySelector('.landmarks-layout');
    panel.classList.add('reference-hidden');
    layout.classList.remove('ref-visible');
    app.reference.viewer.clear();
    document.getElementById('ref-model-name').textContent = 'No reference set';
    // Resize main viewer back to full width
    setTimeout(() => {
        if (app.landmarks.viewer && app.landmarks.viewer.isInitialized) {
            app.landmarks.viewer.onWindowResize();
        }
    }, 350);
}

async function setCurrentAsReference() {
    const files = app.landmarks.plyFiles;
    if (!files || files.length === 0) return;

    const filepath = files[app.landmarks.currentIndex];
    if (!filepath) return;

    // Get current landmarks from viewer
    const landmarks = app.landmarks.viewer ? app.landmarks.viewer.getLandmarks() : [];

    // Show panel
    showReferencePanel();

    // Update model name
    const filename = filepath.split('/').pop().split('\\').pop();
    document.getElementById('ref-model-name').textContent = filename;

    // Load into reference viewer
    await app.reference.viewer.loadReference(filepath, landmarks);
}

// ====== Analysis Tab ======
function initAnalysisTab() {
    // Browse button
    document.getElementById('analysis-browse-btn').addEventListener('click', () => {
        openBrowserModal(
            document.getElementById('analysis-path'),
            (path) => loadAnalysisDirectory(path)
        );
    });

    // Clear button
    document.getElementById('analysis-clear-btn').addEventListener('click', () => {
        clearAnalysisDirectory();
    });

    // Hausdorff slider
    const slider = document.getElementById('hausdorff-slider');
    const sliderValue = document.getElementById('hausdorff-value');
    slider.addEventListener('input', () => {
        sliderValue.textContent = slider.value;
    });

    // Best matches count slider
    const bestSlider = document.getElementById('best-matches-slider');
    const bestSliderValue = document.getElementById('best-matches-value');
    bestSlider.addEventListener('input', () => {
        bestSliderValue.textContent = bestSlider.value;
        // Recompute best matches from existing results
        if (app.analysis.results && app.analysis.results.length > 0) {
            const topN = parseInt(bestSlider.value);
            const bestMatches = computeBestMatches(app.analysis.results, topN);
            app.analysis.bestMatches = bestMatches;
            app.analysis.bestMatchesPage = 1;
            renderBestMatchesPage();
        }
    });

    // Run comparison button
    document.getElementById('run-comparison-btn').addEventListener('click', () => {
        runComparison();
    });

    // Export CSV button
    document.getElementById('export-csv-btn').addEventListener('click', () => {
        exportResultsCSV();
    });

    // Initialize comparison viewer
    ComparisonViewer.init('comparison-viewer-container');

    // Visualization: Back to results
    document.getElementById('viz-back-btn').addEventListener('click', () => {
        hideVisualization();
    });

    // Visualization: Toggle heatmap/dual-color
    document.getElementById('viz-toggle-btn').addEventListener('click', () => {
        const mode = ComparisonViewer.toggleMode();
        document.getElementById('viz-toggle-btn').textContent =
            mode === 'heatmap' ? 'Dual Color' : 'Heatmap';
        // Show colormap selector only in heatmap mode
        document.getElementById('colormap-control').style.display =
            mode === 'heatmap' ? '' : 'none';
        // Show dual-color legend only in dual mode
        document.getElementById('dual-color-legend').style.display =
            mode === 'dual' ? '' : 'none';
    });

    // Visualization: Point size slider
    const pointSizeSlider = document.getElementById('point-size-slider');
    const pointSizeValue = document.getElementById('point-size-value');
    pointSizeSlider.addEventListener('input', () => {
        const size = parseFloat(pointSizeSlider.value);
        pointSizeValue.textContent = size.toFixed(1);
        ComparisonViewer.setPointSize(size);
    });

    // Visualization: Colormap selector
    document.getElementById('colormap-select').addEventListener('change', (e) => {
        ComparisonViewer.setColormap(e.target.value);
    });

    // Results tab buttons
    document.getElementById('best-matches-tab-btn').addEventListener('click', () => {
        switchResultsTab('best');
    });
    document.getElementById('all-results-tab-btn').addEventListener('click', () => {
        switchResultsTab('all');
    });
}

async function loadAnalysisDirectory(directory) {
    app.analysis.directory = directory;
    document.getElementById('analysis-path').value = directory;

    try {
        const data = await window.os3d.invoke('get_analysis_files', { directory });

        if (data.error) {
            alert('Error: ' + data.error);
            return;
        }

        app.analysis.leftFiles = data.leftFiles;
        app.analysis.rightFiles = data.rightFiles;

        // Update UI
        updateFileList('left-files-list', data.leftFiles);
        updateFileList('right-files-list', data.rightFiles);
        document.getElementById('left-count').textContent = data.leftCount;
        document.getElementById('right-count').textContent = data.rightCount;

        document.getElementById('analysis-clear-btn').disabled = false;
        document.getElementById('run-comparison-btn').disabled =
            data.leftFiles.length === 0 || data.rightFiles.length === 0;

    } catch (error) {
        console.error('Error loading analysis directory:', error);
        alert('Failed to load directory');
    }
}

function updateFileList(elementId, files) {
    const list = document.getElementById(elementId);

    if (files.length === 0) {
        list.innerHTML = '<p class="placeholder-text">No files found</p>';
        return;
    }

    list.innerHTML = files.map(file => `
        <div class="file-item" title="${file}">${file.split(/[/\\]/).pop()}</div>
    `).join('');
}

async function runComparison() {
    if (app.analysis.isRunning) return;

    const leftFiles = app.analysis.leftFiles;
    const rightFiles = app.analysis.rightFiles;
    const percentage = parseFloat(document.getElementById('hausdorff-slider').value);

    if (leftFiles.length === 0 || rightFiles.length === 0) {
        alert('Need both left and right files to run comparison');
        return;
    }

    // Show loading modal
    app.analysis.isRunning = true;
    app.analysis.startTime = Date.now();
    document.getElementById('loading-title').textContent = 'Running Comparisons';
    document.getElementById('loading-status').textContent = 'Processing comparisons...';
    document.getElementById('elapsed-timer').textContent = '00:00';
    document.getElementById('loading-modal').classList.add('active');
    startTimer();

    try {
        const data = await window.os3d.invoke('run_comparison', {
            leftFiles,
            rightFiles,
            percentage
        });

        if (data.error) {
            alert('Error: ' + data.error);
        } else {
            app.analysis.results = data.results;
            updateResultsTable(data.results);

            document.getElementById('export-csv-btn').disabled = false;

            // Show elapsed time in results header
            const elapsed = Date.now() - app.analysis.startTime;
            const totalSecs = Math.floor(elapsed / 1000);
            const mins = Math.floor(totalSecs / 60);
            const secs = totalSecs % 60;
            const parts = [];
            if (mins > 0) parts.push(`${mins} ${mins === 1 ? 'minute' : 'minutes'}`);
            parts.push(`${secs} ${secs === 1 ? 'second' : 'seconds'}`);
            const completedEl = document.getElementById('completed-time');
            const totalComparisons = leftFiles.length * rightFiles.length;
            completedEl.textContent = `${totalComparisons} comparisons in ${parts.join(' ')}`;
            completedEl.style.display = '';

            // Play notification chime on successful completion
            playCompletionChime();
        }

    } catch (error) {
        console.error('Error running comparison:', error);
        alert('Comparison failed');
    } finally {
        hideLoadingModal();
        stopTimer();
        app.analysis.isRunning = false;
    }
}

// ── Comparison Visualization ─────────────────────────

function resolveFilePath(basename, fileList) {
    // Cross-platform: split on both / and \ to match basenames
    return fileList.find(f => {
        const parts = f.split(/[/\\]/);
        return parts[parts.length - 1] === basename;
    }) || null;
}

async function visualizePair(leftName, rightName, distance) {
    const leftPath = resolveFilePath(leftName, app.analysis.leftFiles);
    const rightPath = resolveFilePath(rightName, app.analysis.rightFiles);

    if (!leftPath || !rightPath) {
        alert('Could not resolve file paths for visualization');
        return;
    }

    // Update header
    document.getElementById('viz-pair-label').textContent = `${leftName} \u2194 ${rightName}`;
    document.getElementById('viz-distance').textContent = `HD: ${distance}`;
    document.getElementById('viz-toggle-btn').textContent = 'Dual Color';

    // Show loading
    document.getElementById('loading-title').textContent = 'Visualizing Pair';
    document.getElementById('loading-status').textContent = 'Running ICP registration...';
    document.getElementById('elapsed-timer').textContent = '00:00';
    document.getElementById('loading-modal').classList.add('active');
    app.analysis.startTime = Date.now();
    startTimer();

    try {
        const percentage = parseFloat(document.getElementById('hausdorff-slider').value);
        const data = await window.os3d.invoke('visualize_pair', {
            leftFile: leftPath,
            rightFile: rightPath,
            percentage
        });

        stopTimer();
        hideLoadingModal();

        if (data.error) {
            alert('Visualization error: ' + data.error);
            return;
        }

        ComparisonViewer.loadResults(data);
        showVisualization();

    } catch (error) {
        stopTimer();
        hideLoadingModal();
        console.error('Visualization error:', error);
        alert('Failed to visualize pair');
    }
}

function showVisualization() {
    document.querySelector('.file-lists-container').style.display = 'none';
    document.querySelector('.results-panel').style.display = 'none';
    document.getElementById('comparison-viz').style.display = 'flex';
}

function hideVisualization() {
    ComparisonViewer.clear();
    document.querySelector('.file-lists-container').style.display = '';
    document.querySelector('.results-panel').style.display = '';
    document.getElementById('comparison-viz').style.display = 'none';
}

function hideLoadingModal() {
    document.getElementById('loading-modal').classList.remove('active');
    document.getElementById('elapsed-timer').textContent = '00:00';
}

function startTimer() {
    stopTimer(); // Clear any stale timer from a previous operation
    const timerEl = document.getElementById('elapsed-timer');

    app.analysis.timerInterval = setInterval(() => {
        const elapsed = Date.now() - app.analysis.startTime;
        const seconds = Math.floor(elapsed / 1000);
        const minutes = Math.floor(seconds / 60);
        const secs = seconds % 60;
        timerEl.textContent = `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }, 1000);
}

function stopTimer() {
    if (app.analysis.timerInterval) {
        clearInterval(app.analysis.timerInterval);
        app.analysis.timerInterval = null;
    }
}

function switchResultsTab(tab) {
    app.analysis.activeResultsTab = tab;

    // Update tab buttons
    document.getElementById('best-matches-tab-btn').classList.toggle('active', tab === 'best');
    document.getElementById('all-results-tab-btn').classList.toggle('active', tab === 'all');

    // Update content visibility
    document.getElementById('best-matches-content').classList.toggle('active', tab === 'best');
    document.getElementById('all-results-content').classList.toggle('active', tab === 'all');
}

function computeBestMatches(results, topN = 1) {
    if (results.length === 0) return [];

    // Find top-N best matches for each left file
    const bestForLeft = new Map();
    for (const r of results) {
        if (!bestForLeft.has(r.leftFile)) {
            bestForLeft.set(r.leftFile, []);
        }
        bestForLeft.get(r.leftFile).push(r);
    }
    // Sort each left file's matches by distance and keep top-N
    for (const [key, matches] of bestForLeft) {
        matches.sort((a, b) => a.distance - b.distance);
        bestForLeft.set(key, matches.slice(0, topN));
    }

    // Find top-N best matches for each right file
    const bestForRight = new Map();
    for (const r of results) {
        if (!bestForRight.has(r.rightFile)) {
            bestForRight.set(r.rightFile, []);
        }
        bestForRight.get(r.rightFile).push(r);
    }
    // Sort each right file's matches by distance and keep top-N
    for (const [key, matches] of bestForRight) {
        matches.sort((a, b) => a.distance - b.distance);
        bestForRight.set(key, matches.slice(0, topN));
    }

    // Combine and deduplicate
    // If left's best includes right and right's best includes the same left, only include once
    const bestMatches = [];
    const addedPairs = new Set();

    // Add best matches for left files
    for (const matches of bestForLeft.values()) {
        for (const r of matches) {
            const pairKey = `${r.leftFile}|${r.rightFile}`;
            if (!addedPairs.has(pairKey)) {
                bestMatches.push(r);
                addedPairs.add(pairKey);
            }
        }
    }

    // Add best matches for right files (if not already added)
    for (const matches of bestForRight.values()) {
        for (const r of matches) {
            const pairKey = `${r.leftFile}|${r.rightFile}`;
            if (!addedPairs.has(pairKey)) {
                bestMatches.push(r);
                addedPairs.add(pairKey);
            }
        }
    }

    // Sort by distance
    bestMatches.sort((a, b) => a.distance - b.distance);

    return bestMatches;
}

function updateResultsTable(results) {
    // Store results
    app.analysis.results = results;

    // Reset pagination
    app.analysis.allResultsPage = 1;
    app.analysis.bestMatchesPage = 1;

    // Compute best matches using slider value
    const topN = parseInt(document.getElementById('best-matches-slider').value);
    const bestMatches = computeBestMatches(results, topN);
    app.analysis.bestMatches = bestMatches;

    // Render paginated tables
    renderAllResultsPage();
    renderBestMatchesPage();
}

function renderAllResultsPage() {
    const results = app.analysis.results;
    const page = app.analysis.allResultsPage;
    const perPage = app.analysis.resultsPerPage;
    const totalPages = Math.ceil(results.length / perPage);

    const start = (page - 1) * perPage;
    const end = Math.min(start + perPage, results.length);
    const pageResults = results.slice(start, end);

    const tbody = document.getElementById('results-tbody');

    if (results.length === 0) {
        tbody.innerHTML = `
            <tr class="placeholder-row">
                <td colspan="3">Run a comparison to see all results</td>
            </tr>
        `;
        updatePaginationControls('all', 0, 0, 0);
    } else {
        tbody.innerHTML = pageResults.map(r => `
            <tr onclick="visualizePair('${r.leftFile}', '${r.rightFile}', ${r.distance})">
                <td>${r.leftFile}</td>
                <td>${r.rightFile}</td>
                <td>${r.distance}</td>
            </tr>
        `).join('');
        updatePaginationControls('all', page, totalPages, results.length);
    }
}

function renderBestMatchesPage() {
    const results = app.analysis.bestMatches;
    const page = app.analysis.bestMatchesPage;
    const perPage = app.analysis.resultsPerPage;
    const totalPages = Math.ceil(results.length / perPage);

    const start = (page - 1) * perPage;
    const end = Math.min(start + perPage, results.length);
    const pageResults = results.slice(start, end);

    const tbody = document.getElementById('best-matches-tbody');

    if (results.length === 0) {
        tbody.innerHTML = `
            <tr class="placeholder-row">
                <td colspan="3">Run a comparison to see best matches</td>
            </tr>
        `;
        updatePaginationControls('best', 0, 0, 0);
    } else {
        tbody.innerHTML = pageResults.map(r => `
            <tr onclick="visualizePair('${r.leftFile}', '${r.rightFile}', ${r.distance})">
                <td>${r.leftFile}</td>
                <td>${r.rightFile}</td>
                <td>${r.distance}</td>
            </tr>
        `).join('');
        updatePaginationControls('best', page, totalPages, results.length);
    }
}

function updatePaginationControls(tableType, page, totalPages, totalResults) {
    const containerId = tableType === 'all' ? 'all-results-pagination' : 'best-matches-pagination';
    let container = document.getElementById(containerId);

    if (!container) return;

    if (totalPages <= 1) {
        container.innerHTML = totalResults > 0 ? `<span class="pagination-info">${totalResults} results</span>` : '';
        return;
    }

    container.innerHTML = `
        <button class="pagination-btn" onclick="goToPage('${tableType}', 1)" ${page === 1 ? 'disabled' : ''}>First</button>
        <button class="pagination-btn" onclick="goToPage('${tableType}', ${page - 1})" ${page === 1 ? 'disabled' : ''}>Prev</button>
        <span class="pagination-info">Page ${page} of ${totalPages} (${totalResults} results)</span>
        <button class="pagination-btn" onclick="goToPage('${tableType}', ${page + 1})" ${page === totalPages ? 'disabled' : ''}>Next</button>
        <button class="pagination-btn" onclick="goToPage('${tableType}', ${totalPages})" ${page === totalPages ? 'disabled' : ''}>Last</button>
    `;
}

function goToPage(tableType, page) {
    if (tableType === 'all') {
        const totalPages = Math.ceil(app.analysis.results.length / app.analysis.resultsPerPage);
        app.analysis.allResultsPage = Math.max(1, Math.min(page, totalPages));
        renderAllResultsPage();
    } else {
        const totalPages = Math.ceil(app.analysis.bestMatches.length / app.analysis.resultsPerPage);
        app.analysis.bestMatchesPage = Math.max(1, Math.min(page, totalPages));
        renderBestMatchesPage();
    }
}

async function exportResultsCSV() {
    // Export based on active tab
    let results;
    let filename;

    if (app.analysis.activeResultsTab === 'best') {
        results = app.analysis.bestMatches;
        filename = 'BestMatches';
    } else {
        results = app.analysis.results;
        filename = 'AllResults';
    }

    if (results.length === 0) return;

    let csv = 'Left Model,Right Model,Distance\n';
    for (const r of results) {
        csv += `"${r.leftFile}","${r.rightFile}",${r.distance}\n`;
    }

    // Generate timestamp for filename
    const now = new Date();
    const timestamp = now.getFullYear().toString() +
        (now.getMonth() + 1).toString().padStart(2, '0') +
        now.getDate().toString().padStart(2, '0') + '_' +
        now.getHours().toString().padStart(2, '0') +
        now.getMinutes().toString().padStart(2, '0') +
        now.getSeconds().toString().padStart(2, '0');

    const suggestedName = `${filename}_${timestamp}.csv`;

    // Download CSV via browser
    try {
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = suggestedName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (err) {
        console.error('Failed to export CSV:', err);
        alert('Failed to export CSV: ' + err);
    }
}

function clearResults() {
    app.analysis.results = [];
    app.analysis.bestMatches = [];
    updateResultsTable([]);
    document.getElementById('export-csv-btn').disabled = true;
    const completedEl = document.getElementById('completed-time');
    completedEl.textContent = '';
    completedEl.style.display = 'none';
}

function clearAnalysisDirectory() {
    app.analysis.directory = '';
    app.analysis.leftFiles = [];
    app.analysis.rightFiles = [];

    document.getElementById('analysis-path').value = '';
    document.getElementById('analysis-clear-btn').disabled = true;
    document.getElementById('run-comparison-btn').disabled = true;

    document.getElementById('left-files-list').innerHTML = '<p class="placeholder-text">No files loaded</p>';
    document.getElementById('right-files-list').innerHTML = '<p class="placeholder-text">No files loaded</p>';
    document.getElementById('left-count').textContent = '0';
    document.getElementById('right-count').textContent = '0';

    hideVisualization();
    clearResults();
}

// ====== Browser Modal ======
function initBrowserModal() {
    const modal = document.getElementById('browser-modal');

    // Close button
    modal.querySelector('.modal-close').addEventListener('click', closeBrowserModal);
    modal.querySelector('.modal-cancel').addEventListener('click', closeBrowserModal);

    // Parent directory button
    document.getElementById('parent-dir-btn').addEventListener('click', () => {
        const currentPath = app.browser.currentPath;
        // Handle both Unix (/) and Windows (\) separators
        const sep = currentPath.includes('\\') ? '\\' : '/';
        const parts = currentPath.split(sep).filter(p => p !== '');
        parts.pop();
        let parentPath = parts.join(sep);
        // Preserve root: Unix '/' or Windows 'C:\'
        if (sep === '/') {
            parentPath = '/' + parentPath;
        } else if (parts.length === 1) {
            parentPath = parts[0] + '\\';
        } else if (parts.length === 0) {
            return; // Already at root
        }
        browseDirectory(parentPath);
    });

    // Go to path button
    document.getElementById('go-to-path-btn').addEventListener('click', () => {
        const path = document.getElementById('modal-current-path').value;
        browseDirectory(path);
    });

    // Select directory button
    document.getElementById('select-directory-btn').addEventListener('click', () => {
        if (app.browser.onSelect) {
            app.browser.onSelect(app.browser.currentPath);
        }
        closeBrowserModal();
    });

    // Close on backdrop click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeBrowserModal();
    });
}

async function openBrowserModal(inputElement, onSelect) {
    app.browser.targetInput = inputElement;
    app.browser.onSelect = onSelect;

    // Start from input value or user's home directory
    let startPath = inputElement.value;
    if (!startPath) {
        try {
            const data = await window.os3d.invoke('get_homedir');
            startPath = data.path || '/';
        } catch {
            startPath = '/';
        }
    }

    document.getElementById('browser-modal').classList.add('active');
    browseDirectory(startPath);
}

function closeBrowserModal() {
    document.getElementById('browser-modal').classList.remove('active');
    app.browser.targetInput = null;
    app.browser.onSelect = null;
}

async function browseDirectory(path) {
    try {
        const data = await window.os3d.invoke('browse_directory', { path });

        if (data.error) {
            // Show error inline instead of alert() — native alert breaks GTK signal handlers on Linux
            const listing = document.getElementById('directory-listing');
            listing.innerHTML = `<div class="placeholder-text" style="color: var(--danger);">⚠ ${data.error}</div>`;
            return;
        }

        app.browser.currentPath = data.currentPath;
        document.getElementById('modal-current-path').value = data.currentPath;

        renderDirectoryListing(data.entries);

    } catch (error) {
        console.error('Error browsing directory:', error);
        alert('Failed to browse directory');
    }
}

function renderDirectoryListing(entries) {
    const listing = document.getElementById('directory-listing');

    if (entries.length === 0) {
        listing.innerHTML = '<div class="placeholder-text">Empty directory</div>';
        return;
    }

    listing.innerHTML = entries.map(entry => `
        <div class="dir-entry" data-path="${entry.path}" data-is-dir="${entry.isDirectory}">
            <span class="dir-entry-icon">${entry.isDirectory ? '📁' : (entry.isMesh ? '📦' : '📄')}</span>
            <span class="dir-entry-name">${entry.name}</span>
        </div>
    `).join('');

    // Add click handlers
    listing.querySelectorAll('.dir-entry').forEach(el => {
        el.addEventListener('dblclick', () => {
            if (el.dataset.isDir === 'true') {
                browseDirectory(el.dataset.path);
            }
        });
    });
}

// Disable right-click context menu for native app feel
document.addEventListener('contextmenu', (e) => e.preventDefault());
