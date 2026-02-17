document.addEventListener('DOMContentLoaded', () => {
  // --- Elements ---
  const btnSettings = document.getElementById('btn-settings');
  const btnCloseSettings = document.getElementById('btn-close-settings');
  const settingsPanel = document.getElementById('settings-panel');
  const inputApiKey = document.getElementById('input-apikey');
  const btnToggleKey = document.getElementById('btn-toggle-key');
  const btnSaveKey = document.getElementById('btn-save-key');
  const apikeyStatus = document.getElementById('apikey-status');
  const apikeyWarning = document.getElementById('apikey-warning');
  const sliderConf = document.getElementById('slider-conf');
  const sliderIou = document.getElementById('slider-iou');
  const sliderImgsz = document.getElementById('slider-imgsz');
  const inputConf = document.getElementById('input-conf');
  const inputIou = document.getElementById('input-iou');
  const inputImgsz = document.getElementById('input-imgsz');
  const uploadZone = document.getElementById('upload-zone');
  const fileInput = document.getElementById('file-input');
  const previewSection = document.getElementById('preview-section');
  const previewImage = document.getElementById('preview-image');
  const previewVideo = document.getElementById('preview-video');
  const fileName = document.getElementById('file-name');
  const fileSize = document.getElementById('file-size');
  const fileIcon = document.getElementById('file-icon');
  const btnRemoveFile = document.getElementById('btn-remove-file');
  const btnDetect = document.getElementById('btn-detect');
  const loadingSection = document.getElementById('loading-section');
  const resultsSection = document.getElementById('results-section');
  const imageResult = document.getElementById('image-result');
  const videoResult = document.getElementById('video-result');
  const resultCanvas = document.getElementById('result-canvas');
  const videoResultCanvas = document.getElementById('video-result-canvas');
  const detectionCount = document.getElementById('detection-count');
  const detectionTableBody = document.getElementById('detection-table-body');
  const btnDownload = document.getElementById('btn-download');
  const errorSection = document.getElementById('error-section');
  const errorMessage = document.getElementById('error-message');
  const btnPrevFrame = document.getElementById('btn-prev-frame');
  const btnNextFrame = document.getElementById('btn-next-frame');
  const frameIndicator = document.getElementById('frame-indicator');

  let selectedFile = null;
  let isImage = false;
  let videoFrameResults = [];
  let currentFrameIndex = 0;

  const DEFAULTS = { conf: 0.25, iou: 0.45, imgsz: 640 };

  const btnResetSettings = document.getElementById('btn-reset-settings');

  // Create settings overlay
  const overlay = document.createElement('div');
  overlay.className = 'settings-overlay';
  document.body.appendChild(overlay);

  // --- Init ---
  initSettings();
  checkApiKey();

  // --- Settings Drawer ---
  function openSettings() {
    settingsPanel.dataset.open = 'true';
    overlay.classList.add('active');
  }
  function closeSettings() {
    settingsPanel.dataset.open = 'false';
    overlay.classList.remove('active');
  }

  btnSettings.addEventListener('click', openSettings);
  btnCloseSettings.addEventListener('click', closeSettings);
  overlay.addEventListener('click', closeSettings);

  function initSettings() {
    const settings = ApiService.getSettings();
    sliderConf.value = settings.conf;
    sliderIou.value = settings.iou;
    sliderImgsz.value = settings.imgsz;
    inputConf.value = settings.conf;
    inputIou.value = settings.iou;
    inputImgsz.value = settings.imgsz;

    if (ApiService.hasApiKey()) {
      inputApiKey.value = ApiService.getApiKey();
    }
  }

  // Helper: clamp value to min/max/step of a slider
  function clampToSlider(slider, raw) {
    const min = parseFloat(slider.min);
    const max = parseFloat(slider.max);
    const step = parseFloat(slider.step);
    let v = parseFloat(raw);
    if (isNaN(v)) v = min;
    v = Math.max(min, Math.min(max, v));
    // Snap to step
    v = Math.round((v - min) / step) * step + min;
    // Fix floating-point
    const decimals = (slider.step.split('.')[1] || '').length;
    return parseFloat(v.toFixed(decimals));
  }

  // Sync: slider -> number input
  sliderConf.addEventListener('input', () => {
    inputConf.value = sliderConf.value;
    saveCurrentSettings();
  });
  sliderIou.addEventListener('input', () => {
    inputIou.value = sliderIou.value;
    saveCurrentSettings();
  });
  sliderImgsz.addEventListener('input', () => {
    inputImgsz.value = sliderImgsz.value;
    saveCurrentSettings();
  });

  // Sync: number input -> slider (on change/blur)
  inputConf.addEventListener('change', () => {
    const v = clampToSlider(sliderConf, inputConf.value);
    inputConf.value = v;
    sliderConf.value = v;
    saveCurrentSettings();
  });
  inputIou.addEventListener('change', () => {
    const v = clampToSlider(sliderIou, inputIou.value);
    inputIou.value = v;
    sliderIou.value = v;
    saveCurrentSettings();
  });
  inputImgsz.addEventListener('change', () => {
    const v = clampToSlider(sliderImgsz, inputImgsz.value);
    inputImgsz.value = v;
    sliderImgsz.value = v;
    saveCurrentSettings();
  });

  function saveCurrentSettings() {
    ApiService.saveSettings({
      conf: sliderConf.value,
      iou: sliderIou.value,
      imgsz: sliderImgsz.value,
    });
  }

  // --- Reset to Defaults ---
  btnResetSettings.addEventListener('click', () => {
    sliderConf.value = DEFAULTS.conf;
    sliderIou.value = DEFAULTS.iou;
    sliderImgsz.value = DEFAULTS.imgsz;
    inputConf.value = DEFAULTS.conf;
    inputIou.value = DEFAULTS.iou;
    inputImgsz.value = DEFAULTS.imgsz;
    saveCurrentSettings();
  });

  // --- API Key ---
  btnToggleKey.addEventListener('click', () => {
    inputApiKey.type = inputApiKey.type === 'password' ? 'text' : 'password';
  });

  btnSaveKey.addEventListener('click', () => {
    const key = inputApiKey.value.trim();
    if (!key) {
      apikeyStatus.textContent = 'API key tidak boleh kosong.';
      apikeyStatus.className = 'settings__hint error';
      return;
    }
    ApiService.setApiKey(key);
    apikeyStatus.textContent = 'API key berhasil disimpan!';
    apikeyStatus.className = 'settings__hint success';
    checkApiKey();
    setTimeout(() => { apikeyStatus.textContent = ''; apikeyStatus.className = 'settings__hint'; }, 3000);
  });

  function checkApiKey() {
    if (ApiService.hasApiKey()) {
      apikeyWarning.classList.add('hidden');
      btnDetect.disabled = false;
    } else {
      apikeyWarning.classList.remove('hidden');
      btnDetect.disabled = true;
    }
  }

  // --- Upload ---
  uploadZone.addEventListener('click', () => fileInput.click());

  uploadZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadZone.classList.add('drag-active');
  });

  uploadZone.addEventListener('dragleave', () => {
    uploadZone.classList.remove('drag-active');
  });

  uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadZone.classList.remove('drag-active');
    if (e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
    }
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files.length > 0) {
      handleFile(fileInput.files[0]);
    }
  });

  function handleFile(file) {
    selectedFile = file;
    isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');

    if (!isImage && !isVideo) {
      showError('Format file tidak didukung. Gunakan gambar (JPG, PNG, WEBP) atau video (MP4, AVI, MOV, MKV).');
      return;
    }

    hideError();
    hideResults();
    previewSection.classList.remove('hidden');
    fileName.textContent = file.name;
    fileSize.textContent = formatFileSize(file.size);
    fileIcon.textContent = isImage ? '\uD83D\uDDBC\uFE0F' : '\uD83C\uDFA5';

    if (isImage) {
      previewImage.classList.remove('hidden');
      previewVideo.classList.add('hidden');
      previewImage.src = URL.createObjectURL(file);
    } else {
      previewVideo.classList.remove('hidden');
      previewImage.classList.add('hidden');
      previewVideo.src = URL.createObjectURL(file);
    }

    checkApiKey();
  }

  btnRemoveFile.addEventListener('click', () => {
    resetFile();
  });

  function resetFile() {
    selectedFile = null;
    fileInput.value = '';
    previewSection.classList.add('hidden');
    previewImage.classList.add('hidden');
    previewVideo.classList.add('hidden');
    previewImage.src = '';
    previewVideo.src = '';
    hideResults();
    hideError();
  }

  // --- Loading UI helpers ---
  const loadingText = document.getElementById('loading-text');
  const loadingSub = document.getElementById('loading-sub');
  const loadingProgress = document.getElementById('loading-progress');
  const loadingProgressBar = document.getElementById('loading-progress-bar');

  function setLoadingState(text, sub, progress) {
    loadingText.textContent = text || 'Menganalisis...';
    loadingSub.textContent = sub || 'Model AI sedang memproses file Anda';
    if (progress !== undefined) {
      loadingProgress.classList.remove('hidden');
      loadingProgressBar.style.width = progress + '%';
    } else {
      loadingProgress.classList.add('hidden');
      loadingProgressBar.style.width = '0%';
    }
  }

  // --- Video frame extraction ---
  function extractFramesFromVideo(videoEl, numFrames) {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const duration = videoEl.duration;
      // Sample evenly spaced frames, skip first/last 0.1s
      const start = 0.1;
      const end = Math.max(duration - 0.1, start + 0.1);
      const interval = (end - start) / Math.max(numFrames - 1, 1);
      const times = [];
      for (let i = 0; i < numFrames; i++) {
        times.push(start + i * interval);
      }

      const frames = []; // { blob, time }
      let idx = 0;

      function seekNext() {
        if (idx >= times.length) {
          resolve(frames);
          return;
        }
        videoEl.currentTime = times[idx];
      }

      videoEl.onseeked = () => {
        canvas.width = videoEl.videoWidth;
        canvas.height = videoEl.videoHeight;
        ctx.drawImage(videoEl, 0, 0);
        canvas.toBlob((blob) => {
          frames.push({ blob, time: times[idx] });
          idx++;
          seekNext();
        }, 'image/jpeg', 0.85);
      };

      seekNext();
    });
  }

  // --- Detection ---
  btnDetect.addEventListener('click', async () => {
    if (!selectedFile) return;
    if (!ApiService.hasApiKey()) {
      showError('API key belum diatur. Buka pengaturan untuk memasukkan API key.');
      return;
    }

    showLoading();
    hideResults();
    hideError();

    try {
      if (isImage) {
        setLoadingState('Menganalisis gambar...', 'Model AI sedang memproses file Anda');
        const result = await ApiService.predict(selectedFile);
        const detections = parseDetections(result);
        showImageResults(detections);
      } else {
        // Video: extract frames client-side, send each as image
        setLoadingState('Menyiapkan video...', 'Mengekstrak frame dari video');
        const video = previewVideo;

        // Wait for video to be ready
        if (video.readyState < 2) {
          await new Promise((res) => { video.onloadeddata = res; });
        }

        const duration = video.duration;
        // 1 frame per second, min 1, max 30
        const numFrames = Math.max(1, Math.min(30, Math.floor(duration)));
        const frames = await extractFramesFromVideo(video, numFrames);

        setLoadingState('Mendeteksi tandan...', `Frame 0 / ${frames.length}`, 0);

        const allFrameResults = [];
        const frameImages = []; // store blob URLs for drawing

        for (let i = 0; i < frames.length; i++) {
          setLoadingState(
            'Mendeteksi tandan...',
            `Frame ${i + 1} / ${frames.length}`,
            Math.round(((i + 1) / frames.length) * 100)
          );

          const file = new File([frames[i].blob], `frame_${i}.jpg`, { type: 'image/jpeg' });
          const result = await ApiService.predict(file);
          const detections = parseDetections(result);
          allFrameResults.push(detections);
          frameImages.push(URL.createObjectURL(frames[i].blob));
        }

        showVideoResults(allFrameResults, frameImages);
      }
    } catch (err) {
      showError(err.message || 'Terjadi kesalahan saat menghubungi server.');
    } finally {
      hideLoading();
    }
  });

  function parseDetections(result) {
    if (result && result.images && Array.isArray(result.images)) {
      return result.images[0].results || result.images[0].detections || [];
    } else if (result && result.results && Array.isArray(result.results)) {
      return result.results;
    } else if (Array.isArray(result)) {
      return result;
    } else if (result && result.data) {
      if (Array.isArray(result.data)) {
        return result.data;
      } else if (result.data.images) {
        return result.data.images[0].results || [];
      }
    }
    return [];
  }

  function showImageResults(detections) {
    resultsSection.classList.remove('hidden');
    imageResult.classList.remove('hidden');
    videoResult.classList.add('hidden');

    const count = detections.length;
    detectionCount.textContent = `${count} tandan terdeteksi`;

    const imgSrc = URL.createObjectURL(selectedFile);
    CanvasRenderer.drawImageWithBoxes(resultCanvas, imgSrc, detections);
    fillDetectionTable(detections);
  }

  let videoFrameImages = [];

  function showVideoResults(frames, frameImageUrls) {
    videoFrameResults = frames;
    videoFrameImages = frameImageUrls || [];
    currentFrameIndex = 0;

    resultsSection.classList.remove('hidden');
    imageResult.classList.add('hidden');
    videoResult.classList.remove('hidden');

    updateFrameNavigation();
    renderCurrentVideoFrame();
  }

  function renderCurrentVideoFrame() {
    const detections = videoFrameResults[currentFrameIndex] || [];
    const count = detections.length;
    detectionCount.textContent = `${count} tandan terdeteksi (Frame ${currentFrameIndex + 1})`;
    fillDetectionTable(detections);

    // Draw from extracted frame image
    if (videoFrameImages[currentFrameIndex]) {
      CanvasRenderer.drawImageWithBoxes(videoResultCanvas, videoFrameImages[currentFrameIndex], detections);
    } else {
      // Fallback: seek video
      const video = previewVideo;
      if (video.duration && videoFrameResults.length > 1) {
        const timePerFrame = video.duration / videoFrameResults.length;
        video.currentTime = currentFrameIndex * timePerFrame;
      }
      video.onseeked = () => {
        CanvasRenderer.drawVideoFrameWithBoxes(videoResultCanvas, video, detections);
        video.onseeked = null;
      };
      if (video.readyState >= 2) {
        CanvasRenderer.drawVideoFrameWithBoxes(videoResultCanvas, video, detections);
      }
    }
  }

  function updateFrameNavigation() {
    const total = videoFrameResults.length;
    frameIndicator.textContent = `Frame ${currentFrameIndex + 1} / ${total}`;
    btnPrevFrame.disabled = currentFrameIndex <= 0;
    btnNextFrame.disabled = currentFrameIndex >= total - 1;
  }

  btnPrevFrame.addEventListener('click', () => {
    if (currentFrameIndex > 0) {
      currentFrameIndex--;
      updateFrameNavigation();
      renderCurrentVideoFrame();
    }
  });

  btnNextFrame.addEventListener('click', () => {
    if (currentFrameIndex < videoFrameResults.length - 1) {
      currentFrameIndex++;
      updateFrameNavigation();
      renderCurrentVideoFrame();
    }
  });

  function fillDetectionTable(detections) {
    detectionTableBody.innerHTML = '';
    if (!detections.length) {
      detectionTableBody.innerHTML = '<tr><td colspan="4" style="padding:2rem;text-align:center;color:var(--c-text-dim);">Tidak ada tandan terdeteksi</td></tr>';
      return;
    }

    detections.forEach((det, i) => {
      const name = det.name || String(det.class || 'object');
      const conf = det.confidence !== undefined ? det.confidence : det.conf;
      const box = det.box || det.bbox || {};
      const x1 = Math.round(box.x1 !== undefined ? box.x1 : (box[0] || 0));
      const y1 = Math.round(box.y1 !== undefined ? box.y1 : (box[1] || 0));
      const x2 = Math.round(box.x2 !== undefined ? box.x2 : (box[2] || 0));
      const y2 = Math.round(box.y2 !== undefined ? box.y2 : (box[3] || 0));
      const confPct = (conf * 100).toFixed(1);
      const color = CanvasRenderer.getColor(i % 10);

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="mono">${i + 1}</td>
        <td><div class="cell-class"><span class="color-dot" style="background:${color}"></span>${escapeHtml(name)}</div></td>
        <td><span class="conf-bar"><span class="conf-fill" style="width:${confPct}%;background:${color}"></span></span><span class="mono">${confPct}%</span></td>
        <td class="mono">[${x1}, ${y1}, ${x2}, ${y2}]</td>
      `;
      detectionTableBody.appendChild(tr);
    });
  }

  // --- Download ---
  btnDownload.addEventListener('click', async () => {
    const canvas = imageResult.classList.contains('hidden') ? videoResultCanvas : resultCanvas;
    const blob = await CanvasRenderer.canvasToBlob(canvas);
    if (!blob) return;

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'hasil-deteksi-tandan-sawit.png';
    a.click();
    URL.revokeObjectURL(url);
  });

  // --- Helpers ---
  function showLoading() {
    loadingSection.classList.remove('hidden');
    btnDetect.disabled = true;
    setLoadingState();
  }

  function hideLoading() {
    loadingSection.classList.add('hidden');
    btnDetect.disabled = false;
    loadingProgress.classList.add('hidden');
    loadingProgressBar.style.width = '0%';
    checkApiKey();
  }

  function showError(msg) {
    errorSection.classList.remove('hidden');
    errorMessage.textContent = msg;
  }

  function hideError() {
    errorSection.classList.add('hidden');
  }

  function hideResults() {
    resultsSection.classList.add('hidden');
    imageResult.classList.add('hidden');
    videoResult.classList.add('hidden');
  }

  function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
});
