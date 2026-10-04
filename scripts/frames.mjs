/*
 * 動きのコマ送り点検。時計を止めた試作（?manual=1）を1コマずつ進めて撮り、1枚の一覧（コンタクトシート）にする。
 * 動き・演出は静止画1枚では分からない（2026-10-04・アマネさん「アニメーションや動き、エフェクトにこだわって」）。
 *
 * 使い方: (cd app && npm run build) && node scripts/frames.mjs --scene dash --count 16 --step 2 --out 出力先
 *   --scene  : play（自動操作で遊ぶ・--warm 秒まで早送り）／dash／combo／launch／charge／pounce／ouran／day
 *   --step   : 1コマあたり何フレーム（1/60秒）進めるか
 *   --scale  : 撮る解像度（既定 1）
 * 一覧は 出力先/sheet.png。python3 と pillow が要る。
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { execFileSync } from 'node:child_process';
import { bot } from './bot.mjs';

const args = Object.fromEntries(
  process.argv.slice(2).join(' ').split('--').filter(Boolean)
    .map((s) => s.trim().split(/\s+/)).map(([k, v]) => [k, v ?? '1']),
);
const OUT = args.out ?? 'frames';
const SCENE = args.scene ?? 'play';
const COUNT = Number(args.count ?? 16);
const STEP = Number(args.step ?? 2);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.json': 'application/json' };
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
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: Number(args.scale ?? 1), hasTouch: true });
page.on('pageerror', (e) => console.log('  ERROR:', e.message));
await page.goto(`http://127.0.0.1:${server.address().port}/akazukin/?auto=1&manual=1&seed=${args.seed ?? 1}`);
await page.waitForFunction(() => document.body.classList.contains('ready'), null, { timeout: 60000 });
await page.waitForTimeout(1500); // 絵の読み込み

const BOT = bot.toString();
// 場面づくり：主人公と狼を置き、決まったコマで指の操作を入れる
const SCENES = {
  play: { setup: '', acts: {} },
  dash: { setup: `s.hero.x=300; s.hero.lane=0.5; s.debugSpawn('wolf',420,0.45); s.debugSpawn('pup',480,0.55); s.debugSpawn('wolf',540,0.5);`, acts: { 2: `s.flick('right')` } },
  combo: { setup: `s.hero.x=300; s.hero.lane=0.5; s.debugSpawn('wolf',360,0.5);`, acts: { 1: `s.tap(360,0.5)`, 8: `s.tap(360,0.5)`, 15: `s.tap(360,0.5)`, 22: `s.tap(360,0.5)`, 30: `s.tap(360,0.5)` } },
  jump2: { setup: `s.hero.x=300; s.hero.lane=0.5; s.debugSpawn('armored',1400,0.9).stun=999; s.hero.bowT=999;`, acts: { 1: `s.flick('up')`, 8: `s.flick('up')`, 16: `s.flick('up')` } }, // 2段ジャンプまで（3回目は跳ばない）
  launch: { setup: `s.hero.x=300; s.hero.lane=0.5; s.debugSpawn('wolf',360,0.5).age=9;`, acts: { 1: `s.flick('up')`, 12: `s.tap(360,0.5)`, 20: `s.flick('down')` } },
  charge: { setup: `s.hero.x=300; s.hero.lane=0.5; for (let i=0;i<4;i++) s.debugSpawn('wolf',350+i*25,0.3+i*0.12);`, acts: { 1: `s.holdStart()`, 42: `s.holdEnd()` } },
  pounce: { setup: `s.hero.x=300; s.hero.lane=0.5; const w=s.debugSpawn('pup',400,0.5); w.skillCd=0;`, acts: {} },
  ouran: { setup: `s.hero.x=300; s.hero.lane=0.5; for (let i=0;i<6;i++) s.debugSpawn(i%2?'wolf':'pup',340+i*40,0.2+i*0.12); s.gauge=100;`, acts: { 1: `s.ouran()` } },
  idle: { setup: `s.hero.x=300; s.hero.lane=0.5; s.debugSpawn('armored',990,0.5).stun=999; s.hero.bowT=999;`, acts: {} },
  run: { setup: `s.hero.x=150; s.hero.lane=0.5; s.debugSpawn('armored',990,0.5).stun=999; s.hero.bowT=999;`, acts: { 1: `s.runTo(700,0.5)` } },
  day: { setup: `s.wave=1; s.phase='shop'; s.place('akita',380,0.5); s.place('shiba',300,0.2);`, acts: {} },
};
const sc = SCENES[SCENE];
// 夜を始め、最初の狼が出る前に場面を置く
await page.evaluate(`(() => { const a = window.akazukin; a.tick(1/60, 160); const s = a.sim; ${SCENE === 'play' ? '' : 's.wolves=[]; s.spawners=[];'} ${sc.setup} a.tick(1/60, 1); })()`);
if (SCENE === 'play' && args.warm) {
  await page.evaluate(`(() => { const a = window.akazukin; const mem = {}; while (a.sim.clock < ${Number(args.warm)} && a.sim.result === 'playing') { (${BOT})(a.sim, mem); a.tick(1/60, 6); } window.__mem = mem; })()`);
}
const files = [];
for (let i = 0; i < COUNT; i++) {
  const act = sc.acts[i];
  await page.evaluate(`(() => { const a = window.akazukin; const s = a.sim; ${act ?? ''}; ${SCENE === 'play' ? `(${BOT})(s, window.__mem ||= {});` : ''} a.tick(1/60, ${STEP}); })()`);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const f = `${OUT}/f${String(i).padStart(3, '0')}.png`;
  await page.screenshot({ path: f, clip: { x: 0, y: 0, width: 390, height: Number(args.h ?? 560) } });
  files.push(f);
}
await browser.close();
server.close();
// 一覧（4列）
execFileSync('python3', ['-c', `
import sys
from PIL import Image, ImageDraw
fs = sys.argv[2:]
ims = [Image.open(f) for f in fs]
w, h = ims[0].size
cols = int(sys.argv[1])
s = 0.5
tw, th = int(w * s), int(h * s)
rows = (len(ims) + cols - 1) // cols
sheet = Image.new('RGB', (tw * cols, th * rows), 'black')
d = ImageDraw.Draw(sheet)
for i, im in enumerate(ims):
    x, y = (i % cols) * tw, (i // cols) * th
    sheet.paste(im.convert('RGB').resize((tw, th)), (x, y))
    d.text((x + 4, y + 4), str(i), fill='yellow')
sheet.save('${OUT}/sheet.png')
`, String(args.cols ?? 4), ...files]);
console.log(`${OUT}/sheet.png`);
