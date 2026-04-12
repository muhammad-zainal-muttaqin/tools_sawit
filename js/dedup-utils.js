'use strict';

// ─── Union-Find (extracted from deduper.js) ──────────────────────────────────

function pairKey(aId, bId) {
  return aId < bId ? `${aId}|${bId}` : `${bId}|${aId}`;
}

function createUnionFind(ids) {
  const parent = {};
  const rank   = {};
  for (const id of ids) { parent[id] = id; rank[id] = 0; }

  function find(x) {
    if (parent[x] !== x) parent[x] = find(parent[x]);
    return parent[x];
  }

  function union(a, b) {
    const ra = find(a), rb = find(b);
    if (ra === rb) return;
    if (rank[ra] < rank[rb]) { parent[ra] = rb; }
    else if (rank[ra] > rank[rb]) { parent[rb] = ra; }
    else { parent[rb] = ra; rank[ra]++; }
  }

  return { find, union, parent };
}

// ─── Geometric Dedup Algorithm ───────────────────────────────────────────────

function _clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

/**
 * Normalize pixel bbox to [0,1] range.
 */
function _norm(bbox, imgW, imgH) {
  return {
    x1: bbox.x1 / imgW,
    y1: bbox.y1 / imgH,
    x2: bbox.x2 / imgW,
    y2: bbox.y2 / imgH,
  };
}

/**
 * Signal 1a: how close bbox's RIGHT edge is to image right boundary.
 * decay = fraction of image width where score reaches 0.
 */
function _rightEdgeSig(nb, decay) {
  return 1 - _clamp((1 - nb.x2) / decay, 0, 1);
}

/**
 * Signal 1b: how close bbox's LEFT edge is to image left boundary.
 */
function _leftEdgeSig(nb, decay) {
  return 1 - _clamp(nb.x1 / decay, 0, 1);
}

/**
 * Signal 2: vertical center proximity (gravity keeps bunches at same trunk height).
 * tol = max allowed normalized vertical center difference before score → 0.
 */
function _vertSig(nbA, nbB, tol) {
  const cyA = (nbA.y1 + nbA.y2) / 2;
  const cyB = (nbB.y1 + nbB.y2) / 2;
  return 1 - _clamp(Math.abs(cyA - cyB) / tol, 0, 1);
}

/**
 * Signal 3: class match.
 * Same class → 1.0, adjacent grade (±1) → 0.6, otherwise → 0.0
 */
function _classSig(a, b) {
  if (a.classId === b.classId) return 1.0;
  if (Math.abs(a.classId - b.classId) === 1) return 0.6;
  return 0.0;
}

/**
 * Signal 4: size+aspect similarity (logic from deduper.js:141-151).
 */
function _sizeSig(nbA, nbB) {
  const eps = 1e-6;
  const areaA = Math.max((nbA.x2 - nbA.x1) * (nbA.y2 - nbA.y1), eps);
  const areaB = Math.max((nbB.x2 - nbB.x1) * (nbB.y2 - nbB.y1), eps);
  const areaSim = 1 - _clamp(Math.abs(areaA - areaB) / Math.max(areaA, areaB), 0, 1);
  const arA = Math.max((nbA.x2 - nbA.x1) / Math.max(nbA.y2 - nbA.y1, eps), eps);
  const arB = Math.max((nbB.x2 - nbB.x1) / Math.max(nbB.y2 - nbB.y1, eps), eps);
  const aspectSim = 1 - _clamp(Math.abs(arA - arB) / Math.max(arA, arB), 0, 1);
  return 0.6 * areaSim + 0.4 * aspectSim;
}

/**
 * Suggest cross-side duplicate pairs using pure geometry.
 *
 * Clockwise rotation photography geometry (photographer faces tree):
 *   sideA LEFT edge meets sideB RIGHT edge.
 *   e.g. Depan (photographer facing S): left of photo = East → connects to
 *        Kanan (photographer facing W): right of photo = North → same corner.
 *
 * @param {Array}  bboxesA         - [{id, classId, x1, y1, x2, y2}, ...]
 * @param {{w:number, h:number}} imgA
 * @param {Array}  bboxesB
 * @param {{w:number, h:number}} imgB
 * @param {Object} [opts]
 * @param {number} [opts.autoMin=0.75]       score >= autoMin → category 'auto'
 * @param {number} [opts.candidateMin=0.50]  score >= candidateMin → category 'candidate'
 * @param {number} [opts.edgeDecay=0.30]     edge proximity decay (fraction of image width)
 * @param {number} [opts.vertTol=0.20]       vertical tolerance (fraction of image height)
 * @returns {Array<{bboxIdA, bboxIdB, score, category, signals}>}
 */
function suggestPairs(bboxesA, imgA, bboxesB, imgB, opts = {}) {
  const autoMin      = opts.autoMin      ?? 0.75;
  const candidateMin = opts.candidateMin ?? 0.50;
  const edgeDecay    = opts.edgeDecay    ?? 0.30;
  const vertTol      = opts.vertTol      ?? 0.20;

  const all = [];

  for (const bA of bboxesA) {
    const nbA   = _norm(bA, imgA.w, imgA.h);
    const lSig  = _leftEdgeSig(nbA, edgeDecay);   // sideA: shared edge is LEFT (x1≈0)

    for (const bB of bboxesB) {
      const nbB     = _norm(bB, imgB.w, imgB.h);
      const rSig    = _rightEdgeSig(nbB, edgeDecay); // sideB: shared edge is RIGHT (x2≈1)
      const edgeSig = lSig * rSig;                   // product: both must be near their shared edge
      const vSig    = _vertSig(nbA, nbB, vertTol);
      const cSig    = _classSig(bA, bB);
      const sSig    = _sizeSig(nbA, nbB);

      const score = _clamp(
        0.40 * edgeSig + 0.35 * vSig + 0.15 * cSig + 0.10 * sSig,
        0, 1
      );

      if (score < candidateMin) continue;

      all.push({
        bboxIdA: bA.id,
        bboxIdB: bB.id,
        score,
        signals: {
          edge: +edgeSig.toFixed(3),
          vert: +vSig.toFixed(3),
          cls:  +cSig.toFixed(3),
          size: +sSig.toFixed(3),
        },
      });
    }
  }

  // Sort descending, greedy 1-to-1 assignment
  all.sort((a, b) => b.score - a.score);
  const usedA = new Set(), usedB = new Set();
  const result = [];

  for (const pair of all) {
    if (usedA.has(pair.bboxIdA) || usedB.has(pair.bboxIdB)) continue;
    usedA.add(pair.bboxIdA);
    usedB.add(pair.bboxIdB);
    result.push({
      ...pair,
      category: pair.score >= autoMin ? 'auto' : 'candidate',
    });
  }

  return result;
}
