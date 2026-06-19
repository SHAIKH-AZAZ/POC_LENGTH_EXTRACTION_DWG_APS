const PAGE_SIZE = 10;

let currentOffset = 0;
let currentStatus = "all";
let onOpenCallback = null;

export function init(onOpen) {
    onOpenCallback = onOpen;

    document.getElementById("libraryBtn").addEventListener("click", openLibrary);
    document.getElementById("libraryClose").addEventListener("click", closeLibrary);
    document.getElementById("statusFilter").addEventListener("change", e => {
        currentStatus = e.target.value;
        currentOffset = 0;
        loadFiles(true);
    });
    document.getElementById("loadMoreBtn").addEventListener("click", () => {
        currentOffset += PAGE_SIZE;
        loadFiles(false);
    });
}

function openLibrary() {
    document.getElementById("libraryModal").style.display = "flex";
    currentOffset = 0;
    document.querySelector("#libraryTable tbody").innerHTML = "";
    loadFiles(true);
}

function closeLibrary() {
    document.getElementById("libraryModal").style.display = "none";
}

async function loadFiles(reset) {
    const tbody = document.querySelector("#libraryTable tbody");
    const loadMoreBtn = document.getElementById("loadMoreBtn");
    const emptyMsg = document.getElementById("libraryEmpty");

    if (reset) tbody.innerHTML = "";
    loadMoreBtn.disabled = true;
    loadMoreBtn.textContent = "Loading…";

    try {
        const res = await fetch(`/api/upload/list?limit=${PAGE_SIZE}&offset=${currentOffset}&status=${currentStatus}`);
        if (!res.ok) throw new Error("Failed to load library");
        const { files, hasMore, total } = await res.json();

        if (reset && files.length === 0) {
            emptyMsg.style.display = "block";
            emptyMsg.textContent = total === 0 ? "No files uploaded yet." : "No files match this filter.";
            loadMoreBtn.style.display = "none";
            return;
        }

        emptyMsg.style.display = "none";

        for (const f of files) {
            tbody.appendChild(buildRow(f));
        }

        loadMoreBtn.style.display = hasMore ? "inline-block" : "none";
        loadMoreBtn.disabled = false;
        loadMoreBtn.textContent = "Load More";
    } catch (err) {
        console.error(err);
        emptyMsg.style.display = "block";
        emptyMsg.textContent = "Failed to load library.";
        loadMoreBtn.style.display = "none";
    }
}

function buildRow(file) {
    const tr = document.createElement("tr");

    const sizeMB = (file.size / 1024 / 1024).toFixed(2);
    const dateStr = file.uploadedAt
        ? new Date(file.uploadedAt).toLocaleString()
        : "—";

    // Some filenames arrive with HTML entities baked in (e.g. "&amp;").
    // Decode them first so they render as real characters, not "&amp;".
    const displayName = decodeEntities(file.name);

    // A file is openable if APS reports success OR its 2D view is already ready.
    const isReady = file.status === "success" || file.viewable;

    const statusClass = isReady ? "badge-success" : `badge-${file.status}`;
    const statusText = isReady
        ? "Ready"
        : file.status === "inprogress"
            ? `In Progress (${file.progress})`
            : file.status.charAt(0).toUpperCase() + file.status.slice(1);

    tr.innerHTML = `
        <td class="lib-name" title="${escapeHtml(displayName)}">${escapeHtml(displayName)}</td>
        <td>${sizeMB} MB</td>
        <td>${dateStr}</td>
        <td><span class="status-badge ${statusClass}">${statusText}</span></td>
        <td class="lib-actions"></td>
    `;

    const actionsTd = tr.querySelector(".lib-actions");

    const openBtn = document.createElement("button");
    openBtn.className = "lib-btn lib-open";
    openBtn.textContent = "Open";
    openBtn.disabled = !isReady;
    openBtn.title = !isReady ? "Translation not ready" : "Open in viewer";
    openBtn.addEventListener("click", () => {
        closeLibrary();
        onOpenCallback?.(file.urn);
    });

    const delBtn = document.createElement("button");
    delBtn.className = "lib-btn lib-del";
    delBtn.textContent = "Delete";
    delBtn.addEventListener("click", () => deleteFile(file, tr));

    actionsTd.append(openBtn, delBtn);
    return tr;
}

async function deleteFile(file, tr) {
    if (!confirm(`Delete "${decodeEntities(file.name)}" from APS storage?\nThis cannot be undone.`)) return;

    try {
        const res = await fetch(`/api/upload/file?urn=${encodeURIComponent(file.urn)}`, { method: "DELETE" });
        if (!res.ok) throw new Error("Delete failed");
        tr.remove();
    } catch (err) {
        console.error(err);
        alert("Failed to delete file.");
    }
}

function escapeHtml(s) {
    return s.replace(/[&<>"']/g, c => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
}

function decodeEntities(s) {
    const txt = document.createElement("textarea");
    txt.innerHTML = s;
    return txt.value;
}
