;;; ------------------------------------------------------------------
;;; BARFILL.lsp
;;; Bar layout generator for AutoCAD Web / AutoCAD desktop.
;;;
;;; AutoLISP port of the APS viewer bar-layout logic (bar-layout.js):
;;; draws horizontal/vertical bars (LINE entities) inside a selected
;;; closed boundary at a fixed spacing, then prints a bar schedule
;;; (length x quantity) in millimetres.
;;;
;;; Supported boundaries: closed LWPOLYLINE / POLYLINE / CIRCLE /
;;; ELLIPSE / SPLINE. Curved boundaries are approximated by chords.
;;;
;;; Commands:  BARFILL  (alias: BF)
;;; Output layers: BARS_H (red), BARS_V (green)
;;; ------------------------------------------------------------------

(vl-load-com)

;; ---- helpers ------------------------------------------------------

(defun bf-make-layer (name color)
  (if (not (tblsearch "LAYER" name))
    (entmake (list '(0 . "LAYER")
                   '(100 . "AcDbSymbolTableRecord")
                   '(100 . "AcDbLayerTableRecord")
                   (cons 2 name)
                   '(70 . 0)
                   (cons 62 color))))
  name)

(defun bf-line (x1 y1 x2 y2 layer)
  (entmake (list '(0 . "LINE")
                 (cons 8 layer)
                 (cons 10 (list x1 y1 0.0))
                 (cons 11 (list x2 y2 0.0)))))

;; Exact vertices for straight LWPOLYLINEs (nil if any arc/bulge segment)
(defun bf-lwpoly-verts (ent / ed pts hasbulge g)
  (setq ed (entget ent))
  (foreach g ed
    (cond
      ((= (car g) 10) (setq pts (cons (list (cadr g) (caddr g)) pts)))
      ((and (= (car g) 42) (/= (cdr g) 0.0)) (setq hasbulge T))))
  (if hasbulge nil (reverse pts)))

;; Sample any closed curve into a chord polygon (circles, arcs, splines...)
(defun bf-sample-curve (ent chord / per n i p pts)
  (setq per (vlax-curve-getDistAtParam ent (vlax-curve-getEndParam ent)))
  (if (and per (> per 0.0))
    (progn
      (if (<= chord 0.0) (setq chord (/ per 256.0)))
      (setq n (fix (/ per chord)))
      (if (< n 64) (setq n 64))
      (if (> n 2000) (setq n 2000))
      (setq i 0)
      (while (< i n)
        (setq p (vlax-curve-getPointAtDist ent (* per (/ (float i) n))))
        (if p (setq pts (cons (list (car p) (cadr p)) pts)))
        (setq i (1+ i)))
      (reverse pts))))

