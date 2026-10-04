// 赤ずきんの絵。ポーズの絵を技に合わせて差し替え、歩きだけ脚を切り絵で動かす（2026-10-03・アマネさん：
// アニメ的な差し替えと切り絵の組み合わせでよい。きれいな方がいい）。
// 絵は右向き。左を向くときは左右反転する。座標は元の絵の画素で組み、最後に縮める（tools/export-hero.py）。
import { Assets, Container, MeshPlane, Rectangle, Sprite, Texture } from 'pixi.js';
import { MOVES } from './config';
import type { Sim } from './sim';

// idle＝構え（技の振りかぶり）・calm＝力を抜いた待機（2026-10-04 生成。happy・wink・cry は同じ姿勢で顔だけ違う）・
// run1/run2＝走りの2コマ・sweep＝横なぎの振り抜き・victory＝決めポーズ。新しい絵はナイフも絵に描いてある
type FrameName = 'idle' | 'up' | 'strike' | 'down' | 'back' | 'calm' | 'happy' | 'wink' | 'cry' | 'run1' | 'run2' | 'sweep' | 'victory' | 'dash' | 'rise' | 'charge' | 'aim' | 'loose' | 'knock';
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
  frames: Record<FrameName, FrameMeta> & Record<'knife' | 'cannon', { size: [number, number]; pivot: [number, number]; guard?: number }>;
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
  // 走りの2コマは、しっぽの帯に後ろの手のナイフの刃が重なり、しっぽと一緒に曲がった（3倍で確認）。しっぽは絵のまま
  run1: { skirt: { waist: 330, hem: 595, legs: true }, ears: [[262, 58], [328, 60]] },
  run2: { skirt: { waist: 340, hem: 600, legs: true }, ears: [[248, 60], [318, 62]] },
  sweep: { tail: { at: [95, 375], len: 90, top: 330, bot: 410 }, skirt: { waist: 345, hem: 610, legs: true }, ears: [[215, 55], [300, 58]] },
  victory: { tail: { at: [110, 410], len: 100, top: 360, bot: 480 }, skirt: { waist: 345, hem: 625, legs: true }, ears: [[212, 55], [292, 55]] },
};
// 待機と表情の4枚は同じ姿勢（しっぽの付け根の近くでナイフを持つ手は、しっぽの帯から外す）
for (const n of ['calm', 'happy', 'wink', 'cry'] as const) {
  SWAY[n] = { tail: { at: [68, 472], len: 60, top: 452, bot: 500 }, skirt: { waist: 350, hem: 640, legs: true }, ears: [[168, 62], [240, 62]] };
}
// 絵に描いてあるナイフの刃先（書き出した絵の画素）。刃の軌跡に使う
const TIPS: Partial<Record<FrameName, [number, number][]>> = { sweep: [[78, 148], [205, 305]], dash: [[75, 30], [212, 10]], rise: [[8, 148], [425, 239]] };
const EAR_R = 52;
const REST = 0.3; // 主砲をたたんだ向き（真下から後ろへ少し）
const MOVES_HALF = { shiki: 0.21, hougeki: 0.35 }; // 主砲を撃つ時刻（sim と同じ：技の長さの半ば）
const MESH_STEP = 12; // 網目の細かさ（画素）

