import express from "express";
import fs from "fs";
import path from "path";

const router = express.Router();
const FILE_PATH = path.join("data", "bar-layouts.json");

function ensureStore() {
    const dir = path.dirname(FILE_PATH);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(FILE_PATH)) {
        fs.writeFileSync(FILE_PATH, "[]");
    }
}

function readLayouts() {
    ensureStore();
    const raw = fs.readFileSync(FILE_PATH, "utf8").trim();
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
}

function writeLayouts(layouts) {
    ensureStore();
    fs.writeFileSync(FILE_PATH, JSON.stringify(layouts, null, 2));
}

function isPoint(point) {
    return point
        && Number.isFinite(Number(point.x))
        && Number.isFinite(Number(point.y));
}

function validateLayout(body) {
    if (!body || typeof body !== "object") {
        return "Request body is required";
    }
    if (!Array.isArray(body.boundary) || body.boundary.length < 3 || !body.boundary.every(isPoint)) {
        return "A closed boundary with at least 3 points is required";
    }
    if (!body.summary || typeof body.summary !== "object") {
        return "Summary is required";
    }
    if (!Array.isArray(body.details)) {
        return "Bar details are required";
    }
    return null;
}

router.post("/", (req, res) => {
    try {
        const error = validateLayout(req.body);
        if (error) {
            return res.status(400).json({ error });
        }

        const layouts = readLayouts();
        const id = `bar_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
        const record = {
            id,
            createdAt: new Date().toISOString(),
            urn: req.body.urn || null,
            settings: req.body.settings || {},
            boundary: req.body.boundary,
            summary: req.body.summary,
            totals: req.body.totals || {},
            details: req.body.details
        };

        layouts.push(record);
        writeLayouts(layouts);

        console.log(`Bar layout saved: ${id}`);
        res.json({ success: true, id });
    } catch (err) {
        console.error("BAR LAYOUT SAVE ERROR:", err.message);
        res.status(500).json({ error: "Bar layout save failed" });
    }
});

export default router;
