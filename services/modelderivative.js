import axios from "axios";

const APS_BASE = "https://developer.api.autodesk.com";

export async function translateModel(token, objectId) {
    // URL-safe Base64-encode the objectId to get the URN (APS requires
    // URL-safe base64, no padding: + -> -, / -> _, drop "=").
    const urn = Buffer.from(objectId).toString("base64url");

    await axios.post(
        `${APS_BASE}/modelderivative/v2/designdata/job`,
        {
            input: { urn },
            output: {
                // DWG length extraction works on 2D drawings. Requesting "3d"
                // for 2D-only DWGs is a known cause of the translation stalling
                // at "99% complete" while one derivative never finishes.
                formats: [{ type: "svf2", views: ["2d"] }]
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
