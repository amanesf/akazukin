// 赤ずきんの切り絵アニメ。生成した真横の1枚を部品に切ったもの（tools/rig-hero.py）を、関節で動かす。
// 絵は左向きなので、右を向くときは左右反転する。座標は元の絵（side.png）の画素で組み、最後に縮める。
import { Assets, Container, Sprite, type Texture } from 'pixi.js';
import type { Sim } from './sim';

interface Part { x: number; y: number; w: number; h: number; pivot: [number, number] }
interface Gear { w: number; h: number; pivot: [number, number] }
interface Rig { size: [number, number]; scale: number; feet: [number, number]; parts: Record<string, Part>; gear: Record<string, Gear> }

const BASE = `${import.meta.env.BASE_URL}hero/`;
const D = Math.PI / 180;
const HAND: [number, number] = [255, 905]; // 手のひらの位置（元の絵の画素）
const SHOULDER_BACK: [number, number] = [335, 610]; // 背中の砲を付ける所
const ease = (p: number) => 1 - (1 - p) ** 3;
const lerp = (a: number, b: number, p: number) => a + (b - a) * p;

export class HeroRig {
  root = new Container();
  private body = new Container(); // 揺らす・傾ける
  private parts: Record<string, Sprite> = {};
  private arm = new Container();
  private cannon = new Container();
  private knife!: Sprite;
  private bow!: Sprite;
  private rig!: Rig;
  private lastX = 0;
  private walkT = 0;
  ready = false;

  async load() {
    this.rig = await (await fetch(`${BASE}rig.json`)).json();
    const names = [...Object.keys(this.rig.parts), ...Object.keys(this.rig.gear)];
    const tex: Record<string, Texture> = await Assets.load(names.map((n) => ({ alias: `hero-${n}`, src: `${BASE}${n}.png` }))) as Record<string, Texture>;
    const t = (n: string) => tex[`hero-${n}`];
    const [fx, fy] = this.rig.feet;
    const s = this.rig.scale;

    // 部品：元の絵の座標で関節に置く（足もとが原点）
    const place = (name: string) => {
      const p = this.rig.parts[name];
      const sp = new Sprite(t(name));
      sp.pivot.set((p.pivot[0] - p.x) * s, (p.pivot[1] - p.y) * s);
      sp.scale.set(1 / s);
      sp.position.set(p.pivot[0] - fx, p.pivot[1] - fy);
      this.parts[name] = sp;
      return sp;
    };
    const gear = (name: string) => {
      const g = this.rig.gear[name];
      const sp = new Sprite(t(name));
      sp.anchor.set(g.pivot[0], g.pivot[1]);
      sp.scale.set(g.w / sp.texture.width);
      return sp;
    };

    // 背中の砲（胴の後ろ）。絵は砲身が下向き
    const cannon = gear('cannon');
    this.cannon.addChild(cannon);
    this.cannon.position.set(SHOULDER_BACK[0] - fx, SHOULDER_BACK[1] - fy);
    const quiver = gear('quiver');
    quiver.position.set(360 - fx, 560 - fy);
    quiver.rotation = 25 * D;

    // 手前の腕と、手に持つもの（近：ナイフ／遠：弓）
    const arm = place('arm');
    const ap = this.rig.parts.arm.pivot;
    this.arm.position.set(ap[0] - fx, ap[1] - fy);
    arm.position.set(0, 0);
    this.knife = gear('knife');
    this.knife.position.set(HAND[0] - ap[0], HAND[1] - ap[1]);
    this.knife.rotation = -100 * D; // 刃を前（絵では左）へ
    this.bow = gear('bow');
    this.bow.position.set(HAND[0] - ap[0], HAND[1] - ap[1]);
    this.arm.addChild(this.knife, this.bow, arm);

    this.body.addChild(quiver, this.cannon, place('legs'), place('torso'), place('head'), this.arm);
    this.root.addChild(this.body);
    this.ready = true;
  }

  // 主人公の状態から姿勢を決める。x, y は足もとの画面の座標、height は画面での背の高さ
  update(sim: Sim, x: number, y: number, height: number) {
    if (!this.ready) return;
    const h = sim.hero;
    const k = height / this.rig.size[1];
    this.root.position.set(x, y);
    this.root.scale.set(-h.facing * k, k); // 絵は左向き。右を向くときは反転
    const P = this.parts;
    const far = sim.stance === 'far';
    this.knife.visible = !far;
    this.bow.visible = far;

    // 既定の姿勢
    let armR = 8 * D;
    let lean = 0;
    let lift = 0;
    let cannonR = 0;
    let headR = 0;
    let legsR = 0;
    let spin = 0;

    // 歩き：脚を交互に、体を上下に
    const moved = Math.abs(h.x - this.lastX);
    this.lastX = h.x;
    if (moved > 0.05 && !h.move) {
      this.walkT += moved * 0.06;
      legsR = Math.sin(this.walkT) * 10 * D;
      lift = Math.abs(Math.sin(this.walkT)) * 30;
      lean = 6 * D;
      armR = Math.sin(this.walkT) * 25 * D;
    } else {
      lift = Math.sin(sim.clock * 3) * 6; // 息づかい
    }

    // 技ごとの振り（腕は下向きが0度、前＝絵の左へ振ると正）
    const m = h.move;
    if (m) {
      const p = ease(Math.min(1, h.moveT / ({ slash: 0.2, launch: 0.28, air: 0.2, slam: 0.32, shiki: 0.45, kaiten: 0.4, tosshin: 0.3, bow: 0.42, ame: 0.6, hougeki: 0.7 }[m])));
      if (m === 'slash') { armR = lerp(-60, 115, p) * D; lean = 8 * D; }
      if (m === 'launch') { armR = lerp(-30, 190, p) * D; lift = p * 60; lean = -6 * D; }
      if (m === 'air') { armR = lerp(70, 175, p) * D; lift = 80; }
      if (m === 'slam') { armR = lerp(200, 40, p) * D; lean = 18 * D * p; lift = (1 - p) * 90; }
      if (m === 'kaiten') { spin = p * 360 * D; armR = 95 * D; }
      if (m === 'tosshin') { armR = 100 * D; lean = 22 * D; }
      if (m === 'shiki' || m === 'hougeki') { cannonR = lerp(0, 135, Math.min(1, p * 2)) * D; armR = 30 * D; lean = -8 * D; }
      if (m === 'bow' || m === 'ame') { armR = 90 * D; headR = -4 * D; }
    }
    if (far && !m) armR = 70 * D; // 遠：弓を前に構える
    if (h.ouran > 0) { cannonR = 135 * D; armR = (sim.clock * 1400 % 360) * D; spin = (sim.clock * 900 % 360) * D; }

    // 倒れている
    if (h.down > 0) {
      this.body.rotation = -85 * D;
      this.body.position.set(0, 0);
      this.tint(0x998888);
      return;
    }

    this.arm.rotation = armR;
    this.bow.rotation = -armR; // 弓は腕を上げても縦のまま
    this.cannon.rotation = cannonR;
    P.head.rotation = headR;
    P.legs.rotation = legsR;
    this.body.rotation = lean + spin;
    this.body.position.set(0, -lift);
    this.tint(h.hitFlash > 0 ? 0xff9999 : h.ouran > 0 ? (Math.floor(sim.clock * 20) % 2 ? 0xffe6a0 : 0xffffff) : 0xffffff);
  }

  private tint(c: number) {
    for (const sp of Object.values(this.parts)) sp.tint = c;
  }
}
