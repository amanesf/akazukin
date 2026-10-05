// 点検用：色の狼を並べて撮る（plan.md §0.10②）。node scripts/color-shot.mjs 出力.png [昼にするなら day]
// 時計を止めた試作（?manual=1）で晩を始め、主人公の前に7色（と遠吠え・鎧狼）を置いて、少し進めてから撮る
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
const [out = 'colors.png', mode = ''] = process.argv.slice(2);
const T = { '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.json': 'application/json', '.svg': 'image/svg+xml' };
const root = new URL('../app/dist', import.meta.url).pathname;
const srv = createServer(async (q, s) => { let p = new URL(q.url, 'http://x').pathname.replace(/^\/akazukin/, ''); if (p === '/') p = '/index.html'; try { const b = await readFile(join(root, p)); s.writeHead(200, { 'content-type': T[extname(p)] || 'text/html' }); s.end(b); } catch { s.writeHead(404).end(); } });
await new Promise((r) => srv.listen(0, r));
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
p.on('pageerror', (e) => console.log('E', e.message));
await p.goto(`http://127.0.0.1:${srv.address().port}/akazukin/?auto=1&manual=1`);
await p.waitForFunction(() => document.body.classList.contains('ready'));
await p.waitForFunction(() => window.akazukin.view.ready ?? true); await p.waitForTimeout(4000);
await p.evaluate((mode) => {
  const a = window.akazukin;
  const s = a.sim;
  s.wave = 30;
  a.tick(1 / 60, 200); // 最初の晩を始める
  s.spawners = [];
  s.wolves = [];
  s.hero.x = 215;
  s.hero.lane = 0.02;
  const L = ['red', 'purple', 'black', 'orange', 'green', 'gold', undefined];
  L.forEach((c, i) => {
    const w = s.debugSpawn(i === 1 ? 'pup' : 'wolf', 110 + i * 34, i % 2 ? 0.45 : 0.85, c);
    w.hp = w.maxHp * 0.7;
  });
  s.debugSpawn('howler', 300, 0.2);
  s.debugSpawn('armored', 150, 0.2);
  const z = s.debugSpawn('wolf', 260, 0.2, 'green');
  z.hp = 0;
  for (const w of s.wolves) w.skillCd = 99;
  a.tick(1 / 60, 3);
}, mode);
await p.waitForTimeout(400);
await p.screenshot({ path: out });
console.log(out);
await b.close(); srv.close();
