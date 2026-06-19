import express from "express";
import multer from "multer";
import { upload, checkStatus, listFiles, deleteFile } from "../services/app.js";

const router = express.Router();

const uploader = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 100 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        if (file.originalname.toLowerCase().endsWith(".dwg")) {
            cb(null, true);
        } else {
            cb(new Error("Only .dwg files are allowed"));
        }
    }
});

// POST /api/upload — upload DWG, kick off translation
router.post("/", uploader.single("dwg"), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "No .dwg file received" });
        }

        const urn = await upload(req.file.originalname, req.file.buffer);
        res.json({ urn });
    } catch (err) {
        console.error("UPLOAD ERROR:", err.response?.data || err.message);
        res.status(500).json({ error: err.message || "Upload failed" });
    }
});

// GET /api/upload/status/:urn — poll translation progress
router.get("/status/:urn", async (req, res) => {
    try {
        const manifest = await checkStatus(req.params.urn);
        res.json({
            status: manifest.status,
            progress: manifest.progress,
            derivatives: manifest.derivatives || []
        });
    } catch (err) {
        console.error("STATUS ERROR:", err.response?.data || err.message);
        res.status(500).json({ error: "Status check failed" });
    }
});

// GET /api/upload/list — list uploaded files with status (paginated)
router.get("/list", async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 10;
        const offset = parseInt(req.query.offset) || 0;
        const status = req.query.status || "all";

        const result = await listFiles(limit, offset, status);
        res.json(result);
    } catch (err) {
        console.error("LIST ERROR:", err.response?.data || err.message);
        res.status(500).json({ error: "List failed" });
    }
});

// DELETE /api/upload/file?urn=... — delete a file from OSS
router.delete("/file", async (req, res) => {
    try {
        const urn = req.query.urn;
        if (!urn) return res.status(400).json({ error: "URN required" });
        await deleteFile(urn);
        res.json({ success: true });
    } catch (err) {
        console.error("DELETE ERROR:", err.response?.data || err.message);
        res.status(500).json({ error: "Delete failed" });
    }
});

export default router;
