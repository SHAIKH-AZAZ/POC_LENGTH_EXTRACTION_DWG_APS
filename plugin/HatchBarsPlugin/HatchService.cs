using System;
using System.Collections.Generic;
using System.Linq;
using Autodesk.AutoCAD.DatabaseServices;
using Autodesk.AutoCAD.Geometry;

namespace HatchBarsPlugin
{
    // Pure computation — no entities are created (JSON-only output), so the
    // transaction is read-only. Adapted from the desktop plugin's
    // HatchService.ProcessBoundary.
    public static class HatchService
    {
        private const double PointTolerance = 1e-6;
        private const int CurveSampleCount = 64;
        private const int MaxScanLines = 10000;

        public static BarLayoutResult ComputeBars(
            Database db,
            ObjectId boundaryId,
            string direction,
            double spacingMm,
            double unitScaleToMm)
        {
            var details = new List<BarDetail>();
            List<PointDto> boundaryPoints;

            using (Transaction tr = db.TransactionManager.StartTransaction())
            {
                Curve boundary = tr.GetObject(boundaryId, OpenMode.ForRead) as Curve;

                if (boundary == null)
                {
                    var entity = tr.GetObject(boundaryId, OpenMode.ForRead);
                    throw new InvalidOperationException(
                        $"Boundary entity {entity.GetType().Name} is not a curve.");
                }

                if (!boundary.Closed)
                {
                    throw new InvalidOperationException(
                        $"Boundary entity {boundary.GetType().Name} is not a closed curve.");
                }

                double spacingDrawing = spacingMm / unitScaleToMm;

                Extents3d ext = boundary.GeometricExtents;
                double minX = ext.MinPoint.X;
                double maxX = ext.MaxPoint.X;
                double minY = ext.MinPoint.Y;
                double maxY = ext.MaxPoint.Y;

                double xPadding = Math.Max((maxX - minX) + spacingDrawing, 1.0);
                double yPadding = Math.Max((maxY - minY) + spacingDrawing, 1.0);

                CheckScanLineCount(minY, maxY, minX, maxX, spacingDrawing, direction);

                if (direction == "Horizontal" || direction == "Both")
                {
                    // Interior scan lines only (start at min + spacing, exclude max)
                    // to match the web app's bar-layout.js scanPositions().
                    for (double y = minY + spacingDrawing; y < maxY - 1e-9; y += spacingDrawing)
                    {
                        using (var testLine = new Line(
                            new Point3d(minX - xPadding, y, 0),
                            new Point3d(maxX + xPadding, y, 0)))
                        {
                            CollectBars(boundary, testLine, details, "Horizontal",
                                sortByX: true, unitScaleToMm);
                        }
                    }
                }

                if (direction == "Vertical" || direction == "Both")
                {
                    // Interior scan lines only, matching the web app.
                    for (double x = minX + spacingDrawing; x < maxX - 1e-9; x += spacingDrawing)
                    {
                        using (var testLine = new Line(
                            new Point3d(x, minY - yPadding, 0),
                            new Point3d(x, maxY + yPadding, 0)))
                        {
                            CollectBars(boundary, testLine, details, "Vertical",
                                sortByX: false, unitScaleToMm);
                        }
                    }
                }

                boundaryPoints = ExtractBoundaryPoints(boundary);

                tr.Commit();
            }

            var horizontal = details.Where(d => d.Direction == "Horizontal").ToList();
            var vertical = details.Where(d => d.Direction == "Vertical").ToList();

            return new BarLayoutResult
            {
                Settings = new LayoutSettings
                {
                    Direction = direction,
                    SpacingMm = spacingMm,
                    UnitScaleToMm = unitScaleToMm
                },
                Boundary = boundaryPoints,
                Summary = new DirectionSummary
                {
                    Horizontal = Aggregate(horizontal),
                    Vertical = Aggregate(vertical)
                },
                Totals = new TotalsGroup
                {
                    Horizontal = Totals(horizontal),
                    Vertical = Totals(vertical)
                },
                Details = details
            };
        }

