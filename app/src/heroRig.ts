// 赤ずきんの絵。ポーズの絵を技に合わせて差し替え、歩きだけ脚を切り絵で動かす（2026-10-03・アマネさん：
// アニメ的な差し替えと切り絵の組み合わせでよい。きれいな方がいい）。
// 絵は右向き。左を向くときは左右反転する。座標は元の絵の画素で組み、最後に縮める（tools/export-hero.py）。
import { Assets, Container, Graphics, MeshPlane, Rectangle, Sprite, Texture } from 'pixi.js';
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

// 揺れもの（2026-10-04 レビュー A1）：ポーズの絵を細かい網目に貼り、しっぽ・スカートの裾・フードの耳の網目だけをバネで遅れて動かす。
// 部品に切り分けないので継ぎ目は出ない。顔・手・ブーツは動かさない。座標は書き出した絵（webp）の画素
interface Sway {
  tail?: { at: [number, number]; len: number; top: number; bot: number }; // しっぽ：体から出る所を中心に回す。at より左（しっぽの先の側）で、top〜bot の帯の中だけ
  skirt?: { waist: number; hem: number; legs: boolean }; // 裾：腰から下ほど横へずらす。legs＝裾の下に脚が描いてある絵（裾の下ですぐ0に戻す）
  ears?: [number, number][]; // 耳の付け根。そこから上を回す
}
const SWAY: Partial<Record<FrameName, Sway>> = {
  idle: { tail: { at: [180, 455], len: 110, top: 400, bot: 560 }, skirt: { waist: 400, hem: 690, legs: false }, ears: [[252, 108], [342, 112]] },
  strike: { tail: { at: [115, 445], len: 100, top: 360, bot: 500 }, skirt: { waist: 365, hem: 640, legs: true }, ears: [[240, 62], [330, 70]] },
  up: { tail: { at: [115, 480], len: 100, top: 405, bot: 545 }, skirt: { waist: 400, hem: 690, legs: true }, ears: [[190, 112], [285, 114]] },
};
const EAR_R = 52;
const MESH_STEP = 12; // 網目の細かさ（画素）

const BASE = `${import.meta.env.BASE_URL}hero/`;
const D = Math.PI / 180;
const NAMES: FrameName[] = ['idle', 'up', 'strike', 'down', 'back'];

export class HeroRig {
  root = new Container();
  private body = new Container(); // 揺らす・傾ける
  private frames = {} as Record<FrameName, Container>;
  private sprites: (Sprite | MeshPlane)[] = []; // 光らせる対象
  private meshes: Partial<Record<FrameName, { mesh: MeshPlane; base: Float32Array; sway: Sway; key: string }>> = {};
  // 揺れもののバネ（値と速さ）。しっぽは角度、裾は横のずれ（画素）、耳は角度
  private spring = { tail: 0, tailV: 0, skirt: 0, skirtV: 0, ear0: 0, ear0V: 0, ear1: 0, ear1V: 0 };
  private lastX = NaN;
  private lastLean = 0;
  private lastLift = 0;
  private twitchT = 2;
  // 待機の性格（A2）：じっとしている時間・ナイフを回す・振り返る
  private idleFor = 0;
  private twirl = -1; // ナイフを回す進み（0〜1。-1 は回していない）
  private twirlNext = 2.5;
  private look = -1; // 振り返りの進み（0〜1）
  private lookNext = 5;
  // 技ごとの手順（A3）：技が始まったときの連撃の段
  private lastMove: string | null = null;
  private lastMoveT = 0;
  private moveStep = 0;
  private legs: Record<string, Sprite> = {};
  private held: { frame: FrameName; slot: number; knife: Sprite; base?: number }[] = [];
  // 弓（遠の構えの突きの絵だけ）：前の手で握り、胸の手で弦を引く。弦と矢は線で描く
  private bow!: Sprite;
  private bowLines = new Graphics();
  private bowGeo!: { cams: [number, number][]; nock: [number, number]; rest: [number, number] };
  private meta!: Meta;
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
      const sway = SWAY[name];
      let body: Sprite | MeshPlane;
      if (sway) {
        const t = tex[`hero-${name}`];
        const mesh = new MeshPlane({ texture: t, verticesX: Math.ceil(t.width / MESH_STEP) + 1, verticesY: Math.ceil(t.height / MESH_STEP) + 1 });
        mesh.scale.set(1 / s);
        this.meshes[name] = { mesh, base: Float32Array.from(mesh.geometry.positions), sway, key: '' };
        body = mesh;
      } else body = sprite(name);
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

