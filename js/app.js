'use strict';

document.addEventListener('DOMContentLoaded', () => {

  // ── Elements ───────────────────────────────────────────────────────────────
  const inputFolder      = document.getElementById('input-folder');
  const inputSession     = document.getElementById('input-session');
  const btnLoadFolder    = document.getElementById('btn-load-folder');
  const btnLoadFolderHero= document.getElementById('btn-load-folder-hero');
  const btnLoadSession   = document.getElementById('btn-load-session');
  const treeNav          = document.getElementById('tree-nav');
  const treeSelect       = document.getElementById('tree-select');
  const treeSplit        = document.getElementById('tree-split');
  const treeSides        = document.getElementById('tree-sides');
  const treeCounter      = document.getElementById('tree-counter');
  const btnPrevTree      = document.getElementById('btn-prev-tree');
  const btnNextTree      = document.getElementById('btn-next-tree');
  const treeSaveStatus   = document.getElementById('tree-save-status');
  const saveCounter      = document.getElementById('save-counter');
  const btnSaveOutput    = document.getElementById('btn-save-output');

  // Mismatch resolve modal
  const modalMismatch    = document.getElementById('modal-mismatch');
  const mismatchBody     = document.getElementById('mismatch-body');
  const btnMismatchCancel= document.getElementById('btn-mismatch-cancel');
  const btnMismatchConfirm=document.getElementById('btn-mismatch-confirm');

  // Project config modal elements
  const modalProjectCfg  = document.getElementById('modal-project-config');
  const cfgDate          = document.getElementById('cfg-date');
  const cfgVarietas      = document.getElementById('cfg-varietas');
  const cfgOutputDirName = document.getElementById('cfg-output-dir-name');
  const cfgLabelsDirName = document.getElementById('cfg-labels-dir-name');
  const cfgFsWarning     = document.getElementById('cfg-fs-warning');
  const cfgPreviewId     = document.getElementById('cfg-preview-id');
  const btnPickOutputDir = document.getElementById('btn-pick-output-dir');
  const btnPickLabelsDir = document.getElementById('btn-pick-labels-dir');
  const btnClearLabelsDir= document.getElementById('btn-clear-labels-dir');
  const btnCfgConfirm    = document.getElementById('btn-cfg-confirm');
  const toastContainer   = document.getElementById('toast-container');

  const emptyState       = document.getElementById('empty-state');
  const editorArea       = document.getElementById('editor-area');

  const tabs             = document.querySelectorAll('.tab');
  const panels           = document.querySelectorAll('.tab-panel');

  const sidePillsContainer = document.getElementById('side-pills');
  let   sidePills          = []; // rebuilt dynamically per tree
  const editorCanvas     = document.getElementById('editor-canvas');
  const canvasPlaceholder= document.getElementById('canvas-placeholder');
  const bboxCount        = document.getElementById('bbox-count');
  const btnDeleteBbox        = document.getElementById('btn-delete-bbox');
  const btnToggleMagnifier   = document.getElementById('btn-toggle-magnifier');
  const classBtns            = document.querySelectorAll('.btn-class');

  const btnPrevPair      = document.getElementById('btn-prev-pair');
  const btnNextPair      = document.getElementById('btn-next-pair');
  const dedupPairLabel   = document.getElementById('dedup-pair-label');
  const dedupLeftLabel   = document.getElementById('dedup-left-label');
  const dedupRightLabel  = document.getElementById('dedup-right-label');
  const btnRunSuggestions= document.getElementById('btn-run-suggestions');
  const dedupLeftCanvas  = document.getElementById('dedup-left-canvas');
  const dedupRightCanvas = document.getElementById('dedup-right-canvas');
  const dedupSuggestionsEl = document.getElementById('dedup-suggestions');
  const dedupLinksEl     = document.getElementById('dedup-links');
  const btnToggleDedupMagnifier  = document.getElementById('btn-toggle-dedup-magnifier');
  const btnToggleDedupSuggestions= document.getElementById('btn-toggle-dedup-suggestions');

  const fileInfo         = document.getElementById('file-info');

  const btnHitung        = document.getElementById('btn-hitung');
  const exportButtons    = document.getElementById('export-buttons');
  const btnExportYolo    = document.getElementById('btn-export-yolo');
  const btnExportJSON    = document.getElementById('btn-export-json');
  const btnExportCSV     = document.getElementById('btn-export-csv');
  const btnExportIdentity = document.getElementById('btn-export-identity');
  const resultsContainer = document.getElementById('results-container');

  // ── State ──────────────────────────────────────────────────────────────────
  let _currentSide = 0;
  let _currentPair = 0;
  let _editor = null;
  let _dedupInitialized = false;
  let _lastResult = null;
  let _pendingTrees = null;  // trees waiting for config modal confirmation
  let _autoSaving = false;   // prevent re-entrant auto-save

  // ── Dataset loading ────────────────────────────────────────────────────────

  function _onFolderLoad(e) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const trees = DatasetManager.load(files);
    if (trees.length === 0) {
      alert('Tidak ada tree yang ditemukan. Pastikan folder berisi file gambar dengan format NAMA_1.jpg s/d NAMA_N.jpg (N = jumlah sisi, umumnya 4 atau 8)');
      return;
    }
    // Debug: summary of detected side counts across trees
    const sideHistogram = {};
    trees.forEach(t => {
      const n = (t.sides || []).length;
      sideHistogram[n] = (sideHistogram[n] || 0) + 1;
    });
    console.log('[Dataset] Loaded', trees.length, 'tree(s). Sisi histogram:', sideHistogram);

    // Store trees and show config modal before proceeding
    _pendingTrees = trees;
    _showProjectConfigModal(trees);
    inputFolder.value = '';
  }

  // ── Project Config Modal ─────────────────────────────────────────────────

  function _showProjectConfigModal(trees) {
    ProjectConfig.reset();

    // Auto-fill date
    cfgDate.value = ProjectConfig.get().date;

    // Auto-detect varietas from first tree name
    const guessed = trees.length > 0 ? ProjectConfig.guessVarietas(trees[0].name) : '';
    cfgVarietas.value = guessed;
    ProjectConfig.setVarietas(guessed);

    // Preview tree ID
    _updateCfgPreview();

    // FS API warning
    if (!ProjectConfig.isFileSystemAccessSupported()) {
      cfgFsWarning.style.display = '';
      btnPickOutputDir.disabled = true;
      if (btnPickLabelsDir) btnPickLabelsDir.disabled = true;
    } else {
      cfgFsWarning.style.display = 'none';
      btnPickOutputDir.disabled = false;
      if (btnPickLabelsDir) btnPickLabelsDir.disabled = false;
    }

    cfgOutputDirName.textContent = 'Belum dipilih';
    if (cfgLabelsDirName) cfgLabelsDirName.textContent = 'Belum dipilih';
    modalProjectCfg.classList.remove('hidden');
  }

  function _updateCfgPreview() {
    ProjectConfig.setDate(cfgDate.value);
    ProjectConfig.setVarietas(cfgVarietas.value);
    cfgPreviewId.textContent = ProjectConfig.treeIdForIndex(0);
  }

  cfgDate.addEventListener('input', _updateCfgPreview);
  cfgVarietas.addEventListener('input', _updateCfgPreview);

  btnPickOutputDir.addEventListener('click', async () => {
    const ok = await ProjectConfig.pickOutputDirectory();
    if (ok) {
      cfgOutputDirName.textContent = ProjectConfig.get().outputDirName;
    }
  });

  if (btnPickLabelsDir) {
    btnPickLabelsDir.addEventListener('click', async () => {
      const ok = await ProjectConfig.pickLabelsDirectory();
      if (ok && cfgLabelsDirName) {
        cfgLabelsDirName.textContent = ProjectConfig.get().labelsDirName;
      }
    });
  }
  if (btnClearLabelsDir) {
    btnClearLabelsDir.addEventListener('click', () => {
      ProjectConfig.clearLabelsDirectory();
      if (cfgLabelsDirName) cfgLabelsDirName.textContent = 'Belum dipilih';
    });
  }

  btnCfgConfirm.addEventListener('click', async () => {
    // Apply config
    ProjectConfig.setDate(cfgDate.value);
    ProjectConfig.setVarietas(cfgVarietas.value);
    modalProjectCfg.classList.add('hidden');

    if (!_pendingTrees) return;

    // Discover prior saves before rendering the dropdown so ✓ marks appear immediately.
    const matched = await _scanOutputDirectory();
    if (matched > 0) _showToast(`Memulihkan ${matched} pohon dari folder output`, 'success');

    _populateTreeSelect(_pendingTrees);
    treeNav.classList.remove('hidden');
    _updateSaveCounter();
    _loadCurrentTree();
    _pendingTrees = null;
  });

  function _populateTreeSelect(trees) {
    treeSelect.innerHTML = '';
    trees.forEach((t, i) => {
      const opt = document.createElement('option');
      opt.value = i;
      const saved = ProjectConfig.isSaved(t.name);
      opt.textContent = (saved ? '\u2713 ' : '   ') + t.name;
      if (saved) opt.classList.add('option-saved');
      treeSelect.appendChild(opt);
    });
    treeSelect.value = DatasetManager.getIndex();
    _updateTreeCounter();
  }

  function _refreshTreeSelectOption(treeIdx) {
    const opt = treeSelect.options[treeIdx];
    if (!opt) return;
    const t = DatasetManager.getTrees()[treeIdx];
    if (!t) return;
    const saved = ProjectConfig.isSaved(t.name);
    opt.textContent = (saved ? '\u2713 ' : '   ') + t.name;
    opt.classList.toggle('option-saved', saved);
  }

  function _updateTreeCounter() {
    const idx = DatasetManager.getIndex();
    const total = DatasetManager.count();
    treeCounter.textContent = `${idx + 1} / ${total}`;
    treeSelect.value = idx;

    const tree = DatasetManager.getTree();
    if (treeSplit) treeSplit.textContent = tree ? (tree.split || 'unknown') : '';
    if (treeSides) {
      const nSides = tree && tree.sides ? tree.sides.length : 0;
      treeSides.textContent = nSides ? `${nSides} sisi` : '';
    }
  }

  async function _loadCurrentTree() {
    const tree = DatasetManager.getTree();
    if (!tree) return;
    emptyState.classList.add('hidden');
    editorArea.classList.remove('hidden');

    await ActiveSession.loadTree(tree);

    // Assign tree ID from ProjectConfig
    const treeId = ProjectConfig.treeIdForIndex(DatasetManager.getIndex());
    ActiveSession.setTreeId(treeId);

    // Lazy resume from output JSON if we previously saved this tree.
    let resumed = false;
    const savedHandle = ProjectConfig.getSavedHandle(tree.name);
    if (savedHandle) {
      try {
        const outputJson = await FsOutput.readJSON(savedHandle);
        if (outputJson && outputJson.images && outputJson.bunches) {
          const sessionJson = OutputSchema.toSessionJSON(outputJson);
          await ActiveSession.fromJSON(sessionJson, tree);
          ActiveSession.setTreeId(treeId);
          resumed = true;
        }
      } catch (e) {
        console.warn('[Resume] failed for', tree.name, e);
      }
    }

    console.log('[Tree]', tree.name, '→ ID:', treeId, '→', tree.sides.length, 'sisi, pairs:', (window.ADJACENT_PAIRS || []).length, resumed ? '(resumed)' : '');
    _lastResult = resumed ? Results.compute(ActiveSession.get()) : null;
    if (resumed) {
      Results.render(_lastResult, resultsContainer);
      exportButtons.classList.remove('hidden');
    } else {
      exportButtons.classList.add('hidden');
      resultsContainer.innerHTML = '';
    }

    _currentSide = 0;
    _currentPair = 0;
    _dedupInitialized = false;

    _rebuildSidePills();
    _activateSidePill(0);
    _initEditor(0);
    _updateTreeCounter();
    _updateSaveStatus();

    // Refresh dedup if that tab is visible
    if (_activeTab() === 'dedup') _initDedup();
    if (_activeTab() === 'hasil' && !resumed) { resultsContainer.innerHTML = ''; }
  }

  // ── Tree navigation (with auto-save) ────────────────────────────────────

  async function _navigateTree(action) {
    // Auto-save current tree before navigating
    await _autoSaveCurrentTree();
    let ok = false;
    if (action === 'prev') ok = DatasetManager.prev();
    else if (action === 'next') ok = DatasetManager.next();
    else if (typeof action === 'number') ok = DatasetManager.goTo(action);
    if (ok) _loadCurrentTree();
  }

  btnPrevTree.addEventListener('click', () => _navigateTree('prev'));
  btnNextTree.addEventListener('click', () => _navigateTree('next'));
  treeSelect.addEventListener('change', () => {
    const idx = parseInt(treeSelect.value, 10);
    _navigateTree(idx);
  });

  // ── Output folder scan (batch resume discovery) ─────────────────────────

  /**
   * Scan the chosen output directory for previously-saved tree JSON files
   * and register their handles with ProjectConfig for lazy resume.
   * Returns the number of trees matched.
   */
  async function _scanOutputDirectory() {
    if (!ProjectConfig.getOutputDirHandle()) return 0;
    let map;
    try { map = await FsOutput.listOutputFiles(); }
    catch (e) { console.warn('[Resume] scan failed:', e); return 0; }
    let matched = 0;
    for (const [treeName, handle] of map) {
      if (DatasetManager.findByName(treeName) === -1) continue;
      ProjectConfig.setSavedHandle(treeName, handle);
      matched++;
    }
    console.log('[Resume] discovered', matched, 'saved tree(s) in output folder');
    return matched;
  }

  // ── Auto-save & Output ──────────────────────────────────────────────────

  /**
   * Auto-save the current tree's output JSON if it has been worked on.
   * Called before navigating away from a tree.
   */
  async function _autoSaveCurrentTree() {
    if (_autoSaving) return;
    const session = ActiveSession.get();
    if (!session) return;

    // Only auto-save if there are confirmed links OR the session is dirty
    const hasWork = session.confirmedLinks.length > 0 || ActiveSession.isDirty();
    if (!hasWork) return;

    // Already saved this tree AND no new edits since? Skip.
    if (ProjectConfig.isSaved(session.treeName) && !ActiveSession.isDirty()) return;

    // Force user to resolve class mismatches before persisting. If they cancel,
    // leave the session dirty — the prompt will return on the next save attempt.
    const ok = await _resolveMismatchesIfAny();
    if (!ok) {
      _showToast('Auto-simpan ditunda: resolusi kelas belum selesai.', 'info');
      return;
    }

    _autoSaving = true;
    try {
      await _saveCurrentTreeOutput();
    } finally {
      _autoSaving = false;
    }
  }

  /**
   * Compute results and save the output JSON for the current tree.
   */
  async function _saveCurrentTreeOutput(opts = {}) {
    const recompute = opts.recompute !== false;
    const allowDirty = !!opts.allowDirty;
    const session = ActiveSession.get();
    if (!session) return;

    if (!recompute && !allowDirty && _lastResult && ActiveSession.isDirty()) {
      _showToast('Ada perubahan baru. Klik "Hitung (+Auto Simpan)" dulu agar output sinkron.', 'info');
      return;
    }

    // Compute results (union-find clustering) when needed
    if (recompute || !_lastResult) {
      _lastResult = Results.compute(session);
    }
    const result = _lastResult;

    // Generate output JSON
    const treeId = ActiveSession.getTreeId() || ProjectConfig.treeIdForIndex(DatasetManager.getIndex());
    const projectCfg = ProjectConfig.get();
    const datasetTree = DatasetManager.getTree();
    const outputJson = OutputSchema.generate(session, result, treeId, projectCfg, datasetTree);

    // Save to output folder or download
    const filename = `${treeId}__${session.treeName}.json`;
    const saveResult = await FsOutput.saveJSON(filename, outputJson);

    if (saveResult.ok) {
      if (ActiveSession.markClean) ActiveSession.markClean();
      ProjectConfig.markSaved(session.treeName);
      _updateSaveStatus();
      _updateSaveCounter();
      _refreshTreeSelectOption(DatasetManager.getIndex());
      // Cache the freshly-written file handle so next refresh can lazy-resume.
      if (saveResult.method === 'filesystem') {
        try {
          const dirHandle = ProjectConfig.getOutputDirHandle();
          if (dirHandle) {
            const fh = await dirHandle.getFileHandle(filename);
            ProjectConfig.setSavedHandle(session.treeName, fh);
          }
        } catch (e) { /* non-fatal */ }
      }
      const method = saveResult.method === 'filesystem' ? 'folder output' : 'download';
      _showToast(`Tersimpan: ${filename} (${method})`, 'success');
      console.log('[Output]', filename, '→', saveResult.method);

      // Write corrected YOLO .txt labels into the labels folder if configured.
      await _saveCorrectedLabels(session);
    } else {
      _showToast(`Gagal menyimpan: ${saveResult.error}`, 'error');
      console.error('[Output] Save failed:', saveResult.error);
    }
  }

  /**
   * Write one YOLO-format .txt per side into the configured labels directory
   * (nested under the dataset split). No-ops when no labels directory is set.
   */
  async function _saveCorrectedLabels(session) {
    if (!session) return;
    if (!ProjectConfig.getLabelsDirHandle()) return;  // picker left blank → skip
    if (!FsOutput.saveLabelFile) return;

    let saved = 0;
    let failed = 0;
    for (const side of session.sides) {
      if (!side.imageWidth || !side.imageHeight) continue;
      const filename = `${session.treeName}_${side.sideIndex + 1}.txt`;
      const content = toYoloFormat(side.bboxes, side.imageWidth, side.imageHeight);
      const res = await FsOutput.saveLabelFile(filename, content, session.split);
      if (res.ok) saved++;
      else { failed++; console.warn('[Labels] failed:', filename, res.error); }
    }
    if (saved > 0) {
      _showToast(`Label .txt tersimpan: ${saved} sisi ke folder label`, 'success');
    }
    if (failed > 0) {
      _showToast(`Gagal menulis ${failed} label .txt (cek console).`, 'error');
    }
  }

  // Manual save button
  btnSaveOutput.addEventListener('click', async () => {
    const ok = await _resolveMismatchesIfAny();
    if (!ok) {
      _showToast('Simpan dibatalkan: resolusi kelas belum selesai.', 'info');
      return;
    }
    btnSaveOutput.disabled = true;
    btnSaveOutput.textContent = 'Menyimpan...';
    try {
      await _saveCurrentTreeOutput({ recompute: false });
      // Also render results in the Hasil tab if visible
      if (_lastResult) {
        Results.render(_lastResult, resultsContainer);
        exportButtons.classList.remove('hidden');
      }
    } finally {
      btnSaveOutput.disabled = false;
      btnSaveOutput.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Simpan Ulang Output`;
    }
  });

  // ── Save status indicators ───────────────────────────────────────────────

  function _updateSaveStatus() {
    if (!treeSaveStatus) return;
    const session = ActiveSession.get();
    if (!session) {
      treeSaveStatus.classList.add('hidden');
      return;
    }
    const saved = ProjectConfig.isSaved(session.treeName);
    treeSaveStatus.classList.remove('hidden');
    treeSaveStatus.classList.toggle('save-status--saved', saved);
    treeSaveStatus.classList.toggle('save-status--unsaved', !saved);
    treeSaveStatus.textContent = saved ? 'Tersimpan' : 'Belum disimpan';
    treeSaveStatus.title = saved
      ? `Output ${ActiveSession.getTreeId()}.json telah disimpan`
      : 'Belum disimpan — akan auto-save saat pindah pohon';
  }

  function _updateSaveCounter() {
    if (!saveCounter) return;
    const total = DatasetManager.count();
    const saved = ProjectConfig.getSavedCount();
    if (saved > 0) {
      saveCounter.classList.remove('hidden');
      saveCounter.textContent = `${saved}/${total} tersimpan`;
    } else {
      saveCounter.classList.add('hidden');
    }
  }

  // ── Toast notifications ──────────────────────────────────────────────────

  function _showToast(message, type = 'info') {
    if (!toastContainer) return;
    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;
    toast.textContent = message;
    toastContainer.appendChild(toast);

    // Trigger enter animation
    requestAnimationFrame(() => toast.classList.add('toast--visible'));

    // Auto-remove after 4s
    setTimeout(() => {
      toast.classList.remove('toast--visible');
      toast.addEventListener('transitionend', () => toast.remove(), { once: true });
      // Fallback removal if transition doesn't fire
      setTimeout(() => toast.remove(), 500);
    }, 4000);
  }

  // ── Folder + session inputs ────────────────────────────────────────────────

  inputFolder.addEventListener('change', _onFolderLoad);
  btnLoadFolder.addEventListener('click', () => inputFolder.click());
  btnLoadFolderHero.addEventListener('click', () => inputFolder.click());
  btnLoadSession.addEventListener('click', () => inputSession.click());

  inputSession.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      if (DatasetManager.count() === 0) {
        alert('Dataset belum dimuat. Klik "Muat Folder" dulu, baru "Muat Sesi".');
        return;
      }
      const json = JSON.parse(await file.text());

      // Auto-detect format. Output JSON (from "Simpan Output") has `images` +
      // `bunches`; native session JSON has `sides` + `confirmedLinks`.
      let sessionJson = json;
      const isOutputFormat = json && json.images && json.bunches && !json.sides;
      if (isOutputFormat) {
        sessionJson = OutputSchema.toSessionJSON(json);
        if (json.metadata) {
          if (json.metadata.date) ProjectConfig.setDate(json.metadata.date);
          if (json.metadata.varietas) ProjectConfig.setVarietas(json.metadata.varietas);
        }
        // Already persisted to disk → don't auto-save again on next navigate.
        ProjectConfig.markSaved(json.tree_name);
      }

      const treeIdx = DatasetManager.findByName(sessionJson.treeName);
      if (treeIdx === -1) {
        alert(`Pohon "${sessionJson.treeName}" tidak ditemukan di dataset yang dimuat. Muat folder dataset yang berisi pohon tersebut dulu.`);
        return;
      }
      DatasetManager.goTo(treeIdx);
      _updateTreeCounter();
      const tree = DatasetManager.getTree();
      emptyState.classList.add('hidden');
      editorArea.classList.remove('hidden');
      await ActiveSession.fromJSON(sessionJson, tree);

      // Re-assign treeId from ProjectConfig so save status / output filename stay consistent.
      const treeId = ProjectConfig.treeIdForIndex(DatasetManager.getIndex());
      ActiveSession.setTreeId(treeId);

      _currentSide = 0;
      _currentPair = 0;
      _dedupInitialized = false;
      _rebuildSidePills();
      _activateSidePill(0);
      _initEditor(0);
      _updateSaveStatus();
      _updateSaveCounter();
      // Auto-compute results so the hasil tab is populated immediately
      _lastResult = Results.compute(ActiveSession.get());
      Results.render(_lastResult, resultsContainer);
      exportButtons.classList.remove('hidden');
    } catch (err) {
      alert('Gagal memuat sesi: ' + err.message);
    }
    inputSession.value = '';
  });

  // ── Tabs ───────────────────────────────────────────────────────────────────

  function _activeTab() {
    const active = document.querySelector('.tab.active');
    return active ? active.dataset.tab : 'koreksi';
  }

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      panels.forEach(p => p.classList.add('hidden'));
      tab.classList.add('active');
      const panelId = 'panel-' + tab.dataset.tab;
      document.getElementById(panelId).classList.remove('hidden');

      if (tab.dataset.tab === 'dedup') _initDedup();
      if (tab.dataset.tab === 'koreksi') {
        // Re-init editor to restore focus/canvas size
        if (_editor) { _editor.destroy(); _editor = null; }
        _initEditor(_currentSide);
      }
    });
  });

  // ── Side pills + Editor ────────────────────────────────────────────────────

  function _activateSidePill(sideIndex) {
    sidePills.forEach(p => p.classList.toggle('active', parseInt(p.dataset.side) === sideIndex));
    _currentSide = sideIndex;
  }

  function _rebuildSidePills() {
    if (!sidePillsContainer) return;
    const session = ActiveSession.get();
    const labels = session ? session.sides.map(s => s.label) : (window.TREE_SIDE_LABELS || []);
    sidePillsContainer.innerHTML = '';
    labels.forEach((label, i) => {
      const btn = document.createElement('button');
      btn.className = 'side-pill' + (i === _currentSide ? ' active' : '');
      btn.dataset.side = String(i);
      btn.textContent = label;
      sidePillsContainer.appendChild(btn);
    });
    sidePills = Array.from(sidePillsContainer.querySelectorAll('.side-pill'));
  }

  // Event delegation — survives pill rebuilds
  if (sidePillsContainer) {
    sidePillsContainer.addEventListener('click', (e) => {
      const pill = e.target.closest('.side-pill');
      if (!pill) return;
      const si = parseInt(pill.dataset.side);
      if (Number.isNaN(si)) return;
      _activateSidePill(si);
      _initEditor(si);
    });
  }

  function _updateFileInfo(sideIndex) {
    if (!fileInfo) return;
    const session = ActiveSession.get();
    if (!session) { fileInfo.textContent = ''; return; }
    fileInfo.textContent = `${session.treeName}_${sideIndex + 1}.jpg · ${session.split}`;
  }

  function _initEditor(sideIndex) {
    if (_editor) { _editor.destroy(); _editor = null; }
    const session = ActiveSession.get();
    if (!session) return;
    const side = session.sides[sideIndex];
    _updateFileInfo(sideIndex);
    if (!side.imageUrl) {
      canvasPlaceholder.classList.remove('hidden');
      return;
    }
    canvasPlaceholder.classList.add('hidden');
    _editor = BBoxEditor.create(
      editorCanvas,
      side.imageUrl,
      side.bboxes,
      (updatedBboxes) => {
        // BBoxEditor owns the bbox array directly; sync back to session state
        ActiveSession.get().sides[sideIndex].bboxes = updatedBboxes;
        ActiveSession.get().dirty = true;
        _updateBboxCount(sideIndex);
      },
      (bboxId /*, classId */) => {
        // Propagate class change to every other bbox in the same confirmed cluster
        // so paired bboxes on sibling sides stay class-consistent. The editor
        // already updated the active side's bbox in place; we only need to
        // mutate sibling sides, which happens inside ActiveSession.
        ActiveSession.propagateClassFromBox(sideIndex, bboxId);
      }
    );
    _updateBboxCount(sideIndex);
  }

  function _updateBboxCount(sideIndex) {
    const session = ActiveSession.get();
    if (!session) return;
    const count = session.sides[sideIndex].bboxes.length;
    bboxCount.textContent = `${count} bbox`;
  }

  // Class buttons
  classBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      // Dispatch keydown event to editor canvas to change class
      const classKey = btn.dataset.class;
      editorCanvas.dispatchEvent(new KeyboardEvent('keydown', { key: classKey, bubbles: true }));
      editorCanvas.focus();
    });
  });

  // Delete button
  btnDeleteBbox.addEventListener('click', () => {
    editorCanvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
    editorCanvas.focus();
  });

  // Magnifier toggle
  function _updateMagnifierBtn() {
    const on = BBoxEditor.getMagnifierEnabled();
    btnToggleMagnifier.classList.toggle('active', on);
    btnToggleMagnifier.title = on ? 'Matikan Magnifier [M]' : 'Kaca pembesar [M]';
  }

  btnToggleMagnifier.addEventListener('click', () => {
    BBoxEditor.setMagnifierGlobal(!BBoxEditor.getMagnifierEnabled());
    _updateMagnifierBtn();
  });

  // ── Dedup ──────────────────────────────────────────────────────────────────

  function _initDedup() {
    if (!ActiveSession.get()) return;
    DedupUI.init(dedupLeftCanvas, dedupRightCanvas, dedupSuggestionsEl, dedupLinksEl);
    _updateDedupMagnifierBtn();
    _updateDedupSuggestionsBtn();
    _dedupInitialized = true;
    _updateDedupPairUI();
    DedupUI.showPair(_currentPair);
  }

  function _updateDedupMagnifierBtn() {
    if (!btnToggleDedupMagnifier || !DedupUI.getMagnifierEnabled) return;
    const on = DedupUI.getMagnifierEnabled();
    btnToggleDedupMagnifier.classList.toggle('active', on);
    btnToggleDedupMagnifier.title = on ? 'Matikan Magnifier [M]' : 'Kaca pembesar [M]';
  }

  function _updateDedupSuggestionsBtn() {
    if (!btnToggleDedupSuggestions || !DedupUI.getSuggestionsVisible) return;
    const on = DedupUI.getSuggestionsVisible();
    btnToggleDedupSuggestions.classList.toggle('active', on);
    btnToggleDedupSuggestions.title = on
      ? 'Sembunyikan saran otomatis [S]'
      : 'Tampilkan saran otomatis [S]';
  }

  function _updateDedupPairUI() {
    const pairs = window.ADJACENT_PAIRS || [];
    if (!pairs.length || !pairs[_currentPair]) return;
    const [iA, iB] = pairs[_currentPair];
    const labels = window.TREE_SIDE_LABELS || [];
    const lA = labels[iA] || `Sisi ${iA + 1}`;
    const lB = labels[iB] || `Sisi ${iB + 1}`;
    dedupPairLabel.textContent = `${lB} ↔ ${lA}`;
    // Display: left=sideB, right=sideA (shared edges face center between canvases)
    dedupLeftLabel.innerHTML = `
      <span class="dedup-label-main">${lB}</span>
      <span class="edge-arrow edge-arrow--right">tepi kanan →</span>
    `;
    dedupRightLabel.innerHTML = `
      <span class="dedup-label-main">${lA}</span>
      <span class="edge-arrow edge-arrow--left">← tepi kiri</span>
    `;
  }

  btnPrevPair.addEventListener('click', () => {
    const nPairs = (window.ADJACENT_PAIRS || []).length || 4;
    _currentPair = (_currentPair + 1) % nPairs;
    _updateDedupPairUI();
    DedupUI.showPair(_currentPair, 'left');
  });
  btnNextPair.addEventListener('click', () => {
    const nPairs = (window.ADJACENT_PAIRS || []).length || 4;
    _currentPair = (_currentPair + nPairs - 1) % nPairs;
    _updateDedupPairUI();
    DedupUI.showPair(_currentPair, 'right');
  });

  btnRunSuggestions.addEventListener('click', () => {
    if (!ActiveSession.get()) return;
    ActiveSession.runSuggestions();
    DedupUI.refresh();
  });

  if (btnToggleDedupMagnifier) {
    btnToggleDedupMagnifier.addEventListener('click', () => {
      DedupUI.setMagnifierEnabled(!DedupUI.getMagnifierEnabled());
      _updateDedupMagnifierBtn();
    });
  }

  if (btnToggleDedupSuggestions) {
    btnToggleDedupSuggestions.addEventListener('click', () => {
      DedupUI.setSuggestionsVisible(!DedupUI.getSuggestionsVisible());
      _updateDedupSuggestionsBtn();
    });
  }

  // ── Dedup edit toolbar (change class / delete selected bbox) ───────────────

  const dedupEditToolbar = document.getElementById('dedup-edit-toolbar');
  const dedupEditLabel   = document.getElementById('dedup-edit-label');
  const btnDedupDelete   = document.getElementById('btn-dedup-delete');

  function _refreshDedupEditToolbar() {
    if (!dedupEditToolbar) return;
    const info = DedupUI.getSelectedInfo && DedupUI.getSelectedInfo();
    if (info) {
      dedupEditToolbar.classList.add('active');
      dedupEditLabel.textContent = `${info.sideLabel} · ${info.className}`;
    } else {
      dedupEditToolbar.classList.remove('active');
      dedupEditLabel.textContent = 'Pilih bbox';
    }
  }

  // Class buttons in dedup edit toolbar
  document.querySelectorAll('[data-dedup-class]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (DedupUI.changeSelectedClass(btn.dataset.dedupClass)) {
        _refreshDedupEditToolbar();
      }
    });
  });

  if (btnDedupDelete) {
    btnDedupDelete.addEventListener('click', () => {
      if (DedupUI.deleteSelected()) _refreshDedupEditToolbar();
    });
  }

  // Poll for selection changes to keep toolbar label in sync
  // (DedupUI drives selection internally via clicks/drawings; a lightweight
  //  interval avoids coupling it to app.js via callbacks.)
  setInterval(() => {
    if (_activeTab() === 'dedup') _refreshDedupEditToolbar();
  }, 250);

  // Collapsible panels toggle
  document.getElementById('btn-toggle-panels').addEventListener('click', () => {
    const panels = document.getElementById('dedup-panels-container');
    const btn = document.getElementById('btn-toggle-panels');
    panels.classList.toggle('collapsed');
    btn.innerHTML = panels.classList.contains('collapsed') ? '&#9654; Saran &amp; Link' : '&#9660; Saran &amp; Link';
  });

  // ── Mismatch resolve modal ──────────────────────────────────────────────

  let _mismatchResolver = null; // Promise resolver for the currently-open modal

  /**
   * Show the mismatch-resolve modal for any class-inconsistent cluster in the
   * active session. Returns a Promise that resolves to `true` once the user has
   * picked a final class for every mismatch and clicked Apply, or `false` if
   * they cancelled. Resolves immediately to `true` when there are no mismatches.
   */
  function _resolveMismatchesIfAny() {
    return new Promise((resolve) => {
      const mismatches = ActiveSession.getMismatchedClusters();
      if (!mismatches || mismatches.length === 0) { resolve(true); return; }

      // Pre-seed each row with the majority-vote classId.
      const picks = mismatches.map(m => m.majorityClassId);

      mismatchBody.innerHTML = '';
      const list = document.createElement('div');
      list.className = 'mismatch-list';

      mismatches.forEach((mm, i) => {
        const item = document.createElement('div');
        item.className = 'mismatch-item';

        const head = document.createElement('div');
        head.className = 'mismatch-item__head';
        const title = document.createElement('span');
        title.className = 'mismatch-item__title';
        title.textContent = `Tandan #${i + 1}`;
        head.appendChild(title);
        item.appendChild(head);

        const members = document.createElement('div');
        members.className = 'mismatch-item__members';
        members.textContent = mm.members.map(m => {
          const label = (window.TREE_SIDE_LABELS || [])[m.sideIndex] || `Sisi ${m.sideIndex + 1}`;
          return `${label}: ${m.className}`;
        }).join('  ·  ');
        item.appendChild(members);

        const choices = document.createElement('div');
        choices.className = 'mismatch-item__choices';
        // Offer every class observed in this cluster as a choice.
        const classIds = mm.classIds.slice().sort((a, b) => a - b);
        classIds.forEach(cid => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'mismatch-item__choice' + (cid === picks[i] ? ' active' : '');
          btn.textContent = CLASS_MAP[cid] || ('C' + cid);
          btn.dataset.classId = String(cid);
          btn.addEventListener('click', () => {
            picks[i] = cid;
            choices.querySelectorAll('.mismatch-item__choice').forEach(el => {
              el.classList.toggle('active', Number(el.dataset.classId) === cid);
            });
          });
          choices.appendChild(btn);
        });
        item.appendChild(choices);

        list.appendChild(item);
      });

      mismatchBody.appendChild(list);
      modalMismatch.classList.remove('hidden');

      _mismatchResolver = (apply) => {
        if (apply) {
          mismatches.forEach((mm, i) => {
            const targetClassId = picks[i];
            if (!Number.isInteger(targetClassId)) return;
            // Find any member whose class already matches target, otherwise use the first.
            const anchor = mm.members.find(m => m.classId === targetClassId) || mm.members[0];
            ActiveSession.setBboxClass(anchor.sideIndex, anchor.bboxId, targetClassId);
          });
        }
        modalMismatch.classList.add('hidden');
        mismatchBody.innerHTML = '';
        _mismatchResolver = null;
        resolve(!!apply);
      };
    });
  }

  btnMismatchCancel.addEventListener('click', () => {
    if (_mismatchResolver) _mismatchResolver(false);
  });
  btnMismatchConfirm.addEventListener('click', () => {
    if (_mismatchResolver) _mismatchResolver(true);
  });

  // ── Hasil ──────────────────────────────────────────────────────────────────

  btnHitung.addEventListener('click', async () => {
    const session = ActiveSession.get();
    if (!session) return;

    // Block Hitung until all class mismatches are resolved.
    const ok = await _resolveMismatchesIfAny();
    if (!ok) {
      _showToast('Hitung dibatalkan: resolusi kelas belum selesai.', 'info');
      return;
    }

    _lastResult = Results.compute(session);
    Results.render(_lastResult, resultsContainer);
    exportButtons.classList.remove('hidden');

    // Also auto-save output
    await _saveCurrentTreeOutput({ recompute: false, allowDirty: true });
  });

  btnExportYolo.addEventListener('click', () => {
    const session = ActiveSession.get();
    if (!session) return;
    // Use mismatch-aware export when results are computed
    if (_lastResult) Results.exportYoloWithMismatch(session, _lastResult);
    else Results.exportYolo(session);
  });

  btnExportJSON.addEventListener('click', () => {
    const session = ActiveSession.get();
    if (session) Results.exportJSON(session, _lastResult);
  });

  btnExportCSV.addEventListener('click', () => {
    const session = ActiveSession.get();
    if (session) Results.exportCSV(session, _lastResult);
  });

  btnExportIdentity.addEventListener('click', () => {
    const session = ActiveSession.get();
    if (session && _lastResult) Results.exportIdentityJSON(session, _lastResult);
  });

  // ── Global keyboard shortcuts ──────────────────────────────────────────────

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    const tab = _activeTab();

    // Dedup tab: arrow keys always navigate pairs, even if a form control has focus
    if (tab === 'dedup' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      if (e.target.closest('input, select, textarea')) e.target.blur();
      const nSides = ActiveSession.get() ? ActiveSession.get().sides.length : 4;
      const nPairs = (window.ADJACENT_PAIRS || []).length || nSides;
      if (e.key === 'ArrowLeft') {
        _currentPair = (_currentPair + 1) % nPairs;
        _updateDedupPairUI(); DedupUI.showPair(_currentPair, 'left');
      } else {
        _currentPair = (_currentPair + nPairs - 1) % nPairs;
        _updateDedupPairUI(); DedupUI.showPair(_currentPair, 'right');
      }
      e.preventDefault();
      return;
    }

    // Skip when typing in form controls
    if (e.target.closest('input, select, textarea')) return;

    // Magnifier toggle — works even when editor canvas has focus
    if (e.key === 'm' || e.key === 'M') {
      if (tab === 'koreksi') {
        BBoxEditor.setMagnifierGlobal(!BBoxEditor.getMagnifierEnabled());
        _updateMagnifierBtn();
        e.preventDefault();
        return;
      }
      if (tab === 'dedup') {
        DedupUI.setMagnifierEnabled(!DedupUI.getMagnifierEnabled());
        _updateDedupMagnifierBtn();
        e.preventDefault();
        return;
      }
    }

    // Suggestions visibility toggle (dedup tab only)
    if ((e.key === 's' || e.key === 'S') && tab === 'dedup') {
      DedupUI.setSuggestionsVisible(!DedupUI.getSuggestionsVisible());
      _updateDedupSuggestionsBtn();
      e.preventDefault();
      return;
    }

    // Skip remaining shortcuts when canvas has focus (bbox editor handles its own keys)
    if (e.target === editorCanvas) return;

    switch (e.key) {
      case '[':
        if (DatasetManager.count() > 0) { _navigateTree('prev'); }
        e.preventDefault(); break;
      case ']':
        if (DatasetManager.count() > 0) { _navigateTree('next'); }
        e.preventDefault(); break;
    }

    const nSides = ActiveSession.get() ? ActiveSession.get().sides.length : 4;

    if (tab === 'koreksi') {
      switch (e.key) {
        case 'q': case 'Q': {
          const si = (_currentSide + nSides - 1) % nSides;
          _activateSidePill(si); _initEditor(si);
          e.preventDefault(); break;
        }
        case 'e': case 'E': {
          const si = (_currentSide + 1) % nSides;
          _activateSidePill(si); _initEditor(si);
          e.preventDefault(); break;
        }
      }
    }

    if (tab === 'dedup') {
      switch (e.key) {
        case 'r': case 'R':
          if (!ActiveSession.get()) break;
          ActiveSession.runSuggestions(); DedupUI.refresh();
          e.preventDefault(); break;
        case '1': case '2': case '3': case '4':
          if (DedupUI.changeSelectedClass(e.key)) {
            _refreshDedupEditToolbar();
            e.preventDefault();
          }
          break;
        case 'Delete': case 'Backspace':
          if (DedupUI.deleteSelected()) {
            _refreshDedupEditToolbar();
            e.preventDefault();
          }
          break;
      }
    }
  });

});
