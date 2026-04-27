import axios from "axios";

const APS_BASE = "https://developer.api.autodesk.com";

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
