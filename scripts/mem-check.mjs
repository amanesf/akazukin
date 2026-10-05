// 点検用：色付きの狼の絵（UnitArt.dye）をいくつ・どれだけ取っておいているかを、晩を進めながら数える。
// node scripts/mem-check.mjs [晩,晩,...]（先に app で npm run build）。各晩を自動操作で 40秒遊ばせて、昼に戻して数える
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { bot } from './bot.mjs';
const [list = '12,21,33,45,58,70,85,98'] = process.argv.slice(2);
const T = { '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.json': 'application/json', '.svg': 'image/svg+xml' };
const root = new URL('../app/dist', import.meta.url).pathname;
const srv = createServer(async (q, s) => { let p = new URL(q.url, 'http://x').pathname.replace(/^\/akazukin/, ''); if (p === '/') p = '/index.html'; try { const b = await readFile(join(root, p)); s.writeHead(200, { 'content-type': T[extname(p)] || 'text/html' }); s.end(b); } catch { s.writeHead(404).end(); } });
await new Promise((r) => srv.listen(0, r));
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
p.on('pageerror', (e) => console.log('E', e.message));
await p.goto(`http://127.0.0.1:${srv.address().port}/akazukin/?auto=1&manual=1`);
await p.waitForFunction(() => document.body.classList.contains('ready'));
await p.waitForTimeout(3000);
await p.evaluate(`window.__bot = ${bot.toString()}`);
// 取っておいている色付きの絵（本画面と小さい地図）。1枚＝縦×横×4バイト（画面に送った分。描いた紙の分も同じだけある）
const count = () => p.evaluate(() => {
  const a = window.akazukin;
  const one = (art) => { let n = 0, px = 0; for (const t of art?.dyed?.values?.() ?? []) { n++; px += t.source.pixelWidth * t.source.pixelHeight; } return { n, mb: +(px * 4 / 1e6).toFixed(1) }; };
  return { view: one(a.view.wolves), mini: one(a.view.mini.wolfArt) };
});
for (const n of list.split(',').map(Number)) {
  await p.evaluate((n) => {
    const a = window.akazukin; const s = a.sim;
    s.spawners = []; s.wolves = []; s.sleepers = [];
    s.wave = n - 1; s.phase = 'shop';
    const lv = Math.round(n / 7);
    s.levels = { body: lv, near: lv + 2, far: lv, dog: Math.max(0, lv - 1) };
    s.houseHp = 600; s.hero.hp = s.maxHp;
    a.tick(1 / 60, 30);
  }, n);
  const day = await count();
  await p.evaluate(() => { window.akazukin.sim.nextWave(); window.__mem = {}; });
  await p.evaluate(() => { const a = window.akazukin; for (let i = 0; i < 400; i++) { window.__bot(a.sim, window.__mem, true); a.tick(1 / 60, 6); } });
  const night = await count();
  console.log(`${n}晩  昼：本画面 ${day.view.n}枚 ${day.view.mb}MB・地図 ${day.mini.n}枚 ${day.mini.mb}MB  ／ 夜40秒：本画面 ${night.view.n}枚 ${night.view.mb}MB・地図 ${night.mini.n}枚 ${night.mini.mb}MB`);
}
await b.close(); srv.close();
