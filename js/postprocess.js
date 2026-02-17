const DetectionPostProcessor = (() => {
  function toNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function readConfidence(det) {
    const conf = det && (det.confidence !== undefined ? det.confidence : det.conf);
    return Math.max(0, Math.min(1, toNumber(conf, 0)));
  }

  function readClassName(det) {
    const raw = det && (det.name !== undefined ? det.name : det.class);
    return String(raw === undefined || raw === null ? 'object' : raw).trim();
  }

  function normalizeClassKey(name) {
    return String(name || 'OBJECT').trim().replace(/\s+/g, '').toUpperCase();
  }

  function readBox(det) {
    const src = det && (det.box || det.bbox || det.xyxy || det);
    if (!src) return null;

    let x1;
    let y1;
    let x2;
    let y2;

    if (Array.isArray(src)) {
      x1 = toNumber(src[0], NaN);
      y1 = toNumber(src[1], NaN);
      x2 = toNumber(src[2], NaN);
      y2 = toNumber(src[3], NaN);
    } else {
      x1 = toNumber(src.x1, NaN);
      y1 = toNumber(src.y1, NaN);
      x2 = toNumber(src.x2, NaN);
      y2 = toNumber(src.y2, NaN);
    }

    if (![x1, y1, x2, y2].every(Number.isFinite)) return null;
    if (x2 <= x1 || y2 <= y1) return null;

    return { x1, y1, x2, y2 };
  }

  function computeIntersection(a, b) {
    const x1 = Math.max(a.x1, b.x1);
    const y1 = Math.max(a.y1, b.y1);
    const x2 = Math.min(a.x2, b.x2);
    const y2 = Math.min(a.y2, b.y2);
    const w = Math.max(0, x2 - x1);
    const h = Math.max(0, y2 - y1);
    return w * h;
  }

  function area(box) {
    return Math.max(1e-6, (box.x2 - box.x1) * (box.y2 - box.y1));
  }

  function computeIoU(a, b) {
    const inter = computeIntersection(a, b);
    if (inter <= 0) return 0;
    const union = area(a) + area(b) - inter;
    return inter / Math.max(union, 1e-6);
  }

  function computeContainment(a, b) {
    const inter = computeIntersection(a, b);
    if (inter <= 0) return 0;
    return inter / Math.max(Math.min(area(a), area(b)), 1e-6);
  }

  function normalizeDetection(det) {
    const box = readBox(det);
    if (!box) return null;
    const conf = readConfidence(det);
    const className = readClassName(det);
    const classKey = normalizeClassKey(className);
    return {
      det,
      box,
      conf,
      className,
      classKey,
    };
  }

  function shouldSuppress(kept, cand, options) {
    const iou = computeIoU(kept.box, cand.box);
    const containment = computeContainment(kept.box, cand.box);
    const sameClass = kept.classKey === cand.classKey;
    const iouThreshold = sameClass
      ? options.iouThreshold
      : Math.min(0.85, options.iouThreshold + 0.22);

    if (iou >= iouThreshold) return true;
    if (containment >= options.containmentThreshold) return true;
    return false;
  }

  function deduplicateDetections(detections, opts = {}) {
    const options = {
      iouThreshold: Math.max(0.1, Math.min(0.9, toNumber(opts.iouThreshold, 0.45))),
      containmentThreshold: Math.max(0.5, Math.min(0.98, toNumber(opts.containmentThreshold, 0.82))),
    };

    if (!Array.isArray(detections) || detections.length <= 1) {
      return Array.isArray(detections) ? detections.slice() : [];
    }

    const canonical = detections.map(normalizeDetection).filter(Boolean);
    canonical.sort((a, b) => b.conf - a.conf);

    const kept = [];
    canonical.forEach((cand) => {
      const suppressed = kept.some((existing) => shouldSuppress(existing, cand, options));
      if (!suppressed) kept.push(cand);
    });

    return kept.map((item) => {
      const det = item.det || {};
      const next = { ...det };
      next.box = { ...item.box };
      next.bbox = { ...item.box };
      if (next.name === undefined || next.name === null || String(next.name).trim() === '') {
        next.name = item.className;
      }
      if (next.confidence === undefined && next.conf !== undefined) {
        next.confidence = next.conf;
      } else if (next.confidence === undefined) {
        next.confidence = item.conf;
      }
      return next;
    });
  }

  return {
    deduplicateDetections,
  };
})();

if (typeof window !== 'undefined') {
  window.DetectionPostProcessor = DetectionPostProcessor;
}
