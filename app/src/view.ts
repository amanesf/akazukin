// 戦場の描画。いまは灰色の箱だけの仮の絵（plan.md §6：絵は生成した素材に差し替える）。
// 手応えの演出（ヒットストップは sim、ここでは画面の揺れ・ダメージ数字・斬撃の線）だけは先に入れる。
import { Application, Container, Graphics, Text } from 'pixi.js';
import { FIELD_LENGTH, HOUSE_X, WOLVES, type WolfKind } from './config';
import type { Sim, Unit } from './sim';

const COLOR = {
  sky: 0x1a1218,
  daySky: 0x6a8aa8, // 昼（合間）。絵が入るまでの仮の色
  sun: 0xf0d890,
  moon: 0x8a2a2e,
  ground: 0x2c2422,
  groundLine: 0x4a3c36,
  house: 0x5a4636,
  roof: 0x3a2c26,
  window: 0xe0b860,
  girl: 0xc0303a,
  hair: 0x201818,
  brass: 0x9a8a60,
  dog: 0xc8a070,
  wolf: 0x6a6a74,
  armored: 0x8a8a96,
  howler: 0x5a6a8a,
  alpha: 0x4a4a52,
  eye: 0xff4040,
  hp: 0x60d070,
  heroHp: 0xf06070,
  hpBack: 0x000000,
  arrow: 0xd8f0ff,
  shell: 0xe8c070,
  blast: 0xffa040,
  slash: 0xffffff,
  shock: 0x9ab0ff,
};

// 狼の仮の色（予告の印にも使う）
export const WOLF_COLOR: Record<WolfKind, number> = {
  pup: 0x6a6a74,
  wolf: 0x6a6a74,
  armored: 0x8a8a96,
  howler: 0x5a6a8a,
  alpha: 0x4a4a52,
};

export class View {
  app = new Application();
  private world = new Container(); // 揺らすのはこちら
  private g = new Graphics();
  private nums: Text[] = [];
  private w = 0;
  private h = 0;
  heroAt = { x: 0, y: 0 }; // 吹き出しを置く位置（画面の座標）

  async init(host: HTMLElement) {
    await this.app.init({ preference: 'webgl', resizeTo: host, background: COLOR.sky, antialias: true, resolution: Math.min(devicePixelRatio, 2), autoDensity: true });
    host.appendChild(this.app.canvas);
    this.app.stage.addChild(this.world);
    this.world.addChild(this.g);
    for (let i = 0; i < 40; i++) {
      const t = new Text({ text: '', style: { fontFamily: 'system-ui, sans-serif', fontWeight: '900', fontSize: 16, fill: 0xffffff, stroke: { color: 0x000000, width: 4 } } });
      t.anchor.set(0.5);
      t.visible = false;
      this.world.addChild(t);
      this.nums.push(t);
    }
  }

  // 画面の横位置 → 間合い
  toFieldX(px: number) {
    return ((px - this.pad()) / (this.w - this.pad() * 2)) * FIELD_LENGTH;
  }

