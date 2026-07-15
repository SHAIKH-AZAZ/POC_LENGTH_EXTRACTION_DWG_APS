const OVERLAY_SCENE = "bar-layout-overlay";

function getThree() {
    return globalThis.THREE || globalThis.Autodesk?.Viewing?.Private?.THREE;
}

function toVector(point, zOffset = 0.02) {
    const THREE = getThree();
    return new THREE.Vector3(point.x, point.y, (point.z || 0) + zOffset);
}

function disposeObject(object) {
    if (object.geometry?.dispose) object.geometry.dispose();
    if (object.material?.dispose) object.material.dispose();
}

export class ViewerBarOverlay {
    constructor(viewer) {
        this.viewer = viewer;
        this.boundaryObjects = [];
        this.barObjects = [];
        this.ensureScene();
    }

    ensureScene() {
        if (!this.viewer?.impl?.createOverlayScene) return;
        try {
            this.viewer.impl.createOverlayScene(OVERLAY_SCENE);
        } catch (_err) {
            // The scene may already exist for this viewer.
        }
    }

    invalidate() {
        this.viewer.impl.invalidate(true, true, true);
    }

    makeMaterial(color, opacity = 1) {
        const THREE = getThree();
        return new THREE.LineBasicMaterial({
            color,
            opacity,
            transparent: opacity < 1,
            depthTest: false,
            depthWrite: false,
            linewidth: 3 // honoured where the platform supports it
        });
    }

    // Pixel-sized world offset at current zoom, used to fake thicker lines.
    pixelWorldSize() {
        const cam = this.viewer.navigation?.getCamera?.();
        const canvas = this.viewer.canvas || this.viewer.impl?.canvas;
        if (!cam?.isPerspective && cam && canvas?.clientHeight) {
            const worldHeight = (cam.top - cam.bottom) / (cam.zoom || 1);
            return worldHeight / canvas.clientHeight;
        }
        return 0;
    }

    makeLine(points, color, opacity = 1, close = false) {
        const THREE = getThree();
        const linePoints = close && points.length > 1 ? [...points, points[0]] : points;
        const geometry = new THREE.BufferGeometry().setFromPoints(linePoints.map(toVector));
        const line = new THREE.Line(geometry, this.makeMaterial(color, opacity));
        line.frustumCulled = false;
        return line;
    }

    markerSize() {
        const THREE = getThree();
        const box = this.viewer.model?.getBoundingBox?.();
        if (!box) return 10;

        const size = box.getSize(new THREE.Vector3());
        const diagonal = Math.hypot(size.x, size.y);
        return Math.max(diagonal * 0.003, 2);
    }

    makeMarker(point, color) {
        const THREE = getThree();
        const size = this.markerSize();
        const z = point.z || 0;
        const points = [
            { x: point.x - size, y: point.y, z },
            { x: point.x + size, y: point.y, z },
            { x: point.x, y: point.y - size, z },
            { x: point.x, y: point.y + size, z }
        ];
        const geometry = new THREE.BufferGeometry().setFromPoints(points.map(toVector));
        const marker = new THREE.LineSegments(geometry, this.makeMaterial(color));
        marker.frustumCulled = false;
        return marker;
    }

    addObject(object, bucket) {
        this.viewer.impl.addOverlay(OVERLAY_SCENE, object);
        bucket.push(object);
    }

    clearBucket(bucket) {
        while (bucket.length) {
            const object = bucket.pop();
            this.viewer.impl.removeOverlay(OVERLAY_SCENE, object);
            disposeObject(object);
        }
        this.invalidate();
    }

    clearBoundary() {
        this.clearBucket(this.boundaryObjects);
    }

    clearBars() {
        this.clearBucket(this.barObjects);
    }

    clearAll() {
        this.clearBoundary();
        this.clearBars();
    }

    getContrastColors() {
        // Neon-like colors for dark backgrounds (default)
        let colors = {
            boundaryColor: 0x38bdf8,       // Sky Blue
            previewColor: 0x93c5fd,        // Light Blue
            markerColor: 0xfacc15,         // Gold Yellow
            barHorizontalColor: 0x22c55e,  // Vibrant Green
            barVerticalColor: 0xf97316      // Vibrant Orange
        };

        const bg = this.viewer?.impl?.getBackgroundColor?.();
        if (bg) {
            // Calculate brightness of the background color
            const brightness = (bg.x * 299 + bg.y * 587 + bg.z * 114) / 1000;
            if (brightness > 0.5) {
                // Light background (e.g. white sheet) -> switch to high-contrast dark colors
                colors = {
                    boundaryColor: 0x0284c7,       // Sky Blue (medium dark)
                    previewColor: 0xd90429,        // Deep Crimson Red
                    markerColor: 0x4f46e5,         // Deep Indigo Purple
                    barHorizontalColor: 0x15803d,  // Dark Forest Green
                    barVerticalColor: 0xc2410c      // Dark Rust Orange
                };
            }
        }
        return colors;
    }

    setBoundary(points, closed = false, previewPoints = []) {
        this.clearBoundary();
        if (!points?.length || !getThree()) return;

        const colors = this.getContrastColors();

        const px = this.pixelWorldSize();
        const offsets = px > 0 ? [0, px, -px] : [0]; // triple pass ~3px thick

        if (points.length > 1) {
            for (const o of offsets) {
                const shifted = points.map(p => ({ x: p.x + o, y: p.y + o, z: p.z }));
                this.addObject(this.makeLine(shifted, colors.boundaryColor, 1, closed), this.boundaryObjects);
            }
        }

        if (!closed && previewPoints.length > 1) {
            const isClosedPreview = previewPoints.length > 2;
            for (const o of offsets) {
                const shifted = previewPoints.map(p => ({ x: p.x + o, y: p.y + o, z: p.z }));
                this.addObject(this.makeLine(shifted, colors.previewColor, 1, isClosedPreview), this.boundaryObjects);
            }
        }

        for (const point of points) {
            this.addObject(this.makeMarker(point, colors.markerColor), this.boundaryObjects);
        }

        this.invalidate();
    }

    setBars(layout) {
        this.clearBars();
        if (!layout?.details?.length || !getThree()) return;

        const colors = this.getContrastColors();

        for (const bar of layout.details) {
            const color = bar.direction === "Horizontal" ? colors.barHorizontalColor : colors.barVerticalColor;
            this.addObject(this.makeLine([bar.start, bar.end], color, 0.95), this.barObjects);
        }

        this.invalidate();
    }
}
