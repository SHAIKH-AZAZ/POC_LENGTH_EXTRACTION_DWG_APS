# HatchBars — Design Automation plugin

C# plugin that runs the AUTOHATCH bar-fill inside AutoCAD Core Console on APS
Design Automation. Headless port of the desktop `hatch_automation` plugin:
no prompts (reads `params.json`), no entity creation (pure computation),
writes `result.json` matching the web client's `generateBarLayout()` schema.

## Build (any OS — Linux works)

Requires only the .NET SDK. AutoCAD references come from the official
`AutoCAD.NET` NuGet package (24.3.0) — **no AutoCAD install or ObjectARX SDK
needed**, and since the references are compile-only the DLL builds fine on
Linux (an installed AutoCAD 2027 won't help anyway: its managed DLLs are
.NET 10, incompatible with the net48 DA engine).

```bash
cd plugin/HatchBarsPlugin
dotnet build -c Release
```

Optional: build against a local AutoCAD 2021–2024 install or ObjectARX 2024
SDK instead of NuGet:

```powershell
dotnet build -c Release -p:AcadRefDir="C:\Program Files\Autodesk\AutoCAD 2024\"
```

## Package the bundle zip

The zip must contain the `HatchBars.bundle` folder at its root:

```bash
cp HatchBarsPlugin/bin/Release/HatchBarsPlugin.dll HatchBars.bundle/Contents/
cd plugin && rm -f HatchBars.bundle.zip && zip -r HatchBars.bundle.zip HatchBars.bundle
```

## Upload to Design Automation

From the repo root (re-run after **every** DLL rebuild — it creates a new
appbundle version and repoints the `prod` alias):

```bash
node scripts/setup-da.js
```

## Engine / .NET matrix

| DA engine | AutoCAD | Target framework | JSON |
|---|---|---|---|
| `Autodesk.AutoCAD+24_3` (default) | 2024 | `net48` | DataContractJsonSerializer (in-box) |
| `Autodesk.AutoCAD+25_0` / `25_1` | 2025 | `net8.0` | swap JsonService to System.Text.Json |

To retarget 2025: set `DA_ENGINE=Autodesk.AutoCAD+25_1` in `.env`, change
`TargetFramework` to `net8.0`, reference ObjectARX 2025 DLLs, replace
`DataContractJsonSerializer` with `System.Text.Json` (attribute names via
`[JsonPropertyName]`), and update `SeriesMin/Max="R25.1"` in
`PackageContents.xml`.

## Files

- `HatchBarsPlugin/Commands.cs` — headless `AUTOHATCH` command: params.json →
  find entity by hex handle → compute → result.json. On error writes the
  message to the console (lands in the DA report) and skips result.json so the
  workitem fails visibly.
- `HatchBarsPlugin/HatchService.cs` — scanline computation (read-only
  transaction; `IntersectWith` against the true curve, so arcs/splines are
  exact).
- `HatchBarsPlugin/JsonService.cs` — DataContractJsonSerializer read/write.
- `HatchBarsPlugin/Models.cs` — params/result POCOs.
- `HatchBars.bundle/PackageContents.xml` — autoloader manifest
  (`LoadOnCommandInvocation` for `AUTOHATCH`).
