/*
 * プレイ動画の撮影（30fps・1台）。movie-search.mjs で選んだ1回（乱数の種と見せ方の癖）を、ページの中でそのまま再現し、
 * 1コマずつ撮って ffmpeg へ流し込む。晩の始まりから夜明けの1秒後まで。画面はそのまま（板・地図・吹き出しも）。
 * ページの時計を動画の時計にそろえる：sim は ?manual=1 で 1/30 秒ずつ、setTimeout と CSS のアニメーションも 1/30 秒ずつ進める
 * （そのままだと、1コマ撮るあいだに実時間が過ぎ、カットインや吹き出しが一瞬で終わる）。
 * 使い方: node scripts/movie.mjs 出力.mp4 [--seed 13] [--k 0.8] [--night 10] [--height 720] [--frames 0（0＝最後まで）]
 *   --wide 720x480：横長。スマホで見たままの大きさ（カメラはそのまま）で、メイン画面の上下を切って3:2にする。
 *     切る位置は主人公の体（頭〜足もと）が縦の真ん中に来る所で、跳んだらそのぶん一緒に上へ動かす（跳んでも見切れない）。
 *   --shots 9,25.5,36：動画の代わりに、その秒の全画面を PNG で撮る（端末の解像度3倍・1170×2532）。出力は「出力.mp4」の名前に _9s.png などを付ける。
 *     撮らないコマは描画を飛ばす（状態は毎コマ進める）ので速い
 *     --zoom 0.5 でカメラを引き、--center で主人公を横の真ん中に映すこともできる（ふだんは使わない）
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { extname, join } from 'node:path';
import { director } from './director.mjs';
import { setupNight, FPS } from './movie-setup.mjs';

const OUTFILE = process.argv[2] ?? 'movie.mp4';
const args = Object.fromEntries(process.argv.slice(3).join(' ').split('--').filter(Boolean).map((s) => s.trim().split(/\s+/)).map(([k, v]) => [k, v ?? '1']));
const SEED = Number(args.seed ?? 13);
const K = Number(args.k ?? 0.8);
const NIGHT = Number(args.night ?? 10);
const HEIGHT = Number(args.height ?? 720);
const LIMIT = Number(args.frames ?? 0);
const SHOTS = args.shots ? args.shots.split(',').map((t) => Math.round(Number(t) * 30)) : null;
const view = { width: 390, height: 844 };
const W = Math.round((HEIGHT * view.width) / view.height / 2) * 2;
const WIDE = args.wide ? args.wide.split('x').map(Number) : null;
const ZOOM = Number(args.zoom ?? 1); // 横長のときのカメラの引き（1＝スマホで見たまま。2026-10-04 アマネさん）
const CROP = WIDE ? { w: view.width, h: (view.width * WIDE[1]) / WIDE[0] } : null; // 画面の座標（CSS の画素）

const T = { '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.html': 'text/html' };
const root = new URL('../app/dist', import.meta.url).pathname;
const srv = createServer(async (q, s) => { let p = new URL(q.url, 'http://x').pathname.replace(/^\/akazukin/, ''); if (p === '/') p = '/index.html'; try { const b = await readFile(join(root, p)); s.writeHead(200, { 'content-type': T[extname(p)] || 'text/html' }); s.end(b); } catch { s.writeHead(404).end(); } });
await new Promise((r) => srv.listen(0, r));
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: view, deviceScaleFactor: SHOTS ? 3 : WIDE || HEIGHT > view.height ? 2 : 1, hasTouch: true });
p.on('pageerror', (e) => console.log('E', e.message));
await p.goto(`http://127.0.0.1:${srv.address().port}/akazukin/?auto=1&manual=1&seed=${SEED}${WIDE && ZOOM !== 1 ? `&camzoom=${ZOOM}` : ''}${args.center ? '&camcenter=1' : ''}`);
await p.waitForFunction(() => document.body.classList.contains('ready'));
// 絵が全部読み込まれるまで（主人公・狼・番犬）
await p.waitForFunction(() => { const v = window.akazukin.view; return v.rig.ready && v.wolves.ready && v.dogArt.ready; }, null, { timeout: 60000 });
await p.waitForTimeout(1000);
// 字体（しっぽり明朝）が読めているか。読めないまま撮ると、文字が代わりの字体になる（2026-10-06 アマネさん「フォントないと文字おかしい」）
const fontOk = await p.evaluate(async () => {
  await Promise.all(['400', '500', '700', '800'].map((w) => document.fonts.load(`${w} 20px "Shippori Mincho"`, '桜狼異聞大正赤ずきん0123456789')));
  await document.fonts.ready;
  return document.fonts.check('800 20px "Shippori Mincho"', '桜');
});
if (!fontOk) { console.log('字体（Shippori Mincho）が読めない。撮るのをやめる'); await b.close(); srv.close(); process.exit(1); }
await p.waitForTimeout(500); // 字体が読めたあと、画面の中の文字が描き直されるのを待つ

await p.evaluate(({ dir, setup, night }) => {
  window.__director = eval(`(${dir})`);
  window.__mem = {};
  const a = window.akazukin;
  eval(`(${setup})`)(a.sim, night);
  // 描画は1コマに1回だけ（Pixi の時計が毎フレーム描くと、撮るあいだに何度も描いて遅かった）
  a.view.app.ticker.stop();
  // 動画の時計で動く setTimeout（これから作られるものだけ）
  const q = [];
  let now = 0, id = 1;
  window.setTimeout = (fn, ms = 0, ...rest) => { q.push({ id, at: now + ms, fn: () => fn(...rest) }); return id++; };
  window.clearTimeout = (i) => { const k = q.findIndex((t) => t.id === i); if (k >= 0) q.splice(k, 1); };
  window.__advanceTimers = (ms) => {
    now += ms;
    for (;;) {
      q.sort((x, y) => x.at - y.at);
      if (!q.length || q[0].at > now) break;
      q.shift().fn();
    }
  };
  // CSS のアニメーション：止めて、動画の時計で進める
  window.__advanceAnims = (ms) => {
    for (const an of document.getAnimations()) {
      if (an.playState === 'finished') continue;
      if (!an.__v) { an.__v = true; an.pause(); an.currentTime = 0; }
      an.currentTime = (Number(an.currentTime) || 0) + ms;
    }
  };
}, { dir: director.toString(), setup: setupNight.toString(), night: NIGHT });

const ff = SHOTS ? null : spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
  '-vf', WIDE ? `scale=${WIDE[0]}:${WIDE[1]}:flags=lanczos` : `scale=${W}:${HEIGHT}:flags=lanczos`, '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', OUTFILE], { stdio: ['pipe', 'inherit', 'inherit'] });
const done = ff ? new Promise((r) => ff.on('close', r)) : Promise.resolve();

const t0 = Date.now();
let after = -1;
let cropY = null;
for (let i = 0; ; i++) {
  const shoot = !SHOTS || SHOTS.includes(i);
  const st = await p.evaluate(({ i, k, fps, shoot }) => {
    const a = window.akazukin, s = a.sim;
    if (i % 3 === 0 && s.phase === 'wave') window.__director(s, window.__mem, k);
    a.tick(1 / fps);
    window.__advanceTimers(1000 / fps);
    window.__advanceAnims(1000 / fps);
    if (shoot) a.view.app.render();
    // 主人公の足もと（画面の座標）と、跳んで持ち上がった分・メイン画面の高さ（横長の切り抜きに使う）
    const v = a.view, h = s.hero, { z, oy } = v.xf;
    const feet = v.wy(h.lane) * z + oy;
    const lift = h.z * v.zk() * 0.75 * z;
    return { phase: s.phase, kills: s.nightKills, combo: s.bestCombo, clock: s.clock, result: s.result, feet, lift, body: v.heroH(h.lane) * z, Hm: v.geo.Hm };
  }, { i, k: K, fps: FPS, shoot });
  if (SHOTS) {
    if (shoot) { const f = OUTFILE.replace(/\.mp4$/, '') + `_${(i / FPS).toFixed(1)}s.png`; await p.screenshot({ path: f }); console.log('shot', f); }
    if (i >= Math.max(...SHOTS)) break;
    continue;
  }
  let clip;
  if (CROP) {
    // 体の真ん中（足もとから背の半分上・跳んだ分も）を枠の縦の真ん中に
    const want = st.feet - st.lift - st.body * 0.52 - CROP.h / 2;
    cropY = cropY === null ? want : cropY + (want - cropY) * 0.3; // 少し遅れて追う（揺れの細かい上下は拾わない）
    clip = { x: 0, y: Math.max(0, Math.min(st.Hm - CROP.h, cropY)), width: CROP.w, height: CROP.h };
  }
  ff.stdin.write(await p.screenshot({ type: 'jpeg', quality: 92, clip }));
  if (i % 150 === 0) console.log(`frame ${i}  ${(i / FPS).toFixed(1)}s  ${((Date.now() - t0) / 1000 / (i + 1)).toFixed(2)}s/コマ`, JSON.stringify(st));
  if (st.phase !== 'wave' && after < 0) { after = i; console.log('夜明け', JSON.stringify(st)); }
  if (after >= 0 && i - after >= FPS) break; // 夜明けの1秒後まで
  if (st.result !== 'playing' || (LIMIT && i + 1 >= LIMIT) || i > FPS * 300) break;
}
ff?.stdin.end();
await done;
console.log('done', OUTFILE, `${((Date.now() - t0) / 1000).toFixed(0)}s`);
await b.close(); srv.close();
