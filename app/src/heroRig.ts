// 赤ずきんの絵。ポーズの絵を技に合わせて差し替え、歩きだけ脚を切り絵で動かす（2026-10-03・アマネさん：
// アニメ的な差し替えと切り絵の組み合わせでよい。きれいな方がいい）。
// 絵は右向き。左を向くときは左右反転する。座標は元の絵の画素で組み、最後に縮める（tools/export-hero.py）。
import { Assets, Container, Graphics, Rectangle, Sprite, Texture } from 'pixi.js';
import type { Sim } from './sim';

type FrameName = 'idle' | 'up' | 'strike' | 'down' | 'back';
interface Fist { at: [number, number]; hand: [number, number]; deg: number; front?: boolean } // at＝ナイフの握り、hand＝拳の真ん中
interface FrameMeta {
  size: [number, number];
  feet: [number, number];
  fists?: Fist[];
  legs?: Record<string, { hip: [number, number] }>;
}
interface Meta {
  scale: number;
  height: number;
  frames: Record<FrameName, FrameMeta> & Record<'knife' | 'bow', { size: [number, number]; pivot: [number, number]; guard?: number; cams?: [number, number][] }>;
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
  private held: { frame: FrameName; slot: number; knife: Sprite }[] = [];
  // 弓（遠の構えの突きの絵だけ）：前の手で握り、胸の手で弦を引く。弦と矢は線で描く
  private bow!: Sprite;
  private bowLines = new Graphics();
  private bowGeo!: { cams: [number, number][]; nock: [number, number]; rest: [number, number] };
  private meta!: Meta;
  private lastX = 0;
  private walkT = 0;
  private lastFrame: FrameName = 'idle';
  private pop = 0; // ポーズが変わった瞬間の弾み（1→0）
  private lastClock = 0;
  ready = false;

