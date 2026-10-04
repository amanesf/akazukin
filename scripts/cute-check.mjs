// 点検用：かわいさの追加（2026-10-04）を撮る。
//   1) 新しい絵を1枚ずつ、決まった姿で拡大して撮る（顔4つ・しぐさ4つ（小道具の進み 0.5）・晩の終わり4つ・耳を伏せた待機）
//   2) 自動操作で1晩目を終わらせ、決めポーズと番犬をなでる所を撮る
// 使い方: node scripts/cute-check.mjs 出力先
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { bot } from './bot.mjs';
const OUT = process.argv[2] ?? 'cute';
const T = { '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg' };
const root = new URL('../app/dist', import.meta.url).pathname;
const srv = createServer(async (q, s) => { let p = new URL(q.url, 'http://x').pathname.replace(/^\/akazukin/, ''); if (p === '/') p = '/index.html'; try { const b = await readFile(join(root, p)); s.writeHead(200, { 'content-type': T[extname(p)] || 'text/html' }); s.end(b); } catch { s.writeHead(404).end(); } });
await new Promise((r) => srv.listen(0, r));
await mkdir(OUT, { recursive: true });
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const open = async (q) => {
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
  p.on('pageerror', (e) => console.log('E', e.message));
  await p.goto(`http://127.0.0.1:${srv.address().port}/akazukin/?auto=1&${q}`);
  await p.waitForFunction(() => document.body.classList.contains('ready'));
  await p.waitForTimeout(1500);
  return p;
};

// 1) 1枚ずつ
const p = await open('manual=1');
await p.evaluate(() => { const a = window.akazukin; a.tick(1 / 60, 160); a.sim.wolves = []; a.sim.spawners = []; a.sim.hero.x = 300; a.sim.hero.bowT = 999; a.tick(1 / 60, 30); });
const SHOTS = [
  ['calm', 0, [0, 0]], ['smug', 0, [0, 0]], ['teary', 0, [0, 0]], ['yawn', 0, [0, 0]], ['surprised', 0, [0, 0]], ['calm', 0, [-0.55, 0.55]],
  ['stretch', 0.3, [0, 0]], ['petal', 0.5, [0, 0]], ['toss', 0.5, [0, 0]], ['toss', 0.2, [0, 0]], ['hood', 0.5, [0, 0]],
  ['victory', 0, [0, 0]], ['cheer', 0, [0, 0]], ['shoulder', 0, [0, 0]], ['curtsy', 0, [0, 0]], ['pet', 0, [0, 0]],
];
for (const [i, [frame, prop, ears]] of SHOTS.entries()) {
  const box = await p.evaluate(({ frame, prop, ears }) => {
    const a = window.akazukin;
    const rig = a.view.rig;
    rig.swing = () => ({ tail: 0, skirt: 0, ears });
    rig.pose0 ??= rig.pose.bind(rig);
    rig.pose = (...args) => { const q = rig.pose0(...args); if (q) { q.frame = frame; q.prop = prop; q.lean = 0; q.sx = q.sy = 1; q.lift = 0; q.gun = 0; } return q; };
    a.tick(0, 1);
    const r = rig.root.getBounds();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  }, { frame, prop, ears });
  await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const pad = 16;
  const x = Math.max(0, box.x - pad), y = Math.max(0, box.y - pad);
  await p.screenshot({ path: `${OUT}/${String(i).padStart(2, '0')}-${frame}${ears[0] ? '-droop' : ''}.png`, clip: { x, y, width: Math.min(390 - x, box.width + pad * 2), height: Math.min(844 - y, box.height + pad * 2) } });
}
await p.close();

// 2) 1晩目の終わり（コマ送りで進め、決めポーズの 0.8 秒と、なでる 2.0 秒で止めて撮る）
const q = await open('manual=1&seed=1');
for (const at of [0.8, 2.0]) {
  const ok = await q.evaluate(`(() => {
    const a = window.akazukin, bot = ${bot.toString()}, mem = (window.__mem ||= {});
    for (let i = 0; i < 60 * 400; i++) {
      if (i % 6 === 0 && a.sim.cheer < 0) bot(a.sim, mem);
      a.tick(1 / 60);
      if (a.sim.cheer >= ${at}) return true;
      if (a.sim.phase === 'shop') return false;
    }
    return false;
  })()`);
  await q.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  if (ok) await q.screenshot({ path: `${OUT}/night-${at}.png` });
  else console.log('missed', at);
}
console.log(OUT);
await b.close(); srv.close();
