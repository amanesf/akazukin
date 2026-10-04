// 点検用：本物の指の操作（ポインタ）で、タップ・はじき・長押しが試作に届くかを確かめる
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
const T = { '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.json': 'application/json', '.svg': 'image/svg+xml' };
const root = new URL('../app/dist', import.meta.url).pathname;
const srv = createServer(async (q, s) => { let p = new URL(q.url, 'http://x').pathname.replace(/^\/akazukin/, ''); if (p === '/') p = '/index.html'; try { const b = await readFile(join(root, p)); s.writeHead(200, { 'content-type': T[extname(p)] || 'text/html' }); s.end(b); } catch { s.writeHead(404).end(); } });
await new Promise((r) => srv.listen(0, r));
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
await p.goto(`http://127.0.0.1:${srv.address().port}/akazukin/?auto=1`);
await p.waitForFunction(() => document.body.classList.contains('ready'));
await p.waitForFunction(() => window.akazukin.sim.phase === 'wave', null, { timeout: 20000 });
const st = () => p.evaluate(() => { const h = window.akazukin.sim.hero; return { x: Math.round(h.x), move: h.move, charge: +h.charge.toFixed(2), order: h.order && Math.round(h.order.x) }; });
const out = {};
// 遠くの地面をタップ → 走る
await p.mouse.click(370, 450);
await p.waitForTimeout(50);
out.tapFar = await st();
await p.waitForTimeout(600);
// 右へはじく → 突進
// （ヘッドレスは描画が遅く、mouse.move の間に長押しの時間が過ぎることがある。指の動きは1回の評価の中で送る）
await p.evaluate(() => {
  const c = document.querySelector('#field canvas');
  const r = c.getBoundingClientRect();
  const ev = (type, x, target) => target.dispatchEvent(new PointerEvent(type, { pointerId: 7, clientX: r.left + x, clientY: r.top + 450, bubbles: true }));
  ev('pointerdown', 150, c);
  ev('pointermove', 165, window);
  ev('pointermove', 190, window);
  ev('pointerup', 190, window);
});
out.flick = await st();
await p.waitForTimeout(500);
// 長押し → 溜め → 離す → 主砲
await p.mouse.move(200, 450); await p.mouse.down(); await p.waitForTimeout(700);
out.hold = await st();
await p.mouse.up();
await p.waitForTimeout(80);
out.release = await st();
// 地図をタップ → 駆けつける
const H = await p.evaluate(() => window.akazukin.view.geo);
await p.mouse.click(30, H.Hm + H.MM * 0.7);
await p.waitForTimeout(50);
out.mini = await st();
await p.waitForTimeout(20000);
out.errors = errors;
console.log(JSON.stringify(out));
await b.close(); srv.close();
