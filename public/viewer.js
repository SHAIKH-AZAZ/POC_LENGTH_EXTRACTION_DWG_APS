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

export function launch(urn) {
    document.getElementById("uploadPanel").style.display = "none";
    document.getElementById("viewerPanel").style.display = "block";

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
                        viewer.activateExtension("Autodesk.Measure", "distance");
                    };

                    console.log("✅ Measure Ready");

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
