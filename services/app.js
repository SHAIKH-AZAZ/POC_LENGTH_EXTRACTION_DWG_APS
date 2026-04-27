import axios from "axios";
import dotenv from "dotenv";
import { getBucketKey, ensureBucket, uploadToOSS } from "./oss.js";
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
