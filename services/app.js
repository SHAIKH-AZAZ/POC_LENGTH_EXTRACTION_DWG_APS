import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const APS_BASE = "https://developer.api.autodesk.com";

// Derive a valid bucket key from client ID (lowercase alphanumeric + hyphens only)
const BUCKET_KEY = process.env.APS_CLIENT_ID
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .substring(0, 50) + "-aps";

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

export async function ensureBucket(token) {
    try {
        await axios.get(`${APS_BASE}/oss/v2/buckets/${BUCKET_KEY}/details`, {
            headers: { Authorization: `Bearer ${token}` }
        });
    } catch (err) {
        if (err.response?.status === 404) {
            await axios.post(
                `${APS_BASE}/oss/v2/buckets`,
                { bucketKey: BUCKET_KEY, policyKey: "transient" },
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

export async function uploadToOSS(token, fileName, fileBuffer) {
    await ensureBucket(token);

    const objectKey  = `${Date.now()}_${fileName}`;
    const encodedKey = encodeURIComponent(objectKey);

    // Step 1: Request a signed S3 upload URL from APS
    const signedRes = await axios.get(
        `${APS_BASE}/oss/v2/buckets/${BUCKET_KEY}/objects/${encodedKey}/signeds3upload?minutesExpiration=60`,
        { headers: { Authorization: `Bearer ${token}` } }
    );

    const { uploadKey, urls } = signedRes.data;

    // Step 2: PUT the file directly to the S3 URL (no APS auth header needed here)
    await axios.put(urls[0], fileBuffer, {
        headers: {
            "Content-Type": "application/octet-stream"
        },
        maxBodyLength: Infinity,
        maxContentLength: Infinity
    });

    // Step 3: Tell APS the upload is complete
    const completeRes = await axios.post(
        `${APS_BASE}/oss/v2/buckets/${BUCKET_KEY}/objects/${encodedKey}/signeds3upload`,
        { uploadKey },
        {
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json"
            }
        }
    );

    // objectId looks like: urn:adsk.objects:os.object:bucketKey/objectKey
    return completeRes.data.objectId;
}

export async function translateModel(token, objectId) {
    // Base64-encode the objectId to get the URN (no padding)
    const urn = Buffer.from(objectId).toString("base64").replace(/=/g, "");

    await axios.post(
        `${APS_BASE}/modelderivative/v2/designdata/job`,
        {
            input: { urn },
            output: {
                formats: [{ type: "svf2", views: ["2d", "3d"] }]
            }
        },
        {
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
                "x-ads-force": "true"
            }
        }
    );

    return urn;
}

export async function getManifest(token, urn) {
    const response = await axios.get(
        `${APS_BASE}/modelderivative/v2/designdata/${urn}/manifest`,
        {
            headers: { Authorization: `Bearer ${token}` }
        }
    );
    return response.data;
}