  // 主人公の状態から絵と姿勢を決める（Pose）。x, y は足もとの世界の座標、height は背の高さ（画素）。
  // 決めた姿勢は apply で絵に写す。残像は同じ Pose を別の HeroRig に写して作る
  // vt は画面の時計：昼は sim の時が止まるので、くつろぐ動きはこちらで動かす。夜は sim の時計（ヒットストップで止まる）
  pose(sim: Sim, x: number, y: number, height: number, vt: number, zpx = 0.55): Pose | null {
    if (!this.ready) return null;
    const h = sim.hero;
    const k = height / this.meta.height;
    const t = sim.phase === 'wave' ? sim.clock : vt;
    const dt = Math.max(0, Math.min(0.1, t - this.lastClock));
    this.lastClock = t;

    let frame: FrameName = 'idle';
    let lean = 0;
    let lift = (h.z * zpx) / k; // 跳んだ高さ（絵の画素へ）
    let squash = 1; // 回転のときの横幅
    let sx = 1;
    let sy = 1;
    let shot = 1; // 弓を射る技の進み（1＝射ていない）
    let archer = false;
    let shiver = 0;
    let tint = 0xffffff;

    // 走り：脚を交互に、体を上下に、前のめり。速いほど大きく
    const run = h.running > 0 && h.down <= 0 && h.charge < 0;
    const fast = h.running > 400 || h.running === 2;
    let legSwing = 0;
    if (run && !h.move) {
      this.walkT += dt * (fast ? 22 : 16);
      lift += Math.abs(Math.sin(this.walkT)) * (fast ? 34 : 28);
      lean = (fast ? 16 : 10) * D;
      legSwing = Math.sin(this.walkT) * (fast ? 30 : 24) * D;
      const step = (Math.abs(Math.sin(this.walkT)) - 0.5) * 0.06;
      sy += step;
      sx -= step * 0.6;
    } else if (!h.move && h.down <= 0) {
      // 待機（2026-10-04 レビュー A2）：息づかいは見えるくらいに。リズムを取るように小さく弾み、左右に揺れる
      const b = Math.sin(t * 3.2);
      sy += b * 0.03;
      sx -= b * 0.015;
      const beat = Math.abs(Math.sin(t * 2.6));
      lift += beat ** 3 * 10;
      lean = Math.sin(t * 1.3) * 3 * D;
    }
    // じっとしていると、ときどきナイフをくるっと回す・後ろを振り返る（狼が近くにいないとき）
    const calm = !h.move && !run && h.down <= 0 && h.charge < 0 && h.stun <= 0 && h.ouran <= 0;
    this.idleFor = calm ? this.idleFor + dt : 0;
    if (this.twirl >= 0) this.twirl = this.twirl + dt / 0.5 >= 1 ? -1 : this.twirl + dt / 0.5;
    else if (calm && this.idleFor > this.twirlNext) {
      this.twirl = 0;
      this.twirlNext = this.idleFor + 2.5 + Math.random() * 3;
    }
    const near = sim.wolves.some((w) => Math.abs(w.x - h.x) < 320);
    if (this.look >= 0) this.look = !calm || this.look + dt / 1.1 >= 1 ? -1 : this.look + dt / 1.1;
    else if (calm && !near && this.idleFor > this.lookNext) {
      this.look = 0;
      this.lookNext = this.idleFor + 5 + Math.random() * 4;
    }
    if (!calm) {
      this.twirlNext = Math.min(this.twirlNext, 2.5);
      this.lookNext = Math.min(this.lookNext, 5);
    }
    let turn = 1; // 振り返り：横幅を縮めて裏返り、少し見てから戻る
    if (this.look >= 0) {
      const q = this.look;
      turn = q < 0.15 ? Math.cos((q / 0.15) * Math.PI) : q > 0.85 ? -Math.cos(((q - 0.85) / 0.15) * Math.PI) : -1;
      turn = Math.sign(turn || 1) * Math.max(0.15, Math.abs(turn)); // 細い線にならないように
    }

    // 技：途中で絵を差し替える。p は技の進み（0〜1）。
    // 振りかぶり（溜めの姿勢・後ろへ傾く）→ 振り抜き（前へ傾きすぎてから戻る）で、ため→解放を見せる
    const m = h.move;
    if (m) {
      const dur = { slash: 0.18, launch: 0.26, air: 0.18, slam: 0.3, shiki: 0.42, kaiten: 0.36, tosshin: 0.26, bow: 0.42, ame: 0.6, hougeki: 0.7 }[m];
      const p = Math.min(1, h.moveT / dur);
      const wind = p < 0.4 ? p / 0.4 : 1; // 振りかぶりの進み
      const after = p >= 0.4 ? (p - 0.4) / 0.6 : 0; // 振り抜いてからの進み
      const over = Math.sin(Math.min(1, after * 1.6) * Math.PI) * (1 - after); // 行きすぎて戻る
      if (m !== this.lastMove || h.moveT < this.lastMoveT) this.moveStep = h.step; // 技の始まり
      if (m === 'slash' && this.moveStep % 3 === 1) {
        // 連撃の2手目は踊るように：その場でくるっと回って（後ろ姿を挟む）斬る（2026-10-04 レビュー A3）
        const a = Math.min(1, p / 0.55) * Math.PI * 2;
        squash = Math.max(0.12, Math.abs(Math.cos(a)));
        frame = p >= 0.55 ? 'strike' : Math.cos(a) < 0 ? 'back' : 'idle';
        lift += Math.sin(Math.min(1, p / 0.6) * Math.PI) * 60;
        lean = p >= 0.55 ? (8 + 12 * over) * D : 0;
        if (p >= 0.55) { sx = 1 + 0.2 * over; sy = 1 - 0.14 * over; }
      } else if (m === 'slash') {
        // 斬るたびに少し跳ぶ。振りかぶりで沈み、振り抜きで伸びる
        frame = p < 0.4 ? 'idle' : 'strike';
        lean = p < 0.4 ? -10 * D * wind : (8 + 14 * over) * D;
        lift += Math.sin(p * Math.PI) * 30;
        if (p < 0.4) { sy = 1 - 0.14 * wind; sx = 1 + 0.08 * wind; } else { sx = 1 + 0.18 * over; sy = 1 - 0.12 * over; }
      }
      if (m === 'air') { frame = after > 0 ? 'strike' : 'up'; lean = after > 0 ? 14 * D * (0.5 + over) : -6 * D; }
      if (m === 'launch') {
        // 斬り上げ：深く沈んで、伸び上がりながら宙でくるっと回る（後ろ姿を挟む）。
        // 宙返り（体ごと1回転）は跳ぶ高さが足りず、頭が地面に入った（コマ送りで確認）
        const r = p < 0.35 ? 0 : Math.min(1, (p - 0.35) / 0.4);
        const a = easeInOut(r) * Math.PI * 2;
        frame = p < 0.35 ? 'idle' : r < 1 && Math.cos(a) < 0 ? 'back' : 'up';
        if (r > 0 && r < 1) squash = Math.max(0.12, Math.abs(Math.cos(a)));
        lean = p < 0.35 ? 10 * D : -8 * D;
        if (p < 0.35) { sy = 0.8; sx = 1.14; } else { sy = 1 + 0.25 * over; sx = 1 - 0.12 * over; }
      }
      if (m === 'slam') {
        // 叩き落とし：大きく振りかぶり（反って伸びる）、体ごと落ちて地面でつぶれる
        frame = p < 0.45 ? 'up' : 'strike';
        lean = p < 0.45 ? -18 * D * wind : (24 + 12 * over) * D;
        if (p < 0.45) { sy = 1 + 0.12 * wind; sx = 1 - 0.08 * wind; lift += wind * 30; } else { sy = 1 - 0.24 * over; sx = 1 + 0.2 * over; }
      }
      if (m === 'tosshin') {
        frame = p < 0.12 ? 'idle' : 'strike';
        lean = p < 0.12 ? -10 * D : 22 * D * (1 - after * 0.6);
        sx = p < 0.12 ? 0.85 : 1.28 - 0.28 * after;
        sy = p < 0.12 ? 1.08 : 0.82 + 0.18 * after;
      }
      if (m === 'shiki' || m === 'hougeki') {
        // 主砲：撃った反動で後ろへのけぞる
        frame = p < 0.3 ? 'idle' : 'strike';
        lean = p < 0.3 ? 4 * D : -(10 * (1 - after) + 2) * D;
        if (p >= 0.3) { sx = 1 - 0.06 * over; sy = 1 + 0.05 * over; }
      }
      if (m === 'bow' || m === 'ame') { frame = 'strike'; shot = p; archer = true; lean = -2 * D; }
      if (m === 'kaiten') {
        // 回転：横幅を縮めて背中の絵へ、また縮めて正面へ
        const a = p * Math.PI * 2;
        squash = Math.abs(Math.cos(a));
        frame = Math.cos(a) < 0 ? 'back' : 'idle';
        sy = 1 + 0.05 * Math.sin(p * Math.PI);
      }
    }
    this.lastMove = m;
    this.lastMoveT = h.moveT;
    // 溜め：しゃがんで力をためる。満タンで小刻みに震えて光る
    if (h.charge >= 0) {
      const c = Math.min(1, h.charge / sim.chargeFull);
      frame = 'idle';
      sy = 1 - 0.08 * c;
      sx = 1 + 0.05 * c;
      lean = -4 * D * c;
      if (c >= 1) {
        shiver = Math.sin(t * 90) * 2.5;
        tint = Math.floor(t * 16) % 2 ? 0xfff0c0 : 0xffffff;
      } else tint = mixTint(0xffffff, 0xffe0b0, c * 0.6);
    }
    if (h.ouran > 0) frame = (['idle', 'up', 'strike'] as FrameName[])[Math.floor(t * 14) % 3];
    if (h.stun > 0 && !m) { lean = -12 * D; sx = 0.94; sy = 1.04; } // ひるみ：のけぞる
    if (h.down > 0) { frame = 'down'; lean = 0; lift = 0; sx = sy = 1; }
    // 昼：ときどき小さく跳ねる（くつろいでいる）
    if (sim.phase === 'shop') {
      const hop = Math.max(0, Math.sin(t * 2.4)) ** 6;
      lift += hop * 40;
      sy *= 1 + hop * 0.05;
      lean = Math.sin(t * 1.2) * 2 * D;
    }

    // 弾み（スクワッシュ＆ストレッチ）：ポーズが変わった瞬間に一度つぶれて伸び戻る。
    // 絵の差し替えだけだとカクッと切り替わって硬く見える（2026-10-04 アマネさん「かわいさ感じない」）
    if (frame !== this.lastFrame && frame !== 'down' && m !== 'kaiten') this.pop = 1;
    this.lastFrame = frame;
    this.pop = Math.max(0, this.pop - dt / 0.14);
    const bounce = Math.sin(this.pop * Math.PI) * 0.08;
    sy -= bounce;
    sx += bounce * 0.8;

    if (h.hitFlash > 0) tint = h.hitFlash > 0.12 ? 0xffc8c8 : 0xffe8e8; // 噛まれた：一瞬だけ淡く赤く（赤く塗りつぶすと汚い）
    else if (h.ouran > 0) tint = Math.floor(t * 20) % 2 ? 0xffe6a0 : 0xffffff;
    const blink = h.iframes > 0 && h.move !== 'tosshin' && Math.floor(t * 20) % 2 === 0; // 起き上がりの無敵は点滅
    const sw = this.swing(dt, t, x, h.facing, height, lean, lift, run && !m, h.down > 0);

    return {
      frame, x: x + shiver, y, k, facing: h.facing, lean, lift, sx: sx * squash * turn, sy, legSwing, archer, shot, tint,
      twirl: this.twirl >= 0 ? easeInOut(this.twirl) * Math.PI * 2 : 0,
      alpha: blink ? 0.4 : 1, ...sw,
    };
  }

