/*
 * プレイ動画の1回を選ぶ（描画なし）。10夜目を、強化しきった主人公で director.mjs に遊ばせ、
 * 乱数の種と見せ方の癖を変えて何十回も回し、見せ場の多い1回を選ぶ。撮影（movie.mjs）は選んだ1回をそのまま再現する。
 * 使い方: node scripts/movie-search.mjs [--night 10] [--seeds 1-40] [--ks 0.2,0.5,0.8]
 */
import { build } from '../app/node_modules/esbuild/lib/main.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { director } from './director.mjs';
import { setupNight, FPS } from './movie-setup.mjs';

const args = Object.fromEntries(process.argv.slice(2).join(' ').split('--').filter(Boolean).map((s) => s.trim().split(/\s+/)).map(([k, v]) => [k, v ?? '1']));
const NIGHT = Number(args.night ?? 10);
const [a, b] = (args.seeds ?? '1-40').split('-').map(Number);
const KS = (args.ks ?? '0.2,0.5,0.8').split(',').map(Number);
const dir = await mkdtemp(join(tmpdir(), 'akazukin-'));
await build({ entryPoints: [new URL('../app/src/sim.ts', import.meta.url).pathname], bundle: true, format: 'esm', outfile: join(dir, 'sim.mjs'), logLevel: 'error' });
const { Sim } = await import(join(dir, 'sim.mjs'));
await rm(dir, { recursive: true });

const runs = [];
for (let seed = a; seed <= (b ?? a); seed++) for (const k of KS) {
  const s = new Sim(seed);
  setupNight(s, NIGHT);
  const mem = {};
  const count = {};
  let seen = 0, frames = 0, ouran = 0, hp0 = s.houseHp;
  while (s.result === 'playing' && s.phase === 'wave' && frames < FPS * 60 * 5) {
    if (frames % 3 === 0) director(s, mem, k);
    if (s.events.includes('ouran')) ouran++;
    s.events.length = 0; // ページでは main が毎コマ読んで空にする
    s.sounds.length = 0;
    s.advance(1 / FPS);
    frames++;
    for (const f of s.fx) if (f.id > seen) { count[f.kind + (f.big ? '!' : '')] = (count[f.kind + (f.big ? '!' : '')] ?? 0) + 1; seen = f.id; }
  }
  const won = s.phase === 'shop';
  const score = (won ? 100 : -500) + s.nightKills * 1 + s.bestCombo * 0.6 + (count['blast!'] ?? 0) * 10 + (count.blast ?? 0) * 3 + (count.pound ?? 0) * 2
    + s.did.launch * 1.5 + s.did.slam * 2 + (count.dash ?? 0) * 1.5 + (count.spin ?? 0) * 2 + ouran * 15 - s.stats.heroDmg / s.maxHp * 30 - s.stats.downs * 60 - (hp0 - s.houseHp) * 0.08;
  runs.push({ seed, k, score: Math.round(score), sec: +(frames / FPS).toFixed(1), won, kills: s.nightKills, combo: s.bestCombo, heroDmg: Math.round(s.stats.heroDmg), downs: s.stats.downs, house: Math.round(hp0 - s.houseHp), ouran, blastBig: count['blast!'] ?? 0, blast: count.blast ?? 0, pound: count.pound ?? 0, dash: count.dash ?? 0, spin: count.spin ?? 0, did: { ...s.did } });
}
runs.sort((x, y) => y.score - x.score);
for (const r of runs.slice(0, 8)) console.log(JSON.stringify(r));
console.log('runs', runs.length, 'won', runs.filter((r) => r.won).length);
