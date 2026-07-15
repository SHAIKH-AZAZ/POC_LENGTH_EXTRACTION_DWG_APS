# BARFILL — Bar layout for AutoCAD Web

AutoLISP port of the APS viewer bar-layout tool (`public/bar-layout.js`). Draws horizontal/vertical bars inside a closed boundary at fixed spacing and prints a bar schedule (length × quantity) in mm.

## Install in AutoCAD Web (web.autocad.com)

Requires a full AutoCAD subscription (LISP is not available on free/LT web tiers).

1. Open a drawing at web.autocad.com.
2. Left sidebar → **LISP** tab → **Manage LISP**.
3. Upload `barfill.lsp` in the Support Files manager.
4. Load it into the drawing (optionally set it to load at startup).

For desktop AutoCAD: `APPLOAD` → select `barfill.lsp`. Works in AutoCAD LT 2024+ too.

## Usage

1. Type `BARFILL` (or `BF`).
2. Pick a **closed** boundary: LWPOLYLINE, POLYLINE, CIRCLE, ELLIPSE, or SPLINE.
3. Answer the prompts (Enter accepts defaults):
   - **Unit scale** — mm per drawing unit. `1000` if the drawing is in metres, `1` if in mm, `304.8` for feet. Default 1000.
   - **Bar spacing in mm** — default 150.
   - **Direction** — Horizontal / Vertical / Both. Default Both.
4. Bars are drawn as LINE entities on layers `BARS_H` (red) and `BARS_V` (green); the schedule and total length print to the command line.

## Notes / limitations vs the APS web app

- Curved boundaries (circles, arcs in polylines, splines) are approximated by chord segments, same approach as the viewer tool.
- Guard rails match the app: warns when spacing exceeds the boundary (wrong unit scale) and caps runaway bar counts.
- No JSON export or custom panel — AutoCAD Web LISP has no file/HTTP access and no dialogs, so results are drawn geometry + command-line schedule only. Use the APS app for saved JSON schedules.
- Only `.lsp` files load in AutoCAD Web (no `.fas`/`.vlx`, no .NET plugins).
