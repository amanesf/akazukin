// 効果音。いまは仮の音で、ブラウザの中で合成して鳴らす（音の素材は無い）。
// 最初は鳴らさない（2026-10-03・アマネさん「デフォルト音オフでボタン用意して」）。
import type { Sound } from './sim';

export class Sfx {
  on = false;
  private ctx?: AudioContext;
  private out?: GainNode;
  private noise?: AudioBuffer;
  private last: Partial<Record<Sound, number>> = {};

  // ボタンを押したときに作る（ブラウザは、人の操作なしに音を出させない）
  toggle() {
    this.on = !this.on;
    if (this.on && !this.ctx) {
      this.ctx = new AudioContext();
      this.out = this.ctx.createGain();
      this.out.gain.value = 0.45;
      this.out.connect(this.ctx.destination);
      const n = this.ctx.sampleRate * 0.5;
      this.noise = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.on) void this.ctx!.resume();
    return this.on;
  }

  play(list: Sound[]) {
    if (!this.on || !this.ctx) return;
    const now = this.ctx.currentTime;
    for (const s of new Set(list)) {
      // 同じ音は続けて重ねない（矢の雨や乱戦でうるさくならないように）
      if (now - (this.last[s] ?? -1) < (s === 'hit' || s === 'bow' ? 0.05 : 0.08)) continue;
      this.last[s] = now;
      this[s](now);
    }
  }

  private tone(t: number, type: OscillatorType, f0: number, f1: number, dur: number, vol: number) {
    const o = this.ctx!.createOscillator();
    const g = this.ctx!.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.out!);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private hiss(t: number, type: BiquadFilterType, f0: number, f1: number, dur: number, vol: number) {
    const src = this.ctx!.createBufferSource();
    src.buffer = this.noise!;
    const f = this.ctx!.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = this.ctx!.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(this.out!);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  private swing(t: number) { this.hiss(t, 'bandpass', 2600, 700, 0.12, 0.35); }
  private hit(t: number) { this.tone(t, 'sine', 200, 70, 0.08, 0.5); this.hiss(t, 'highpass', 3000, 1500, 0.04, 0.25); }
  private heavy(t: number) { this.tone(t, 'sine', 160, 45, 0.18, 0.7); this.hiss(t, 'lowpass', 2000, 300, 0.15, 0.4); }
  private slam(t: number) { this.tone(t, 'sine', 110, 35, 0.3, 0.8); this.hiss(t, 'lowpass', 900, 120, 0.3, 0.5); }
  private boom(t: number) { this.tone(t, 'sine', 90, 28, 0.45, 0.9); this.hiss(t, 'lowpass', 1600, 100, 0.5, 0.6); }
  private bow(t: number) { this.tone(t, 'triangle', 900, 380, 0.07, 0.15); }
  private hurt(t: number) { this.tone(t, 'square', 320, 140, 0.12, 0.12); }
  private buy(t: number) { this.tone(t, 'sine', 880, 880, 0.08, 0.25); this.tone(t + 0.07, 'sine', 1320, 1320, 0.12, 0.25); }
  private ouran(t: number) {
    for (const [i, f] of [330, 415, 494, 659].entries()) this.tone(t + i * 0.06, 'sawtooth', f, f * 1.5, 0.5, 0.12);
    this.hiss(t, 'highpass', 800, 6000, 0.6, 0.2);
  }
  // 突進・駆けつけ：風を切る音
  private dash(t: number) { this.hiss(t, 'bandpass', 900, 3800, 0.16, 0.4); this.tone(t, 'sine', 300, 600, 0.1, 0.12); }
  private jump(t: number) { this.hiss(t, 'bandpass', 1200, 3000, 0.1, 0.25); }
  // 溜め：上がっていく音。満タン：きらっ
  private charge(t: number) { this.tone(t, 'triangle', 220, 660, 0.9, 0.08); }
  private full(t: number) { this.tone(t, 'sine', 1320, 1320, 0.08, 0.25); this.tone(t + 0.06, 'sine', 1980, 1980, 0.18, 0.2); }
  private horn(t: number) {
    this.tone(t, 'sawtooth', 196, 185, 0.9, 0.18);
    this.tone(t, 'sawtooth', 294, 277, 0.9, 0.12);
  }
}
