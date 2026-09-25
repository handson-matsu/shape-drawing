import test from 'node:test';
import assert from 'node:assert/strict';
import { luminance, extractPaper, traceContours } from '../js/recognition.mjs';
function fixture(rows) { return { width: rows[0].length, height: rows.length, gray: Uint8Array.from(rows.join(''), c => c === '#' ? 255 : 0) }; }
function extract(rows, threshold = 180) { const f = fixture(rows); return extractPaper(f.gray, f.width, f.height, threshold); }
function areaOf(loops) { return loops.reduce((total, loop) => total + loop.reduce((a, [x,y], i) => { const [nx,ny] = loop[(i+1)%loop.length]; return a + x*ny-nx*y; }, 0)/2, 0); }
test('largest component excludes disconnected bright objects', () => {
 const result = extract(['#......','..###..','..#....','..###.#','.......']);
 assert.equal(result.area, 7); assert.equal(result.mask[0],0); assert.deepEqual(result.bounds,{minX:2,minY:1,maxX:4,maxY:3}); assert.equal(result.touchesEdge,false);
});
test('concavities, holes and pixel geometry are preserved without smoothing', () => {
 const result = extract(['.......','.#####.','.#.#.#.','.###.#.','...###.','.......']);
 const loops = traceContours(result.mask,result.width,result.height);
 assert.equal(loops.length,3); // outer boundary + two separate holes
 assert.equal(areaOf(loops),result.area);
 assert.equal(result.mask[2*7+2],0); assert.equal(result.mask[4*7+1],0);
});
test('threshold selects shaded pixels precisely', () => {
 const gray = new Uint8Array([0,180,210,0,150,220]);
 assert.equal(extractPaper(gray,3,2,180).area,3);
 assert.equal(extractPaper(gray,3,2,140).area,4);
 assert.equal(extractPaper(gray,3,2,230).area,0);
});
test('empty input and edge-touching masks are handled', () => {
 const empty = extract(['...','...']); assert.equal(empty.bounds,null); assert.deepEqual(traceContours(empty.mask,3,2),[]);
 const full = extract(['###','###']); assert.equal(full.touchesEdge,true); assert.equal(areaOf(traceContours(full.mask,3,2)),6);
});
test('alpha and brightness are respected', () => {
 assert.deepEqual([...luminance(new Uint8ClampedArray([255,255,255,255,255,255,255,0,0,0,0,255]))],[255,0,0]);
});
test('all 4x4 binary patterns trace closed, area-exact boundaries including diagonal contacts', () => {
 for (let bits=0;bits<65536;bits++) {
   const mask=Uint8Array.from({length:16},(_,i)=>(bits>>i)&1);
   const loops=traceContours(mask,4,4);
   assert.equal(areaOf(loops),mask.reduce((a,b)=>a+b,0),`pattern ${bits}`);
 }
});
