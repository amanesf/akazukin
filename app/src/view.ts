// 戦場の描画。いまは灰色の箱だけの仮の絵（plan.md §6：絵は生成した素材に差し替える）。
import { Application, Graphics } from 'pixi.js';
import { CANNON, FIELD_LENGTH, GIRL_X, HOUSE_X, WOLVES } from './config';
import type { Sim, Unit } from './sim';

const COLOR = {
  sky: 0x1a1218,
  moon: 0x8a2a2e,
  ground: 0x2c2422,
  groundLine: 0x4a3c36,
  house: 0x5a4636,
  roof: 0x3a2c26,
  window: 0xe0b860,
  girl: 0xc0303a,
  dog: 0xc8a070,
  wolf: 0x6a6a74,
  armored: 0x8a8a96,
  howler: 0x5a6a8a,
  alpha: 0x4a4a52,
  eye: 0xff4040,
  hp: 0x60d070,
  hpBack: 0x000000,
  arrow: 0xd8f0ff,
  shell: 0xe8c070,
  blast: 0xffa040,
  aim: 0xffffff,
  noCannon: 0x000000,
};

export class View {
  app = new Application();
  private g = new Graphics();
  private w = 0;
  private h = 0;

  async init(host: HTMLElement) {
    await this.app.init({ preference: 'webgl', resizeTo: host, background: COLOR.sky, antialias: true, resolution: Math.min(devicePixelRatio, 2), autoDensity: true });
    host.appendChild(this.app.canvas);
    this.app.stage.addChild(this.g);
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

    // 空と月（月が裂けて狼が来る：決定済みのメインビジュアルの構図）
    g.circle(this.w * 0.8, this.h * 0.2, this.h * 0.11).fill(COLOR.moon);
    g.rect(0, ground - 4, this.w, this.h - ground + 4).fill(COLOR.ground);
    g.rect(0, ground - 4, this.w, 2).fill(COLOR.groundLine);

    // 主砲の届かない近さ（上45度までしか起きない）
    g.rect(X(0), ground - 4, X(CANNON.minRange) - X(0), depth + 8).fill({ color: COLOR.noCannon, alpha: 0.25 });

    // おばあさんの家
    const hx = X(HOUSE_X);
    const hw = Math.max(36, hx);
    g.rect(hx - hw, ground - hw * 1.1, hw, hw * 1.1 + depth).fill(COLOR.house);
    g.poly([hx - hw - 6, ground - hw * 1.1, hx + 6, ground - hw * 1.1, hx - hw / 2, ground - hw * 1.7]).fill(COLOR.roof);
    g.rect(hx - hw * 0.65, ground - hw * 0.8, hw * 0.3, hw * 0.3).fill(COLOR.window);

    // 照準
    const ax = X(sim.aimX);
    g.rect(ax - 1, this.h * 0.3, 2, ground + depth - this.h * 0.3).fill({ color: COLOR.aim, alpha: 0.35 });
    g.poly([ax - 9, this.h * 0.3 - 14, ax + 9, this.h * 0.3 - 14, ax, this.h * 0.3]).fill({ color: COLOR.aim, alpha: 0.8 });

    // 奥から手前へ
    type Item = { lane: number; draw: () => void };
    const items: Item[] = [];
    for (const d of sim.dogs) items.push({ lane: d.lane, draw: () => this.body(g, X(d.x), Y(d.lane), d, u, COLOR.dog, 0.7) });
    for (const w of sim.wolves) {
      const c = w.kind === 'armored' ? COLOR.armored : w.kind === 'howler' ? COLOR.howler : w.kind === 'alpha' ? COLOR.alpha : COLOR.wolf;
      items.push({
        lane: w.lane,
        draw: () => {
          this.body(g, X(w.x), Y(w.lane), w, u, c, WOLVES[w.kind].size > 50 ? 0.9 : 0.7);
          // 目（左を向いている）
          g.rect(X(w.x) - (w.size * u) / 2 + 2, Y(w.lane) - w.size * u * 0.6, 3, 3).fill(w.hasted ? 0xffff60 : COLOR.eye);
        },
      });
    }
    items.push({
      lane: 0.5,
      draw: () => {
        const gx = X(GIRL_X);
        const gy = Y(0.5);
        const b = 14 * u; // 体の幅
        g.rect(gx - b / 2, gy - b * 3, b, b * 3).fill(COLOR.girl);
        g.circle(gx, gy - b * 3.5, b * 0.55).fill(0x201818);
        // 背中の主砲（撃てるときは上45度に起きている）
        const up = sim.canCannon();
        const r = b * 1.3;
        g.moveTo(gx - b * 0.2, gy - b * 2.6).lineTo(gx + (up ? r : -r * 0.8), gy - b * 2.6 - (up ? r : -r * 0.8)).stroke({ width: b * 0.3, color: 0x9a8a60 });
      },
    });
    items.sort((a, b) => a.lane - b.lane).forEach((i) => i.draw());

    // 矢
    for (const a of sim.arrows) {
      const y = Y(a.lane) - 20;
      g.moveTo(X(a.x) - 10, y).lineTo(X(a.x) + 4, y).stroke({ width: 2, color: COLOR.arrow });
    }
    // 砲弾（放物線）
    for (const s of sim.shells) {
      if (s.t < 0) continue;
      const x = X(s.fromX + (s.toX - s.fromX) * s.t);
      const arc = Math.sin(Math.PI * s.t) * this.h * 0.45;
      g.circle(x, Y(s.lane) - 40 - arc + (40 * s.t), 4).fill(COLOR.shell);
    }
    // 効果
    for (const f of sim.fx) {
      const p = f.t / 0.6;
      const x = X(f.x);
      const y = Y(f.lane) - 14;
      if (f.kind === 'blast') g.circle(x, y, CANNON.splash * k * (0.4 + p * 0.6)).fill({ color: COLOR.blast, alpha: 0.5 * (1 - p) });
      if (f.kind === 'poof') g.circle(x, y - p * 20, 8 + p * 16).fill({ color: 0xffffff, alpha: 0.5 * (1 - p) });
      if (f.kind === 'slash') g.moveTo(x - 12, y - 14).lineTo(x + 12, y + 8).stroke({ width: 2, color: 0xffffff, alpha: 1 - p });
    }
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
