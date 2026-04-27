async function getToken(callback) {
    const res = await fetch("/api/auth/token");
    const data = await res.json();
    callback(data.access_token, data.expires_in);
}

export function launch(urn) {
    document.getElementById("uploadPanel").style.display = "none";
    document.getElementById("viewerPanel").style.display = "block";

    Autodesk.Viewing.Initializer(
        { env: "AutodeskProduction", getAccessToken: getToken },
        function () {
            const viewer = new Autodesk.Viewing.Viewer3D(
                document.getElementById("viewer"),
                { disabledExtensions: { viewcube: true, hyperlink: true } }
            );

            viewer.start();

            Autodesk.Viewing.Document.load(urn, function (doc) {
                const defaultModel = doc.getRoot().getDefaultGeometry();

                viewer.loadDocumentNode(doc, defaultModel).then(async () => {
                    console.log("✅ Model Loaded");

                    const measureExt = await viewer.loadExtension("Autodesk.Measure");

                    document.getElementById("measureBtn").addEventListener("click", () => {
                        viewer.activateExtension("Autodesk.Measure", "distance");
                    });

                    console.log("✅ Measure Ready");

                    let locked = false;

                    document.getElementById("captureBtn").addEventListener("click", async () => {
                        if (locked) {
                            alert("Measurement already captured. Reload page for a new one.");
                            return;
                        }

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

                        locked = true;
                        console.log("✅ Length Extracted:", distance);

                        try {
                            await fetch("/api/measurements", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ distance })
                            });

                            viewer.deactivateExtension("Autodesk.Measure");
                            alert(`✅ Length Extracted: ${distance} mm`);
                        } catch (err) {
                            console.error(err);
                            alert("❌ Failed to save measurement.");
                        }
                    });
                });
            }, console.error);
        }
    );
}
