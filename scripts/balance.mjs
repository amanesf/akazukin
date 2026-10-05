/*
 * 難しさの計測。描画なしで sim だけを高速に回し、素朴な自動操作が何日目まで行けるかを数える。
 * 99晩を画面つきで撮るのは遅すぎる（ソフトウェア描画）ので、こちらで測る。
 *
 * 使い方: node scripts/balance.mjs [--seeds 1,2,3] [--max 99] [--dogs 0]
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
const SEEDS = (args.seeds ?? '1,2,3').split(',').map(Number);
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
  s.hit = (w, dmg, o) => { dealt[o.quiet ? 'dogs' : 'hero'] += dmg; hit(w, dmg, o); };
  let t = 0;
  const minHouse = [];
  let low = 600;
  let lastWave = 0;
  let losses = 0;
  let saved = s.save();
  // 家が落ちたら、その晩の前の昼に戻る（試作と同じ）。同じ晩で5回落ちたら、そこまで
  let tries = 0;
  for (;;) {
    if (s.result === 'lost') {
      losses++;
      if (++tries >= 5) break;
      const back = Sim.load(saved, seed + losses);
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
      if (s.wave % 10 === 0) {
        const st = s.stats;
        console.log(`  ${s.wave}晩：倒れた ${st.downs}回・主人公が受けた ${Math.round(st.heroDmg)}・家が噛まれた ${Math.round(st.houseBite)}・呼ばれた子狼 ${st.summoned}・銭 ${Math.floor(s.coins)}・段 ${Object.values(s.levels).join('')}`);
        s.stats = { downs: 0, houseBite: 0, houseShock: 0, heroDmg: 0, summoned: 0 };
      }
      minHouse.push(Math.round(low));
      low = 600;
      lastWave = s.wave;
    }
  }
  const lv = Object.entries(s.levels).map(([k, v]) => `${k}${v}`).join(' ');
  console.log(`seed ${seed}: ${s.result === 'lost' ? `${s.wave + 1}日目の夜で5回続けて負け` : s.result === 'won' ? '狼絶滅' : `${s.wave}晩まで`} 家が落ちた ${losses}回 kills ${s.kills} best ${s.bestCombo} ${lv}`);
  console.log(`  晩ごとの家の最低耐久: ${minHouse.join(' ')}`);
  console.log(`  番犬 ${s.dogs.length}匹（最後の晩）／削った量 主人公 ${Math.round(dealt.hero)}・番犬 ${Math.round(dealt.dogs)}`);
}
