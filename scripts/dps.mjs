/*
 * 武器ごとの手数と威力（DPS）を測る。強化なし・狼はひるみ続けて動かない的（体力は大きく）。
 * 使い方: node scripts/dps.mjs [晩=1] [--nights 44,45,46,47,48]（--nights はその晩の狼の並びも出す）
 * app/node_modules の esbuild で app/src/sim.ts をその場で束ねる（先に app で npm ci）。
 */
import { build } from '../app/node_modules/esbuild/lib/main.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const dir = await mkdtemp(join(tmpdir(), 'akazukin-'));
const out = join(dir, 'sim.mjs');
await build({ entryPoints: [new URL('../app/src/sim.ts', import.meta.url).pathname, new URL('../app/src/nights.ts', import.meta.url).pathname], bundle: true, format: 'esm', outdir: dir, logLevel: 'error', splitting: true });
const { Sim } = await import(join(dir, 'sim.js'));
const N = await import(join(dir, 'nights.js'));
await rm(dir, { recursive: true });

const SEC = 30;
// 的を置いて、play(s, t) を 1/60 秒ごとに呼び、SEC 秒で与えた量を数える
function measure(name, play, opts = {}) {
  const s = new Sim(1);
  s.nextWave = () => {};
  s.phase = 'wave';
  s.spawners = [];
  s.wolves = [];
  s.dogs = [];
  s.hero.x = 300;
  s.hero.lane = 0.5;
  const xs = opts.xs ?? [380];
  const lanes = opts.lanes ?? xs.map(() => 0.5);
  const ws = xs.map((x, i) => { const w = s.debugSpawn('wolf', x, lanes[i]); w.hp = w.maxHp = 1e9; return w; });
  let dealt = 0;
  const hit = s.hit.bind(s);
  s.hit = (w, d, o) => { dealt += d; hit(w, d, o); };
  const mem = {};
  for (let t = 0; t < SEC; t += 1 / 60) {
    for (const [i, w] of ws.entries()) { w.stun = 99; w.x = xs[i]; w.vx = 0; w.z = 0; w.vz = 0; w.lane = lanes[i]; w.cooldown = 99; }
    s.hero.hp = s.maxHp;
    play(s, t, mem);
    s.step(1 / 60);
  }
  console.log(`${name.padEnd(28)} ${(dealt / SEC).toFixed(1).padStart(7)} /秒（${xs.length}匹の合計）`);
}
const every = (dt) => (s, t, m) => { if (t >= (m.next ?? 0)) { m.next = t + dt; return true; } return false; };
const tapper = (dt, weapon) => { const go = every(dt); return (s, t, m) => { s.weapon = weapon; if (go(s, t, m)) s.tap(380, 0.5); }; };
console.log(`強化なし・${SEC}秒の平均（的は主人公の前 80）`);
for (const r of [4, 6, 8]) measure(`ナイフ タップ ${r}回/秒`, tapper(1 / r, 'knife'));
measure('ナイフ 4回/秒・3匹かたまる', tapper(1 / 4, 'knife'), { xs: [380, 400, 420] });
for (const r of [2, 4]) measure(`弓 タップ ${r}回/秒`, tapper(1 / r, 'bow'));
measure('弓 4回/秒・3匹縦に並ぶ', tapper(1 / 4, 'bow'), { xs: [380, 420, 460] });
// 主砲：長押し c 秒 → 離す をくり返す（熱を見ない。オーバーヒートするとその間は撃てない）
const cannon = (c) => (s, t, m) => {
  m.ph ??= 'idle';
  if (m.ph === 'idle' && !s.hero.move && s.hero.overheat <= 0) { s.holdStart(); m.ph = 'hold'; m.t0 = t; }
  else if (m.ph === 'hold' && t - m.t0 >= c) { s.holdEnd(); m.ph = 'idle'; }
};
measure('主砲 満タン連射', cannon(1.15));
measure('主砲 満タン連射・3匹', cannon(1.15), { xs: [380, 420, 460] });
measure('主砲 半チャージ連射', cannon(0.45));
measure('主砲 半チャージ連射・3匹', cannon(0.45), { xs: [380, 420, 460] });

// 群れ：n 匹が主人公の前に、横 380〜（1匹あたり15ずつ）・奥行き 0.3〜0.7 にばらけて並ぶ
for (const n of [10, 20]) {
  const xs = Array.from({ length: n }, (_, i) => 380 + i * 15);
  const lanes = Array.from({ length: n }, (_, i) => 0.3 + ((i * 7) % 5) * 0.1);
  console.log(`\n── 群れ ${n}匹（横 ${xs[0]}〜${xs[n - 1]}・奥行き 0.3〜0.7）`);
  measure(`ナイフ 4回/秒・${n}匹`, tapper(1 / 4, 'knife'), { xs, lanes });
  measure(`弓 4回/秒・${n}匹`, tapper(1 / 4, 'bow'), { xs, lanes });
  measure(`主砲 満タン連射・${n}匹`, cannon(1.15), { xs, lanes });
  measure(`主砲 半チャージ連射・${n}匹`, cannon(0.45), { xs, lanes });
}

const nights = process.argv.join(' ').match(/--nights\s+([\d,]+)/);
if (nights) {
  for (const n of nights[1].split(',').map(Number)) {
    const ls = N.night(n);
    const hp = ls.reduce((a, l) => a + l.count * 1, 0);
    console.log(`\n${n}晩 ${N.mood(n) ?? ''} 予算 ${N.budget(n)} 体力倍率 ${N.hpScale(n).toFixed(2)} 頭数 ${hp}`);
    for (const l of ls) console.log(`  ${l.kind}${l.color ? `(${l.color})` : ''} ×${l.count} 間${l.interval.toFixed(2)}秒 ${l.delay.toFixed(1)}秒から${l.surge ? ' 山場' : ''}`);
  }
}
