document.addEventListener('DOMContentLoaded', () => {
  // --- Elements ---
  const btnSettings = document.getElementById('btn-settings');
  const settingsPanel = document.getElementById('settings-panel');
  const inputApiKey = document.getElementById('input-apikey');
  const btnToggleKey = document.getElementById('btn-toggle-key');
  const btnSaveKey = document.getElementById('btn-save-key');
  const apikeyStatus = document.getElementById('apikey-status');
  const apikeyWarning = document.getElementById('apikey-warning');
  const sliderConf = document.getElementById('slider-conf');
  const sliderIou = document.getElementById('slider-iou');
  const sliderImgsz = document.getElementById('slider-imgsz');
  const confValue = document.getElementById('conf-value');
  const iouValue = document.getElementById('iou-value');
  const imgszValue = document.getElementById('imgsz-value');
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

  // --- Init ---
  initSettings();
  checkApiKey();

  // --- Settings ---
  btnSettings.addEventListener('click', () => {
    settingsPanel.classList.toggle('hidden');
  });

  function initSettings() {
    const settings = ApiService.getSettings();
    sliderConf.value = settings.conf;
    sliderIou.value = settings.iou;
    sliderImgsz.value = settings.imgsz;
    confValue.textContent = settings.conf;
    iouValue.textContent = settings.iou;
    imgszValue.textContent = settings.imgsz;

    if (ApiService.hasApiKey()) {
      inputApiKey.value = ApiService.getApiKey();
    }
  }

  sliderConf.addEventListener('input', () => {
    confValue.textContent = sliderConf.value;
    saveCurrentSettings();
  });
  sliderIou.addEventListener('input', () => {
    iouValue.textContent = sliderIou.value;
    saveCurrentSettings();
  });
  sliderImgsz.addEventListener('input', () => {
    imgszValue.textContent = sliderImgsz.value;
    saveCurrentSettings();
  });

  function saveCurrentSettings() {
    ApiService.saveSettings({
      conf: sliderConf.value,
      iou: sliderIou.value,
      imgsz: sliderImgsz.value,
    });
  }

  // --- API Key ---
  btnToggleKey.addEventListener('click', () => {
    inputApiKey.type = inputApiKey.type === 'password' ? 'text' : 'password';
  });

  btnSaveKey.addEventListener('click', () => {
    const key = inputApiKey.value.trim();
    if (!key) {
      apikeyStatus.textContent = 'API key tidak boleh kosong.';
      apikeyStatus.className = 'text-xs mt-1 text-red-500';
      return;
    }
    ApiService.setApiKey(key);
    apikeyStatus.textContent = 'API key berhasil disimpan!';
    apikeyStatus.className = 'text-xs mt-1 text-green-600';
    checkApiKey();
    setTimeout(() => { apikeyStatus.textContent = ''; }, 3000);
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
    uploadZone.classList.add('upload-drag-active');
  });

  uploadZone.addEventListener('dragleave', () => {
    uploadZone.classList.remove('upload-drag-active');
  });

  uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadZone.classList.remove('upload-drag-active');
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

    // Show preview
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

  // --- Detection ---
  btnDetect.addEventListener('click', async () => {
    if (!selectedFile) return;
    if (!ApiService.hasApiKey()) {
      showError('API key belum diatur. Klik pengaturan untuk memasukkan API key.');
      return;
    }

    showLoading();
    hideResults();
    hideError();

    try {
      const result = await ApiService.predict(selectedFile);
      handleResult(result);
    } catch (err) {
      showError(err.message || 'Terjadi kesalahan saat menghubungi server.');
    } finally {
      hideLoading();
    }
  });

  function handleResult(result) {
    // Ultralytics API response can vary. Normalize:
    // Could be: { images: [{ results: [...] }] }
    // Or: { results: [...] }
    // Or: [ { ... } ] (array of detections)
    // Or: { data: [...] }

    let detections = [];
    let frameResults = null;

    if (result && result.images && Array.isArray(result.images)) {
      // Multi-frame (video) or single image
      if (result.images.length > 1) {
        frameResults = result.images.map(img => img.results || []);
      } else {
        detections = result.images[0].results || result.images[0].detections || [];
      }
    } else if (result && result.results && Array.isArray(result.results)) {
      detections = result.results;
    } else if (Array.isArray(result)) {
      detections = result;
    } else if (result && result.data) {
      if (Array.isArray(result.data)) {
        detections = result.data;
      } else if (result.data.images) {
        const images = result.data.images;
        if (images.length > 1) {
          frameResults = images.map(img => img.results || []);
        } else {
          detections = images[0].results || [];
        }
      }
    }

    if (frameResults) {
      showVideoResults(frameResults);
    } else {
      showImageResults(detections);
    }
  }

  function showImageResults(detections) {
    resultsSection.classList.remove('hidden');
    imageResult.classList.remove('hidden');
    videoResult.classList.add('hidden');

    const count = detections.length;
    detectionCount.textContent = `${count} pohon terdeteksi`;

    // Draw on canvas
    const imgSrc = URL.createObjectURL(selectedFile);
    CanvasRenderer.drawImageWithBoxes(resultCanvas, imgSrc, detections);

    // Fill table
    fillDetectionTable(detections);
  }

  function showVideoResults(frames) {
    videoFrameResults = frames;
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
    detectionCount.textContent = `${count} pohon terdeteksi (Frame ${currentFrameIndex + 1})`;
    fillDetectionTable(detections);

    // Seek video to approximate time and draw
    const video = previewVideo;
    if (video.duration && videoFrameResults.length > 1) {
      const timePerFrame = video.duration / videoFrameResults.length;
      video.currentTime = currentFrameIndex * timePerFrame;
    }

    video.onseeked = () => {
      CanvasRenderer.drawVideoFrameWithBoxes(videoResultCanvas, video, detections);
      video.onseeked = null;
    };

    // If video is already at correct time or single frame
    if (video.readyState >= 2) {
      CanvasRenderer.drawVideoFrameWithBoxes(videoResultCanvas, video, detections);
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
      detectionTableBody.innerHTML = '<tr><td colspan="4" class="px-4 py-6 text-center text-gray-400">Tidak ada pohon sawit terdeteksi</td></tr>';
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
      tr.className = 'border-t border-gray-100';
      tr.innerHTML = `
        <td class="px-4 py-2 text-gray-500">${i + 1}</td>
        <td class="px-4 py-2">
          <span class="inline-block w-2.5 h-2.5 rounded-full mr-1.5" style="background:${color}"></span>
          ${escapeHtml(name)}
        </td>
        <td class="px-4 py-2">
          <div class="flex items-center gap-2">
            <div class="conf-bar w-16"><div class="conf-bar-fill" style="width:${confPct}%;background:${color}"></div></div>
            <span class="text-gray-700">${confPct}%</span>
          </div>
        </td>
        <td class="px-4 py-2 text-gray-500 text-xs font-mono">[${x1}, ${y1}, ${x2}, ${y2}]</td>
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
    a.download = 'hasil-deteksi-sawit.png';
    a.click();
    URL.revokeObjectURL(url);
  });

  // --- Helpers ---
  function showLoading() {
    loadingSection.classList.remove('hidden');
    btnDetect.disabled = true;
  }

  function hideLoading() {
    loadingSection.classList.add('hidden');
    btnDetect.disabled = false;
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
