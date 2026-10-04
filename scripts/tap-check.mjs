// 点検用：狼の絵の上の方（頭・背中）をタップして、その狼に当たるか。奥行きのずれた狼でも（2026-10-04 アマネさん「狼当たらない？ときある」）
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
const T = { '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.json': 'application/json', '.svg': 'image/svg+xml' };
const root = new URL('../app/dist', import.meta.url).pathname;
const srv = createServer(async (q, s) => { let p = new URL(q.url, 'http://x').pathname.replace(/^\/akazukin/, ''); if (p === '/') p = '/index.html'; try { const b = await readFile(join(root, p)); s.writeHead(200, { 'content-type': T[extname(p)] || 'text/html' }); s.end(b); } catch { s.writeHead(404).end(); } });
await new Promise((r) => srv.listen(0, r));
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 390, height: 844 }, hasTouch: false });
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
await p.goto(`http://127.0.0.1:${srv.address().port}/akazukin/?auto=1`);
await p.waitForFunction(() => document.body.classList.contains('ready'));
await p.waitForTimeout(3500);
const out = {};
for (const [name, lane, hy] of [['head-sameLane', 0.6, 0.15], ['back-farLane', 0.05, 0.3], ['body-nearLane', 0.95, 0.5]]) {
  const box = await p.evaluate(([lane]) => {
    const s = window.akazukin.sim; const v = window.akazukin.view;
    s.wolves = []; s.spawners = []; s.hero.x = 300; s.hero.lane = 0.6; s.hero.move = null; s.hero.order = null; s.hero.autoT = 9; s.hero.bowT = 9;
    const w = s.debugSpawn('wolf', 420, lane); w.cooldown = 99;
    return w.id;
  }, [lane]);
  await p.waitForTimeout(300);
  const r = await p.evaluate(([id, hy]) => {
    const v = window.akazukin.view; const b = v.wolfBoxes.find((b) => b.id === id); const { z, ox, oy } = v.xf;
    const c = document.querySelector('#field canvas').getBoundingClientRect();
    return { x: c.left + ((b.x0 + b.x1) / 2) * z + ox, y: c.top + (b.y0 + (b.y1 - b.y0) * hy) * z + oy };
  }, [box, hy]);
  await p.mouse.click(r.x, r.y);
  await p.waitForTimeout(900);
  out[name] = await p.evaluate((id) => { const w = window.akazukin.sim.wolves.find((w) => w.id === id); return w ? Math.round(w.maxHp - w.hp) : 'dead'; }, box);
}
out.errors = errors;
console.log(JSON.stringify(out));
await b.close(); srv.close();
