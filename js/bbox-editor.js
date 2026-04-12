'use strict';

/**
 * BBoxEditor — interactive canvas for editing bounding boxes on a single image.
 *
 * Usage:
 *   const editor = BBoxEditor.create(canvasEl, imageUrl, bboxes, onUpdate);
 *   editor.destroy();
 *   editor.syncBboxes(newBboxes);
 *
 * Interactions:
 *   Drag empty area   → draw new bbox (default class B2)
 *   Click bbox        → select
 *   Drag selected     → move
 *   Drag handle       → resize (8 handles: 4 corner + 4 edge)
 *   Delete/Backspace  → delete selected
 *   Keys 1/2/3/4      → change selected class to B1-B4
 *   Escape            → deselect
 */

const BBoxEditor = (() => {
  // Handle size in canvas pixels
  const HANDLE_R = 6;
  const MIN_BBOX_PX = 4; // minimum bbox size in image pixels

  // Default class for newly drawn bboxes (classId 1 = B2 in 0-indexed dataset)
  const DEFAULT_CLASS_ID = 1;

  let _idSeq = 0;
  function _newId() { return 'nb' + (_idSeq++); }

  // ── Magnifier (module-level — persists across side switches) ──────────────

  const MAG_SIZE      = 230;  // match .dedup-magnifier CSS width/height
  const MAG_ZOOM_MIN  = 1.5;
  const MAG_ZOOM_MAX  = 8.0;
  const MAG_ZOOM_STEP = 0.3;
  let _magEnabled = false;
  let _magZoom    = 3.8;
  let _magEl = null, _magCanvas = null, _magCtx = null;

  function _ensureMagEl() {
    if (_magEl) return;
    _magEl = document.createElement('div');
    _magEl.className = 'dedup-magnifier'; // reuse same CSS class
    _magCanvas = document.createElement('canvas');
    const dpr = window.devicePixelRatio || 1;
    _magCanvas.width  = MAG_SIZE * dpr;
    _magCanvas.height = MAG_SIZE * dpr;
    _magCanvas.style.width  = MAG_SIZE + 'px';
    _magCanvas.style.height = MAG_SIZE + 'px';
    _magEl.appendChild(_magCanvas);
    document.body.appendChild(_magEl);
    _magCtx = _magCanvas.getContext('2d');
  }

  function _hideMag() {
    if (_magEl) _magEl.style.display = 'none';
  }

  function _showMagAt(canvas, img, tr, bboxes, selectedId, e) {
    if (!img || !tr) { _hideMag(); return; }
    _ensureMagEl();

    const dpr    = window.devicePixelRatio || 1;
    const rect   = canvas.getBoundingClientRect();
    const cssX   = e.clientX - rect.left;
    const cssY   = e.clientY - rect.top;

    const { x: imgX, y: imgY } = tr.canvasToImage(cssX * dpr, cssY * dpr);

    const halfW = (MAG_SIZE / 2) / _magZoom;
    const halfH = (MAG_SIZE / 2) / _magZoom;
    const srcX  = imgX - halfW, srcY = imgY - halfH;

    const ctx = _magCtx;
    ctx.clearRect(0, 0, _magCanvas.width, _magCanvas.height);

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, _magCanvas.width, _magCanvas.height);
    ctx.clip();

    // Zoomed image region
    ctx.drawImage(img, srcX, srcY, halfW * 2, halfH * 2,
                  0, 0, _magCanvas.width, _magCanvas.height);

    // Bboxes in magnified coords
    const magScale = _magZoom * dpr;
    bboxes.forEach((b, idx) => {
      const isSelected = b.id === selectedId;
      const color = CanvasRenderer.getClassColor(b.className);

      const mx1 = (b.x1 - srcX) * magScale;
      const my1 = (b.y1 - srcY) * magScale;
      const mx2 = (b.x2 - srcX) * magScale;
      const my2 = (b.y2 - srcY) * magScale;
      const mw = mx2 - mx1, mh = my2 - my1;

      if (isSelected) {
        ctx.fillStyle = color + '30';
        ctx.fillRect(mx1, my1, mw, mh);
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = isSelected ? 3 * dpr : 1.5 * dpr;
      ctx.strokeRect(mx1, my1, mw, mh);

      if (mw > 10) {
        const fs = Math.max(10, 11 * dpr);
        ctx.font = `bold ${fs}px sans-serif`;
        const lbl = `#${idx + 1} ${b.className}`;
        ctx.fillStyle = color;
        ctx.fillRect(mx1, Math.max(0, my1 - fs - 2), ctx.measureText(lbl).width + 4, fs + 2);
        ctx.fillStyle = '#fff';
        ctx.fillText(lbl, mx1 + 2, Math.max(fs, my1 - 2));
      }
    });

    // Crosshair
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    const cx = _magCanvas.width / 2, cy = _magCanvas.height / 2;
    ctx.beginPath();
    ctx.moveTo(cx, 0);    ctx.lineTo(cx, _magCanvas.height);
    ctx.moveTo(0, cy);    ctx.lineTo(_magCanvas.width, cy);
    ctx.stroke();
    ctx.setLineDash([]);

    // Zoom badge
    const zoomTxt = _magZoom.toFixed(1) + '×';
    const fs = Math.round(11 * dpr);
    ctx.font = `bold ${fs}px monospace`;
    const tw = ctx.measureText(zoomTxt).width;
    const bx = _magCanvas.width  - tw - Math.round(6 * dpr);
    const by = _magCanvas.height - Math.round(4 * dpr);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(bx - 2, by - fs - 2, tw + 6, fs + 4);
    ctx.fillStyle = '#facc15';
    ctx.fillText(zoomTxt, bx, by);

    ctx.restore();

    // Position: above-right cursor, flip near edge
    const off = 18;
    let left = e.clientX + off;
    let top  = e.clientY - MAG_SIZE - off;
    if (left + MAG_SIZE > window.innerWidth - 4)  left = e.clientX - MAG_SIZE - off;
    if (top < 4) top = e.clientY + off;

    _magEl.style.display = 'block';
    _magEl.style.left    = left + 'px';
    _magEl.style.top     = top  + 'px';
  }

  // ── Coordinate transforms ─────────────────────────────────────────────────

  function _makeTransforms(canvas, imgW, imgH) {
    const dpr = window.devicePixelRatio || 1;
    const displayW = canvas.clientWidth;
    const displayH = canvas.clientHeight;

    // Fit image into canvas, maintain aspect ratio
    const scale = Math.min(displayW / imgW, displayH / imgH);
    const offX = (displayW - imgW * scale) / 2;
    const offY = (displayH - imgH * scale) / 2;

    return {
      scale,
      canvasToImage(cx, cy) {
        return {
          x: (cx / dpr - offX) / scale,
          y: (cy / dpr - offY) / scale,
        };
      },
      imageToCanvas(ix, iy) {
        return {
          x: (ix * scale + offX) * dpr,
          y: (iy * scale + offY) * dpr,
        };
      },
      scaleToCanvas(v) { return v * scale * dpr; },
    };
  }

  // ── Handle hit testing ────────────────────────────────────────────────────

  function _getHandles(b, tr) {
    const mx = (b.x1 + b.x2) / 2, my = (b.y1 + b.y2) / 2;
    return [
      { id: 'nw', ix: b.x1, iy: b.y1 },
      { id: 'n',  ix: mx,   iy: b.y1 },
      { id: 'ne', ix: b.x2, iy: b.y1 },
      { id: 'e',  ix: b.x2, iy: my   },
      { id: 'se', ix: b.x2, iy: b.y2 },
      { id: 's',  ix: mx,   iy: b.y2 },
      { id: 'sw', ix: b.x1, iy: b.y2 },
      { id: 'w',  ix: b.x1, iy: my   },
    ].map(h => {
      const c = tr.imageToCanvas(h.ix, h.iy);
      return { ...h, cx: c.x, cy: c.y };
    });
  }

  function _hitHandle(handles, cx, cy) {
    for (const h of handles) {
      const dx = cx - h.cx, dy = cy - h.cy;
      if (dx * dx + dy * dy <= (HANDLE_R * 2) * (HANDLE_R * 2)) return h;
    }
    return null;
  }

  function _hitBbox(bboxes, ix, iy) {
    // Last drawn = topmost, iterate reversed
    for (let i = bboxes.length - 1; i >= 0; i--) {
      const b = bboxes[i];
      if (ix >= b.x1 && ix <= b.x2 && iy >= b.y1 && iy <= b.y2) return b;
    }
    return null;
  }

  // ── Cursor per handle direction ────────────────────────────────────────────

  const HANDLE_CURSORS = {
    nw: 'nw-resize', ne: 'ne-resize', se: 'se-resize', sw: 'sw-resize',
    n: 'n-resize',   s: 's-resize',
    e: 'e-resize',   w: 'w-resize',
  };

  // ── Drawing ────────────────────────────────────────────────────────────────

  function _render(state) {
    const { canvas, ctx, image, bboxes, selectedId, hoveredId, tr } = state;
    const dpr = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw image
    if (image) {
      const tl = tr.imageToCanvas(0, 0);
      const br = tr.imageToCanvas(image.naturalWidth, image.naturalHeight);
      ctx.drawImage(image, tl.x, tl.y, br.x - tl.x, br.y - tl.y);
    }

    const lineW = Math.max(1.5, tr.scaleToCanvas(1.5));

    bboxes.forEach((b, idx) => {
      const tl = tr.imageToCanvas(b.x1, b.y1);
      const br = tr.imageToCanvas(b.x2, b.y2);
      const w  = br.x - tl.x, h = br.y - tl.y;
      const color = CanvasRenderer.getClassColor(b.className);
      const isSelected = b.id === selectedId;
      const isHovered  = b.id === hoveredId;

      // Box fill (semi-transparent on hover/select)
      if (isSelected || isHovered) {
        ctx.fillStyle = color + '22';
        ctx.fillRect(tl.x, tl.y, w, h);
      }

      // Box stroke
      ctx.strokeStyle = color;
      ctx.lineWidth = isSelected ? lineW * 2 : lineW;
      ctx.strokeRect(tl.x, tl.y, w, h);

      // Label: "#index className"
      const label = `#${idx + 1} ${b.className}`;
      const fontSize = Math.max(11, tr.scaleToCanvas(12));
      ctx.font = `bold ${fontSize}px sans-serif`;
      const tw = ctx.measureText(label).width;
      const pad = 3;
      const lx = tl.x, ly = tl.y - fontSize - pad;
      ctx.fillStyle = color;
      ctx.fillRect(lx, Math.max(0, ly), tw + pad * 2, fontSize + pad);
      ctx.fillStyle = '#fff';
      ctx.fillText(label, lx + pad, Math.max(fontSize, ly + fontSize));

      // Resize handles for selected
      if (isSelected) {
        const handles = _getHandles(b, tr);
        for (const h of handles) {
          ctx.fillStyle = '#fff';
          ctx.strokeStyle = color;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(h.cx, h.cy, HANDLE_R, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
      }
    });

    // Draw-in-progress rectangle
    if (state.dragState && state.dragState.mode === 'draw') {
      const d = state.dragState;
      const tl = tr.imageToCanvas(Math.min(d.ix0, d.ix1), Math.min(d.iy0, d.iy1));
      const br = tr.imageToCanvas(Math.max(d.ix0, d.ix1), Math.max(d.iy0, d.iy1));
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);
      ctx.setLineDash([]);
    }
  }

  // ── Factory ───────────────────────────────────────────────────────────────

  function create(canvas, imageUrl, initialBboxes, onUpdate) {
    let bboxes = (initialBboxes || []).map(b => ({ ...b }));
    let selectedId = null;
    let hoveredId  = null;
    let image = null;
    let tr = null;
    let dragState = null;
    let destroyed = false;

    const dpr = window.devicePixelRatio || 1;

    function _resize() {
      canvas.width  = canvas.clientWidth  * dpr;
      canvas.height = canvas.clientHeight * dpr;
      if (image) tr = _makeTransforms(canvas, image.naturalWidth, image.naturalHeight);
      _render(state);
    }

    const ctx = canvas.getContext('2d');

    const state = {
      get canvas() { return canvas; },
      get ctx() { return ctx; },
      get image() { return image; },
      get bboxes() { return bboxes; },
      get selectedId() { return selectedId; },
      get hoveredId() { return hoveredId; },
      get tr() { return tr; },
      get dragState() { return dragState; },
    };

    // Load image
    const img = new Image();
    img.onload = () => {
      image = img;
      canvas.width  = canvas.clientWidth  * dpr;
      canvas.height = canvas.clientHeight * dpr;
      tr = _makeTransforms(canvas, img.naturalWidth, img.naturalHeight);
      _render(state);
    };
    img.src = imageUrl;

    // ── Event Handlers ───────────────────────────────────────────────────────

    function _canvasCoords(e) {
      const rect = canvas.getBoundingClientRect();
      return {
        cx: (e.clientX - rect.left) * dpr,
        cy: (e.clientY - rect.top)  * dpr,
      };
    }

    function _clampToImage(ix, iy) {
      return {
        ix: Math.max(0, Math.min(image.naturalWidth,  ix)),
        iy: Math.max(0, Math.min(image.naturalHeight, iy)),
      };
    }

    function onMouseDown(e) {
      if (!image || !tr) return;
      e.preventDefault();
      const { cx, cy } = _canvasCoords(e);
      const imgPt = tr.canvasToImage(cx, cy);
      const { ix, iy } = _clampToImage(imgPt.x, imgPt.y);

      // Check handle first (only if something selected)
      if (selectedId) {
        const sel = bboxes.find(b => b.id === selectedId);
        if (sel) {
          const handles = _getHandles(sel, tr);
          const hit = _hitHandle(handles, cx, cy);
          if (hit) {
            dragState = { mode: 'resize', handleId: hit.id, bboxId: selectedId, ix0: ix, iy0: iy, orig: { ...sel } };
            return;
          }
        }
      }

      // Check bbox hit
      const hit = _hitBbox(bboxes, ix, iy);
      if (hit) {
        selectedId = hit.id;
        dragState = { mode: 'move', bboxId: hit.id, ix0: ix, iy0: iy, orig: { ...hit } };
        _render(state);
        return;
      }

      // Start drawing new bbox
      selectedId = null;
      dragState = { mode: 'draw', ix0: ix, iy0: iy, ix1: ix, iy1: iy };
      _render(state);
    }

    // Cache last mouse event for wheel re-render
    let _lastMagE = null;

    function onMouseMove(e) {
      if (!image || !tr) return;
      const { cx, cy } = _canvasCoords(e);
      const imgPt = tr.canvasToImage(cx, cy);
      const { ix, iy } = _clampToImage(imgPt.x, imgPt.y);

      if (_magEnabled && !dragState) {
        _lastMagE = e;
        _showMagAt(canvas, image, tr, bboxes, selectedId, e);
      }

      if (dragState) {
        if (dragState.mode === 'draw') {
          dragState.ix1 = ix;
          dragState.iy1 = iy;
        } else if (dragState.mode === 'move') {
          const dx = ix - dragState.ix0, dy = iy - dragState.iy0;
          const o = dragState.orig;
          const w = o.x2 - o.x1, h = o.y2 - o.y1;
          let nx1 = o.x1 + dx, ny1 = o.y1 + dy;
          nx1 = Math.max(0, Math.min(image.naturalWidth  - w, nx1));
          ny1 = Math.max(0, Math.min(image.naturalHeight - h, ny1));
          const idx = bboxes.findIndex(b => b.id === dragState.bboxId);
          if (idx !== -1) {
            bboxes[idx] = { ...bboxes[idx], x1: nx1, y1: ny1, x2: nx1 + w, y2: ny1 + h };
          }
        } else if (dragState.mode === 'resize') {
          const idx = bboxes.findIndex(b => b.id === dragState.bboxId);
          if (idx !== -1) {
            const o = dragState.orig;
            let { x1, y1, x2, y2 } = o;
            const h = dragState.handleId;
            if (h.includes('w')) x1 = Math.min(ix, x2 - MIN_BBOX_PX);
            if (h.includes('e')) x2 = Math.max(ix, x1 + MIN_BBOX_PX);
            if (h.includes('n')) y1 = Math.min(iy, y2 - MIN_BBOX_PX);
            if (h.includes('s')) y2 = Math.max(iy, y1 + MIN_BBOX_PX);
            x1 = Math.max(0, x1); y1 = Math.max(0, y1);
            x2 = Math.min(image.naturalWidth, x2);
            y2 = Math.min(image.naturalHeight, y2);
            bboxes[idx] = { ...bboxes[idx], x1, y1, x2, y2 };
          }
        }
        _render(state);
        return;
      }

      // Hover detection
      const prevHover = hoveredId;
      if (selectedId) {
        const sel = bboxes.find(b => b.id === selectedId);
        if (sel) {
          const handles = _getHandles(sel, tr);
          const hit = _hitHandle(handles, cx, cy);
          if (hit) { canvas.style.cursor = HANDLE_CURSORS[hit.id]; hoveredId = null; }
          else {
            const hb = _hitBbox(bboxes, ix, iy);
            hoveredId = hb ? hb.id : null;
            canvas.style.cursor = hb ? 'move' : 'crosshair';
          }
        }
      } else {
        const hb = _hitBbox(bboxes, ix, iy);
        hoveredId = hb ? hb.id : null;
        canvas.style.cursor = hb ? 'pointer' : 'crosshair';
      }
      if (hoveredId !== prevHover) _render(state);
    }

    function onMouseUp(e) {
      if (!image || !tr || !dragState) return;
      e.preventDefault();

      if (dragState.mode === 'draw') {
        const x1 = Math.min(dragState.ix0, dragState.ix1);
        const y1 = Math.min(dragState.iy0, dragState.iy1);
        const x2 = Math.max(dragState.ix0, dragState.ix1);
        const y2 = Math.max(dragState.iy0, dragState.iy1);
        if (x2 - x1 >= MIN_BBOX_PX && y2 - y1 >= MIN_BBOX_PX) {
          const classId = DEFAULT_CLASS_ID;
          const newBbox = {
            id: _newId(),
            classId,
            className: CLASS_MAP[classId],
            x1, y1, x2, y2,
          };
          bboxes.push(newBbox);
          selectedId = newBbox.id;
          onUpdate && onUpdate([...bboxes]);
        }
      } else if (dragState.mode === 'move' || dragState.mode === 'resize') {
        onUpdate && onUpdate([...bboxes]);
      }

      dragState = null;
      _render(state);
    }

    function onKeyDown(e) {
      if (!selectedId) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        bboxes = bboxes.filter(b => b.id !== selectedId);
        selectedId = null;
        dragState = null;
        onUpdate && onUpdate([...bboxes]);
        _render(state);
      } else if (e.key === 'Escape') {
        selectedId = null;
        dragState = null;
        _render(state);
      } else if (['1', '2', '3', '4'].includes(e.key)) {
        // Key 1→classId 0 (B1), 2→1 (B2), 3→2 (B3), 4→3 (B4) — dataset is 0-indexed
        const classId = parseInt(e.key, 10) - 1;
        const idx = bboxes.findIndex(b => b.id === selectedId);
        if (idx !== -1) {
          bboxes[idx] = { ...bboxes[idx], classId, className: CLASS_MAP[classId] };
          onUpdate && onUpdate([...bboxes]);
          _render(state);
        }
      }
    }

    function onMouseLeave() { _hideMag(); _lastMagE = null; }

    function onWheel(e) {
      if (!_magEnabled || !_magEl || _magEl.style.display === 'none') return;
      e.preventDefault();
      const delta = e.deltaY > 0 ? -MAG_ZOOM_STEP : MAG_ZOOM_STEP;
      _magZoom = Math.min(MAG_ZOOM_MAX, Math.max(MAG_ZOOM_MIN,
                          parseFloat((_magZoom + delta).toFixed(1))));
      if (_lastMagE && image && tr) {
        _showMagAt(canvas, image, tr, bboxes, selectedId, _lastMagE);
      }
    }

    const _ro = new ResizeObserver(_resize);
    _ro.observe(canvas);

    canvas.addEventListener('mousedown',  onMouseDown);
    canvas.addEventListener('mousemove',  onMouseMove);
    canvas.addEventListener('mouseup',    onMouseUp);
    canvas.addEventListener('mouseleave', onMouseLeave);
    canvas.addEventListener('wheel',      onWheel, { passive: false });
    canvas.tabIndex = 0;
    canvas.addEventListener('keydown', onKeyDown);

    // ── Public API ────────────────────────────────────────────────────────────

    function syncBboxes(newBboxes) {
      bboxes = (newBboxes || []).map(b => ({ ...b }));
      selectedId = null;
      dragState = null;
      _render(state);
    }

    function getSelectedId() { return selectedId; }

    function destroy() {
      if (destroyed) return;
      destroyed = true;
      _ro.disconnect();
      canvas.removeEventListener('mousedown',  onMouseDown);
      canvas.removeEventListener('mousemove',  onMouseMove);
      canvas.removeEventListener('mouseup',    onMouseUp);
      canvas.removeEventListener('mouseleave', onMouseLeave);
      canvas.removeEventListener('wheel',      onWheel);
      canvas.removeEventListener('keydown',    onKeyDown);
      _hideMag();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    return { syncBboxes, getSelectedId, destroy };
  }

  // Static helpers so app.js can read/set magnifier state without an editor instance
  function getMagnifierEnabled() { return _magEnabled; }
  function setMagnifierGlobal(v) { _magEnabled = !!v; if (!_magEnabled) _hideMag(); }

  return { create, getMagnifierEnabled, setMagnifierGlobal };
})();

window.BBoxEditor = BBoxEditor;
