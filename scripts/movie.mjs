/*
 * プレイ動画の撮影（30fps・1台）。movie-search.mjs で選んだ1回（乱数の種と見せ方の癖）を、ページの中でそのまま再現し、
 * 1コマずつ撮って ffmpeg へ流し込む。晩の始まりから夜明けの1秒後まで。画面はそのまま（板・地図・吹き出しも）。
 * ページの時計を動画の時計にそろえる：sim は ?manual=1 で 1/30 秒ずつ、setTimeout と CSS のアニメーションも 1/30 秒ずつ進める
 * （そのままだと、1コマ撮るあいだに実時間が過ぎ、カットインや吹き出しが一瞬で終わる）。
 * 使い方: node scripts/movie.mjs 出力.mp4 [--seed 13] [--k 0.8] [--night 10] [--height 720] [--frames 0（0＝最後まで）]
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
const view = { width: 390, height: 844 };
const W = Math.round((HEIGHT * view.width) / view.height / 2) * 2;

const T = { '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.html': 'text/html' };
const root = new URL('../app/dist', import.meta.url).pathname;
const srv = createServer(async (q, s) => { let p = new URL(q.url, 'http://x').pathname.replace(/^\/akazukin/, ''); if (p === '/') p = '/index.html'; try { const b = await readFile(join(root, p)); s.writeHead(200, { 'content-type': T[extname(p)] || 'text/html' }); s.end(b); } catch { s.writeHead(404).end(); } });
await new Promise((r) => srv.listen(0, r));
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: view, deviceScaleFactor: HEIGHT > view.height ? 2 : 1, hasTouch: true });
p.on('pageerror', (e) => console.log('E', e.message));
await p.goto(`http://127.0.0.1:${srv.address().port}/akazukin/?auto=1&manual=1&seed=${SEED}`);
await p.waitForFunction(() => document.body.classList.contains('ready'));
// 絵が全部読み込まれるまで（主人公・狼・番犬）
await p.waitForFunction(() => { const v = window.akazukin.view; return v.rig.ready && v.wolves.ready && v.dogArt.ready; }, null, { timeout: 60000 });
await p.waitForTimeout(1000);

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

const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
  '-vf', `scale=${W}:${HEIGHT}:flags=lanczos`, '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', OUTFILE], { stdio: ['pipe', 'inherit', 'inherit'] });
const done = new Promise((r) => ff.on('close', r));

const t0 = Date.now();
let after = -1;
for (let i = 0; ; i++) {
  const st = await p.evaluate(({ i, k, fps }) => {
    const a = window.akazukin, s = a.sim;
    if (i % 3 === 0 && s.phase === 'wave') window.__director(s, window.__mem, k);
    a.tick(1 / fps);
    window.__advanceTimers(1000 / fps);
    window.__advanceAnims(1000 / fps);
    a.view.app.render();
    return { phase: s.phase, kills: s.nightKills, combo: s.bestCombo, clock: s.clock, result: s.result };
  }, { i, k: K, fps: FPS });
  ff.stdin.write(await p.screenshot({ type: 'jpeg', quality: 92 }));
  if (i % 150 === 0) console.log(`frame ${i}  ${(i / FPS).toFixed(1)}s  ${((Date.now() - t0) / 1000 / (i + 1)).toFixed(2)}s/コマ`, JSON.stringify(st));
  if (st.phase !== 'wave' && after < 0) { after = i; console.log('夜明け', JSON.stringify(st)); }
  if (after >= 0 && i - after >= FPS) break; // 夜明けの1秒後まで
  if (st.result !== 'playing' || (LIMIT && i + 1 >= LIMIT) || i > FPS * 300) break;
}
ff.stdin.end();
await done;
console.log('done', OUTFILE, `${((Date.now() - t0) / 1000).toFixed(0)}s`);
await b.close(); srv.close();
