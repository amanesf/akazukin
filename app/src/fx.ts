// 粒と光の演出（描画だけ。sim の結果には関わらないので、乱数も Math.random でよい）。
// 火花・土煙・桜の花びら・破片・輪・斬撃の弧・光（加算の丸いぼかし）を、まとめて毎フレーム描く。
import { Container, Graphics, Sprite, Texture } from 'pixi.js';

type Kind = 'spark' | 'dust' | 'petal' | 'debris' | 'ring' | 'arc' | 'glow' | 'line';
interface P {
  kind: Kind;
  x: number; y: number; vx: number; vy: number;
  life: number; t: number;
  size: number; grow: number;
  color: number; alpha: number;
  rot: number; vr: number;
  g: number; // 重力
  floor: number; // 跳ね返る地面の高さ（Infinity なら無し）
  drag: number;
  // 弧（斬撃）：中心 x,y・半径 size・角度 a0→a1・太さ w
  a0?: number; a1?: number; w?: number; sweep?: number;
  sprite?: Sprite;
}

let glowTex: Texture | undefined;
// 丸いぼかしの絵（加算で重ねて光らせる）。一度だけ canvas で作る
export function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d')!;
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.12)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  glowTex = Texture.from(c);
  return glowTex;
}

export const PINK = [0xffc0d8, 0xffd6e4, 0xf8a8c4, 0xffe8f0];
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];

export class Particles {
  root = new Container();
  private back = new Graphics(); // 弧・土煙（体の後ろにも出したいもの）
  private g = new Graphics();
  private glows = new Container();
  private ps: P[] = [];
  private pool: Sprite[] = [];
  max = 900;

  constructor() {
    this.glows.blendMode = 'add';
    this.root.addChild(this.back, this.g, this.glows);
  }

  private add(p: Partial<P> & Pick<P, 'kind' | 'x' | 'y'>) {
    if (this.ps.length >= this.max) {
      const old = this.ps.shift()!;
      if (old.sprite) this.release(old.sprite);
    }
    const q: P = { vx: 0, vy: 0, life: 0.5, t: 0, size: 4, grow: 0, color: 0xffffff, alpha: 1, rot: 0, vr: 0, g: 0, floor: Infinity, drag: 0, ...p };
    if (q.kind === 'glow') {
      const s = this.pool.pop() ?? new Sprite(glowTexture());
      s.anchor.set(0.5);
      s.visible = true;
      this.glows.addChild(s);
      q.sprite = s;
    }
    this.ps.push(q);
    return q;
  }

  private release(s: Sprite) {
    s.visible = false;
    this.glows.removeChild(s);
    this.pool.push(s);
  }

  // ── 組み合わせた演出 ──

  // 当たった瞬間の火花：向き dir へ飛び散る線と、白い光
  hit(x: number, y: number, dir: number, s: number, big: boolean) {
    const n = big ? 16 : 9;
    for (let i = 0; i < n; i++) {
      const a = (dir >= 0 ? 0 : Math.PI) + rnd(-1.1, 1.1);
      const sp = rnd(300, big ? 1100 : 750) * s;
      this.add({ kind: 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 120 * s, life: rnd(0.12, 0.3), size: rnd(1.5, 3.5) * s, color: Math.random() < 0.3 ? 0xffe080 : 0xffffff, drag: 6, g: 900 * s });
    }
    this.add({ kind: 'glow', x, y, life: big ? 0.22 : 0.14, size: (big ? 150 : 90) * s, grow: 0.6, color: big ? 0xffe0a0 : 0xffffff, alpha: big ? 1 : 0.85 });
    this.add({ kind: 'ring', x, y, life: big ? 0.3 : 0.18, size: 10 * s, grow: (big ? 260 : 140) * s, color: 0xffffff, w: (big ? 6 : 3) * s });
    // 花びらが少し舞う（このゲームの手触り：斬ると桜が散る）
    for (let i = 0; i < (big ? 6 : 2); i++) this.petal(x, y, s, rnd(-200, 200) + dir * 160, rnd(-260, -60));
  }

  petal(x: number, y: number, s: number, vx = rnd(-60, 60), vy = rnd(-40, 40), life = rnd(0.8, 1.6)) {
    this.add({ kind: 'petal', x, y, vx: vx * s, vy: vy * s, life, size: rnd(3, 5.5) * s, color: pick(PINK), rot: rnd(0, 6.28), vr: rnd(-8, 8), g: 160 * s, drag: 2.2 });
  }

