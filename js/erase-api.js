/**
 * api.js — Claude API mask generation with multi-pass refinement
 */

const MASK_SIZE = 96; // grid resolution; higher = more detail but more tokens

async function generateMask(imageBlob, onProgress) {
  onProgress('Encoding image…', 10);
  const b64 = await fileToBase64(imageBlob);

  onProgress('Identifying subject…', 20);

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8192,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } },
          {
            type: 'text',
            text: `You are an expert image segmentation system for background removal.

Analyze this image and produce a precise foreground mask.

Grid: ${MASK_SIZE}×${MASK_SIZE}, row-major, top-left → bottom-right.

Segmentation rules:
- 1 = foreground (keep), 0 = background (remove)
- Main subject: the most prominent person, product, animal, or object
- INCLUDE: fine hair, fur, fingers, thin limbs, transparent clothing edges
- INCLUDE: any part of the subject even if partially obscured
- EXCLUDE: cast shadows on the ground/background
- EXCLUDE: reflections of the subject in mirrors or water (unless the reflection IS the subject)
- EXCLUDE: all background elements — sky, walls, floors, furniture not held by subject
- Be precise at boundary cells: 1 if >50% subject, 0 if >50% background
- For soft/fuzzy edges (hair, fur, feathers): prefer 1 to preserve detail

Output ONLY a flat JSON array of exactly ${MASK_SIZE * MASK_SIZE} integers (0 or 1).
No markdown, no explanation, no other text. Just the array like: [0,1,1,0,...]`
          }
        ]
      }]
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`API ${response.status}: ${err}`);
  }

  onProgress('Processing mask…', 72);

  const data = await response.json();
  const raw = data.content.map(c => c.text || '').join('').trim()
                .replace(/```[a-z]*\n?/g, '').replace(/```/g, '').trim();

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const m = raw.match(/\[[\d,\s]+\]/);
    if (m) parsed = JSON.parse(m[0]);
    else throw new Error('Could not parse mask from response');
  }

  if (!Array.isArray(parsed) || parsed.length < MASK_SIZE * MASK_SIZE) {
    throw new Error(`Mask length mismatch: got ${parsed?.length}, need ${MASK_SIZE * MASK_SIZE}`);
  }

  onProgress('Refining edges…', 82);

  // Convert to float
  const floatMask = new Float32Array(MASK_SIZE * MASK_SIZE);
  for (let i = 0; i < MASK_SIZE * MASK_SIZE; i++) floatMask[i] = parsed[i] ? 1.0 : 0.0;

  // Multi-pass edge refinement
  const refined = refineMaskEdges(floatMask, MASK_SIZE, MASK_SIZE);

  return { mask: refined, maskW: MASK_SIZE, maskH: MASK_SIZE };
}
