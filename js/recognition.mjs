/** Brightness threshold + largest 4-connected component. No smoothing,
 * convex hull, polygon approximation, hole filling, or shape correction. */
export function luminance(rgba) {
  const gray = new Uint8Array(rgba.length / 4);
  for (let i = 0; i < gray.length; i++) {
    const j = i * 4;
    gray[i] = Math.round((.2126 * rgba[j] + .7152 * rgba[j + 1] + .0722 * rgba[j + 2]) * rgba[j + 3] / 255);
  }
  return gray;
}

export function extractPaper(gray, width, height, threshold) {
  const n = width * height;
  if (gray.length !== n || width < 1 || height < 1) throw new Error('Invalid image dimensions');
  const seen = new Uint8Array(n);
  const queue = new Int32Array(n);
  let largest = new Int32Array(0);
  for (let seed = 0; seed < n; seed++) {
    if (seen[seed] || gray[seed] < threshold) continue;
    let head = 0, tail = 1;
    queue[0] = seed; seen[seed] = 1;
    while (head < tail) {
      const i = queue[head++], x = i % width;
      const visit = (next) => {
        if (!seen[next] && gray[next] >= threshold) {
          seen[next] = 1; queue[tail++] = next;
        }
      };
      if (x > 0) visit(i - 1);
      if (x < width - 1) visit(i + 1);
      if (i >= width) visit(i - width);
      if (i < n - width) visit(i + width);
    }
    if (tail > largest.length) largest = queue.slice(0, tail);
  }
  const mask = new Uint8Array(n);
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (const i of largest) {
    mask[i] = 1;
    const x = i % width, y = Math.floor(i / width);
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  const bounds = largest.length ? { minX, minY, maxX, maxY } : null;
  return { mask, width, height, area: largest.length, bounds,
    touchesEdge: !!bounds && (minX === 0 || minY === 0 || maxX === width - 1 || maxY === height - 1) };
}

/** Exact pixel-edge contours, including holes. Collinear edges alone are merged.
 * Clockwise outer edges and counter-clockwise holes preserve the mask geometry. */
export function traceContours(mask, width, height) {
  const edges = new Map(), stride = width + 1;
  function add(x, y, direction) {
    const key = y * stride + x;
    edges.set(key, (edges.get(key) || 0) | (1 << direction));
  }
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * width + x;
    if (!mask[i]) continue;
    if (y === 0 || !mask[i - width]) add(x, y, 0);
    if (x === width - 1 || !mask[i + 1]) add(x + 1, y, 1);
    if (y === height - 1 || !mask[i + width]) add(x + 1, y + 1, 2);
    if (x === 0 || !mask[i - 1]) add(x, y + 1, 3);
  }
  const delta = [1, stride, -1, -stride], loops = [];
  while (edges.size) {
    const start = edges.keys().next().value;
    let key = start, previous = -1;
    const points = [];
    do {
      const bits = edges.get(key);
      // Prefer right turns at diagonal contacts to keep each boundary consistent.
      const choices = previous < 0 ? [0, 1, 2, 3] : [(previous + 1) % 4, previous, (previous + 3) % 4, (previous + 2) % 4];
      const direction = choices.find(d => bits & (1 << d));
      if (direction === undefined) throw new Error('Open boundary');
      if (direction !== previous) points.push([key % stride, Math.floor(key / stride)]);
      const remaining = bits & ~(1 << direction);
      if (remaining) edges.set(key, remaining); else edges.delete(key);
      key += delta[direction]; previous = direction;
    } while (key !== start);
    loops.push(points);
  }
  return loops;
}
