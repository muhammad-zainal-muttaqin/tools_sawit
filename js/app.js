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
  const treeCounter      = document.getElementById('tree-counter');
  const btnPrevTree      = document.getElementById('btn-prev-tree');
  const btnNextTree      = document.getElementById('btn-next-tree');

  const emptyState       = document.getElementById('empty-state');
  const editorArea       = document.getElementById('editor-area');

  const tabs             = document.querySelectorAll('.tab');
  const panels           = document.querySelectorAll('.tab-panel');

  const sidePills        = document.querySelectorAll('.side-pill');
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

  const fileInfo         = document.getElementById('file-info');

  const btnHitung        = document.getElementById('btn-hitung');
  const exportButtons    = document.getElementById('export-buttons');
  const btnExportYolo    = document.getElementById('btn-export-yolo');
  const btnExportJSON    = document.getElementById('btn-export-json');
  const btnExportCSV     = document.getElementById('btn-export-csv');
  const resultsContainer = document.getElementById('results-container');

  // ── State ──────────────────────────────────────────────────────────────────
  let _currentSide = 0;
  let _currentPair = 0;
  let _editor = null;
  let _dedupInitialized = false;
  let _lastResult = null;

  const SIDE_COMPASS = ['N · Utara', 'E · Timur', 'S · Selatan', 'W · Barat'];

  // ── Dataset loading ────────────────────────────────────────────────────────

  function _onFolderLoad(e) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const trees = DatasetManager.load(files);
    if (trees.length === 0) {
      alert('Tidak ada tree yang ditemukan. Pastikan folder berisi file gambar dengan format NAMA_1.jpg s/d NAMA_4.jpg');
      return;
    }
    _populateTreeSelect(trees);
    treeNav.classList.remove('hidden');
    _loadCurrentTree();
    inputFolder.value = '';
  }

  function _populateTreeSelect(trees) {
    treeSelect.innerHTML = '';
    trees.forEach((t, i) => {
      const opt = document.createElement('option');
      opt.value = i;
      opt.textContent = `${t.name} [${t.split}]`;
      treeSelect.appendChild(opt);
    });
    treeSelect.value = DatasetManager.getIndex();
    _updateTreeCounter();
  }

  function _updateTreeCounter() {
    const idx = DatasetManager.getIndex();
    const total = DatasetManager.count();
    treeCounter.textContent = `${idx + 1} / ${total}`;
    treeSelect.value = idx;
  }

  async function _loadCurrentTree() {
    const tree = DatasetManager.getTree();
    if (!tree) return;
    emptyState.classList.add('hidden');
    editorArea.classList.remove('hidden');

    await ActiveSession.loadTree(tree);
    _lastResult = null;
    exportButtons.classList.add('hidden');
    resultsContainer.innerHTML = '';

    _currentSide = 0;
    _currentPair = 0;
    _dedupInitialized = false;

    _activateSidePill(0);
    _initEditor(0);
    _updateTreeCounter();

    // Refresh dedup if that tab is visible
    if (_activeTab() === 'dedup') _initDedup();
    if (_activeTab() === 'hasil') { resultsContainer.innerHTML = ''; }
  }

  // ── Tree navigation ────────────────────────────────────────────────────────

  btnPrevTree.addEventListener('click', () => {
    if (DatasetManager.prev()) _loadCurrentTree();
  });
  btnNextTree.addEventListener('click', () => {
    if (DatasetManager.next()) _loadCurrentTree();
  });
  treeSelect.addEventListener('change', () => {
    const idx = parseInt(treeSelect.value, 10);
    if (DatasetManager.goTo(idx)) _loadCurrentTree();
  });

  // ── Folder + session inputs ────────────────────────────────────────────────

  inputFolder.addEventListener('change', _onFolderLoad);
  btnLoadFolder.addEventListener('click', () => inputFolder.click());
  btnLoadFolderHero.addEventListener('click', () => inputFolder.click());
  btnLoadSession.addEventListener('click', () => inputSession.click());

  inputSession.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const json = JSON.parse(await file.text());
      const treeIdx = DatasetManager.findByName(json.treeName);
      if (treeIdx === -1) {
        alert(`Pohon "${json.treeName}" tidak ditemukan di dataset yang dimuat. Muat foldernya dulu.`);
        return;
      }
      DatasetManager.goTo(treeIdx);
      _updateTreeCounter();
      const tree = DatasetManager.getTree();
      emptyState.classList.add('hidden');
      editorArea.classList.remove('hidden');
      await ActiveSession.fromJSON(json, tree);
      _lastResult = null;
      exportButtons.classList.add('hidden');
      _currentSide = 0;
      _currentPair = 0;
      _dedupInitialized = false;
      _activateSidePill(0);
      _initEditor(0);
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

  sidePills.forEach(pill => {
    pill.addEventListener('click', () => {
      const si = parseInt(pill.dataset.side);
      _activateSidePill(si);
      _initEditor(si);
    });
  });

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
    _editor = BBoxEditor.create(editorCanvas, side.imageUrl, side.bboxes, (updatedBboxes) => {
      // BBoxEditor owns the bbox array directly; sync back to session state
      ActiveSession.get().sides[sideIndex].bboxes = updatedBboxes;
      ActiveSession.get().dirty = true;
      _updateBboxCount(sideIndex);
    });
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
    _dedupInitialized = true;
    _updateDedupPairUI();
    DedupUI.showPair(_currentPair);
  }

  function _updateDedupPairUI() {
    const [iA, iB] = ADJACENT_PAIRS[_currentPair];
    const lA = TREE_SIDE_LABELS[iA], lB = TREE_SIDE_LABELS[iB];
    dedupPairLabel.textContent = `${lA} ↔ ${lB}`;
    // Display: left=sideB, right=sideA (shared edges face center between canvases)
    dedupLeftLabel.innerHTML  = `${lB} <span class="compass-label">${SIDE_COMPASS[iB]}</span><span class="edge-arrow">tepi kanan →</span>`;
    dedupRightLabel.innerHTML = `${lA} <span class="compass-label">${SIDE_COMPASS[iA]}</span><span class="edge-arrow">← tepi kiri</span>`;
  }

  btnPrevPair.addEventListener('click', () => {
    _currentPair = (_currentPair + 1) % 4;
    _updateDedupPairUI();
    DedupUI.showPair(_currentPair, 'left');
  });
  btnNextPair.addEventListener('click', () => {
    _currentPair = (_currentPair + 3) % 4;
    _updateDedupPairUI();
    DedupUI.showPair(_currentPair, 'right');
  });

  btnRunSuggestions.addEventListener('click', () => {
    if (!ActiveSession.get()) return;
    ActiveSession.runSuggestions();
    DedupUI.refresh();
  });

  // ── Hasil ──────────────────────────────────────────────────────────────────

  btnHitung.addEventListener('click', () => {
    const session = ActiveSession.get();
    if (!session) return;
    _lastResult = Results.compute(session);
    Results.render(_lastResult, resultsContainer);
    exportButtons.classList.remove('hidden');
  });

  btnExportYolo.addEventListener('click', () => {
    const session = ActiveSession.get();
    if (session) Results.exportYolo(session);
  });

  btnExportJSON.addEventListener('click', () => {
    const session = ActiveSession.get();
    if (session) Results.exportJSON(session, _lastResult);
  });

  btnExportCSV.addEventListener('click', () => {
    const session = ActiveSession.get();
    if (session) Results.exportCSV(session, _lastResult);
  });

  // ── Global keyboard shortcuts ──────────────────────────────────────────────

  document.addEventListener('keydown', (e) => {
    // Skip when typing in form controls
    if (e.target.closest('input, select, textarea')) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    const tab = _activeTab();

    // Magnifier toggle — works even when editor canvas has focus
    if ((e.key === 'm' || e.key === 'M') && tab === 'koreksi') {
      BBoxEditor.setMagnifierGlobal(!BBoxEditor.getMagnifierEnabled());
      _updateMagnifierBtn();
      e.preventDefault();
      return;
    }

    // Skip remaining shortcuts when canvas has focus (bbox editor handles its own keys)
    if (e.target === editorCanvas) return;

    switch (e.key) {
      case '[':
        if (DatasetManager.count() > 0 && DatasetManager.prev()) _loadCurrentTree();
        e.preventDefault(); break;
      case ']':
        if (DatasetManager.count() > 0 && DatasetManager.next()) _loadCurrentTree();
        e.preventDefault(); break;
    }

    if (tab === 'koreksi') {
      switch (e.key) {
        case 'q': case 'Q': {
          const si = (_currentSide + 3) % 4;
          _activateSidePill(si); _initEditor(si);
          e.preventDefault(); break;
        }
        case 'e': case 'E': {
          const si = (_currentSide + 1) % 4;
          _activateSidePill(si); _initEditor(si);
          e.preventDefault(); break;
        }
      }
    }

    if (tab === 'dedup') {
      switch (e.key) {
        case 'ArrowLeft':
          _currentPair = (_currentPair + 1) % 4;
          _updateDedupPairUI(); DedupUI.showPair(_currentPair, 'left');
          e.preventDefault(); break;
        case 'ArrowRight':
          _currentPair = (_currentPair + 3) % 4;
          _updateDedupPairUI(); DedupUI.showPair(_currentPair, 'right');
          e.preventDefault(); break;
        case 'r': case 'R':
          if (!ActiveSession.get()) break;
          ActiveSession.runSuggestions(); DedupUI.refresh();
          e.preventDefault(); break;
      }
    }
  });

});
