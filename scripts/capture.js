/*
 * 撮影ループ。遊びの手触りは、書いたコードを読んでも分からない。
 * 実機サイズのブラウザで試作を動かし、作品の時計で指定した時刻ごとに静止画を撮る。
 * あわせて状態（銭・家の耐久・波・討伐数）を書き出す。
 *
 * 使い方: node scripts/capture.js [--at 5,20,40] [--speed 4] [--play 1] [--out shots]
 *   --play 1 : 素朴な自動操作。先頭の狼の手前をタップ（弓）、5匹以上いれば長押しで主砲を2段まで溜めて撃つ、
 *              銭があれば番犬、合間は決まった順に強化を買って次の波へ。上手い人より弱い（タップが遅い）
 * 先に app で npm run build すること。
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).join(' ').split('--').filter(Boolean)
    .map((s) => s.trim().split(/\s+/)).map(([k, v]) => [k, v ?? '1']),
);
const AT = (args.at ?? '5,20,40,80').split(',').map(Number);
const OUT = args.out ?? 'shots';
const view = { width: 390, height: 844 };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp' };

const root = new URL('../app/dist/', import.meta.url).pathname;
const server = createServer(async (req, res) => {
  let path = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/akazukin/, '');
  if (path === '/' || path === '') path = '/index.html';
  try {
    const body = await readFile(join(root, normalize(path)));
    res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404).end('not found'); }
});
await new Promise((r) => server.listen(0, r));
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM || '/opt/pw-browsers/chromium',
  // ヘッドレスには GPU が無い。これが無いと WebGL が作れず真っ黒になる。
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: view, deviceScaleFactor: 2, hasTouch: true });
page.on('pageerror', (e) => console.log('  ERROR:', e.message));
await page.goto(`http://127.0.0.1:${server.address().port}/akazukin/?auto=1&speed=${args.speed ?? 1}&seed=${args.seed ?? 1}`);
await page.waitForFunction(() => document.body.classList.contains('ready'), null, { timeout: 60000 });

const state = () => page.evaluate(() => {
  const s = window.akazukin.sim;
  return { phase: s.phase, levels: Object.values(s.levels).join(''), clock: s.clock, coins: Math.floor(s.coins), house: Math.round(s.houseHp), wave: s.wave + 1, kills: s.kills, wolves: s.wolves.length, dogs: s.dogs.length, result: s.result };
});
const autoplay = () => page.evaluate(() => {
  const s = window.akazukin.sim;
  if (s.phase === 'shop') {
    for (const id of ['bowCount', 'bowPower', 'chargeSpeed', 'blastSize', 'knifeReach']) while (s.buy(id));
    if (s.houseHp < 400) s.buy('repair');
    s.nextWave();
    return;
  }
  const lead = s.wolves.reduce((a, w) => (!a || w.x < a.x ? w : a), null);
  if (s.pressing) {
    if (lead) s.drag(lead.x);
    if (s.chargeStage() >= 1 || !lead) s.release();
  } else if (lead) {
    if (s.wolves.length >= 5 && s.recover <= 0 && lead.x >= 340) s.press(lead.x);
    else { s.press(lead.x - 25); s.release(); } // 矢は遅れて落ちるので少し手前
  }
  for (const k of ['tosa', 'akita', 'shiba']) if (s.sendDog(k)) break;
});

for (const [i, t] of AT.entries()) {
  let st = await state();
  while (st.clock < t && st.result === 'playing') {
    if (args.play) await autoplay();
    await page.waitForTimeout(150);
    st = await state();
  }
  const file = `${OUT}/${String(i).padStart(2, '0')}_t${t}.png`;
  await page.screenshot({ path: file });
  console.log(file, JSON.stringify(st));
  if (st.result !== 'playing') break;
}
await browser.close();
server.close();
