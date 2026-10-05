// 小さい地図：戦場の全体を、メイン画面を縮小した感じで見せる（2026-10-04・アマネさん
// 「デフォルメしていいけど、こうげきがあたってるとかわかるようにメイン画面を縮小した感じ」）。
// 主人公・狼・番犬は同じ絵の縮小（大きさは盛る）。当たった光・斬撃・爆発・打ち上げ・煙・家の点滅・いま映している枠。
// タップするとそこへ駆けつける。
import { Container, Graphics } from 'pixi.js';
import { COLORS, DOG_ORDER, DOGS, FIELD_LENGTH, GRAY_FUR, HOUSE_X, WOLF_SPAWN_X, WOLVES } from './config';
import { place } from './fx';
import { HeroRig } from './heroRig';
import { DOG_REL, UnitArt, WOLF_REL } from './wolfArt';
import { Sim } from './sim';
import { DOG_COLOR, WOLF_COLOR } from './palette';

export class Minimap {
  root = new Container();
  private g = new Graphics();
  private top = new Graphics();
  private rig = new HeroRig();
  // 狼・番犬も同じ絵の縮小（2026-10-04。前は色の箱で、何がいるか分からなかった）
  private unitBack = new Container();
  private wolfArt = new UnitArt<string>('wolves', ['pup', 'wolf', 'armored', 'howler', 'alpha'], this.unitBack, new Container());
  private dogArt = new UnitArt<string>('dogs', ['shiba', 'akita', 'tosa'], this.unitBack, new Container());
  private w = 0;
  private h = 0;
  private pad = 10;
  private houseBlink = 0;

  constructor() {
    this.root.addChild(this.g, this.unitBack, this.rig.root, this.top);
  }

  load() {
    this.wolfArt.load().catch((e) => console.warn('mini wolves', e));
    this.dogArt.load().catch((e) => console.warn('mini dogs', e));
    return this.rig.load();
  }

  layout(W: number, y: number, h: number) {
    this.root.position.set(0, y);
    this.w = W;
    this.h = h;
  }

  private km() { return (this.w - this.pad * 2) / FIELD_LENGTH; }
  private mx(x: number) { return this.pad + x * this.km(); }
  private groundY() { return this.h * 0.52; }
  private my(lane: number) { return this.groundY() + 4 + lane * this.h * 0.32; }

  // 地図の上の点 → 戦場
  toField(sx: number, sy: number) {
    if (sy < 0 || sy > this.h) return null;
    return {
      x: (sx - this.pad) / this.km(),
      lane: Math.max(0, Math.min(1, (sy - this.groundY() - 4) / (this.h * 0.32))),
    };
  }

  private lastT = 0;

