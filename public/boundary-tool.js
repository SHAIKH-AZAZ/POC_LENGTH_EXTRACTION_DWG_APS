import { approximateCircle } from "./bar-layout.js";

const TOOL_NAME = "bar-boundary-draw-tool";
const FIRST_POINT_CLOSE_RADIUS_PX = 16;

function clonePoint(point) {
    return {
        x: Number(point.x),
        y: Number(point.y),
        z: Number.isFinite(Number(point.z)) ? Number(point.z) : 0
    };
}

function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

function getThree() {
    return globalThis.THREE || globalThis.Autodesk?.Viewing?.Private?.THREE;
}

export class BoundaryDrawTool {
    constructor(viewer, callbacks = {}) {
        this.viewer = viewer;
        this.callbacks = callbacks;
        this.mode = "polygon";
        this.points = [];
        this.closed = false;
        this.circleCenter = null;
        this.circleOptions = {
            unitScaleToMm: 1,
            chordLengthMm: 10
        };
        this.snappingRequested = false;
    }

    getName() {
        return TOOL_NAME;
    }

    getNames() {
        return [TOOL_NAME];
    }

    activate() {
        this.loadSnapping();
        if (this.snapper) {
            this.viewer.toolController.activateTool(this.snapper.getName());
        }
        this.setCursor(true);
        this.emitStatus(this.getStartMessage());
        return true;
    }

    deactivate() {
        if (this.snapper) {
            this.viewer.toolController.deactivateTool(this.snapper.getName());
        }
        this.setCursor(false);
        return true;
    }

    setCursor(isDrawing) {
        const canvas = this.viewer.canvas || this.viewer.impl?.canvas;
        if (canvas) canvas.style.cursor = isDrawing ? "crosshair" : "";
    }

    loadSnapping() {
        if (this.snapper) return;
        this.viewer.loadExtension("Autodesk.Snapping").then((snapExt) => {
            if (snapExt && snapExt.snapper) {
                this.snapper = snapExt.snapper;
            } else if (globalThis.Autodesk?.Viewing?.Extensions?.Snapping?.Snapper) {
                this.snapper = new globalThis.Autodesk.Viewing.Extensions.Snapping.Snapper(this.viewer);
                this.viewer.toolController.registerTool(this.snapper);
            }
            
            if (this.snapper) {
                if (this.viewer.toolController.isToolActive(this.getName())) {
                    this.viewer.toolController.activateTool(this.snapper.getName());
                }
                this.emitStatus("Snapping activated. Hover over vertices to snap.");
            }
        }).catch((err) => {
            console.error("Failed to load Snapping extension:", err);
            this.emitStatus("Snapping unavailable. Using picked model points.");
        });
    }

    setMode(mode) {
        if (!["polygon", "rectangle", "circle"].includes(mode)) return;
        if (this.mode !== mode) {
            this.mode = mode;
            this.clear();
        }
    }

    setCircleOptions(options) {
        this.circleOptions = {
            unitScaleToMm: Number(options.unitScaleToMm) || 1,
            chordLengthMm: Number(options.chordLengthMm) || 10
        };
    }

    isClosed() {
        return this.closed;
    }

    getPoints() {
        return this.points.map(clonePoint);
    }

    clear() {
        this.points = [];
        this.closed = false;
        this.circleCenter = null;
        this.emitChange("Boundary cleared.");
    }

    undoLastPoint() {
        if (this.closed) {
            this.closed = false;
        }

        if (this.mode === "circle" && this.circleCenter) {
            this.circleCenter = null;
        }

        if (!this.points.length) {
            this.emitStatus("No points to undo.");
            return false;
        }

        this.points.pop();
        this.emitChange(this.points.length ? "Last point removed." : "Boundary cleared.");
        return true;
    }

    closeBoundary() {
        if (this.mode !== "polygon") {
            this.emitStatus(this.mode === "circle"
                ? "Circle closes after the radius point."
                : "Rectangle closes after the opposite corner.");
            return false;
        }

        if (this.points.length < 3) {
            this.emitStatus("Pick at least 3 points.");
            return false;
        }

        this.closed = true;
        this.viewer.toolController.deactivateTool(TOOL_NAME);
        this.emitComplete("Boundary closed.");
        return true;
    }

    handleSingleClick(event, button) {
        if (button !== 0 || this.closed) return false;

        let point = this.getSnappedOrModelPoint(event);
        if (!point) {
            this.emitStatus("Pick a point on the drawing.");
            return true;
        }

        if (this.points.length && this.mode === "polygon") {
            const last = this.points[this.points.length - 1];
            point = this.applyOrthoSnapping(last, point);
        }

        if (this.mode === "circle") {
            this.handleCircleClick(point);
            return true;
        }

        if (this.mode === "rectangle") {
            this.handleRectangleClick(point);
            return true;
        }

        if (this.points.length >= 3 && this.isFirstPointClick(event, point)) {
            this.closeBoundary();
            return true;
        }

        this.points.push(point);
        this.emitChange(this.getPolygonMessage());
        return true;
    }