  draw(sim: Sim) {
    this.w = this.app.screen.width;
    this.h = this.app.screen.height;
    const g = this.g.clear();
    const ground = this.h * 0.7;
    const depth = this.h * 0.16;
    const k = (this.w - this.pad() * 2) / FIELD_LENGTH; // 間合い1あたりの画素
    const X = (x: number) => this.pad() + x * k;
    const Y = (lane: number) => ground + lane * depth;
    const u = this.h * 0.0032; // 体の大きさの倍率（横幅ではなく戦場の高さに合わせる）
    const zk = u * 0.55; // 高さ1あたりの画素

    // 画面の揺れ
    const s = sim.shake;
    this.world.position.set((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);

    // 空。夜は赤い月（月が裂けて狼が来る：決定済みのメインビジュアルの構図）、昼（合間）は日
    const day = sim.phase === 'shop';
    g.rect(-20, -20, this.w + 40, this.h + 40).fill(day ? COLOR.daySky : COLOR.sky);
    g.circle(this.w * 0.8, this.h * 0.2, this.h * 0.11).fill(day ? COLOR.sun : COLOR.moon);
    g.rect(-20, ground - 4, this.w + 40, this.h - ground + 24).fill(COLOR.ground);
    g.rect(-20, ground - 4, this.w + 40, 2).fill(COLOR.groundLine);

    // おばあさんの家
    const hx = X(HOUSE_X);
    const hw = Math.max(36, hx);
    g.rect(hx - hw, ground - hw * 1.1, hw, hw * 1.1 + depth).fill(COLOR.house);
    g.poly([hx - hw - 6, ground - hw * 1.1, hx + 6, ground - hw * 1.1, hx - hw / 2, ground - hw * 1.7]).fill(COLOR.roof);
    g.rect(hx - hw * 0.65, ground - hw * 0.8, hw * 0.3, hw * 0.3).fill(COLOR.window);

    // タップした所の印（近：向かう先／遠：撃つ位置）
    const mark = sim.phase === 'wave' ? (sim.stance === 'far' ? sim.hero.farX : sim.hero.order) : null;
    if (mark !== null) {
      const mx = X(mark);
      g.moveTo(mx, ground + depth * 0.5).lineTo(mx, ground - 26).stroke({ width: 2, color: 0xffffff, alpha: 0.6 });
      g.poly([mx, ground - 26, mx + 14, ground - 21, mx, ground - 16]).fill({ color: COLOR.girl, alpha: 0.9 });
    }

    // 奥から手前へ
    type Item = { lane: number; draw: () => void };
    const items: Item[] = [];
    for (const d of sim.dogs) items.push({ lane: d.lane, draw: () => this.body(g, X(d.x), Y(d.lane), d, u, COLOR.dog, 0.7) });
    for (const w of sim.wolves) {
      const c = WOLF_COLOR[w.kind];
      items.push({
        lane: w.lane,
        draw: () => {
          const x = X(w.x);
          const y = Y(w.lane);
          if (w.z > 0) g.ellipse(x, y, (w.size * u) / 2, 3).fill({ color: 0x000000, alpha: 0.4 }); // 影
          const lift = w.z * zk;
          this.body(g, x, y - lift, w, u, w.slammed ? 0xffd080 : c, WOLVES[w.kind].size > 50 ? 0.9 : 0.7);
          // 目（左を向いている）
          g.rect(x - (w.size * u) / 2 + 2, y - lift - w.size * u * 0.6, 3, 3).fill(w.hasted ? 0xffff60 : COLOR.eye);
        },
      });
    }
    items.push({ lane: 0.5, draw: () => this.hero(g, sim, X, Y(0.5), u) });
    items.sort((a, b) => a.lane - b.lane).forEach((i) => i.draw());

    // 矢（放物線。高さは飛ぶ距離に比例させ、向きは軌道の接線に合わせる）
    for (const a of sim.arrows) {
      if (a.t < 0) continue;
      const dx = (a.toX - a.fromX) * k;
      const arc = Math.abs(dx) * 0.35;
      const y0 = Y(a.lane) - 14 * u;
      const x = X(a.fromX) + dx * a.t;
      const y = y0 - Math.sin(Math.PI * a.t) * arc + (14 * u - 10) * a.t;
      const vx = dx;
      const vy = -Math.cos(Math.PI * a.t) * Math.PI * arc;
      const len = Math.hypot(vx, vy) || 1;
      const L = 9 * u;
      g.moveTo(x - (vx / len) * L, y - (vy / len) * L).lineTo(x, y).stroke({ width: 2.5, color: COLOR.arrow });
    }
    // 砲弾（放物線）
    for (const sh of sim.shells) {
      if (sh.t < 0) continue;
      const x = X(sh.fromX + (sh.toX - sh.fromX) * sh.t);
      const arc = Math.sin(Math.PI * sh.t) * this.h * 0.4;
      g.circle(x, Y(sh.lane) - 40 - arc + 40 * sh.t, 4).fill(COLOR.shell);
    }
    // 狼の衝撃波
    for (const sh of sim.shots) {
      const x = X(sh.x);
      const y = Y(0.5) - 14 * u;
      g.moveTo(x + 10 + Math.cos(Math.PI * 0.7) * 14, y + Math.sin(Math.PI * 0.7) * 14).arc(x + 10, y, 14, Math.PI * 0.7, Math.PI * 1.3).stroke({ width: 3, color: COLOR.shock });
    }

    // 効果
    let ni = 0;
    for (const f of sim.fx) {
      const p = f.t / 0.6;
      const x = X(f.x);
      const y = Y(f.lane) - 14 * u;
      if (f.kind === 'blast') g.circle(x, y, (f.r ?? 60) * k * (0.4 + p * 0.6)).fill({ color: COLOR.blast, alpha: 0.55 * (1 - p) });
      if (f.kind === 'poof') g.circle(x, y - (f.z ?? 0) * zk - p * 20, 8 + p * 16).fill({ color: 0xffffff, alpha: 0.5 * (1 - p) });
      if (f.kind === 'miss') g.moveTo(x - 4, y + 10).lineTo(x + 2, y).stroke({ width: 2, color: COLOR.arrow, alpha: 1 - p });
      if (f.kind === 'spin') g.circle(x, y, (f.r ?? 80) * k).stroke({ width: 4 * (1 - p) + 1, color: COLOR.slash, alpha: 1 - p });
      if (f.kind === 'land') g.ellipse(x, Y(f.lane), (f.r ?? 60) * k * (0.5 + p), 6 * (1 - p) + 2).stroke({ width: 3, color: 0xd0c0a0, alpha: 1 - p });
      if (f.kind === 'slash') {
        // 斬撃の線：斬り上げは下から上、叩き落としは上から下、ふつうは横なぎ
        const r = 26 * u;
        const [a0, a1] = f.z === 1 ? [Math.PI * 0.6, -Math.PI * 0.4] : f.z === -1 ? [-Math.PI * 0.5, Math.PI * 0.5] : [-Math.PI * 0.35, Math.PI * 0.35];
        const cx = x - r * 0.4;
        const cy = y - 6 * u;
        const lo = Math.min(a0, a1);
        // arc は直前の点から線を引くので、弧の始まりへ先に移る（撮影で、左上から線が伸びていた）
        g.moveTo(cx + Math.cos(lo) * r, cy + Math.sin(lo) * r).arc(cx, cy, r, lo, Math.max(a0, a1)).stroke({ width: 5 * (1 - p) + 1, color: COLOR.slash, alpha: 1 - p });
      }
      if (f.kind === 'num' && ni < this.nums.length) {
        // ダメージ数字：跳ねて上へ消える。大きい一撃は大きく黄色く
        const q = f.t / 0.8;
        const t = this.nums[ni++];
        t.visible = true;
        t.text = String(f.n);
        t.style.fontSize = f.big ? 26 : 16;
        t.style.fill = f.big ? 0xffd040 : 0xffffff;
        t.alpha = q < 0.6 ? 1 : 1 - (q - 0.6) / 0.4;
        t.position.set(x + ((ni * 37) % 31) - 15, y - ((ni * 53) % 17) - (f.z ?? 0) * zk - 20 * u - Math.sin(Math.min(1, q * 3) * Math.PI * 0.5) * 24);
      }
    }
    for (; ni < this.nums.length; ni++) this.nums[ni].visible = false;
  }

  private hero(g: Graphics, sim: Sim, X: (x: number) => number, gy: number, u: number) {
    const h = sim.hero;
    const b = 14 * u; // 体の幅
    let x = X(h.x);
    this.heroAt = { x, y: gy - b * 4.3 };
    if (h.down > 0) {
      // 倒れている：横になる
      g.rect(x - b * 1.5, gy - b * 0.8, b * 3, b * 0.8).fill({ color: COLOR.girl, alpha: 0.6 });
      return;
    }
    // 技の踏み込み：当てる瞬間に前へ出る
    const m = h.move;
    if (m && m !== 'bow' && m !== 'ame' && m !== 'hougeki') x += h.facing * Math.sin(Math.min(1, h.moveT / 0.15) * Math.PI) * b * 0.5;
    const lift = m === 'launch' || m === 'air' ? b * 0.6 : 0;
    const col = h.ouran > 0 ? (Math.floor(sim.clock * 20) % 2 ? 0xffe060 : 0xff6040) : h.hitFlash > 0 ? 0xffffff : COLOR.girl;
    g.rect(x - b / 2, gy - b * 3 - lift, b, b * 3).fill(col);
    g.circle(x, gy - b * 3.5 - lift, b * 0.55).fill(COLOR.hair);
    // 背中の主砲：撃つ技のときだけ前上へ起きる
    const up = m === 'shiki' || m === 'hougeki' || h.ouran > 0;
    const r = b * 1.3;
    const bx = x - h.facing * b * 0.2;
    g.moveTo(bx, gy - b * 2.6 - lift).lineTo(bx + h.facing * (up ? r : -r * 0.8), gy - b * 2.6 - lift - (up ? r : -r * 0.8)).stroke({ width: b * 0.3, color: COLOR.brass });
    // 体力
    const hw = b * 2;
    g.rect(x - hw / 2, gy - b * 4.3, hw, 4).fill(COLOR.hpBack);
    g.rect(x - hw / 2, gy - b * 4.3, (hw * Math.max(0, h.hp)) / sim.maxHp, 4).fill(COLOR.heroHp);
  }

  private body(g: Graphics, x: number, y: number, unit: Unit, u: number, color: number, aspect: number) {
    const w = unit.size * u;
    const h = w * aspect;
    g.rect(x - w / 2, y - h, w, h).fill(unit.hitFlash > 0 ? 0xffffff : color);
    if (unit.hp < unit.maxHp) {
      g.rect(x - w / 2, y - h - 6, w, 3).fill(COLOR.hpBack);
      g.rect(x - w / 2, y - h - 6, (w * Math.max(0, unit.hp)) / unit.maxHp, 3).fill(COLOR.hp);
    }
  }

  private pad() {
    return Math.max(10, this.w * 0.03);
  }
}
