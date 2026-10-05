// 色の狼の絵（ストーリー画面・「これから」「今夜」の一覧用）を、ゲームと同じ色付け（UnitArt.dye）で書き出す。生成なし。
// node scripts/export-colors.mjs（先に app で npm run build）→ app/public/wolves/col/{色}.webp（狼の立ち姿・半分の大きさ）
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { extname, join } from 'node:path';
const T = { '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.json': 'application/json', '.svg': 'image/svg+xml' };
const root = new URL('../app/dist', import.meta.url).pathname;
const outDir = new URL('../app/public/wolves/col', import.meta.url).pathname;
await mkdir(outDir, { recursive: true });
const srv = createServer(async (q, s) => { let p = new URL(q.url, 'http://x').pathname.replace(/^\/akazukin/, ''); if (p === '/') p = '/index.html'; try { const b = await readFile(join(root, p)); s.writeHead(200, { 'content-type': T[extname(p)] || 'text/html' }); s.end(b); } catch { s.writeHead(404).end(); } });
await new Promise((r) => srv.listen(0, r));
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage();
await p.goto(`http://127.0.0.1:${srv.address().port}/akazukin/?auto=1&manual=1`);
await p.waitForFunction(() => document.body.classList.contains('ready') && window.akazukin.view.wolves.ready);
const imgs = await p.evaluate(() => {
  const v = window.akazukin.view;
  const out = {};
  for (const c of ['red', 'purple', 'black', 'orange', 'green', 'gold']) {
    const src = v.wolves.dye('wolf', v.furOf('wolf', c)).source.resource;
    const cv = document.createElement('canvas');
    cv.width = Math.round(src.width / 2);
    cv.height = Math.round(src.height / 2);
    const ctx = cv.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, 0, 0, cv.width, cv.height);
    out[c] = cv.toDataURL('image/webp', 0.88).split(',')[1];
  }
  return out;
});
for (const [c, d] of Object.entries(imgs)) await writeFile(join(outDir, `${c}.webp`), Buffer.from(d, 'base64'));
console.log('wrote', Object.keys(imgs).join(' '));
await b.close(); srv.close();