const BASE = `${import.meta.env.BASE_URL}hero/`;
const D = Math.PI / 180;
const NAMES: FrameName[] = ['idle', 'up', 'strike', 'down', 'back', 'calm', 'happy', 'wink', 'cry', 'run1', 'run2', 'sweep', 'victory', 'dash', 'rise', 'charge', 'aim', 'loose', 'knock'];

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
  private face: { name: FrameName; until: number } | null = null; // 出来事で変える顔（待機の絵の差し替え）
  private lastHit = 0;
  private alert = 0; // 構えている残り（秒）
  // 技ごとの手順（A3）：技が始まったときの連撃の段
  private lastMove: string | null = null;
  private lastMoveT = 0;
  private moveStep = 0;
  private legs: Record<string, Sprite> = {};
  private held: { frame: FrameName; slot: number; knife: Sprite }[] = [];
  // 背中の主砲（2026-10-04）：ふだんは背中にたたみ、溜め・主砲のときに後ろ・上を回って肩越しに狙う狼へ向く。撃つと反動で跳ねる
  private cannon!: Sprite;
  private gun = 0; // 起きている度合い（0＝たたむ・1＝構える）
  private recoil = 0;
  private meta!: Meta;
  private walkT = 0;
  private lastClock = 0;
  ready = false;

  async load() {
    this.meta = await (await fetch(`${BASE}frames.json`)).json();
    const files = [...NAMES, 'legL', 'legR', 'knife', 'cannon'];
    const tex = (await Assets.load(files.map((n) => ({ alias: `hero-${n}`, src: `${BASE}${n}.webp` })))) as Record<string, Texture>;
    const s = this.meta.scale;
    const sprite = (n: string) => {
      const sp = new Sprite(tex[`hero-${n}`]);
      sp.scale.set(1 / s); // 元の絵の画素の大きさに戻す
      return sp;
    };
    const gear = (n: 'knife' | 'cannon') => {
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
      c.visible = false;
      this.frames[name] = c;
      this.body.addChild(c);
    }
    this.cannon = gear('cannon');
    this.cannon.visible = false;
    this.body.addChildAt(this.cannon, 0); // 体の後ろ
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

  // 主人公の状態から絵と姿勢を決める（Pose）。x, y は足もとの世界の座標、height は背の高さ（画素）。
  // 決めた姿勢は apply で絵に写す。残像は同じ Pose を別の HeroRig に写して作る
  // vt は画面の時計：昼は sim の時が止まるので、くつろぐ動きはこちらで動かす。夜は sim の時計（ヒットストップで止まる）
  // aim：主砲を向ける角度（ラジアン。0＝真下・π/2＝後ろ・π＝真上・3π/2＝真っすぐ前。絵は右向き）
  pose(sim: Sim, x: number, y: number, height: number, vt: number, zpx = 0.55, aim = (4 / 3) * Math.PI): Pose | null {
    if (!this.ready) return null;
    const h = sim.hero;
    const k = height / this.meta.height;
    const t = sim.phase === 'wave' ? sim.clock : vt;
    const dt = Math.max(0, Math.min(0.1, t - this.lastClock));
    this.lastClock = t;
    const close = sim.phase === 'wave' && sim.wolves.some((w) => Math.abs(w.x - h.x) < 260 && Math.abs(w.lane - h.lane) < 0.5);
    this.alert = h.move || h.charge >= 0 || close ? 1.2 : Math.max(0, this.alert - dt);

    let frame: FrameName = 'idle';
    let lean = 0;
    let lift = (h.z * zpx) / k; // 跳んだ高さ（絵の画素へ）
    let squash = 1; // 回転のときの横幅
    let sx = 1;
    let sy = 1;
    let shiver = 0;
    let tint = 0xffffff;

    // 走り：2コマ（足を着く・足を入れ替える）を交互に。体を上下に。速いほど速く大きく
    // （2026-10-04 生成。前は構えの絵の脚だけを振っていて、紙人形に見えた）
    const run = h.running > 0 && h.down <= 0 && h.charge < 0;
    const fast = h.running > 400 || h.running === 2;
    const legSwing = 0;
    if (run && !h.move) {
      this.walkT += dt * (fast ? 22 : 16);
      frame = Math.sin(this.walkT) >= 0 ? 'run1' : 'run2';
      lift += Math.abs(Math.cos(this.walkT)) * (fast ? 30 : 22);
      lean = (fast ? 6 : 3) * D;
    } else if (!h.move && h.down <= 0) {
      // 狼が近い・技を出した直後は構え、何もなければ力を抜いて待つ（技の合間に切り替わると落ち着かなかった）
      frame = this.alert > 0 ? 'idle' : 'calm';
      // 待機：ゆっくり少し上下して、わずかに揺れるだけ。絵を伸び縮みさせると気持ち悪かった（2026-10-04 アマネさん「縮んで気持ち悪い」）。
      // 生きている感じは、しっぽ・裾・耳の揺れものに任せる
      lift += (1 - Math.cos(t * 2.2)) * 4;
      lean = Math.sin(t * 1.1) * 1.5 * D;
    }
    // 顔：締めの一撃でにこっ・連撃10と30でウインク・噛まれたら >_<（待機の絵のときだけ見える）
    const ev = sim.events;
    if (ev.includes('finisher') || ev.includes('dawn')) this.face = { name: 'happy', until: t + 1.2 };
    if (ev.includes('combo10') || ev.includes('combo30')) this.face = { name: 'wink', until: t + 1.2 };
    if (h.hitFlash > this.lastHit + 0.05) this.face = { name: 'cry', until: t + 0.7 };
    this.lastHit = h.hitFlash;
    if (this.face && t > this.face.until) this.face = null;

    // 技：途中で絵を差し替える。p は技の進み（0〜1）。
    // 振りかぶり（溜めの姿勢・後ろへ傾く）→ 振り抜き（前へ傾きすぎてから戻る）で、ため→解放を見せる
    const m = h.move;
    if (m) {
      const dur = MOVES[m].dur;
      const p = Math.min(1, h.moveT / dur);
      const wind = p < 0.4 ? p / 0.4 : 1; // 振りかぶりの進み
      const after = p >= 0.4 ? (p - 0.4) / 0.6 : 0; // 振り抜いてからの進み
      const over = Math.sin(Math.min(1, after * 1.6) * Math.PI) * (1 - after); // 行きすぎて戻る
      if (m !== this.lastMove || h.moveT < this.lastMoveT) this.moveStep = h.step; // 技の始まり
      if (m === 'slash') {
        // 斬り：振りかぶり（構えの絵）→ 振り抜きは突きと横なぎを交互に。斬るたびに少し跳ぶ
        frame = p < 0.4 ? 'idle' : this.moveStep % 2 ? 'sweep' : 'strike';
        lean = p < 0.4 ? -8 * D * wind : (6 + 10 * over) * D;
        lift += Math.sin(p * Math.PI) * 24;
      }
      if (m === 'air') { frame = after > 0 ? 'strike' : 'rise'; lean = after > 0 ? 14 * D * (0.5 + over) : -6 * D; }
      if (m === 'launch') {
        // 斬り上げ：深く沈んで、宙へ伸び上がる（2026-10-04 生成の絵。前は頭上の絵を回していた）
        frame = p < 0.35 ? 'idle' : 'rise';
        lean = p < 0.35 ? 10 * D : -4 * D;
        if (p < 0.35) { sy = 0.8; sx = 1.14; } else { sy = 1 + 0.18 * over; sx = 1 - 0.1 * over; }
      }
      if (m === 'slam') {
        // 叩き落とし：大きく振りかぶり（反って伸びる）、体ごと落ちて地面でつぶれる
        frame = p < 0.45 ? 'up' : 'strike';
        lean = p < 0.45 ? -18 * D * wind : (24 + 12 * over) * D;
        if (p < 0.45) { sy = 1 + 0.12 * wind; sx = 1 - 0.08 * wind; lift += wind * 30; } else { sy = 1 - 0.24 * over; sx = 1 + 0.2 * over; }
      }
      if (m === 'tosshin') {
        // 突進：低く長い踏み込みの絵（2026-10-04 生成）。絵そのものが前のめりなので、傾けすぎない
        frame = p < 0.12 ? 'idle' : 'dash';
        lean = p < 0.12 ? -10 * D : 4 * D * (1 - after);
        sx = p < 0.12 ? 0.85 : 1.16 - 0.16 * after;
        sy = p < 0.12 ? 1.08 : 0.9 + 0.1 * after;
      }
      if (m === 'shiki' || m === 'hougeki') {
        // 主砲：撃った反動で後ろへのけぞる
        frame = p < 0.3 ? 'idle' : 'strike';
        lean = p < 0.3 ? 4 * D : -(10 * (1 - after) + 2) * D;
        if (p >= 0.3) { sx = 1 - 0.06 * over; sy = 1 + 0.05 * over; }
      }
      // 弓：引き絞る絵 → 半ばで放った絵（2026-10-04 生成。前は突きの絵に弓を重ね、弦を線で描いていた）
      if (m === 'bow' || m === 'ame') { frame = p < 0.5 ? 'aim' : 'loose'; lean = p < 0.5 ? -2 * D : -4 * D * (1 - after); }
      if (m === 'kaiten') {
        // 回転：横幅を縮めて背中の絵へ、また縮めて正面へ
        const a = p * Math.PI * 2;
        squash = Math.max(0.6, Math.abs(Math.cos(a))); // 細い線になるまで縮めない（縮むと気持ち悪い）
        frame = Math.cos(a) < 0 ? 'back' : 'idle';
        sy = 1 + 0.05 * Math.sin(p * Math.PI);
      }
    }
    this.lastMove = m;
    this.lastMoveT = h.moveT;
    // 溜め：しゃがんで力をためる。満タンで小刻みに震えて光る
    if (h.charge >= 0) {
      const c = Math.min(1, h.charge / sim.chargeFull);
      frame = 'charge'; // しゃがんでナイフを胸の前で交差させる（2026-10-04 生成）
      sy = 1 - 0.08 * c;
      sx = 1 + 0.05 * c;
      lean = -4 * D * c;
      if (c >= 1) {
        shiver = Math.sin(t * 90) * 2.5;
        tint = Math.floor(t * 16) % 2 ? 0xfff0c0 : 0xffffff;
      } else tint = mixTint(0xffffff, 0xffe0b0, c * 0.6);
    }
    if (h.ouran > 0) frame = (['idle', 'up', 'strike'] as FrameName[])[Math.floor(t * 14) % 3];
    if (h.stun > 0 && !m) { frame = 'knock'; lean = -6 * D; sx = 0.94; sy = 1.04; } // ひるみ：のけぞる（>_<・ナイフは持ったまま）
    if ((frame === 'calm' || (frame === 'idle' && !m && h.charge < 0)) && this.face) frame = this.face.name;
    // 宙にいるあいだ（技のあと落ちてくるところ）は跳んだ姿。立った姿のまま浮くとおかしかった
    if (h.z > 0 && !m && h.down <= 0 && h.charge < 0 && h.stun <= 0) { frame = 'rise'; lean = h.vz < 0 ? 4 * D : -4 * D; }
    // 晩の最後の1匹：スローのあいだは振り抜いたまま見せ、スローが明けてから拳を上げる（2026-10-04 アマネさん「拳あげる早すぎ」）。
    // 上げる瞬間に少し沈んで跳ねる
    if (sim.cheer >= 0 && h.down <= 0) {
      frame = sim.cheer < 0.12 ? 'idle' : 'victory';
      lean = 0;
      lift = sim.cheer < 0.12 ? 0 : Math.sin(Math.min(1, (sim.cheer - 0.12) / 0.3) * Math.PI) * 26;
    }
    if (h.down > 0) { frame = 'down'; lean = 0; lift = 0; sx = sy = 1; }
    // 昼：ときどき小さく跳ねる（くつろいでいる）
    if (sim.phase === 'shop') {
      const hop = Math.max(0, Math.sin(t * 2.4)) ** 6;
      if (frame === 'calm' && hop > 0.2) frame = 'happy'; // 跳ねるときは笑顔
      lift += hop * 40;
      lean = Math.sin(t * 1.2) * 2 * D;
    }

    // 伸び縮みは控えめに（描いた絵を大きく伸び縮みさせると気持ち悪い。2026-10-04 アマネさん）。技の勢いは絵の差し替え・傾き・跳びで見せる
    sx = 1 + (sx - 1) * 0.3;
    sy = 1 + (sy - 1) * 0.3;

    if (h.hitFlash > 0) tint = h.hitFlash > 0.12 ? 0xffc8c8 : 0xffe8e8; // 噛まれた：一瞬だけ淡く赤く（赤く塗りつぶすと汚い）
    else if (h.ouran > 0) tint = Math.floor(t * 20) % 2 ? 0xffe6a0 : 0xffffff;
    const blink = h.iframes > 0 && h.move !== 'tosshin' && Math.floor(t * 20) % 2 === 0; // 起き上がりの無敵は点滅
    const sw = this.swing(dt, t, x, h.facing, height, lean, lift, run && !m, h.down > 0);

    return {
      frame, x: x + shiver, y, k, facing: h.facing, lean, lift, sx: sx * squash, sy, legSwing, tint, ...this.aimGun(sim, dt), aim,
      alpha: blink ? 0.4 : 1, ...sw,
    };
  }

  // 主砲の起き具合。溜め・主砲・撃ち込みのあいだは起こし、終わったらたたむ。撃った瞬間（技の半ば）に反動
  private aimGun(sim: Sim, dt: number) {
    const h = sim.hero;
    const m = h.move;
    const firing = m === 'shiki' || m === 'hougeki';
    const want = h.charge >= 0 || firing ? 1 : 0;
    this.gun += (want - this.gun) * Math.min(1, dt * (want ? 14 : 6));
    if (firing && h.moveT >= MOVES_HALF[m] && h.moveT - dt < MOVES_HALF[m]) this.recoil = 1;
    this.recoil = Math.max(0, this.recoil - dt * 5);
    return { gun: this.gun, recoil: Math.sin(this.recoil * Math.PI * 0.5) };
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

  // いま見えているナイフの刃先（space の座標）。斬撃の軌跡を刃の通り道に描く（2026-10-04 レビュー A4）
  tips(space: Container): ({ x: number; y: number } | null)[] {
    const out: ({ x: number; y: number } | null)[] = [null, null];
    if (!this.ready) return out;
    for (const hd of this.held) {
      if (!this.frames[hd.frame].visible || !hd.knife.visible) continue;
      const k = hd.knife;
      const g = k.toGlobal({ x: 0, y: -k.anchor.y * k.texture.height });
      out[hd.slot] = space.toLocal(g);
    }
    for (const [name, pts] of Object.entries(TIPS) as [FrameName, [number, number][]][]) {
      if (!this.frames[name].visible) continue;
      const s = this.meta.scale;
      pts.forEach(([x, y], i) => (out[i] = space.toLocal(this.frames[name].toGlobal({ x: x / s, y: y / s }))));
    }
    return out;
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
    // 主砲：肩の後ろを中心に回す。撃つと砲身の向きと逆へ跳ねる
    const c = this.cannon;
    // 初期装備なので、ふだんも背中にたたんで背負っている（2026-10-04 アマネさん「主砲どこいったん」）。倒れた姿・回転の後ろ姿では隠す
    c.visible = p.frame !== 'down' && p.frame !== 'back';
    if (c.visible) {
      const H = this.meta.height;
      const a = REST + (p.aim - REST) * p.gun; // たたんだ向き（少し後ろへ倒した下向き）から、後ろ・上を回って狙う向きへ
      const shoulderY = p.frame === 'charge' ? -0.62 * H : -0.78 * H; // 肩の上（低いと腰から出ているように見えた）
      c.rotation = a;
      c.position.set(-0.1 * H + Math.sin(a) * p.recoil * 40, shoulderY - Math.cos(a) * p.recoil * 40);
    }
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
  tint: number; alpha: number;
  gun: number; recoil: number; aim: number; // 背中の主砲の起き具合・反動・向ける角度
  tail: number; skirt: number; ears: [number, number]; // 揺れもの
}

function mixTint(a: number, b: number, k: number) {
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - k) + ((b >> s) & 255) * k);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}
