import express from "express";
import multer from "multer";
import { upload, checkStatus } from "../services/app.js";

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
        res.json({ status: manifest.status, progress: manifest.progress });
    } catch (err) {
        console.error("STATUS ERROR:", err.response?.data || err.message);
        res.status(500).json({ error: "Status check failed" });
    }
});

export default router;
