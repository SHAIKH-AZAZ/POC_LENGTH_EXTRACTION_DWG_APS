const EPS = 1e-9;
const MAX_SCAN_LINES = 10000;

function asNumber(value, name) {
    const n = Number(value);
    if (!Number.isFinite(n)) {
        throw new Error(`${name} must be a valid number.`);
    }
    return n;
}

function round(value, digits = 2) {
    const factor = 10 ** digits;
    return Math.round((value + Number.EPSILON) * factor) / factor;
}

function clonePoint(point) {
    return {
        x: asNumber(point.x, "Point X"),
        y: asNumber(point.y, "Point Y"),
        z: Number.isFinite(Number(point.z)) ? Number(point.z) : 0
    };
}

function pointDistance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

function samePoint(a, b, tolerance = 1e-7) {
    return pointDistance(a, b) <= tolerance;
}

function cleanBoundaryPoints(points) {
    if (!Array.isArray(points)) {
        throw new Error("Boundary points are required.");
    }

    const cleaned = [];
    for (const point of points) {
        const p = clonePoint(point);
        if (!cleaned.length || !samePoint(cleaned[cleaned.length - 1], p)) {
            cleaned.push(p);
        }
    }

    if (cleaned.length > 2 && samePoint(cleaned[0], cleaned[cleaned.length - 1])) {
        cleaned.pop();
    }

    if (cleaned.length < 3) {
        throw new Error("Boundary must have at least 3 points.");
    }

    return cleaned;
}

function signedArea(points) {
    let area = 0;
    for (let i = 0; i < points.length; i++) {
        const a = points[i];
        const b = points[(i + 1) % points.length];
        area += a.x * b.y - b.x * a.y;
    }
    return area / 2;
}

function orientation(a, b, c) {
    const value = (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);
    if (Math.abs(value) <= EPS) return 0;
    return value > 0 ? 1 : 2;
}

function onSegment(a, b, c) {
    return b.x <= Math.max(a.x, c.x) + EPS
        && b.x + EPS >= Math.min(a.x, c.x)
        && b.y <= Math.max(a.y, c.y) + EPS
        && b.y + EPS >= Math.min(a.y, c.y);
}

function segmentsIntersect(a, b, c, d) {
    const o1 = orientation(a, b, c);
    const o2 = orientation(a, b, d);
    const o3 = orientation(c, d, a);
    const o4 = orientation(c, d, b);

    if (o1 !== o2 && o3 !== o4) return true;
    if (o1 === 0 && onSegment(a, c, b)) return true;
    if (o2 === 0 && onSegment(a, d, b)) return true;
    if (o3 === 0 && onSegment(c, a, d)) return true;
    if (o4 === 0 && onSegment(c, b, d)) return true;

    return false;
}

function hasSelfIntersection(points) {
    for (let i = 0; i < points.length; i++) {
        const a1 = points[i];
        const a2 = points[(i + 1) % points.length];

        for (let j = i + 1; j < points.length; j++) {
            const adjacent = Math.abs(i - j) === 1 || (i === 0 && j === points.length - 1);
            if (adjacent) continue;

            const b1 = points[j];
            const b2 = points[(j + 1) % points.length];
            if (segmentsIntersect(a1, a2, b1, b2)) {
                return true;
            }
        }
    }
    return false;
}

function validateBoundary(points) {
    const cleaned = cleanBoundaryPoints(points);

    if (Math.abs(signedArea(cleaned)) <= EPS) {
        throw new Error("Boundary area is too small.");
    }

    if (hasSelfIntersection(cleaned)) {
        throw new Error("Boundary cannot self-intersect.");
    }

    return cleaned;
}

function bounds(points) {
    return points.reduce((box, point) => ({
        minX: Math.min(box.minX, point.x),
        maxX: Math.max(box.maxX, point.x),
        minY: Math.min(box.minY, point.y),
        maxY: Math.max(box.maxY, point.y)
    }), {
        minX: Infinity,
        maxX: -Infinity,
        minY: Infinity,
        maxY: -Infinity
    });
}

function uniqueSorted(values) {
    const sorted = values
        .filter(value => Number.isFinite(value))
        .sort((a, b) => a - b);
    const unique = [];

    for (const value of sorted) {
        if (!unique.length || Math.abs(unique[unique.length - 1] - value) > 1e-7) {
            unique.push(value);
        }
    }

    return unique;
}

function horizontalIntersections(points, y) {
    const intersections = [];

    for (let i = 0; i < points.length; i++) {
        const a = points[i];
        const b = points[(i + 1) % points.length];
        if (Math.abs(a.y - b.y) <= EPS) continue;

        const minY = Math.min(a.y, b.y);
        const maxY = Math.max(a.y, b.y);
        if (y < minY - EPS || y >= maxY - EPS) continue;

        const t = (y - a.y) / (b.y - a.y);
        if (t < -EPS || t > 1 + EPS) continue;
        intersections.push(a.x + t * (b.x - a.x));
    }

    return uniqueSorted(intersections);
}

function verticalIntersections(points, x) {
    const intersections = [];

    for (let i = 0; i < points.length; i++) {
        const a = points[i];
        const b = points[(i + 1) % points.length];
        if (Math.abs(a.x - b.x) <= EPS) continue;

        const minX = Math.min(a.x, b.x);
        const maxX = Math.max(a.x, b.x);
        if (x < minX - EPS || x >= maxX - EPS) continue;

        const t = (x - a.x) / (b.x - a.x);
        if (t < -EPS || t > 1 + EPS) continue;
        intersections.push(a.y + t * (b.y - a.y));
    }

    return uniqueSorted(intersections);
}

