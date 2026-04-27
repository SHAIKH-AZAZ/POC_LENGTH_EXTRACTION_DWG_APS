async function getToken(callback) {
    const res  = await fetch("/api/auth/token");
    const data = await res.json();
    callback(data.access_token, data.expires_in);
}

// ── DOM refs ─────────────────────────────────────────────────
const fileInput    = document.getElementById("fileInput");
const fileNameEl   = document.getElementById("fileName");
const uploadBtn    = document.getElementById("uploadBtn");
const dropZone     = document.getElementById("dropZone");
const progressArea = document.getElementById("progressArea");
const progressBar  = document.getElementById("progressBar");
const statusMsg    = document.getElementById("statusMsg");

const STEPS = ["upload", "process", "convert", "render"];

// ── Step helpers ─────────────────────────────────────────────
function setStep(name) {
    // name = current active step; everything before it → done
    const idx = STEPS.indexOf(name);
    STEPS.forEach((s, i) => {
        const el   = document.getElementById(`step-${s}`);
        const icon = el.querySelector(".step-icon");

        el.classList.remove("active", "done");

        if (i < idx) {
            el.classList.add("done");
            icon.innerHTML = "✓";
        } else if (i === idx) {
            el.classList.add("active");
            icon.innerHTML = '<div class="spin"></div>';
        } else {
            icon.innerHTML = STEP_ICONS[s];
        }
    });

    const pct = { upload: 10, process: 35, convert: 65, render: 90 }[name];
    progressBar.style.width = pct + "%";
}

function completeAllSteps() {
    STEPS.forEach(s => {
        const el = document.getElementById(`step-${s}`);
        el.classList.remove("active");
        el.classList.add("done");
        el.querySelector(".step-icon").innerHTML = "✓";
    });
    progressBar.style.width = "100%";
}

const STEP_ICONS = { upload:"⬆", process:"⚙", convert:"🔄", render:"🖼" };

function setStatus(msg, isError = false) {
    statusMsg.textContent = msg;
    statusMsg.className   = isError ? "error" : "";
}

// ── File selection ────────────────────────────────────────────
function pickFile(file) {
    if (!file || !file.name.toLowerCase().endsWith(".dwg")) {
        setStatus("Please select a .dwg file.", true);
        return;
    }
    fileNameEl.textContent = file.name;
    fileNameEl.classList.add("chosen");
    uploadBtn.disabled = false;
    setStatus("");
}

fileInput.addEventListener("change", () => pickFile(fileInput.files[0]));

// Drag-and-drop support
dropZone.addEventListener("dragover", e => { e.preventDefault(); dropZone.classList.add("dragover"); });
dropZone.addEventListener("dragleave", ()  => dropZone.classList.remove("dragover"));
dropZone.addEventListener("drop", e => {
    e.preventDefault();
    dropZone.classList.remove("dragover");
    pickFile(e.dataTransfer.files[0]);
});

// ── Translation polling ───────────────────────────────────────
async function pollStatus(urn) {
    const POLL_MS = 4000;

    while (true) {
        const res  = await fetch(`/api/upload/status/${encodeURIComponent(urn)}`);
        const data = await res.json();

        if (data.status === "success") return;

        if (data.status === "failed")
            throw new Error("APS translation failed. Check the file and try again.");

        // Map APS progress string ("0% complete", "71% complete", …) to UI
        const pctMatch = (data.progress || "").match(/(\d+)%/);
        const pct      = pctMatch ? parseInt(pctMatch[1]) : 0;

        if (pct < 40) {
            setStep("process");
            setStatus(`Processing… ${data.progress || ""}`);
        } else {
            setStep("convert");
            setStatus(`Converting… ${data.progress || ""}`);
        }

        await new Promise(r => setTimeout(r, POLL_MS));
    }
}

// ── Upload button ─────────────────────────────────────────────
uploadBtn.addEventListener("click", async () => {
    const file = fileInput.files[0];
    if (!file) return;

    // Switch from drop-box UI to step progress UI
    uploadBtn.disabled = true;
    document.querySelector(".upload-box").style.display = "none";
    progressArea.style.display = "flex";

    setStep("upload");
    setStatus("Uploading file to cloud…");

    try {
        const form = new FormData();
        form.append("dwg", file);

        const uploadRes = await fetch("/api/upload", { method: "POST", body: form });
        if (!uploadRes.ok) {
            const err = await uploadRes.json().catch(() => ({}));
            throw new Error(err.error || "Upload failed");
        }

        const { urn } = await uploadRes.json();

        setStep("process");
        setStatus("File received. Starting translation…");

        await pollStatus(urn);

        setStep("render");
        setStatus("Loading viewer…");

        // Brief pause so user sees the render step before panel disappears
        await new Promise(r => setTimeout(r, 800));
        completeAllSteps();
        setStatus("Done! Opening viewer…");

        await new Promise(r => setTimeout(r, 500));
        launchViewer(urn);

    } catch (err) {
        console.error(err);
        setStatus(err.message || "Something went wrong.", true);
        // Let user try again
        document.querySelector(".upload-box").style.display = "flex";
        progressArea.style.display = "none";
        uploadBtn.disabled = false;
    }
});

// ── Viewer ────────────────────────────────────────────────────
function launchViewer(urn) {
    document.getElementById("uploadPanel").style.display  = "none";
    document.getElementById("viewerPanel").style.display  = "block";

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
