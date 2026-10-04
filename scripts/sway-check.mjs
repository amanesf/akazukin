// 点検用：揺れもの（しっぽ・裾・耳）を決まった値で止めて、主人公を拡大して撮る。
// 使い方: node scripts/sway-check.mjs 出力先 [frame=idle|strike|up]
// 値の組ごとに1枚（0＝揺れなし・左右の最大）。網目の歪み・継ぎ目・脚やタイツの引っぱられを3倍で見る
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
const OUT = process.argv[2] ?? 'sway';
const FRAME = process.argv[3] ?? 'idle';
const T = { '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.json': 'application/json', '.svg': 'image/svg+xml' };
const root = new URL('../app/dist', import.meta.url).pathname;
const srv = createServer(async (q, s) => { let p = new URL(q.url, 'http://x').pathname.replace(/^\/akazukin/, ''); if (p === '/') p = '/index.html'; try { const b = await readFile(join(root, p)); s.writeHead(200, { 'content-type': T[extname(p)] || 'text/html' }); s.end(b); } catch { s.writeHead(404).end(); } });
await new Promise((r) => srv.listen(0, r));
await mkdir(OUT, { recursive: true });
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
p.on('pageerror', (e) => console.log('E', e.message));
await p.goto(`http://127.0.0.1:${srv.address().port}/akazukin/?auto=1&manual=1`);
await p.waitForFunction(() => document.body.classList.contains('ready'));
await p.waitForTimeout(1500);
await p.evaluate(() => { const a = window.akazukin; a.tick(1 / 60, 160); a.sim.wolves = []; a.sim.spawners = []; a.sim.hero.x = 300; a.sim.hero.bowT = 999; a.tick(1 / 60, 30); });
const SETS = [[0, 0, 0, 0], [0.8, 22, 0.45, -0.45], [-0.6, -22, -0.45, 0.45], [0.4, 10, 0.2, 0.2]];
for (const [i, [tail, skirt, e0, e1]] of SETS.entries()) {
  const box = await p.evaluate(({ tail, skirt, e0, e1, frame }) => {
    const a = window.akazukin;
    const rig = a.view.rig;
    rig.swing = () => ({ tail, skirt, ears: [e0, e1] });
    const pose0 = rig.pose.bind(rig);
    rig.pose = (...args) => { const q = pose0(...args); if (q) { q.frame = frame; q.lean = 0; q.sx = q.sy = 1; q.lift = 0; q.legSwing = 0; } return q; };
    a.tick(0, 1);
    const r = rig.root.getBounds();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  }, { tail, skirt, e0, e1, frame: FRAME });
  await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const pad = 20;
  await p.screenshot({ path: `${OUT}/${FRAME}-${i}.png`, clip: { x: Math.max(0, box.x - pad), y: Math.max(0, box.y - pad), width: Math.min(390, box.width + pad * 2), height: Math.min(844, box.height + pad * 2) } });
}
console.log(OUT);
await b.close(); srv.close();
