import axios from "axios";

const APS_BASE = "https://developer.api.autodesk.com";

export function getBucketKey(clientId) {
    // Use a fixed bucket if configured (APS_BUCKET_KEY), otherwise derive a
    // unique one from the client ID. Note: bucket keys are globally unique
    // across all APS accounts, so a generic name like "dwgpdf-bucket" only
    // works if no one else already owns it.
    if (process.env.APS_BUCKET_KEY) {
        return process.env.APS_BUCKET_KEY.toLowerCase();
    }

    return clientId
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "")
        .substring(0, 50) + "-aps";
}

export async function ensureBucket(token, bucketKey) {
    try {
        await axios.get(`${APS_BASE}/oss/v2/buckets/${bucketKey}/details`, {
            headers: { Authorization: `Bearer ${token}` }
        });
    } catch (err) {
        if (err.response?.status === 404) {
            await axios.post(
                `${APS_BASE}/oss/v2/buckets`,
                { bucketKey, policyKey: "transient" },
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        "Content-Type": "application/json"
                    }
                }
            );
        } else {
            throw err;
        }
    }
}

export async function listObjects(token, bucketKey, limit = 100, startAt = null) {
    const params = { limit };
    if (startAt) params.startAt = startAt;

    const res = await axios.get(
        `${APS_BASE}/oss/v2/buckets/${bucketKey}/objects`,
        {
            headers: { Authorization: `Bearer ${token}` },
            params
        }
    );
    return res.data.items || [];
}

export async function deleteObject(token, bucketKey, objectKey) {
    await axios.delete(
        `${APS_BASE}/oss/v2/buckets/${bucketKey}/objects/${encodeURIComponent(objectKey)}`,
        { headers: { Authorization: `Bearer ${token}` } }
    );
}

export async function uploadToOSS(token, bucketKey, fileName, fileBuffer) {
    await ensureBucket(token, bucketKey);

    const objectKey  = `${Date.now()}_${fileName}`;
    const encodedKey = encodeURIComponent(objectKey);

    // Step 1: Request signed S3 upload URL
    const signedRes = await axios.get(
        `${APS_BASE}/oss/v2/buckets/${bucketKey}/objects/${encodedKey}/signeds3upload?minutesExpiration=60`,
        { headers: { Authorization: `Bearer ${token}` } }
    );

    const { uploadKey, urls } = signedRes.data;

    // Step 2: PUT file to S3 URL
    await axios.put(urls[0], fileBuffer, {
        headers: { "Content-Type": "application/octet-stream" },
        maxBodyLength: Infinity,
        maxContentLength: Infinity
    });

    // Step 3: Complete the upload
    const completeRes = await axios.post(
        `${APS_BASE}/oss/v2/buckets/${bucketKey}/objects/${encodedKey}/signeds3upload`,
        { uploadKey },
        {
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json"
            }
        }
    );

    return completeRes.data.objectId;
}
