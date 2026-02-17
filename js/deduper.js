function toNumber(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function readBox(raw) {
  const source = raw && (raw.box || raw.bbox || raw.xyxy || raw);
  if (!source) return null;

  let x1;
  let y1;
  let x2;
  let y2;

  if (Array.isArray(source)) {
    x1 = toNumber(source[0], 0);
    y1 = toNumber(source[1], 0);
    x2 = toNumber(source[2], 0);
    y2 = toNumber(source[3], 0);
  } else {
    x1 = toNumber(source.x1, 0);
    y1 = toNumber(source.y1, 0);
    x2 = toNumber(source.x2, 0);
    y2 = toNumber(source.y2, 0);
  }

  if (x2 <= x1 || y2 <= y1) return null;
  return { x1, y1, x2, y2 };
}

function clampBox(box, width, height) {
  const x1 = clamp(Math.round(box.x1), 0, width - 1);
  const y1 = clamp(Math.round(box.y1), 0, height - 1);
  const x2 = clamp(Math.round(box.x2), x1 + 1, width);
  const y2 = clamp(Math.round(box.y2), y1 + 1, height);
  return { x1, y1, x2, y2 };
}

function normalizeBox(box, width, height) {
  return {
    x1: box.x1 / width,
    y1: box.y1 / height,
    x2: box.x2 / width,
    y2: box.y2 / height,
  };
}

function readConfidence(raw) {
  const conf = raw && (raw.confidence !== undefined ? raw.confidence : raw.conf);
  return clamp(toNumber(conf, 0), 0, 1);
}

function readClassName(raw) {
  if (!raw) return 'sawit';
  if (raw.name) return String(raw.name);
  if (raw.class !== undefined) return String(raw.class);
  return 'sawit';
}

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Gagal membaca file gambar.'));
    };
    img.src = url;
  });
}

function popcount64BigInt(x) {
  let n = x;
  let count = 0;
  while (n > 0n) {
    count += Number(n & 1n);
    n >>= 1n;
  }
  return count;
}

function hammingSimilarity(a, b) {
  const xor = a ^ b;
  const dist = popcount64BigInt(xor);
  return 1 - dist / 64;
}

function rgbToHsv(r, g, b) {
  const nr = r / 255;
  const ng = g / 255;
  const nb = b / 255;

  const max = Math.max(nr, ng, nb);
  const min = Math.min(nr, ng, nb);
  const d = max - min;

  let h = 0;
  if (d > 0) {
    if (max === nr) h = ((ng - nb) / d) % 6;
    else if (max === ng) h = (nb - nr) / d + 2;
    else h = (nr - ng) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }

  const s = max === 0 ? 0 : d / max;
  const v = max;
  return { h, s, v };
}

function histogramSimilarity(a, b) {
  let sumMin = 0;
  let sumA = 0;
  let sumB = 0;
  for (let i = 0; i < a.length; i++) {
    sumMin += Math.min(a[i], b[i]);
    sumA += a[i];
    sumB += b[i];
  }
  const denom = Math.max(sumA, sumB, 1e-6);
  return sumMin / denom;
}

function computeEdgeProximity(normBox) {
  const left = normBox.x1;
  const right = 1 - normBox.x2;
  const top = normBox.y1;
  const bottom = 1 - normBox.y2;
  const minDist = Math.min(left, right, top, bottom);
  return 1 - clamp(minDist / 0.25, 0, 1);
}

function computeGeomSimilarity(a, b) {
  const areaA = Math.max((a.normBox.x2 - a.normBox.x1) * (a.normBox.y2 - a.normBox.y1), 1e-6);
  const areaB = Math.max((b.normBox.x2 - b.normBox.x1) * (b.normBox.y2 - b.normBox.y1), 1e-6);
  const areaSim = 1 - clamp(Math.abs(areaA - areaB) / Math.max(areaA, areaB), 0, 1);

  const arA = Math.max((a.normBox.x2 - a.normBox.x1) / Math.max(a.normBox.y2 - a.normBox.y1, 1e-6), 1e-6);
  const arB = Math.max((b.normBox.x2 - b.normBox.x1) / Math.max(b.normBox.y2 - b.normBox.y1, 1e-6), 1e-6);
  const aspectSim = 1 - clamp(Math.abs(arA - arB) / Math.max(arA, arB), 0, 1);

  return 0.6 * areaSim + 0.4 * aspectSim;
}