  // 揺れもののバネを進める。体の動き（横の速さ・傾きの変わり方・上下）に遅れてついてくる
  private swing(dt: number, t: number, x: number, facing: 1 | -1, height: number, lean: number, lift: number, running: boolean, down: boolean) {
    const sp = this.spring;
    if (Number.isNaN(this.lastX) || dt <= 0 || dt > 0.08) {
      this.lastX = x;
      this.lastLean = lean;
      this.lastLift = lift;
      return { tail: sp.tail, skirt: sp.skirt, ears: [sp.ear0, sp.ear1] as [number, number] };
    }
    // 前へ進む速さ（背の高さ／秒）。左を向いていても、絵の中では前
    const v = Math.max(-6, Math.min(6, ((x - this.lastX) / dt / height) * facing));
    const dLean = (lean - this.lastLean) / dt; // 傾きの変わる速さ（ラジアン／秒）
    const dLift = (lift - this.lastLift) / dt; // 上がる速さ（絵の画素／秒）
    this.lastX = x;
    this.lastLean = lean;
    this.lastLift = lift;
    // 待機：しっぽはゆっくり振れ、ときどき耳がぴくっと動く
    const idle = !running && !down;
    const swish = idle ? Math.sin(t * 2.1) * 0.07 + Math.sin(t * 0.73) * 0.05 : 0;
    this.twitchT -= dt;
    if (this.twitchT <= 0 && idle) {
      this.twitchT = 1.6 + Math.random() * 3;
      const which = Math.random() < 0.5 ? 'ear0V' : 'ear1V';
      sp[which] += (Math.random() < 0.5 ? -1 : 1) * 7;
    }
    const tailTo = Math.max(-0.35, Math.min(0.5, v * 0.16)) + swish + (running ? Math.sin(t * 11) * 0.08 : 0);
    const skirtTo = Math.max(-16, Math.min(16, -v * 6)) + (running ? Math.sin(t * 22) * 2 : 0);
    const k = (val: 'tail' | 'skirt' | 'ear0' | 'ear1', to: number, stiff: number, damp: number, push: number) => {
      const vel = `${val}V` as 'tailV' | 'skirtV' | 'ear0V' | 'ear1V';
      sp[vel] += ((to - sp[val]) * stiff - sp[vel] * damp + push) * dt;
      sp[val] += sp[vel] * dt;
    };
    // 体が前へ傾くと、しっぽと裾は後ろへ遅れる。跳び上がると耳は下がり、裾はふわっと持ち上がる
    k('tail', tailTo, 55, 5.5, -dLean * 9 + dLift * 0.004);
    k('skirt', skirtTo, 150, 8, -dLean * 260);
    k('ear0', 0, 320, 11, -dLean * 30 - dLift * 0.02);
    k('ear1', 0, 320, 11, -dLean * 30 - dLift * 0.02);
    sp.tail = Math.max(-0.28, Math.min(0.75, sp.tail)); // 下げすぎると裾に折れ込む（3倍で確認）
    sp.skirt = Math.max(-22, Math.min(22, sp.skirt));
    sp.ear0 = Math.max(-0.3, Math.min(0.3, sp.ear0));
    sp.ear1 = Math.max(-0.3, Math.min(0.3, sp.ear1));
    return { tail: sp.tail, skirt: sp.skirt, ears: [sp.ear0, sp.ear1] as [number, number] };
  }

