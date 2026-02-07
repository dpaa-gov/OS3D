/**
 * OS3D - Main Application Logic
 */

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
    }
};

// ====== Initialize ======
document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    initLandmarksTab();
    initAnalysisTab();
    initBrowserModal();
    initHeartbeat();
});

// ====== Heartbeat — keeps server alive while browser is open ======
function initHeartbeat() {
    const sendHeartbeat = () => {
        fetch('/api/heartbeat', { method: 'POST' }).catch(() => { });
    };
    sendHeartbeat(); // Initial ping
    setInterval(sendHeartbeat, 5000); // Every 5 seconds
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

    // Reset landmarks button
    document.getElementById('reset-landmarks-btn').addEventListener('click', () => {
        resetCurrentLandmarks();
    });

    // Global save button
    document.getElementById('global-save-btn').addEventListener('click', () => {
        saveAllLandmarks();
    });

    // Detect holes button
    document.getElementById('detect-holes-btn').addEventListener('click', () => {
        detectHoles();
    });
}

async function loadLandmarkDirectory(directory) {
    app.landmarks.directory = directory;
    document.getElementById('landmark-path').value = directory;

    try {
        const response = await fetch('/api/ply/list', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ directory })
        });

        const data = await response.json();

        if (data.error) {
            alert('Error: ' + data.error);
            return;
        }

        app.landmarks.plyFiles = data.files;
        app.landmarks.currentIndex = 0;

        // Update UI
        document.getElementById('landmark-clear-btn').disabled = false;
        document.getElementById('global-save-btn').disabled = false;

        if (data.files.length > 0) {
            // Initialize viewer if needed
            if (!app.landmarks.viewer) {
                app.landmarks.viewer = new ThreeViewer('viewer-container');
                app.landmarks.viewer.init();
                app.landmarks.viewer.onLandmarkPlaced = (landmark) => {
                    app.landmarks.manager.addLandmark(landmark);
                    updateLandmarkList();
                };
            }

            loadCurrentModel();
        } else {
            alert('No PLY files found in this directory');
        }

    } catch (error) {
        console.error('Error loading directory:', error);
        alert('Failed to load directory');
    }
}

async function loadCurrentModel() {
    const files = app.landmarks.plyFiles;
    if (files.length === 0) return;

    // Prevent concurrent loading
    if (app.landmarks.isLoading) return;
    app.landmarks.isLoading = true;

    const filepath = files[app.landmarks.currentIndex];

    // Save current landmarks before switching
    if (app.landmarks.viewer) {
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

    const filename = files[index] ? files[index].split('/').pop() : 'No model loaded';
    document.getElementById('current-model-name').textContent = filename;
    document.getElementById('model-counter').textContent = `${index + 1} / ${files.length}`;
}

function updateNavigationButtons() {
    const index = app.landmarks.currentIndex;
    const total = app.landmarks.plyFiles.length;

    document.getElementById('prev-model-btn').disabled = index === 0;
    document.getElementById('next-model-btn').disabled = index >= total - 1;
    document.getElementById('reset-landmarks-btn').disabled = total === 0;
    document.getElementById('detect-holes-btn').disabled = total === 0;
}

function updateLandmarkList() {
    const list = document.getElementById('landmark-list');
    const landmarks = app.landmarks.viewer ? app.landmarks.viewer.getLandmarks() : [];

    if (landmarks.length === 0) {
        list.innerHTML = '<p class="placeholder-text">Click on the model to place landmarks</p>';
        return;
    }

    list.innerHTML = landmarks.map(lm => `
        <div class="landmark-item">
            <span class="index">${lm.index}</span>
            <span class="coords">(${lm.x.toFixed(2)}, ${lm.y.toFixed(2)}, ${lm.z.toFixed(2)})</span>
        </div>
    `).join('');
}

function resetCurrentLandmarks() {
    if (!app.landmarks.viewer) return;

    app.landmarks.viewer.resetLandmarks();
    app.landmarks.manager.resetCurrentLandmarks();
    updateLandmarkList();
}

async function detectHoles() {
    if (!app.landmarks.viewer) return;

    const files = app.landmarks.plyFiles;
    if (files.length === 0) return;

    const filepath = files[app.landmarks.currentIndex];

    // Show loading modal
    document.getElementById('loading-modal').classList.add('active');
    document.getElementById('loading-title').textContent = 'Detecting Holes';
    document.getElementById('loading-status').textContent = 'Analyzing mesh boundaries...';
    document.getElementById('elapsed-timer').textContent = '00:00';
    document.getElementById('stop-analysis-btn').style.display = 'none';

    // Start timer
    app.analysis.startTime = Date.now();
    startTimer();

    try {
        const response = await fetch('/api/mesh/boundaries', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: filepath })
        });

        const data = await response.json();

        // Hide loading modal
        stopTimer();
        document.getElementById('loading-modal').classList.remove('active');
        document.getElementById('stop-analysis-btn').style.display = '';

        if (data.error) {
            alert('Error detecting holes: ' + data.error);
            return;
        }

        if (data.boundaryIndices && data.boundaryIndices.length > 0) {
            // Highlight vertices in viewer
            app.landmarks.viewer.highlightBoundaryVertices(data.boundaryIndices);
            // Store in manager
            app.landmarks.manager.setBoundaryIndices(data.boundaryIndices);
            console.log(`Found ${data.count} boundary vertices`);
        } else {
            alert('No holes detected in this mesh (mesh is closed)');
            app.landmarks.viewer.clearBoundaryHighlights();
            app.landmarks.manager.setBoundaryIndices([]);
        }

    } catch (error) {
        // Hide loading modal on error
        stopTimer();
        document.getElementById('loading-modal').classList.remove('active');
        document.getElementById('stop-analysis-btn').style.display = '';
        console.error('Error detecting holes:', error);
        alert('Failed to detect holes');
    }
}

