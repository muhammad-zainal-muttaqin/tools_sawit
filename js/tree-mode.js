document.addEventListener('DOMContentLoaded', () => {
  const singleRoot = document.getElementById('single-mode-root');
  const treeRoot = document.getElementById('tree-mode-root');
  const btnModeSingle = document.getElementById('btn-mode-single');
  const btnModeTree = document.getElementById('btn-mode-tree');

  if (!singleRoot || !treeRoot || !btnModeSingle || !btnModeTree) return;

  const treeApiKeyWarning = document.getElementById('tree-apikey-warning');
  const treeFileInput = document.getElementById('tree-file-input');
  const btnTreePick = document.getElementById('btn-tree-pick');
  const btnTreeNext = document.getElementById('btn-tree-next');
  const btnTreeReset = document.getElementById('btn-tree-reset');
  const btnTreeProcess = document.getElementById('btn-tree-process');
  const treeSidePills = document.getElementById('tree-side-pills');
  const treeCurrentPreview = document.getElementById('tree-current-preview');
  const treeCurrentSideLabel = document.getElementById('tree-current-side-label');
  const treeEmptyState = document.getElementById('tree-empty-state');
  const treeSideGrid = document.getElementById('tree-side-grid');

  const treeReviewSection = document.getElementById('tree-review-section');
  const treeReviewProgress = document.getElementById('tree-review-progress');
  const treeReviewCanvasA = document.getElementById('tree-review-canvas-a');
  const treeReviewCanvasB = document.getElementById('tree-review-canvas-b');
  const treeReviewSideA = document.getElementById('tree-review-side-a');
  const treeReviewSideB = document.getElementById('tree-review-side-b');
  const treeReviewMeta = document.getElementById('tree-review-meta');
  const btnReviewMerge = document.getElementById('btn-review-merge');
  const btnReviewSeparate = document.getElementById('btn-review-separate');
  const btnReviewSkip = document.getElementById('btn-review-skip');

  const treeResultsSection = document.getElementById('tree-results-section');
  const treeResultBadge = document.getElementById('tree-result-badge');
  const treeUniqueCount = document.getElementById('tree-unique-count');
  const treeRawCount = document.getElementById('tree-raw-count');
  const treeMergeCount = document.getElementById('tree-merge-count');
  const treeSideSummaryBody = document.getElementById('tree-side-summary-body');
  const treeClusterBody = document.getElementById('tree-cluster-body');

  const treeErrorSection = document.getElementById('tree-error-section');
  const treeErrorMessage = document.getElementById('tree-error-message');

  const treeLoadingSection = document.getElementById('tree-loading-section');
  const treeLoadingText = document.getElementById('tree-loading-text');
  const treeLoadingSub = document.getElementById('tree-loading-sub');
  const treeLoadingProgress = document.getElementById('tree-loading-progress');
  const treeLoadingProgressBar = document.getElementById('tree-loading-progress-bar');

  const btnSaveKey = document.getElementById('btn-save-key');
  const sideLabels = window.TREE_SIDE_LABELS || ['Depan', 'Kanan', 'Belakang', 'Kiri'];
  const TREE_COUNT_DEFAULTS = { autoMergeMin: 0.82, ambiguousMin: 0.68 };

  let mode = 'single';
  let currentSideIndex = 0;
  let session = TreeSessionStore.createSession();
  let dedupEvidence = null;
  let reviewIndex = 0;
  let reviewDecisions = {};
  let reviewRenderToken = 0;

  function getTreeCountSettings() {
    try {
      const raw = localStorage.getItem('sawitai_tree_count');
      if (raw) {
        const parsed = JSON.parse(raw);
        let autoMergeMin = Number(parsed.autoMergeMin);
        let ambiguousMin = Number(parsed.ambiguousMin);
        if (!Number.isFinite(autoMergeMin)) autoMergeMin = TREE_COUNT_DEFAULTS.autoMergeMin;
        if (!Number.isFinite(ambiguousMin)) ambiguousMin = TREE_COUNT_DEFAULTS.ambiguousMin;
        autoMergeMin = Math.max(0.70, Math.min(0.98, autoMergeMin));
        ambiguousMin = Math.max(0.40, Math.min(0.90, ambiguousMin));
        if (ambiguousMin >= autoMergeMin) {
          ambiguousMin = Math.max(0.40, Number((autoMergeMin - 0.01).toFixed(2)));
        }
        return { autoMergeMin, ambiguousMin };
      }
    } catch (_) {}
    return { ...TREE_COUNT_DEFAULTS };
  }

  function setMode(nextMode) {
    mode = nextMode;
    const isTree = mode === 'tree';
    singleRoot.classList.toggle('hidden', isTree);
    treeRoot.classList.toggle('hidden', !isTree);
    btnModeSingle.classList.toggle('mode-switch__btn--active', !isTree);
    btnModeTree.classList.toggle('mode-switch__btn--active', isTree);
    updateApiWarning();
  }

  function updateApiWarning() {
    const hasKey = ApiService.hasApiKey();
    treeApiKeyWarning.classList.toggle('hidden', hasKey);
    btnTreeProcess.disabled = !hasKey || !TreeSessionStore.allSidesReady(session);
  }

  function clearWorkflowViews() {
    hideLoading();
    hideTreeError();
    treeReviewSection.classList.add('hidden');
    treeResultsSection.classList.add('hidden');
    reviewRenderToken += 1;
    clearReviewCanvas(treeReviewCanvasA);
    clearReviewCanvas(treeReviewCanvasB);
  }

  function renderTreePills() {
    const pills = treeSidePills.querySelectorAll('.tree-pill');
    pills.forEach((pill) => {
      const sideIndex = Number(pill.dataset.sideIndex);
      const hasFile = !!session.sides[sideIndex].file;
      pill.classList.toggle('is-current', sideIndex === currentSideIndex);
      pill.classList.toggle('is-complete', hasFile);
    });
  }

  function renderCurrentSide() {
    const side = session.sides[currentSideIndex];
    treeCurrentSideLabel.textContent = side.label;
    const hasPreview = !!side.previewUrl;
    treeCurrentPreview.classList.toggle('hidden', !hasPreview);
    treeEmptyState.classList.toggle('hidden', hasPreview);
    treeCurrentPreview.src = hasPreview ? side.previewUrl : '';
    btnTreeNext.disabled = !hasPreview || currentSideIndex >= 3;
  }

  function renderSideGrid() {
    treeSideGrid.innerHTML = session.sides.map((side) => {
      const hasFile = !!side.file;
      const count = Array.isArray(side.detections) ? side.detections.length : 0;
      const avg = count
        ? `${(side.detections.reduce((acc, det) => {
          const conf = det.confidence !== undefined ? det.confidence : det.conf;
          return acc + (Number(conf) || 0);
        }, 0) / count * 100).toFixed(1)}%`
        : '-';
      return `
        <div class="tree-side-card">
          <div class="tree-side-card__head">
            <div>
              <div class="tree-side-card__title">${side.label}</div>
              <div class="tree-side-card__meta">Deteksi: ${count} | Avg: ${avg}</div>
            </div>
            <button class="btn btn--ghost btn--sm tree-side-jump" data-side-index="${side.sideIndex}">Pilih</button>
          </div>
          <div class="tree-side-card__preview">
            ${hasFile
              ? `<img src="${side.previewUrl}" alt="Preview ${side.label}">`
              : '<span class="tree-side-card__placeholder">Belum ada foto</span>'}
          </div>
        </div>
      `;
    }).join('');
  }

  function renderWizard() {
    renderTreePills();
    renderCurrentSide();
    renderSideGrid();
    updateApiWarning();
  }

  function parseDetections(result) {
    if (result && result.images && Array.isArray(result.images)) {
      return result.images[0].results || result.images[0].detections || [];
    }
    if (result && result.results && Array.isArray(result.results)) {
      return result.results;
    }
    if (Array.isArray(result)) {
      return result;
    }
    if (result && result.data) {
      if (Array.isArray(result.data)) return result.data;
      if (result.data.images) return result.data.images[0].results || [];
    }
    return [];
  }

  function loadImage(url) {
    return new Promise((resolve, reject) => {
      if (!url) {
        reject(new Error('URL gambar tidak tersedia.'));
        return;
      }
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Gagal memuat preview gambar.'));
      img.src = url;
    });
  }

  function clearReviewCanvas(canvas) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = 2;
    canvas.height = 2;
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  async function drawReviewCanvas(canvas, sideIndex, focusDetId, token) {
    if (!canvas || !dedupEvidence) return;
    const side = session.sides[sideIndex];
    if (!side || !side.previewUrl) {
      clearReviewCanvas(canvas);
      return;
    }

    try {
      const img = await loadImage(side.previewUrl);
      if (token !== reviewRenderToken) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      const sideDets = dedupEvidence.detections.filter((d) => d.sideIndex === sideIndex);
      const lineBase = Math.max(2, Math.round(Math.min(canvas.width, canvas.height) * 0.004));

      sideDets.forEach((det) => {
        const isFocus = det.detId === focusDetId;
        const x = det.box.x1;
        const y = det.box.y1;
        const w = det.box.x2 - det.box.x1;
        const h = det.box.y2 - det.box.y1;

        if (isFocus) {
          ctx.strokeStyle = '#b8e04a';
          ctx.lineWidth = lineBase + 1;
          ctx.shadowColor = 'rgba(184, 224, 74, 0.45)';
          ctx.shadowBlur = 8;
        } else {
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
          ctx.lineWidth = lineBase;
          ctx.shadowBlur = 0;
        }
        ctx.strokeRect(x, y, w, h);
      });

      const focus = dedupEvidence.detectionMap[focusDetId];
      if (focus) {
        const label = `Kandidat | conf ${(focus.conf * 100).toFixed(1)}%`;
        const fontSize = Math.max(12, Math.round(Math.min(canvas.width, canvas.height) * 0.026));
        ctx.font = `600 ${fontSize}px "DM Sans", sans-serif`;
        const textW = ctx.measureText(label).width + 10;
        const textH = fontSize + 8;
        const y = Math.max(4, focus.box.y1 - textH - 4);
        const x = Math.max(4, focus.box.x1);

        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(12, 18, 12, 0.82)';
        ctx.fillRect(x, y, textW, textH);
        ctx.strokeStyle = '#b8e04a';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x, y, textW, textH);
        ctx.fillStyle = '#f0f5f0';
        ctx.fillText(label, x + 5, y + fontSize + 1);
      }
    } catch (_) {
      clearReviewCanvas(canvas);
    }
  }

  function showLoading(text, sub, progress) {
    if (!treeLoadingSection) return;
    treeLoadingSection.classList.remove('hidden');
    treeLoadingText.textContent = text || 'Menganalisis...';
    treeLoadingSub.textContent = sub || 'Memproses data...';
    if (progress !== undefined) {
      treeLoadingProgress.classList.remove('hidden');
      treeLoadingProgressBar.style.width = `${progress}%`;
    } else {
      treeLoadingProgress.classList.add('hidden');
      treeLoadingProgressBar.style.width = '0%';
    }
  }

  function hideLoading() {
    if (!treeLoadingSection) return;
    treeLoadingSection.classList.add('hidden');
    treeLoadingProgress.classList.add('hidden');
    treeLoadingProgressBar.style.width = '0%';
  }

  function showTreeError(message) {
    treeErrorSection.classList.remove('hidden');
    treeErrorMessage.textContent = message;
  }

  function hideTreeError() {
    treeErrorSection.classList.add('hidden');
    treeErrorMessage.textContent = '';
  }

  async function processTreeSession() {
    clearWorkflowViews();
    if (!ApiService.hasApiKey()) {
      showTreeError('API key belum diatur. Buka pengaturan dan simpan API key terlebih dahulu.');
      return;
    }
    if (!TreeSessionStore.allSidesReady(session)) {
      showTreeError('Lengkapi 4 sisi foto terlebih dahulu sebelum proses counting.');
      return;
    }

    try {
      showLoading('Mendeteksi 4 sisi...', 'Menyiapkan batch inferensi', 0);
      const files = TreeSessionStore.getFiles(session);
      const responses = await ApiService.predictBatchSequential(files, ({ index, total }) => {
        const pct = Math.round((index / Math.max(total, 1)) * 100);
        showLoading('Mendeteksi 4 sisi...', `Memproses sisi ${Math.min(index + 1, total)} / ${total}`, pct);
      });

      responses.forEach((res, idx) => {
        const detections = parseDetections(res);
        TreeSessionStore.setSideDetections(session, idx, detections);
      });
      renderSideGrid();

      showLoading('Deduplikasi lintas sisi...', 'Menghitung kandidat merge antar foto', 100);
      const dedupSettings = getTreeCountSettings();
      dedupEvidence = await TreeDeduper.buildSessionEvidence(session, {
        autoMergeMin: dedupSettings.autoMergeMin,
        ambiguousMin: dedupSettings.ambiguousMin,
      });
      TreeSessionStore.setDedupArtifacts(session, dedupEvidence);

      reviewDecisions = {};
      reviewIndex = 0;

      if (dedupEvidence.ambiguousPairs.length > 0) {
        treeReviewSection.classList.remove('hidden');
        renderReviewPair();
      } else {
        finalizeTreeSession();
      }
    } catch (err) {
      showTreeError(err.message || 'Terjadi kesalahan saat memproses session 4 sisi.');
    } finally {
      hideLoading();
    }
  }

  function renderReviewPair() {
    const pairs = dedupEvidence ? dedupEvidence.ambiguousPairs : [];
    if (reviewIndex >= pairs.length) {
      finalizeTreeSession();
      return;
    }

    const pair = pairs[reviewIndex];
    treeReviewProgress.textContent = `Pasangan ${reviewIndex + 1} / ${pairs.length}`;
    treeReviewSideA.textContent = pair.aSide;
    treeReviewSideB.textContent = pair.bSide;
    treeReviewMeta.textContent = `Bandingkan posisi tandan pada foto penuh. Score ${pair.score.toFixed(2)} | ${pair.reasons.join(' | ')}`;

    const token = ++reviewRenderToken;
    drawReviewCanvas(treeReviewCanvasA, pair.aSideIndex, pair.aDetId, token);
    drawReviewCanvas(treeReviewCanvasB, pair.bSideIndex, pair.bDetId, token);
  }

  function finalizeTreeSession() {
    TreeSessionStore.setUserDecisions(session, reviewDecisions);
    const result = TreeDeduper.resolve(session, dedupEvidence, reviewDecisions);
    TreeSessionStore.setResult(session, result);
    renderTreeResult(result);
    treeReviewSection.classList.add('hidden');
  }

  function renderTreeResult(result) {
    treeResultsSection.classList.remove('hidden');
    treeResultBadge.textContent = `${result.uniqueCount} unik dari ${result.rawCount} deteksi mentah`;
    treeUniqueCount.textContent = String(result.uniqueCount);
    treeRawCount.textContent = String(result.rawCount);
    treeMergeCount.textContent = String(result.mergeCount);

    treeSideSummaryBody.innerHTML = '';
    result.sideSummary.forEach((row) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${row.label}</td>
        <td class="mono">${row.rawCount}</td>
        <td class="mono">${(row.avgConf * 100).toFixed(1)}%</td>
      `;
      treeSideSummaryBody.appendChild(tr);
    });

    treeClusterBody.innerHTML = '';
    result.clusters.forEach((cluster) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="mono">#${cluster.clusterId}</td>
        <td class="mono">${cluster.size}</td>
        <td>${cluster.sides}</td>
        <td class="mono">${(cluster.avgConf * 100).toFixed(1)}%</td>
      `;
      treeClusterBody.appendChild(tr);
    });
  }

  function handleReviewDecision(decision) {
    const pair = dedupEvidence.ambiguousPairs[reviewIndex];
    if (!pair) return;
    reviewDecisions[pair.key] = decision;
    reviewIndex += 1;
    renderReviewPair();
  }

  function resetSession() {
    session = TreeSessionStore.resetSession(session);
    currentSideIndex = 0;
    dedupEvidence = null;
    reviewIndex = 0;
    reviewDecisions = {};
    clearWorkflowViews();
    renderWizard();
  }

  btnModeSingle.addEventListener('click', () => setMode('single'));
  btnModeTree.addEventListener('click', () => setMode('tree'));

  btnTreePick.addEventListener('click', () => {
    treeFileInput.click();
  });

  treeFileInput.addEventListener('change', () => {
    const file = treeFileInput.files && treeFileInput.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showTreeError('Hanya file gambar yang didukung pada mode 4 sisi.');
      return;
    }
    hideTreeError();
    clearWorkflowViews();
    TreeSessionStore.setSideFile(session, currentSideIndex, file);
    treeFileInput.value = '';
    renderWizard();
  });

  btnTreeNext.addEventListener('click', () => {
    if (currentSideIndex < 3) {
      currentSideIndex += 1;
      renderWizard();
    }
  });

  btnTreeReset.addEventListener('click', () => {
    resetSession();
  });

  btnTreeProcess.addEventListener('click', async () => {
    await processTreeSession();
  });

  treeSidePills.addEventListener('click', (event) => {
    const button = event.target.closest('.tree-pill');
    if (!button) return;
    currentSideIndex = Number(button.dataset.sideIndex);
    renderWizard();
  });

  treeSideGrid.addEventListener('click', (event) => {
    const button = event.target.closest('.tree-side-jump');
    if (!button) return;
    currentSideIndex = Number(button.dataset.sideIndex);
    renderWizard();
  });

  btnReviewMerge.addEventListener('click', () => handleReviewDecision('merge'));
  btnReviewSeparate.addEventListener('click', () => handleReviewDecision('separate'));
  btnReviewSkip.addEventListener('click', () => {
    const pairs = dedupEvidence ? dedupEvidence.ambiguousPairs : [];
    for (let i = reviewIndex; i < pairs.length; i++) {
      reviewDecisions[pairs[i].key] = 'separate';
    }
    finalizeTreeSession();
  });

  if (btnSaveKey) {
    btnSaveKey.addEventListener('click', () => {
      setTimeout(updateApiWarning, 100);
    });
  }

  window.addEventListener('focus', updateApiWarning);
  renderWizard();
  setMode('single');
});