    handleDoubleClick() {
        if (this.mode === "polygon" && !this.closed) {
            return this.closeBoundary();
        }
        return false;
    }

    handleKeyDown(event, keyCode) {
        const code = keyCode || event?.keyCode;
        const key = event?.key;

        if (key === "Enter" || code === 13) {
            return this.closeBoundary();
        }

        if (key === "Backspace" || key === "Delete" || code === 8 || code === 46 || ((event?.ctrlKey || event?.metaKey) && (key === "z" || key === "Z" || code === 90))) {
            return this.undoLastPoint();
        }

        if (key === "Escape" || code === 27) {
            this.clear();
            this.viewer.toolController.deactivateTool(TOOL_NAME);
            this.emitStatus("Drawing cancelled.");
            return true;
        }

        return false;
    }

    handleMouseMove(event) {
        if (this.closed || !this.points.length) return false;

        let point = this.getSnappedOrModelPoint(event);
        if (!point) return false;

        if (this.points.length && this.mode === "polygon") {
            const last = this.points[this.points.length - 1];
            point = this.applyOrthoSnapping(last, point);
        }

        this.emitPreview(this.getPreviewPoints(point));
        return false;
    }

    getSnappedOrModelPoint(event) {
        if (this.snapper && this.snapper.isSnapped()) {
            const result = this.snapper.getSnapResult();
            if (result && result.geomVertex) {
                return clonePoint(result.geomVertex);
            }
        }
        return this.getModelPoint(event);
    }

    applyOrthoSnapping(lastPoint, currentPoint, angleThresholdRad = 0.08) {
        const dx = currentPoint.x - lastPoint.x;
        const dy = currentPoint.y - lastPoint.y;
        const angle = Math.atan2(dy, dx);
        const absAngle = Math.abs(angle);
        
        if (absAngle <= angleThresholdRad || Math.abs(absAngle - Math.PI) <= angleThresholdRad) {
            return { x: currentPoint.x, y: lastPoint.y, z: lastPoint.z };
        }
        
        if (Math.abs(absAngle - Math.PI / 2) <= angleThresholdRad) {
            return { x: lastPoint.x, y: currentPoint.y, z: lastPoint.z };
        }

        if (this.points.length >= 2) {
            const first = this.points[0];
            const distToFirstX = Math.abs(currentPoint.x - first.x);
            const distToFirstY = Math.abs(currentPoint.y - first.y);
            
            const box = this.viewer.model?.getBoundingBox?.();
            const tolerance = box ? Math.max((box.max.x - box.min.x) * 0.015, 0.5) : 1.0;
            
            let x = currentPoint.x;
            let y = currentPoint.y;
            
            if (distToFirstX <= tolerance) x = first.x;
            if (distToFirstY <= tolerance) y = first.y;
            
            if (x !== currentPoint.x || y !== currentPoint.y) {
                return { x, y, z: currentPoint.z };
            }
        }
        
        return currentPoint;
    }

    handleRectangleClick(point) {
        if (!this.points.length) {
            this.points = [point];
            this.emitChange("First corner picked. Pick opposite corner.");
            return;
        }

        const first = this.points[0];
        if (distance(first, point) <= 1e-7) {
            this.emitStatus("Pick an opposite corner away from the first corner.");
            return;
        }

        const z = (first.z + point.z) / 2;
        this.points = [
            { x: first.x, y: first.y, z },
            { x: point.x, y: first.y, z },
            { x: point.x, y: point.y, z },
            { x: first.x, y: point.y, z }
        ];
        this.closed = true;
        this.viewer.toolController.deactivateTool(TOOL_NAME);
        this.emitComplete("Rectangle boundary closed.");
    }

    handleCircleClick(point) {
        if (!this.circleCenter) {
            this.circleCenter = point;
            this.points = [point];
            this.emitChange("Circle center picked.");
            return;
        }

        if (distance(this.circleCenter, point) <= 1e-7) {
            this.emitStatus("Pick a radius point away from center.");
            return;
        }

        try {
            this.points = approximateCircle(this.circleCenter, point, this.circleOptions);
            this.closed = true;
            this.circleCenter = null;
            this.viewer.toolController.deactivateTool(TOOL_NAME);
            this.emitComplete("Circle boundary closed.");
        } catch (err) {
            this.emitStatus(err.message);
        }
    }

    getCanvasPoint(event) {
        if (Number.isFinite(event.canvasX) && Number.isFinite(event.canvasY)) {
            return { x: event.canvasX, y: event.canvasY };
        }

        const canvas = this.viewer.canvas || this.viewer.impl?.canvas;
        const rect = canvas?.getBoundingClientRect?.();
        if (!rect || !Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) {
            return null;
        }

        return {
            x: event.clientX - rect.left,
            y: event.clientY - rect.top
        };
    }

