// 赤ずきんの絵。ポーズの絵を技に合わせて差し替え、歩きだけ脚を切り絵で動かす（2026-10-03・アマネさん：
// アニメ的な差し替えと切り絵の組み合わせでよい。きれいな方がいい）。
// 絵は右向き。左を向くときは左右反転する。座標は元の絵の画素で組み、最後に縮める（tools/export-hero.py）。
import { Assets, Container, Sprite, type Texture } from 'pixi.js';
import type { Sim } from './sim';

type FrameName = 'idle' | 'up' | 'strike' | 'down' | 'back';
interface Fist { at: [number, number]; deg: number }
interface FrameMeta {
  size: [number, number];
  feet: [number, number];
  fists?: Fist[];
  legs?: Record<string, { hip: [number, number] }>;
}
interface Meta {
  scale: number;
  height: number;
  frames: Record<FrameName, FrameMeta> & Record<'knife' | 'bow', { size: [number, number]; pivot: [number, number] }>;
}

const BASE = `${import.meta.env.BASE_URL}hero/`;
const D = Math.PI / 180;
const NAMES: FrameName[] = ['idle', 'up', 'strike', 'down', 'back'];

export class HeroRig {
  root = new Container();
  private body = new Container(); // 揺らす・傾ける
  private frames = {} as Record<FrameName, Container>;
  private sprites: Sprite[] = []; // 光らせる対象
  private legs: Record<string, Sprite> = {};
  private held: { frame: FrameName; slot: number; knife: Sprite; bow: Sprite }[] = [];
  private meta!: Meta;
  private lastX = 0;
  private walkT = 0;
  ready = false;

  async load() {
    this.meta = await (await fetch(`${BASE}frames.json`)).json();
    const files = [...NAMES, 'legL', 'legR', 'knife', 'bow'];
    const tex = (await Assets.load(files.map((n) => ({ alias: `hero-${n}`, src: `${BASE}${n}.png` })))) as Record<string, Texture>;
    const s = this.meta.scale;
    const sprite = (n: string) => {
      const sp = new Sprite(tex[`hero-${n}`]);
      sp.scale.set(1 / s); // 元の絵の画素の大きさに戻す
      return sp;
    };
    const gear = (n: 'knife' | 'bow') => {
      const g = this.meta.frames[n];
      const sp = new Sprite(tex[`hero-${n}`]);
      sp.anchor.set(g.pivot[0], g.pivot[1]);
      sp.scale.set(g.size[0] / sp.texture.width);
      return sp;
    };

    for (const name of NAMES) {
      const m = this.meta.frames[name];
      const c = new Container();
      c.pivot.set(m.feet[0], m.feet[1]); // 足もとを原点に
      // 歩きの脚（構えの絵だけ）。胴の後ろ。太ももの上はスカートに隠れる
      if (m.legs) {
        for (const [leg, { hip }] of Object.entries(m.legs)) {
          const sp = sprite(leg);
          // 脚の絵は胴と同じ枠で書き出してあるので、股の関節を中心に回せるよう置き直す
          sp.pivot.set(hip[0] * s, hip[1] * s);
          sp.position.set(hip[0], hip[1]);
          this.legs[leg] = sp;
          c.addChild(sp);
          this.sprites.push(sp);
        }
      }
      // 二刀流のナイフ（拳の後ろに差し込む。指が柄を隠す）。遠の構えでは突き出した手に弓
      (m.fists ?? []).forEach((f, slot) => {
        const knife = gear('knife');
        const bow = gear('bow');
        for (const g of [knife, bow]) {
          g.position.set(f.at[0], f.at[1]);
          c.addChild(g);
        }
        knife.rotation = f.deg * D;
        bow.visible = false;
        this.held.push({ frame: name, slot, knife, bow });
      });
      const body = sprite(name);
      c.addChild(body);
      this.sprites.push(body);
      c.visible = false;
      this.frames[name] = c;
      this.body.addChild(c);
    }
    this.root.addChild(this.body);
    this.ready = true;
  }

