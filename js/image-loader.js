/** Decode orientation once, then cap resolution to bound mobile memory use. */
export async function loadImage(file, maxDimension = 2048) {
  let image;
  try { image = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch {
    const url = URL.createObjectURL(file);
    try { image = new Image(); image.src = url; await image.decode(); }
    finally { URL.revokeObjectURL(url); }
  }
  try {
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    if (!width || !height) throw new Error('Empty image');
    const scale = Math.min(1, maxDimension / Math.max(width, height));
    const source = document.createElement('canvas');
    source.width = Math.max(1, Math.round(width * scale));
    source.height = Math.max(1, Math.round(height * scale));
    const context = source.getContext('2d', { willReadFrequently: true });
    context.fillStyle = '#161b22'; context.fillRect(0, 0, source.width, source.height);
    context.drawImage(image, 0, 0, source.width, source.height);
    return source;
  } finally { image.close?.(); }
}
