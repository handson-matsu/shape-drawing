import { Drawing } from './drawing.js';
import { loadImage } from './image-loader.js';
const $ = id => document.getElementById(id);
const screens = ['import', 'review', 'draw', 'save'];
let step = 0, original = null, recognition = null, drawing = null, worker = null;
let requestId = 0, thresholdTimer, toastTimer, exportURL, activePointer = null, frame = null;
let tool = 'pen', color = '#ef806e', penSize = 12;
const colors = [['#ef806e','さんご'],['#efba4b','きいろ'],['#80a58a','みどり'],['#648fd4','あお'],['#a68abd','むらさき'],['#df98b0','ピンク'],['#263b4c','くろ'],['#ffffff','しろ']];
function showStep(index) {
  step = index;
  screens.forEach((name, i) => { $(`${name}-screen`).hidden = i !== index; });
  document.querySelectorAll('.steps li').forEach((el, i) => {
    el.classList.toggle('done', i < index);
    if (i === index) el.setAttribute('aria-current', 'step'); else el.removeAttribute('aria-current');
  });
  window.scrollTo({ top: 0, behavior: 'instant' });
  const heading = $(`${screens[index]}-screen`).querySelector('h1');
  heading.tabIndex = -1; heading.focus({ preventScroll: true });
}
function toast(message) { $('message').textContent = message; $('message').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('message').hidden = true, 5500); }
function confirmAction(title, description, label, action) {
  $('confirm-title').textContent = title; $('confirm-description').textContent = description;
  $('confirm-ok').textContent = label;
  $('confirm-ok').onclick = () => { $('confirm-dialog').close(); action(); };
  $('confirm-dialog').showModal();
}
$('confirm-cancel').onclick = () => $('confirm-dialog').close();
$('camera-button').onclick = () => $('camera-input').click();
$('upload-button').onclick = () => $('file-input').click();
for (const id of ['camera-input', 'file-input']) $(id).addEventListener('change', async event => {
  const file = event.target.files[0]; event.target.value = '';
  if (!file) return;
  $('busy').hidden = false;
  try {
    const source = await loadImage(file);
    await startRecognition(source);
  } catch (error) {
    console.error(error); $('busy').hidden = true;
    toast('画像を読み込めませんでした。JPEG・PNG・WebPなどの写真を選びなおしてね。');
  }
});
function startRecognition(source) {
  worker?.terminate(); original = source; recognition = null;
  worker = new Worker(new URL('./recognition-worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = ({ data }) => {
    if (data.id !== requestId) return;
    $('busy').hidden = true;
    if (data.error) { $('accept-button').disabled = true; toast('輪郭を読み取れませんでした。別の写真でもう一度試してね。'); return; }
    recognition = data; renderReview();
  };
  worker.onerror = () => { $('busy').hidden = true; $('accept-button').disabled = true; toast('画像処理を開始できませんでした。ページを再読み込みしてね。'); };
  $('threshold').value = 180; $('threshold-value').value = 180;
  showStep(1); analyze(true);
}
function analyze(first = false) {
  const id = ++requestId;
  $('accept-button').disabled = true;
  $('recognition-status').textContent = '紙のかたちを探しています…';
  const payload = { id, threshold: Number($('threshold').value) };
  if (first) {
    const rgba = original.getContext('2d').getImageData(0, 0, original.width, original.height).data;
    Object.assign(payload, { rgba, width: original.width, height: original.height });
    worker.postMessage(payload, [rgba.buffer]);
  } else worker.postMessage(payload);
}
function renderReview() {
  const target = $('review-canvas'); target.width = original.width; target.height = original.height;
  const ctx = target.getContext('2d'); ctx.drawImage(original, 0, 0);
  const path = new Path2D();
  for (const loop of recognition.contours) {
    loop.forEach(([x, y], i) => path[i ? 'lineTo' : 'moveTo'](x, y)); path.closePath();
  }
  const line = Math.max(2, Math.max(target.width, target.height) / 320);
  ctx.lineWidth = line + Math.max(1, line * .6); ctx.strokeStyle = '#ffffff'; ctx.stroke(path);
  ctx.lineWidth = line; ctx.strokeStyle = '#1674ff'; ctx.stroke(path);
  const tooSmall = recognition.area < Math.max(16, original.width * original.height * .0005);
  const status = $('recognition-status'); status.classList.toggle('error', tooSmall || recognition.touchesEdge);
  status.textContent = tooSmall ? '紙が見つからないよ。つまみを左に動かすか、別の写真を選んでね。' : recognition.touchesEdge ? '画像の端まで白い領域があるよ。背景まで選ばれていないか、青い線をよく確認してね。' : 'かたちが見つかったよ！ 紙のふちに青い線が合っているか確認してね。';
  $('accept-button').disabled = tooSmall;
}
$('threshold').oninput = () => {
  $('threshold-value').value = $('threshold').value;
  // Immediately invalidate in-flight results so stale contours cannot be accepted.
  ++requestId; $('accept-button').disabled = true; clearTimeout(thresholdTimer);
  thresholdTimer = setTimeout(() => analyze(), 140);
};
$('accept-button').onclick = () => {
  if (!recognition?.bounds || $('accept-button').disabled) return;
  drawing = new Drawing($('drawing-canvas'), recognition);
  drawing.outlineVisible = $('outline-visible').checked;
  drawing.outlineWidth = Number($('outline-size').value); drawing.render();
  $('canvas-dimensions').textContent = `${drawing.width} × ${drawing.height} px`;
  updateHistory(); showStep(2);
};
function restart() {
  clearTimeout(thresholdTimer); ++requestId; worker?.terminate(); worker = null;
  original = null; recognition = null; drawing = null; activePointer = null;
  if (exportURL) { URL.revokeObjectURL(exportURL); exportURL = null; }
  $('save-preview').removeAttribute('src'); $('download-button').removeAttribute('href');
  showStep(0);
}
for (const button of document.querySelectorAll('.restart-button')) button.onclick = () => {
  if (drawing?.history.length) confirmAction('新しい形で遊ぶ？', '今の作品はここから消えるよ。残したいときは先に保存してね。', '新しい形へ', restart);
  else restart();
};
document.querySelector('.brand').onclick = event => { event.preventDefault(); document.querySelector('#draw-screen .restart-button').click(); };
function selectTool(next) {
  tool = next;
  for (const button of document.querySelectorAll('[data-tool]')) {
    const selected = button.dataset.tool === next;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  }
  $('tool-hint').textContent = ['pen', 'eraser'].includes(next)
    ? '指やマウスを動かして、自由に描こう。'
    : 'ななめに引っぱって大きさを決めよう。離すと完成！';
}
for (const button of document.querySelectorAll('[data-tool]')) button.onclick = () => selectTool(button.dataset.tool);
function selectColor(next) {
  color = next; $('custom-color').value = next;
  if (tool === 'eraser') selectTool('pen');
  document.querySelectorAll('.swatch').forEach(el => el.setAttribute('aria-pressed', String(el.dataset.color === next)));
}
for (const [value, label] of colors) {
  const button = document.createElement('button'); button.className = 'swatch'; button.dataset.color = value;
  button.style.setProperty('--color', value); button.setAttribute('aria-label', label); button.title = label;
  button.setAttribute('aria-pressed', String(value === color)); button.append(document.createElement('span'));
  button.onclick = () => selectColor(value); $('palette').append(button);
}
$('custom-color').oninput = e => selectColor(e.target.value);
$('pen-size').oninput = e => { penSize = Number(e.target.value); $('pen-size-value').value = penSize; };
$('outline-visible').onchange = e => { if (drawing) { drawing.outlineVisible = e.target.checked; drawing.render(); } };
$('outline-size').oninput = e => { $('outline-size-value').value = e.target.value; if (drawing) { drawing.outlineWidth = Number(e.target.value); drawing.render(); } };
function updateHistory() {
  $('undo-button').disabled = !drawing?.history.length;
  $('redo-button').disabled = !drawing?.future.length;
  // Keep history controls usable on Safari versions without findLastIndex.
  let lastClear = -1;
  for (let i = (drawing?.history.length ?? 0) - 1; i >= 0; i--) {
    if (drawing.history[i].type === 'clear') { lastClear = i; break; }
  }
  $('clear-button').disabled = !drawing?.history.slice(lastClear + 1).some(item => item.tool && item.tool !== 'eraser');
}
$('undo-button').onclick = () => { drawing?.undo(); updateHistory(); };
$('redo-button').onclick = () => { drawing?.redo(); updateHistory(); };
$('clear-button').onclick = () => confirmAction('描いたものを全消去する？', '紙の輪郭はそのまま残るよ。「1つ戻る」で元に戻せるよ。', '全消去する', () => { drawing.clear(); updateHistory(); });
const surface = $('drawing-canvas');
function point(event) { const rect = surface.getBoundingClientRect(); return { x: (event.clientX - rect.left) * surface.width / rect.width, y: (event.clientY - rect.top) * surface.height / rect.height }; }
function requestRender() { if (frame === null) frame = requestAnimationFrame(() => { frame = null; drawing?.render(); }); }
surface.addEventListener('pointerdown', event => {
  if (!drawing || activePointer !== null || event.button !== 0) return;
  event.preventDefault(); activePointer = event.pointerId; surface.setPointerCapture(event.pointerId);
  drawing.begin(point(event), tool, color, penSize); requestRender();
});
surface.addEventListener('pointermove', event => {
  if (event.pointerId !== activePointer) return;
  event.preventDefault(); const events = event.getCoalescedEvents?.() || [];
  for (const item of events.length ? events : [event]) drawing.move(point(item)); requestRender();
});
surface.addEventListener('pointerup', event => {
  if (event.pointerId !== activePointer) return;
  drawing.move(point(event)); drawing.commit(); activePointer = null; updateHistory();
  if (surface.hasPointerCapture(event.pointerId)) surface.releasePointerCapture(event.pointerId);
});
function cancelPointer(event) { if (event.pointerId === activePointer) { drawing?.cancel(); activePointer = null; } }
surface.addEventListener('pointercancel', cancelPointer); surface.addEventListener('lostpointercapture', cancelPointer);
surface.addEventListener('contextmenu', event => event.preventDefault());
document.addEventListener('keydown', event => {
  if (step !== 2 || $('confirm-dialog').open || activePointer !== null || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) return;
  if ((event.ctrlKey || event.metaKey) && ['z', 'y'].includes(event.key.toLowerCase())) {
    event.preventDefault(); if (event.shiftKey || event.key.toLowerCase() === 'y') drawing.redo(); else drawing.undo(); updateHistory();
  }
});
$('finish-button').onclick = async () => {
  if (activePointer !== null) return;
  try {
    const blob = await drawing.toBlob(); if (exportURL) URL.revokeObjectURL(exportURL);
    exportURL = URL.createObjectURL(blob); $('save-preview').src = exportURL; $('download-button').href = exportURL;
    $('download-button').download = `かたちのアトリエ-${new Date().toISOString().slice(0, 10)}.png`; showStep(3);
  } catch { toast('保存画像を作れませんでした。もう一度試してね。'); }
};
$('back-to-draw').onclick = () => showStep(2);
$('demo-button').onclick = () => {
  const source = document.createElement('canvas'); source.width = 840; source.height = 760;
  const ctx = source.getContext('2d'); ctx.fillStyle = '#26333c'; ctx.fillRect(0, 0, 840, 760);
  ctx.save(); ctx.translate(420, 375); ctx.fillStyle = '#fff'; ctx.beginPath();
  // An intentionally irregular paper silhouette, passed through real recognition.
  const points = [[-35,-228],[-102,-278],[-162,-266],[-190,-214],[-176,-157],[-246,-164],[-283,-123],[-274,-65],[-222,-29],[-279,21],[-274,80],[-228,117],[-167,105],[-178,175],[-134,214],[-75,197],[-35,146],[9,219],[68,225],[108,180],[91,120],[158,149],[208,119],[222,62],[168,16],[229,-24],[249,-74],[218,-120],[157,-121],[181,-182],[154,-232],[101,-248],[55,-211],[23,-265],[-16,-270]];
  points.forEach(([x,y],i) => ctx[i ? 'lineTo' : 'moveTo'](x,y)); ctx.closePath(); ctx.fill(); ctx.restore();
  $('busy').hidden = false; startRecognition(source);
};

// Record one visit per page load without waiting for the response or retrying.
try {
  fetch('https://script.google.com/macros/s/AKfycbxssCIHsD-N97SHxNC_GN0ihYeC0qy-lb-EY0KmSs6Gnztaph1sITMerLVEnNWOGkYc/exec?app=shape-drawing', {
    method: 'GET',
    mode: 'no-cors',
    cache: 'no-store',
    credentials: 'omit',
    keepalive: true,
  }).catch(() => {});
} catch {
  // Access logging must never interrupt the app.
}
