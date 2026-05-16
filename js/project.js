'use strict';

/**
 * ProjectConfig - manages output destinations for the annotation session.
 *
 * File names are dataset-driven:
 * - output JSON: {tree_name}.json
 * - corrected labels: original label filename, per side
 *
 * Config lives in memory only and resets each browser session.
 */
const ProjectConfig = (() => {
  let _config = {
    outputDirHandle: null,
    outputDirName: '',
    labelsDirHandle: null,
    labelsDirName: '',
    savedTrees: new Set(),
    savedHandles: new Map(),
  };

  function get() {
    return {
      hasOutputDir: !!_config.outputDirHandle,
      outputDirName: _config.outputDirName,
      hasLabelsDir: !!_config.labelsDirHandle,
      labelsDirName: _config.labelsDirName,
    };
  }

  function getOutputDirHandle() {
    return _config.outputDirHandle;
  }

  function getLabelsDirHandle() {
    return _config.labelsDirHandle;
  }

  async function pickOutputDirectory() {
    if (!window.showDirectoryPicker) return false;
    try {
      const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
      _config.outputDirHandle = handle;
      _config.outputDirName = handle.name;
      return true;
    } catch (e) {
      if (e.name !== 'AbortError') {
        console.warn('[ProjectConfig] pickOutputDirectory error:', e);
      }
      return false;
    }
  }

  async function pickLabelsDirectory() {
    if (!window.showDirectoryPicker) return false;
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

  function markSaved(treeName) {
    _config.savedTrees.add(treeName);
  }

  function isSaved(treeName) {
    return _config.savedTrees.has(treeName);
  }

  function getSavedCount() {
    return _config.savedTrees.size;
  }

  function isFileSystemAccessSupported() {
    return typeof window.showDirectoryPicker === 'function';
  }

  function reset() {
    _config = {
      outputDirHandle: null,
      outputDirName: '',
      labelsDirHandle: null,
      labelsDirName: '',
      savedTrees: new Set(),
      savedHandles: new Map(),
    };
  }

  function setSavedHandle(treeName, handle) {
    _config.savedHandles.set(treeName, handle);
  }

  function getSavedHandle(treeName) {
    return _config.savedHandles.get(treeName) || null;
  }

  function clearSavedHandle(treeName) {
    _config.savedHandles.delete(treeName);
  }

  return {
    get,
    getOutputDirHandle,
    getLabelsDirHandle,
    pickOutputDirectory,
    pickLabelsDirectory,
    clearLabelsDirectory,
    isFileSystemAccessSupported,
    markSaved,
    isSaved,
    getSavedCount,
    setSavedHandle,
    getSavedHandle,
    clearSavedHandle,
    reset,
  };
})();

window.ProjectConfig = ProjectConfig;
