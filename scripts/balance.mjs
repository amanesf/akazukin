/*
 * 難しさの計測。描画なしで sim だけを高速に回し、素朴な自動操作が何日目まで行けるかを数える。
 * 99晩を画面つきで撮るのは遅すぎる（ソフトウェア描画）ので、こちらで測る。
 *
 * 使い方: node scripts/balance.mjs [--seeds 1,2,3,4,5,6] [--max 99] [--dogs 0] [--smart 1] [--tries 5]
 * 最後に、何晩まで行けたかの平均・最小・最大と、遠吠えに呼ばれた子狼の合計を出す（種ごとのばらつきが大きいので、平均と最小で見る）
 * app/node_modules の esbuild で app/src/sim.ts をその場で束ねる（先に app で npm ci）。
 */
import { build } from '../app/node_modules/esbuild/lib/main.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { bot } from './bot.mjs';
import { join } from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).join(' ').split('--').filter(Boolean)
    .map((s) => s.trim().split(/\s+/)).map(([k, v]) => [k, v ?? '1']),
);
const SEEDS = (args.seeds ?? '1,2,3,4,5,6').split(',').map(Number);
const TRIES = Number(args.tries ?? 5);
const reached = [];
let summonedAll = 0;
const MAX = Number(args.max ?? 99);
const DOGS = args.dogs !== '0'; // --dogs 0 で番犬を出さない

const dir = await mkdtemp(join(tmpdir(), 'akazukin-'));
const out = join(dir, 'sim.mjs');
await build({ entryPoints: [new URL('../app/src/sim.ts', import.meta.url).pathname], bundle: true, format: 'esm', outfile: out, logLevel: 'error' });
const { Sim } = await import(out);
await rm(dir, { recursive: true });

// 素朴な自動操作（scripts/bot.mjs。撮影と同じもの）
const mem = {};
for (const seed of SEEDS) {
  const s = new Sim(seed);
  // 誰がどれだけ削ったか（番犬＝quiet、それ以外は主人公）
  const dealt = { hero: 0, dogs: 0 };
  const hit = s.hit.bind(s);
  // --smart 1：色の狼にはいつも弱い武器で当てたことにする（弱い武器を使い分ける人の上限の目安）
  const WEAK = { red: 'senbon', purple: 'midare', black: 'nagare', orange: 'midare', green: 'sp' };
  s.hit = (w, dmg, o) => {
    if (args.smart && !o.quiet && w.color && WEAK[w.color] && o.src && o.src !== 'sp') o = { ...o, src: WEAK[w.color] };
    dealt[o.quiet ? 'dogs' : 'hero'] += dmg;
    // 必殺技も合う物を選んだことにする（当てる一瞬だけ）
    const prev = s.hero.special;
    if (args.smart && o.src === 'sp' && w.color && WEAK[w.color] && WEAK[w.color] !== 'sp') s.hero.special = WEAK[w.color];
    hit(w, dmg, o);
    s.hero.special = prev;
  };
  let t = 0;
  const minHouse = [];
  let low = 600;
  let lastWave = 0;
  let losses = 0;
  let saved = s.save();
  // 家が落ちたら、その晩の前の昼に戻る（試作と同じ）。同じ晩で5回落ちたら、そこまで
  let tries = 0;
  let earned = 0; // 越えた晩に得た銭の累計
  for (;;) {
    if (s.result === 'lost') {
      losses++;
      if (++tries >= TRIES) break;
      const back = Sim.load(saved, seed + losses);
      back.coins += Math.floor(s.nightEarned); // 負けてもその夜に拾った銭は残る（試作と同じ）
      Object.assign(s, back);
      continue;
    }
    if (s.result !== 'playing' || s.wave >= MAX || t >= 99 * 600) break;
    if (s.phase === 'shop' && s.wave !== saved.wave) {
      saved = s.save();
      tries = 0;
    }
    bot(s, mem, DOGS);
    for (let i = 0; i < 6; i++) s.step(1 / 60);
    t += 0.1;
    if (s.phase === 'wave') low = Math.min(low, s.houseHp);
    if (s.wave !== lastWave) {
      earned += s.nightEarned;
      if (s.wave % 10 === 0) {
        const st = s.stats;
        console.log(`  ${s.wave}晩：倒れた ${st.downs}回・主人公が受けた ${Math.round(st.heroDmg)}・家が噛まれた ${Math.round(st.houseBite)}・呼ばれた子狼 ${st.summoned}・銭 ${Math.floor(s.coins)}（累計 ${Math.round(earned)}）・上段 ${Object.values(s.basic).join(',')}・下段 ${Object.values(s.special).join('')}`);
        summonedAll += st.summoned;
        s.stats = { downs: 0, houseBite: 0, houseShock: 0, heroDmg: 0, summoned: 0 };
      }
      minHouse.push(Math.round(low));
      low = 600;
      lastWave = s.wave;
    }
  }
  summonedAll += s.stats.summoned;
  reached.push(s.result === 'won' ? 99 : s.wave);
  const lv = Object.keys(s.basic).map((k) => `${k}${s.basic[k]}/${s.special[k]}`).join(' ');
  console.log(`seed ${seed}: ${s.result === 'lost' ? `${s.wave + 1}日目の夜で5回続けて負け` : s.result === 'won' ? '狼絶滅' : `${s.wave}晩まで`} 家が落ちた ${losses}回 kills ${s.kills} best ${s.bestCombo} ${lv}`);
  console.log(`  晩ごとの家の最低耐久: ${minHouse.join(' ')}`);
  console.log(`  番犬 ${s.dogs.length}匹（最後の晩）／削った量 主人公 ${Math.round(dealt.hero)}・番犬 ${Math.round(dealt.dogs)}`);
}
const avg = reached.reduce((a, b) => a + b, 0) / reached.length;
console.log(`まとめ：越えた晩 平均 ${avg.toFixed(1)}・最小 ${Math.min(...reached)}・最大 ${Math.max(...reached)}（${reached.join(' ')}）／呼ばれた子狼 合計 ${summonedAll}`);
