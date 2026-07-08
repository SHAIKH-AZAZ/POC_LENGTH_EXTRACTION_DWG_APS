// One-time (and after every DLL rebuild) Design Automation provisioning:
// appbundle + activity + "prod" aliases. Idempotent: POST, on 409 create a
// new version and repoint the alias.
//
// Usage: node scripts/setup-da.js [zipPath]   (default plugin/HatchBars.bundle.zip)
import fs from "fs";
import axios from "axios";
import {
    DA_BASE,
    BUNDLE_NAME,
    ACTIVITY_NAME,
    ALIAS,
    ENGINE,
    qualifiedBundleId,
    getDaToken
} from "../services/designautomation.js";

const zipPath = process.argv[2] || "plugin/HatchBars.bundle.zip";

function headers(token) {
    return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

async function ensureAppBundle(token, zipBuffer) {
    const body = { id: BUNDLE_NAME, engine: ENGINE, description: "Scanline bar layout (AUTOHATCH)" };

    let spec;
    try {
        const res = await axios.post(`${DA_BASE}/appbundles`, body, { headers: headers(token) });
        spec = res.data;
        console.log(`AppBundle created: ${BUNDLE_NAME} v${spec.version}`);
    } catch (err) {
        if (err.response?.status !== 409) throw err;
        const res = await axios.post(
            `${DA_BASE}/appbundles/${BUNDLE_NAME}/versions`,
            { engine: ENGINE, description: body.description },
            { headers: headers(token) }
        );
        spec = res.data;
        console.log(`AppBundle new version: ${BUNDLE_NAME} v${spec.version}`);
    }

    // Upload the zip to the returned form endpoint: formData fields first, file last.
    const form = new FormData();
    for (const [key, value] of Object.entries(spec.uploadParameters.formData)) {
        form.append(key, value);
    }
    form.append("file", new Blob([zipBuffer]), "bundle.zip");
    await axios.post(spec.uploadParameters.endpointURL, form, {
        maxBodyLength: Infinity,
        maxContentLength: Infinity
    });
    console.log("Bundle zip uploaded");

    return spec.version;
}

async function ensureAlias(token, kind, name, version) {
    try {
        await axios.post(
            `${DA_BASE}/${kind}/${name}/aliases`,
            { id: ALIAS, version },
            { headers: headers(token) }
        );
        console.log(`Alias created: ${kind}/${name}+${ALIAS} -> v${version}`);
    } catch (err) {
        if (err.response?.status !== 409) throw err;
        await axios.patch(
            `${DA_BASE}/${kind}/${name}/aliases/${ALIAS}`,
            { version },
            { headers: headers(token) }
        );
        console.log(`Alias repointed: ${kind}/${name}+${ALIAS} -> v${version}`);
    }
}

function activityBody() {
    return {
        id: ACTIVITY_NAME,
        engine: ENGINE,
        commandLine: [
            `$(engine.path)\\accoreconsole.exe /i "$(args[inputDwg].path)" /al "$(appbundles[${BUNDLE_NAME}].path)" /s "$(settings[script].path)"`
        ],
        appbundles: [qualifiedBundleId()],
        settings: { script: "AUTOHATCH\n" },
        parameters: {
            inputDwg: { verb: "get", localName: "input.dwg", required: true, description: "Source DWG" },
            paramsJson: { verb: "get", localName: "params.json", required: true, description: "Hatch parameters" },
            resultJson: { verb: "put", localName: "result.json", required: true, description: "Bar layout output" }
        },
        description: "Compute scanline bar layout inside a closed boundary; emits result.json"
    };
}

async function ensureActivity(token) {
    const body = activityBody();
    try {
        const res = await axios.post(`${DA_BASE}/activities`, body, { headers: headers(token) });
        console.log(`Activity created: ${ACTIVITY_NAME} v${res.data.version}`);
        return res.data.version;
    } catch (err) {
        if (err.response?.status !== 409) throw err;
        const { id, ...versionBody } = body;
        const res = await axios.post(
            `${DA_BASE}/activities/${ACTIVITY_NAME}/versions`,
            versionBody,
            { headers: headers(token) }
        );
        console.log(`Activity new version: ${ACTIVITY_NAME} v${res.data.version}`);
        return res.data.version;
    }
}

try {
    const zipBuffer = fs.readFileSync(zipPath);
    console.log(`Bundle zip: ${zipPath} (${zipBuffer.length} bytes), engine: ${ENGINE}`);

    const token = await getDaToken();

    const bundleVersion = await ensureAppBundle(token, zipBuffer);
    await ensureAlias(token, "appbundles", BUNDLE_NAME, bundleVersion);

    const activityVersion = await ensureActivity(token);
    await ensureAlias(token, "activities", ACTIVITY_NAME, activityVersion);

    console.log(`\nDone. Activity: ${process.env.APS_CLIENT_ID}.${ACTIVITY_NAME}+${ALIAS}`);
    console.log("Re-run this script after every DLL rebuild.");
} catch (err) {
    console.error("SETUP FAILED:", err.response?.status, JSON.stringify(err.response?.data) || err.message);
    process.exit(1);
}
