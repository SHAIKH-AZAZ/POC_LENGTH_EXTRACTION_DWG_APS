async function getToken(callback) {
    const res = await fetch("/api/auth/token");
    const data = await res.json();
    callback(data.access_token, data.expires_in);
}

let currentViewer = null;

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

export function launch(urn) {
    document.getElementById("uploadPanel").style.display = "none";
    document.getElementById("viewerPanel").style.display = "block";

    const viewSelect = document.getElementById("viewSelect");
    viewSelect.innerHTML = "<option>Loading views...</option>";
    viewSelect.disabled = true;

    Autodesk.Viewing.Initializer(
        { env: "AutodeskProduction", getAccessToken: getToken },
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

            viewer.start();

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

                    if (measureExt?.deleteMeasurements) {
                        measureExt.deleteMeasurements();
                    }
                    if (viewer.model) {
                        viewer.unloadModel(viewer.model);
                    }

                    await viewer.loadDocumentNode(doc, viewable);
                    viewer.fitToView();
                    viewSelect.disabled = viewables.length <= 1;
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
                }).catch(console.error);
            }, console.error);
        }
    );
}
