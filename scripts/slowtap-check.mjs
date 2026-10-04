// 点検用：ゆっくりめのタップ（0.3秒押して離す）が斬りになるか・指を離した合図を取りこぼしても次の指が効くか
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
// 主人公の前に止めた狼を1匹だけ置き、その狼の画面の位置を返す
const setup = () => p.evaluate(() => {
  const { sim: s, view: v } = window.akazukin;
  s.wolves = []; s.spawners = []; s.hero.bowT = 999; s.hero.autoT = 999; s.hero.move = null; s.hero.charge = -1; s.hero.stun = 0;
  s.hero.x = 400; s.hero.lane = 0.5;
  const w = s.debugSpawn('wolf', 460, 0.5); w.age = 9; w.stun = 999; w.hp = 90;
  return w.id;
});
const wolfAt = () => p.evaluate(() => {
  const { sim: s, view: v } = window.akazukin;
  const w = s.wolves[0];
  const c = document.querySelector('#field canvas').getBoundingClientRect();
  // toField の逆
  const g = v.geo, cam = v.cam;
  return { x: c.left + (w.x * g.K - cam.x) * cam.z + g.W / 2, y: c.top + (g.laneTop + w.lane * g.laneH - cam.y) * cam.z + g.Hm / 2 };
});
const hp = () => p.evaluate(() => window.akazukin.sim.wolves[0]?.hp ?? 0);
const out = {};
// 対照：触らなければ狼の体力は減らない（自動の斬りが当たっていないこと）
await setup();
await p.waitForTimeout(1200);
out.control = { hpAfter: await hp() };
await setup();
await p.waitForTimeout(800);
let at = await wolfAt();
out.wolfAt = at;
await p.mouse.move(at.x, at.y); await p.mouse.down(); await p.waitForTimeout(320);
out.midHold = await p.evaluate(() => window.akazukin.sim.hero.charge);
await p.mouse.up();
await p.waitForTimeout(400);
out.slowTap = { hpAfter: await hp() };
// 離した合図を取りこぼす：pointerdown だけ送って up を送らない → 次の指（isPrimary）のタップが効くか
await setup();
await p.waitForTimeout(800);
at = await wolfAt();
await p.evaluate(({ x, y }) => { const c = document.querySelector('#field canvas'); c.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 11, isPrimary: true, clientX: x, clientY: y, bubbles: true })); }, at);
await p.waitForTimeout(500);
await p.evaluate(() => { window.akazukin.sim.wolves[0].hp = 90; });
await p.evaluate(({ x, y }) => { const c = document.querySelector('#field canvas'); const ev = (t) => c.dispatchEvent(new PointerEvent(t, { pointerId: 12, isPrimary: true, clientX: x, clientY: y, bubbles: true })); ev('pointerdown'); ev('pointerup'); }, at);
await p.waitForTimeout(400);
out.lostUp = { hpAfter: await hp(), charge: await p.evaluate(() => window.akazukin.sim.hero.charge) };
out.errors = errors;
console.log(JSON.stringify(out));
await b.close(); srv.close();
