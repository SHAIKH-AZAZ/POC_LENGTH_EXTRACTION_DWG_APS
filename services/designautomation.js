import axios from "axios";
import { fetchToken, getInternalToken } from "./app.js";
import {
    getBucketKey,
    ensureBucket,
    createSignedUpload,
    completeSignedUpload,
    getSignedDownloadUrl,
    deleteObject
} from "./oss.js";

export const DA_BASE = "https://developer.api.autodesk.com/da/us-east/v3";
export const BUNDLE_NAME = "HatchBarsBundle";
export const ACTIVITY_NAME = "HatchBarsActivity";
export const ALIAS = "prod";
export const ENGINE = process.env.DA_ENGINE || "Autodesk.AutoCAD+24_3";

// Design Automation nickname defaults to the client id when never set.
export function qualifiedBundleId() {
    return `${process.env.APS_CLIENT_ID}.${BUNDLE_NAME}+${ALIAS}`;
}

export function qualifiedActivityId() {
    return `${process.env.APS_CLIENT_ID}.${ACTIVITY_NAME}+${ALIAS}`;
}

export async function getDaToken() {
    const data = await fetchToken(["code:all"]);
    return data.access_token;
}

// Creates a workitem that runs AUTOHATCH on an existing OSS DWG object.
// Returns ids the route needs later to finalize the result.
export async function createHatchWorkitem({ objectKey, boundaryHandle, direction, spacingMm, unitScaleToMm }) {
    const internalToken = await getInternalToken();
    const bucketKey = getBucketKey(process.env.APS_CLIENT_ID);
    await ensureBucket(internalToken, bucketKey);

    // Input DWG: 404 here means the transient object expired — let it throw.
    const inputUrl = await getSignedDownloadUrl(internalToken, bucketKey, objectKey, 60);

    // Output slot: the workitem PUTs to the signed URL; the object only
    // materializes in OSS when we complete the upload after DA success.
    const resultObjectKey = `hatch_result_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.json`;
    const { uploadKey, url: outputUrl } = await createSignedUpload(internalToken, bucketKey, resultObjectKey, 60);

    const params = { boundaryHandle, direction, spacingMm, unitScaleToMm };

    const daToken = await getDaToken();
    const res = await axios.post(
        `${DA_BASE}/workitems`,
        {
            activityId: qualifiedActivityId(),
            arguments: {
                inputDwg: { url: inputUrl },
                paramsJson: { url: "data:application/json," + JSON.stringify(params) },
                resultJson: { verb: "put", url: outputUrl }
            }
        },
        { headers: { Authorization: `Bearer ${daToken}`, "Content-Type": "application/json" } }
    );

    return { workitemId: res.data.id, resultObjectKey, uploadKey };
}

export async function getWorkitemStatus(workitemId) {
    const daToken = await getDaToken();
    const res = await axios.get(`${DA_BASE}/workitems/${workitemId}`, {
        headers: { Authorization: `Bearer ${daToken}` }
    });
    return res.data; // { status, reportUrl?, stats? }
}

// reportUrl is pre-signed — no auth header.
export async function fetchReport(reportUrl) {
    const res = await axios.get(reportUrl, { responseType: "text" });
    return typeof res.data === "string" ? res.data : JSON.stringify(res.data);
}

// After DA reports success: complete the signed upload, download the JSON,
// delete the temp object.
export async function finalizeHatchResult({ resultObjectKey, uploadKey }) {
    const internalToken = await getInternalToken();
    const bucketKey = getBucketKey(process.env.APS_CLIENT_ID);

    await completeSignedUpload(internalToken, bucketKey, resultObjectKey, uploadKey);

    const dlUrl = await getSignedDownloadUrl(internalToken, bucketKey, resultObjectKey, 60);
    const res = await axios.get(dlUrl, { responseType: "json" });

    try {
        await deleteObject(internalToken, bucketKey, resultObjectKey);
    } catch (err) {
        console.error("Result object cleanup failed:", resultObjectKey, err.message);
    }

    return res.data;
}