function clearLandmarkDirectory() {
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
    document.getElementById('detect-holes-btn').disabled = true;
    document.getElementById('current-model-name').textContent = 'No model loaded';
    document.getElementById('model-counter').textContent = '0 / 0';
    document.getElementById('landmark-list').innerHTML = '<p class="placeholder-text">Click on the model to place landmarks</p>';

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
        alert('No files to save');
        return;
    }

    // Show loading modal (without stop button for save operations)
    document.getElementById('loading-modal').classList.add('active');
    document.getElementById('loading-title').textContent = 'Saving Files';
    document.getElementById('loading-status').textContent = 'Saving files to processed folder...';
    document.getElementById('elapsed-timer').textContent = '00:00';
    document.getElementById('stop-analysis-btn').style.display = 'none';

    // Start timer
    app.analysis.startTime = Date.now();
    startTimer();

    try {
        const response = await fetch('/api/landmarks/saveall', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                files: filesData,
                sourceDirectory: app.landmarks.directory
            })
        });

        const data = await response.json();

        // Hide loading modal and stop timer
        stopTimer();
        document.getElementById('loading-modal').classList.remove('active');
        document.getElementById('stop-analysis-btn').style.display = '';

        if (data.success) {
            alert(`Saved ${data.saved.length} files to processed/ folder as .xyz`);
        } else {
            alert('Some files failed to save: ' + JSON.stringify(data.errors));
        }

    } catch (error) {
        // Hide loading modal on error
        stopTimer();
        document.getElementById('loading-modal').classList.remove('active');
        document.getElementById('stop-analysis-btn').style.display = '';
        console.error('Error saving landmarks:', error);
        alert('Failed to save landmarks');
    }
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

    // Stop analysis button
    document.getElementById('stop-analysis-btn').addEventListener('click', () => {
        stopAnalysis();
    });

    // Export CSV button
    document.getElementById('export-csv-btn').addEventListener('click', () => {
        exportResultsCSV();
    });

    // Clear results button
    document.getElementById('clear-results-btn').addEventListener('click', () => {
        clearResults();
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
        const response = await fetch('/api/analysis/files', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ directory })
        });

        const data = await response.json();

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
        <div class="file-item" title="${file}">${file.split('/').pop()}</div>
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
    showLoadingModal();
    startTimer();

    try {
        const response = await fetch('/api/analysis/run', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                leftFiles,
                rightFiles,
                percentage
            })
        });

        const data = await response.json();

        if (data.error) {
            alert('Error: ' + data.error);
        } else {
            app.analysis.results = data.results;
            updateResultsTable(data.results);

            document.getElementById('export-csv-btn').disabled = false;
            document.getElementById('clear-results-btn').disabled = false;
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

async function stopAnalysis() {
    try {
        await fetch('/api/analysis/stop', { method: 'POST' });
    } catch (error) {
        console.error('Error stopping analysis:', error);
    }

    hideLoadingModal();
    stopTimer();
    app.analysis.isRunning = false;
}

function showLoadingModal() {
    document.getElementById('loading-modal').classList.add('active');
    document.getElementById('loading-title').textContent = 'Running Comparisons';
    document.getElementById('loading-status').textContent = 'Processing comparisons...';
}

function hideLoadingModal() {
    document.getElementById('loading-modal').classList.remove('active');
}

function startTimer() {
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
            <tr>
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
            <tr>
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

function exportResultsCSV() {
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

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}_${timestamp}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

function clearResults() {
    app.analysis.results = [];
    app.analysis.bestMatches = [];
    updateResultsTable([]);
    document.getElementById('export-csv-btn').disabled = true;
    document.getElementById('clear-results-btn').disabled = true;
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
            const resp = await fetch('/api/homedir');
            const data = await resp.json();
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
        const response = await fetch('/api/browse', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path })
        });

        const data = await response.json();

        if (data.error) {
            alert('Error: ' + data.error);
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
            <span class="dir-entry-icon">${entry.isDirectory ? '📁' : (entry.isPly ? '📦' : '📄')}</span>
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