  // 主人公の状態から絵と姿勢を決める。x, y は足もとの画面の座標、height は画面での背の高さ
  update(sim: Sim, x: number, y: number, height: number) {
    if (!this.ready) return;
    const h = sim.hero;
    const k = height / this.meta.height;
    this.root.position.set(x, y);
    this.root.scale.set(h.facing * k, k); // 絵は右向き

    let frame: FrameName = 'idle';
    let lean = 0;
    let lift = 0;
    let squash = 1; // 回転のときの横幅
    const far = sim.stance === 'far';

    // 歩き：脚を交互に、体を上下に
    const moved = Math.abs(h.x - this.lastX);
    this.lastX = h.x;
    const walking = moved > 0.05 && !h.move && h.down <= 0;
    if (walking) {
      this.walkT += moved * 0.07;
      lift = Math.abs(Math.sin(this.walkT)) * 18;
      lean = 4 * D;
    } else {
      lift = Math.sin(sim.clock * 3) * 4; // 息づかい
    }
    this.legs.legL && (this.legs.legL.rotation = walking ? Math.sin(this.walkT) * 13 * D : 0);
    this.legs.legR && (this.legs.legR.rotation = walking ? -Math.sin(this.walkT) * 13 * D : 0);

    // 技：途中で絵を差し替える。p は技の進み（0〜1）
    const m = h.move;
    if (m) {
      const dur = { slash: 0.2, launch: 0.28, air: 0.2, slam: 0.32, shiki: 0.45, kaiten: 0.4, tosshin: 0.3, bow: 0.42, ame: 0.6, hougeki: 0.7 }[m];
      const p = Math.min(1, h.moveT / dur);
      if (m === 'slash') frame = p < 0.4 ? 'idle' : 'strike';
      if (m === 'launch') { frame = p < 0.35 ? 'idle' : 'up'; lift = p * 40; }
      if (m === 'air') { frame = 'up'; lift = 50; }
      if (m === 'slam') { frame = p < 0.4 ? 'up' : 'strike'; lean = p < 0.4 ? -4 * D : 12 * D; }
      if (m === 'tosshin') { frame = 'strike'; lean = 14 * D; }
      if (m === 'shiki' || m === 'hougeki') { frame = 'strike'; lean = -6 * D; }
      if (m === 'bow' || m === 'ame') frame = 'strike';
      if (m === 'kaiten') {
        // 回転：横幅を縮めて背中の絵へ、また縮めて正面へ
        const a = p * Math.PI * 2;
        squash = Math.abs(Math.cos(a));
        frame = Math.cos(a) < 0 ? 'back' : 'idle';
      }
    }
    if (far && !m) frame = 'idle';
    if (h.ouran > 0) frame = (['idle', 'up', 'strike'] as FrameName[])[Math.floor(sim.clock * 14) % 3];
    if (h.stun > 0 && !m) lean = -10 * D; // ひるみ：のけぞる
    if (h.down > 0) { frame = 'down'; lean = 0; lift = 0; }

    for (const n of NAMES) this.frames[n].visible = n === frame;
    // 遠の構え：突き出した手（strike の1つ目の拳）に弓、ナイフは隠す
    for (const hd of this.held) {
      const bowHand = far && hd.frame === 'strike' && hd.slot === 0;
      hd.bow.visible = bowHand;
      hd.knife.visible = !bowHand;
    }
    this.body.rotation = lean;
    this.body.position.set(0, -lift);
    this.body.scale.set(squash, 1);
    const tint = h.hitFlash > 0 ? 0xff8888 : h.ouran > 0 ? (Math.floor(sim.clock * 20) % 2 ? 0xffe6a0 : 0xffffff) : 0xffffff;
    for (const sp of this.sprites) sp.tint = tint;
  }
}