function pairKey(aDetId, bDetId) {
  return aDetId < bDetId ? `${aDetId}|${bDetId}` : `${bDetId}|${aDetId}`;
}

function createUnionFind(ids) {
  const parent = new Map();
  ids.forEach((id) => parent.set(id, id));

  function find(x) {
    const p = parent.get(x);
    if (p === x) return x;
    const root = find(p);
    parent.set(x, root);
    return root;
  }

  function union(a, b) {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(rb, ra);
  }

  return { find, union };
}

async function computeCropFeatures(image, box, normBox) {
  const w = Math.max(1, box.x2 - box.x1);
  const h = Math.max(1, box.y2 - box.y1);

  const hashCanvas = document.createElement('canvas');
  hashCanvas.width = 9;
  hashCanvas.height = 8;
  const hashCtx = hashCanvas.getContext('2d');
  hashCtx.drawImage(image, box.x1, box.y1, w, h, 0, 0, 9, 8);
  const hashData = hashCtx.getImageData(0, 0, 9, 8).data;

  const grayscale = [];
  for (let i = 0; i < hashData.length; i += 4) {
    const g = 0.299 * hashData[i] + 0.587 * hashData[i + 1] + 0.114 * hashData[i + 2];
    grayscale.push(g);
  }

  let hash = 0n;
  let bit = 0n;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const left = grayscale[y * 9 + x];
      const right = grayscale[y * 9 + x + 1];
      if (left > right) {
        hash |= (1n << bit);
      }
      bit += 1n;
    }
  }

  const histCanvas = document.createElement('canvas');
  histCanvas.width = 40;
  histCanvas.height = 40;
  const histCtx = histCanvas.getContext('2d');
  histCtx.drawImage(image, box.x1, box.y1, w, h, 0, 0, 40, 40);
  const histData = histCtx.getImageData(0, 0, 40, 40).data;

  const bins = new Array(12).fill(0);
  for (let i = 0; i < histData.length; i += 4) {
    const r = histData[i];
    const g = histData[i + 1];
    const b = histData[i + 2];
    const hsv = rgbToHsv(r, g, b);
    const bin = Math.min(11, Math.floor(hsv.h / 30));
    bins[bin] += hsv.s * hsv.v + 0.1;
  }

  const sumBins = bins.reduce((acc, val) => acc + val, 0) || 1;
  const hist = bins.map((v) => v / sumBins);

  return {
    hash,
    hist,
    edgeProximity: computeEdgeProximity(normBox),
  };
}

