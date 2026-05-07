'use strict';

/**
 * DatasetManager — load a dataset folder via <input webkitdirectory>
 * and group files into tree objects for navigation.
 *
 * Expected folder structure:
 *   {root}/images/{split}/{stem}_{N}.jpg
 *   {root}/labels/{split}/{stem}_{N}.txt           (original predictions)
 *   {root}/Output TXT/{split}/{stem}_{N}.txt       (annotator's corrections, optional)
 *   {root}/Output JSON/{tree_name}.json            (saved tree-level GT)
 *
 * Where stem = e.g. DAMIMAS_A21B_0004, and _{N} is the side number (1..99).
 * Number of sides per tree is derived from the max side number observed
 * for that tree (so 4-sided and 8-sided trees can coexist in one dataset).
 *
 * Label resolution: when both `labels/` and `Output TXT/` contain the same
 * stem, the Output TXT version wins. This lets annotators resume from their
 * own corrections instead of falling back to the original predictions.
 */
const DatasetManager = (() => {
  let _trees = [];
  let _currentIndex = 0;

  /**
   * Strip file extension from a filename.
   */
  function _stem(filename) {
    return filename.replace(/\.[^.]+$/, '');
  }

  /**
   * Extract side number (1-99) from stem suffix (_1, _2, …).
   * Returns null if no valid suffix found.
   */
  function _sideNum(stem) {
    const m = stem.match(/_([1-9]\d?)$/);
    return m ? parseInt(m[1], 10) : null;
  }

  /**
   * Strip the side suffix from a stem: DAMIMAS_A21B_0004_1 → DAMIMAS_A21B_0004
   */
  function _treeName(stem) {
    return stem.replace(/_[1-9]\d?$/, '');
  }

  /**
   * Detect split from a webkitRelativePath.
   * Looks for /train/, /val/, /test/ segments.
   */
  function _detectSplit(relPath) {
    if (/\/train\//i.test(relPath) || /\\train\\/i.test(relPath)) return 'train';
    if (/\/val\//i.test(relPath)   || /\\val\\/i.test(relPath))   return 'val';
    if (/\/test\//i.test(relPath)  || /\\test\\/i.test(relPath))  return 'test';
    return 'unknown';
  }

  /**
   * Skip OS metadata / archive artifacts that webkitdirectory exposes.
   * macOS: __MACOSX/, .DS_Store, ._foo.
   * Windows: Thumbs.db, desktop.ini.
   */
  function _isJunkFile(relPath, name) {
    if (/(^|[/\\])__MACOSX([/\\]|$)/.test(relPath)) return true;
    if (name === '.DS_Store') return true;
    if (name.startsWith('._')) return true;
    if (/^thumbs\.db$/i.test(name)) return true;
    if (/^desktop\.ini$/i.test(name)) return true;
    return false;
  }

  /**
   * Load a FileList from <input webkitdirectory> and build tree list.
   * @param {FileList} fileList
   */
  function load(fileList) {
    // Separate images and labels by stem.
    // For labels, track source priority so `Output TXT/` overrides `labels/`
    // when both exist (annotator's corrections win over original predictions).
    const imagesByStem = new Map(); // stem → { file, split }
    const labelsByStem = new Map(); // stem → { file, split, source }
    let _junkSkipped = 0;

    // Source rank: higher wins. 2 = Output TXT (correction), 1 = labels/ (original).
    function _labelSource(rel) {
      if (/(^|[/\\])Output TXT([/\\])/i.test(rel)) return 2;
      return 1;
    }

    for (const file of fileList) {
      const rel  = file.webkitRelativePath || file.name;
      const name = file.name;
      if (_isJunkFile(rel, name)) { _junkSkipped++; continue; }
      const stem = _stem(name);
      const ext  = name.split('.').pop().toLowerCase();
      const split = _detectSplit(rel);

      if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
        imagesByStem.set(stem, { file, split });
      } else if (ext === 'txt') {
        // Skip txt files that aren't under labels/ or Output TXT/ (e.g. data.yaml siblings)
        const isLabelPath = /(^|[/\\])(labels|Output TXT)([/\\])/i.test(rel);
        if (!isLabelPath) continue;
        const source = _labelSource(rel);
        const existing = labelsByStem.get(stem);
        if (!existing || source >= existing.source) {
          labelsByStem.set(stem, { file, split, source });
        }
      }
    }

    // Group by tree name
    const treeMap = new Map(); // treeName → { split, sides: Map<sideNum, {imageFile, labelFile}> }

    for (const [stem, { file, split }] of imagesByStem) {
      const sNum = _sideNum(stem);
      if (sNum === null) continue;
      const name = _treeName(stem);
      if (!treeMap.has(name)) {
        treeMap.set(name, { split, sides: new Map() });
      }
      const entry = treeMap.get(name).sides.get(sNum) || {};
      entry.imageFile = file;
      treeMap.get(name).sides.set(sNum, entry);
    }

    for (const [stem, { file }] of labelsByStem) {
      const sNum = _sideNum(stem);
      if (sNum === null) continue;
      const name = _treeName(stem);
      if (!treeMap.has(name)) continue; // no matching image, skip
      const sidesMap = treeMap.get(name).sides;
      const entry = sidesMap.get(sNum) || {};
      entry.labelFile = file;
      sidesMap.set(sNum, entry);
    }

    // Convert to sorted array of tree objects.
    // Side count per tree is the max side number observed in its filenames.
    _trees = Array.from(treeMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, { split, sides: sidesMap }]) => {
        const maxSide = sidesMap.size ? Math.max(...sidesMap.keys()) : 4;
        const n = Math.max(2, maxSide);
        return {
          name,
          split,
          sides: Array.from({ length: n }, (_, i) =>
            sidesMap.get(i + 1) || { imageFile: null, labelFile: null }
          ),
        };
      });

    _currentIndex = 0;
    if (_junkSkipped > 0) {
      console.log('[Dataset] Skipped', _junkSkipped, 'junk file(s) (__MACOSX/.DS_Store/Thumbs.db/etc.)');
    }
    return _trees;
  }

  function count()   { return _trees.length; }
  function getTree() { return _trees[_currentIndex] || null; }
  function getIndex(){ return _currentIndex; }

  function goTo(idx) {
    if (idx < 0 || idx >= _trees.length) return false;
    _currentIndex = idx;
    return true;
  }

  function next() { return goTo(_currentIndex + 1); }
  function prev() { return goTo(_currentIndex - 1); }

  /**
   * Find a tree by name. Returns its index or -1.
   */
  function findByName(name) {
    return _trees.findIndex(t => t.name === name);
  }

  function getTrees() { return _trees; }

  return { load, count, getTree, getIndex, goTo, next, prev, findByName, getTrees };
})();

window.DatasetManager = DatasetManager;