        private static void CheckScanLineCount(
            double minY, double maxY, double minX, double maxX,
            double spacingDrawing, string direction)
        {
            double count = 0;
            if (direction == "Horizontal" || direction == "Both")
                count += (maxY - minY) / spacingDrawing;
            if (direction == "Vertical" || direction == "Both")
                count += (maxX - minX) / spacingDrawing;

            if (count > MaxScanLines)
            {
                throw new InvalidOperationException(
                    "Spacing too small for boundary size — too many bars.");
            }
        }

        private static void CollectBars(
            Curve boundary,
            Line testLine,
            List<BarDetail> details,
            string direction,
            bool sortByX,
            double unitScaleToMm)
        {
            var pts = new Point3dCollection();
            boundary.IntersectWith(testLine, Intersect.OnBothOperands, pts, IntPtr.Zero, IntPtr.Zero);

            if (pts.Count < 2)
                return;

            List<Point3d> sorted = pts
                .Cast<Point3d>()
                .OrderBy(p => sortByX ? p.X : p.Y)
                .ToList();

            List<Point3d> cleaned = RemoveNearDuplicatePoints(sorted);

            // Pair consecutive intersections (i, i+1) as interior spans.
            for (int i = 0; i + 1 < cleaned.Count; i += 2)
            {
                Point3d start = cleaned[i];
                Point3d end = cleaned[i + 1];

                double lengthDrawing = start.DistanceTo(end);
                if (lengthDrawing < 1e-9)
                    continue;

                int number = details.Count(d => d.Direction == direction) + 1;
                string prefix = direction == "Horizontal" ? "H" : "V";

                details.Add(new BarDetail
                {
                    Id = $"{prefix}-{number}",
                    Direction = direction,
                    Length = Math.Round(lengthDrawing * unitScaleToMm, 2),
                    Start = ToDto(start),
                    End = ToDto(end)
                });
            }
        }

        private static List<Point3d> RemoveNearDuplicatePoints(List<Point3d> points)
        {
            var result = new List<Point3d>();
            foreach (Point3d pt in points)
            {
                if (result.Count == 0 || result[result.Count - 1].DistanceTo(pt) > PointTolerance)
                    result.Add(pt);
            }
            return result;
        }

        // Boundary vertices are for display/persistence only (the overlay and
        // the /api/bar-layouts validation need >= 3 points); the bar math above
        // uses the true curve.
        private static List<PointDto> ExtractBoundaryPoints(Curve boundary)
        {
            var points = new List<PointDto>();

            if (boundary is Polyline pl)
            {
                for (int i = 0; i < pl.NumberOfVertices; i++)
                    points.Add(ToDto(pl.GetPoint3dAt(i)));
                return points;
            }

            double startParam = boundary.StartParam;
            double endParam = boundary.EndParam;
            for (int i = 0; i < CurveSampleCount; i++)
            {
                double t = startParam + (endParam - startParam) * i / CurveSampleCount;
                points.Add(ToDto(boundary.GetPointAtParameter(t)));
            }
            return points;
        }

        private static List<SummaryItem> Aggregate(List<BarDetail> bars)
        {
            return bars
                .GroupBy(b => Math.Round(b.Length, 2))
                .Select(g => new SummaryItem { Length = g.Key, Quantity = g.Count() })
                .OrderBy(s => s.Length)
                .ToList();
        }

        private static DirectionTotals Totals(List<BarDetail> bars)
        {
            return new DirectionTotals
            {
                Quantity = bars.Count,
                TotalLength = Math.Round(bars.Sum(b => b.Length), 2)
            };
        }

        private static PointDto ToDto(Point3d p)
        {
            return new PointDto
            {
                X = Math.Round(p.X, 4),
                Y = Math.Round(p.Y, 4),
                Z = Math.Round(p.Z, 4)
            };
        }
    }
}
