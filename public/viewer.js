import { generateBarLayout } from "./bar-layout.js";
import { BoundaryDrawTool } from "./boundary-tool.js";
import { ViewerBarOverlay } from "./bar-overlay.js";

function getThree() {
    return globalThis.THREE || globalThis.Autodesk?.Viewing?.Private?.THREE;
}

async function getVerticesFromSelectedEntity(viewer, dbId) {
    return new Promise((resolve, reject) => {
        const model = viewer.model;
        if (!model) return reject(new Error("No active model loaded"));

        const it = model.getInstanceTree();
        if (!it) {
            return reject(new Error("Selection tree not available on this sheet."));
        }

        const fragIds = [];
        it.enumNodeFragments(dbId, (fragId) => {
            fragIds.push(fragId);
        }, true);

        if (fragIds.length === 0) {
            return reject(new Error("No geometry fragments found for this selection."));
        }

        const THREE = getThree();
        if (!THREE) return reject(new Error("Three.js library is not available."));

        const points = [];
        const frags = model.getFragmentList();

        fragIds.forEach((fragId) => {
            const mesh = frags.getVizmesh(fragId);
            if (!mesh) return;

            const geometry = mesh.geometry;
            if (!geometry) return;

            const positions = geometry.attributes?.position?.array;
            if (!positions) return;

            const indices = geometry.index ? geometry.index.array : null;

            if (indices) {
                for (let i = 0; i < indices.length; i++) {
                    const idx = indices[i] * 3;
                    const x = positions[idx];
                    const y = positions[idx + 1];
                    const z = positions[idx + 2];
                    const localPt = new THREE.Vector3(x, y, z);
                    const worldPt = localPt.applyMatrix4(mesh.matrixWorld);
                    points.push({ x: worldPt.x, y: worldPt.y, z: worldPt.z });
                }
            } else {
                for (let i = 0; i < positions.length; i += 3) {
                    const x = positions[i];
                    const y = positions[i + 1];
                    const z = positions[i + 2];
                    const localPt = new THREE.Vector3(x, y, z);
                    const worldPt = localPt.applyMatrix4(mesh.matrixWorld);
                    points.push({ x: worldPt.x, y: worldPt.y, z: worldPt.z });
                }
            }
        });

        if (points.length === 0) {
            return reject(new Error("No vertices could be extracted from geometry."));
        }

        const cleanedPoints = [];
        const seen = new Set();
        const tolerance = 1e-3;

        points.forEach(p => {
            const hash = `${Math.round(p.x/tolerance)*tolerance},${Math.round(p.y/tolerance)*tolerance}`;
            if (!seen.has(hash)) {
                seen.add(hash);
                cleanedPoints.push(p);
            }
        });

        if (cleanedPoints.length < 3) {
            return reject(new Error("Selected entity does not contain enough unique vertices to form a boundary."));
        }

        const centroid = cleanedPoints.reduce((acc, p) => {
            acc.x += p.x;
            acc.y += p.y;
            return acc;
        }, { x: 0, y: 0 });
        centroid.x /= cleanedPoints.length;
        centroid.y /= cleanedPoints.length;

        cleanedPoints.sort((a, b) => {
            const angleA = Math.atan2(a.y - centroid.y, a.x - centroid.x);
            const angleB = Math.atan2(b.y - centroid.y, b.x - centroid.x);
            return angleA - angleB;
        });

        resolve(cleanedPoints);
    });
}

async function getToken(callback) {
    const res = await fetch("/api/auth/token");
    const data = await res.json();
    callback(data.access_token, data.expires_in);
}

let currentViewer = null;
let searchResults = [];
let searchIndex = -1;

function getViewables(doc) {
    return doc.getRoot().search({ type: "geometry" }, true);
}

function getViewName(viewable, index) {
    const name = viewable.data?.name || viewable.name?.() || `View ${index + 1}`;
    const role = viewable.data?.role;
    return role ? `${name} (${role.toUpperCase()})` : name;
}

function populateViewSelect(select, viewables, selectedIndex) {
    select.innerHTML = "";

    if (!viewables.length) {
        const option = document.createElement("option");
        option.textContent = "No drawing views";
        select.appendChild(option);
        select.disabled = true;
        return;
    }

    viewables.forEach((viewable, index) => {
        const option = document.createElement("option");
        option.value = index;
        option.textContent = getViewName(viewable, index);
        select.appendChild(option);
    });

    select.value = selectedIndex;
    select.disabled = viewables.length <= 1;
}

function showViewLoadError(message) {
    const viewSelect = document.getElementById("viewSelect");
    viewSelect.innerHTML = "";

    const option = document.createElement("option");
    option.textContent = message;
    viewSelect.appendChild(option);
    viewSelect.disabled = true;
    setSearchReady(false);
}