  // 蛍のような光の粒：ゆっくり漂って、ふっと消える（夜の地面の上）
  firefly(x: number, y: number, s: number) {
    this.add({ kind: 'glow', x, y, vx: rnd(-14, 14) * s, vy: rnd(-22, -6) * s, life: rnd(2, 3.5), size: rnd(10, 18) * s, grow: -0.3, color: Math.random() < 0.5 ? 0xfff2a8 : 0xd8ffb0, alpha: rnd(0.5, 0.85) });
  }

  // 火の粉：裂け目から紅く舞い上がる
  ember(x: number, y: number, s: number) {
    this.add({ kind: 'glow', x, y, vx: rnd(-30, 30) * s, vy: rnd(-90, -40) * s, life: rnd(0.8, 1.6), size: rnd(8, 14) * s, grow: -0.6, color: Math.random() < 0.6 ? 0xff5040 : 0xffa060, alpha: 0.9 });
  }

  // 斬撃の弧。a0→a1 へ一瞬で振り抜き、尾が細くなって消える
  arc(x: number, y: number, r: number, a0: number, a1: number, w: number, color = 0xffffff, life = 0.2) {
    this.add({ kind: 'arc', x, y, size: r, a0, a1, w, color, life, grow: r * 0.15 });
  }

  dust(x: number, y: number, s: number, n = 3, spread = 30, up = 40) {
    for (let i = 0; i < n; i++) {
      this.add({ kind: 'dust', x: x + rnd(-spread, spread) * s * 0.5, y: y + rnd(-3, 3) * s, vx: rnd(-spread, spread) * s, vy: -rnd(up * 0.3, up) * s, life: rnd(0.3, 0.6), size: rnd(5, 9) * s, grow: 16 * s, color: 0x8a7868, alpha: 0.5, drag: 3 });
    }
  }

  debris(x: number, y: number, s: number, n: number, floor: number) {
    for (let i = 0; i < n; i++) {
      this.add({ kind: 'debris', x, y, vx: rnd(-260, 260) * s, vy: -rnd(200, 520) * s, life: rnd(0.5, 0.9), size: rnd(2, 5) * s, color: pick([0x5a4a40, 0x7a6858, 0x3a302a]), rot: rnd(0, 6), vr: rnd(-12, 12), g: 1600 * s, floor });
    }
  }

  ring(x: number, y: number, r0: number, r1: number, w: number, color: number, life: number, flat = 1) {
    const p = this.add({ kind: 'ring', x, y, size: r0, grow: (r1 - r0) / life, w, color, life });
    p.vr = flat; // 縦のつぶれ（地面の輪）
  }

  glow(x: number, y: number, size: number, color: number, life: number, alpha = 1, grow = 0.5) {
    this.add({ kind: 'glow', x, y, size, color, life, alpha, grow });
  }

  // 速度線（画面に横の線）
  line(x: number, y: number, len: number, vx: number, color = 0xffffff, alpha = 0.6, life = 0.2, w = 2) {
    this.add({ kind: 'line', x, y, vx, size: len, color, alpha, life, w });
  }

  // 倒した：ポンッと煙＋花びら
  pop(x: number, y: number, s: number, size: number) {
    this.glow(x, y, size * 3 * s, 0xffe0f0, 0.25, 0.9, 1);
    for (let i = 0; i < 10; i++) {
      const a = rnd(0, Math.PI * 2);
      const sp = rnd(60, 220) * s;
      this.add({ kind: 'dust', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.6 - 60 * s, life: rnd(0.25, 0.42), size: rnd(4, 8) * s * (size / 50), grow: 12 * s, color: 0xe8e0ea, alpha: 0.6, drag: 6 });
    }
    for (let i = 0; i < 9; i++) this.petal(x, y, s, rnd(-260, 260), rnd(-380, -80), rnd(1, 1.8));
  }

  update(dt: number) {
    const keep: P[] = [];
    for (const p of this.ps) {
      p.t += dt;
      if (p.t >= p.life) {
        if (p.sprite) this.release(p.sprite);
        continue;
      }
      if (p.drag) {
        const k = Math.max(0, 1 - p.drag * dt);
        p.vx *= k;
        p.vy *= k;
      }
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      if (p.kind === 'petal') p.x += Math.sin(p.t * 7 + p.rot) * 30 * dt; // ひらひら
      if (p.y > p.floor) {
        p.y = p.floor;
        p.vy *= -0.35;
        p.vx *= 0.6;
      }
      keep.push(p);
    }
    this.ps = keep;
  }

