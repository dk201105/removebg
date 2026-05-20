/**
 * app.js — main application controller
 */

const App = {
  originalFile: null,
  currentMask: null,
  maskW: 0,
  maskH: 0,
  resultBlob: null,
  filename: 'image',
};

// ---- INIT ----

document.addEventListener('DOMContentLoaded', () => {
  bindDropZone();
  bindActions();
  initBrush(onBrushStroke);
  bindEditorButtons();
});

// ---- DROP ZONE ----

function bindDropZone() {
  const zone  = document.getElementById('dropZone');
  const input = document.getElementById('fileInput');

  zone.addEventListener('dragover',  e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', e => {
    e.preventDefault(); zone.classList.remove('drag-over');
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  });
  input.addEventListener('change', () => { if (input.files[0]) handleFile(input.files[0]); });
  document.addEventListener('paste', e => {
    for (const item of (e.clipboardData?.items || []))
      if (item.type.startsWith('image/')) { handleFile(item.getAsFile()); break; }
  });
}

// ---- PROCESS ----

async function handleFile(file) {
  App.originalFile = file;
  App.filename = (file.name?.replace(/\.[^.]+$/, '') || 'image') + '-no-bg.png';

  resetUI();
  showOriginal(file);

  try {
    // Resize for API (keep it fast)
    const resized = await resizeImageFile(file, 1024);

    const { mask, maskW, maskH } = await generateMask(resized, (msg, pct) => {
      setStatus(msg, 'loading');
      setProgress(pct);
    });

    App.currentMask = mask;
    App.maskW = maskW;
    App.maskH = maskH;

    setStatus('Applying mask…', 'loading');
    setProgress(90);

    App.resultBlob = await applyMaskToImage(file, mask, maskW, maskH);

    setProgress(100);
    setStatus('Done — ' + formatBytes(App.resultBlob.size), 'success');

    showResult(App.resultBlob, App.filename);

    // Auto-open editor
    showEditor(App.resultBlob);

  } catch (err) {
    console.error(err);
    setStatus('Error: ' + err.message, 'error');
  }
}

// ---- BRUSH STROKE CALLBACK ----

// Debounced live preview update while painting
let _previewTimer = null;
function onBrushStroke() {
  // Redraw editor preview immediately (cheap, canvas-only)
  drawEditorPreview();

  // Debounce the expensive full re-export
  clearTimeout(_previewTimer);
  _previewTimer = setTimeout(async () => {
    if (!App.originalFile || !App.currentMask) return;
    const brushCanvas = getBrushCanvas();
    const blob = await exportWithBrushEdits(
      App.originalFile, App.currentMask, App.maskW, App.maskH, brushCanvas
    );
    App.resultBlob = blob;
    showResult(blob, App.filename);
    updateEditorResult(blob);
  }, 400);
}

// ---- EDITOR BUTTONS ----

function bindEditorButtons() {
  const applyBtn  = document.getElementById('applyBrushBtn');
  const editToggle = document.getElementById('editToggleBtn');

  if (applyBtn) {
    applyBtn.addEventListener('click', async () => {
      if (!App.originalFile || !App.currentMask) return;
      applyBtn.textContent = 'Applying…';
      applyBtn.disabled = true;
      const brushCanvas = getBrushCanvas();
      const blob = await exportWithBrushEdits(
        App.originalFile, App.currentMask, App.maskW, App.maskH, brushCanvas
      );
      App.resultBlob = blob;
      // Bake strokes into mask for future edits
      // (clear brush canvas after baking)
      brushCanvas.getContext('2d').clearRect(0, 0, brushCanvas.width, brushCanvas.height);
      showResult(blob, App.filename);
      updateEditorResult(blob);
      applyBtn.textContent = 'Apply edits';
      applyBtn.disabled = false;
    });
  }

  if (editToggle) {
    editToggle.addEventListener('click', () => {
      const panel = document.getElementById('editorPanel');
      const hidden = panel.style.display === 'none';
      panel.style.display = hidden ? 'block' : 'none';
      editToggle.textContent = hidden ? 'Hide editor' : 'Edit with brush';
    });
  }
}

// ---- ACTIONS ----

function bindActions() {
  document.getElementById('copyBtn').addEventListener('click', async () => {
    if (!App.resultBlob) return;
    const btn = document.getElementById('copyBtn');
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': App.resultBlob })]);
      const orig = btn.innerHTML;
      btn.textContent = '✓ Copied';
      setTimeout(() => { btn.innerHTML = orig; }, 2000);
    } catch {
      btn.textContent = 'Copy not supported';
      setTimeout(() => { btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:15px;height:15px;flex-shrink:0"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy to clipboard`; }, 2000);
    }
  });

  document.getElementById('newBtn').addEventListener('click', () => {
    App.originalFile = null;
    App.currentMask  = null;
    App.resultBlob   = null;
    resetUI();
  });
}