  // 網目を曲げる。同じ値なら作り直さない
  private bend(name: FrameName, tail: number, skirt: number, ears: [number, number]) {
    const m = this.meshes[name];
    if (!m) return;
    const key = `${tail.toFixed(3)},${skirt.toFixed(2)},${ears[0].toFixed(3)},${ears[1].toFixed(3)}`;
    if (key === m.key) return;
    m.key = key;
    const pos = m.mesh.geometry.positions;
    const b = m.base;
    const { tail: T, skirt: K, ears: E } = m.sway;
    const smooth = (a: number) => (a <= 0 ? 0 : a >= 1 ? 1 : a * a * (3 - 2 * a));
    const sk = K && K.legs ? skirt * 0.6 : skirt; // 脚まで描いてある絵では控えめに（裾の下のタイツを引っぱらない）
    for (let i = 0; i < b.length; i += 2) {
      let x = b[i];
      let y = b[i + 1];
      if (T && tail) {
        const w = smooth((T.at[0] - x) / T.len) * smooth((y - (T.top - 30)) / 30) * smooth((T.bot + 30 - y) / 30);
        if (w > 0) {
          const a = tail * w;
          const dx = x - T.at[0];
          const dy = y - T.at[1];
          x = T.at[0] + dx * Math.cos(a) - dy * Math.sin(a);
          y = T.at[1] + dx * Math.sin(a) + dy * Math.cos(a);
        }
      }
      if (E) {
        E.forEach(([ex, ey], j) => {
          const a0 = ears[j];
          if (!a0) return;
          const w = smooth((ey - b[i + 1]) / EAR_R) * smooth(1 - Math.abs(b[i] - ex) / (EAR_R * 0.9));
          if (w <= 0) return;
          const a = a0 * w;
          const dx = x - ex;
          const dy = y - ey;
          x = ex + dx * Math.cos(a) - dy * Math.sin(a);
          y = ey + dx * Math.sin(a) + dy * Math.cos(a);
        });
      }
      if (K && sk) {
        const yy = b[i + 1];
        let w = yy <= K.waist ? 0 : Math.min(1, (yy - K.waist) / (K.hem - K.waist)) ** 1.6;
        if (K.legs && yy > K.hem) w = Math.max(0, 1 - (yy - K.hem) / 40);
        x += sk * w;
      }
      pos[i] = x;
      pos[i + 1] = y;
    }
    m.mesh.geometry.getBuffer('aPosition').update();
  }

