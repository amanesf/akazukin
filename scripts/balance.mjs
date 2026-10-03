/*
 * 難しさの計測。描画なしで sim だけを高速に回し、素朴な自動操作が何日目まで行けるかを数える。
 * 99晩を画面つきで撮るのは遅すぎる（ソフトウェア描画）ので、こちらで測る。
 *
 * 使い方: node scripts/balance.mjs [--seeds 1,2,3] [--bot near|far|mixed] [--max 99] [--dogs 0]
 * app/node_modules の esbuild で app/src/sim.ts をその場で束ねる（先に app で npm ci）。
 */
import { build } from '../app/node_modules/esbuild/lib/main.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).join(' ').split('--').filter(Boolean)
    .map((s) => s.trim().split(/\s+/)).map(([k, v]) => [k, v ?? '1']),
);
const SEEDS = (args.seeds ?? '1,2,3').split(',').map(Number);
const BOT = args.bot ?? 'mixed';
const MAX = Number(args.max ?? 99);
const DOGS = args.dogs !== '0'; // --dogs 0 で番犬を出さない

const dir = await mkdtemp(join(tmpdir(), 'akazukin-'));
const out = join(dir, 'sim.mjs');
await build({ entryPoints: [new URL('../app/src/sim.ts', import.meta.url).pathname], bundle: true, format: 'esm', outfile: out, logLevel: 'error' });
const { Sim } = await import(out);
await rm(dir, { recursive: true });

// 素朴な自動操作：昼は近接→体力→遠隔の順に買えるだけ、夜は構えを切り替えつつ犬を出し、桜嵐は溜まったら
function bot(s) {
  if (s.phase === 'shop') {
    for (let i = 0; i < 6; i++) for (const t of ['near', 'body', 'far']) s.buy(t);
    s.nextWave();
    return;
  }
  if (BOT === 'near') s.setStance('near');
  else if (BOT === 'far') s.setStance('far');
  else s.setStance(s.hero.hp < s.maxHp * 0.3 ? 'far' : 'near');
  s.ouran();
  if (DOGS) for (const k of ['tosa', 'akita', 'shiba']) if (s.sendDog(k)) break;
}

for (const seed of SEEDS) {
  const s = new Sim(seed);
  // 誰がどれだけ削ったか（番犬＝quiet、それ以外は主人公）
  const dealt = { hero: 0, dogs: 0 };
  const hit = s.hit.bind(s);
  s.hit = (w, dmg, o) => { dealt[o.quiet ? 'dogs' : 'hero'] += dmg; hit(w, dmg, o); };
  let t = 0;
  const minHouse = [];
  let low = 600;
  let lastWave = 0;
  while (s.result === 'playing' && s.wave < MAX && t < 99 * 400) {
    bot(s);
    for (let i = 0; i < 6; i++) s.step(1 / 60);
    t += 0.1;
    if (s.phase === 'wave') low = Math.min(low, s.houseHp);
    if (s.wave !== lastWave) {
      minHouse.push(Math.round(low));
      low = 600;
      lastWave = s.wave;
    }
  }
  const lv = Object.entries(s.levels).map(([k, v]) => `${k}${v}`).join(' ');
  console.log(`seed ${seed}: ${s.result === 'lost' ? `${s.wave + 1}日目の夜に負け` : s.result === 'won' ? '狼絶滅' : `${s.wave}晩まで`} kills ${s.kills} best ${s.bestCombo} ${lv}`);
  console.log(`  晩ごとの家の最低耐久: ${minHouse.join(' ')}`);
  console.log(`  番犬 ${s.dogs.length}匹（最後の晩）／削った量 主人公 ${Math.round(dealt.hero)}・番犬 ${Math.round(dealt.dogs)}`);
}
