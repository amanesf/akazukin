/*
 * 序盤の難しさの点検（2026-10-05 アマネさん「序盤でもちゃんとタップしないと負ける」「武器強化していかないと負ける」）。
 * 遊び方ごとに、最初に家が落ちた晩を数える（やり直しはしない）。目安：触らない＝2〜3晩・強化しない＝8〜10晩・ふつう＝先へ進む
 *   idle：触らない（自動の斬りと弓だけ。昼の強化は買う）／nobuy：タップするが強化しない／full：ふつうの自動操作
 * 使い方: node scripts/early-check.mjs [--modes idle,nobuy,full] [--seeds 1,2,3]
 */
import { build } from '../app/node_modules/esbuild/lib/main.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bot } from './bot.mjs';

const args = Object.fromEntries(process.argv.slice(2).join(' ').split('--').filter(Boolean).map((s) => s.trim().split(/\s+/)));
const dir = await mkdtemp(join(tmpdir(), 'akazukin-'));
const out = join(dir, 'sim.mjs');
await build({ entryPoints: [new URL('../app/src/sim.ts', import.meta.url).pathname], bundle: true, format: 'esm', outfile: out, logLevel: 'error' });
const { Sim } = await import(out);
await rm(dir, { recursive: true });
for (const mode of (args.modes ?? 'idle,nobuy,full').split(',')) {
  const res = [];
  for (const seed of (args.seeds ?? '1,2,3').split(',').map(Number)) {
    const s = new Sim(seed);
    const mem = {};
    let t = 0;
    while (s.result === 'playing' && s.wave < 40 && t < 40 * 600) {
      if (s.phase === 'shop') {
        if (mode !== 'nobuy') {
          for (let i = 0; i < 6; i++) for (const k of ['knife', 'body', 'cannon', 'bow', 'dog']) { s.buy(k, 'special'); s.buy(k); }
        }
        s.nextWave();
      } else if (mode !== 'idle') bot(s, mem, true);
      for (let i = 0; i < 6; i++) s.step(1 / 60);
      t += 0.1;
    }
    res.push(s.result === 'lost' ? `${s.wave + 1}晩で負け` : `${s.wave}晩まで`);
  }
  console.log(mode, res.join(' / '));
}
