// 狼・番犬の絵（2026-10-04 生成 wolves-v1・dogs-house-v1。tools/export-units.py で書き出し）。
// 箱の代わりに絵を置く。動きは伸び縮みさせず、位置・傾き・色で見せる（主人公と同じ。伸び縮みは気持ち悪かった）
import { Assets, Container, Sprite, Texture } from 'pixi.js';
import type { DogKind, WolfKind } from './config';

// 画面での高さ（ふつうの狼・秋田を1）。ゲームの大きさ（WOLVES.size・DOGS.size）に合わせる。絵の大狼は小さめに描かれた
export const WOLF_REL: Record<WolfKind, number> = { pup: 0.62, wolf: 1, armored: 1.2, howler: 1.2, alpha: 2.1, wman: 1.75, wwoman: 1.65, crow: 0.55, king: 3.4 };
export const DOG_REL: Record<DogKind, number> = { shiba: 0.7, akita: 1, tosa: 1.2 };
// 犬の絵の、なでる所（頭のてっぺん。耳と耳のあいだ）の高さ（足もとからの背の高さの割合。絵の画素で測った）
export const DOG_CROWN: Record<DogKind, number> = { shiba: 0.92, akita: 0.935, tosa: 0.98 };

interface Meta { size: [number, number]; feet: [number, number]; h?: number }

export class UnitArt<K extends string> {
  ready = false;
  tex = {} as Record<K, Texture>;
  meta = {} as Record<K, Meta>;
  private pools: { root: Container; used: number }[];
  private rims: { root: Container; used: number }[] = [];
  // 月明かりの縁取り（リムライト）：同じ絵を紅く光らせて、月のある右上へ少しずらして体の後ろに置く。0 で消す
  static rimK = 0;
  static rimOff = 3;
  private dir: string;
  private kinds: K[];

  constructor(dir: string, kinds: K[], back: Container, front: Container, rims?: [Container, Container]) {
    this.dir = `${import.meta.env.BASE_URL}${dir}/`;
    this.kinds = kinds;
    this.pools = [back, front].map((root) => ({ root, used: 0 }));
    if (rims) {
      this.rims = rims.map((root) => ({ root, used: 0 }));
      for (const r of rims) r.blendMode = 'add';
    }
  }

