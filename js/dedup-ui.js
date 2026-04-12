'use strict';

/**
 * DedupUI — two-canvas side-by-side cross-side linking interface.
 *
 * Usage:
 *   DedupUI.init(leftCanvasEl, rightCanvasEl, suggestionsListEl, linksListEl);
 *   DedupUI.showPair(pairIndex);   // 0-3
 *   DedupUI.destroy();
 */

const DedupUI = (() => {
  // Link color palette (cyclic)
  const LINK_COLORS = [
    '#22c55e', '#3b82f6', '#f59e0b', '#ec4899',
    '#06b6d4', '#a855f7', '#ef4444', '#84cc16',
  ];

  let _leftCanvas, _rightCanvas, _suggEl, _linksEl;
  let _pairIndex = 0;
  let _leftImage = null, _rightImage = null;
  let _leftTr = null,    _rightTr = null;
  let _pendingLeft = null;   // bboxId selected on left canvas waiting for right click
  let _guideY = null;        // normalized Y for horizontal guideline
  let _destroyed = false;
  let _colorSeq = 0;
  let _listenersAttached = false;

  // Cached bboxes/highlights for magnifier use in mousemove
  let _lastBboxesLeft     = [], _lastBboxesRight     = [];
  let _lastHighlightsLeft = new Map(), _lastHighlightsRight = new Map();

  // ── Magnifier ──────────────────────────────────────────────────────────────
  const MAG_SIZE      = 230;   // CSS px side length of magnifier window
  const MAG_ZOOM_MIN  = 1.5;
  const MAG_ZOOM_MAX  = 8.0;
  const MAG_ZOOM_STEP = 0.3;
  let _magZoom = 3.8;          // adjustable via scroll wheel
  let _lastMagState = null;    // cached args for re-render on zoom change

  let _magEl = null, _magCanvas = null, _magCtx = null;

  function _ensureMagnifier() {
    if (_magEl) return;
    _magEl = document.createElement('div');
    _magEl.className = 'dedup-magnifier';
    _magCanvas = document.createElement('canvas');
    const magDpr = window.devicePixelRatio || 1;
    _magCanvas.width  = MAG_SIZE * magDpr;
    _magCanvas.height = MAG_SIZE * magDpr;
    _magCanvas.style.width  = MAG_SIZE + 'px';
    _magCanvas.style.height = MAG_SIZE + 'px';
    _magEl.appendChild(_magCanvas);
    document.body.appendChild(_magEl);
    _magCtx = _magCanvas.getContext('2d');
  }

  function _hideMagnifier() {
    if (_magEl) _magEl.style.display = 'none';
    _lastMagState = null;
  }

  function _onWheel(e) {
    if (!_magEl || _magEl.style.display === 'none') return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? -MAG_ZOOM_STEP : MAG_ZOOM_STEP;
    _magZoom = Math.min(MAG_ZOOM_MAX, Math.max(MAG_ZOOM_MIN,
                        parseFloat((_magZoom + delta).toFixed(1))));
    if (_lastMagState) {
      const s = _lastMagState;
      _showMagnifier(s.canvas, s.img, s.tr, s.bboxes, s.highlights, s.e);
    }
  }

  function _showMagnifier(sourceCanvas, img, tr, bboxes, highlights, e) {
    if (!img || !tr) { _hideMagnifier(); return; }
    _ensureMagnifier();

    // Cache state for scroll-wheel re-render
    _lastMagState = { canvas: sourceCanvas, img, tr, bboxes, highlights, e };

    const dpr    = _dpr();
    const magDpr = window.devicePixelRatio || 1;
    const rect   = sourceCanvas.getBoundingClientRect();
    const cssX   = e.clientX - rect.left;
    const cssY   = e.clientY - rect.top;

    // Image coords at cursor
    const { x: imgX, y: imgY } = tr.canvasToImage(cssX * dpr, cssY * dpr);

    // Source half-size in image pixels
    const halfW = (MAG_SIZE / 2) / _magZoom;
    const halfH = (MAG_SIZE / 2) / _magZoom;
    const srcX = imgX - halfW, srcY = imgY - halfH;

    const ctx = _magCtx;
    ctx.clearRect(0, 0, _magCanvas.width, _magCanvas.height);

    // Draw image region zoomed
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, _magCanvas.width, _magCanvas.height);
    ctx.clip();
    ctx.drawImage(img, srcX, srcY, halfW * 2, halfH * 2,
                  0, 0, _magCanvas.width, _magCanvas.height);

    // Draw bboxes in magnified coords
    const magScale = _magZoom * magDpr;
    bboxes.forEach(b => {
      const hi = highlights.get(b.id);
      let color = CanvasRenderer.getClassColor(b.className);
      if (hi) color = hi.color;
      if (b.id === _pendingLeft) color = '#fff';

      const mx1 = (b.x1 - srcX) * magScale;
      const my1 = (b.y1 - srcY) * magScale;
      const mx2 = (b.x2 - srcX) * magScale;
      const my2 = (b.y2 - srcY) * magScale;
      const mw  = mx2 - mx1, mh = my2 - my1;

      if (hi || b.id === _pendingLeft) {
        ctx.fillStyle = color + '30';
        ctx.fillRect(mx1, my1, mw, mh);
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = hi ? 3 * magDpr : 1.5 * magDpr;
      ctx.strokeRect(mx1, my1, mw, mh);

      // Label
      if (mw > 10) {
        const fs = Math.max(10, 11 * magDpr);
        ctx.font = `${fs}px sans-serif`;
        const lbl = b.className + (hi ? ` #${hi.num}` : '');
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

    // Zoom level badge (bottom-right corner)
    const zoomTxt = _magZoom.toFixed(1) + '×';
    const fs = Math.round(11 * magDpr);
    ctx.font = `bold ${fs}px monospace`;
    const tw = ctx.measureText(zoomTxt).width;
    const bx = _magCanvas.width  - tw - Math.round(6 * magDpr);
    const by = _magCanvas.height - Math.round(4 * magDpr);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(bx - 2, by - fs - 2, tw + 6, fs + 4);
    ctx.fillStyle = '#facc15';
    ctx.fillText(zoomTxt, bx, by);

    ctx.restore();

    // Position: above-right cursor, flip if near edge
    const off = 18;
    let left = e.clientX + off;
    let top  = e.clientY - MAG_SIZE - off;
    if (left + MAG_SIZE > window.innerWidth - 4)  left = e.clientX - MAG_SIZE - off;
    if (top < 4) top = e.clientY + off;

    _magEl.style.display = 'block';
    _magEl.style.left    = left + 'px';
    _magEl.style.top     = top  + 'px';
  }

  const _dpr = () => window.devicePixelRatio || 1;

  // ── Pair definitions ───────────────────────────────────────────────────────

  const PAIR_LABELS = [
    ['Depan', 'Kanan'],
    ['Kanan', 'Belakang'],
    ['Belakang', 'Kiri'],
    ['Kiri', 'Depan'],
  ];

  // ── Transforms ────────────────────────────────────────────────────────────

  function _makeTr(canvas, imgW, imgH) {
    const dpr = _dpr();
    const displayW = canvas.clientWidth;
    const displayH = canvas.clientHeight;
    const scale = Math.min(displayW / imgW, displayH / imgH);
    const offX = (displayW - imgW * scale) / 2;
    const offY = (displayH - imgH * scale) / 2;
    return {
      scale,
      imageToCanvas(ix, iy) {
        return { x: (ix * scale + offX) * dpr, y: (iy * scale + offY) * dpr };
      },
      canvasToImage(cx, cy) {
        return { x: (cx / dpr - offX) / scale, y: (cy / dpr - offY) / scale };
      },
      scaleToCanvas(v) { return v * scale * dpr; },
    };
  }

  // ── Color assignment for links ─────────────────────────────────────────────

  const _linkColorMap = new Map(); // linkId → color

  function _colorForLink(linkId) {
    if (!_linkColorMap.has(linkId)) {
      _linkColorMap.set(linkId, LINK_COLORS[(_colorSeq++) % LINK_COLORS.length]);
    }
    return _linkColorMap.get(linkId);
  }

  function _colorForSuggest(idx) {
    return LINK_COLORS[idx % LINK_COLORS.length];
  }

  // ── Image loading ──────────────────────────────────────────────────────────

  function _loadImg(url) {
    return new Promise((resolve, reject) => {
      if (!url) { resolve(null); return; }
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = url;
    });
  }

  // ── Drawing ────────────────────────────────────────────────────────────────

  function _renderCanvas(canvas, img, tr, bboxes, highlights, guideYNorm) {
    if (!canvas || !img || !tr) return;
    const dpr = _dpr();
    canvas.width  = canvas.clientWidth  * dpr;
    canvas.height = canvas.clientHeight * dpr;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Image
    const tl = tr.imageToCanvas(0, 0);
    const br = tr.imageToCanvas(img.naturalWidth, img.naturalHeight);
    ctx.drawImage(img, tl.x, tl.y, br.x - tl.x, br.y - tl.y);

    const lineW = Math.max(1.5, tr.scaleToCanvas(1.5));

    // Bboxes
    bboxes.forEach((b, idx) => {
      const btl = tr.imageToCanvas(b.x1, b.y1);
      const bbr = tr.imageToCanvas(b.x2, b.y2);
      const bw = bbr.x - btl.x, bh = bbr.y - btl.y;

      const hi = highlights.get(b.id);
      let color = CanvasRenderer.getClassColor(b.className);
      let lw = lineW;

      if (hi) {
        color = hi.color;
        lw = lineW * 2.5;
        // Colored fill
        ctx.fillStyle = color + '33';
        ctx.fillRect(btl.x, btl.y, bw, bh);
        // Badge circle
        const bx = bbr.x - 10, by = btl.y + 10;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(bx, by, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = `bold ${Math.max(9, tr.scaleToCanvas(10))}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(hi.num, bx, by);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
      }

      // Pending selection glow
      if (b.id === _pendingLeft) {
        ctx.fillStyle = '#fff4';
        ctx.fillRect(btl.x, btl.y, bw, bh);
        color = '#fff';
        lw = lineW * 3;
      }

      ctx.strokeStyle = color;
      ctx.lineWidth = lw;
      ctx.strokeRect(btl.x, btl.y, bw, bh);

      // Label
      const label = `#${idx + 1} ${b.className}`;
      const fontSize = Math.max(10, tr.scaleToCanvas(11));
      ctx.font = `${fontSize}px sans-serif`;
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = color;
      ctx.fillRect(btl.x, Math.max(0, btl.y - fontSize - 2), tw + 4, fontSize + 2);
      ctx.fillStyle = '#fff';
      ctx.fillText(label, btl.x + 2, Math.max(fontSize, btl.y - 2));
    });

    // Horizontal guideline
    if (guideYNorm !== null && guideYNorm >= 0) {
      const gc = tr.imageToCanvas(0, guideYNorm * img.naturalHeight);
      ctx.strokeStyle = 'rgba(255,255,0,0.6)';
      ctx.lineWidth = 1;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(0, gc.y);
      ctx.lineTo(canvas.width, gc.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  function _getHighlights(pairLinks, pairSuggestions, isLeft) {
    const map = new Map(); // bboxId → {color, num}

    // Confirmed links — left=sideB (bboxIdB), right=sideA (bboxIdA)
    pairLinks.forEach((link, i) => {
      const color = _colorForLink(link.linkId);
      const num = i + 1;
      if (isLeft)  map.set(link.bboxIdB, { color, num });
      else         map.set(link.bboxIdA, { color, num });
    });

    // Suggested links (show after confirmed)
    pairSuggestions.forEach((sug, i) => {
      const color = _colorForSuggest(pairLinks.length + i);
      const num = pairLinks.length + i + 1;
      if (isLeft  && !map.has(sug.bboxIdB)) map.set(sug.bboxIdB, { color, num, suggested: true });
      if (!isLeft && !map.has(sug.bboxIdA)) map.set(sug.bboxIdA, { color, num, suggested: true });
    });

    return map;
  }

  // ── Pair rendering ─────────────────────────────────────────────────────────

  async function _renderPair() {
    const session = ActiveSession.get();
    if (!session) return;
    const [iA, iB] = ADJACENT_PAIRS[_pairIndex];
    const sA = session.sides[iA], sB = session.sides[iB];

    // Display: sideB on LEFT, sideA on RIGHT
    // (left edge of sideA meets right edge of sideB at the shared corner)
    [_leftImage, _rightImage] = await Promise.all([
      _loadImg(sB.imageUrl), _loadImg(sA.imageUrl),
    ]);

    if (_leftImage)  _leftTr  = _makeTr(_leftCanvas,  _leftImage.naturalWidth,  _leftImage.naturalHeight);
    if (_rightImage) _rightTr = _makeTr(_rightCanvas, _rightImage.naturalWidth, _rightImage.naturalHeight);

    const pairLinks = session.confirmedLinks.filter(
      l => (l.sideA === iA && l.sideB === iB) || (l.sideA === iB && l.sideB === iA)
    );
    const pairSuggestions = session.suggestedLinks.filter(
      l => l.sideA === iA && l.sideB === iB
    );

    _lastHighlightsLeft  = _getHighlights(pairLinks, pairSuggestions, true);
    _lastHighlightsRight = _getHighlights(pairLinks, pairSuggestions, false);
    _lastBboxesLeft      = sB.bboxes;
    _lastBboxesRight     = sA.bboxes;

    _renderCanvas(_leftCanvas,  _leftImage,  _leftTr,  sB.bboxes, _lastHighlightsLeft,  _guideY);
    _renderCanvas(_rightCanvas, _rightImage, _rightTr, sA.bboxes, _lastHighlightsRight, _guideY);

    _renderSuggestions(pairSuggestions, pairLinks.length);
    _renderLinks(pairLinks, iA, iB);
  }

  // ── Suggestion panel ───────────────────────────────────────────────────────

  function _renderSuggestions(suggestions, linkOffset) {
    if (!_suggEl) return;
    _suggEl.innerHTML = '';

    if (suggestions.length === 0) {
      _suggEl.innerHTML = '<p class="dedup-empty">Tidak ada saran.</p>';
      return;
    }

    const autoCount = suggestions.filter(s => s.category === 'auto').length;
    if (autoCount > 0) {
      const btn = document.createElement('button');
      btn.className = 'btn btn-success btn-sm';
      btn.textContent = `Terima Semua Auto (${autoCount})`;
      btn.onclick = () => {
        ActiveSession.confirmAllAuto();
        _renderPair();
      };
      _suggEl.appendChild(btn);
    }

    suggestions.forEach((sug, i) => {
      const session = ActiveSession.get();
      const [iA, iB] = ADJACENT_PAIRS[_pairIndex];
      const sA = session.sides[iA], sB = session.sides[iB];
      const bA = sA.bboxes.find(b => b.id === sug.bboxIdA);
      const bB = sB.bboxes.find(b => b.id === sug.bboxIdB);
      if (!bA || !bB) return;

      const color = _colorForSuggest(linkOffset + i);
      const row = document.createElement('div');
      row.className = 'dedup-suggestion-row ' + (sug.category === 'auto' ? 'auto' : 'candidate');

      const badge = document.createElement('span');
      badge.className = 'dedup-badge';
      badge.style.background = color;
      badge.textContent = linkOffset + i + 1;

      const label = document.createElement('span');
      label.className = 'dedup-suggestion-label';
      const scoreStr = (sug.score * 100).toFixed(0);
      label.textContent = `${bA.className} (${TREE_SIDE_LABELS[iA]}) ↔ ${bB.className} (${TREE_SIDE_LABELS[iB]}) — ${scoreStr}%`;

      const terima = document.createElement('button');
      terima.className = 'btn btn-xs btn-success';
      terima.textContent = 'Terima';
      terima.onclick = () => { ActiveSession.confirmLink(sug.linkId); _renderPair(); };

      const tolak = document.createElement('button');
      tolak.className = 'btn btn-xs btn-danger';
      tolak.textContent = 'Tolak';
      tolak.onclick = () => { ActiveSession.rejectLink(sug.linkId); _renderPair(); };

      row.append(badge, label, terima, tolak);
      _suggEl.appendChild(row);
    });
  }

  // ── Confirmed links panel ──────────────────────────────────────────────────

  function _renderLinks(links, iA, iB) {
    if (!_linksEl) return;
    _linksEl.innerHTML = '';

    if (links.length === 0) {
      _linksEl.innerHTML = '<p class="dedup-empty">Belum ada link terkonfirmasi.</p>';
      return;
    }

    const session = ActiveSession.get();
    links.forEach((link, i) => {
      const color = _colorForLink(link.linkId);
      // Normalize direction for display
      const sideAIdx = link.sideA === iA ? link.sideA : link.sideB;
      const sideBIdx = link.sideA === iA ? link.sideB : link.sideA;
      const bIdA = link.sideA === iA ? link.bboxIdA : link.bboxIdB;
      const bIdB = link.sideA === iA ? link.bboxIdB : link.bboxIdA;
      const bA = session.sides[sideAIdx].bboxes.find(b => b.id === bIdA);
      const bB = session.sides[sideBIdx].bboxes.find(b => b.id === bIdB);

      const row = document.createElement('div');
      row.className = 'dedup-link-row';

      const badge = document.createElement('span');
      badge.className = 'dedup-badge';
      badge.style.background = color;
      badge.textContent = i + 1;

      const label = document.createElement('span');
      label.className = 'dedup-link-label';
      label.textContent = `${bA ? bA.className : '?'} (${TREE_SIDE_LABELS[sideAIdx]}) ↔ ${bB ? bB.className : '?'} (${TREE_SIDE_LABELS[sideBIdx]})`;

      const hapus = document.createElement('button');
      hapus.className = 'btn btn-xs btn-danger';
      hapus.textContent = 'Hapus';
      hapus.onclick = () => { ActiveSession.removeConfirmedLink(link.linkId); _renderPair(); };

      row.append(badge, label, hapus);
      _linksEl.appendChild(row);
    });
  }

  // ── Mouse events ───────────────────────────────────────────────────────────

  function _canvasCoords(canvas, e) {
    const rect = canvas.getBoundingClientRect();
    const dpr = _dpr();
    return { cx: (e.clientX - rect.left) * dpr, cy: (e.clientY - rect.top) * dpr };
  }

  function _hitBbox(bboxes, ix, iy) {
    for (let i = bboxes.length - 1; i >= 0; i--) {
      const b = bboxes[i];
      if (ix >= b.x1 && ix <= b.x2 && iy >= b.y1 && iy <= b.y2) return b;
    }
    return null;
  }

  function _onLeftClick(e) {
    // Left canvas = sideB
    if (!_leftTr || !_leftImage) return;
    const { cx, cy } = _canvasCoords(_leftCanvas, e);
    const { x, y } = _leftTr.canvasToImage(cx, cy);
    const session = ActiveSession.get();
    if (!session) return;
    const [, iB] = ADJACENT_PAIRS[_pairIndex];
    const hit = _hitBbox(session.sides[iB].bboxes, x, y);
    if (hit) {
      _pendingLeft = hit.id;   // sideB bbox id
      _renderPair();
    } else {
      _pendingLeft = null;
      _renderPair();
    }
  }

  function _onRightClick(e) {
    // Right canvas = sideA
    if (!_rightTr || !_rightImage) return;
    const { cx, cy } = _canvasCoords(_rightCanvas, e);
    const { x, y } = _rightTr.canvasToImage(cx, cy);
    const session = ActiveSession.get();
    if (!session) return;
    const [iA, iB] = ADJACENT_PAIRS[_pairIndex];
    const hit = _hitBbox(session.sides[iA].bboxes, x, y);
    if (hit && _pendingLeft) {
      // _pendingLeft = sideB bbox, hit.id = sideA bbox
      ActiveSession.addManualLink(iA, hit.id, iB, _pendingLeft);
      _pendingLeft = null;
      _renderPair();
    } else if (hit) {
      // Highlight partner if this sideA bbox is already linked
      const linked = session.confirmedLinks.find(
        l => (l.sideA === iA && l.bboxIdA === hit.id) ||
             (l.sideB === iA && l.bboxIdB === hit.id)
      );
      if (linked) {
        // _pendingLeft should be the sideB bbox id
        _pendingLeft = linked.sideA === iB ? linked.bboxIdA : linked.bboxIdB;
        _renderPair();
      }
    }
  }

  function _onMouseMove(canvas, img, tr, e) {
    if (!tr || !img) return;
    const { cx, cy } = _canvasCoords(canvas, e);
    const { y } = tr.canvasToImage(cx, cy);
    _guideY = Math.max(0, Math.min(1, y / img.naturalHeight));

    // Re-render both canvases with updated guideline
    _renderCanvas(_leftCanvas,  _leftImage,  _leftTr,  _lastBboxesLeft,  _lastHighlightsLeft,  _guideY);
    _renderCanvas(_rightCanvas, _rightImage, _rightTr, _lastBboxesRight, _lastHighlightsRight, _guideY);

    // Show magnifier for the hovered canvas
    const isLeft = canvas === _leftCanvas;
    _showMagnifier(canvas, img, tr,
      isLeft ? _lastBboxesLeft : _lastBboxesRight,
      isLeft ? _lastHighlightsLeft : _lastHighlightsRight,
      e
    );
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  // Stable bound handlers for add/removeEventListener
  const _boundLeftClick  = (e) => _onLeftClick(e);
  const _boundRightClick = (e) => _onRightClick(e);
  const _boundLeftMove   = (e) => _onMouseMove(_leftCanvas,  _leftImage,  _leftTr,  e);
  const _boundRightMove  = (e) => _onMouseMove(_rightCanvas, _rightImage, _rightTr, e);
  const _boundHidemag    = ()  => _hideMagnifier();
  const _boundWheel      = (e) => _onWheel(e);

  function init(leftCanvas, rightCanvas, suggEl, linksEl) {
    // Detach from previous canvases if switching
    if (_leftCanvas && _listenersAttached) {
      _leftCanvas.removeEventListener('click',      _boundLeftClick);
      _leftCanvas.removeEventListener('mousemove',  _boundLeftMove);
      _leftCanvas.removeEventListener('mouseleave', _boundHidemag);
      _leftCanvas.removeEventListener('wheel',      _boundWheel);
    }
    if (_rightCanvas && _listenersAttached) {
      _rightCanvas.removeEventListener('click',      _boundRightClick);
      _rightCanvas.removeEventListener('mousemove',  _boundRightMove);
      _rightCanvas.removeEventListener('mouseleave', _boundHidemag);
      _rightCanvas.removeEventListener('wheel',      _boundWheel);
    }

    _leftCanvas  = leftCanvas;
    _rightCanvas = rightCanvas;
    _suggEl      = suggEl;
    _linksEl     = linksEl;
    _pendingLeft = null;
    _guideY      = null;
    _colorSeq    = 0;
    _linkColorMap.clear();
    _destroyed   = false;

    _leftCanvas.addEventListener('click',      _boundLeftClick);
    _rightCanvas.addEventListener('click',     _boundRightClick);
    _leftCanvas.addEventListener('mousemove',  _boundLeftMove);
    _rightCanvas.addEventListener('mousemove', _boundRightMove);
    _leftCanvas.addEventListener('mouseleave', _boundHidemag);
    _rightCanvas.addEventListener('mouseleave', _boundHidemag);
    _leftCanvas.addEventListener('wheel',      _boundWheel, { passive: false });
    _rightCanvas.addEventListener('wheel',     _boundWheel, { passive: false });
    _listenersAttached = true;
  }

  function showPair(pairIndex, direction = null) {
    _pendingLeft = null;
    const canvasesEl = document.querySelector('.dedup-canvases');
    if (direction && canvasesEl) {
      // slide-left for → (content exits left, new enters right)
      // slide-right for ← (content exits right, new enters left)
      const animClass = direction === 'right' ? 'slide-left' : 'slide-right';
      canvasesEl.classList.add(animClass);
      // Swap content at midpoint when opacity = 0 (110ms into 280ms animation)
      setTimeout(() => {
        _pairIndex = pairIndex;
        _renderPair();
      }, 110);
      setTimeout(() => canvasesEl.classList.remove(animClass), 280);
    } else {
      _pairIndex = pairIndex;
      _renderPair();
    }
  }

  function refresh() { _renderPair(); }

  function destroy() {
    _destroyed = true;
    _leftImage = null; _rightImage = null;
    _leftTr = null; _rightTr = null;
    _hideMagnifier();
  }

  function getPairLabels() { return PAIR_LABELS; }
  function getCurrentPair() { return _pairIndex; }

  return { init, showPair, refresh, destroy, getPairLabels, getCurrentPair };
})();

window.DedupUI = DedupUI;
