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
  const treeCurrentCanvas = document.getElementById('tree-current-canvas');
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
  const treeClassSummaryBody = document.getElementById('tree-class-summary-body');
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
  let currentCanvasRenderToken = 0;
  let gridCanvasRenderToken = 0;

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
    treeCurrentCanvas.classList.toggle('hidden', !hasPreview);
    treeEmptyState.classList.toggle('hidden', hasPreview);
    if (hasPreview) {
      const token = ++currentCanvasRenderToken;
      drawSideCanvas(treeCurrentCanvas, side, {
        token,
        tokenType: 'current',
        emphasizeLabels: true,
        showLegend: true,
        fitMode: 'contain',
      });
    } else {
      clearCanvas(treeCurrentCanvas);
    }
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
              ? `<canvas class="tree-side-card__canvas" data-side-index="${side.sideIndex}" aria-label="Preview ${side.label}"></canvas>`
              : '<span class="tree-side-card__placeholder">Belum ada foto</span>'}
          </div>
        </div>
      `;
    }).join('');
    drawSideGridCanvases();
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

  function getCanvasContext(canvas) {
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    const dpr = window.devicePixelRatio || 1;

    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));

    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, width, height };
  }

  function clearCanvas(canvas) {
    if (!canvas) return;
    const state = getCanvasContext(canvas);
    if (!state) return;
    state.ctx.clearRect(0, 0, state.width, state.height);
  }

  function parseDetectionBox(raw, imgWidth, imgHeight) {
    const source = raw && (raw.box || raw.bbox || raw.xyxy || raw);
    if (!source) return null;

    let x1;
    let y1;
    let x2;
    let y2;
    if (Array.isArray(source)) {
      x1 = Number(source[0]);
      y1 = Number(source[1]);
      x2 = Number(source[2]);
      y2 = Number(source[3]);
    } else {
      x1 = Number(source.x1);
      y1 = Number(source.y1);
      x2 = Number(source.x2);
      y2 = Number(source.y2);
    }

    if (![x1, y1, x2, y2].every(Number.isFinite)) return null;
    if (x2 <= x1 || y2 <= y1) return null;

    if (x2 <= 1.5 && y2 <= 1.5) {
      x1 *= imgWidth;
      x2 *= imgWidth;
      y1 *= imgHeight;
      y2 *= imgHeight;
    }

    x1 = Math.max(0, Math.min(imgWidth - 1, x1));
    y1 = Math.max(0, Math.min(imgHeight - 1, y1));
    x2 = Math.max(x1 + 1, Math.min(imgWidth, x2));
    y2 = Math.max(y1 + 1, Math.min(imgHeight, y2));

    return { x1, y1, x2, y2 };
  }

  function getSideDetectionsForDraw(side, imgWidth, imgHeight) {
    if (!side || !Array.isArray(side.detections)) return [];
    return side.detections.map((det) => {
      const box = parseDetectionBox(det, imgWidth, imgHeight);
      if (!box) return null;
      const confValue = det.confidence !== undefined ? det.confidence : det.conf;
      const conf = Number.isFinite(Number(confValue)) ? Number(confValue) : 0;
      const name = det.name || String(det.class || 'objek');
      return { box, conf, name };
    }).filter(Boolean);
  }

  function drawDetectionOverlay(ctx, detections, fit, options = {}) {
    if (!detections.length) return;
    const baseWidth = Math.max(1.5, Math.min(fit.drawWidth, fit.drawHeight) * (options.emphasizeLabels ? 0.004 : 0.003));

    detections.forEach((det, idx) => {
      const x = fit.offsetX + det.box.x1 * fit.scale;
      const y = fit.offsetY + det.box.y1 * fit.scale;
      const w = (det.box.x2 - det.box.x1) * fit.scale;
      const h = (det.box.y2 - det.box.y1) * fit.scale;
      const classColor = getClassColor(det.name);

      ctx.lineWidth = baseWidth;
      ctx.strokeStyle = classColor;
      ctx.shadowBlur = 0;
      ctx.strokeRect(x, y, w, h);

      if (options.emphasizeLabels) {
        const label = `${idx + 1}. ${det.name} ${(det.conf * 100).toFixed(1)}%`;
        const fontSize = Math.max(10, Math.min(14, Math.round(fit.drawWidth * 0.018)));
        ctx.font = `600 ${fontSize}px "DM Sans", sans-serif`;
        const textWidth = ctx.measureText(label).width + 10;
        const textHeight = fontSize + 8;
        const labelY = Math.max(4, y - textHeight - 3);

        ctx.fillStyle = classColor;
        ctx.fillRect(x, labelY, textWidth, textHeight);
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, labelY, textWidth, textHeight);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(label, x + 5, labelY + fontSize + 1);
      }
    });

    if (options.showLegend) {
      const text = `${detections.length} deteksi sisi ini`;
      ctx.font = '600 12px "DM Sans", sans-serif';
      const w = ctx.measureText(text).width + 12;
      const h = 22;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
      ctx.fillRect(8, 8, w, h);
      ctx.strokeStyle = 'rgba(184, 224, 74, 0.85)';
      ctx.lineWidth = 1;
      ctx.strokeRect(8, 8, w, h);
      ctx.fillStyle = '#d9ef98';
      ctx.fillText(text, 14, 23);
    }
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

  async function drawSideCanvas(canvas, side, options = {}) {
    if (!canvas) return;
    if (!side || !side.previewUrl) {
      clearCanvas(canvas);
      return;
    }

    const token = options.token;
    const tokenType = options.tokenType || 'current';
    try {
      const img = await loadImage(side.previewUrl);
      if (token !== undefined) {
        if (tokenType === 'current' && token !== currentCanvasRenderToken) return;
        if (tokenType === 'grid' && token !== gridCanvasRenderToken) return;
      }

      const state = getCanvasContext(canvas);
      if (!state) return;
      const { ctx, width, height } = state;

      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = '#050b07';
      ctx.fillRect(0, 0, width, height);

      const imgW = img.naturalWidth || img.width;
      const imgH = img.naturalHeight || img.height;
      const fitMode = options.fitMode || 'contain';
      const scale = fitMode === 'cover'
        ? Math.max(width / imgW, height / imgH)
        : Math.min(width / imgW, height / imgH);
      const drawWidth = imgW * scale;
      const drawHeight = imgH * scale;
      const offsetX = (width - drawWidth) / 2;
      const offsetY = (height - drawHeight) / 2;

      ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);

      const detections = getSideDetectionsForDraw(side, imgW, imgH);
      drawDetectionOverlay(ctx, detections, { scale, drawWidth, drawHeight, offsetX, offsetY }, options);
    } catch (_) {
      clearCanvas(canvas);
    }
  }

  function drawSideGridCanvases() {
    const canvases = treeSideGrid.querySelectorAll('.tree-side-card__canvas');
    if (!canvases.length) return;
    const token = ++gridCanvasRenderToken;
    canvases.forEach((canvas) => {
      const sideIndex = Number(canvas.dataset.sideIndex);
      const side = session.sides[sideIndex];
      drawSideCanvas(canvas, side, { token, tokenType: 'grid', fitMode: 'cover' });
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
        const classColor = getClassColor(det.name);
        const x = det.box.x1;
        const y = det.box.y1;
        const w = det.box.x2 - det.box.x1;
        const h = det.box.y2 - det.box.y1;

        if (isFocus) {
          ctx.strokeStyle = classColor;
          ctx.lineWidth = lineBase + 1;
          ctx.shadowColor = 'rgba(255, 255, 255, 0.35)';
          ctx.shadowBlur = 8;
        } else {
          ctx.strokeStyle = classColor;
          ctx.lineWidth = lineBase;
          ctx.shadowBlur = 0;
          ctx.globalAlpha = 0.36;
        }
        ctx.strokeRect(x, y, w, h);
        ctx.globalAlpha = 1;
      });

      const focus = dedupEvidence.detectionMap[focusDetId];
      if (focus) {
        const focusColor = getClassColor(focus.name);
        const label = `Kandidat ${focus.name} | conf ${(focus.conf * 100).toFixed(1)}%`;
        const fontSize = Math.max(12, Math.round(Math.min(canvas.width, canvas.height) * 0.026));
        ctx.font = `600 ${fontSize}px "DM Sans", sans-serif`;
        const textW = ctx.measureText(label).width + 10;
        const textH = fontSize + 8;
        const y = Math.max(4, focus.box.y1 - textH - 4);
        const x = Math.max(4, focus.box.x1);

        ctx.shadowBlur = 0;
        ctx.fillStyle = focusColor;
        ctx.fillRect(x, y, textW, textH);
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x, y, textW, textH);
        ctx.fillStyle = '#ffffff';
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

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = String(str || '');
    return div.innerHTML;
  }

  function getClassColor(className) {
    if (typeof CanvasRenderer !== 'undefined' && CanvasRenderer && typeof CanvasRenderer.getClassColor === 'function') {
      return CanvasRenderer.getClassColor(className);
    }
    if (window.CanvasRenderer && typeof window.CanvasRenderer.getClassColor === 'function') {
      return window.CanvasRenderer.getClassColor(className);
    }
    return '#22c55e';
  }

  function buildClassSummaryFallback(result) {
    const map = new Map();
    const clusters = Array.isArray(result.clusters) ? result.clusters : [];
    clusters.forEach((cluster) => {
      const className = cluster.dominantClass || 'sawit';
      if (!map.has(className)) {
        map.set(className, { className, uniqueCount: 0, rawCount: 0, avgConf: 0 });
      }
      map.get(className).uniqueCount += 1;
      map.get(className).rawCount += cluster.size || 0;
    });
    return Array.from(map.values());
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

    const classRows = Array.isArray(result.classSummary) && result.classSummary.length
      ? result.classSummary
      : buildClassSummaryFallback(result);
    const classColorMap = {};
    classRows.forEach((row) => {
      classColorMap[row.className] = getClassColor(row.className);
    });

    if (treeClassSummaryBody) {
      treeClassSummaryBody.innerHTML = '';
      classRows.forEach((row) => {
        const color = classColorMap[row.className] || getClassColor(row.className);
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><div class="cell-class"><span class="color-dot" style="background:${color}"></span>${escapeHtml(row.className)}</div></td>
          <td class="mono">${row.uniqueCount}</td>
          <td class="mono">${row.rawCount}</td>
          <td class="mono">${(row.avgConf * 100).toFixed(1)}%</td>
        `;
        treeClassSummaryBody.appendChild(tr);
      });
    }

    if (treeClusterBody) {
      treeClusterBody.innerHTML = '';
      result.clusters.forEach((cluster) => {
        const className = cluster.dominantClass || 'sawit';
        const color = classColorMap[className] || getClassColor(className);
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td class="mono">#${cluster.clusterId}</td>
          <td><div class="cell-class"><span class="color-dot" style="background:${color}"></span>${escapeHtml(className)}</div></td>
          <td class="mono">${cluster.size}</td>
          <td>${cluster.sides}</td>
          <td class="mono">${(cluster.avgConf * 100).toFixed(1)}%</td>
        `;
        treeClusterBody.appendChild(tr);
      });
    }
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

  let resizeTimer = null;
  function handleResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      renderCurrentSide();
      drawSideGridCanvases();
      if (!treeReviewSection.classList.contains('hidden')) {
        renderReviewPair();
      }
    }, 100);
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

  window.addEventListener('resize', handleResize);
  window.addEventListener('focus', updateApiWarning);
  renderWizard();
  setMode('single');
});
