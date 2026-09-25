import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url);
const html = readFileSync(new URL('index.html', root), 'utf8');
const base = new URL('https://example.github.io/shape-drawing/');
function verifyReference(reference, parent = base) {
  if (reference.startsWith('#')) return;
  assert(!/^(?:[a-z]+:|\/)/i.test(reference), `Non-relative asset: ${reference}`);
  const resolved = new URL(reference, parent);
  assert(resolved.pathname.startsWith(base.pathname), `Escaped project path: ${reference}`);
  const relative = decodeURIComponent(resolved.pathname.slice(base.pathname.length));
  assert(existsSync(new URL(relative, root)), `Missing asset: ${relative}`);
}
test('Pages entry point, no-Jekyll marker and relative HTML resources exist', () => {
  assert(existsSync(new URL('.nojekyll', root)));
  assert.match(html, /<script type="module" src="js\/app\.js"/);
  for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) verifyReference(match[1]);
});
test('All JavaScript imports and worker URLs resolve below the project path', () => {
  for (const name of readdirSync(fileURLToPath(new URL('js/', root)))) {
    const source = readFileSync(new URL(`js/${name}`, root), 'utf8');
    const parent = new URL(`js/${name}`, base);
    for (const match of source.matchAll(/(?:from\s+|new URL\()(['"])([^'"]+)\1/g)) verifyReference(match[2], parent);
    assert(!/localhost|127\.0\.0\.1|\/Users\//.test(source), `Development path in ${name}`);
  }
  const css = readFileSync(new URL('styles.css', root), 'utf8');
  assert(!/@import|https?:\/\//.test(css), 'External CSS dependency');
});
test('Mobile camera and photo picker remain distinct and image-enabled', () => {
  const camera = html.match(/<input\b[^>]*id="camera-input"[^>]*>/)?.[0];
  const picker = html.match(/<input\b[^>]*id="file-input"[^>]*>/)?.[0];
  assert.match(camera, /type="file"/); assert.match(camera, /accept="image\/\*"/); assert.match(camera, /capture="environment"/);
  assert.match(picker, /type="file"/); assert.match(picker, /accept="image\/\*"/); assert(!/capture=/.test(picker));
});
