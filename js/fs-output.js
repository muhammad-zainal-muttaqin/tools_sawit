'use strict';

/**
 * FsOutput — File System Access API wrapper for saving output JSON files.
 *
 * Primary: write directly to a user-selected output directory (Chrome/Edge).
 * Fallback: trigger a browser download if the API is unavailable or no dir chosen.
 */
const FsOutput = (() => {

  /**
   * Save a JSON object to the output directory (or download as fallback).
   *
   * @param {string} filename  output filename, e.g. "DAMIMAS_A21B_0001.json"
   * @param {object} data      — JSON-serializable object
   * @returns {Promise<{ok: boolean, method: string, error?: string}>}
   */
  async function saveJSON(filename, data, opts = {}) {
    const dirHandle = ProjectConfig.getOutputDirHandle();
    const jsonStr = JSON.stringify(data, null, 2);
    const allowDownload = opts.allowDownload !== false;

    // Try File System Access API first
    if (dirHandle) {
      try {
        const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(jsonStr);
        await writable.close();
        return { ok: true, method: 'filesystem' };
      } catch (e) {
        console.warn('[FsOutput] File System write failed, falling back to download:', e);
        // Permission may have been revoked — fall through to download
      }
    }

    if (!allowDownload) {
      return { ok: false, method: 'none', error: 'No writable output folder is available.' };
    }

    // Fallback: browser download
    try {
      _download(filename, jsonStr, 'application/json');
      return { ok: true, method: 'download' };
    } catch (e) {
      return { ok: false, method: 'none', error: e.message };
    }
  }

  /**
   * Save a batch of tree outputs. Returns summary of results.
   *
   * @param {Array<{filename: string, data: object}>} items
   * @returns {Promise<{saved: number, failed: number, method: string}>}
   */
  async function saveBatch(items) {
    let saved = 0, failed = 0, method = 'none';
    for (const item of items) {
      const result = await saveJSON(item.filename, item.data);
      if (result.ok) { saved++; method = result.method; }
      else failed++;
    }
    return { saved, failed, method };
  }

  /**
   * Resolve (or create) a nested sub-directory under a given FileSystemDirectoryHandle.
   * `segments` is an ordered array of folder names, e.g. ['train'].
   */
  async function _resolveSubDir(rootHandle, segments) {
    let cur = rootHandle;
    for (const seg of segments) {
      if (!seg) continue;
      cur = await cur.getDirectoryHandle(seg, { create: true });
    }
    return cur;
  }

  /**
   * Save a corrected YOLO .txt label file into the configured labels directory.
   * The file is nested by `split` (e.g. "train") when provided so the output
   * mirrors the dataset layout. If no labels directory is configured or the
   * File System Access API is unavailable, the file is downloaded instead.
   *
   * @param {string} filename   original per-side label filename
   * @param {string} content    YOLO-formatted label text
   * @param {string} [split]    dataset split name ("train"|"val"|"test"|...)
   * @returns {Promise<{ok:boolean, method:string, error?:string}>}
   */
  async function saveLabelFile(filename, content, split, opts = {}) {
    const labelsDir = ProjectConfig.getLabelsDirHandle();
    const allowDownload = opts.allowDownload === true;

    if (labelsDir) {
      try {
        const segments = [];
        if (split && split !== 'unknown') segments.push(split);
        const dir = await _resolveSubDir(labelsDir, segments);
        const fileHandle = await dir.getFileHandle(filename, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(content);
        await writable.close();
        return { ok: true, method: 'filesystem' };
      } catch (e) {
        console.warn('[FsOutput] Label write failed, falling back to download:', e);
      }
    }

    if (!allowDownload) {
      return { ok: false, method: 'none', error: 'No writable label folder is available.' };
    }

    try {
      _download(filename, content, 'text/plain');
      return { ok: true, method: 'download' };
    } catch (e) {
      return { ok: false, method: 'none', error: e.message };
    }
  }

  /**
   * Trigger a browser download (fallback).
   */
  function _download(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
  }

  /**
   * Check if we currently have write access to the output directory.
   */
  async function verifyAccess() {
    const dirHandle = ProjectConfig.getOutputDirHandle();
    if (!dirHandle) return false;
    try {
      const perm = await dirHandle.queryPermission({ mode: 'readwrite' });
      if (perm === 'granted') return true;
      const req = await dirHandle.requestPermission({ mode: 'readwrite' });
      return req === 'granted';
    } catch (e) {
      return false;
    }
  }

  /**
   * List all output JSON files in the output directory and map them by tree name.
   *
   * Supports two filename patterns:
   *   - canonical: `${treeName}.json` (e.g. "DAMIMAS_A21B_0001.json")
   *   - legacy:    `${treeId}__${treeName}.json` (e.g. "20260422-DAMIMAS-001__DAMIMAS_A21B_0001.json")
   *
   * The canonical key for the returned map is the tree_name (not the legacy
   * tree_id) so resume logic is idempotent regardless of when the file was
   * written. Files that don't match either pattern are skipped silently.
   *
   * @returns {Promise<Map<string, FileSystemFileHandle>>}
   */
  async function listOutputFiles() {
    const dirHandle = ProjectConfig.getOutputDirHandle();
    if (!dirHandle) return new Map();
    const ok = await verifyAccess();
    if (!ok) return new Map();

    const map = new Map();
    const sourceLegacy = new Map(); // key -> true if the entry came from a legacy filename
    const reLegacy = /^.+?__(.+)\.json$/i;          // v1 with double-prefix
    const reTreeName = /^([A-Za-z]+_.+?)\.json$/i;  // v2 canonical (variety-prefixed)
    try {
      for await (const [name, handle] of dirHandle.entries()) {
        if (handle.kind !== 'file') continue;
        if (!name.toLowerCase().endsWith('.json')) continue;
        let key = null;
        let isLegacy = false;
        const mLegacy = name.match(reLegacy);
        if (mLegacy) {
          key = mLegacy[1];
          isLegacy = true;
        } else {
          const mNew = name.match(reTreeName);
          if (mNew) key = mNew[1];
        }
        if (!key) continue;
        // Prefer the canonical filename when both exist for the same tree.
        if (!map.has(key) || (sourceLegacy.get(key) && !isLegacy)) {
          map.set(key, handle);
          sourceLegacy.set(key, isLegacy);
        }
      }
    } catch (e) {
      console.warn('[FsOutput] listOutputFiles error:', e);
    }
    return map;
  }

  /**
   * Read and parse a JSON file from a FileSystemFileHandle.
   */
  async function readJSON(fileHandle) {
    const file = await fileHandle.getFile();
    return JSON.parse(await file.text());
  }

  return { saveJSON, saveBatch, saveLabelFile, verifyAccess, listOutputFiles, readJSON };
})();

window.FsOutput = FsOutput;