  draw() {
    const g = this.g.clear();
    const b = this.back.clear();
    for (const p of this.ps) {
      const q = p.t / p.life;
      const fade = 1 - q;
      switch (p.kind) {
        case 'spark': {
          const len = 0.035;
          g.moveTo(p.x, p.y).lineTo(p.x - p.vx * len, p.y - p.vy * len).stroke({ width: p.size * fade + 0.5, color: p.color, alpha: p.alpha, cap: 'round' });
          break;
        }
        case 'dust':
          b.circle(p.x, p.y, p.size + p.grow * q).fill({ color: p.color, alpha: p.alpha * fade * fade });
          break;
        case 'petal': {
          // 花びら：細長い楕円がくるくる回る（裏返るときに細くなる）
          const flip = Math.abs(Math.cos(p.rot * 0.7));
          place(g, p.x, p.y, p.rot);
          g.ellipse(0, 0, p.size, p.size * 0.55 * (0.25 + flip * 0.75)).fill({ color: p.color, alpha: Math.min(1, fade * 2.5) });
          g.restore();
          break;
        }
        case 'debris':
          place(g, p.x, p.y, p.rot);
          g.rect(-p.size / 2, -p.size / 2, p.size, p.size).fill({ color: p.color, alpha: Math.min(1, fade * 3) });
          g.restore();
          break;
        case 'ring': {
          const r = p.size + p.grow * p.t;
          g.ellipse(p.x, p.y, r, r * (p.vr || 1)).stroke({ width: (p.w ?? 2) * fade + 0.5, color: p.color, alpha: p.alpha * fade });
          break;
        }
        case 'arc': {
          // 振り抜き：最初の3割で先端が a0→a1 へ走り、そのあと尾が先端へ追いつく
          const head = Math.min(1, q / 0.3);
          const tail = Math.max(0, (q - 0.15) / 0.85);
          const aH = p.a0! + (p.a1! - p.a0!) * easeOut(head);
          const aT = p.a0! + (p.a1! - p.a0!) * easeIn(tail);
          const r = p.size + p.grow * q;
          crescent(b, p.x, p.y, r, aT, aH, p.w! * 1.7, p.color === 0xffffff ? 0xff7090 : p.color, 0.55 * fade);
          crescent(g, p.x, p.y, r, aT, aH, p.w!, 0xffffff, Math.min(1, fade * 1.6));
          break;
        }
        case 'line':
          g.moveTo(p.x, p.y).lineTo(p.x + p.size, p.y).stroke({ width: (p.w ?? 2) * fade + 0.3, color: p.color, alpha: p.alpha * fade });
          break;
        case 'glow': {
          const s = p.sprite!;
          s.position.set(p.x, p.y);
          s.tint = p.color;
          s.alpha = p.alpha * fade;
          s.width = s.height = p.size * (1 + p.grow * q);
          break;
        }
      }
    }
  }

  clear() {
    for (const p of this.ps) if (p.sprite) this.release(p.sprite);
    this.ps = [];
  }
}

// 三日月の形：先端（a1 側）が太く、尾（a0 側）が細い
export function crescent(g: Graphics, cx: number, cy: number, r: number, a0: number, a1: number, w: number, color: number, alpha: number) {
  if (Math.abs(a1 - a0) < 0.01 || alpha <= 0) return;
  const n = 14;
  const outer: number[] = [];
  const inner: number[] = [];
  for (let i = 0; i <= n; i++) {
    const k = i / n;
    const a = a0 + (a1 - a0) * k;
    const th = w * Math.sin(Math.PI * Math.min(1, k * 1.15)) ** 0.8; // 先端寄りが太い
    outer.push(cx + Math.cos(a) * (r + th / 2), cy + Math.sin(a) * (r + th / 2));
    inner.push(cx + Math.cos(a) * (r - th / 2), cy + Math.sin(a) * (r - th / 2));
  }
  const pts = [...outer];
  for (let i = inner.length - 2; i >= 0; i -= 2) pts.push(inner[i], inner[i + 1]);
  g.poly(pts).fill({ color, alpha });
}

// 図形を置く：大きさ→回す→動かす の順に掛ける（Pixi の translateTransform は「あとから」掛かるので、
// 先に動かしてから回すと、動かした分まで原点のまわりに回ってしまう。撮影で、当たった狼が100画素ずれて見つけた）
export function place(g: Graphics, x: number, y: number, rot = 0, sx = 1, sy = 1) {
  g.save();
  if (sx !== 1 || sy !== 1) g.scaleTransform(sx, sy);
  if (rot) g.rotateTransform(rot);
  g.translateTransform(x, y);
  return g;
}

export const easeOut = (t: number) => 1 - (1 - t) ** 3;
export const easeIn = (t: number) => t * t;
