/**
 * canvas.js — image processing: resize, blur, mask application, compositing
 */

function resizeImageFile(file, maxDim = 1024) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      c.toBlob(resolve, 'image/jpeg', 0.92);
    };
    img.src = url;
  });
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result.split(',')[1]);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

/** Separable Gaussian blur on a Float32Array mask */
function blurMask(mask, w, h, radius = 2) {
  const temp = new Float32Array(mask.length);
  const out  = new Float32Array(mask.length);
  const sigma = radius / 2;
  const kSize = Math.ceil(radius * 2) + 1;
  const kernel = [];
  let kSum = 0;
  for (let i = 0; i < kSize; i++) {
    const x = i - Math.floor(kSize / 2);
    const v = Math.exp(-(x * x) / (2 * sigma * sigma));
    kernel.push(v); kSum += v;
  }
  for (let i = 0; i < kSize; i++) kernel[i] /= kSum;

  const half = Math.floor(kSize / 2);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let k = 0; k < kSize; k++) {
        const nx = Math.max(0, Math.min(w - 1, x + k - half));
        s += mask[y * w + nx] * kernel[k];
      }
      temp[y * w + x] = s;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let k = 0; k < kSize; k++) {
        const ny = Math.max(0, Math.min(h - 1, y + k - half));
        s += temp[ny * w + x] * kernel[k];
      }
      out[y * w + x] = s;
    }
  }
  return out;
}

/**
 * Refine mask edges using a grow+erode morphological pass,
 * then feather with a stronger blur. Returns a new Float32Array.
 */
function refineMaskEdges(mask, w, h) {
  // Pass 1: gentle blur to anti-alias
  let refined = blurMask(mask, w, h, 1.5);

  // Pass 2: boost contrast at edges (sigmoid-like curve)
  for (let i = 0; i < refined.length; i++) {
    const v = refined[i];
    // S-curve: pushes near-0 toward 0 and near-1 toward 1, keeps midpoints soft
    refined[i] = v < 0.1 ? v * 0.4 : v > 0.9 ? 1 - (1 - v) * 0.4 : v;
  }

  // Pass 3: final feather blur
  refined = blurMask(refined, w, h, 2);
  return refined;
}

/**
 * Bilinear sample of a float mask at fractional coords
 */
function sampleMask(mask, maskW, maskH, fx, fy) {
  const x0 = Math.floor(fx), y0 = Math.floor(fy);
  const x1 = Math.min(x0 + 1, maskW - 1);
  const y1 = Math.min(y0 + 1, maskH - 1);
  const tx = fx - x0, ty = fy - y0;
  return (
    mask[y0 * maskW + x0] * (1 - tx) * (1 - ty) +
    mask[y0 * maskW + x1] * tx       * (1 - ty) +
    mask[y1 * maskW + x0] * (1 - tx) * ty +
    mask[y1 * maskW + x1] * tx       * ty
  );
}

/**
 * Apply float mask to originalFile at full resolution → PNG Blob
 */
async function applyMaskToImage(originalFile, floatMask, maskW, maskH) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(originalFile);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const id = ctx.getImageData(0, 0, img.width, img.height);
      const d = id.data;
      for (let y = 0; y < img.height; y++) {
        for (let x = 0; x < img.width; x++) {
          const fx = (x / img.width)  * (maskW - 1);
          const fy = (y / img.height) * (maskH - 1);
          const v = sampleMask(floatMask, maskW, maskH, fx, fy);
          d[(y * img.width + x) * 4 + 3] = Math.round(Math.max(0, Math.min(1, v)) * 255);
        }
      }
      ctx.putImageData(id, 0, 0);
      c.toBlob(resolve, 'image/png');
    };
    img.src = url;
  });
}

/**
 * Composite AI mask + brush strokes → final PNG Blob at original resolution
 */
async function exportWithBrushEdits(originalFile, floatMask, maskW, maskH, brushCanvas) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(originalFile);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const id  = ctx.getImageData(0, 0, img.width, img.height);
      const d   = id.data;
      const bd  = brushCanvas.getContext('2d')
                    .getImageData(0, 0, brushCanvas.width, brushCanvas.height).data;
      const bW  = brushCanvas.width;
      const bH  = brushCanvas.height;

      for (let y = 0; y < img.height; y++) {
        for (let x = 0; x < img.width; x++) {
          const fx = (x / img.width)  * (maskW - 1);
          const fy = (y / img.height) * (maskH - 1);
          let alpha = sampleMask(floatMask, maskW, maskH, fx, fy);

          // Sample brush canvas at proportional coords
          const bx = Math.round((x / img.width)  * (bW - 1));
          const by = Math.round((y / img.height) * (bH - 1));
          const bi = (by * bW + bx) * 4;
          const bR = bd[bi], bG = bd[bi + 1], bA = bd[bi + 3] / 255;

          if (bA > 0.01) {
            if (bR > bG) {
              // erase stroke (red channel): push alpha toward 0
              alpha = alpha * (1 - bA);
            } else {
              // restore stroke (green channel): push alpha toward 1
              alpha = alpha + (1 - alpha) * bA;
            }
          }

          d[(y * img.width + x) * 4 + 3] = Math.round(Math.max(0, Math.min(1, alpha)) * 255);
        }
      }
      ctx.putImageData(id, 0, 0);
      c.toBlob(resolve, 'image/png');
    };
    img.src = url;
  });
}

/**
 * Draw the current result (with brush overlay) onto the editor canvas for live preview.
 * Uses the in-memory resultImage element and overlays the brush strokes with blend modes.
 */
function compositeEditorPreview(editorCanvas, brushCanvas, resultImg) {
  const ctx = editorCanvas.getContext('2d');
  ctx.clearRect(0, 0, editorCanvas.width, editorCanvas.height);

  // Draw checkerboard background
  const tileSize = 10;
  for (let y = 0; y < editorCanvas.height; y += tileSize) {
    for (let x = 0; x < editorCanvas.width; x += tileSize) {
      ctx.fillStyle = ((x / tileSize + y / tileSize) % 2 === 0) ? '#e8e0cc' : '#f0ead8';
      ctx.fillRect(x, y, tileSize, tileSize);
    }
  }

  // Draw the result image
  ctx.drawImage(resultImg, 0, 0, editorCanvas.width, editorCanvas.height);

  // Overlay brush strokes as tinted preview
  ctx.save();
  ctx.globalAlpha = 0.45;
  ctx.globalCompositeOperation = 'source-over';
  ctx.drawImage(brushCanvas, 0, 0);
  ctx.restore();
}
