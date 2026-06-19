// Quick APS credential + bucket check.
// Run from the project root:  node test-aps.js
import dotenv from "dotenv";
import axios from "axios";
import { getBucketKey } from "./services/oss.js";

dotenv.config();

const APS_BASE = "https://developer.api.autodesk.com";
const { APS_CLIENT_ID, APS_CLIENT_SECRET } = process.env;

async function main() {
    if (!APS_CLIENT_ID || !APS_CLIENT_SECRET) {
        console.error("✗ Missing APS_CLIENT_ID / APS_CLIENT_SECRET in .env");
        process.exit(1);
    }

    // 1) Authenticate
    let token;
    try {
        const res = await axios.post(
            `${APS_BASE}/authentication/v2/token`,
            new URLSearchParams({
                grant_type: "client_credentials",
                scope: "data:read data:write bucket:read bucket:create"
            }),
            {
                auth: { username: APS_CLIENT_ID, password: APS_CLIENT_SECRET },
                headers: { "Content-Type": "application/x-www-form-urlencoded" }
            }
        );
        token = res.data.access_token;
        console.log("✓ Auth OK — token received, expires in", res.data.expires_in, "s");
    } catch (err) {
        console.error("✗ Auth FAILED:", err.response?.status, err.response?.data || err.message);
        process.exit(1);
    }

    // 2) Check the bucket
    const bucketKey = getBucketKey(APS_CLIENT_ID);
    console.log("  Bucket key:", bucketKey);
    try {
        const res = await axios.get(
            `${APS_BASE}/oss/v2/buckets/${bucketKey}/details`,
            { headers: { Authorization: `Bearer ${token}` } }
        );
        console.log("✓ Bucket exists — policy:", res.data.policyKey);
    } catch (err) {
        if (err.response?.status === 404) {
            console.log("• Bucket does not exist yet (will be auto-created on first upload).");
        } else if (err.response?.status === 403) {
            console.log("✗ Bucket name is owned by another account — pick a different APS_BUCKET_KEY.");
        } else {
            console.error("✗ Bucket check error:", err.response?.status, err.response?.data || err.message);
        }
    }
}

main();
