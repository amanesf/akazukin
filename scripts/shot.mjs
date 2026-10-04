// 点検用：試作を開いて1枚撮る。node scripts/shot.mjs 出力.png [クエリ] [待つミリ秒] [評価する式]
// 例：題字の画面は クエリなし、桜嵐は "?auto=1" と "s.gauge=100; s.ouran()" のように
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
const [out = 'shot.png', query = '', wait = '2500', expr = ''] = process.argv.slice(2);
const T = { '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.json': 'application/json', '.svg': 'image/svg+xml' };
const root = new URL('../app/dist', import.meta.url).pathname;
const srv = createServer(async (q, s) => { let p = new URL(q.url, 'http://x').pathname.replace(/^\/akazukin/, ''); if (p === '/') p = '/index.html'; try { const b = await readFile(join(root, p)); s.writeHead(200, { 'content-type': T[extname(p)] || 'text/html' }); s.end(b); } catch { s.writeHead(404).end(); } });
await new Promise((r) => srv.listen(0, r));
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 390, height: 844 } });
p.on('pageerror', (e) => console.log('E', e.message));
await p.goto(`http://127.0.0.1:${srv.address().port}/akazukin/${query}`);
await p.waitForFunction(() => document.body.classList.contains('ready'));
await p.waitForTimeout(Number(wait));
if (expr) {
  await p.evaluate(`(() => { const s = window.akazukin.sim; ${expr}; })()`);
  await p.waitForTimeout(Number(process.env.AFTER ?? 350));
}
await p.screenshot({ path: out });
console.log(out);
await b.close(); srv.close();
