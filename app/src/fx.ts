// 粒と光の演出（描画だけ。sim の結果には関わらないので、乱数も Math.random でよい）。
// 2026-10-06 アマネさん「衝撃とかがジグザグのプラスチック感。光とか土煙とかがいい。美しく光の派手な演出」：
// 形を塗るのをやめ、ぼけた素材（光の玉・光の筋・ぼけた輪・十字のきらめき・煙の塊）を加算で重ねる。
// 光るもの（火花・輪・弧・筋・きらめき・光の玉）は light（加算の層）、煙・土煙・花びら・土くれはふつうの層。
// light は持ち主が好きな所に置ける（view は光の層にまとめて、にじみ（ブルーム）を掛ける）
import { Container, Graphics, Sprite, Texture } from 'pixi.js';

type Kind = 'spark' | 'dust' | 'petal' | 'bokeh' | 'flower' | 'debris' | 'ring' | 'arc' | 'glow' | 'line' | 'flare';
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
  flat?: number; // 縦のつぶれ（地面の輪・地面を這う土煙）
  tw?: number; // きらめきの瞬きの速さ
  sprite?: Sprite;
}

// ── ぼけた素材（一度だけ canvas で作る）──
const texCache: Record<string, Texture> = {};
function canvasTex(key: string, w: number, h: number, draw: (x: CanvasRenderingContext2D) => void) {
  if (texCache[key]) return texCache[key];
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  return (texCache[key] = Texture.from(c));
}
// 丸いぼかし（光の玉）
export function glowTexture() {
  return canvasTex('glow', 128, 128, (x) => {
    const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.55)');
    g.addColorStop(0.6, 'rgba(255,255,255,0.12)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, 128, 128);
  });
}
// 光の筋（横長。芯が白く、両端と上下がぼける）：火花・光の線
export function streakTexture() {
  return canvasTex('streak', 128, 32, (x) => {
    for (let i = 0; i < 3; i++) {
      const g = x.createLinearGradient(0, 0, 128, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.75, 'rgba(255,255,255,1)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g;
      x.globalAlpha = [0.25, 0.5, 1][i];
      const h = [16, 8, 3][i];
      x.beginPath();
      x.ellipse(64, 16, 64, h, 0, 0, Math.PI * 2);
      x.fill();
    }
  });
}
// ぼけた輪（衝撃の輪・光の輪）
export function ringTexture() {
  return canvasTex('ring', 256, 256, (x) => {
    const g = x.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.62, 'rgba(255,255,255,0.05)');
    g.addColorStop(0.84, 'rgba(255,255,255,0.9)');
    g.addColorStop(0.9, 'rgba(255,255,255,1)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, 256, 256);
  });
}
// 十字のきらめき（光の芯から4本の細い光と、斜めの短い光）
export function flareTexture() {
  return canvasTex('flare', 128, 128, (x) => {
    x.globalCompositeOperation = 'lighter';
    const core = x.createRadialGradient(64, 64, 0, 64, 64, 22);
    core.addColorStop(0, 'rgba(255,255,255,1)');
    core.addColorStop(0.4, 'rgba(255,255,255,0.45)');
    core.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = core;
    x.fillRect(0, 0, 128, 128);
    const ray = (a: number, len: number, w: number, al: number) => {
      x.save();
      x.translate(64, 64);
      x.rotate(a);
      const g = x.createLinearGradient(-len, 0, len, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.5, `rgba(255,255,255,${al})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g;
      x.beginPath();
      x.ellipse(0, 0, len, w, 0, 0, Math.PI * 2);
      x.fill();
      x.restore();
    };
    ray(0, 64, 2.6, 1);
    ray(Math.PI / 2, 64, 2.6, 1);
    ray(Math.PI / 4, 30, 1.6, 0.6);
    ray(-Math.PI / 4, 30, 1.6, 0.6);
  });
}
// 煙・土煙の塊（ふちがもこもこにぼけた丸）
export function puffTexture() {
  return canvasTex('puff', 128, 128, (x) => {
    let seed = 7;
    const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 9; i++) {
      const cx = 64 + (r() - 0.5) * 50;
      const cy = 64 + (r() - 0.5) * 40;
      const rad = 22 + r() * 22;
      const g = x.createRadialGradient(cx, cy, 0, cx, cy, rad);
      g.addColorStop(0, 'rgba(255,255,255,0.42)');
      g.addColorStop(0.6, 'rgba(255,255,255,0.18)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g;
      x.fillRect(0, 0, 128, 128);
    }
  });
}

export const PINK = [0xffc0d8, 0xffd6e4, 0xf8a8c4, 0xffe8f0];
export const NIGHT_PINK = [0xc89ab4, 0xb88aa8, 0xd8aec4, 0xa87c9c]; // 遠くの花びら：夜の色に沈めた桜色
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const SPRITE_TEX: Partial<Record<Kind, () => Texture>> = { glow: glowTexture, spark: streakTexture, ring: ringTexture, flare: flareTexture, dust: puffTexture };

export class Particles {
  root = new Container();
  light = new Container(); // 光るもの（加算）。root の中に置く。持ち主が別の所へ移してもよい
  private back = new Graphics(); // 弧の外側のにじみ
  private smokes = new Container(); // 煙・土煙（ふつうの重ね方）
  private g = new Graphics(); // 花びら・花・土くれ
  private lightG = new Graphics(); // 斬撃の弧・速度線（加算）
  private glows = new Container(); // 光の玉・光の筋・輪・きらめき（加算）
  private ps: P[] = [];
  private pools: Partial<Record<Kind, Sprite[]>> = {};
  max = 900;
  avoid: { x: number; y: number; rx: number; ry: number } | null = null; // 玉ボケの花びらが透ける所（主人公の体。画面の座標）

  constructor() {
    this.light.blendMode = 'add';
    this.light.addChild(this.lightG, this.glows);
    this.root.addChild(this.smokes, this.back, this.g, this.light);
  }

  private add(p: Partial<P> & Pick<P, 'kind' | 'x' | 'y'>) {
    if (this.ps.length >= this.max) {
      const old = this.ps.shift()!;
      if (old.sprite) this.release(old);
    }
    const q: P = { vx: 0, vy: 0, life: 0.5, t: 0, size: 4, grow: 0, color: 0xffffff, alpha: 1, rot: 0, vr: 0, g: 0, floor: Infinity, drag: 0, ...p };
    const tex = SPRITE_TEX[q.kind];
    if (tex) {
      const pool = (this.pools[q.kind] ??= []);
      const s = pool.pop() ?? new Sprite(tex());
      s.anchor.set(q.kind === 'spark' ? 0.75 : 0.5, 0.5);
      s.visible = true;
      (q.kind === 'dust' ? this.smokes : this.glows).addChild(s);
      q.sprite = s;
    }
    this.ps.push(q);
    return q;
  }

  private release(p: P) {
    const s = p.sprite!;
    s.visible = false;
    s.parent?.removeChild(s);
    (this.pools[p.kind] ??= []).push(s);
    p.sprite = undefined;
  }

  // ── 組み合わせた演出 ──

  // 当たった瞬間：向き dir へ飛び散る光の筋と、白い光・ぼけた輪・小さなきらめき
  hit(x: number, y: number, dir: number, s: number, big: boolean) {
    const n = big ? 18 : 9;
    for (let i = 0; i < n; i++) {
      const a = (dir >= 0 ? 0 : Math.PI) + rnd(-1.1, 1.1);
      const sp = rnd(300, big ? 1100 : 750) * s;
      this.spark(x, y, Math.cos(a) * sp, Math.sin(a) * sp - 120 * s, s, Math.random() < 0.35 ? 0xffd890 : 0xfff4fa, rnd(0.14, 0.3));
    }
    this.add({ kind: 'glow', x, y, life: big ? 0.22 : 0.14, size: (big ? 170 : 100) * s, grow: 0.6, color: big ? 0xffe0a0 : 0xfff0f6, alpha: big ? 1 : 0.8 });
    this.flare(x, y, (big ? 110 : 60) * s, big ? 0xfff0c0 : 0xffffff, big ? 0.3 : 0.18);
    this.ring(x, y, 8 * s, (big ? 120 : 70) * s, 1, big ? 0xffe0b0 : 0xffd0e0, big ? 0.3 : 0.2);
    // 花びらが少し舞う（このゲームの手触り：斬ると桜が散る）
    for (let i = 0; i < (big ? 6 : 2); i++) this.petal(x, y, s, rnd(-200, 200) + dir * 160, rnd(-260, -60));
  }

  // 光の筋の火花（速さの向きに伸びる）
  spark(x: number, y: number, vx: number, vy: number, s: number, color = 0xffffff, life = rnd(0.15, 0.3), g = 900) {
    this.add({ kind: 'spark', x, y, vx, vy, life, size: rnd(0.8, 1.3) * s, color, drag: 5, g: g * s });
  }

  // 十字のきらめき：ぱっと開いて、回りながら瞬いて消える
  flare(x: number, y: number, size: number, color = 0xffffff, life = 0.3, vx = 0, vy = 0, tw = 0) {
    this.add({ kind: 'flare', x, y, vx, vy, size, color, life, rot: rnd(-0.3, 0.3), vr: rnd(-2, 2), tw });
  }

  // 小さな光の粒（ふわっと漂う・吸い込まれる）
  mote(x: number, y: number, vx: number, vy: number, size: number, color: number, life: number, drag = 0) {
    this.add({ kind: 'glow', x, y, vx, vy, size, color, life, grow: -0.5, alpha: 0.95, drag });
  }

  petal(x: number, y: number, s: number, vx = rnd(-60, 60), vy = rnd(-40, 40), life = rnd(0.8, 1.6), colors = PINK, alpha = 1) {
    this.add({ kind: 'petal', x, y, vx: vx * s, vy: vy * s, life, size: rnd(3, 5.5) * s, color: pick(colors), alpha, rot: rnd(0, 6.28), vr: rnd(-8, 8), g: 160 * s, drag: 2.2 });
  }

  // 桜の花がぱっと開いて、少し回りながら消える（矢が当たった所）
  flower(x: number, y: number, size: number, life = 0.55) {
    this.add({ kind: 'flower', x, y, size, life, rot: rnd(0, 6.28), vr: rnd(-3, 3), color: pick(PINK), vy: -20 });
  }

  // カメラのすぐ前を横切る花びら：大きく、半透明で、ふちがぼけている（重力なし・速い）
  bokeh(x: number, y: number, size: number, vx: number, vy: number, life: number) {
    this.add({ kind: 'bokeh', x, y, vx, vy, life, size, color: pick(PINK), alpha: rnd(0.22, 0.34), rot: rnd(0, 6.28), vr: rnd(-1.5, 1.5) });
  }

  // 光る桜の粒：ゆっくり漂って、ふっと消える（夜の地面の上）。蛍だと夏になって季節が混ざった
  firefly(x: number, y: number, s: number) {
    this.add({ kind: 'glow', x, y, vx: rnd(-14, 14) * s, vy: rnd(-22, -6) * s, life: rnd(2, 3.5), size: rnd(10, 18) * s, grow: -0.3, color: Math.random() < 0.5 ? 0xffd0e4 : 0xfff4f8, alpha: rnd(0.5, 0.85) });
  }

  // 煙の塊：ゆっくり昇って広がる（color で黒い煙・白い煙・土煙）
  puff(x: number, y: number, vx: number, vy: number, size: number, grow: number, color: number, alpha: number, life: number, drag = 1.5, flat = 1) {
    this.add({ kind: 'dust', x, y, vx, vy, size, grow, color, alpha, life, drag, rot: rnd(0, 6.28), vr: rnd(-0.8, 0.8), flat });
  }

  // 黒い煙（影の狼が消えるとき）。ゆっくり昇って広がる
  smoke(x: number, y: number, s: number, n = 6) {
    for (let i = 0; i < n; i++) this.puff(x + rnd(-20, 20) * s, y + rnd(-15, 15) * s, rnd(-30, 30) * s, rnd(-90, -40) * s, rnd(26, 40) * s, 60 * s, Math.random() < 0.5 ? 0x24182e : 0x3a2440, 0.85, rnd(0.7, 1.2));
  }

  // 火の粉：紅く舞い上がる
  ember(x: number, y: number, s: number) {
    this.add({ kind: 'glow', x, y, vx: rnd(-30, 30) * s, vy: rnd(-90, -40) * s, life: rnd(0.8, 1.6), size: rnd(8, 14) * s, grow: -0.6, color: Math.random() < 0.6 ? 0xff5040 : 0xffa060, alpha: 0.9 });
  }

  // 斬撃の弧。a0→a1 へ一瞬で振り抜き、尾が細くなって消える（光の帯：桜色のにじみ＋白い芯）
  arc(x: number, y: number, r: number, a0: number, a1: number, w: number, color = 0xffffff, life = 0.2) {
    this.add({ kind: 'arc', x, y, size: r, a0, a1, w, color, life, grow: r * 0.15 });
  }

  // 土煙：地面を這って横へ広がる、もこもこの塊（ふちのくっきりした丸だと、プラスチックの玉に見えた）
  dust(x: number, y: number, s: number, n = 3, spread = 30, up = 40) {
    for (let i = 0; i < n; i++) {
      this.puff(x + rnd(-spread, spread) * s * 0.5, y - rnd(0, 8) * s, rnd(-spread, spread) * 2.2 * s, -rnd(up * 0.2, up * 0.7) * s, rnd(16, 26) * s, 46 * s, pick([0x9a8878, 0x8a7868, 0xa89888]), 0.55, rnd(0.45, 0.85), 2.6, 0.62);
    }
  }

  // 土くれ：小さく、丸っこく、少なめ（四角い破片はプラスチックに見えた）
  debris(x: number, y: number, s: number, n: number, floor: number) {
    for (let i = 0; i < Math.ceil(n * 0.6); i++) {
      this.add({ kind: 'debris', x, y, vx: rnd(-260, 260) * s, vy: -rnd(200, 520) * s, life: rnd(0.5, 0.9), size: rnd(1.5, 3.5) * s, color: pick([0x4a3a30, 0x6a5848, 0x3a302a]), rot: rnd(0, 6), vr: rnd(-12, 12), g: 1600 * s, floor });
    }
  }

  // 主砲の薬莢：金色で、くるくる回って跳ねる
  casing(x: number, y: number, s: number, dir: number, floor: number) {
    this.add({ kind: 'debris', x, y, vx: -dir * rnd(120, 220) * s, vy: -rnd(260, 380) * s, life: 1.1, size: 7 * s, color: 0xe0b860, rot: rnd(0, 6), vr: rnd(-18, 18), g: 1500 * s, floor, w: 1 });
  }

  // 主砲の白い煙：砲口からたなびいて昇る
  gunSmoke(x: number, y: number, s: number, dir: number) {
    for (let i = 0; i < 7; i++) this.puff(x + dir * rnd(0, 30) * s, y + rnd(-8, 8) * s, dir * rnd(30, 130) * s, rnd(-60, -20) * s, rnd(18, 28) * s, 70 * s, 0xe0d8e0, 0.5, rnd(0.9, 1.6), 1.2);
  }

  // ぼけた光の輪（r0 → r1 へ広がる。flat で地面に寝かせる）。w は太さの目安（大きいほど濃い）
  ring(x: number, y: number, r0: number, r1: number, w: number, color: number, life: number, flat = 1) {
    this.add({ kind: 'ring', x, y, size: r0, grow: (r1 - r0) / life, w, color, life, flat, alpha: Math.min(1, 0.45 + w * 0.08) });
  }

  glow(x: number, y: number, size: number, color: number, life: number, alpha = 1, grow = 0.5) {
    this.add({ kind: 'glow', x, y, size, color, life, alpha, grow });
  }

  // 速度線（画面に横の線）
  line(x: number, y: number, len: number, vx: number, color = 0xffffff, alpha = 0.6, life = 0.2, w = 2) {
    this.add({ kind: 'line', x, y, vx, size: len, color, alpha, life, w });
  }

  // 倒した：ポンッと白い煙＋光＋花びら
  pop(x: number, y: number, s: number, size: number) {
    this.glow(x, y, size * 3 * s, 0xffe0f0, 0.25, 0.9, 1);
    for (let i = 0; i < 7; i++) {
      const a = rnd(0, Math.PI * 2);
      const sp = rnd(60, 200) * s;
      this.puff(x, y, Math.cos(a) * sp, Math.sin(a) * sp * 0.6 - 60 * s, rnd(14, 22) * s * (size / 50), 40 * s, 0xf0e8f2, 0.5, rnd(0.3, 0.5), 5);
    }
    for (let i = 0; i < 9; i++) this.petal(x, y, s, rnd(-260, 260), rnd(-380, -80), rnd(1, 1.8));
  }

  update(dt: number) {
    const keep: P[] = [];
    for (const p of this.ps) {
      p.t += dt;
      if (p.t >= p.life) {
        if (p.sprite) this.release(p);
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
      if (p.kind === 'bokeh') p.y += Math.sin(p.t * 2.2 + p.rot) * 40 * dt; // ゆったり揺れる
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
    const L = this.lightG.clear();
    for (const p of this.ps) {
      const q = p.t / p.life;
      const fade = 1 - q;
      switch (p.kind) {
        case 'spark': {
          // 光の筋：速いほど長く、遅くなると短い粒に
          const s = p.sprite!;
          const sp = Math.hypot(p.vx, p.vy);
          s.position.set(p.x, p.y);
          s.rotation = Math.atan2(p.vy, p.vx);
          s.tint = p.color;
          s.alpha = p.alpha * Math.min(1, fade * 1.6);
          s.width = Math.max(6, sp * 0.05) * p.size + 4;
          s.height = 14 * p.size * (0.5 + 0.5 * fade);
          break;
        }
        case 'dust': {
          // 煙の塊：広がりながら薄れる（最初の1割でふわっと濃くなる）
          const s = p.sprite!;
          const r = p.size + p.grow * q;
          s.position.set(p.x, p.y);
          s.rotation = p.rot;
          s.tint = p.color;
          s.alpha = p.alpha * Math.min(1, q * 10) * fade;
          s.width = r * 2;
          s.height = r * 2 * (p.flat ?? 1);
          break;
        }
        case 'petal': {
          // 花びら：細長い楕円がくるくる回る（裏返るときに細くなる）
          const flip = Math.abs(Math.cos(p.rot * 0.7));
          place(g, p.x, p.y, p.rot);
          g.ellipse(0, 0, p.size, p.size * 0.55 * (0.25 + flip * 0.75)).fill({ color: p.color, alpha: p.alpha * Math.min(1, fade * 2.5) });
          g.restore();
          break;
        }
        case 'flower': {
          // 最初の3割で開き（少し大きく行きすぎて戻る）、あとは薄れる
          const open = q < 0.3 ? easeOut(q / 0.3) * 1.15 : 1.15 - 0.15 * Math.min(1, (q - 0.3) / 0.2);
          blossom(g, p.x, p.y, p.size * open, p.rot, p.color, Math.min(1, fade * 2));
          break;
        }
        case 'bokeh': {
          // 薄い楕円を外から内へ重ねて、ふちをぼかす。主人公の体の上を通るときは透ける
          let a = p.alpha * Math.min(1, fade * 3, q * 8);
          const av = this.avoid;
          if (av) {
            const d = Math.hypot((p.x - av.x) / av.rx, (p.y - av.y) / av.ry);
            a *= 0.15 + 0.85 * Math.min(1, Math.max(0, d - 0.6) / 0.6);
          }
          if (a <= 0.01) break;
          const flip = 0.45 + 0.55 * Math.abs(Math.cos(p.rot * 0.8));
          place(g, p.x, p.y, p.rot);
          for (const k of [1, 0.82, 0.64]) g.ellipse(0, 0, p.size * k, p.size * 0.6 * flip * k).fill({ color: p.color, alpha: a / 3 });
          g.restore();
          break;
        }
        case 'debris':
          // 土くれ（丸っこい）。薬莢（w=1）は細長い金の筒
          if (p.w) {
            place(g, p.x, p.y, p.rot);
            g.roundRect(-p.size / 2, -p.size / 5, p.size, p.size / 2.5, p.size / 5).fill({ color: p.color, alpha: Math.min(1, fade * 3) });
            g.restore();
          } else g.circle(p.x, p.y, p.size).fill({ color: p.color, alpha: Math.min(1, fade * 3) });
          break;
        case 'ring': {
          // ぼけた輪：広がるほど薄く、ふちは柔らかい
          const s = p.sprite!;
          const r = p.size + p.grow * p.t;
          s.position.set(p.x, p.y);
          s.rotation = 0;
          s.tint = p.color;
          s.alpha = p.alpha * fade * fade;
          s.width = r * 2.2;
          s.height = r * 2.2 * (p.flat ?? 1);
          break;
        }
        case 'flare': {
          // きらめき：最初の15%でぱっと開き、瞬きながら（tw）回って消える
          const s = p.sprite!;
          const open = q < 0.15 ? easeOut(q / 0.15) : 1;
          const tw = p.tw ? 0.65 + 0.35 * Math.sin(p.t * p.tw) : 1;
          s.position.set(p.x, p.y);
          s.rotation = p.rot;
          s.tint = p.color;
          s.alpha = p.alpha * fade * tw;
          s.width = s.height = p.size * open * (0.6 + 0.4 * fade) * tw;
          break;
        }
        case 'arc': {
          // 振り抜き：最初の3割で先端が a0→a1 へ走り、そのあと尾が先端へ追いつく。
          // 外側に桜色の広いにじみ、内に白い芯（加算なので重なるほど白く光る）
          const head = Math.min(1, q / 0.3);
          const tail = Math.max(0, (q - 0.15) / 0.85);
          const aH = p.a0! + (p.a1! - p.a0!) * easeOut(head);
          const aT = p.a0! + (p.a1! - p.a0!) * easeIn(tail);
          const r = p.size + p.grow * q;
          const c = p.color === 0xffffff ? 0xff7090 : p.color;
          crescent(L, p.x, p.y, r, aT, aH, p.w! * 3.2, c, 0.18 * fade);
          crescent(L, p.x, p.y, r, aT, aH, p.w! * 1.8, c, 0.4 * fade);
          crescent(L, p.x, p.y, r, aT, aH, p.w!, 0xffffff, Math.min(1, fade * 1.6) * 0.9);
          crescent(b, p.x, p.y, r, aT, aH, p.w! * 0.5, 0xffffff, Math.min(1, fade * 1.6) * 0.5);
          break;
        }
        case 'line':
          L.moveTo(p.x, p.y).lineTo(p.x + p.size, p.y).stroke({ width: (p.w ?? 2) * fade * 2.5 + 0.5, color: p.color, alpha: p.alpha * fade * 0.35 });
          L.moveTo(p.x, p.y).lineTo(p.x + p.size, p.y).stroke({ width: (p.w ?? 2) * fade + 0.3, color: p.color, alpha: p.alpha * fade });
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
    for (const p of this.ps) if (p.sprite) this.release(p);
    this.ps = [];
  }
}

// 桜の花（5枚の花びら・先に切れ込み・真ん中に黄色い芯）。r は花の半径
export function blossom(g: Graphics, x: number, y: number, r: number, rot: number, color: number, alpha: number, flat = 1) {
  if (alpha <= 0.01 || r <= 0.5) return;
  for (let i = 0; i < 5; i++) {
    const a = rot + (i * Math.PI * 2) / 5;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const px = (u: number, v: number) => [x + (c * u - s * v), y + (s * u + c * v) * flat];
    // 花びら：付け根から先へふくらみ、先に小さな切れ込み
    const pts = [px(0, 0), px(r * 0.45, -r * 0.34), px(r * 0.95, -r * 0.22), px(r * 0.82, 0), px(r * 0.95, r * 0.22), px(r * 0.45, r * 0.34)].flat();
    g.poly(pts).fill({ color, alpha });
  }
  g.ellipse(x, y, r * 0.2, r * 0.2 * flat).fill({ color: 0xffe08a, alpha });
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