  apply(p: Pose, tint = p.tint, alpha = p.alpha) {
    if (!this.ready) return;
    this.root.position.set(p.x, p.y);
    this.root.scale.set(p.facing * p.k, p.k); // 絵は右向き
    this.root.alpha = alpha;
    for (const n of NAMES) this.frames[n].visible = n === p.frame;
    this.bend(p.frame, p.tail, p.skirt, p.ears);
    this.legs.legL && (this.legs.legL.rotation = p.legSwing);
    this.legs.legR && (this.legs.legR.rotation = -p.legSwing);
    // 弓を射る技：突きの絵の前の手に弓、胸の手は弦を引く。両手のナイフは隠す
    const archer = p.archer && p.frame === 'strike';
    for (const hd of this.held) {
      hd.knife.visible = !(archer && hd.frame === 'strike');
      hd.base ??= hd.knife.rotation;
      hd.knife.rotation = hd.base + (hd.frame === 'idle' && hd.slot === 1 ? p.twirl : 0);
    }
    this.bow.visible = archer;
    this.drawBow(archer, p.shot);
    this.body.rotation = p.lean;
    this.body.position.set(0, -p.lift);
    this.body.scale.set(p.sx, p.sy);
    for (const sp of this.sprites) sp.tint = tint;
  }
}

export interface Pose {
  frame: FrameName;
  x: number; y: number; k: number; facing: 1 | -1;
  lean: number; lift: number; sx: number; sy: number; legSwing: number;
  archer: boolean; shot: number; tint: number; alpha: number;
  tail: number; skirt: number; ears: [number, number]; // 揺れもの
  twirl: number; // 構えの手のナイフを回す角度
}

function easeInOut(q: number) {
  return q < 0.5 ? 2 * q * q : 1 - (-2 * q + 2) ** 2 / 2;
}

function mixTint(a: number, b: number, k: number) {
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - k) + ((b >> s) & 255) * k);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}
