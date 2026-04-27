import axios from "axios";
import dotenv from "dotenv";
import { getBucketKey, ensureBucket, uploadToOSS, listObjects, deleteObject } from "./oss.js";
import { translateModel, getManifest } from "./modelderivative.js";

dotenv.config();

const APS_BASE = "https://developer.api.autodesk.com";

async function fetchToken(scopes) {
    const response = await axios.post(
        `${APS_BASE}/authentication/v2/token`,
        new URLSearchParams({
            grant_type: "client_credentials",
            scope: scopes.join(" ")
        }),
        {
            auth: {
                username: process.env.APS_CLIENT_ID,
                password: process.env.APS_CLIENT_SECRET
            },
            headers: { "Content-Type": "application/x-www-form-urlencoded" }
        }
    );
    return response.data.access_token;
}

// Public viewer token (exposed to browser)
export async function getAccessToken() {
    return fetchToken(["viewables:read"]);
}

// Internal token for OSS + Model Derivative (server-side only)
export async function getInternalToken() {
    return fetchToken(["bucket:create", "bucket:read", "data:write", "data:read"]);
}

// Wrapper functions for routes/upload.js
export async function upload(fileName, fileBuffer) {
    const token     = await getInternalToken();
    const bucketKey = getBucketKey(process.env.APS_CLIENT_ID);
    const objectId  = await uploadToOSS(token, bucketKey, fileName, fileBuffer);
    const urn       = await translateModel(token, objectId);
    return `urn:${urn}`;
}

export async function checkStatus(urn) {
    const token = await getInternalToken();
    const cleanUrn = urn.replace(/^urn:/, "");
    return getManifest(token, cleanUrn);
}

// List uploaded files with translation status
export async function listFiles(limit = 10, offset = 0, statusFilter = "all") {
    const token = await getInternalToken();
    const bucketKey = getBucketKey(process.env.APS_CLIENT_ID);

    let items;
    try {
        items = await listObjects(token, bucketKey, 100);
    } catch (err) {
        if (err.response?.status === 404) return { files: [], total: 0, hasMore: false };
        throw err;
    }

    // Sort newest first (objectKey starts with timestamp)
    items.sort((a, b) => (b.objectKey || "").localeCompare(a.objectKey || ""));

    // Get translation status for each
    const enriched = await Promise.all(items.map(async item => {
        const urn = Buffer.from(item.objectId).toString("base64").replace(/=/g, "");
        let status = "pending";
        let progress = "0%";

        try {
            const manifest = await getManifest(token, urn);
            status = manifest.status || "pending";
            progress = manifest.progress || "0%";
        } catch (err) {
            if (err.response?.status !== 404) {
                console.error("Manifest check failed for", urn, err.message);
            }
        }

        // Strip timestamp prefix from name (e.g., "1234567890_file.dwg" -> "file.dwg")
        const displayName = item.objectKey.replace(/^\d+_/, "");
        const uploadedAt = parseInt(item.objectKey.split("_")[0]) || null;

        return {
            urn: `urn:${urn}`,
            objectKey: item.objectKey,
            name: displayName,
            size: item.size,
            uploadedAt,
            status,
            progress
        };
    }));

    // Apply status filter
    const filtered = statusFilter === "all"
        ? enriched
        : enriched.filter(f => f.status === statusFilter);

    // Apply pagination
    const paginated = filtered.slice(offset, offset + limit);

    return {
        files: paginated,
        total: filtered.length,
        hasMore: offset + limit < filtered.length
    };
}

// Delete a file from OSS by URN
export async function deleteFile(urn) {
    const token = await getInternalToken();
    const bucketKey = getBucketKey(process.env.APS_CLIENT_ID);

    // Decode URN to get objectId, then extract objectKey
    const cleanUrn = urn.replace(/^urn:/, "");
    const objectId = Buffer.from(cleanUrn, "base64").toString("utf8");
    // objectId format: urn:adsk.objects:os.object:bucketKey/objectKey
    const objectKey = objectId.split("/").slice(1).join("/");

    await deleteObject(token, bucketKey, objectKey);
}