const TreeDeduper = {
  async buildSessionEvidence(session, options = {}) {
    const autoMergeMin = toNumber(options.autoMergeMin, 0.82);
    const ambiguousMin = toNumber(options.ambiguousMin, 0.68);
    const sideLabels = window.TREE_SIDE_LABELS || ['Depan', 'Kanan', 'Belakang', 'Kiri'];

    const sidePayloads = await Promise.all(
      session.sides.map(async (side) => {
        if (!side.file) return [];
        const image = await loadImageFromFile(side.file);
        const width = image.naturalWidth || image.width;
        const height = image.naturalHeight || image.height;

        const canonical = [];
        for (let i = 0; i < side.detections.length; i++) {
          const raw = side.detections[i];
          const box = readBox(raw);
          if (!box) continue;

          const clamped = clampBox(box, width, height);
          const normBox = normalizeBox(clamped, width, height);
          const features = await computeCropFeatures(image, clamped, normBox);

          canonical.push({
            detId: `s${side.sideIndex}-d${i}`,
            sideIndex: side.sideIndex,
            sideLabel: sideLabels[side.sideIndex] || `Sisi ${side.sideIndex + 1}`,
            name: readClassName(raw),
            conf: readConfidence(raw),
            box: clamped,
            normBox,
            ...features,
          });
        }
        return canonical;
      })
    );

    const detections = sidePayloads.flat();
    const detectionMap = {};
    detections.forEach((det) => {
      detectionMap[det.detId] = det;
    });

    const adjacentPairs = [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 0],
    ];

    const candidatePairs = [];
    adjacentPairs.forEach(([left, right]) => {
      const leftDets = detections.filter((d) => d.sideIndex === left);
      const rightDets = detections.filter((d) => d.sideIndex === right);
      if (!leftDets.length || !rightDets.length) return;

      const localPairs = [];
      leftDets.forEach((a) => {
        rightDets.forEach((b) => {
          const hashSim = hammingSimilarity(a.hash, b.hash);
          const histSim = histogramSimilarity(a.hist, b.hist);
          const geomSim = computeGeomSimilarity(a, b);
          const edgePrior = 1 - Math.abs(a.edgeProximity - b.edgeProximity);
          const classPenalty = a.name === b.name ? 1 : 0.9;

          const baseScore = (0.45 * hashSim) + (0.25 * histSim) + (0.20 * geomSim) + (0.10 * edgePrior);
          const score = clamp(baseScore * classPenalty, 0, 1);
          if (score < ambiguousMin) return;

          localPairs.push({
            key: pairKey(a.detId, b.detId),
            aDetId: a.detId,
            bDetId: b.detId,
            aSide: a.sideLabel,
            bSide: b.sideLabel,
            aSideIndex: a.sideIndex,
            bSideIndex: b.sideIndex,
            score,
            reasons: [
              `hash ${hashSim.toFixed(2)}`,
              `hist ${histSim.toFixed(2)}`,
              `geom ${geomSim.toFixed(2)}`,
              `edge ${edgePrior.toFixed(2)}`,
            ],
          });
        });
      });

      localPairs.sort((a, b) => b.score - a.score);
      const usedA = new Set();
      const usedB = new Set();
      localPairs.forEach((pair) => {
        if (usedA.has(pair.aDetId) || usedB.has(pair.bDetId)) return;
        usedA.add(pair.aDetId);
        usedB.add(pair.bDetId);
        candidatePairs.push(pair);
      });
    });

    const autoMergedPairs = [];
    const ambiguousPairs = [];
    candidatePairs.forEach((pair) => {
      if (pair.score >= autoMergeMin) {
        autoMergedPairs.push({ ...pair, decision: 'auto_merge' });
      } else {
        ambiguousPairs.push({ ...pair, decision: 'ambiguous' });
      }
    });

    return {
      thresholds: { autoMergeMin, ambiguousMin },
      detections,
      detectionMap,
      autoMergedPairs,
      ambiguousPairs,
    };
  },

  resolve(session, evidence, userDecisions = {}) {
    const mergedPairs = evidence.autoMergedPairs.map((p) => p.key);
    const finalDecisions = {};

    evidence.autoMergedPairs.forEach((pair) => {
      finalDecisions[pair.key] = 'merge';
    });

    evidence.ambiguousPairs.forEach((pair) => {
      const decision = userDecisions[pair.key] === 'merge' ? 'merge' : 'separate';
      finalDecisions[pair.key] = decision;
      if (decision === 'merge') {
        mergedPairs.push(pair.key);
      }
    });

    const uf = createUnionFind(evidence.detections.map((d) => d.detId));
    const mergedPairSet = new Set(mergedPairs);
    const allPairs = evidence.autoMergedPairs.concat(evidence.ambiguousPairs);
    allPairs.forEach((pair) => {
      if (!mergedPairSet.has(pair.key)) return;
      uf.union(pair.aDetId, pair.bDetId);
    });

    const groups = new Map();
    evidence.detections.forEach((det) => {
      const root = uf.find(det.detId);
      if (!groups.has(root)) groups.set(root, []);
      groups.get(root).push(det);
    });

    const clusters = Array.from(groups.values())
      .map((members, idx) => {
        const avgConf = members.reduce((acc, m) => acc + m.conf, 0) / Math.max(1, members.length);
        const sides = Array.from(new Set(members.map((m) => m.sideLabel))).join(', ');
        return {
          clusterId: idx + 1,
          members,
          size: members.length,
          sides,
          avgConf,
        };
      })
      .sort((a, b) => b.size - a.size || b.avgConf - a.avgConf);

    const sideSummary = session.sides.map((side) => {
      const dets = evidence.detections.filter((d) => d.sideIndex === side.sideIndex);
      const avg = dets.length
        ? dets.reduce((acc, d) => acc + d.conf, 0) / dets.length
        : 0;
      return {
        sideIndex: side.sideIndex,
        label: side.label,
        rawCount: dets.length,
        avgConf: avg,
      };
    });

    const rawCount = evidence.detections.length;
    const uniqueCount = clusters.length;
    const mergeCount = Math.max(0, rawCount - uniqueCount);

    return {
      rawCount,
      uniqueCount,
      mergeCount,
      clusters,
      sideSummary,
      decisions: finalDecisions,
      ambiguityResolvedCount: evidence.ambiguousPairs.length,
      thresholds: evidence.thresholds,
    };
  },
};

window.TreeDeduper = TreeDeduper;
