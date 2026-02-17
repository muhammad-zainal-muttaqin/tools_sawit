/**
 * Non-Maximum Suppression — merge overlapping boxes, keeping higher confidence.
 * @param {Array} detections - [{box:{x1,y1,x2,y2}, confidence, ...}, ...]
 * @param {number} iouThreshold - IoU above which the weaker box is suppressed
 * @returns {Array} filtered detections
 */
function nms(detections, iouThreshold) {
  if (detections.length <= 1) return detections;

  // Sort by confidence descending
  const sorted = detections.slice().sort((a, b) => {
    const ca = a.confidence !== undefined ? a.confidence : a.conf;
    const cb = b.confidence !== undefined ? b.confidence : b.conf;
    return cb - ca;
  });

  const keep = [];
  const suppressed = new Set();

  for (let i = 0; i < sorted.length; i++) {
    if (suppressed.has(i)) continue;
    keep.push(sorted[i]);

    for (let j = i + 1; j < sorted.length; j++) {
      if (suppressed.has(j)) continue;
      if (computeIoU(sorted[i], sorted[j]) > iouThreshold) {
        suppressed.add(j);
      }
    }
  }

  return keep;
}

/**
 * Compute Intersection-over-Union between two detections.
 */
function computeIoU(detA, detB) {
  const boxA = detA.box || detA.bbox || {};
  const boxB = detB.box || detB.bbox || {};

  const a = {
    x1: boxA.x1 !== undefined ? boxA.x1 : (boxA[0] || 0),
    y1: boxA.y1 !== undefined ? boxA.y1 : (boxA[1] || 0),
    x2: boxA.x2 !== undefined ? boxA.x2 : (boxA[2] || 0),
    y2: boxA.y2 !== undefined ? boxA.y2 : (boxA[3] || 0),
  };
  const b = {
    x1: boxB.x1 !== undefined ? boxB.x1 : (boxB[0] || 0),
    y1: boxB.y1 !== undefined ? boxB.y1 : (boxB[1] || 0),
    x2: boxB.x2 !== undefined ? boxB.x2 : (boxB[2] || 0),
    y2: boxB.y2 !== undefined ? boxB.y2 : (boxB[3] || 0),
  };

  const interX1 = Math.max(a.x1, b.x1);
  const interY1 = Math.max(a.y1, b.y1);
  const interX2 = Math.min(a.x2, b.x2);
  const interY2 = Math.min(a.y2, b.y2);

  const interArea = Math.max(0, interX2 - interX1) * Math.max(0, interY2 - interY1);
  if (interArea === 0) return 0;

  const areaA = (a.x2 - a.x1) * (a.y2 - a.y1);
  const areaB = (b.x2 - b.x1) * (b.y2 - b.y1);

  return interArea / (areaA + areaB - interArea);
}

/**
 * CentroidTracker — Tracks detections across video frames using centroid matching
 * with global motion compensation for camera pan/tilt.
 *
 * Designed for static objects (palm oil bunches on trees) filmed by a moving camera.
 */
class CentroidTracker {
  /**
   * @param {Object} options
   * @param {number} options.maxDistance - Max pixel distance to match a detection to a track
   * @param {number} options.maxAge - Frames a track survives without a match before removal
   * @param {number} options.minConfidence - Minimum confidence to accept a detection (0-1)
   * @param {number} options.minHits - Minimum frames a track must be seen to count as unique
   * @param {number} options.iouThreshold - IoU threshold for NMS suppression
   */
  constructor(options = {}) {
    this.maxDistance = options.maxDistance || 50;
    this.maxAge = options.maxAge || 5;
    this.minConfidence = options.minConfidence || 0;
    this.minHits = options.minHits || 1;
    this.iouThreshold = options.iouThreshold || 0.4;

    this.tracks = new Map(); // id -> { cx, cy, w, h, age, hits, confidence, name }
    this.expiredTracks = []; // tracks that aged out, kept for unique counting
    this.nextId = 0;
  }

  /**
   * Process detections for a single frame.
   * @param {Array} detections - [{box:{x1,y1,x2,y2}, confidence, name}, ...]
   * @returns {Array} detections with `trackId` property added
   */
  update(detections) {
    // Layer 1: NMS — suppress overlapping boxes
    let filtered = nms(detections, this.iouThreshold);

    // Layer 2: Confidence gate — remove low-confidence noise
    if (this.minConfidence > 0) {
      filtered = filtered.filter(det => {
        const conf = det.confidence !== undefined ? det.confidence : det.conf;
        return conf >= this.minConfidence;
      });
    }

    // Compute centroids for incoming detections
    const incoming = filtered.map(det => {
      const box = det.box || det.bbox || {};
      const x1 = box.x1 !== undefined ? box.x1 : (box[0] || 0);
      const y1 = box.y1 !== undefined ? box.y1 : (box[1] || 0);
      const x2 = box.x2 !== undefined ? box.x2 : (box[2] || 0);
      const y2 = box.y2 !== undefined ? box.y2 : (box[3] || 0);
      return {
        cx: (x1 + x2) / 2,
        cy: (y1 + y2) / 2,
        w: x2 - x1,
        h: y2 - y1,
        det,
      };
    });

    // First frame — all detections become new tracks
    if (this.tracks.size === 0 && incoming.length > 0) {
      return incoming.map(inc => {
        const id = this._createTrack(inc);
        inc.det.trackId = id;
        return inc.det;
      });
    }

    // Build arrays from existing tracks
    const trackIds = [];
    const trackCentroids = [];
    for (const [id, t] of this.tracks) {
      trackIds.push(id);
      trackCentroids.push({ cx: t.cx, cy: t.cy });
    }

    // Greedy matching (before motion compensation, to estimate motion)
    const { matches, unmatchedTracks, unmatchedDets } =
      this._greedyMatch(trackIds, trackCentroids, incoming);

    // Estimate global motion from matched pairs
    const motion = this._estimateMotion(trackIds, trackCentroids, incoming, matches);

    // If significant motion detected, re-match with compensated positions
    if (Math.abs(motion.dx) > 1 || Math.abs(motion.dy) > 1) {
      const compensated = trackCentroids.map(tc => ({
        cx: tc.cx + motion.dx,
        cy: tc.cy + motion.dy,
      }));
      const result = this._greedyMatch(trackIds, compensated, incoming);
      return this._applyMatches(result, incoming, motion);
    }

    return this._applyMatches({ matches, unmatchedTracks, unmatchedDets }, incoming, motion);
  }

