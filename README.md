# APS Length Extraction Tool 

A web-based engineering tool built using **Autodesk Platform Services (APS)** that allows users to measure distances directly on DWG/SVF drawings inside the browser and automatically store the extracted length.

This project demonstrates real-world integration of the **APS Viewer**, backend APIs, and file persistence — similar to workflows used in construction-tech and BIM applications.

---

## 🚀 Features

✅ Load DWG → Convert to SVF → View in Browser  
✅ Use APS Measure Tool to select two points  
✅ Capture final distance via custom UI button  
✅ Store extracted length in JSON  
✅ Print measurement in terminal  
✅ Clean Node.js + Express backend  
✅ Secure environment variable handling  

---

## 🏗️ Tech Stack

**Frontend**
- Autodesk APS Viewer
- HTML / CSS / JavaScript

**Backend**
- Node.js
- Express.js

**APS Services**
- Model Derivative API
- OAuth Authentication

---

## 📂 Project Structure

```
LENGTH_EXTRACTION/
│
├── public/              # Frontend files
│   ├── index.html
│   └── app.js
│
├── routes/              # API routes
│   ├── auth.js
│   └── measurements.js
│
├── services/            # APS service logic
│   └── app.js
|
├── data/
│   └── measurements.json
│
├── .env                 # Environment variables (ignored)
├── server.js            # Express server
└── package.json
└── package-lock.json
```

---

## ⚙️ Setup Instructions

### ✅ 1. Clone the Repository

```bash
git clone https://github.com/kalariashubh/LENGTH-EXTRACTION.git
cd LENGTH_EXTRACTION
```

---

### ✅ 2. Install Dependencies

```bash
npm install
```

---

### ✅ 3. Create `.env` File

Add your APS credentials:

```
APS_CLIENT_ID=your_client_id
APS_CLIENT_SECRET=your_client_secret
```

⚠️ Never commit `.env` to GitHub.

---

### ✅ 4. Start the Server

```bash
node server.js
```

Server runs at:

```
http://localhost:3000
```

---

## 📏 How It Works

1️⃣ Load the drawing in APS Viewer  
2️⃣ Select the Measure tool  
3️⃣ Click two points on the drawing  
4️⃣ Press **Extract Length**  
5️⃣ Length is:

- Printed in terminal  
- Stored in `measurements.json`

---

## ☁️ Cloud Bar Generation (Design Automation)

Runs the AUTOHATCH bar-fill **inside AutoCAD on APS Design Automation** — the
computation uses the real DWG entity (exact arcs/splines), not the viewer mesh.

Flow: select a closed polyline/circle in the viewer → **Generate in Cloud** →
backend submits a DA workitem (`POST /api/hatch`, polled via
`GET /api/hatch/:id`) → plugin computes bar lengths → result renders in the
same summary/overlay and saves through the existing **Save JSON** flow.

Setup (one-time, and after every plugin rebuild):

```bash
# 1. Build the plugin DLL (any OS, just needs .NET SDK) — see plugin/README.md
# 2. Provision appbundle + activity + aliases:
node scripts/setup-da.js
```

No new env vars required (`APS_CLIENT_ID`/`APS_CLIENT_SECRET`; app needs the
Design Automation API enabled). Optional: `DA_ENGINE` (default
`Autodesk.AutoCAD+24_3`).

Limitations (POC): jobs tracked in memory (lost on restart), polling only (no
webhooks), local dev only (not Vercel-compatible), source DWG must still be in
OSS (transient bucket, 24 h).

---

## 🔐 Security Notes

The following are ignored via `.gitignore`:

- `.env`
- `node_modules`
- Build folders
- data/measurements.json