function getSearchElements() {
    return {
        form: document.getElementById("viewerSearchForm"),
        input: document.getElementById("viewerSearchInput"),
        searchBtn: document.getElementById("viewerSearchBtn"),
        prevBtn: document.getElementById("searchPrevBtn"),
        nextBtn: document.getElementById("searchNextBtn"),
        status: document.getElementById("searchStatus")
    };
}

function setSearchReady(isReady) {
    const { input, searchBtn } = getSearchElements();
    input.disabled = !isReady;
    searchBtn.disabled = !isReady;
}

function setSearchNavigationReady(isReady) {
    const { prevBtn, nextBtn } = getSearchElements();
    prevBtn.disabled = !isReady;
    nextBtn.disabled = !isReady;
}

function resetSearchState(clearInput = false) {
    const { input, status } = getSearchElements();
    searchResults = [];
    searchIndex = -1;
    status.textContent = "";
    setSearchNavigationReady(false);
    if (clearInput) input.value = "";
    if (currentViewer?.model && currentViewer.clearSelection) {
        currentViewer.clearSelection();
    }
}

function showSearchResult(index) {
    if (!currentViewer || !searchResults.length) return;

    searchIndex = (index + searchResults.length) % searchResults.length;
    const dbId = searchResults[searchIndex];
    const ids = [dbId];
    const { status } = getSearchElements();

    currentViewer.select(ids);
    currentViewer.fitToView(ids);
    status.textContent = `${searchIndex + 1} / ${searchResults.length}`;
}

function setupSearchControls(viewer) {
    const { form, input, searchBtn, prevBtn, nextBtn, status } = getSearchElements();

    resetSearchState(true);
    setSearchReady(false);

    form.onsubmit = event => {
        event.preventDefault();

        const query = input.value.trim();
        if (!query) {
            resetSearchState();
            return;
        }

        searchBtn.disabled = true;
        setSearchNavigationReady(false);
        status.textContent = "Searching...";

        viewer.search(
            query,
            dbIds => {
                searchResults = [...new Set(dbIds || [])];
                searchIndex = -1;
                searchBtn.disabled = false;

                if (!searchResults.length) {
                    status.textContent = "No matches";
                    return;
                }

                setSearchNavigationReady(searchResults.length > 1);
                showSearchResult(0);
            },
            err => {
                console.error("SEARCH ERROR:", err);
                searchResults = [];
                searchIndex = -1;
                searchBtn.disabled = false;
                setSearchNavigationReady(false);
                status.textContent = "Search failed";
            }
        );
    };

    prevBtn.onclick = () => showSearchResult(searchIndex - 1);
    nextBtn.onclick = () => showSearchResult(searchIndex + 1);
}

function getBarElements() {
    return {
        panel: document.getElementById("barPanel"),
        toggle: document.getElementById("barPanelToggle"),
        mode: document.getElementById("boundaryMode"),
        direction: document.getElementById("barDirection"),
        spacing: document.getElementById("barSpacing"),
        unitScale: document.getElementById("unitScaleToMm"),
        chord: document.getElementById("curveChordMm"),
        drawBtn: document.getElementById("drawBoundaryBtn"),
        closeBtn: document.getElementById("closeBoundaryBtn"),
        undoBtn: document.getElementById("undoBoundaryPointBtn"),
        generateBtn: document.getElementById("generateBarsBtn"),
        autoSelectBtn: document.getElementById("autoSelectBoundaryBtn"),
        clearBtn: document.getElementById("clearBoundaryBtn"),
        saveBtn: document.getElementById("saveBarsBtn"),
        status: document.getElementById("barStatus"),
        summary: document.getElementById("barSummary"),
        pointCount: document.getElementById("barPointCount")
    };
}

function setBarControlsLoading(message) {
    const el = getBarElements();
    el.drawBtn.disabled = true;
    el.closeBtn.disabled = true;
    el.undoBtn.disabled = true;
    el.generateBtn.disabled = true;
    el.autoSelectBtn.disabled = true;
    el.clearBtn.disabled = true;
    el.saveBtn.disabled = true;
    el.pointCount.textContent = "0 points";
    el.summary.classList.remove("visible");
    el.summary.innerHTML = "";
    el.status.textContent = message;
    el.status.className = "bar-status";
}

