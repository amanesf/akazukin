// 点検用：題字の画面と、ストーリー画面（ストーリー・キャラクター・ゲーム概要が1本に続く）を上から順に撮る。node scripts/story-shot.mjs 出力先
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
const out = process.argv[2];
const T = { '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.json': 'application/json', '.svg': 'image/svg+xml' };
const root = new URL('../app/dist', import.meta.url).pathname;
const srv = createServer(async (q, s) => { let p = new URL(q.url, 'http://x').pathname.replace(/^\/akazukin/, ''); if (p === '/') p = '/index.html'; try { const b = await readFile(join(root, p)); s.writeHead(200, { 'content-type': T[extname(p)] || 'text/html' }); s.end(b); } catch { s.writeHead(404).end(); } });
await new Promise((r) => srv.listen(0, r));
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 390, height: 844 } });
p.on('pageerror', (e) => console.log('E', e.message));
await p.goto(`http://127.0.0.1:${srv.address().port}/akazukin/`);
await p.waitForFunction(() => document.body.classList.contains('ready'));
await p.waitForTimeout(2500);
await p.screenshot({ path: `${out}/t-title.png` });
await p.click('.storybtn');
await p.waitForTimeout(800);
// 1本の読みものを上から順に
const h = await p.evaluate(() => document.querySelector('.st-body').scrollHeight);
for (let y = 0, i = 0; y < h && i < 16; y += 680, i++) {
  await p.evaluate((y) => (document.querySelector('.st-body').scrollTop = y), y);
  await p.waitForTimeout(200);
  await p.screenshot({ path: `${out}/t-story-${String(i).padStart(2, '0')}.png` });
}
await b.close(); srv.close();
