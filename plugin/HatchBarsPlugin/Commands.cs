using System;
using System.IO;
using Autodesk.AutoCAD.DatabaseServices;
using Autodesk.AutoCAD.Runtime;
using Application = Autodesk.AutoCAD.ApplicationServices.Core.Application;

namespace HatchBarsPlugin
{
    // Headless Design Automation command: no prompts. Inputs come from
    // params.json in the job working directory; output is result.json.
    public class Commands
    {
        [CommandMethod("AUTOHATCH", CommandFlags.Modal)]
        public void AutoHatch()
        {
            var doc = Application.DocumentManager.MdiActiveDocument;
            var ed = doc.Editor;

            try
            {
                var p = JsonService.Read<HatchParams>(
                    Path.Combine(Directory.GetCurrentDirectory(), "params.json"));

                ed.WriteMessage(
                    $"\nAUTOHATCH handle={p.BoundaryHandle} direction={p.Direction} " +
                    $"spacingMm={p.SpacingMm} unitScaleToMm={p.UnitScaleToMm}");

                var db = doc.Database;
                long handleValue = Convert.ToInt64(p.BoundaryHandle, 16);

                if (!db.TryGetObjectId(new Handle(handleValue), out ObjectId boundaryId))
                {
                    throw new InvalidOperationException(
                        $"Entity handle {p.BoundaryHandle} not found in drawing.");
                }

                BarLayoutResult result = HatchService.ComputeBars(
                    db, boundaryId, p.Direction, p.SpacingMm, p.UnitScaleToMm);

                JsonService.Write(result,
                    Path.Combine(Directory.GetCurrentDirectory(), "result.json"));

                ed.WriteMessage(
                    $"\nAUTOHATCH OK - bars={result.Details.Count} " +
                    $"(H={result.Totals.Horizontal.Quantity}, V={result.Totals.Vertical.Quantity})");
            }
            catch (System.Exception ex)
            {
                // No result.json written -> DA fails the workitem (missing
                // required output) and this message lands in the report.
                ed.WriteMessage($"\nAUTOHATCH ERROR: {ex.Message}\n{ex.StackTrace}");
            }
        }
    }
}
