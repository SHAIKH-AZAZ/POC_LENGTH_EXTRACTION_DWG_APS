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

// Request a signed S3 upload URL. The returned url accepts a plain PUT from
// any client (including a Design Automation workitem); the object only
// materializes in OSS after completeSignedUpload is called.
export async function createSignedUpload(token, bucketKey, objectKey, minutesExpiration = 60) {
    const res = await axios.get(
        `${APS_BASE}/oss/v2/buckets/${bucketKey}/objects/${encodeURIComponent(objectKey)}/signeds3upload?minutesExpiration=${minutesExpiration}`,
        { headers: { Authorization: `Bearer ${token}` } }
    );
    return { uploadKey: res.data.uploadKey, url: res.data.urls[0] };
}

export async function completeSignedUpload(token, bucketKey, objectKey, uploadKey) {
    const res = await axios.post(
        `${APS_BASE}/oss/v2/buckets/${bucketKey}/objects/${encodeURIComponent(objectKey)}/signeds3upload`,
        { uploadKey },
        {
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json"
            }
        }
    );
    return res.data.objectId;
}

export async function getSignedDownloadUrl(token, bucketKey, objectKey, minutesExpiration = 60) {
    const res = await axios.get(
        `${APS_BASE}/oss/v2/buckets/${bucketKey}/objects/${encodeURIComponent(objectKey)}/signeds3download?minutesExpiration=${minutesExpiration}`,
        { headers: { Authorization: `Bearer ${token}` } }
    );
    return res.data.url;
}

export async function uploadToOSS(token, bucketKey, fileName, fileBuffer) {
    await ensureBucket(token, bucketKey);

    const objectKey = `${Date.now()}_${fileName}`;

    const { uploadKey, url } = await createSignedUpload(token, bucketKey, objectKey);

    await axios.put(url, fileBuffer, {
        headers: { "Content-Type": "application/octet-stream" },
        maxBodyLength: Infinity,
        maxContentLength: Infinity
    });

    return completeSignedUpload(token, bucketKey, objectKey, uploadKey);
}
