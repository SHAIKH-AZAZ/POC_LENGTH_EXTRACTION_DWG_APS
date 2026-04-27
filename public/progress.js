const STEPS = ["upload", "process", "convert", "render"];
const STEP_ICONS = { upload: "⬆", process: "⚙", convert: "🔄", render: "🖼" };

export function setStep(name) {
    const idx = STEPS.indexOf(name);
    STEPS.forEach((s, i) => {
        const el = document.getElementById(`step-${s}`);
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
    document.getElementById("progressBar").style.width = pct + "%";
}

export function completeAllSteps() {
    STEPS.forEach(s => {
        const el = document.getElementById(`step-${s}`);
        el.classList.remove("active");
        el.classList.add("done");
        el.querySelector(".step-icon").innerHTML = "✓";
    });
    document.getElementById("progressBar").style.width = "100%";
}

export function setStatus(msg, isError = false) {
    const statusMsg = document.getElementById("statusMsg");
    statusMsg.textContent = msg;
    statusMsg.className = isError ? "error" : "";
}

export function showProgress() {
    document.querySelector(".upload-box").style.display = "none";
    document.getElementById("progressArea").style.display = "flex";
}

export function hideProgress() {
    document.querySelector(".upload-box").style.display = "flex";
    document.getElementById("progressArea").style.display = "none";
}
