/**
 * ui.js — UI helpers, editor panel management, live preview
 */

function formatBytes(b) {
  if (b < 1024) return b + ' B';
  if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
  return (b / (1024 * 1024)).toFixed(1) + ' MB';
}

function setStatus(msg, type = 'loading') {
  const bar = document.getElementById('statusBar');
  bar.className = 'status-bar visible' + (type !== 'loading' ? ' ' + type : '');
  document.getElementById('spinner').style.display    = type === 'loading' ? 'block' : 'none';
  const dot = document.getElementById('statusDot');
  dot.style.display = type !== 'loading' ? 'block' : 'none';
  if (type !== 'loading') dot.className = 'status-dot ' + (type === 'success' ? 'ok' : 'err');
  document.getElementById('progressTrack').style.display = type === 'loading' ? 'flex' : 'none';
  document.getElementById('statusText').textContent = msg;
}

function setProgress(pct) {
  document.getElementById('progressFill').style.width = Math.min(100, Math.round(pct)) + '%';
}

function showOriginal(file) {
  document.getElementById('origImg').src = URL.createObjectURL(file);
  document.getElementById('origSize').textContent = formatBytes(file.size);
  document.getElementById('previewPanel').className = 'preview-panel visible';
}

function showResult(blob, filename) {
  const url = URL.createObjectURL(blob);
  document.getElementById('resultImg').src = url;
  document.getElementById('resultSize').textContent = formatBytes(blob.size);
  const dl = document.getElementById('downloadBtn');
  dl.href = url;
  dl.download = filename;
  document.getElementById('actions').className = 'actions visible';
}

function resetUI() {
  document.getElementById('fileInput').value = '';
  document.getElementById('previewPanel').className = 'preview-panel';
  document.getElementById('actions').className = 'actions';
  document.getElementById('statusBar').className = 'status-bar';
  document.getElementById('origImg').src = '';
  document.getElementById('resultImg').src = '';
  hideEditor();
}

/* ---- EDITOR ---- */

let _editorResultImg = null; // live Image element of current result

function showEditor(resultBlob) {
  const panel = document.getElementById('editorPanel');
  panel.style.display = 'block';

  const editorCanvas = document.getElementById('editorCanvas');
  const brushCanvas  = document.getElementById('brushCanvas');

  _editorResultImg = new Image();
  _editorResultImg.onload = () => {
    // Fit within 740px wide
    const maxW  = Math.min(740, _editorResultImg.width);
    const scale = maxW / _editorResultImg.width;
    const cW = Math.round(_editorResultImg.width  * scale);
    const cH = Math.round(_editorResultImg.height * scale);

    editorCanvas.width  = cW; editorCanvas.height = cH;
    brushCanvas.width   = cW; brushCanvas.height  = cH;
    brushCanvas.getContext('2d').clearRect(0, 0, cW, cH);

    drawEditorPreview();
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };
  _editorResultImg.src = URL.createObjectURL(resultBlob);
}

function hideEditor() {
  const panel = document.getElementById('editorPanel');
  if (panel) panel.style.display = 'none';
}

function drawEditorPreview() {
  if (!_editorResultImg) return;
  const editorCanvas = document.getElementById('editorCanvas');
  const brushCanvas  = document.getElementById('brushCanvas');
  compositeEditorPreview(editorCanvas, brushCanvas, _editorResultImg);
}

function updateEditorResult(newBlob) {
  if (!_editorResultImg) return;
  _editorResultImg.onload = drawEditorPreview;
  _editorResultImg.src = URL.createObjectURL(newBlob);
}
