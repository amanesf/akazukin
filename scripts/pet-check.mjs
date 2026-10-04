/*
 * 点検：晩の終わりに番犬をなでられるか（描画なし。sim だけを回して数える）。
 * 晩の最後の1匹を倒した瞬間に、主人公をばらばらの位置・向きに置き直し（遊ぶ人はどこで晩を終えるか分からない）、
 * 決めポーズの 1.5〜2.6 秒のあいだ、毎コマ次を確かめる：
 *   - なでる犬（sim.petting）がいる
 *   - その犬は主人公の方を向いている
 *   - その犬は主人公と重なっていない（体の端どうしが離れている）・遠すぎない
 * 使い方: node scripts/pet-check.mjs [--seeds 1,2,3,4,5,6,7,8] [--nights 6]
 */
import { build } from '../app/node_modules/esbuild/lib/main.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bot } from './bot.mjs';

const args = Object.fromEntries(process.argv.slice(2).join(' ').split('--').filter(Boolean).map((s) => s.trim().split(/\s+/)).map(([k, v]) => [k, v ?? '1']));
const SEEDS = (args.seeds ?? '1,2,3,4,5,6,7,8').split(',').map(Number);
const NIGHTS = Number(args.nights ?? 6);
const dir = await mkdtemp(join(tmpdir(), 'akazukin-'));
const out = join(dir, 'sim.mjs');
await build({ entryPoints: [new URL('../app/src/sim.ts', import.meta.url).pathname], bundle: true, format: 'esm', outfile: out, logLevel: 'error' });
const { Sim } = await import(out);
const { HERO } = await import(out).then(async () => (await build({ entryPoints: [new URL('../app/src/config.ts', import.meta.url).pathname], bundle: true, format: 'esm', outfile: join(dir, 'c.mjs'), logLevel: 'error' }), import(join(dir, 'c.mjs'))));
await rm(dir, { recursive: true });

let rnd = 12345;
const r = () => ((rnd = (rnd * 1103515245 + 12345) % 2147483648) / 2147483648);
let ok = 0, bad = 0;
const fails = [];
for (const seed of SEEDS) {
  const s = new Sim(seed);
  const mem = {};
  let night = 0, moved = false, firstPet = -1, fault = '';
  for (let i = 0; i < 60 * 60 * 40 && night < NIGHTS && s.result === 'playing'; i++) {
    if (s.phase !== 'wave' || (i % 6 === 0 && s.finale < 0)) bot(s, mem);
    s.advance(1 / 60);
    if (s.finale > 0 && !moved) {
      // 最後の1匹を倒した瞬間：主人公をどこかへ置き直す（家の前・真ん中・右端、左右どちら向きも）
      moved = true;
      const pick = [HERO.minX, HERO.minX + 30, 200, 400, 600, HERO.maxX - 30, HERO.maxX][Math.floor(r() * 7)];
      s.hero.x = pick;
      s.hero.facing = r() < 0.5 ? 1 : -1;
      s.hero.lane = r();
      // 置き直したので、並び方を決め直す（決めるのは最後の1匹を倒した瞬間の1回だけなので、その瞬間をもう一度作る）
      s.finale = -1;
      s.endWave?.();
    }
    if (s.cheer >= 1.5) {
      const d = s.petting;
      const h = s.hero;
      if (!d) fault ||= `petting なし（cheer ${s.cheer.toFixed(2)}・主人公 ${Math.round(h.x)} 向き ${h.facing}・犬 ${s.dogs.map((q) => `${q.kind}:${Math.round(q.x)}${q.down > 0 ? '倒' : ''}`).join(' ')}）`;
      else {
        if (firstPet < 0) firstPet = s.cheer;
        const toward = (h.x - d.x) * d.facing > 0;
        const gap = Math.abs(d.x - h.x) - (HERO.size + d.size) / 2;
        if (!toward) fault ||= `${d.kind} が背を向けている（主人公 ${Math.round(h.x)}・犬 ${Math.round(d.x)} 向き ${d.facing}）`;
        if (gap < 0) fault ||= `${d.kind} が主人公に重なっている（すき間 ${gap.toFixed(0)}）`;
        if (gap > 80) fault ||= `${d.kind} が遠い（すき間 ${gap.toFixed(0)}）`;
      }
    }
    if (s.phase === 'shop' && moved) {
      night++;
      if (fault) { bad++; fails.push(`seed ${seed} 晩 ${night}: ${fault}`); } else { ok++; }
      if (!fault && firstPet > 1.6) fails.push(`seed ${seed} 晩 ${night}: なで始めが遅い（${firstPet.toFixed(2)}秒）`);
      moved = false; firstPet = -1; fault = '';
    }
  }
}
console.log(`なでられた晩 ${ok} / ${ok + bad}`);
for (const f of fails) console.log('  ' + f);
process.exit(bad ? 1 : 0);
