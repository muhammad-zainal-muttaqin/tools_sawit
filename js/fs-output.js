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
   * @param {string} filename  — e.g. "20260416-DAMIMAS-001.json"
   * @param {object} data      — JSON-serializable object
   * @returns {Promise<{ok: boolean, method: string, error?: string}>}
   */
  async function saveJSON(filename, data) {
    const dirHandle = ProjectConfig.getOutputDirHandle();
    const jsonStr = JSON.stringify(data, null, 2);

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
   * Filename pattern emitted by the app is `${treeId}__${treeName}.json`.
   * Files that don't match are skipped silently.
   *
   * @returns {Promise<Map<string, FileSystemFileHandle>>}
   */
  async function listOutputFiles() {
    const dirHandle = ProjectConfig.getOutputDirHandle();
    if (!dirHandle) return new Map();
    const ok = await verifyAccess();
    if (!ok) return new Map();

    const map = new Map();
    // Capture everything after the first "__" up to ".json"
    const re = /^.+?__(.+)\.json$/i;
    try {
      for await (const [name, handle] of dirHandle.entries()) {
        if (handle.kind !== 'file') continue;
        if (!name.toLowerCase().endsWith('.json')) continue;
        const m = name.match(re);
        if (!m) continue;
        map.set(m[1], handle);
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

  return { saveJSON, saveBatch, verifyAccess, listOutputFiles, readJSON };
})();

window.FsOutput = FsOutput;
