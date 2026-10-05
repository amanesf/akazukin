// 点検用：99夜目の狼王を置いて、攻めの予兆・倒れ込みを撮る。node scripts/king-shot.mjs 出力先フォルダ
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join } from 'node:path';
const [dir = 'king'] = process.argv.slice(2);
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
  s.wave = 98; a.tick(1 / 60, 200); s.spawners = []; s.wolves = []; s.dogs = [];
  s.hero.x = 400; s.hero.lane = 0.5; s.hero.hp = 1e6;
  window.__k = s.debugSpawn('king', 640, 0.5);
  window.__k.modeT = 99;
  a.tick(1 / 60, 90);
});
const shots = [
  ['idle', (k) => { k.mode = ''; k.modeT = 99; }],
  ['lunge-wind', (k) => { k.kdir = -1; k.mode = 'kl'; k.modeT = 0.6; }],
  ['slam-wind', (k) => { k.kdir = -1; k.mode = 'ks'; k.modeT = 0.6; }],
  ['howl-wind', (k) => { k.kdir = -1; k.mode = 'kw'; k.modeT = 0.15; }],
  ['wave', (k) => { k.mode = 'rest'; k.modeT = 99; }],
  ['down', (k) => { k.mode = 'down'; k.modeT = 4; }],
  ['marks2', (k) => { k.mode = ''; k.modeT = 99; k.markIdx = 1; k.markHp = k.maxHp * 0.02; }],
];
for (const [name, f] of shots) {
  await p.evaluate((src) => { const k = window.__k; (0, eval)(src)(k); window.akazukin.sim.hero.autoT = 9; window.akazukin.sim.hero.bowT = 9; window.akazukin.tick(1 / 60, name === 'wave' ? 25 : 3); }, f.toString()).catch((e) => console.log(e.message));
  await p.waitForTimeout(150);
  await p.screenshot({ path: join(dir, `${name}.png`), clip: { x: 0, y: 60, width: 390, height: 560 } });
}
await b.close(); srv.close();
