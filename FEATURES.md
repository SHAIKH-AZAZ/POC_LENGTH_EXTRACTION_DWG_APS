# DWG Length Extraction — Features

A web app for uploading DWG drawings, viewing them in 3D, measuring distances, and managing previously uploaded files — all powered by Autodesk Platform Services (APS).

---

## 1. Upload DWG File

- **Choose File** button or **drag & drop** a `.dwg` file onto the drop zone
- Validates file extension (`.dwg` only)
- Max file size: **100 MB**
- Uploads to APS Object Storage (OSS) using chunked S3 signed URLs (5 MB chunks)

## 2. Translation Progress Stepper

After upload, a 4-step progress UI tracks the workflow:

1. **Uploading** — file is being sent to APS cloud storage
2. **Processing** — APS receives and queues the file
3. **Converting** — Model Derivative API translates DWG → SVF2 viewable format
4. **Rendering** — viewer initializes and loads the model

Each step animates with a spinner; completed steps show a green check.

## 3. 3D Drawing Viewer

- Powered by **Autodesk Forge Viewer 7.x**
- Supports 2D and 3D views
- Pan, zoom, rotate, orbit using mouse / scroll
- Auto-loads the default geometry on open

## 4. Distance Measurement

- **Measure** button activates distance measurement tool
- Click two points in the drawing to measure distance between them
- Measurement labels (X, Y, distance in mm) display on the drawing
- Multiple measurements can be taken in sequence

## 5. Length Extraction

- **Extract Length** button captures the latest measurement
- Sends extracted length (mm) to backend → saved to `data/measurements.json`
- After extraction:
  - Measurement mode automatically exits
  - All measurements are cleared
  - Ready for the next measurement (no page reload needed)

## 6. Drawing Library (Browse Past Uploads)

Click **📚 Browse Uploaded Drawings** to open a modal listing all files stored in your APS bucket.

### Library table columns

| Column   | Details                                                |
|----------|--------------------------------------------------------|
| Name     | Original DWG filename (timestamp prefix stripped)      |
| Size     | File size in MB                                        |
| Uploaded | Date/time of upload                                    |
| Status   | Color-coded badge (Success / In Progress / Pending / Failed) |
| Actions  | Open + Delete buttons                                  |

### Status filter

Dropdown to filter by:
- **All Statuses**
- **Success**
- **In Progress**
- **Pending**
- **Failed**

### Pagination

- Shows **10 files per page**, sorted **newest first**
- **Load More** button fetches next 10 files

### Open

- Available **only for Success** files (button disabled otherwise)
- Closes the library modal and loads the drawing directly in the viewer
- No re-upload needed

### Delete

- Available for **all files** regardless of status
- Shows confirmation dialog before deleting
- Permanently removes the file from APS storage

---

## API Endpoints (Backend)

| Method | Path                          | Purpose                                    |
|--------|-------------------------------|--------------------------------------------|
| GET    | `/api/auth/token`             | Public viewer token (`viewables:read`)     |
| POST   | `/api/upload`                 | Upload DWG, kick off translation           |
| GET    | `/api/upload/status/:urn`     | Poll translation status                    |
| GET    | `/api/upload/list`            | List uploaded files (paginated + filtered) |
| DELETE | `/api/upload/file?urn=...`    | Delete file from APS storage               |
| POST   | `/api/measurements`           | Save extracted length to `measurements.json` |

---

## Tech Stack

- **Backend:** Node.js + Express, axios, multer, dotenv
- **Frontend:** Vanilla JS (ES6 modules), no framework
- **Cloud:** Autodesk Platform Services (OSS + Model Derivative)
- **Auth:** APS OAuth 2-legged (client credentials)

## Project Structure

```
├── server.js                       # Express entry
├── routes/
│   ├── auth.js                     # Token endpoint
│   ├── upload.js                   # Upload, list, delete, status
│   └── measurements.js             # Save measurements
├── services/
│   ├── app.js                      # Auth + high-level orchestration
│   ├── oss.js                      # APS Object Storage Service
│   └── modelderivative.js          # Translation + manifest
├── public/
│   ├── index.html                  # Single-page UI
│   ├── app.js                      # Frontend orchestrator
│   ├── upload.js                   # File upload + polling
│   ├── viewer.js                   # Autodesk Viewer setup
│   ├── progress.js                 # Step progress UI
│   └── library.js                  # File library modal
└── data/measurements.json          # Saved length extractions
```
