/**
 * brush.js — brush tool: paint erase/restore strokes with live preview
 */

const Brush = {
  mode: 'erase',   // 'erase' | 'restore'
  size: 28,
  hardness: 0.5,   // 0 = fully soft, 1 = hard edge
  painting: false,
  lastX: null,
  lastY: null,
};

let _onStroke = null;
let _brushCanvas = null;
let _editorCanvas = null;
let _cursorEl = null;

function initBrush(onStroke) {
  _onStroke = onStroke;
  _brushCanvas  = document.getElementById('brushCanvas');
  _editorCanvas = document.getElementById('editorCanvas');
  _cursorEl     = document.getElementById('brushCursor');

  // Slider: size
  const sizeSlider = document.getElementById('brushSize');
  const sizeVal    = document.getElementById('brushSizeVal');
  sizeSlider.addEventListener('input', () => {
    Brush.size = parseInt(sizeSlider.value);
    sizeVal.textContent = Brush.size + 'px';
    updateCursorSize();
  });

  // Slider: hardness
  const hardSlider = document.getElementById('brushHardness');
  const hardVal    = document.getElementById('brushHardnessVal');
  if (hardSlider) {
    hardSlider.addEventListener('input', () => {
      Brush.hardness = parseInt(hardSlider.value) / 100;
      hardVal.textContent = hardSlider.value + '%';
    });
  }

  // Mode buttons
  document.getElementById('eraseBtn').addEventListener('click',   () => setBrushMode('erase'));
  document.getElementById('restoreBtn').addEventListener('click', () => setBrushMode('restore'));

  // Clear
  document.getElementById('clearBrushBtn').addEventListener('click', () => {
    _brushCanvas.getContext('2d').clearRect(0, 0, _brushCanvas.width, _brushCanvas.height);
    _onStroke();
  });

  // Mouse
  _brushCanvas.addEventListener('mousedown', onDown);
  _brushCanvas.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
  _brushCanvas.addEventListener('mouseleave', () => {
    if (_cursorEl) _cursorEl.style.display = 'none';
  });
  _brushCanvas.addEventListener('mouseenter', () => {
    if (_cursorEl) _cursorEl.style.display = 'block';
  });

  // Touch
  _brushCanvas.addEventListener('touchstart',  onTouchStart, { passive: false });
  _brushCanvas.addEventListener('touchmove',   onTouchMove,  { passive: false });
  _brushCanvas.addEventListener('touchend',    () => { Brush.painting = false; Brush.lastX = null; });

  setBrushMode('erase');
}

function setBrushMode(mode) {
  Brush.mode = mode;
  document.getElementById('eraseBtn').classList.toggle('active',   mode === 'erase');
  document.getElementById('restoreBtn').classList.toggle('active', mode === 'restore');
  if (_cursorEl) _cursorEl.className = 'brush-cursor ' + mode;
}

function getPos(e, canvas) {
  const r = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - r.left) * (canvas.width  / r.width),
    y: (e.clientY - r.top)  * (canvas.height / r.height),
  };
}

function getTouchPos(e, canvas) {
  const r = canvas.getBoundingClientRect();
  const t = e.touches[0];
  return {
    x: (t.clientX - r.left) * (canvas.width  / r.width),
    y: (t.clientY - r.top)  * (canvas.height / r.height),
  };
}

function onDown(e) {
  Brush.painting = true;
  const { x, y } = getPos(e, _brushCanvas);
  Brush.lastX = x; Brush.lastY = y;
  paintDab(x, y);
  _onStroke();
}

function onMove(e) {
  // Update cursor
  if (_cursorEl) {
    const r = _brushCanvas.getBoundingClientRect();
    const displaySize = Brush.size * (r.width / _brushCanvas.width);
    _cursorEl.style.width  = displaySize + 'px';
    _cursorEl.style.height = displaySize + 'px';
    _cursorEl.style.left   = (e.clientX - displaySize / 2) + 'px';
    _cursorEl.style.top    = (e.clientY - displaySize / 2) + 'px';
  }
  if (!Brush.painting) return;
  const { x, y } = getPos(e, _brushCanvas);
  paintLine(Brush.lastX, Brush.lastY, x, y);
  Brush.lastX = x; Brush.lastY = y;
  _onStroke();
}

function onUp() {
  Brush.painting = false;
  Brush.lastX = null;
}

function onTouchStart(e) {
  e.preventDefault();
  Brush.painting = true;
  const { x, y } = getTouchPos(e, _brushCanvas);
  Brush.lastX = x; Brush.lastY = y;
  paintDab(x, y);
  _onStroke();
}

function onTouchMove(e) {
  e.preventDefault();
  if (!Brush.painting) return;
  const { x, y } = getTouchPos(e, _brushCanvas);
  paintLine(Brush.lastX, Brush.lastY, x, y);
  Brush.lastX = x; Brush.lastY = y;
  _onStroke();
}

function updateCursorSize() {
  if (!_cursorEl || !_brushCanvas) return;
  const r = _brushCanvas.getBoundingClientRect();
  const displaySize = Brush.size * (r.width / _brushCanvas.width);
  _cursorEl.style.width  = displaySize + 'px';
  _cursorEl.style.height = displaySize + 'px';
}

function paintLine(x0, y0, x1, y1) {
  if (x0 === null) { paintDab(x1, y1); return; }
  const dist  = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.max(1, Math.ceil(dist / (Brush.size * 0.15)));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    paintDab(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t);
  }
}

function paintDab(x, y) {
  const ctx = _brushCanvas.getContext('2d');
  const r = Brush.size / 2;

  // Opacity based on hardness: hard brush = higher opacity per dab
  const centerAlpha = 0.12 + Brush.hardness * 0.20;
  const midpoint    = 0.3  + Brush.hardness * 0.5;  // where falloff starts
  const edgeAlpha   = Brush.hardness > 0.8 ? centerAlpha * 0.6 : 0;

  const grad = ctx.createRadialGradient(x, y, 0, x, y, r);

  if (Brush.mode === 'erase') {
    grad.addColorStop(0,         `rgba(220, 50, 30, ${centerAlpha})`);
    grad.addColorStop(midpoint,  `rgba(220, 50, 30, ${centerAlpha * 0.5})`);
    grad.addColorStop(1,         `rgba(220, 50, 30, ${edgeAlpha})`);
  } else {
    grad.addColorStop(0,         `rgba(40, 200, 100, ${centerAlpha})`);
    grad.addColorStop(midpoint,  `rgba(40, 200, 100, ${centerAlpha * 0.5})`);
    grad.addColorStop(1,         `rgba(40, 200, 100, ${edgeAlpha})`);
  }

  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function getBrushCanvas() { return _brushCanvas; }
