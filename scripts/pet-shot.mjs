// 点検用：晩の終わりに番犬をなでるところを撮る。node scripts/pet-shot.mjs 出力の頭 [犬の種類 shiba|akita|tosa ...]
// 晩を始めて狼を消し、なでる犬に選ばせたい1匹だけを残して、なでている所を拡大して撮る
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
const [out = 'pet', ...kinds] = process.argv.slice(2);
const T = { '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.json': 'application/json', '.svg': 'image/svg+xml' };
const root = new URL('../app/dist', import.meta.url).pathname;
const srv = createServer(async (q, s) => { let p = new URL(q.url, 'http://x').pathname.replace(/^\/akazukin/, ''); if (p === '/') p = '/index.html'; try { const b = await readFile(join(root, p)); s.writeHead(200, { 'content-type': T[extname(p)] || 'text/html' }); s.end(b); } catch { s.writeHead(404).end(); } });
await new Promise((r) => srv.listen(0, r));
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
for (const kind of kinds.length ? kinds : ['shiba', 'akita', 'tosa']) {
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  p.on('pageerror', (e) => console.log('E', e.message));
  await p.goto(`http://127.0.0.1:${srv.address().port}/akazukin/?auto=1`);
  await p.waitForFunction(() => document.body.classList.contains('ready'));
  await p.waitForFunction(() => window.akazukin.sim.phase === 'wave', null, { timeout: 30000 });
  await p.waitForTimeout(1500);
  const info = await p.evaluate((kind) => {
    const s = window.akazukin.sim;
    for (const d of s.dogs) if (d.kind !== kind) d.down = 99;
    s.spawners.length = 0;
    s.wolves.length = 0;
    return s.dogs.map((d) => d.kind + ':' + Math.round(d.x)).join(' ');
  }, kind);
  await p.waitForFunction(() => window.akazukin.sim.petting, null, { timeout: 20000 }).catch(() => console.log(kind, 'petting なし', info));
  await p.waitForTimeout(500);
  const box = await p.evaluate(() => window.akazukin.view.heroAt);
  const f = `${out}-${kind}.png`;
  await p.screenshot({ path: f, clip: { x: Math.max(0, Math.min(390 - 300, box.x - 150)), y: Math.max(0, box.y), width: 300, height: Math.min(360, 844 - Math.max(0, box.y)) } });
  console.log(f);
  await p.close();
}
await b.close(); srv.close();
