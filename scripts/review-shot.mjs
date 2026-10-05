// 点検用：中盤以降の晩を自動操作で遊ばせて撮る（昼の画面＋夜の途中2枚）。node scripts/review-shot.mjs 出力先 [晩,晩,...]
// 段（強化）は計測の自動操作がその晩に着いたときくらいに置く
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { bot } from './bot.mjs';
const [dir = 'review', list = '21,45,70'] = process.argv.slice(2);
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
await p.waitForTimeout(3000);
await p.evaluate(`window.__bot = ${bot.toString()}`);
for (const n of list.split(',').map(Number)) {
  await p.evaluate((n) => {
    const a = window.akazukin; const s = a.sim;
    a.tick(1 / 60, 10);
    s.spawners = []; s.wolves = []; s.sleepers = [];
    s.wave = n - 1; s.phase = 'shop';
    const lv = Math.round(n / 7);
    s.levels = { body: lv, near: lv + 2, far: lv, dog: Math.max(0, lv - 1) };
    s.houseHp = 600; s.hero.hp = s.maxHp;
    a.tick(1 / 60, 30);
  }, n);
  await p.waitForTimeout(300);
  await p.screenshot({ path: join(dir, `n${n}-day.png`) });
  await p.evaluate(() => { window.akazukin.sim.nextWave(); window.__mem = {}; });
  for (const [k, sec] of [['a', 10], ['b', 14]]) {
    await p.evaluate((sec) => { const a = window.akazukin; for (let i = 0; i < sec * 10; i++) { window.__bot(a.sim, window.__mem, true); a.tick(1 / 60, 6); } }, sec);
    await p.waitForTimeout(250);
    await p.screenshot({ path: join(dir, `n${n}-${k}.png`) });
  }
}
await b.close(); srv.close();
