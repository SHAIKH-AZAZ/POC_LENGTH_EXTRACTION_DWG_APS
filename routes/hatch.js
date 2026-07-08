import express from "express";
import { getBucketKey } from "../services/oss.js";
import {
    createHatchWorkitem,
    getWorkitemStatus,
    fetchReport,
    finalizeHatchResult
} from "../services/designautomation.js";

const router = express.Router();

// In-memory job store (POC): lost on server restart, not serverless-safe.
// workitemId -> { resultObjectKey, uploadKey, urn, status, layout?, error?, report? }
const jobs = new Map();

const HANDLE_RE = /^[0-9A-Fa-f]{1,16}$/;
const DIRECTIONS = new Set(["Horizontal", "Vertical", "Both"]);

function decodeUrnToObjectKey(urn) {
    const cleanUrn = String(urn).replace(/^urn:/, "");
    const objectId = Buffer.from(cleanUrn, "base64url").toString("utf8");
    const bucketKey = getBucketKey(process.env.APS_CLIENT_ID);
    const prefix = `urn:adsk.objects:os.object:${bucketKey}/`;
    if (!objectId.startsWith(prefix)) {
        throw new Error("URN does not reference an object in this app's bucket");
    }
    return objectId.slice(prefix.length);
}

function validateHatchRequest(body) {
    if (!body || typeof body !== "object") return "Request body is required";
    if (!body.urn || typeof body.urn !== "string") return "urn is required";
    if (!HANDLE_RE.test(body.boundaryHandle || "")) {
        return "boundaryHandle must be a hex entity handle (e.g. \"2C1\")";
    }
    if (!DIRECTIONS.has(body.direction)) {
        return "direction must be Horizontal, Vertical or Both";
    }
    const spacingMm = Number(body.spacingMm);
    if (!Number.isFinite(spacingMm) || spacingMm <= 0) return "spacingMm must be > 0";
    const unitScaleToMm = Number(body.unitScaleToMm);
    if (!Number.isFinite(unitScaleToMm) || unitScaleToMm <= 0) return "unitScaleToMm must be > 0";
    return null;
}

router.post("/", async (req, res) => {
    try {
        const error = validateHatchRequest(req.body);
        if (error) return res.status(400).json({ error });

        let objectKey;
        try {
            objectKey = decodeUrnToObjectKey(req.body.urn);
        } catch (err) {
            return res.status(400).json({ error: err.message });
        }

        const { workitemId, resultObjectKey, uploadKey } = await createHatchWorkitem({
            objectKey,
            boundaryHandle: req.body.boundaryHandle.toUpperCase(),
            direction: req.body.direction,
            spacingMm: Number(req.body.spacingMm),
            unitScaleToMm: Number(req.body.unitScaleToMm)
        });

        jobs.set(workitemId, {
            resultObjectKey,
            uploadKey,
            urn: req.body.urn,
            status: "pending"
        });

        console.log(`Hatch workitem created: ${workitemId}`);
        res.json({ workitemId });
    } catch (err) {
        const status = err.response?.status;
        const detail = err.response?.data;
        console.error("HATCH SUBMIT ERROR:", status, detail || err.message);

        if (status === 404 && String(err.config?.url || "").includes("/oss/")) {
            return res.status(400).json({
                error: "Drawing no longer in storage (files expire after 24h). Re-upload and try again."
            });
        }
        if (status === 404 || status === 400) {
            return res.status(400).json({
                error: "Design Automation activity not set up. Run: node scripts/setup-da.js"
            });
        }
        res.status(500).json({ error: "Cloud generate failed" });
    }
});

router.get("/:id", async (req, res) => {
    const job = jobs.get(req.params.id);
    if (!job) return res.status(404).json({ error: "Unknown workitem" });

    // Terminal states are cached — re-polling is idempotent.
    if (job.status === "success") return res.json({ status: "success", layout: job.layout });
    if (job.status === "failed") return res.json({ status: "failed", error: job.error, report: job.report });

    try {
        const wi = await getWorkitemStatus(req.params.id);

        if (wi.status === "pending" || wi.status === "inprogress") {
            return res.json({ status: wi.status });
        }

        if (wi.status === "success") {
            const layout = await finalizeHatchResult(job);
            job.status = "success";
            job.layout = layout;
            return res.json({ status: "success", layout });
        }

        // failedInstructions / failedDownload / failedUpload / cancelled ...
        let report = "";
        if (wi.reportUrl) {
            try {
                report = (await fetchReport(wi.reportUrl)).slice(-4000);
            } catch (err) {
                console.error("Report fetch failed:", err.message);
            }
        }
        job.status = "failed";
        job.error = wi.status;
        job.report = report;
        res.json({ status: "failed", error: wi.status, report });
    } catch (err) {
        console.error("HATCH POLL ERROR:", err.response?.status, err.response?.data || err.message);
        res.status(500).json({ error: "Cloud job status check failed" });
    }
});

export default router;
