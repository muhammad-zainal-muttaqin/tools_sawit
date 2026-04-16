'use strict';

/**
 * OutputSchema — generates the Bu-Fatma-spec output JSON for a single tree.
 *
 * Format:
 *   - tree_id:   generated from ProjectConfig (date + varietas + number)
 *   - images:    per-side image info + annotations with both YOLO & pixel coords
 *   - bunches:   unique bunches with cross-references to side + box_index
 *   - summary:   counts
 *
 * This JSON is self-contained: bbox coordinates are duplicated into the bunches
 * array so downstream consumers don't need the original label files.
 */
const OutputSchema = (() => {

  const SIDE_KEYS = ['depan', 'kanan', 'belakang', 'kiri'];

  function _bboxKey(sideIndex, bboxId) {
    return `${sideIndex}:${bboxId}`;
  }

  /**
   * Convert pixel-coord bbox to YOLO normalized format.
   */
  function _toYoloCoords(bbox, imgW, imgH) {
    const cx = ((bbox.x1 + bbox.x2) / 2) / imgW;
    const cy = ((bbox.y1 + bbox.y2) / 2) / imgH;
    const w  = (bbox.x2 - bbox.x1) / imgW;
    const h  = (bbox.y2 - bbox.y1) / imgH;
    return [
      parseFloat(cx.toFixed(6)),
      parseFloat(cy.toFixed(6)),
      parseFloat(w.toFixed(6)),
      parseFloat(h.toFixed(6)),
    ];
  }

  /**
   * Get a stable side key for a given side index and total side count.
   * For N=4 uses compass names; otherwise uses generic "sisi_N".
   */
  function _sideKey(sideIndex, totalSides) {
    if (totalSides === 4 && sideIndex < 4) {
      return SIDE_KEYS[sideIndex];
    }
    return 'sisi_' + (sideIndex + 1);
  }

  /**
   * Build a map from bbox ID → { sideIndex, boxIndex } for quick lookup.
   */
  function _buildBboxIndexMap(session) {
    const map = new Map();
    for (const side of session.sides) {
      side.bboxes.forEach((bbox, boxIdx) => {
        map.set(_bboxKey(side.sideIndex, bbox.id), { sideIndex: side.sideIndex, boxIndex: boxIdx });
      });
    }
    return map;
  }

  /**
   * Generate the full output JSON for a tree.
   *
   * @param {object} session      — ActiveSession.get()
   * @param {object} result       — Results.compute(session) output
   * @param {string} treeId       — from ProjectConfig.treeIdForIndex()
   * @param {object} projectCfg   — ProjectConfig.get()
   * @param {object} datasetTree  — DatasetManager.getTree() (for original filenames)
   * @returns {object}            — the output JSON object
   */
  function generate(session, result, treeId, projectCfg, datasetTree) {
    const totalSides = session.sides.length;
    const bboxIndexMap = _buildBboxIndexMap(session);

    // ── Images section ─────────────────────────────────────────────────────
    const images = {};
    for (const side of session.sides) {
      const key = _sideKey(side.sideIndex, totalSides);
      const imgW = side.imageWidth;
      const imgH = side.imageHeight;

      // Get original filenames from dataset tree
      const dSide = datasetTree && datasetTree.sides[side.sideIndex];
      const imageFilename = dSide && dSide.imageFile ? dSide.imageFile.name : `${session.treeName}_${side.sideIndex + 1}.jpg`;
      const labelFilename = dSide && dSide.labelFile ? dSide.labelFile.name : `${session.treeName}_${side.sideIndex + 1}.txt`;

      const annotations = side.bboxes.map((bbox, boxIdx) => ({
        box_index: boxIdx,
        class_id: bbox.classId,
        class_name: bbox.className,
        bbox_yolo: _toYoloCoords(bbox, imgW, imgH),
        bbox_pixel: [
          Math.round(bbox.x1),
          Math.round(bbox.y1),
          Math.round(bbox.x2),
          Math.round(bbox.y2),
        ],
      }));

      images[key] = {
        filename: imageFilename,
        label_file: labelFilename,
        side_index: side.sideIndex,
        side_label: side.label,
        width: imgW,
        height: imgH,
        bbox_count: annotations.length,
        annotations,
      };
    }

    // ── Bunches section ────────────────────────────────────────────────────
    const bunches = [];
    if (result && result.clusters) {
      let bunchId = 1;
      for (const members of result.clusters.values()) {
        // Majority-vote class
        const votes = {};
        for (const b of members) {
          votes[b.className] = (votes[b.className] || 0) + 1;
        }
        const sortedVotes = Object.entries(votes).sort((a, b) => b[1] - a[1]);
        const dominantClass = sortedVotes[0][0];
        const classes = new Set(members.map(b => b.className));

        const appearances = members.map(b => {
          const info = bboxIndexMap.get(_bboxKey(b._sideIndex, b.id));
          const sKey = info ? _sideKey(info.sideIndex, totalSides) : 'unknown';
          return {
            side: sKey,
            side_index: info ? info.sideIndex : -1,
            box_index: info ? info.boxIndex : -1,
            class_name: b.className,
            bbox_pixel: [Math.round(b.x1), Math.round(b.y1), Math.round(b.x2), Math.round(b.y2)],
          };
        });

        // Sort appearances by side_index for consistency
        appearances.sort((a, b) => a.side_index - b.side_index);

        bunches.push({
          bunch_id: bunchId++,
          class: dominantClass,
          class_mismatch: classes.size > 1,
          appearance_count: appearances.length,
          appearances,
        });
      }
    }

    // ── Summary section ────────────────────────────────────────────────────
    const summary = {
      total_unique_bunches: result ? result.uniqueCount : 0,
      total_detections: result ? result.rawCount : 0,
      duplicates_linked: result ? result.linkedCount : 0,
      by_class: result ? { ...result.classCounts } : {},
      by_side: {},
    };

    // Side counts by key name
    for (const side of session.sides) {
      const key = _sideKey(side.sideIndex, totalSides);
      summary.by_side[key] = side.bboxes.length;
    }

    // ── Full output ────────────────────────────────────────────────────────
    return {
      version: 1,
      tree_id: treeId,
      tree_name: session.treeName,
      split: session.split,
      metadata: {
        date: projectCfg.date,
        varietas: projectCfg.varietas,
        number: parseInt(treeId.split('-').pop(), 10) || 0,
        generated_at: new Date().toISOString(),
      },
      images,
      bunches,
      summary,
    };
  }

  /**
   * Convert an output JSON (produced by `generate`) back into the session JSON
   * shape consumed by `ActiveSession.fromJSON()`.
   *
   * Bbox IDs are reconstructed as `"b" + boxIndex` so they line up with the
   * IDs that `ActiveSession.loadTree()` will assign when it re-parses the
   * label files from disk. This keeps `confirmedLinks` referentially valid.
   *
   * Suggestions are not preserved — the user can re-run them.
   */
  function toSessionJSON(outputJson) {
    if (!outputJson || !outputJson.images) {
      throw new Error('Bukan output JSON yang valid (tidak ada field "images").');
    }

    const sideEntries = Object.entries(outputJson.images)
      .map(([key, img]) => ({ key, img }))
      .sort((a, b) => a.img.side_index - b.img.side_index);

    const sides = sideEntries.map(({ img }) => ({
      sideIndex: img.side_index,
      label: img.side_label,
      imageWidth: img.width,
      imageHeight: img.height,
      bboxes: (img.annotations || []).map((ann, i) => ({
        id: 'b' + (typeof ann.box_index === 'number' ? ann.box_index : i),
        classId: ann.class_id,
        className: ann.class_name,
        x1: ann.bbox_pixel[0],
        y1: ann.bbox_pixel[1],
        x2: ann.bbox_pixel[2],
        y2: ann.bbox_pixel[3],
      })),
    }));

    const confirmedLinks = [];
    let linkSeq = 0;
    for (const bunch of (outputJson.bunches || [])) {
      const apps = bunch.appearances || [];
      if (apps.length < 2) continue;
      // Chain consecutive appearances — same union-find cluster as any topology.
      for (let i = 0; i < apps.length - 1; i++) {
        const a = apps[i];
        const b = apps[i + 1];
        confirmedLinks.push({
          linkId: 'L' + (linkSeq++),
          sideA: a.side_index,
          bboxIdA: 'b' + a.box_index,
          sideB: b.side_index,
          bboxIdB: 'b' + b.box_index,
        });
      }
    }

    return {
      version: 1,
      treeName: outputJson.tree_name,
      split: outputJson.split,
      sides,
      suggestedLinks: [],
      confirmedLinks,
    };
  }

  return { generate, toSessionJSON };
})();

window.OutputSchema = OutputSchema;
