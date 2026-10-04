// 狼・番犬の絵（2026-10-04 生成 wolves-v1・dogs-house-v1。tools/export-units.py で書き出し）。
// 箱の代わりに絵を置く。動きは伸び縮みさせず、位置・傾き・色で見せる（主人公と同じ。伸び縮みは気持ち悪かった）
import { Assets, Container, Sprite, Texture } from 'pixi.js';
import type { DogKind, WolfKind } from './config';

// 画面での高さ（ふつうの狼・秋田を1）。ゲームの大きさ（WOLVES.size・DOGS.size）に合わせる。絵の大狼は小さめに描かれた
export const WOLF_REL: Record<WolfKind, number> = { pup: 0.62, wolf: 1, armored: 1.2, howler: 1.2, alpha: 2.1 };
export const DOG_REL: Record<DogKind, number> = { shiba: 0.7, akita: 1, tosa: 1.2 };

interface Meta { size: [number, number]; feet: [number, number] }

export class UnitArt<K extends string> {
  ready = false;
  tex = {} as Record<K, Texture>;
  meta = {} as Record<K, Meta>;
  private pools: { root: Container; used: number }[];
  private dir: string;
  private kinds: K[];

  constructor(dir: string, kinds: K[], back: Container, front: Container) {
    this.dir = `${import.meta.env.BASE_URL}${dir}/`;
    this.kinds = kinds;
    this.pools = [back, front].map((root) => ({ root, used: 0 }));
  }

  async load(extra: string[] = []) {
    this.meta = await (await fetch(`${this.dir}meta.json`)).json();
    const names = [...this.kinds, ...extra];
    const t = (await Assets.load(names.map((k) => ({ alias: `${this.dir}${k}`, src: `${this.dir}${k}.webp` })))) as Record<string, Texture>;
    for (const k of names) (this.tex as Record<string, Texture>)[k] = t[`${this.dir}${k}`];
    this.ready = true;
  }

  begin() {
    for (const p of this.pools) p.used = 0;
  }

  end() {
    for (const p of this.pools) for (let i = p.used; i < p.root.children.length; i++) p.root.children[i].visible = false;
  }

  // layer：0＝主人公より奥・1＝手前。x, y は体の真ん中（回るときの中心）、height は画面での背の高さ
  put(layer: 0 | 1, kind: K, x: number, y: number, height: number, rot: number, scale: number, tint: number, alpha: number) {
    const p = this.pools[layer];
    let sp = p.root.children[p.used] as Sprite | undefined;
    if (!sp) {
      sp = new Sprite();
      p.root.addChild(sp);
    }
    p.used++;
    const m = this.meta[kind];
    sp.texture = this.tex[kind];
    sp.anchor.set(m.feet[0] / m.size[0], (m.feet[1] * 0.55) / m.size[1]); // 足もとの真上、背の高さの半ばあたり
    const k = (height / m.feet[1]) * scale;
    sp.scale.set(k);
    sp.position.set(x, y);
    sp.rotation = rot;
    sp.tint = tint;
    sp.alpha = alpha;
    sp.visible = true;
  }

  // 体の真ん中は足もとからどれだけ上か（put の y を決める）
  center(height: number) {
    return height * 0.45;
  }
}
