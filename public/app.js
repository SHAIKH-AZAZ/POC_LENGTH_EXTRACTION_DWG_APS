import { init as initUpload, handleUpload } from "./upload.js";
import { launch as launchViewer } from "./viewer.js";

initUpload();

document.getElementById("uploadBtn").addEventListener("click", async () => {
    try {
        const urn = await handleUpload();
        if (urn) launchViewer(urn);
    } catch (_err) {
        // Error already displayed by upload module
    }
});
