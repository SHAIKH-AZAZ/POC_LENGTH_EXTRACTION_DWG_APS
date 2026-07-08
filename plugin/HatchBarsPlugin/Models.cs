using System.Collections.Generic;
using System.Runtime.Serialization;

namespace HatchBarsPlugin
{
    // Input: params.json dropped into the job working dir by Design Automation.
    [DataContract]
    public class HatchParams
    {
        [DataMember(Name = "boundaryHandle")] public string BoundaryHandle { get; set; }
        [DataMember(Name = "direction")] public string Direction { get; set; }
        [DataMember(Name = "spacingMm")] public double SpacingMm { get; set; }
        [DataMember(Name = "unitScaleToMm")] public double UnitScaleToMm { get; set; }
    }

    // Output: result.json — byte-compatible with the web client's
    // generateBarLayout() output (public/bar-layout.js) so the frontend
    // reuses its render/save flow unchanged.
    [DataContract]
    public class PointDto
    {
        [DataMember(Name = "x")] public double X { get; set; }
        [DataMember(Name = "y")] public double Y { get; set; }
        [DataMember(Name = "z")] public double Z { get; set; }
    }

    [DataContract]
    public class LayoutSettings
    {
        [DataMember(Name = "direction")] public string Direction { get; set; }
        [DataMember(Name = "spacingMm")] public double SpacingMm { get; set; }
        [DataMember(Name = "unitScaleToMm")] public double UnitScaleToMm { get; set; }
    }

    [DataContract]
    public class SummaryItem
    {
        [DataMember(Name = "Length")] public double Length { get; set; }
        [DataMember(Name = "Quantity")] public int Quantity { get; set; }
    }

    [DataContract]
    public class DirectionSummary
    {
        [DataMember(Name = "Horizontal")] public List<SummaryItem> Horizontal { get; set; }
        [DataMember(Name = "Vertical")] public List<SummaryItem> Vertical { get; set; }
    }

    [DataContract]
    public class DirectionTotals
    {
        [DataMember(Name = "quantity")] public int Quantity { get; set; }
        [DataMember(Name = "totalLength")] public double TotalLength { get; set; }
    }

    [DataContract]
    public class TotalsGroup
    {
        [DataMember(Name = "Horizontal")] public DirectionTotals Horizontal { get; set; }
        [DataMember(Name = "Vertical")] public DirectionTotals Vertical { get; set; }
    }

    [DataContract]
    public class BarDetail
    {
        [DataMember(Name = "id")] public string Id { get; set; }
        [DataMember(Name = "direction")] public string Direction { get; set; }
        [DataMember(Name = "length")] public double Length { get; set; }
        [DataMember(Name = "start")] public PointDto Start { get; set; }
        [DataMember(Name = "end")] public PointDto End { get; set; }
    }

    [DataContract]
    public class BarLayoutResult
    {
        [DataMember(Name = "settings")] public LayoutSettings Settings { get; set; }
        [DataMember(Name = "boundary")] public List<PointDto> Boundary { get; set; }
        [DataMember(Name = "summary")] public DirectionSummary Summary { get; set; }
        [DataMember(Name = "totals")] public TotalsGroup Totals { get; set; }
        [DataMember(Name = "details")] public List<BarDetail> Details { get; set; }
    }
}
