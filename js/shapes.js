export const SHAPE_TOOLS = ['ellipse', 'rectangle', 'triangle', 'star', 'heart'];
export const isShapeTool = tool => SHAPE_TOOLS.includes(tool);

/** Outline geometry in the normalized drag rectangle. Never fills the path. */
export function strokeShape(context, tool, start, end) {
  const x = Math.min(start.x, end.x), y = Math.min(start.y, end.y);
  const width = Math.abs(end.x - start.x), height = Math.abs(end.y - start.y);
  if (!width || !height) return;
  const move = (u, v) => context.moveTo(x + u * width, y + v * height);
  const line = (u, v) => context.lineTo(x + u * width, y + v * height);
  const curve = (a,b,c,d,e,f) => context.bezierCurveTo(x+a*width,y+b*height,x+c*width,y+d*height,x+e*width,y+f*height);
  context.beginPath();
  switch (tool) {
    case 'ellipse':
      context.ellipse(x + width / 2, y + height / 2, width / 2, height / 2, 0, 0, Math.PI * 2);
      break;
    case 'rectangle':
      context.rect(x, y, width, height);
      break;
    case 'triangle':
      move(.5,0); line(1,1); line(0,1);
      break;
    case 'star': {
      const points = Array.from({ length: 10 }, (_, i) => {
        const angle = -Math.PI / 2 + i * Math.PI / 5, radius = i % 2 ? .45 : 1;
        return [Math.cos(angle) * radius, Math.sin(angle) * radius];
      });
      const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
      const minX = Math.min(...xs), minY = Math.min(...ys);
      const spanX = Math.max(...xs) - minX, spanY = Math.max(...ys) - minY;
      points.forEach(([u,v], i) => (i ? line : move)((u-minX)/spanX, (v-minY)/spanY));
      break;
    }
    case 'heart':
      move(.5,.22);
      curve(.5,.1,.37,0,.25,0);
      curve(.1,0,0,.12,0,.3);
      curve(0,.55,.25,.75,.5,1);
      curve(.75,.75,1,.55,1,.3);
      curve(1,.12,.9,0,.75,0);
      curve(.63,0,.5,.1,.5,.22);
      break;
    default: return;
  }
  context.closePath(); context.stroke();
}
