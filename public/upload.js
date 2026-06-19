import { setStep, completeAllSteps, setStatus, showProgress, hideProgress } from "./progress.js";

const fileInput = document.getElementById("fileInput");
const fileNameEl = document.getElementById("fileName");
const uploadBtn = document.getElementById("uploadBtn");
const dropZone = document.getElementById("dropZone");

export function init() {
    fileInput.addEventListener("change", handleFileChange);
    setupDragDrop();
}

function handleFileChange() {
    pickFile(fileInput.files[0]);
}

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

function setupDragDrop() {
    dropZone.addEventListener("dragover", e => {
        e.preventDefault();
        dropZone.classList.add("dragover");
    });
    dropZone.addEventListener("dragleave", () => dropZone.classList.remove("dragover"));
    dropZone.addEventListener("drop", e => {
        e.preventDefault();
        dropZone.classList.remove("dragover");
        pickFile(e.dataTransfer.files[0]);
    });
}

async function pollStatus(urn) {
    const POLL_MS = 4000;
    const MAX_MS = 10 * 60 * 1000; // give up after 10 minutes
    const started = Date.now();

    // A viewable is usable once its derivative is done, even if the
    // top-level manifest status/progress lags behind (a known APS quirk
    // where the manifest sits at "99% complete" / "inprogress").
    const viewableReady = derivatives =>
        (derivatives || []).some(d =>
            (d.status === "success" || d.progress === "complete") &&
            (d.children || []).some(c =>
                c.role === "2d" || c.role === "3d" || c.type === "geometry")
        );

    while (true) {
        const res = await fetch(`/api/upload/status/${encodeURIComponent(urn)}`);
        const data = await res.json();

        if (data.status === "success" ||
            data.progress === "complete" ||
            viewableReady(data.derivatives)) {
            return;
        }

        if (data.status === "failed")
            throw new Error("APS translation failed. Check the file and try again.");

        if (data.status === "timeout")
            throw new Error("APS translation timed out. The file may be too large or complex.");

        if (Date.now() - started > MAX_MS)
            throw new Error("Translation is taking too long (stuck). Try re-uploading the file.");

        const pctMatch = (data.progress || "").match(/(\d+)%/);
        const pct = pctMatch ? parseInt(pctMatch[1]) : 0;

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

export async function handleUpload() {
    const file = fileInput.files[0];
    if (!file) return;

    uploadBtn.disabled = true;
    showProgress();
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

        await new Promise(r => setTimeout(r, 800));
        completeAllSteps();
        setStatus("Done! Opening viewer…");

        await new Promise(r => setTimeout(r, 500));

        return urn;
    } catch (err) {
        console.error(err);
        setStatus(err.message || "Something went wrong.", true);
        hideProgress();
        uploadBtn.disabled = false;
        throw err;
    }
}
