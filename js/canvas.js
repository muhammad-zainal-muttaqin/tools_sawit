const COLORS = [
  '#22c55e', '#3b82f6', '#ef4444', '#f59e0b', '#8b5cf6',
  '#ec4899', '#06b6d4', '#f97316', '#14b8a6', '#6366f1',
];

const CanvasRenderer = {
  getColor(index) {
    return COLORS[index % COLORS.length];
  },

  /**
   * Get a stable color for a track ID (deterministic hash to color index).
   */
  getTrackColor(trackId) {
    if (trackId === undefined || trackId === null) return COLORS[0];
    return COLORS[trackId % COLORS.length];
  },

  drawImageWithBoxes(canvas, imageSrc, detections) {
    return new Promise((resolve) => {
      const ctx = canvas.getContext('2d');
      const img = new Image();
      img.crossOrigin = 'anonymous';

      img.onload = () => {
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        ctx.drawImage(img, 0, 0);

        this.drawDetections(ctx, detections, img.naturalWidth, img.naturalHeight);
        resolve();
      };

      img.onerror = () => {
        resolve();
      };

      img.src = imageSrc;
    });
  },

  drawVideoFrameWithBoxes(canvas, videoElement, detections) {
    const ctx = canvas.getContext('2d');
    canvas.width = videoElement.videoWidth;
    canvas.height = videoElement.videoHeight;
    ctx.drawImage(videoElement, 0, 0);
    this.drawDetections(ctx, detections, videoElement.videoWidth, videoElement.videoHeight);
  },

  drawDetections(ctx, detections, canvasWidth, canvasHeight) {
    if (!detections || !detections.length) return;

    // Fallback class-based color map for image mode (no trackId)
    const hasTrackIds = detections.some(d => d.trackId !== undefined);
    let classMap = {};
    let classIdx = 0;
    if (!hasTrackIds) {
      detections.forEach(d => {
        const cls = d.class !== undefined ? d.class : (d.name || 'object');
        if (!(cls in classMap)) {
          classMap[cls] = classIdx++;
        }
      });
    }

    detections.forEach((det) => {
      const box = det.box || det.bbox;
      if (!box) return;

      const x1 = box.x1 !== undefined ? box.x1 : box[0];
      const y1 = box.y1 !== undefined ? box.y1 : box[1];
      const x2 = box.x2 !== undefined ? box.x2 : box[2];
      const y2 = box.y2 !== undefined ? box.y2 : box[3];

      const cls = det.class !== undefined ? det.class : (det.name || 'object');
      const name = det.name || String(cls);
      const conf = det.confidence !== undefined ? det.confidence : det.conf;

      // Color by track ID if available, otherwise by class
      const color = hasTrackIds
        ? this.getTrackColor(det.trackId)
        : this.getColor(classMap[cls] || 0);

      const lineWidth = Math.max(2, Math.min(canvasWidth, canvasHeight) * 0.003);
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);

      // Label: include track ID if available
      const trackPrefix = det.trackId !== undefined ? `#${det.trackId} ` : '';
      const label = `${trackPrefix}${name} ${(conf * 100).toFixed(1)}%`;
      const fontSize = Math.max(12, Math.min(canvasWidth, canvasHeight) * 0.018);
      ctx.font = `bold ${fontSize}px sans-serif`;
      const textMetrics = ctx.measureText(label);
      const textHeight = fontSize + 4;
      const padding = 4;

      const labelY = y1 - textHeight - 2 > 0 ? y1 - textHeight - 2 : y1;

      ctx.fillStyle = color;
      ctx.fillRect(x1, labelY, textMetrics.width + padding * 2, textHeight);

      ctx.fillStyle = '#ffffff';
      ctx.fillText(label, x1 + padding, labelY + fontSize);
    });
  },

  canvasToBlob(canvas) {
    return new Promise((resolve) => {
      canvas.toBlob(resolve, 'image/png');
    });
  }
};