  // 毛の色を付けた絵（グラデーションマップ）。掛け算で色を重ねると暗い所が沈むので、絵の明るさで色を引き当てる。
  // 赤い目・裂け目など色の濃い所はそのまま残す。初めて使うときに作って取っておく
  private dyed = new Map<string, Texture>();
  dye(kind: K, fur: [number, number, number]): Texture {
    const key = `${kind}:${fur.join(',')}`;
    const hit = this.dyed.get(key);
    if (hit) return hit;
    const src = this.tex[kind];
    const res = src.source.resource as CanvasImageSource & { width: number; height: number };
    const w = src.source.pixelWidth;
    const h = src.source.pixelHeight;
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const ctx = cv.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(res, 0, 0, w, h);
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    // 明るさを広げる（毛は中ほどの明るさに集まっている）：不透明な所の明るさの 3%〜97% を 0〜1 に
    const hist = new Uint32Array(256);
    let total = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 128) continue;
      hist[Math.round(d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114)]++;
      total++;
    }
    const pct = (p: number) => { let n = 0; for (let v = 0; v < 256; v++) { n += hist[v]; if (n >= total * p) return v; } return 255; };
    const lo = pct(0.03);
    const hi = Math.max(lo + 1, pct(0.97));
    const st = fur.map((c) => [(c >> 16) & 255, (c >> 8) & 255, c & 255]);
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] === 0) continue;
      const r = d[i], g = d[i + 1], b = d[i + 2];
      const mx = Math.max(r, g, b);
      const sat = mx ? (mx - Math.min(r, g, b)) / mx : 0;
      const keep = Math.min(1, Math.max(0, (sat - 0.25) / 0.25));
      const L = Math.min(1, Math.max(0, ((r * 0.299 + g * 0.587 + b * 0.114) - lo) / (hi - lo)));
      const [a0, a1, k] = L < 0.5 ? [st[0], st[1], L / 0.5] : [st[1], st[2], (L - 0.5) / 0.5];
      for (let j = 0; j < 3; j++) {
        const o = d[i + j];
        const gm = (a0[j] + (a1[j] - a0[j]) * k) * 0.85 + o * 0.15;
        d[i + j] = gm * (1 - keep) + o * keep;
      }
    }
    ctx.putImageData(img, 0, 0);
    const t = Texture.from(cv);
    this.dyed.set(key, t);
    return t;
  }

  async load(extra: string[] = []) {
    this.meta = await (await fetch(`${this.dir}meta.json`)).json();
    const names = [...this.kinds, ...extra];
    const t = (await Assets.load(names.map((k) => ({ alias: `${this.dir}${k}`, src: `${this.dir}${k}.webp` })))) as Record<string, Texture>;
    for (const k of names) (this.tex as Record<string, Texture>)[k] = t[`${this.dir}${k}`];
    this.ready = true;
  }

  begin() {
    for (const p of [...this.pools, ...this.rims]) p.used = 0;
  }

  end() {
    for (const p of [...this.pools, ...this.rims]) for (let i = p.used; i < p.root.children.length; i++) p.root.children[i].visible = false;
  }

  // layer：0＝主人公より奥・1＝手前。x, y は体の真ん中（回るときの中心）、height は画面での背の高さ
  // fur：毛の色（dye）。glow：縁取りの色（色の狼は、月明かりの縁取りの代わりに同じ色でまわりを光らせる。昼でも消さない）
  put(layer: 0 | 1, kind: K, x: number, y: number, height: number, rot: number, scale: number, tint: number, alpha: number, flip = false, fur?: [number, number, number], glow?: number) {
    const p = this.pools[layer];
    let sp = p.root.children[p.used] as Sprite | undefined;
    if (!sp) {
      sp = new Sprite();
      p.root.addChild(sp);
    }
    p.used++;
    const m = this.meta[kind];
    sp.texture = fur ? this.dye(kind, fur) : this.tex[kind];
    sp.anchor.set(m.feet[0] / m.size[0], (m.feet[1] * 0.55) / m.size[1]); // 足もとの真上、背の高さの半ばあたり
    const k = (height / m.feet[1]) * scale;
    sp.scale.set(flip ? -k : k, k);
    sp.position.set(x, y);
    sp.rotation = rot;
    sp.tint = tint;
    sp.alpha = alpha;
    sp.visible = true;
    const rp = this.rims[layer];
    if (!rp || (UnitArt.rimK <= 0 && glow === undefined)) return;
    let r = rp.root.children[rp.used] as Sprite | undefined;
    if (!r) {
      r = new Sprite();
      rp.root.addChild(r);
    }
    rp.used++;
    r.texture = sp.texture;
    r.anchor.copyFrom(sp.anchor);
    r.rotation = rot;
    if (glow !== undefined) {
      // 少し大きくした同じ絵を、その色で後ろに光らせる（縁取り）
      r.texture = this.tex[kind];
      r.scale.set(sp.scale.x * 1.08, sp.scale.y * 1.06);
      r.position.set(x, y + height * 0.01);
      r.tint = glow;
      r.alpha = alpha * (0.75 + 0.25 * UnitArt.rimK);
    } else {
      r.scale.copyFrom(sp.scale);
      r.position.set(x + UnitArt.rimOff, y - UnitArt.rimOff);
      r.tint = 0xff4060;
      r.alpha = alpha * UnitArt.rimK;
    }
    r.visible = true;
  }

  // 体の真ん中は足もとからどれだけ上か（put の y を決める）
  center(height: number) {
    return height * 0.45;
  }
}