  /**
   * Apply match results: update matched tracks, create new ones, age unmatched.
   */
  _applyMatches({ matches, unmatchedTracks, unmatchedDets }, incoming, motion) {
    // Update matched tracks
    for (const { trackId, detIdx } of matches) {
      const inc = incoming[detIdx];
      const track = this.tracks.get(trackId);
      track.cx = inc.cx;
      track.cy = inc.cy;
      track.w = inc.w;
      track.h = inc.h;
      track.age = 0;
      track.hits++;
      track.confidence = inc.det.confidence !== undefined ? inc.det.confidence : inc.det.conf;
      inc.det.trackId = trackId;
    }

    // Age unmatched tracks, expire if too old
    for (const trackId of unmatchedTracks) {
      const track = this.tracks.get(trackId);
      // Compensate position for camera motion so track "follows" the scene
      track.cx += motion.dx;
      track.cy += motion.dy;
      track.age++;
      if (track.age > this.maxAge) {
        this.expiredTracks.push(track);
        this.tracks.delete(trackId);
      }
    }

    // Create new tracks for unmatched detections
    for (const detIdx of unmatchedDets) {
      const inc = incoming[detIdx];
      const id = this._createTrack(inc);
      inc.det.trackId = id;
    }

    return incoming.map(inc => inc.det);
  }

  /**
   * Greedy matching: for each detection, find the closest track within maxDistance.
   */
  _greedyMatch(trackIds, trackCentroids, incoming) {
    const usedTracks = new Set();
    const usedDets = new Set();
    const matches = [];

    // Build distance matrix
    const pairs = [];
    for (let d = 0; d < incoming.length; d++) {
      for (let t = 0; t < trackIds.length; t++) {
        const dx = incoming[d].cx - trackCentroids[t].cx;
        const dy = incoming[d].cy - trackCentroids[t].cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= this.maxDistance) {
          pairs.push({ trackIdx: t, detIdx: d, dist });
        }
      }
    }

    // Sort by distance, greedily assign
    pairs.sort((a, b) => a.dist - b.dist);

    for (const p of pairs) {
      if (usedTracks.has(p.trackIdx) || usedDets.has(p.detIdx)) continue;
      usedTracks.add(p.trackIdx);
      usedDets.add(p.detIdx);
      matches.push({ trackId: trackIds[p.trackIdx], detIdx: p.detIdx });
    }

    const unmatchedTracks = trackIds.filter((_, i) => !usedTracks.has(i));
    const unmatchedDets = [];
    for (let d = 0; d < incoming.length; d++) {
      if (!usedDets.has(d)) unmatchedDets.push(d);
    }

    return { matches, unmatchedTracks, unmatchedDets };
  }

  /**
   * Estimate global camera motion as median displacement of matched pairs.
   */
  _estimateMotion(trackIds, trackCentroids, incoming, matches) {
    if (matches.length === 0) return { dx: 0, dy: 0 };

    const dxs = [];
    const dys = [];

    for (const { trackId, detIdx } of matches) {
      const tIdx = trackIds.indexOf(trackId);
      if (tIdx === -1) continue;
      dxs.push(incoming[detIdx].cx - trackCentroids[tIdx].cx);
      dys.push(incoming[detIdx].cy - trackCentroids[tIdx].cy);
    }

    return {
      dx: this._median(dxs),
      dy: this._median(dys),
    };
  }

  _median(arr) {
    if (arr.length === 0) return 0;
    const sorted = arr.slice().sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0
      ? sorted[mid]
      : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  _createTrack(inc) {
    const id = this.nextId++;
    this.tracks.set(id, {
      cx: inc.cx,
      cy: inc.cy,
      w: inc.w,
      h: inc.h,
      age: 0,
      hits: 1,
      confidence: inc.det.confidence !== undefined ? inc.det.confidence : inc.det.conf,
      name: inc.det.name || 'object',
    });
    return id;
  }

  /** Total unique objects seen across all frames (only tracks with hits >= minHits) */
  getUniqueCount() {
    let count = 0;
    // Count active tracks that meet minHits
    for (const [, track] of this.tracks) {
      if (track.hits >= this.minHits) count++;
    }
    // Count expired tracks that met minHits
    for (const track of this.expiredTracks) {
      if (track.hits >= this.minHits) count++;
    }
    return count;
  }
}