function setupBarLayoutControls(viewer, urn, options = {}) {
    const el = getBarElements();
    const overlay = new ViewerBarOverlay(viewer);
    const tool = new BoundaryDrawTool(viewer, {
        onChange: updateBoundaryState,
        onComplete: updateBoundaryState,
        onPreview: updateBoundaryPreview,
        onStatus: message => setBarStatus(message)
    });

    let currentLayout = null;
    let activeBoundaryPoints = null;
    let activeBoundaryClosed = false;

    viewer.toolController.registerTool(tool);

    function setBarStatus(message, tone = "") {
        el.status.textContent = message || "";
        el.status.className = tone ? `bar-status ${tone}` : "bar-status";
    }

    function readSettings() {
        return {
            shapeMode: el.mode.value,
            direction: el.direction.value,
            spacingMm: Number(el.spacing.value),
            unitScaleToMm: Number(el.unitScale.value || 1),
            chordLengthMm: Number(el.chord.value || 10)
        };
    }

    function setCurrentLayout(layout) {
        currentLayout = layout;
        el.saveBtn.disabled = !currentLayout?.details?.length;
    }

    function resetLayoutOnly() {
        setCurrentLayout(null);
        overlay.clearBars();
        renderSummary(null);
    }

    function updateButtons() {
        const points = activeBoundaryPoints || tool.getPoints() || [];
        const closed = activeBoundaryClosed || tool.isClosed();
        const isPolygon = el.mode.value === "polygon";

        el.drawBtn.disabled = false;
        el.closeBtn.disabled = !isPolygon || closed || points.length < 3;
        el.undoBtn.disabled = closed || !points.length;
        el.generateBtn.disabled = !closed;
        el.clearBtn.disabled = !points.length && !currentLayout;
        el.pointCount.textContent = `${points.length} point${points.length === 1 ? "" : "s"}`;
        
        const selection = viewer.getSelection();
        el.autoSelectBtn.disabled = !(selection && selection.length === 1);
    }

    function updateBoundaryState(state) {
        resetLayoutOnly();
        overlay.setBoundary(state.points, state.closed);
        setBarStatus(state.message);
        
        activeBoundaryPoints = state.points;
        activeBoundaryClosed = state.closed;
        
        updateButtons();
    }

    function updateBoundaryPreview(state) {
        overlay.setBoundary(state.points, state.closed, state.previewPoints || []);
    }

    function renderSummary(layout) {
        if (!layout) {
            el.summary.classList.remove("visible");
            el.summary.innerHTML = "";
            return;
        }

        const rows = [];
        for (const direction of ["Horizontal", "Vertical"]) {
            for (const item of layout.summary[direction] || []) {
                rows.push(`
                    <tr>
                        <td>${direction}</td>
                        <td>${item.Length.toFixed(2)}</td>
                        <td>${item.Quantity}</td>
                    </tr>
                `);
            }
        }

        const totalQuantity = layout.details.length;
        const totalLength = layout.details.reduce((sum, bar) => sum + bar.length, 0);

        el.summary.innerHTML = `
            <table>
                <thead>
                    <tr><th>Direction</th><th>Length mm</th><th>No's</th></tr>
                </thead>
                <tbody>
                    ${rows.length ? rows.join("") : "<tr><td colspan=\"3\">No bars generated</td></tr>"}
                </tbody>
            </table>
            <div>Total bars: ${totalQuantity} | Total length: ${totalLength.toFixed(2)} mm</div>
        `;
        el.summary.classList.add("visible");
    }

    function syncToolSettings() {
        const settings = readSettings();
        tool.setMode(settings.shapeMode);
        tool.setCircleOptions(settings);
        updateButtons();
    }

    el.toggle.onclick = () => {
        el.panel.classList.toggle("hidden");
    };

    el.mode.onchange = () => {
        viewer.toolController.deactivateTool(tool.getName());
        tool.setMode(el.mode.value);
        activeBoundaryPoints = null;
        activeBoundaryClosed = false;
        overlay.clearAll();
        renderSummary(null);
        setCurrentLayout(null);
        setBarStatus("Boundary cleared.");
        updateButtons();
    };

    el.direction.onchange = () => {
        resetLayoutOnly();
        updateButtons();
    };
    el.spacing.oninput = () => {
        resetLayoutOnly();
        updateButtons();
    };
    el.unitScale.oninput = () => {
        resetLayoutOnly();
        syncToolSettings();
    };
    el.chord.oninput = () => {
        resetLayoutOnly();
        syncToolSettings();
    };

    el.drawBtn.onclick = () => {
        options.onDrawStart?.();
        resetLayoutOnly();
        syncToolSettings();
        if (tool.isClosed()) {
            tool.clear();
            activeBoundaryPoints = null;
            activeBoundaryClosed = false;
            overlay.clearAll();
        }
        viewer.toolController.activateTool(tool.getName());
    };

    el.closeBtn.onclick = () => {
        tool.closeBoundary();
        updateButtons();
    };

    el.undoBtn.onclick = () => {
        tool.undoLastPoint();
        updateButtons();
    };

    el.clearBtn.onclick = () => {
        viewer.toolController.deactivateTool(tool.getName());
        tool.clear();
        activeBoundaryPoints = null;
        activeBoundaryClosed = false;
        overlay.clearAll();
        renderSummary(null);
        setCurrentLayout(null);
        setBarStatus("Boundary cleared.");
        updateButtons();
    };

    el.generateBtn.onclick = () => {
        try {
            const pointsToUse = activeBoundaryPoints || tool.getPoints();
            const closedToUse = activeBoundaryClosed || tool.isClosed();

            if (!pointsToUse || pointsToUse.length < 3 || !closedToUse) {
                throw new Error("Please complete a closed boundary first.");
            }

            const settings = readSettings();
            const layout = generateBarLayout(pointsToUse, settings);
            const enrichedLayout = {
                ...layout,
                settings: {
                    ...layout.settings,
                    shapeMode: settings.shapeMode,
                    curveChordMm: settings.chordLengthMm
                }
            };

            setCurrentLayout(enrichedLayout);
            overlay.setBars(enrichedLayout);
            renderSummary(enrichedLayout);

            if (!enrichedLayout.details.length) {
                setBarStatus("No bars generated for this spacing.", "error");
            } else {
                setBarStatus(`Generated ${enrichedLayout.details.length} bars.`, "success");
            }
        } catch (err) {
            setCurrentLayout(null);
            overlay.clearBars();
            renderSummary(null);
            setBarStatus(err.message || "Could not generate bars.", "error");
        }
        updateButtons();
    };

    el.saveBtn.onclick = async () => {
        if (!currentLayout) return;

        el.saveBtn.disabled = true;
        setBarStatus("Saving JSON...");

        try {
            const res = await fetch("/api/bar-layouts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ urn, ...currentLayout })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || "Save failed");

            setBarStatus(`Saved JSON: ${data.id}`, "success");
        } catch (err) {
            setBarStatus(err.message || "Save failed.", "error");
            el.saveBtn.disabled = false;
        }
    };

    el.autoSelectBtn.onclick = async () => {
        const selection = viewer.getSelection();
        if (!selection || selection.length !== 1) {
            setBarStatus("Please select exactly one element in the drawing first.", "error");
            return;
        }

        const dbId = selection[0];
        setBarStatus("Extracting boundary geometry...", "");
        el.autoSelectBtn.disabled = true;

        try {
            const points = await getVerticesFromSelectedEntity(viewer, dbId);
            
            // Set mode to polygon and clear any existing drawing tool state
            viewer.toolController.deactivateTool(tool.getName());
            tool.clear();
            overlay.clearAll();
            
            // Populate the captured points directly into the overlay boundary
            overlay.setBoundary(points, true);

            activeBoundaryPoints = points;
            activeBoundaryClosed = true;
            
            // Generate the layout using captured points and active UI settings
            const settings = readSettings();
            const layout = generateBarLayout(points, settings);
            const enrichedLayout = {
                ...layout,
                settings: {
                    ...layout.settings,
                    shapeMode: settings.shapeMode,
                    curveChordMm: settings.chordLengthMm
                }
            };

            setCurrentLayout(enrichedLayout);
            overlay.setBars(enrichedLayout);
            renderSummary(enrichedLayout);

            if (!enrichedLayout.details.length) {
                setBarStatus("No bars generated for this spacing.", "error");
            } else {
                setBarStatus(`Successfully extracted boundary and generated ${enrichedLayout.details.length} bars.`, "success");
            }
        } catch (err) {
            activeBoundaryPoints = null;
            activeBoundaryClosed = false;
            setCurrentLayout(null);
            overlay.clearBars();
            renderSummary(null);
            setBarStatus(err.message || "Could not extract boundary geometry.", "error");
        }
        updateButtons();
    };

    // Selection changed listener to dynamically enable/disable the 'Select Shape' button
    viewer.addEventListener(Autodesk.Viewing.SELECTION_CHANGED_EVENT, () => {
        updateButtons();
    });

    syncToolSettings();
    setBarStatus("Ready to draw a boundary.");

    return {
        resetForViewChange() {
            viewer.toolController.deactivateTool(tool.getName());
            tool.clear();
            overlay.clearAll();
            renderSummary(null);
            setCurrentLayout(null);
            setBarStatus("Ready to draw a boundary.");
            updateButtons();
        },
        deactivateDrawing() {
            viewer.toolController.deactivateTool(tool.getName());
        }
    };
}

export function launch(urn) {
    document.getElementById("uploadPanel").style.display = "none";
    document.getElementById("viewerPanel").style.display = "block";
    setBarControlsLoading("Loading drawing...");

    const viewSelect = document.getElementById("viewSelect");
    viewSelect.innerHTML = "<option>Loading views...</option>";
    viewSelect.disabled = true;

    Autodesk.Viewing.Initializer(
        {
            env: "AutodeskProduction2",
            api: "streamingV2",
            getAccessToken: getToken
        },
        function () {
            if (currentViewer) {
                currentViewer.finish();
                currentViewer = null;
            }

            const viewer = new Autodesk.Viewing.Viewer3D(
                document.getElementById("viewer"),
                { disabledExtensions: { viewcube: true, hyperlink: true } }
            );
            currentViewer = viewer;
            setupSearchControls(viewer);
            let barLayoutControls = null;

            const startCode = viewer.start();
            if (startCode > 0) {
                showViewLoadError("Viewer not supported");
                console.error("VIEWER START ERROR:", startCode);
                return;
            }

            Autodesk.Viewing.Document.load(urn, function (doc) {
                const viewables = getViewables(doc);
                const defaultModel = doc.getRoot().getDefaultGeometry();
                const defaultGuid = defaultModel?.data?.guid;
                const initialIndex = Math.max(
                    viewables.findIndex(viewable => viewable.data?.guid === defaultGuid),
                    0
                );
                let measureExt;

                async function loadViewable(viewable) {
                    viewSelect.disabled = true;
                    setSearchReady(false);
                    resetSearchState();
                    barLayoutControls?.resetForViewChange();

                    if (measureExt?.deleteMeasurements) {
                        measureExt.deleteMeasurements();
                    }
                    if (viewer.model) {
                        viewer.unloadModel(viewer.model);
                    }

                    if (!viewable) {
                        throw new Error("No drawable view found in this model.");
                    }

                    await viewer.loadDocumentNode(doc, viewable);
                    viewer.fitToView();
                    viewSelect.disabled = viewables.length <= 1;
                    setSearchReady(true);
                }

                populateViewSelect(viewSelect, viewables, initialIndex);

                loadViewable(viewables[initialIndex] || defaultModel).then(async () => {
                    console.log("✅ Model Loaded");

                    measureExt = await viewer.loadExtension("Autodesk.Measure");

                    viewSelect.onchange = () => {
                        const selected = viewables[Number(viewSelect.value)];
                        if (selected) {
                            loadViewable(selected).catch(console.error);
                        }
                    };

                    document.getElementById("measureBtn").onclick = () => {
                        barLayoutControls?.deactivateDrawing();
                        viewer.activateExtension("Autodesk.Measure", "distance");
                    };

                    console.log("✅ Measure Ready");

                    barLayoutControls = setupBarLayoutControls(viewer, urn, {
                        onDrawStart: () => {
                            if (measureExt.exitMeasurementMode) {
                                measureExt.exitMeasurementMode();
                            }
                            if (measureExt.deactivate) {
                                measureExt.deactivate();
                            }
                        }
                    });

                    document.getElementById("captureBtn").onclick = async () => {
                        const measurements = measureExt.getMeasurementList();

                        if (!measurements.length) {
                            alert("⚠ Please measure a distance first.");
                            return;
                        }

                        const latest = measurements[measurements.length - 1];

                        if (!latest?.distance) {
                            alert("⚠ Invalid measurement.");
                            return;
                        }

                        const distance = parseFloat(latest.distance);

                        if (!distance) {
                            alert("⚠ Could not read distance.");
                            return;
                        }

                        console.log("✅ Length Extracted:", distance);

                        try {
                            await fetch("/api/measurements", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ distance })
                            });

                            // Exit measurement mode and clear so next measure starts fresh
                            if (measureExt.exitMeasurementMode) {
                                measureExt.exitMeasurementMode();
                            }
                            if (measureExt.deleteMeasurements) {
                                measureExt.deleteMeasurements();
                            }
                            if (measureExt.deactivate) {
                                measureExt.deactivate();
                            }
                            alert(`✅ Length Extracted: ${distance} mm`);
                        } catch (err) {
                            console.error(err);
                            alert("❌ Failed to save measurement.");
                        }
                    };
                }).catch(err => {
                    showViewLoadError("Failed to load view");
                    console.error("VIEW LOAD ERROR:", err);
                });
            }, err => {
                showViewLoadError("Failed to load drawing");
                console.error("DOCUMENT LOAD ERROR:", err);
            });
        }
    );
}