  async load() {
    this.meta = await (await fetch(`${BASE}frames.json`)).json();
    const files = [...NAMES, 'legL', 'legR', 'knife', 'bow'];
    const tex = (await Assets.load(files.map((n) => ({ alias: `hero-${n}`, src: `${BASE}${n}.webp` })))) as Record<string, Texture>;
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
      const front: Sprite[] = [];
      (m.fists ?? []).forEach((f, slot) => {
        if (f.front) {
          // 拳が胴の前：裏に差すと刃ごと隠れるので、鍔から先の刃だけを胴の前に描く（柄は拳が隠す）
          const blade = this.blade();
          blade.position.set(f.at[0], f.at[1]);
          blade.rotation = f.deg * D;
          front.push(blade);
          this.held.push({ frame: name, slot, knife: blade });
          return;
        }
        const knife = gear('knife');
        knife.position.set(f.at[0], f.at[1]);
        c.addChild(knife);
        knife.rotation = f.deg * D;
        this.held.push({ frame: name, slot, knife });
      });
      if (name === 'strike' && m.fists) {
        // 弓は前の拳の真ん中で握り、矢は胸の拳（弦を引く手）から前の拳の上を通る
        const [grip, draw] = [m.fists[0].hand, m.fists[1].hand];
        const len = Math.hypot(grip[0] - draw[0], grip[1] - draw[1]);
        const dir: [number, number] = [(grip[0] - draw[0]) / len, (grip[1] - draw[1]) / len];
        const up: [number, number] = [dir[1], -dir[0]];
        // 矢に直角だと前へ倒れすぎて見える（突きの絵は前の手が低い）ので、傾きは半分にとどめる
        const rot = Math.atan2(dir[1], dir[0]) * 0.5;
        this.bow = gear('bow');
        this.bow.position.set(grip[0], grip[1]);
        this.bow.rotation = rot;
        this.bow.visible = false;
        c.addChild(this.bow);
        const cams = (this.meta.frames.bow.cams ?? []).map(([x, y]) => [grip[0] + x * Math.cos(rot) - y * Math.sin(rot), grip[1] + x * Math.sin(rot) + y * Math.cos(rot)] as [number, number]);
        this.bowGeo = { cams, nock: draw, rest: [grip[0] + up[0] * 28, grip[1] + up[1] * 28] };
      }
      const body = sprite(name);
      c.addChild(body);
      this.sprites.push(body);
      for (const b of front) c.addChild(b);
      if (name === 'strike') c.addChild(this.bowLines); // 弦と矢は胴と拳の前
      c.visible = false;
      this.frames[name] = c;
      this.body.addChild(c);
    }
    this.root.addChild(this.body);
    this.ready = true;
  }

  // ナイフの鍔から先だけの絵。握る所（pivot）は同じなので、置き方は拳の後ろのナイフと同じ
  private blade() {
    const g = this.meta.frames.knife;
    const t = Assets.get<Texture>('hero-knife');
    const h = Math.round(t.height * (g.guard ?? 0.68));
    const sp = new Sprite(new Texture({ source: t.source, frame: new Rectangle(t.frame.x, t.frame.y, t.width, h) }));
    sp.anchor.set(g.pivot[0], (g.pivot[1] * t.height) / h);
    sp.scale.set(g.size[0] / t.width);
    return sp;
  }

  // 弦と矢。p は技の進み：半ばで放つ（sim と同じ）。それまで弦を引き、矢をつがえる。放したあとは弦がまっすぐ
  private drawBow(show: boolean, p: number) {
    const g = this.bowLines;
    g.clear();
    if (!show || this.bowGeo.cams.length < 2) return;
    const { cams, nock, rest } = this.bowGeo;
    const mid: [number, number] = [(cams[0][0] + cams[1][0]) / 2, (cams[0][1] + cams[1][1]) / 2];
    const pull = p < 0.5 ? Math.min(1, 0.25 + p / 0.3) : 0;
    const n: [number, number] = [mid[0] + (nock[0] - mid[0]) * pull, mid[1] + (nock[1] - mid[1]) * pull];
    const line = (pts: [number, number][], w: number, color: number) => {
      g.moveTo(pts[0][0], pts[0][1]);
      for (const q of pts.slice(1)) g.lineTo(q[0], q[1]);
      g.stroke({ width: w, color, cap: 'round', join: 'round' });
    };
    // 弦（絵の線に合わせて縁取りを濃く）
    line([cams[0], n, cams[1]], 7, 0x3a2228);
    line([cams[0], n, cams[1]], 3.5, 0xe0b080);
    if (pull <= 0) return;
    // 矢：つがえた所から、前の拳の上（rest）を通って先へ
    const reach = Math.hypot(rest[0] - n[0], rest[1] - n[1]) + 70;
    const a = Math.atan2(rest[1] - n[1], rest[0] - n[0]);
    const [cx, cy] = [Math.cos(a), Math.sin(a)];
    const tip: [number, number] = [n[0] + cx * reach, n[1] + cy * reach];
    line([n, tip], 9, 0x2a1a20);
    line([n, tip], 5, 0x9a6a44);
    // 矢じり
    const hx = tip[0] + cx * 30, hy = tip[1] + cy * 30;
    g.poly([hx, hy, tip[0] - cy * 11, tip[1] + cx * 11, tip[0] + cy * 11, tip[1] - cx * 11]).fill(0xc8ccd6).stroke({ width: 2.5, color: 0x2a1a20, join: 'round' });
    // 矢羽（つがえた所の少し前に上下2枚）
    for (const sgn of [1, -1]) {
      const b0: [number, number] = [n[0] + cx * 8, n[1] + cy * 8];
      const b1: [number, number] = [n[0] + cx * 44, n[1] + cy * 44];
      const o = 13 * sgn;
      g.poly([b0[0], b0[1], b1[0], b1[1], b1[0] - cy * o * 0.3 - cx * 4, b1[1] + cx * o * 0.3 - cy * 4, b0[0] - cy * o, b0[1] + cx * o]).fill(0xf2e4e8).stroke({ width: 2.5, color: 0x2a1a20, join: 'round' });
    }
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
    let shot = 1; // 弓を射る技の進み（1＝射ていない）

    // 歩き：脚を交互に、体を上下に
    const moved = Math.abs(h.x - this.lastX);
    this.lastX = h.x;
    const walking = moved > 0.05 && !h.move && h.down <= 0;
    let breath = 0;
    if (walking) {
      this.walkT += moved * 0.07;
      lift = Math.abs(Math.sin(this.walkT)) * 22;
      lean = 4 * D;
    } else {
      breath = Math.sin(sim.clock * 3.2); // 息づかい：上下に動かさず、ふくらむ・しぼむ
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
      if (m === 'bow' || m === 'ame') { frame = 'strike'; shot = p; }
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
    // 遠の構え：突きの絵の前の手に弓、胸の手は弦を引く。両手のナイフは隠す
    const archer = far && frame === 'strike';
    for (const hd of this.held) hd.knife.visible = !(far && hd.frame === 'strike');
    this.bow.visible = archer;
    this.drawBow(archer, shot);
    // 弾み（スクワッシュ＆ストレッチ）：ポーズが変わった瞬間に一度つぶれて伸び戻る。
    // 絵の差し替えだけだとカクッと切り替わって硬く見える（2026-10-04 アマネさん「かわいさ感じない」）
    const dt = Math.max(0, Math.min(0.1, sim.clock - this.lastClock));
    this.lastClock = sim.clock;
    if (frame !== this.lastFrame && frame !== 'down' && m !== 'kaiten') this.pop = 1;
    this.lastFrame = frame;
    this.pop = Math.max(0, this.pop - dt / 0.16);
    const bounce = Math.sin(this.pop * Math.PI) * 0.09;
    // 歩き：足が着くたびに少しつぶれ、跳ねる頂点で少し伸びる
    const step = walking ? (Math.abs(Math.sin(this.walkT)) - 0.5) * 0.05 : 0;
    const sy = 1 - bounce + step + breath * 0.012;
    const sx = 1 + bounce * 0.8 - step * 0.6 - breath * 0.006;
    this.body.rotation = lean;
    this.body.position.set(0, -lift);
    this.body.scale.set(squash * sx, sy);
    const tint = h.hitFlash > 0 ? 0xff8888 : h.ouran > 0 ? (Math.floor(sim.clock * 20) % 2 ? 0xffe6a0 : 0xffffff) : 0xffffff;
    for (const sp of this.sprites) sp.tint = tint;
  }
}
