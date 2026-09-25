import { loadImage } from '../js/image-loader.js';
import { Drawing } from '../js/drawing.js';
import { extractPaper, traceContours } from '../js/recognition.mjs';
const results = document.getElementById('results');
let passed = 0, failed = 0;
function assert(value, message) { if (!value) throw new Error(message); }
async function test(name, callback) {
  const item = document.createElement('li');
  try { await callback(); passed++; item.className = 'pass'; item.textContent = `PASS: ${name}`; }
  catch (error) { failed++; item.className = 'fail'; item.textContent = `FAIL: ${name}: ${error.message}`; }
  results.append(item);
}
const width = 160, height = 140, gray = new Uint8Array(width * height);
for (let y=15;y<125;y++) for(let x=20;x<140;x++) {
  // Concave notch and an actual hole, to exercise both clipping boundaries.
  if (!(x<70 && y<50) && !(x>=80 && x<100 && y>=65 && y<85)) gray[y*width+x]=255;
}
const recognition = extractPaper(gray,width,height,180);
recognition.contours=traceContours(recognition.mask,width,height);
const target=document.getElementById('canvas');
const drawing=new Drawing(target,recognition);
const pixel=(x,y,source=target)=>[...source.getContext('2d').getImageData(x,y,1,1).data];
const point=(x,y)=>({x:x+drawing.offsetX,y:y+drawing.offsetY});
const sample=(x,y,source=target)=>{const p=point(x,y);return pixel(p.x,p.y,source);};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const white=[255,255,255,255], red=[255,0,0,255], blue=[0,0,255,255];
function stroke(points,tool='pen',color='#ff0000',size=80) {
 drawing.begin(points[0],tool,color,size); for (const p of points.slice(1)) drawing.move(p); drawing.commit();
}
await test('Initial artwork is white; original photo is absent',()=>{ assert(same(pixel(0,0),white),'Background'); assert(same(sample(55,75),white),'Interior'); });
await test('Pen clips outside the silhouette and inside its holes',()=>{
 drawing.outlineVisible=false;
 stroke([point(-10,75),point(170,75)]);
 assert(same(sample(55,75),red),'Interior is not painted'); assert(same(pixel(5,point(0,75).y),white),'Outside was painted'); assert(same(sample(90,75),white),'Hole was painted');
 const rgba=drawing.userLayer.getContext('2d').getImageData(0,0,drawing.width,drawing.height).data;
 const mask=drawing.maskLayer.getContext('2d').getImageData(0,0,drawing.width,drawing.height).data;
 for(let i=3;i<rgba.length;i+=4) assert(mask[i] || !rgba[i],`Paint leaked at ${i}`);
});
await test('Undo and redo restore the exact rendered pixels',()=>{
 const before=target.toDataURL(); drawing.undo(); assert(same(sample(55,75),white),'Undo'); drawing.redo(); assert(target.toDataURL()===before,'Redo differs');
});
await test('Eraser removes user paint without modifying the mask',()=>{
 const before=drawing.maskLayer.toDataURL(); stroke([point(55,75)],'eraser'); assert(same(sample(55,75),white),'Eraser'); assert(drawing.maskLayer.toDataURL()===before,'Mask changed'); drawing.undo(); assert(same(sample(55,75),red),'Undo eraser');
});
await test('A tap produces a visible dot; new drawing invalidates redo',()=>{
 stroke([point(115,105)]); assert(same(sample(115,105),red),'Tap'); assert(drawing.future.length===0,'Stale redo');
});
await test('Clear all is undoable and redoable',()=>{
 const before=target.toDataURL(); drawing.clear(); assert(same(sample(55,75),white),'Clear'); drawing.undo(); assert(target.toDataURL()===before,'Undo clear'); drawing.redo(); assert(same(sample(55,75),white),'Redo clear'); drawing.undo();
});
await test('Contour is above drawing and can be hidden or resized',()=>{
 drawing.outlineWidth=12; drawing.outlineVisible=true; drawing.render(); const outlined=sample(20,75); assert(outlined[0]<60 && outlined[1]<60,'Contour covered by drawing');
 drawing.outlineVisible=false; drawing.render(); assert(same(sample(20,75),red),'Toggle off');
 drawing.outlineVisible=true; drawing.outlineWidth=2; drawing.render(); assert(!same(sample(21,75),outlined),'Width change');
});
await test('Future image layer is clipped, beneath drawing, and survives erasing and clear',()=>{
 const image=document.createElement('canvas'); image.width=10;image.height=10; const ctx=image.getContext('2d');ctx.fillStyle='#0000ff';ctx.fillRect(0,0,10,10);
 drawing.setAIImage(image);assert(same(sample(55,75),red),'Image covers drawing');assert(same(sample(115,40),blue),'Image absent');assert(same(sample(90,75),white),'Image leaks into hole');
 stroke([point(55,75)],'eraser');assert(same(sample(55,75),blue),'Eraser removed image');drawing.clear();assert(same(sample(115,105),blue),'Clear removed image');
 drawing.setAIImage(null);assert(same(sample(115,105),white),'Image reset');
});
await test('Cancelled pointer stroke leaves no paint or undo entry',()=>{
 const count=drawing.history.length;drawing.begin(point(55,75),'pen','#ff0000',80);drawing.render();drawing.cancel();assert(same(sample(55,75),white),'Cancelled paint');assert(drawing.history.length===count,'Cancelled history');
});
await test('PNG round trip keeps dimensions, white background, artwork and contour',async()=>{
 stroke([point(55,75)]);const blob=await drawing.toBlob();assert(blob.type==='image/png','MIME');const image=await createImageBitmap(blob);assert(image.width===drawing.width&&image.height===drawing.height,'Dimensions');
 const restored=document.createElement('canvas');restored.width=image.width;restored.height=image.height;restored.getContext('2d').drawImage(image,0,0);image.close();assert(same(pixel(0,0,restored),white),'PNG background');assert(same(sample(55,75,restored),red),'PNG paint');assert(restored.toDataURL()===target.toDataURL(),'PNG differs from artwork');
});