(defun bf-bounds (pts / xs ys)
  (setq xs (mapcar 'car pts)
        ys (mapcar 'cadr pts))
  (list (apply 'min xs) (apply 'min ys) (apply 'max xs) (apply 'max ys)))

;; X of edge a->b crossing horizontal line y (half-open rule, one hit per vertex)
(defun bf-edge-x (a b y / ay by)
  (setq ay (cadr a) by (cadr b))
  (if (or (and (<= ay y) (> by y)) (and (<= by y) (> ay y)))
    (+ (car a) (* (/ (- y ay) (- by ay)) (- (car b) (car a))))))

;; Y of edge a->b crossing vertical line x
(defun bf-edge-y (a b x / ax bx)
  (setq ax (car a) bx (car b))
  (if (or (and (<= ax x) (> bx x)) (and (<= bx x) (> ax x)))
    (+ (cadr a) (* (/ (- x ax) (- bx ax)) (- (cadr b) (cadr a))))))

;; Sorted intersection Xs of the polygon with horizontal line y
(defun bf-scan-x (pts y / xs prev x)
  (setq prev (last pts))
  (foreach cur pts
    (setq x (bf-edge-x prev cur y))
    (if x (setq xs (cons x xs)))
    (setq prev cur))
  (vl-sort xs '<))

;; Sorted intersection Ys of the polygon with vertical line x
(defun bf-scan-y (pts x / ys prev y)
  (setq prev (last pts))
  (foreach cur pts
    (setq y (bf-edge-y prev cur x))
    (if y (setq ys (cons y ys)))
    (setq prev cur))
  (vl-sort ys '<))

;; Group lengths (mm) into ((lengthstring . qty) ...) sorted ascending
(defun bf-schedule (lens / sched key row)
  (foreach l lens
    (setq key (rtos l 2 1)
          row (assoc key sched))
    (if row
      (setq sched (subst (cons key (1+ (cdr row))) row sched))
      (setq sched (cons (cons key 1) sched))))
  (vl-sort sched '(lambda (a b) (< (atof (car a)) (atof (car b))))))

(defun bf-print-schedule (title sched / row)
  (if sched
    (progn
      (princ (strcat "\n" title))
      (princ "\n  LENGTH (mm)      NO'S")
      (foreach row sched
        (princ (strcat "\n  " (car row)
                       "\t\t" (itoa (cdr row)))))))
  (princ))

;; ---- main command -------------------------------------------------

(defun c:BARFILL ( / es ent etype pts scale spacing dir sdu bnds
                    xmin ymin xmax ymax nscan y x xs ys x1 x2 y1 y2
                    len hlens vlens total)

  ;; 1. boundary selection
  (setq es (entsel "\nSelect closed boundary (polyline / circle / ellipse / spline): "))
  (cond
    ((not es)
     (princ "\nNothing selected."))

    (T
     (setq ent   (car es)
           etype (cdr (assoc 0 (entget ent))))
     (cond
       ((not (wcmatch etype "LWPOLYLINE,POLYLINE,CIRCLE,ELLIPSE,SPLINE"))
        (princ (strcat "\nUnsupported entity: " etype)))

       ((not (vlax-curve-isClosed ent))
        (princ "\nBoundary must be CLOSED."))

       (T
        ;; 2. settings (defaults match the web app: 150 mm, scale 1000)
        (setq scale (getreal "\nUnit scale, mm per drawing unit <1000>: "))
        (if (or (not scale) (<= scale 0.0)) (setq scale 1000.0))
        (setq spacing (getreal "\nBar spacing in mm <150>: "))
        (if (or (not spacing) (<= spacing 0.0)) (setq spacing 150.0))
        (initget "Horizontal Vertical Both")
        (setq dir (getkword "\nDirection [Horizontal/Vertical/Both] <Both>: "))
        (if (not dir) (setq dir "Both"))

        (setq sdu (/ spacing scale))          ; spacing in drawing units

        ;; 3. boundary points: exact verts if straight lwpoly, else chords
        (setq pts (if (= etype "LWPOLYLINE") (bf-lwpoly-verts ent)))
        (if (not pts) (setq pts (bf-sample-curve ent (/ sdu 5.0))))

        (cond
          ((or (not pts) (< (length pts) 3))
           (princ "\nCould not read boundary geometry."))

          (T
           (setq bnds (bf-bounds pts)
                 xmin (car bnds) ymin (cadr bnds)
                 xmax (caddr bnds) ymax (cadddr bnds)
                 nscan (fix (/ (max (- xmax xmin) (- ymax ymin)) sdu)))

           (cond
             ((< nscan 1)
              (princ (strcat "\nNo bars: boundary is "
                             (rtos (- xmax xmin) 2 2) " x " (rtos (- ymax ymin) 2 2)
                             " drawing units but spacing = " (rtos sdu 2 2)
                             " units. Check the unit scale (1000 if drawn in metres).")))

             ((> nscan 5000)
              (princ "\nSpacing creates too many bars - raise spacing or lower unit scale."))

             (T
              ;; 4. horizontal bars
              (if (or (= dir "Horizontal") (= dir "Both"))
                (progn
                  (bf-make-layer "BARS_H" 1)
                  (setq y (+ ymin sdu))
                  (while (< y (- ymax 1e-9))
                    (setq xs (bf-scan-x pts y))
                    (while (>= (length xs) 2)
                      (setq x1 (car xs) x2 (cadr xs) xs (cddr xs)
                            len (* (- x2 x1) scale))
                      (if (> len 0.01)
                        (progn
                          (bf-line x1 y x2 y "BARS_H")
                          (setq hlens (cons len hlens)))))
                    (setq y (+ y sdu)))))

              ;; 5. vertical bars
              (if (or (= dir "Vertical") (= dir "Both"))
                (progn
                  (bf-make-layer "BARS_V" 3)
                  (setq x (+ xmin sdu))
                  (while (< x (- xmax 1e-9))
                    (setq ys (bf-scan-y pts x))
                    (while (>= (length ys) 2)
                      (setq y1 (car ys) y2 (cadr ys) ys (cddr ys)
                            len (* (- y2 y1) scale))
                      (if (> len 0.01)
                        (progn
                          (bf-line x y1 x y2 "BARS_V")
                          (setq vlens (cons len vlens)))))
                    (setq x (+ x sdu)))))

              ;; 6. schedule report
              (bf-print-schedule "HORIZONTAL BARS" (bf-schedule hlens))
              (bf-print-schedule "VERTICAL BARS"   (bf-schedule vlens))
              (setq total (apply '+ (append hlens vlens '(0.0))))
              (princ (strcat "\nTotal bars: "
                             (itoa (+ (length hlens) (length vlens)))
                             " | Total length: " (rtos total 2 0) " mm"))))))))))
  (princ))

(defun c:BF () (c:BARFILL))

(princ "\nBARFILL loaded. Type BARFILL (or BF) to generate bars inside a closed boundary.")
(princ)
