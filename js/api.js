const API_BASE_URL = 'https://predict-69946db62c5eac9cd6df-dproatj77a-as.a.run.app';

const ApiService = {
  getApiKey() {
    return localStorage.getItem('ultralytics_api_key') || '';
  },

  setApiKey(key) {
    localStorage.setItem('ultralytics_api_key', key);
  },

  hasApiKey() {
    return !!this.getApiKey();
  },

  getSettings() {
    return {
      conf: parseFloat(localStorage.getItem('setting_conf') || '0.25'),
      iou: parseFloat(localStorage.getItem('setting_iou') || '0.45'),
      imgsz: parseInt(localStorage.getItem('setting_imgsz') || '640', 10),
    };
  },

  saveSettings(settings) {
    localStorage.setItem('setting_conf', settings.conf);
    localStorage.setItem('setting_iou', settings.iou);
    localStorage.setItem('setting_imgsz', settings.imgsz);
  },

  async predict(file) {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new Error('API key belum diatur. Silakan masukkan API key di pengaturan.');
    }

    const settings = this.getSettings();
    const formData = new FormData();
    formData.append('file', file);
    formData.append('conf', settings.conf);
    formData.append('iou', settings.iou);
    formData.append('imgsz', settings.imgsz);

    const response = await fetch(API_BASE_URL + '/predict', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
      },
      body: formData,
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new Error('API key tidak valid atau tidak memiliki akses. Periksa kembali API key Anda.');
      }
      if (response.status === 413) {
        throw new Error('File terlalu besar. Coba gunakan file yang lebih kecil.');
      }
      const text = await response.text();
      throw new Error(`Server error (${response.status}): ${text || 'Unknown error'}`);
    }

    return response.json();
  },

  async predictBatchSequential(files, onProgress) {
    const results = [];
    const safeFiles = Array.isArray(files) ? files : [];
    for (let i = 0; i < safeFiles.length; i++) {
      if (typeof onProgress === 'function') {
        onProgress({ index: i, total: safeFiles.length, phase: 'start' });
      }
      const result = await this.predict(safeFiles[i]);
      results.push(result);
      if (typeof onProgress === 'function') {
        onProgress({ index: i + 1, total: safeFiles.length, phase: 'done' });
      }
    }
    return results;
  }
};