await test('Image loader honors EXIF orientation 6 exactly once', async()=>{
 const blob=await (await fetch('./fixtures/paper-orientation-6.jpg')).blob();
 const source=await loadImage(blob);
 assert(source.width===480 && source.height===640, 'JPEG was not rotated 90 degrees');
 const rgba=source.getContext('2d').getImageData(369,110,1,1).data;
 assert(rgba[0]>140 && rgba[0]<185, 'Rotated shaded region is misplaced');
});
await test('Image loader caps size and preserves aspect ratio', async()=>{
 const blob=await (await fetch('./fixtures/paper.png')).blob();
 const source=await loadImage(blob,320); assert(source.width===320 && source.height===240,'Resize dimensions');
});
await test('Unreadable files reject without leaving a partially decoded image', async()=>{
 let rejected=false;try {await loadImage(new Blob(['not an image'],{type:'image/png'}));}catch{rejected=true;}
 assert(rejected,'Invalid input was accepted');
});


for (const tool of ['ellipse','rectangle','triangle','star','heart']) {
 await test(`${tool}: outline preview, commit, reverse drag, undo/redo and clear`,()=>{
   const canvas=document.createElement('canvas');
   const model=new Drawing(canvas,recognition);model.outlineVisible=false;model.render();
   const empty=canvas.toDataURL(), emptyLayer=model.userLayer.toDataURL();
   const start={x:75+model.offsetX,y:25+model.offsetY}, end={x:130+model.offsetX,y:60+model.offsetY};
   model.begin(start,tool,'#ff0000',12);
   model.move({x:95+model.offsetX,y:40+model.offsetY});model.render();
   const firstPreview=canvas.toDataURL();
   model.move(end);model.render();
   const preview=canvas.toDataURL();
   assert(preview!==empty && preview!==firstPreview,'Preview did not resize');
   assert(model.userLayer.toDataURL()===emptyLayer && model.history.length===0,'Preview committed early');
   assert(model.active.points.length===2,'Shape accumulated freehand points');
   model.commit();assert(canvas.toDataURL()===preview,'Commit differs from preview');
   const center=canvas.getContext('2d').getImageData((start.x+end.x)/2,(start.y+end.y)/2,1,1).data;
   assert(center[0]===255 && center[1]===255 && center[2]===255,'Shape was filled');
   const rgba=model.userLayer.getContext('2d').getImageData(0,0,model.width,model.height).data;
   assert(rgba.some((v,i)=>i%4===3 && v>0),'Shape missing');
   for(let i=0;i<rgba.length;i+=4) if(rgba[i+3]===255) assert(rgba[i]===255 && rgba[i+1]===0 && rgba[i+2]===0,'Wrong shape color');
   model.undo();assert(canvas.toDataURL()===empty,'Undo');model.redo();assert(canvas.toDataURL()===preview,'Redo');
   model.clear();assert(canvas.toDataURL()===empty,'Clear');model.undo();assert(canvas.toDataURL()===preview,'Undo clear');
   model.undo();model.begin(end,tool,'#ff0000',12);model.move(start);model.commit();
   assert(canvas.toDataURL()===preview,'Reverse drag geometry differs');assert(model.future.length===0,'New shape did not clear redo');
   model.undo();model.begin(start,tool,'#ff0000',40);model.move(end);model.commit();
   const thick=model.userLayer.getContext('2d').getImageData(0,0,model.width,model.height).data;
   const coverage=data=>data.reduce((sum,v,i)=>sum+(i%4===3?v:0),0);
   assert(coverage(thick)>coverage(rgba),'Selected thickness was ignored');
 });
 await test(`${tool}: clipping during preview/commit, cancellation and zero-size drag`,()=>{
   const canvas=document.createElement('canvas'), model=new Drawing(canvas,recognition);
   model.outlineVisible=false;model.render();const empty=canvas.toDataURL();
   const start={x:5+model.offsetX,y:30+model.offsetY},end={x:150+model.offsetX,y:115+model.offsetY};
   model.begin(start,tool,'#ff0000',60);model.move(end);model.render();
   const mask=model.maskLayer.getContext('2d').getImageData(0,0,model.width,model.height).data;
   const preview=canvas.getContext('2d').getImageData(0,0,model.width,model.height).data;
   for(let i=3;i<mask.length;i+=4) if(!mask[i]) assert(preview[i-3]===255&&preview[i-2]===255&&preview[i-1]===255,'Preview leaked');
   model.cancel();assert(canvas.toDataURL()===empty&&model.history.length===0,'Cancelled shape remained');
   model.begin(start,tool,'#ff0000',60);model.move(end);model.commit();
   const user=model.userLayer.getContext('2d').getImageData(0,0,model.width,model.height).data;
   for(let i=3;i<mask.length;i+=4) assert(mask[i]||!user[i],'Committed shape leaked');
   model.undo();const redoCount=model.future.length;
   model.begin(start,tool,'#ff0000',60);model.commit();
   model.begin(start,tool,'#ff0000',60);model.move({x:start.x,y:end.y});model.commit();
   assert(model.history.length===0&&model.future.length===redoCount,'Empty drag changed history');
 });
}

document.getElementById('summary').textContent=`${passed} passed, ${failed} failed`;
document.title=`${failed ? 'FAIL' : 'PASS'} — Canvas integration tests`;
