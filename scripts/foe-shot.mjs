// 点検用：人狼男・人狼女・カラスを主人公の前に置いて、動きの段ごとに撮る。node scripts/foe-shot.mjs 出力先フォルダ
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join } from 'node:path';
const [dir = 'foes'] = process.argv.slice(2);
await mkdir(dir, { recursive: true });
const T = { '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.json': 'application/json', '.svg': 'image/svg+xml' };
const root = new URL('../app/dist', import.meta.url).pathname;
const srv = createServer(async (q, s) => { let p = new URL(q.url, 'http://x').pathname.replace(/^\/akazukin/, ''); if (p === '/') p = '/index.html'; try { const b = await readFile(join(root, p)); s.writeHead(200, { 'content-type': T[extname(p)] || 'text/html' }); s.end(b); } catch { s.writeHead(404).end(); } });
await new Promise((r) => srv.listen(0, r));
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
p.on('pageerror', (e) => console.log('E', e.message));
await p.goto(`http://127.0.0.1:${srv.address().port}/akazukin/?auto=1&manual=1`);
await p.waitForFunction(() => document.body.classList.contains('ready'));
await p.waitForTimeout(4000);
await p.evaluate(() => {
  const a = window.akazukin; const s = a.sim;
  s.wave = 25; a.tick(1 / 60, 200); s.spawners = []; s.wolves = []; s.dogs = [];
  s.hero.x = 200; s.hero.lane = 0.5; s.hero.hp = 1e6;
  window.__m = s.debugSpawn('wman', 330, 0.5);
  window.__f = s.debugSpawn('wwoman', 560, 0.75); window.__f.skillCd = 2;
  window.__c = s.debugSpawn('crow', 330, 0.3); window.__c.z = 60;
});
let i = 0;
for (const n of [20, 15, 25, 20, 20, 30, 40, 20, 20, 25]) {
  await p.evaluate((n) => { const a = window.akazukin; for (let k = 0; k < n; k++) { a.sim.hero.autoT = 9; a.sim.hero.bowT = 9; a.tick(1 / 60, 1); } }, n);
  await p.waitForTimeout(200);
  const st = await p.evaluate(() => [window.__m.mode, window.__f.mode, window.__c.mode].join('/'));
  const f = join(dir, `f${i++}.png`);
  await p.screenshot({ path: f, clip: { x: 0, y: 160, width: 390, height: 460 } });
  console.log(f, st);
}
await b.close(); srv.close();
