// 点検用：一時停止のボタンで時計が止まり、続けるで動くか・昼の番犬は1回目のタップで選ばれ、2回目で外れるか
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
const errors = []; p.on('pageerror', (e) => errors.push(e.message));
await p.goto(`http://127.0.0.1:${srv.address().port}/akazukin/?auto=1`);
await p.waitForFunction(() => document.body.classList.contains('ready'));
await p.waitForTimeout(1500);
const out = {};
await p.click('#pause');
const c0 = await p.evaluate(() => window.akazukin.sim.clock);
await p.waitForTimeout(800);
out.pausedClockDelta = await p.evaluate((c) => window.akazukin.sim.clock - c, c0);
out.overlay = await p.evaluate(() => document.getElementById('overlay').innerText.slice(0, 20));
await p.click('#overlay button');
await p.waitForTimeout(800);
out.resumedClockDelta = await p.evaluate((c) => window.akazukin.sim.clock - c, c0);
// 昼：番犬を置いて、1回タップ→残る、2回目→外れる
await p.evaluate(() => { const s = window.akazukin.sim; s.wolves = []; s.spawners = []; s.phase = 'shop'; s.place('akita', 380, 0.5); });
await p.waitForTimeout(1500); // 昼のカメラに移る
const at = await p.evaluate(() => { const v = window.akazukin.view; const s = window.akazukin.sim; const c = document.querySelector('#field canvas').getBoundingClientRect(); for (let y = 0; y < v.geo.Hm; y += 3) for (let x = 0; x < c.width; x += 3) { if (v.postAt(s, x, y) === 0) return { x: c.left + x + 6, y: c.top + y + 6 }; } return null; });
await p.mouse.click(at.x, at.y);
await p.waitForTimeout(100);
out.afterOneTap = await p.evaluate(() => ({ posts: window.akazukin.sim.posts.length, picked: window.akazukin.view.picked }));
await p.mouse.click(at.x, at.y);
await p.waitForTimeout(100);
out.afterTwoTaps = await p.evaluate(() => window.akazukin.sim.posts.length);
out.errors = errors;
console.log(JSON.stringify(out));
await b.close(); srv.close();