function scanPositions(min, max, spacing) {
    const span = max - min;
    if (span <= spacing + EPS) return [];

    const count = Math.floor((span - EPS) / spacing);
    if (count > MAX_SCAN_LINES) {
        throw new Error("Spacing creates too many bars. Increase spacing.");
    }

    const positions = [];
    for (let i = 1; i <= count; i++) {
        const value = min + i * spacing;
        if (value < max - EPS) {
            positions.push(value);
        }
    }
    return positions;
}

function averageZ(points) {
    return points.reduce((sum, point) => sum + point.z, 0) / points.length;
}

function formatPoint(point) {
    return {
        x: round(point.x, 4),
        y: round(point.y, 4),
        z: round(point.z || 0, 4)
    };
}

function aggregate(bars) {
    const groups = new Map();
    for (const bar of bars) {
        const key = round(bar.length, 2);
        groups.set(key, (groups.get(key) || 0) + 1);
    }

    return [...groups.entries()]
        .map(([length, quantity]) => ({ Length: Number(length), Quantity: quantity }))
        .sort((a, b) => a.Length - b.Length);
}

function totals(bars) {
    return {
        quantity: bars.length,
        totalLength: round(bars.reduce((sum, bar) => sum + bar.length, 0), 2)
    };
}

function buildHorizontalBars(points, spacingDrawing, unitScaleToMm) {
    const box = bounds(points);
    const z = averageZ(points);
    const bars = [];

    for (const y of scanPositions(box.minY, box.maxY, spacingDrawing)) {
        const xs = horizontalIntersections(points, y);
        for (let i = 0; i < xs.length - 1; i += 2) {
            const lengthDrawing = xs[i + 1] - xs[i];
            const length = lengthDrawing * unitScaleToMm;
            if (length <= EPS) continue;

            bars.push({
                id: `H-${bars.length + 1}`,
                direction: "Horizontal",
                length: round(length, 2),
                start: formatPoint({ x: xs[i], y, z }),
                end: formatPoint({ x: xs[i + 1], y, z })
            });
        }
    }

    return bars;
}

function buildVerticalBars(points, spacingDrawing, unitScaleToMm) {
    const box = bounds(points);
    const z = averageZ(points);
    const bars = [];

    for (const x of scanPositions(box.minX, box.maxX, spacingDrawing)) {
        const ys = verticalIntersections(points, x);
        for (let i = 0; i < ys.length - 1; i += 2) {
            const lengthDrawing = ys[i + 1] - ys[i];
            const length = lengthDrawing * unitScaleToMm;
            if (length <= EPS) continue;

            bars.push({
                id: `V-${bars.length + 1}`,
                direction: "Vertical",
                length: round(length, 2),
                start: formatPoint({ x, y: ys[i], z }),
                end: formatPoint({ x, y: ys[i + 1], z })
            });
        }
    }

    return bars;
}

export function approximateCircle(center, edgePoint, options = {}) {
    const c = clonePoint(center);
    const e = clonePoint(edgePoint);
    const radius = pointDistance(c, e);
    if (radius <= EPS) {
        throw new Error("Circle radius is too small.");
    }

    const unitScaleToMm = asNumber(options.unitScaleToMm ?? 1, "Unit scale");
    const chordLengthMm = asNumber(options.chordLengthMm ?? 10, "Curve chord length");
    if (unitScaleToMm <= 0 || chordLengthMm <= 0) {
        throw new Error("Unit scale and curve chord length must be greater than zero.");
    }

    const circumferenceMm = 2 * Math.PI * radius * unitScaleToMm;
    const segmentCount = Math.max(32, Math.min(720, Math.ceil(circumferenceMm / chordLengthMm)));
    const startAngle = Math.atan2(e.y - c.y, e.x - c.x);
    const points = [];

    for (let i = 0; i < segmentCount; i++) {
        const angle = startAngle + (i / segmentCount) * Math.PI * 2;
        points.push({
            x: c.x + Math.cos(angle) * radius,
            y: c.y + Math.sin(angle) * radius,
            z: c.z
        });
    }

    return points;
}

export function generateBarLayout(boundaryPoints, options = {}) {
    const direction = options.direction || "Both";
    const spacingMm = asNumber(options.spacingMm, "Spacing");
    const unitScaleToMm = asNumber(options.unitScaleToMm ?? 1, "Unit scale");

    if (!["Horizontal", "Vertical", "Both"].includes(direction)) {
        throw new Error("Direction must be Horizontal, Vertical, or Both.");
    }
    if (spacingMm <= 0) {
        throw new Error("Spacing must be greater than zero.");
    }
    if (unitScaleToMm <= 0) {
        throw new Error("Unit scale must be greater than zero.");
    }

    const points = validateBoundary(boundaryPoints);
    const spacingDrawing = spacingMm / unitScaleToMm;

    const horizontal = direction === "Horizontal" || direction === "Both"
        ? buildHorizontalBars(points, spacingDrawing, unitScaleToMm)
        : [];
    const vertical = direction === "Vertical" || direction === "Both"
        ? buildVerticalBars(points, spacingDrawing, unitScaleToMm)
        : [];

    return {
        settings: {
            direction,
            spacingMm: round(spacingMm, 4),
            unitScaleToMm: round(unitScaleToMm, 6)
        },
        boundary: points.map(formatPoint),
        summary: {
            Horizontal: aggregate(horizontal),
            Vertical: aggregate(vertical)
        },
        totals: {
            Horizontal: totals(horizontal),
            Vertical: totals(vertical)
        },
        details: [...horizontal, ...vertical]
    };
}