  draw(sim: Sim, t: number, view: { x0: number; x1: number }, day: number) {
    const g = this.g.clear();
    const top = this.top.clear();
    const W = this.w;
    const H = this.h;
    const gy = this.groundY();
    // 枠と空
    g.rect(0, 0, W, H).fill(day ? 0x2a3442 : 0x0e0a10);
    g.rect(0, 0, W, gy).fill(day ? 0x5a7898 : 0x1a1020);
    g.circle(W * 0.82, gy * 0.42, gy * 0.26).fill(day ? 0xf0d890 : 0x8a2a32);
    g.rect(0, gy, W, H - gy).fill(day ? 0x4a3c30 : 0x2a1e1e);
    g.rect(0, gy, W, 1).fill({ color: 0x6a5048, alpha: 0.8 });
    g.rect(0, 0, W, 2).fill(0x3a2a30);
    // 家（齧られると赤く点滅）
    const hx = this.mx(HOUSE_X);
    if (sim.fx.some((f) => f.kind === 'bite' && f.t < 0.25)) this.houseBlink = 0.3;
    this.houseBlink -= Math.max(0, Math.min(0.1, t - this.lastT)); // 画面の速さによらず同じ長さ
    this.lastT = t;
    const hc = this.houseBlink > 0 && Math.floor(t * 20) % 2 ? 0xff4040 : 0x6a5040;
    g.rect(2, gy - H * 0.28, hx - 1, H * 0.28 + H * 0.36).fill(hc);
    g.poly([0, gy - H * 0.28, hx + 3, gy - H * 0.28, hx * 0.5, gy - H * 0.44]).fill(0x2a1e22);
    g.rect(hx * 0.3, gy - H * 0.2, hx * 0.3, H * 0.08).fill({ color: 0xf0c060, alpha: day ? 0.3 : 0.9 });
    // 裂け目
    const rx = this.mx(WOLF_SPAWN_X) + 2;
    g.moveTo(rx, gy - H * 0.38).lineTo(rx - 3, gy - H * 0.2).lineTo(rx + 2, gy).lineTo(rx - 1, H - 4).stroke({ width: 3 + Math.sin(t * 4), color: 0xff3040, alpha: day ? 0.3 : 0.9 });

    const u = 0.22; // 体の大きさ1あたりの画素（位置より盛る）
    // 番犬と狼：同じ絵の縮小（読めなければ箱）。奥から手前へ
    const art = this.wolfArt.ready && this.dogArt.ready;
    this.wolfArt.begin();
    this.dogArt.begin();
    const dogs = day ? DOG_ORDER.map((kind) => ({ ...Sim.dogHome(kind), kind, size: DOGS[kind].size, hitFlash: 0, down: 0, facing: 1 })) : sim.dogs;
    const unitH = H * 0.3; // ふつうの狼の背（地図の上の画素）
    for (const d of dogs) {
      if (d.down > 0) continue;
      const w = d.size * u;
      if (art) {
        const hh = unitH * 0.75 * DOG_REL[d.kind];
        this.dogArt.put(0, d.kind, this.mx(d.x), this.my(d.lane) - this.dogArt.center(hh), hh, 0, 1, d.hitFlash > 0 ? 0xff9a9a : 0xffffff, 1, d.facing < 0);
      } else g.rect(this.mx(d.x) - w / 2, this.my(d.lane) - w * 0.6, w, w * 0.6).fill(d.hitFlash > 0 ? 0xffffff : DOG_COLOR[d.kind]);
    }
    // 狼（打ち上げは宙に、回る）
    for (const wf of [...sim.wolves].sort((a, b) => a.lane - b.lane)) {
      const big = WOLVES[wf.kind].size > 100;
      const w = wf.size * u;
      const h = w * (big ? 0.78 : 0.62);
      const x = this.mx(wf.x);
      const y = this.my(wf.lane) - wf.z * 0.12;
      const rot = wf.z > 0 && !wf.pouncing ? (wf.hitDir || 1) * Math.min(Math.PI * 1.5, wf.z / 60) : 0;
      if (rot) g.ellipse(x, this.my(wf.lane), w * 0.5, 1.5).fill({ color: 0x000000, alpha: 0.4 });
      if (art) {
        const hh = unitH * WOLF_REL[wf.kind];
        this.wolfArt.put(0, wf.kind, x, y - this.wolfArt.center(hh), hh, rot, 1, wf.hitFlash > 0 ? 0xffb0b0 : 0xffffff, wf.age < 0.45 ? wf.age / 0.45 : 1, false, wf.color ? COLORS[wf.color].fur : wf.kind === 'armored' ? undefined : GRAY_FUR); // 色の狼は小さい地図でも同じ色
        continue;
      }
      if (!rot) {
        g.rect(x - w / 2, y - h, w, h).fill(wf.hitFlash > 0 ? 0xffffff : WOLF_COLOR[wf.kind]);
        continue;
      }
      place(g, x, y - h / 2, rot);
      g.rect(-w / 2, -h / 2, w, h).fill(wf.hitFlash > 0 ? 0xffffff : WOLF_COLOR[wf.kind]);
      g.restore();
    }
    this.wolfArt.end();
    this.dogArt.end();

    // 主人公：同じ絵の縮小（読めなければ赤い棒）
    const h = sim.hero;
    const px = this.mx(h.x);
    const py = this.my(h.lane);
    const pose = this.rig.pose(sim, px, py, H * 0.46, t, 0.12); // 大きすぎて狼が点に見えた
    if (pose) {
      this.rig.apply(pose);
    } else g.rect(px - 2, py - H * 0.5, 4, H * 0.5).fill(0xc0303a);
    // 走って行く先の印
    if (h.order && !day) top.circle(this.mx(h.order.x), this.my(h.order.lane), 3).stroke({ width: 1.5, color: 0xffffff, alpha: 0.7 });

    // 演出の縮小：当たった光・斬撃・爆発・煙・地面の輪
    for (const f of sim.fx) {
      const x = this.mx(f.x);
      const y = this.my(f.lane) - (f.z ?? 0) * 0.12;
      const q = f.t / 0.6;
      switch (f.kind) {
        case 'spark':
          if (f.t < 0.15) star(top, x, y - 4, f.big ? 7 : 4.5, 1 - f.t / 0.15);
          break;
        case 'slash':
          if (f.t < 0.15) {
            const d = f.dir ?? 1;
            top.moveTo(x - d * 2, y - 12).quadraticCurveTo(x + d * 8, y - 8, x + d * 2, y).stroke({ width: 2, color: 0xffb0c8, alpha: 1 - f.t / 0.15 });
          }
          break;
        case 'blast':
          top.circle(x, y - 6, (f.r ?? 60) * this.km() * (0.4 + q * 0.8)).fill({ color: 0xffa040, alpha: 0.6 * (1 - q) });
          break;
        case 'muzzle':
          if (f.t < 0.12) top.circle(x, y - 10, 5).fill({ color: 0xfff0c0, alpha: 1 - f.t / 0.12 });
          break;
        case 'spin':
          top.circle(x, y - 6, (f.r ?? 80) * this.km()).stroke({ width: 2, color: 0xffffff, alpha: 1 - q });
          break;
        case 'pound':
        case 'land':
          top.ellipse(x, this.my(f.lane), (f.r ?? 40) * this.km() * (0.5 + q), 2).stroke({ width: 1.5, color: 0xd0c0a0, alpha: 1 - q });
          break;
        case 'poof':
          top.circle(x, y - 4 - q * 8, 3 + q * 6).fill({ color: 0xffe0f0, alpha: 0.7 * (1 - q) });
          break;
        case 'dash':
          if (f.t < 0.25) top.moveTo(this.mx(f.x), y - 6).lineTo(this.mx(f.x2 ?? f.x), y - 6).stroke({ width: 3, color: 0xff6090, alpha: 1 - f.t / 0.25 });
          break;
      }
    }
    // 矢と砲弾
    for (const a of sim.arrows) if (a.t >= 0) top.circle(this.mx(a.fromX + (a.toX - a.fromX) * a.t), this.my(a.lane) - 6 - Math.sin(Math.PI * a.t) * 8, 1.2).fill(0xd8f0ff);
    for (const s of sim.shells) if (s.t >= 0) top.circle(this.mx(s.fromX + (s.toX - s.fromX) * s.t), this.my(s.lane) - 6 - Math.sin(Math.PI * s.t) * 18, 2).fill(0xe8c070);

    // いま映している枠
    if (!day) {
      const a = Math.max(0, this.mx(view.x0));
      const b = Math.min(W, this.mx(view.x1));
      top.roundRect(a, 4, b - a, H - 8, 4).stroke({ width: 1.5, color: 0xffffff, alpha: 0.55 });
    }
  }
}

// 当たった光：十字のきらめき
function star(g: Graphics, x: number, y: number, r: number, a: number) {
  g.poly([x, y - r, x + r * 0.22, y - r * 0.22, x + r, y, x + r * 0.22, y + r * 0.22, x, y + r, x - r * 0.22, y + r * 0.22, x - r, y, x - r * 0.22, y - r * 0.22]).fill({ color: 0xffffff, alpha: a });
}
