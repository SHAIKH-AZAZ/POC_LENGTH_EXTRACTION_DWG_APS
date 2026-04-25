const urn = "urn:dXJuOmFkc2sub2JqZWN0czpvcy5vYmplY3Q6YnVuaXlhZGJ5dGUtcmViYXItcG9jLTAwMS9iZWFtX3JlYmFyLmR3Zw";

async function getToken(callback) {
    const res = await fetch("/api/auth/token");
    const data = await res.json();
    callback(data.access_token, data.expires_in);
}

Autodesk.Viewing.Initializer(
{
    env: "AutodeskProduction",
    getAccessToken: getToken
},
function () {

    const viewer = new Autodesk.Viewing.Viewer3D(
        document.getElementById("viewer"),
        {
            disabledExtensions: {
                viewcube: true,
                hyperlink: true
            }
        }
    );

    viewer.start();

    Autodesk.Viewing.Document.load(urn, function (doc) {

        const defaultModel = doc.getRoot().getDefaultGeometry();

        viewer.loadDocumentNode(doc, defaultModel).then(async () => {

            console.log("✅ Model Loaded");

            const measureExt = await viewer.loadExtension("Autodesk.Measure");
            const measureButton = document.getElementById("measureBtn");

            function enableDistanceMeasure() {
                viewer.activateExtension("Autodesk.Measure", "distance");
            }

            function disableDistanceMeasure() {
                viewer.deactivateExtension("Autodesk.Measure");
            }

            measureButton.addEventListener("click", function () {
                enableDistanceMeasure();
            });

            console.log("✅ Measure Ready");

            let locked = false;

            document
                .getElementById("captureBtn")
                .addEventListener("click", async () => {

                    if (locked) {
                        alert("Measurement already captured. Reload page for new one.");
                        return;
                    }

                    const measurements = measureExt.getMeasurementList();

                    if (!measurements.length) {
                        alert("⚠ Please measure a distance first.");
                        return;
                    }

                    const latest = measurements[measurements.length - 1];

                    if (!latest || !latest.distance) {
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
                            headers: {
                                "Content-Type": "application/json"
                            },
                            body: JSON.stringify({ distance })
                        });
                        
                        disableDistanceMeasure();

                        alert(`✅ Length Extracted: ${distance} mm`);

                    } catch (err) {

                        console.error(err);
                        alert("❌ Failed to save measurement.");
                    }
                });

        });

    }, console.error);
});
