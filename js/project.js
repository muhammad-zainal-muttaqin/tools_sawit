'use strict';

/**
 * ProjectConfig — manages project-level configuration for the annotation session.
 *
 * Stores: date, varietas, output directory handle, and provides tree ID generation.
 * Config lives in memory only (not localStorage) — reset each browser session.
 */
const ProjectConfig = (() => {

  let _config = {
    date: _todayStr(),           // YYYY-MM-DD
    varietas: '',                // e.g. "DAMIMAS"
    outputDirHandle: null,       // FileSystemDirectoryHandle for JSON output
    outputDirName: '',           // display name of the output folder
    labelsDirHandle: null,       // FileSystemDirectoryHandle for corrected YOLO .txt labels
    labelsDirName: '',           // display name of the labels output folder
    savedTrees: new Set(),       // set of tree names that have been saved this session
    savedHandles: new Map(),     // treeName → FileSystemFileHandle (for lazy resume)
  };

  // ── Helpers ──────────────────────────────────────────────────────────────

  function _todayStr() {
    const d = new Date();
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  function _dateCompact(dateStr) {
    // "2026-04-16" → "20260416"
    return dateStr.replace(/-/g, '');
  }

  // ── Getters / Setters ────────────────────────────────────────────────────

  function get() {
    return {
      date: _config.date,
      varietas: _config.varietas,
      hasOutputDir: !!_config.outputDirHandle,
      outputDirName: _config.outputDirName,
      hasLabelsDir: !!_config.labelsDirHandle,
      labelsDirName: _config.labelsDirName,
    };
  }

  function setDate(dateStr) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      _config.date = dateStr;
    }
  }

  function setVarietas(v) {
    _config.varietas = (v || '').trim().toUpperCase();
  }

  function getOutputDirHandle() {
    return _config.outputDirHandle;
  }

  function getLabelsDirHandle() {
    return _config.labelsDirHandle;
  }

  /**
   * Try to guess varietas from the first tree name in the dataset.
   * Strategy: take the first segment before an underscore that looks alphabetic.
   * e.g. "DAMIMAS_A21B_0003" → "DAMIMAS"
   */
  function guessVarietas(treeName) {
    if (!treeName) return '';
    const parts = treeName.split('_');
    // Find the first purely-alpha segment (or first segment if none found)
    for (const p of parts) {
      if (/^[A-Za-z]+$/.test(p)) return p.toUpperCase();
    }
    return parts[0].toUpperCase();
  }

  // ── Tree ID ──────────────────────────────────────────────────────────────

  /**
   * Generate a tree ID.
   * Format: YYYYMMDD-VARIETAS-NNN
   * @param {number} number — 1-based tree index in dataset
   * @returns {string}
   */
  function generateTreeId(number) {
    const dateP = _dateCompact(_config.date);
    const varP  = _config.varietas || 'UNKNOWN';
    const numP  = String(number).padStart(3, '0');
    return `${dateP}-${varP}-${numP}`;
  }

  /**
   * Generate tree ID for a specific tree by its dataset index (0-based).
   */
  function treeIdForIndex(index) {
    return generateTreeId(index + 1);
  }

  // ── Output directory ─────────────────────────────────────────────────────

  /**
   * Prompt user to pick an output directory via File System Access API.
   * Returns true if successful, false if cancelled or unsupported.
   */
  async function pickOutputDirectory() {
    if (!window.showDirectoryPicker) {
      return false;
    }
    try {
      const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
      _config.outputDirHandle = handle;
      _config.outputDirName = handle.name;
      return true;
    } catch (e) {
      // User cancelled or permission denied
      if (e.name !== 'AbortError') {
        console.warn('[ProjectConfig] pickOutputDirectory error:', e);
      }
      return false;
    }
  }

  /**
   * Prompt user to pick a directory where corrected YOLO .txt label files will
   * be written (kept separate from the dataset's original labels to avoid
   * destructive overwrites). Optional — leave unset to skip writing .txt.
   */
  async function pickLabelsDirectory() {
    if (!window.showDirectoryPicker) {
      return false;
    }
    try {
      const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
      _config.labelsDirHandle = handle;
      _config.labelsDirName = handle.name;
      return true;
    } catch (e) {
      if (e.name !== 'AbortError') {
        console.warn('[ProjectConfig] pickLabelsDirectory error:', e);
      }
      return false;
    }
  }

  function clearLabelsDirectory() {
    _config.labelsDirHandle = null;
    _config.labelsDirName = '';
  }

  // ── Save tracking ────────────────────────────────────────────────────────

  function markSaved(treeName) {
    _config.savedTrees.add(treeName);
  }

  function isSaved(treeName) {
    return _config.savedTrees.has(treeName);
  }

  function getSavedCount() {
    return _config.savedTrees.size;
  }

  // ── File System Access API support check ─────────────────────────────────

  function isFileSystemAccessSupported() {
    return typeof window.showDirectoryPicker === 'function';
  }

  // ── Reset ────────────────────────────────────────────────────────────────

  function reset() {
    _config = {
      date: _todayStr(),
      varietas: '',
      outputDirHandle: null,
      outputDirName: '',
      labelsDirHandle: null,
      labelsDirName: '',
      savedTrees: new Set(),
      savedHandles: new Map(),
    };
  }

  // ── Saved-output handle registry (for lazy batch resume) ────────────────

  function setSavedHandle(treeName, handle) {
    _config.savedHandles.set(treeName, handle);
    _config.savedTrees.add(treeName);
  }

  function getSavedHandle(treeName) {
    return _config.savedHandles.get(treeName) || null;
  }

  function clearSavedHandle(treeName) {
    _config.savedHandles.delete(treeName);
  }

  return {
    get, setDate, setVarietas,
    getOutputDirHandle, getLabelsDirHandle,
    guessVarietas, generateTreeId, treeIdForIndex,
    pickOutputDirectory, pickLabelsDirectory, clearLabelsDirectory,
    isFileSystemAccessSupported,
    markSaved, isSaved, getSavedCount,
    setSavedHandle, getSavedHandle, clearSavedHandle,
    reset,
  };
})();

window.ProjectConfig = ProjectConfig;
