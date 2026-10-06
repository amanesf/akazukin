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
  tw?: number; // きらめきの瞬きの速さ（花びらは、月の光にきらっと光るかどうか）
  done?: boolean; // 花：花びらにほどけたか
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

// 影を使ってふちをぼかす（Safari でも効く）：形を画面の外に描き、影だけを元の場所へ落とす
function blurred(x: CanvasRenderingContext2D, blur: number, color: string, draw: () => void) {
  x.save();
  x.shadowColor = color;
  x.shadowBlur = blur;
  x.shadowOffsetX = 4096;
  x.translate(-4096, 0);
  draw();
  x.restore();
}
// 花びらの形（付け根が原点・先が +x・先に切れ込み）。len は長さ、wid は半分の幅
function petalPath(x: CanvasRenderingContext2D, len: number, wid: number) {
  x.beginPath();
  x.moveTo(0, 0);
  x.bezierCurveTo(len * 0.28, -wid * 0.95, len * 0.8, -wid * 1.05, len * 0.97, -wid * 0.32);
  x.lineTo(len * 0.84, 0);
  x.lineTo(len * 0.97, wid * 0.32);
  x.bezierCurveTo(len * 0.8, wid * 1.05, len * 0.28, wid * 0.95, 0, 0);
  x.closePath();
}
function flowerPaths(x: CanvasRenderingContext2D, c: number, len: number, wid: number, each: () => void, rot = -Math.PI / 2) {
  for (let i = 0; i < 5; i++) {
    x.save();
    x.translate(c, c);
    x.rotate(rot + (i * Math.PI * 2) / 5);
    petalPath(x, len, wid);
    each();
    x.restore();
  }
}
// 花びら（白に近い桜色：付け根が濃く、先が白い。色は tint で掛ける）。2026-10-06 アマネさん「プラスチック感」：1色の楕円をやめる
export function petalTexture() {
  return canvasTex('petal', 64, 40, (x) => {
    x.translate(4, 20);
    const g = x.createLinearGradient(0, 0, 56, 0);
    g.addColorStop(0, 'rgba(236,150,186,1)');
    g.addColorStop(0.45, 'rgba(255,222,234,1)');
    g.addColorStop(1, 'rgba(255,250,252,0.92)');
    x.fillStyle = g;
    x.shadowColor = 'rgba(255,230,240,0.8)';
    x.shadowBlur = 2;
    petalPath(x, 56, 16);
    x.fill();
    x.shadowBlur = 0;
    // すじ：付け根から先へ、うっすら
    x.strokeStyle = 'rgba(220,130,170,0.35)';
    x.lineWidth = 1;
    x.beginPath();
    x.moveTo(2, 0);
    x.quadraticCurveTo(28, -1, 44, 0);
    x.stroke();
  });
}
// 玉ボケの花びら：ふちが大きくぼけた花びらの形
export function bokehTexture() {
  return canvasTex('bokeh', 96, 72, (x) => {
    blurred(x, 9, 'rgba(255,255,255,0.9)', () => {
      x.translate(18, 36);
      petalPath(x, 62, 18);
      x.fillStyle = '#fff';
      x.fill();
    });
  });
}
// 光る桜の花（色つき）：にじむ桜色の光・付け根の濃い花びら・白く光る縁・金の蕊
export function blossomTexture() {
  return canvasTex('blossom', 256, 256, (x) => {
    const c = 128;
    const len = 96;
    blurred(x, 22, 'rgba(255,110,165,0.85)', () => flowerPaths(x, c, len, 40, () => { x.fillStyle = '#fff'; x.fill(); }));
    const g = x.createRadialGradient(c, c, 0, c, c, len);
    g.addColorStop(0, 'rgba(255,120,170,1)');
    g.addColorStop(0.35, 'rgba(255,190,214,1)');
    g.addColorStop(0.8, 'rgba(255,236,244,1)');
    g.addColorStop(1, 'rgba(255,250,252,1)');
    flowerPaths(x, c, len, 40, () => { x.fillStyle = g; x.fill(); });
    flowerPaths(x, c, len, 40, () => { x.strokeStyle = 'rgba(255,255,255,0.85)'; x.lineWidth = 2.5; x.stroke(); });
    // 蕊
    x.shadowColor = 'rgba(255,220,140,0.9)';
    x.shadowBlur = 6;
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + 0.3;
      const r = 26 + (i % 2) * 8;
      x.strokeStyle = 'rgba(255,240,200,0.9)';
      x.lineWidth = 1.6;
      x.beginPath();
      x.moveTo(c, c);
      x.lineTo(c + Math.cos(a) * r, c + Math.sin(a) * r);
      x.stroke();
      x.fillStyle = 'rgba(255,214,110,1)';
      x.beginPath();
      x.arc(c + Math.cos(a) * r, c + Math.sin(a) * r, 3.2, 0, Math.PI * 2);
      x.fill();
    }
    const core = x.createRadialGradient(c, c, 0, c, c, 24);
    core.addColorStop(0, 'rgba(255,255,240,1)');
    core.addColorStop(1, 'rgba(255,240,200,0)');
    x.fillStyle = core;
    x.fillRect(c - 24, c - 24, 48, 48);
  });
}
// 地面に焼き付く桜の紋（白。色は tint）。光る線の紋（line）・中が明るく外が透ける花の光（fill）・外の輪と目盛り（ring）。
// 花びらの長さは 200（素材の半分 256 に対して）。2026-10-06 アマネさん「衝撃の地面の桜マークがプラスチック感。光とか模様でリッチに」
export const CREST_R = 200 / 256;
export function crestTexture(kind: 'line' | 'fill' | 'ring') {
  return canvasTex(`crest-${kind}`, 512, 512, (x) => {
    const c = 256;
    const R = 200;
    if (kind === 'fill') {
      const g = x.createRadialGradient(c, c, 0, c, c, R);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.3, 'rgba(255,255,255,0.6)');
      g.addColorStop(0.75, 'rgba(255,255,255,0.22)');
      g.addColorStop(1, 'rgba(255,255,255,0.1)');
      blurred(x, 10, 'rgba(255,255,255,1)', () => flowerPaths(x, c, R, R * 0.42, () => { x.fillStyle = g; x.fill(); }));
      return;
    }
    const glowLine = (draw: () => void, w: number) => {
      for (const [lw, a, b] of [[w * 3.6, 0.28, 30], [w * 1.6, 0.65, 12], [w * 0.7, 1, 0]] as const) {
        x.save();
        x.lineWidth = lw;
        x.strokeStyle = `rgba(255,255,255,${a})`;
        x.fillStyle = `rgba(255,255,255,${a})`;
        x.shadowColor = 'rgba(255,255,255,1)';
        x.shadowBlur = b;
        x.lineCap = 'round';
        draw();
        x.restore();
      }
    };
    if (kind === 'line') {
      glowLine(() => flowerPaths(x, c, R, R * 0.42, () => x.stroke()), 5.5);
      // 花びらの真ん中のすじと、内の小さな花
      glowLine(() => {
        for (let i = 0; i < 5; i++) {
          const a = -Math.PI / 2 + (i * Math.PI * 2) / 5;
          x.beginPath();
          x.moveTo(c + Math.cos(a) * R * 0.18, c + Math.sin(a) * R * 0.18);
          x.lineTo(c + Math.cos(a) * R * 0.7, c + Math.sin(a) * R * 0.7);
          x.stroke();
        }
      }, 1.4);
      glowLine(() => flowerPaths(x, c, R * 0.36, R * 0.16, () => x.stroke(), -Math.PI / 2 + Math.PI / 5), 2);
      // 蕊：細い線の先に光る粒
      glowLine(() => {
        for (let i = 0; i < 10; i++) {
          const a = -Math.PI / 2 + Math.PI / 10 + (i * Math.PI * 2) / 10;
          const r = R * (0.42 + (i % 2) * 0.1);
          x.beginPath();
          x.moveTo(c + Math.cos(a) * R * 0.12, c + Math.sin(a) * R * 0.12);
          x.lineTo(c + Math.cos(a) * r, c + Math.sin(a) * r);
          x.stroke();
          x.beginPath();
          x.arc(c + Math.cos(a) * r, c + Math.sin(a) * r, 4, 0, Math.PI * 2);
          x.fill();
        }
      }, 1.2);
      return;
    }
    // ring：二重の輪・花びらの間の小さな菱・細かな目盛り（陣の模様）
    glowLine(() => { x.beginPath(); x.arc(c, c, 236, 0, Math.PI * 2); x.stroke(); }, 2.4);
    glowLine(() => { x.beginPath(); x.arc(c, c, 214, 0, Math.PI * 2); x.stroke(); }, 1);
    glowLine(() => {
      for (let i = 0; i < 60; i++) {
        const a = (i / 60) * Math.PI * 2;
        const r0 = i % 6 === 0 ? 210 : 218;
        x.beginPath();
        x.moveTo(c + Math.cos(a) * r0, c + Math.sin(a) * r0);
        x.lineTo(c + Math.cos(a) * 232, c + Math.sin(a) * 232);
        x.stroke();
      }
    }, 0.8);
    glowLine(() => {
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + Math.PI / 5 + (i * Math.PI * 2) / 5;
        const px = c + Math.cos(a) * 225;
        const py = c + Math.sin(a) * 225;
        x.save();
        x.translate(px, py);
        x.rotate(a);
        x.beginPath();
        x.moveTo(-12, 0); x.lineTo(0, -7); x.lineTo(12, 0); x.lineTo(0, 7); x.closePath();
        x.fill();
        x.restore();
      }
    }, 1.5);
  });
}
// 横に柔らかく広がる光の帯（夜明けの光が道を走る）
export function bandTexture() {
  return canvasTex('band', 128, 64, (x) => {
    const g = x.createLinearGradient(0, 0, 128, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.5, 'rgba(255,255,255,1)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, 128, 64);
    x.globalCompositeOperation = 'destination-in';
    const v = x.createLinearGradient(0, 0, 0, 64);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(0.2, 'rgba(0,0,0,1)');
    v.addColorStop(0.8, 'rgba(0,0,0,1)');
    v.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = v;
    x.fillRect(0, 0, 128, 64);
  });
}

// 素材を毎コマ並べ直す入れ物。get は (x,y) に置いた、縦を flat につぶした入れ物の中の絵を返す（絵は自由に回せる）
export class SpritePool {
  private items: { c: Container; s: Sprite }[] = [];
  private used = 0;
  root: Container;
  constructor(root: Container) {
    this.root = root;
  }
  begin() {
    this.used = 0;
  }
  get(tex: Texture, x: number, y: number, flat = 1) {
    let it = this.items[this.used];
    if (!it) {
      const c = new Container();
      const s = new Sprite(tex);
      s.anchor.set(0.5);
      c.addChild(s);
      this.root.addChild(c);
      it = this.items[this.used] = { c, s };
    }
    this.used++;
    it.c.visible = true;
    it.c.position.set(x, y);
    it.c.scale.set(1, flat);
    const s = it.s;
    s.texture = tex;
    s.rotation = 0;
    s.alpha = 1;
    s.tint = 0xffffff;
    return s;
  }
  // 光の玉（半径 r で見える大きさ）
  glow(x: number, y: number, r: number, color: number, alpha: number, flat = 1) {
    const s = this.get(glowTexture(), x, y, flat);
    s.width = s.height = r * 2.4;
    s.tint = color;
    s.alpha = alpha;
    return s;
  }
  // ぼけた輪（rx が輪の半径）
  ring(x: number, y: number, rx: number, color: number, alpha: number, flat = 1) {
    const s = this.get(ringTexture(), x, y, flat);
    s.width = s.height = (rx * 2) / 0.87;
    s.tint = color;
    s.alpha = alpha;
    return s;
  }
  end() {
    for (let i = this.used; i < this.items.length; i++) this.items[i].c.visible = false;
  }
}

export const PINK = [0xffc0d8, 0xffd6e4, 0xf8a8c4, 0xffe8f0];
export const NIGHT_PINK = [0xc89ab4, 0xb88aa8, 0xd8aec4, 0xa87c9c]; // 遠くの花びら：夜の色に沈めた桜色
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const SPRITE_TEX: Partial<Record<Kind, () => Texture>> = { glow: glowTexture, spark: streakTexture, ring: ringTexture, flare: flareTexture, dust: puffTexture, petal: petalTexture, bokeh: bokehTexture, flower: blossomTexture };
// 色を暗く（花びらの裏）
const darken = (c: number, k: number) => ((((c >> 16) & 255) * k) << 16) | ((((c >> 8) & 255) * k) << 8) | ((c & 255) * k);

export class Particles {
  root = new Container();
  light = new Container(); // 光るもの（加算）。root の中に置く。持ち主が別の所へ移してもよい
  private back = new Graphics(); // 弧の外側のにじみ
  private smokes = new Container(); // 煙・土煙（ふつうの重ね方）
  private g = new Graphics(); // 土くれ・薬莢
  private petals = new Container(); // 花びら・玉ボケ（素材の絵）
  private lightG = new Graphics(); // 斬撃の弧・速度線（加算）
  private glows = new Container(); // 光の玉・光の筋・輪・きらめき（加算）
  private ps: P[] = [];
  private pools: Partial<Record<Kind, Sprite[]>> = {};
  max = 900;
  avoid: { x: number; y: number; rx: number; ry: number } | null = null; // 玉ボケの花びらが透ける所（主人公の体。画面の座標）

  constructor() {
    this.light.blendMode = 'add';
    this.light.addChild(this.lightG, this.glows);
    this.root.addChild(this.smokes, this.back, this.petals, this.g, this.light);
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
      (q.kind === 'dust' ? this.smokes : q.kind === 'petal' || q.kind === 'bokeh' || q.kind === 'flower' ? this.petals : this.glows).addChild(s);
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
    this.add({ kind: 'petal', x, y, vx: vx * s, vy: vy * s, life, size: rnd(3, 5.5) * s, color: pick(colors), alpha, rot: rnd(0, 6.28), vr: rnd(-8, 8), g: 160 * s, drag: 2.2, tw: Math.random() < 0.2 ? 1 : 0 });
  }

  // 光る桜の花がぱっと開き、花びらにほどけて散る（矢が当たった所・桜嵐の締め）
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

  // 光の柱：幅 w・高さ h（下の端が y）。横は細りながら消える
  pillar(x: number, y: number, w: number, h: number, color: number, life: number, alpha = 1) {
    this.add({ kind: 'glow', x, y: y - h / 2, size: w, color, life, alpha, grow: -0.6, flat: h / w });
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

  // 花が花びらにほどける
  private burst(p: P) {
    for (let i = 0; i < 5; i++) {
      const a = p.rot - Math.PI / 2 + (i * Math.PI * 2) / 5;
      const s = p.size / 22;
      this.petal(p.x + Math.cos(a) * p.size * 0.5, p.y + Math.sin(a) * p.size * 0.5, s, Math.cos(a) * 160, Math.sin(a) * 160 - 60, rnd(0.6, 1));
    }
    this.ring(p.x, p.y, p.size * 0.3, p.size * 1.3, 2, 0xffc0d8, 0.25);
  }

  update(dt: number) {
    const keep: P[] = [];
    // 粒を進めているあいだに新しい粒を足すと、数が上限のとき一番古い粒が外されて絵が返されるのに、keep に残ってしまう
    // （次の draw で絵が無くて止まった。2026-10-06 アマネさん「第2ステージでフリーズ」）。足すのは進め終わってから
    const later: (() => void)[] = [];
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
      if (p.kind === 'petal') {
        p.x += Math.sin(p.t * 7 + p.rot) * 30 * dt; // ひらひら
        // 表がこちらを向いた一瞬、月の光にきらっと光る（5枚に1枚）
        if (p.tw && Math.abs(Math.cos(p.rot * 0.7)) > 0.97 && Math.random() < dt * 3) later.push(() => this.flare(p.x, p.y, p.size * 5, 0xfff0f6, 0.22));
      }
      if (p.kind === 'flower' && !p.done && p.t > p.life * 0.5) {
        // 花びらにほどけて散る
        p.done = true;
        later.push(() => this.burst(p));
      }
      if (p.kind === 'bokeh') p.y += Math.sin(p.t * 2.2 + p.rot) * 40 * dt; // ゆったり揺れる
      if (p.y > p.floor) {
        p.y = p.floor;
        p.vy *= -0.35;
        p.vx *= 0.6;
      }
      keep.push(p);
    }
    this.ps = keep;
    for (const f of later) f();
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
          // 裏を向くと（cos が負）少し暗い色になる
          const cr = Math.cos(p.rot * 0.7);
          const flip = Math.abs(cr);
          const s = p.sprite!;
          s.position.set(p.x, p.y);
          s.rotation = p.rot;
          s.tint = cr < 0 ? darken(p.color, 0.78) : p.color;
          s.alpha = p.alpha * Math.min(1, fade * 2.5);
          s.width = p.size * 2.3;
          s.height = p.size * 1.45 * (0.2 + flip * 0.8);
          break;
        }
        case 'flower': {
          // 最初の3割で開き（少し大きく行きすぎて戻る）、半ばで花びらにほどけ（update）、光だけが残って消える
          const open = q < 0.3 ? easeOut(q / 0.3) * 1.15 : 1.15 - 0.15 * Math.min(1, (q - 0.3) / 0.2);
          const s = p.sprite!;
          s.position.set(p.x, p.y);
          s.rotation = p.rot;
          s.tint = 0xffffff;
          s.alpha = q < 0.5 ? 1 : Math.max(0, 1 - (q - 0.5) / 0.5) ** 2;
          s.width = s.height = p.size * 2.7 * open * (q < 0.5 ? 1 : 1 + (q - 0.5) * 0.6);
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
          if (a <= 0.01) {
            p.sprite!.alpha = 0;
            break;
          }
          const flip = 0.45 + 0.55 * Math.abs(Math.cos(p.rot * 0.8));
          const s = p.sprite!;
          s.position.set(p.x, p.y);
          s.rotation = p.rot;
          s.tint = p.color;
          s.alpha = a * 1.2;
          s.width = p.size * 2.6;
          s.height = p.size * 1.9 * flip;
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
          s.width = p.size * (1 + p.grow * q);
          s.height = p.size * (1 + p.grow * q) * (p.flat ?? 1);
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
