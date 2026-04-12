'use strict';

const TREE_SIDE_LABELS = ['Depan', 'Kanan', 'Belakang', 'Kiri'];

// Adjacent pair definitions: [sideA, sideB] clockwise (right edge of A meets left edge of B)
const ADJACENT_PAIRS = [[0, 1], [1, 2], [2, 3], [3, 0]];

// ─── Active Session ───────────────────────────────────────────────────────────

const ActiveSession = (() => {
  let _state = null;
  let _linkSeq = 0;

  function _createSide(sideIndex) {
    return {
      sideIndex,
      label: TREE_SIDE_LABELS[sideIndex],
      imageUrl: null,
      bboxes: [],
      originalBboxes: [],
      imageWidth: 0,
      imageHeight: 0,
    };
  }

  function _deepCloneBboxes(bboxes) {
    return bboxes.map(b => ({ ...b }));
  }

  function _loadImageDimensions(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = reject;
      img.src = url;
    });
  }

  async function loadTree(datasetTree) {
    // Revoke old blob URLs
    if (_state) {
      for (const s of _state.sides) {
        if (s.imageUrl) URL.revokeObjectURL(s.imageUrl);
      }
    }
    _linkSeq = 0;

    const sides = [0, 1, 2, 3].map(_createSide);
    await Promise.all(datasetTree.sides.map(async (dSide, i) => {
      const side = sides[i];
      if (!dSide || !dSide.imageFile) return;
      side.imageUrl = URL.createObjectURL(dSide.imageFile);
      const dims = await _loadImageDimensions(side.imageUrl);
      side.imageWidth  = dims.w;
      side.imageHeight = dims.h;
      if (dSide.labelFile) {
        const text = await dSide.labelFile.text();
        side.bboxes = parseYoloLabel(text, dims.w, dims.h);
      } else {
        side.bboxes = [];
      }
      side.originalBboxes = _deepCloneBboxes(side.bboxes);
    }));

    _state = {
      treeName: datasetTree.name,
      split: datasetTree.split,
      sides,
      suggestedLinks: [],
      confirmedLinks: [],
      dirty: false,
    };

    return _state;
  }

  function get() { return _state; }
  function _markDirty() { if (_state) _state.dirty = true; }

  // ── BBox CRUD ──────────────────────────────────────────────────────────────

  function addBbox(sideIndex, bbox) {
    _state.sides[sideIndex].bboxes.push(bbox);
    _markDirty();
  }

  function removeBbox(sideIndex, id) {
    const side = _state.sides[sideIndex];
    side.bboxes = side.bboxes.filter(b => b.id !== id);
    _state.suggestedLinks = _state.suggestedLinks.filter(l => l.bboxIdA !== id && l.bboxIdB !== id);
    _state.confirmedLinks = _state.confirmedLinks.filter(l => l.bboxIdA !== id && l.bboxIdB !== id);
    _markDirty();
  }

  function updateBbox(sideIndex, id, patch) {
    const side = _state.sides[sideIndex];
    const idx = side.bboxes.findIndex(b => b.id === id);
    if (idx === -1) return;
    side.bboxes[idx] = { ...side.bboxes[idx], ...patch };
    _markDirty();
  }

  // ── Dedup Links ────────────────────────────────────────────────────────────

  function runSuggestions(opts) {
    if (!_state) return;
    _state.suggestedLinks = [];
    for (const [iA, iB] of ADJACENT_PAIRS) {
      const sA = _state.sides[iA], sB = _state.sides[iB];
      if (!sA.imageWidth || !sB.imageWidth) continue;
      const pairs = suggestPairs(
        sA.bboxes, { w: sA.imageWidth, h: sA.imageHeight },
        sB.bboxes, { w: sB.imageWidth, h: sB.imageHeight },
        opts
      );
      for (const p of pairs) {
        const alreadyConfirmed = _state.confirmedLinks.some(
          l => l.bboxIdA === p.bboxIdA && l.bboxIdB === p.bboxIdB
        );
        if (alreadyConfirmed) continue;
        _state.suggestedLinks.push({
          linkId: 'sug-' + (_linkSeq++),
          sideA: iA, bboxIdA: p.bboxIdA,
          sideB: iB, bboxIdB: p.bboxIdB,
          score: p.score, category: p.category, signals: p.signals,
        });
      }
    }
  }

  function confirmLink(linkId) {
    const idx = _state.suggestedLinks.findIndex(l => l.linkId === linkId);
    if (idx === -1) return;
    const link = _state.suggestedLinks.splice(idx, 1)[0];
    _state.confirmedLinks.push({
      linkId: 'lnk-' + (_linkSeq++),
      sideA: link.sideA, bboxIdA: link.bboxIdA,
      sideB: link.sideB, bboxIdB: link.bboxIdB,
    });
    _markDirty();
  }

  function confirmAllAuto() {
    const autos = _state.suggestedLinks.filter(l => l.category === 'auto');
    for (const l of autos) {
      _state.confirmedLinks.push({
        linkId: 'lnk-' + (_linkSeq++),
        sideA: l.sideA, bboxIdA: l.bboxIdA,
        sideB: l.sideB, bboxIdB: l.bboxIdB,
      });
    }
    _state.suggestedLinks = _state.suggestedLinks.filter(l => l.category !== 'auto');
    _markDirty();
  }

  function rejectLink(linkId) {
    _state.suggestedLinks = _state.suggestedLinks.filter(l => l.linkId !== linkId);
  }

  function addManualLink(sideA, bboxIdA, sideB, bboxIdB) {
    const exists = _state.confirmedLinks.some(
      l => (l.bboxIdA === bboxIdA && l.bboxIdB === bboxIdB) ||
           (l.bboxIdA === bboxIdB && l.bboxIdB === bboxIdA)
    );
    if (exists) return null;
    const link = {
      linkId: 'lnk-' + (_linkSeq++),
      sideA, bboxIdA, sideB, bboxIdB,
    };
    _state.confirmedLinks.push(link);
    _markDirty();
    return link;
  }

  function removeConfirmedLink(linkId) {
    _state.confirmedLinks = _state.confirmedLinks.filter(l => l.linkId !== linkId);
    _markDirty();
  }

  function isDirty() { return _state ? _state.dirty : false; }

  // ── Serialization ──────────────────────────────────────────────────────────

  function toJSON() {
    if (!_state) return null;
    return {
      version: 1,
      treeName: _state.treeName,
      split: _state.split,
      sides: _state.sides.map(s => ({
        sideIndex: s.sideIndex,
        label: s.label,
        imageWidth: s.imageWidth,
        imageHeight: s.imageHeight,
        bboxes: _deepCloneBboxes(s.bboxes),
      })),
      suggestedLinks: [..._state.suggestedLinks],
      confirmedLinks: [..._state.confirmedLinks],
    };
  }

  async function fromJSON(saved, datasetTree) {
    await loadTree(datasetTree);
    for (const ss of saved.sides) {
      const side = _state.sides[ss.sideIndex];
      if (!side) continue;
      side.bboxes = _deepCloneBboxes(ss.bboxes);
      side.originalBboxes = _deepCloneBboxes(ss.bboxes);
      // Restore saved dimensions in case image wasn't loaded
      if (!side.imageWidth && ss.imageWidth) side.imageWidth = ss.imageWidth;
      if (!side.imageHeight && ss.imageHeight) side.imageHeight = ss.imageHeight;
    }
    _state.suggestedLinks = saved.suggestedLinks || [];
    _state.confirmedLinks = saved.confirmedLinks || [];
    _state.dirty = false;
    return _state;
  }

  return {
    loadTree, fromJSON, get,
    addBbox, removeBbox, updateBbox,
    runSuggestions, confirmLink, confirmAllAuto,
    rejectLink, addManualLink, removeConfirmedLink,
    isDirty, toJSON,
    get ADJACENT_PAIRS() { return ADJACENT_PAIRS; },
  };
})();

window.ActiveSession = ActiveSession;
window.TREE_SIDE_LABELS = TREE_SIDE_LABELS;
window.ADJACENT_PAIRS = ADJACENT_PAIRS;
