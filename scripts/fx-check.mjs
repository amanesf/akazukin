// 点検用：演出の追加（2026-10-04）を、自動操作の晩の中で、それぞれ最初に出た瞬間に撮る。
// 一瞬の白い影・割れて花びらにほどける狼・矢の桜・主砲の紋・連撃の枝・噛まれた爪あと・裂け目の目・夜明けの光
// 使い方: node scripts/fx-check.mjs 出力先 [何晩目まで=2]
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { bot } from './bot.mjs';
const OUT = process.argv[2] ?? 'fx';
const NIGHTS = Number(process.argv[3] ?? 2);
const T = { '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg' };
const root = new URL('../app/dist', import.meta.url).pathname;
const srv = createServer(async (q, s) => { let p = new URL(q.url, 'http://x').pathname.replace(/^\/akazukin/, ''); if (p === '/') p = '/index.html'; try { const b = await readFile(join(root, p)); s.writeHead(200, { 'content-type': T[extname(p)] || 'text/html' }); s.end(b); } catch { s.writeHead(404).end(); } });
await new Promise((r) => srv.listen(0, r));
await mkdir(OUT, { recursive: true });
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
p.on('pageerror', (e) => console.log('E', e.message));
await p.goto(`http://127.0.0.1:${srv.address().port}/akazukin/?auto=1&manual=1&seed=1`);
await p.waitForFunction(() => document.body.classList.contains('ready'));
await p.waitForTimeout(1500);
const want = ['impact', 'split', 'flower', 'crest', 'branch', 'claws', 'eyes', 'dawn'];
await p.evaluate(`window.__bot = ${bot.toString()}; window.__mem = {}; window.__nights = ${NIGHTS};`);
for (let guard = 0; guard < 4000 && want.length; guard++) {
  const got = await p.evaluate((want) => {
    const a = window.akazukin, v = a.view, s = a.sim;
    for (let i = 0; i < 30; i++) {
      if (s.phase === 'shop') { if (s.wave >= window.__nights) return 'end'; window.__bot(s, window.__mem); }
      if (i % 6 === 0 && s.cheer < 0) window.__bot(s, window.__mem);
      if (s.combo >= 12 && s.combo < 29) s.combo = 29; // 連撃の枝を早く見る
      a.tick(1 / 60);
      const hit = {
        impact: v.impact > 0.02,
        split: v.splits.length > 0 && v.splits[0].t > 0.1 && v.splits[0].t < 0.2,
        flower: v.parts.ps.some((q) => q.kind === 'flower' && q.t > 0.12 && q.t < 0.2),
        crest: v.crests.some((c) => c.t > 0.4 && c.t < 0.5),
        branch: v.branch && v.branch.t > 0.8,
        claws: v.claws && v.claws.t > 0.07 && v.claws.t < 0.12,
        eyes: s.coming.some((c) => c.next < 0.25),
        dawn: s.cheer > 0.6,
      };
      for (const k of want) if (hit[k]) return k;
    }
    return '';
  }, want).catch((e) => (console.log(e.message), 'end'));
  if (!got) continue;
  if (got === 'end') break;
  await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await p.screenshot({ path: `${OUT}/${got}.png` });
  console.log('shot', got);
  want.splice(want.indexOf(got), 1);
}
if (want.length) console.log('not seen:', want.join(' '));
// 自動操作では出にくいもの・画面の外だったものを、決まった場面で出して拡大して撮る
const zoom = async (name, setup, n, clip) => {
  await p.evaluate(({ setup, n }) => { const a = window.akazukin; new Function('a', 'v', 's', setup)(a, a.view, a.sim); for (let i = 0; i < n; i++) a.tick(1 / 60); }, { setup, n });
  await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await p.screenshot({ path: `${OUT}/z-${name}.png`, clip });
  console.log('zoom', name);
};
await p.evaluate(() => { const s = window.akazukin.sim; if (s.phase === 'shop') s.nextWave(); });
const full = { x: 0, y: 0, width: 390, height: 640 };
for (let i = 0; i < 240; i++) await p.evaluate(() => window.akazukin.tick(1 / 60)); // 夜の始まりのカメラが落ち着くまで
await zoom('flower', "s.wolves = []; s.fx.push(s.mk({ kind: 'arrowhit', x: s.hero.x + 90, lane: s.hero.lane, z: 0, dir: 1, n: 0 }));", 8, full);
await zoom('claws', "s.hero.iframes = 0; s.hero.armor = 0; s.hurtHero(1);", 5, full);
await zoom('claws2', '', 12, full);
await zoom('crest', "s.fx.push(s.mk({ kind: 'blast', x: s.hero.x + 90, lane: s.hero.lane, r: 60, big: true }));", 70, full);
await zoom('eyes', "s.wolves = []; for (let i = 0; i < 60 * 30; i++) { s.hero.x = 800; s.hero.facing = 1; s.hero.order = null; a.tick(1 / 60); if (s.coming.some((c) => c.next < 0.3)) break; }", 1, full);
for (const [i, n] of [[0, 4], [1, 8], [2, 8]]) {
  await zoom(`split${i}`, i === 0 ? "s.wolves = []; const w = s.unit(s.hero.x + 80, 1, 40); s.fx.push(s.mk({ kind: 'poof', x: s.hero.x + 80, lane: s.hero.lane, z: 0, r: 40, n: 1, dir: 1, wolf: 'wolf' }));" : '', n, full);
}
await b.close(); srv.close();