    getModelPoint(event) {
        const canvasPoint = this.getCanvasPoint(event);
        if (!canvasPoint) return null;

        const clientHit = this.viewer.clientToWorld?.(canvasPoint.x, canvasPoint.y, true);
        const point = clientHit?.point || clientHit?.intersectPoint;
        if (point) return clonePoint(point);

        const hit = this.viewer.impl?.hitTest?.(canvasPoint.x, canvasPoint.y, true);
        const hitPoint = hit?.intersectPoint || hit?.point;
        if (hitPoint) return clonePoint(hitPoint);

        return this.getPlanePoint(canvasPoint);
    }

    getPlanePoint(canvasPoint) {
        const THREE = getThree();
        const canvas = this.viewer.canvas || this.viewer.impl?.canvas;
        const camera = this.viewer.navigation?.getCamera?.() || this.viewer.impl?.camera;
        if (!THREE || !canvas || !camera || !THREE.Raycaster || !THREE.Vector2 || !THREE.Plane) {
            return null;
        }

        const width = canvas.clientWidth || canvas.width;
        const height = canvas.clientHeight || canvas.height;
        if (!width || !height) return null;

        const box = this.viewer.model?.getBoundingBox?.();
        const planeZ = box ? (box.min.z + box.max.z) / 2 : 0;
        const raycaster = new THREE.Raycaster();
        const pointer = new THREE.Vector2(
            (canvasPoint.x / width) * 2 - 1,
            -(canvasPoint.y / height) * 2 + 1
        );
        const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -planeZ);
        const result = new THREE.Vector3();

        try {
            raycaster.setFromCamera(pointer, camera);
            if (!raycaster.ray.intersectPlane(plane, result)) return null;
            return clonePoint(result);
        } catch (_err) {
            return null;
        }
    }

    isFirstPointClick(event, point) {
        const first = this.points[0];
        const canvasPoint = this.getCanvasPoint(event);
        const firstCanvasPoint = this.getCanvasPointForModelPoint(first);

        if (canvasPoint && firstCanvasPoint) {
            return Math.hypot(canvasPoint.x - firstCanvasPoint.x, canvasPoint.y - firstCanvasPoint.y) <= FIRST_POINT_CLOSE_RADIUS_PX;
        }

        const box = this.viewer.model?.getBoundingBox?.();
        if (!box) return distance(point, first) <= 1e-7;

        const THREE = getThree();
        const size = THREE?.Vector3 && box.getSize ? box.getSize(new THREE.Vector3()) : null;
        const diagonal = size ? Math.hypot(size.x, size.y) : 0;
        return distance(point, first) <= Math.max(diagonal * 0.006, 1e-7);
    }

    getCanvasPointForModelPoint(point) {
        const THREE = getThree();
        if (!THREE || !this.viewer.worldToClient) return null;

        try {
            const screen = this.viewer.worldToClient(new THREE.Vector3(point.x, point.y, point.z || 0));
            if (!Number.isFinite(screen?.x) || !Number.isFinite(screen?.y)) return null;
            return { x: screen.x, y: screen.y };
        } catch (_err) {
            return null;
        }
    }

    getPreviewPoints(point) {
        if (this.mode === "rectangle" && this.points.length === 1) {
            const first = this.points[0];
            const z = (first.z + point.z) / 2;
            return [
                { x: first.x, y: first.y, z },
                { x: point.x, y: first.y, z },
                { x: point.x, y: point.y, z },
                { x: first.x, y: point.y, z },
                { x: first.x, y: first.y, z }
            ];
        }

        if (this.points.length) {
            return [this.points[this.points.length - 1], point];
        }

        return [];
    }

    getStartMessage() {
        if (this.mode === "circle") return "Pick circle center, then radius point.";
        if (this.mode === "rectangle") return "Pick first corner, then opposite corner.";
        return "Pick boundary points. Click the first point or double-click to close.";
    }

    getPolygonMessage() {
        if (this.points.length < 3) {
            return `${this.points.length} point${this.points.length === 1 ? "" : "s"} picked. Pick ${3 - this.points.length} more to close.`;
        }
        return `${this.points.length} points picked. Click first point, double-click, or press Enter to close.`;
    }

    emitChange(message) {
        this.callbacks.onChange?.({
            points: this.getPoints(),
            closed: this.closed,
            mode: this.mode,
            message
        });
    }

    emitPreview(previewPoints) {
        this.callbacks.onPreview?.({
            points: this.getPoints(),
            closed: this.closed,
            mode: this.mode,
            previewPoints
        });
    }

    emitComplete(message) {
        this.callbacks.onComplete?.({
            points: this.getPoints(),
            closed: this.closed,
            mode: this.mode,
            message
        });
    }

    emitStatus(message) {
        this.callbacks.onStatus?.(message);
    }
}
