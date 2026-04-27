import express from "express";
import multer from "multer";
import { getInternalToken, uploadToOSS, translateModel, getManifest } from "../services/app.js";

const router = express.Router();

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB max
    fileFilter: (_req, file, cb) => {
        if (file.originalname.toLowerCase().endsWith(".dwg")) {
            cb(null, true);
        } else {
            cb(new Error("Only .dwg files are allowed"));
        }
    }
});

// POST /api/upload  — upload DWG, kick off translation, return URN
router.post("/", upload.single("dwg"), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "No .dwg file received" });
        }

        const token = await getInternalToken();
        const objectId = await uploadToOSS(token, req.file.originalname, req.file.buffer);
        const urn = await translateModel(token, objectId);

        res.json({ urn: `urn:${urn}` });
    } catch (err) {
        console.error("UPLOAD ERROR:", err.response?.data || err.message);
        res.status(500).json({ error: err.message || "Upload failed" });
    }
});

// GET /api/upload/status/:urn  — poll translation progress
router.get("/status/:urn", async (req, res) => {
    try {
        const token = await getInternalToken();
        // Strip leading "urn:" if the caller included it
        const urn = req.params.urn.replace(/^urn:/, "");
        const manifest = await getManifest(token, urn);
        res.json({ status: manifest.status, progress: manifest.progress });
    } catch (err) {
        console.error("STATUS ERROR:", err.response?.data || err.message);
        res.status(500).json({ error: "Status check failed" });
    }
});

export default router;
