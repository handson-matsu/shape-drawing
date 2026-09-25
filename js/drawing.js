import { isShapeTool, strokeShape } from './shapes.js';

function canvas(width, height) {
  const element = document.createElement('canvas');
  element.width = width; element.height = height;
  return element;
}

/** Independent layers: mask, future AI image, user strokes, contour.
 * The original photo never enters this renderer or the exported artwork. */
export class Drawing {
  constructor(target, recognition) {
    const { bounds, mask, width: sourceWidth, contours } = recognition;
    const padding = 24;
    this.width = bounds.maxX - bounds.minX + 1 + padding * 2;
    this.height = bounds.maxY - bounds.minY + 1 + padding * 2;
    this.offsetX = padding - bounds.minX; this.offsetY = padding - bounds.minY;
    this.target = target; target.width = this.width; target.height = this.height;
    this.maskLayer = canvas(this.width, this.height);
    const maskContext = this.maskLayer.getContext('2d');
    const pixels = maskContext.createImageData(this.width, this.height);
    for (let y = bounds.minY; y <= bounds.maxY; y++) for (let x = bounds.minX; x <= bounds.maxX; x++) {
      if (!mask[y * sourceWidth + x]) continue;
      const i = ((y + this.offsetY) * this.width + x + this.offsetX) * 4;
      pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = pixels.data[i + 3] = 255;
    }
    maskContext.putImageData(pixels, 0, 0);
    this.contour = new Path2D();
    for (const loop of contours) {
      loop.forEach(([x, y], i) => this.contour[i ? 'lineTo' : 'moveTo'](x + this.offsetX, y + this.offsetY));
      this.contour.closePath();
    }
    this.aiLayer = canvas(this.width, this.height);
    this.userLayer = canvas(this.width, this.height);
    this.scratch = canvas(this.width, this.height);
    this.history = []; this.future = []; this.active = null;
    this.outlineVisible = true; this.outlineWidth = 2;
    // UI widths use a 700px reference, keeping drawing tools usable on tiny shapes.
    this.unit = Math.max(this.width, this.height) / 700;
    this.render();
  }
  /** Extension point: accept a decoded, client-side generated image.
   * AI content stays below user drawings, and is independently clipped. */
  setAIImage(image) {
    const context = this.aiLayer.getContext('2d');
    context.clearRect(0, 0, this.width, this.height);
    if (image) {
      const scale = Math.max(this.width / image.width, this.height / image.height);
      const w = image.width * scale, h = image.height * scale;
      context.drawImage(image, (this.width - w) / 2, (this.height - h) / 2, w, h);
      this.clip(context);
    }
    this.render();
  }
  clip(context) {
    context.save(); context.globalCompositeOperation = 'destination-in';
    context.drawImage(this.maskLayer, 0, 0); context.restore();
  }
  paintStroke(context, stroke) {
    const { points, color, size } = stroke;
    if (!points.length) return;
    context.strokeStyle = color; context.fillStyle = color;
    context.lineWidth = size * this.unit; context.lineCap = 'round'; context.lineJoin = 'round';
    if (isShapeTool(stroke.tool)) {
      if (points.length === 2) strokeShape(context, stroke.tool, points[0], points[1]);
      return;
    }
    context.beginPath(); context.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) context.lineTo(points[i].x, points[i].y);
    context.stroke();
    // A tap must make a dot, even when no pointermove occurs.
    context.beginPath(); context.arc(points[0].x, points[0].y, size * this.unit / 2, 0, Math.PI * 2); context.fill();
  }
  applyStroke(context, stroke) {
    context.save(); context.globalCompositeOperation = stroke.tool === 'eraser' ? 'destination-out' : 'source-over';
    this.paintStroke(context, stroke); context.restore();
  }
  begin(point, tool, color, size) { this.active = { tool, color, size, points: [point] }; }
  move(point) {
    if (!this.active) return;
    if (isShapeTool(this.active.tool)) this.active.points[1] = point;
    else this.active.points.push(point);
  }
  commit() {
    if (!this.active) return;
    if (isShapeTool(this.active.tool)) {
      const [start, end] = this.active.points;
      // Taps and flat drags are not shapes and must not consume an undo step.
      if (!end || start.x === end.x || start.y === end.y) { this.cancel(); return; }
    }
    this.history.push(this.active); this.future = [];
    const context = this.userLayer.getContext('2d');
    this.applyStroke(context, this.active); this.clip(context);
    this.active = null; this.render();
  }
  cancel() { this.active = null; this.render(); }
  replay() {
    const context = this.userLayer.getContext('2d');
    context.clearRect(0, 0, this.width, this.height);
    for (const action of this.history) {
      if (action.type === 'clear') context.clearRect(0, 0, this.width, this.height);
      else this.applyStroke(context, action);
    }
    this.clip(context); this.render();
  }
  undo() { if (this.history.length) { this.future.push(this.history.pop()); this.replay(); } }
  redo() { if (this.future.length) { this.history.push(this.future.pop()); this.replay(); } }
  clear() { this.history.push({ type: 'clear' }); this.future = []; this.replay(); }
  render() {
    const context = this.target.getContext('2d');
    context.fillStyle = '#ffffff'; context.fillRect(0, 0, this.width, this.height);
    context.drawImage(this.aiLayer, 0, 0);
    if (this.active) {
      const scratch = this.scratch.getContext('2d');
      scratch.clearRect(0, 0, this.width, this.height);
      scratch.drawImage(this.userLayer, 0, 0); this.applyStroke(scratch, this.active); this.clip(scratch);
      context.drawImage(this.scratch, 0, 0);
    } else context.drawImage(this.userLayer, 0, 0);
    if (this.outlineVisible) {
      context.strokeStyle = '#20252b'; context.lineWidth = this.outlineWidth * this.unit;
      context.lineJoin = 'miter'; context.miterLimit = 2; context.stroke(this.contour);
    }
  }
  toBlob() { this.render(); return new Promise((resolve, reject) => this.target.toBlob(blob => blob ? resolve(blob) : reject(new Error('PNG export failed')), 'image/png')); }
}
