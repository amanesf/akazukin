// 戦場の描画。主人公のアップをカメラで追い、下に戦場全体の小さい地図（minimap.ts）を出す（2026-10-04）。
// 狼・番犬はまだ灰色の箱（絵は生成で作る・plan.md §6）。動き・演出は箱のままでも作り込む：
// 走り・跳ね・のけぞり・打ち上げの回転・残像・斬撃の弧・火花・桜・土煙・画面の揺れと寄り・ヒットストップ。
import { Application, Assets, ColorMatrixFilter, Container, Graphics, Sprite, Text, type Texture } from 'pixi.js';
import { Backdrop, mix } from './backdrop';
import { COLORS, GRAY_FUR, HOWL, KING, SHELL, WMAN, DOG_ORDER, DOG_ROLES, DOGS, FIELD_LENGTH, HERO, HOUSE_HP, HOUSE_X, LANE_TOL, MOVES, WOLF_SPAWN_X, WOLVES, type DogKind } from './config';
import { blossom, crescent, easeOut, glowTexture, NIGHT_PINK, Particles, PINK, place } from './fx';
import { HeroRig, type Pose } from './heroRig';
import { Minimap } from './minimap';
import { night } from './nights';
import { DOG_CROWN, DOG_REL, UnitArt, WOLF_REL } from './wolfArt';
import { DOG_COLOR, WOLF_COLOR } from './palette';
import { Sim, type Dog, type Fx, type Wolf } from './sim';
import type { WolfColor, WolfKind } from './config';

const COLOR = {
  heroHp: 0xf06070,
  hpBack: 0x000000,
  arrow: 0xd8f0ff,
};

// 画面の中の文字も明朝に（ダメージの数字・番犬の役目・画面の外の狼の数）
const MINCHO = '"Shippori Mincho", "Hiragino Mincho ProN", "Yu Mincho", "Noto Serif JP", serif';
// 撮影用（scripts/movie.mjs）：?camzoom=0.46 でカメラを引き、?camcenter=1 で主人公を真ん中に映す。ふだんは使わない
const CAM_PARAMS = new URLSearchParams(location.search);
const CAM_ZOOM = Number(CAM_PARAMS.get('camzoom') ?? 1);
const CAM_CENTER = !!CAM_PARAMS.get('camcenter');
const VIEW_UNITS = 250; // 夜のカメラが横に映す間合い（戦場は 1000＝画面4つ分。全体は小さい地図で）
const GHOSTS = 7;

export interface Geo {
  W: number; H: number; Hm: number; MM: number; K: number;
  horizon: number; laneTop: number; laneH: number;
}

export class View {
  app = new Application();
  geo!: Geo;
  private backdrop = new Backdrop();
  private paraRoot = new Container();
  private world = new Container(); // カメラで動かす
  private shade = new Graphics(); // 桜嵐で背景を暗くする
  private dayLift = new Graphics(); // 昼の光：背景（町・地面）だけを明るく足す。人物は明るくしない
  private ground = new Graphics(); // 影・地面の輪・家
  private backG = new Graphics(); // 主人公より奥の箱
  private frontG = new Graphics(); // 主人公より手前の箱
  private wolfBack = new Container(); // 狼の絵（主人公より奥）
  private wolfFront = new Container(); // 狼の絵（主人公より手前）
  private wolfHud = new Graphics(); // 狼の体力の棒（絵の上）
  private headMarks = new Container(); // 色の狼の頭の上の印（弱い武器の絵）
  private markUsed = 0;
  private markTex: Record<string, Texture> = {};
  // 月明かりの縁取り（狼・番犬は wolfArt の rim、主人公は rimRig）。体の後ろに、紅く光る同じ絵を右上へずらして置く
  private rimBack = new Container();
  private rimFront = new Container();
  private rimRig = new HeroRig();
  private cloudRoot = new Container(); // 月の前を流れる雲
  private clouds: { c: Container; x: number; y: number; sp: number; w: number }[] = [];
  private lampRoot = new Container(); // ガス灯の光（加算）
  private lamps: { x: number; head: Sprite; pool: Sprite }[] = [];
  private groundPetals: { x: number; lane: number; r: number; c: number; rot: number }[] = []; // 道に積もった花びら
  private steps: { x: number; lane: number; t: number; side: number }[] = []; // 走った足あと
  private stepT = 0;
  private mono = 0; // 締めの一撃の一瞬のモノクロ
  private monoFilter = new ColorMatrixFilter();
  // ── 演出の追加（2026-10-04） ──
  private whiteFilter = new ColorMatrixFilter(); // 一瞬の白い影：狼を真っ白に抜く
  private impact = 0; // 白い影の残り（秒。画面の時計）
  private splitLayer = new Container(); // 斬られて上下にずれる狼の影
  private splits: { top: Container; bot: Container; t: number; dir: number; hh: number; x: number; y: number; a: number }[] = [];
  private crests: { x: number; lane: number; r: number; t: number }[] = []; // 主砲の跡に焼き付く桜の紋
  private branch: { t: number; big: boolean } | null = null; // 連撃の節目に画面の縁から伸びる桜の枝
  private lastCombo = 0;
  private claws: { t: number; x: number; y: number; a: number } | null = null; // 噛まれた爪あと
  private lastHeroFlash = 0;
  private petShift = 0; // なでるときに主人公の絵を寄せる量（画面の画素）
  private petLift = 0; // なでるときに主人公の絵を奥（画面の上）へずらす量（画面の画素）
  private grade = new Graphics(); // 色の仕上げ（夜は藍・昼は暖かく）
  private lastPhase = '';
  // 動きの絵：ふつうの狼はもう1歩・噛みつき・のけぞり・宙で転がる（wolf-motion-v1）。
  // ほかの4種類は噛みつき、遠吠えと大狼はのけぞりも（pack-motion-v1）
  private wolves = new UnitArt<WolfArt>('wolves', ['pup', 'wolf', 'armored', 'howler', 'alpha', 'wolf_walk2', 'wolf_bite', 'wolf_hit', 'wolf_air', 'pup_bite', 'armored_bite', 'howler_bite', 'alpha_bite', 'howler_hit', 'alpha_hit', 'wman', 'wman_wind', 'wman_swing', 'wman_hit', 'wwoman', 'wwoman_crouch', 'wwoman_leap', 'wwoman_claw', 'wwoman_hit', 'crow', 'crow_down', 'crow_cling', 'crow_hit', 'wman_air', 'wman_down', 'wwoman_air', 'wwoman_down', 'pup_hit', 'armored_hit', 'crow_dive', 'crow_ko', 'king', 'king_crouch', 'king_rear', 'king_howl', 'king_down'], this.wolfBack, this.wolfFront, [this.rimBack, this.rimFront]);
  private dogBack = new Container();
  private dogFront = new Container();
  private dogArt = new UnitArt<DogArt>('dogs', ['shiba', 'akita', 'tosa', 'shiba_run', 'akita_run', 'tosa_run', 'shiba_bite', 'akita_bite', 'tosa_bite'], this.dogBack, this.dogFront, [this.rimBack, this.rimFront]); // 走り・噛みつきの絵は dogs-motion-v1 // 入れ物は狼と分ける（同じだと狼の後片付けで犬が消えた）
  private house = new Sprite(); // おばあさんの家の絵
  private houseOver = new Graphics(); // 家のひび（絵の上）
  private overG = new Graphics(); // 矢・砲弾・衝撃波・斬撃の弧・裂け目
  private ghostLayer = new Container();
  private rig = new HeroRig();
  private ghosts: { rig: HeroRig; pose: Pose | null; t: number; tint: number }[] = [];
  private ghostT = 0;
  private parts = new Particles(); // 世界の粒
  private screenParts = new Particles(); // 画面の粒（速度線・桜嵐の花吹雪・カメラの前を横切る玉ボケの花びら）
  private airBack = new Particles(); // 夜風の花びらの奥の層（画面の座標。主人公・狼・番犬より後ろに描く）
  private screen = new Graphics(); // 画面に固定の演出（周辺の暗がり・閃光・矢印・指の軌跡）
  private blade: { x: number; y: number; t: number }[][] = [[], []]; // 刃先の通り道（ナイフ2本）
  private marks: { kind: 'sweat' | 'cross' | 'sparkle' | 'note' | 'star'; t: number; life: number; ox: number; oy: number }[] = []; // 漫画の記号（頭のまわり）
  private markText: Text[] = [];
  private lastHitFlash = 0;
  private noteT = 0;
  private nums: Text[] = [];
  private numOwner: number[] = []; // 数字の枠ごとに、受け持つ fx の id（-1 は空き）。枠を固定して、文字の絵を作り直すのは出た瞬間だけにする
  private edgeText: Text[] = [];
  private mini = new Minimap(this.wolves as unknown as UnitArt<string>);
  private seen = 0; // 処理済みの fx の id
  private cam = { x: 0, y: 0, z: 1 };
  private flash = 0; // 画面の白い閃光
  private flashColor = 0xffffff;
  private houseFlash = 0;
  vt = 0; // 画面の時計
  private lastWave = '';
  private ambientT = 0;
  private gustT = 5; // 次の風のひと吹きまで（負のあいだは吹いている）
  private fog: Sprite[] = []; // 地面すれすれを流れる夜霧
  heroAt = { x: 0, y: 0 }; // 吹き出しを置く位置（画面の座標）
  trail: { x: number; y: number; t: number }[] = []; // 指の軌跡（input が足す）
  private roleText: Text[] = []; // 昼：番犬の頭の上の役目
  private stuck: { id: number; x: number; lane: number; z: number; rel: number; t: number; dir: number }[] = []; // 狼の頭に刺さった矢（少しのあいだ残す）
  private seenArrows = new WeakSet<object>();
  private wolfBoxes: { id: number; lane: number; x0: number; x1: number; y0: number; y1: number }[] = []; // 描いた狼の絵の範囲（世界の座標）。タップで狼を選ぶ
  private xf = { z: 1, ox: 0, oy: 0 }; // 世界→画面

  async init(host: HTMLElement) {
    await this.app.init({ preference: 'webgl', resizeTo: host, background: 0x2a1e1e, antialias: true, resolution: Math.min(devicePixelRatio, 2), autoDensity: true });
    host.appendChild(this.app.canvas);
    // resizeTo は窓の大きさしか見ない。下の板（昼と夜で高さが変わる）に合わせて、戦場の大きさを測り直す
    new ResizeObserver(() => this.app.resize()).observe(host);
    const st = this.app.stage;
    st.addChild(this.backdrop.sky, this.backdrop.stars, this.backdrop.rays, this.backdrop.moon, this.cloudRoot, this.paraRoot, this.dayLift, this.shade, this.world);
    // 雲：やわらかい丸いぼかしを横に重ねた塊。月の前を、奥（ゆっくり）と手前（少し速く）でゆっくり流れる
    for (let i = 0; i < 7; i++) {
      const c = new Container();
      const n = 5 + Math.floor(Math.random() * 3);
      for (let j = 0; j < n; j++) {
        const b = new Sprite(glowTexture());
        b.anchor.set(0.5);
        const k = 1 - Math.abs(j - (n - 1) / 2) / n;
        b.width = 120 + Math.random() * 80;
        b.height = (40 + Math.random() * 30) * (0.6 + k);
        b.position.set((j - (n - 1) / 2) * 52 + Math.random() * 20, -k * 14 + Math.random() * 8);
        c.addChild(b);
      }
      this.cloudRoot.addChild(c);
      this.clouds.push({ c, x: Math.random(), y: 0.05 + Math.random() * 0.3, sp: 0.004 + Math.random() * 0.008, w: 0.8 + Math.random() * 0.8 });
    }
    // ガス灯（道の奥の縁に3本）。灯りと、地面に落ちる光だまり
    this.lampRoot.blendMode = 'add';
    for (const x of [200, 470, 740]) {
      const head = new Sprite(glowTexture());
      head.anchor.set(0.5);
      head.tint = 0xffb060;
      const pool = new Sprite(glowTexture());
      pool.anchor.set(0.5);
      pool.tint = 0xffa050;
      this.lampRoot.addChild(pool, head);
      this.lamps.push({ x, head, pool });
    }
    this.dayLift.blendMode = 'add';
    for (let i = 0; i < 7; i++) {
      const f = new Sprite(glowTexture());
      f.anchor.set(0.5);
      f.tint = 0xa898d0;
      this.fog.push(f);
    }
    this.rimRig.root.blendMode = 'add';
    this.world.addChild(this.ground, this.lampRoot, ...this.fog, this.house, this.houseOver, this.airBack.root, this.backG, this.rimBack, this.dogBack, this.wolfBack, this.ghostLayer, this.rimRig.root, this.rig.root, this.frontG, this.rimFront, this.dogFront, this.wolfFront, this.splitLayer, this.wolfHud, this.headMarks, this.overG, this.parts.root);
    for (let i = 0; i < 48; i++) {
      const t = new Text({ text: '', style: { fontFamily: MINCHO, fontWeight: '800', fontSize: 22, fill: 0xffffff, stroke: { color: 0x000000, width: 5 } } });
      t.anchor.set(0.5);
      t.visible = false;
      this.world.addChild(t);
      this.nums.push(t);
      this.numOwner.push(-1);
    }
    for (let i = 0; i < 4; i++) {
      const t = new Text({ text: '♪', style: { fontFamily: MINCHO, fontWeight: '800', fontSize: 30, fill: 0xffe070, stroke: { color: 0x40202a, width: 5 } } });
      t.anchor.set(0.5);
      t.visible = false;
      this.world.addChild(t);
      this.markText.push(t);
    }
    for (let i = 0; i < DOG_ORDER.length; i++) {
      const t = new Text({ text: '', style: { fontFamily: MINCHO, fontWeight: '800', fontSize: 22, fill: 0xffe0a0, stroke: { color: 0x000000, width: 5 } } });
      t.anchor.set(0.5, 1);
      t.visible = false;
      this.world.addChild(t);
      this.roleText.push(t);
    }
    this.grade.blendMode = 'multiply';
    this.whiteFilter.matrix = [0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0];
    st.addChild(this.grade, this.screenParts.root, this.screen);
    for (let i = 0; i < 2; i++) {
      const t = new Text({ text: '', style: { fontFamily: MINCHO, fontWeight: '800', fontSize: 14, fill: 0xffffff, stroke: { color: 0x000000, width: 4 } } });
      t.anchor.set(0.5);
      st.addChild(t);
      this.edgeText.push(t);
    }
    st.addChild(this.mini.root);
    // 明朝の字が読み込まれる前に作った文字は、代わりの字で描かれたまま残る → 読み込めたら描き直す
    document.fonts?.ready.then(() => {
      for (const t of [...this.nums, ...this.markText, ...this.roleText, ...this.edgeText]) t.style.fontFamily = MINCHO;
    }).catch(() => {});
    Assets.load<Texture>(`${import.meta.env.BASE_URL}ui/moon.webp`).then((t) => {
      this.backdrop.moonArt.texture = t;
      this.backdrop.moonArt.visible = true;
      this.mini.setArt({ moon: t });
      this.lastWave = '';
    }).catch((e) => console.warn('moon', e));
    // 草と小物の絵（手前の草・道の縁）
    const PROPS = ['grass', 'flowers', 'petals', 'stones', 'fence', 'nanohana', 'dandelion', 'azalea', 'sapling'];
    Assets.load(PROPS.map((n) => ({ alias: `prop-${n}`, src: `${import.meta.env.BASE_URL}props/${n}.webp` }))).then((t) => {
      this.backdrop.props = Object.fromEntries(PROPS.map((n) => [n, (t as Record<string, Texture>)[`prop-${n}`]]));
      this.lastWave = '';
    }).catch((e) => console.warn('props', e));
    // 背景の町並みの絵。読み込めたら背景を作り直す（読めなければ影絵のまま）
    Assets.load<Texture>(`${import.meta.env.BASE_URL}bg/town.webp`).then((t) => {
      this.backdrop.town = t;
      this.mini.setArt({ town: t });
      this.lastWave = ''; // 次の draw で作り直す
    }).catch((e) => console.warn('town', e));
    // 狼の絵。読み込めなければ箱のまま
    this.wolves.load().catch((e) => console.warn('wolves', e));
    const MARKS = [...new Set(Object.values(COLORS).map((c) => c.icon))];
    Assets.load(MARKS.map((n) => ({ alias: `mark-${n}`, src: `${import.meta.env.BASE_URL}ui/icons/${n}.webp` }))).then((t: Record<string, Texture>) => {
      for (const n of MARKS) this.markTex[n] = t[`mark-${n}`];
    }).catch((e) => console.warn('marks', e));
    this.house.visible = false;
    this.dogArt.load(['house']).then(() => {
      const m = this.dogArt.meta['house' as DogArt];
      this.house.texture = this.dogArt.tex['house' as DogArt];
      this.house.anchor.set(m.feet[0] / m.size[0], m.feet[1] / m.size[1]);
      this.house.visible = true;
      this.mini.setArt({ house: this.house.texture, houseFeet: [m.feet[0], m.feet[1]] });
    }).catch((e) => console.warn('dogs', e));
    // 赤ずきんの絵。読み込めなければ箱のまま遊べる（?rig=0 で箱：見比べ用）
    if (new URLSearchParams(location.search).get('rig') !== '0') {
      const all = [this.rig, ...Array.from({ length: GHOSTS }, () => new HeroRig())];
      Promise.all([...all.map((r) => r.load()), this.rimRig.load(), this.mini.load()]).then(() => {
        for (let i = 1; i < all.length; i++) {
          this.ghostLayer.addChild(all[i].root);
          all[i].root.visible = false;
          this.ghosts.push({ rig: all[i], pose: null, t: 99, tint: 0xffffff });
        }
      }).catch((e) => console.warn('hero rig', e));
    }
    this.layout();
  }

  private layout() {
    const W = this.app.screen.width;
    const H = this.app.screen.height;
    const MM = Math.round(Math.max(64, Math.min(96, H * 0.13)));
    const Hm = H - MM;
    const K = W / VIEW_UNITS;
    this.geo = { W, H, Hm, MM, K, horizon: Hm * 0.58, laneTop: Hm * 0.63, laneH: Hm * 0.27 }; // 奥行きの帯を広く（奥と手前の差が読めなかった）
    this.backdrop.build(W, Hm, this.geo.horizon, FIELD_LENGTH * K);
    this.paraRoot.removeChildren();
    for (const l of this.backdrop.layers) this.paraRoot.addChild(l.c);
    this.world.addChildAt(this.backdrop.front.c, this.world.children.length);
    this.buildPathProps();
    this.mini.layout(W, Hm, MM);
    this.lastWave = `${W}x${H}`;
  }

  // 道の縁の小物：奥の縁に花・小石・花びらの山、手前の縁に小さな草（決まった並び。作り直しても同じ）
  private pathProps = new Container();
  private buildPathProps() {
    this.pathProps.removeChildren();
    const P = this.backdrop.props;
    if (!P) return;
    if (!this.pathProps.parent) this.world.addChildAt(this.pathProps, this.world.getChildIndex(this.house));
    let seed = 99;
    const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const g = this.geo;
    const put = (k: string, x: number, y: number, hh: number) => {
      const sp = new Sprite(P[k]);
      sp.anchor.set(0.5, 1);
      sp.scale.set((hh / sp.texture.height) * (r() < 0.5 ? -1 : 1), hh / sp.texture.height);
      sp.position.set(x, y);
      this.pathProps.addChild(sp);
    };
    const x0 = this.wx(HOUSE_X + 60);
    const x1 = this.wx(HERO.maxX);
    for (let x = x0; x < x1; x += 60 + r() * 120) {
      const k = ['nanohana', 'dandelion', 'petals', 'azalea', 'flowers', 'stones', 'sapling'][Math.floor(r() * 7)]; // 春の夜にそろえる
      put(k, x, this.wy(0) - 6, g.Hm * (k === 'sapling' ? 0.14 : k === 'petals' || k === 'stones' ? 0.045 : 0.065));
    }
  }

  // ── 座標 ──
  private wx(x: number) { return x * this.geo.K; }
  // 昼は引いて全体を映すので、体と奥行きを盛る（小さい地図と同じ考え）。dayK は昼への移り変わり（0〜1）
  private dayK = 0;
  private moonProg = 0;
  private wy(lane: number) { return this.geo.laneTop + lane * this.geo.laneH * (1 + 2.2 * this.dayK); }
  private ds(lane: number) { return 0.86 + 0.24 * lane; } // 手前ほど大きい
  private U(lane: number) { return this.geo.Hm * 0.0027 * this.ds(lane) * (1 + 1.6 * this.dayK); } // 体の大きさ1あたりの画素
  private heroH(lane: number) { return this.geo.Hm * 0.4 * this.ds(lane) * (1 + 1.6 * this.dayK); }
  private zk() { return this.geo.K * 0.9; } // 高さ（間合い）→画素

  // 画面の点 → 戦場（間合いと奥行き）。小さい地図の上なら sprint
  toField(sx: number, sy: number): { x: number; lane: number; mini: boolean; sky?: boolean } | null {
    const g = this.geo;
    if (sy >= g.Hm) {
      const m = this.mini.toField(sx, sy - g.Hm);
      return m ? { ...m, mini: true } : null;
    }
    const wxp = (sx - g.W / 2) / this.cam.z + this.cam.x;
    const wyp = (sy - g.Hm / 2) / this.cam.z + this.cam.y;
    const raw = (wyp - g.laneTop) / (g.laneH * (1 + 2.2 * this.dayK));
    return { x: wxp / g.K, lane: Math.max(0, Math.min(1, raw)), mini: false, sky: raw < -0.15 }; // sky：地面より上（空）に触れた
  }

  // 画面の点にある狼（絵の範囲で決める。重なっていれば手前の狼）。無ければ 0
  wolfAt(sx: number, sy: number) {
    const { z, ox, oy } = this.xf;
    const x = (sx - ox) / z;
    const y = (sy - oy) / z;
    const pad = 14 / z;
    let best = 0;
    let bl = -1;
    for (const b of this.wolfBoxes) {
      if (x < b.x0 - pad || x > b.x1 + pad || y < b.y0 - pad || y > b.y1 + pad) continue;
      if (b.lane > bl) { bl = b.lane; best = b.id; }
    }
    return best;
  }

  draw(sim: Sim, dtReal: number) {
    if (this.lastWave !== `${this.app.screen.width}x${this.app.screen.height}`) this.layout();
    const g = this.geo;
    const dt = Math.min(0.05, dtReal);
    this.vt += dt;
    const frozen = sim.hitStop > 0;
    const pdt = frozen ? dt * 0.08 : dt; // ヒットストップのあいだは粒もほぼ止める
    const h = sim.hero;
    const day = sim.phase === 'shop' ? 1 : 0;
    if (day) this.tidyDye(sim);
    this.dayK += (day - this.dayK) * (1 - Math.exp(-dt * 3));
    if (Math.abs(day - this.dayK) < 0.002) this.dayK = day;

    // ── カメラ ──
    let tz: number;
    let tx: number;
    let ty: number;
    if (day) {
      // 昼：家から番犬を置ける所の先まで（番犬の持ち場を決める画面）
      const x0 = -170 * g.K;
      const x1 = 520 * g.K; // 家と番犬3匹が見える所まで
      tz = g.W / (x1 - x0);
      tx = (x0 + x1) / 2;
      // 地面の手前の縁が、画面の下（今夜の予告の帯の上）で終わるように（下が何もない地面で間延びしていた。2026-10-04 アマネさん）
      const groundEnd = g.laneTop + g.laneH * 1.05 * (1 + 2.2 * this.dayK) + g.Hm * 0.02;
      ty = groundEnd - (g.Hm / 2 - g.Hm * 0.15) / tz;
    } else {
      const fast = h.running > 400 || h.move === 'tosshin' || h.move === 'issen' || h.ouran > 0;
      // 少し引いて広く映す（2026-10-04 アマネさん「ステージ狭い？」。寄りすぎて主人公と狼2匹で画面がいっぱいだった）
      tz = 0.85 * (fast ? 0.9 : 1) * (1 + sim.punch * 0.2) * (sim.finale > 0 ? 1.12 : 1); // 締めの一撃で寄る・最後の1匹のスローでさらに寄る
      tz *= CAM_ZOOM;
      tx = this.wx(h.x) + (CAM_CENTER ? 0 : h.facing * g.W * 0.14);
      // 左の端は家の右半分（戸口と二階）が映るところまで
      const houseL = this.house.visible ? this.house.x - this.house.width * 0.28 : -this.heroH(1) * 1.2;
      // 家の前では、主人公を右へ寄せて家を広く映す（家が画面の外で、守っている感じがしなかった）
      const nearHome = Math.max(0, Math.min(1, (240 - h.x) / 150));
      if (nearHome > 0 && !CAM_CENTER) tx += (Math.max(houseL + g.W / 2 / tz, this.wx(h.x) - (g.W / 2 / tz) * 0.5) - tx) * nearHome;
      // 裂け目の近くでは、裂け目が画面の右に入るように寄せる（前はカメラが手前で止まり、裂け目が見えなかった）
      const nearRift = Math.max(0, Math.min(1, (h.x - 600) / 160));
      const riftR = this.wx(WOLF_SPAWN_X) + 170;
      if (nearRift > 0 && !CAM_CENTER) tx += (Math.min(riftR - g.W / 2 / tz, this.wx(h.x) + (g.W / 2 / tz) * 0.55) - tx) * nearRift;
      // 決めポーズ：主人公と、駆け寄ってくる番犬が両方映るように真ん中へ（前は進む向きの先を映していて、後ろに来た犬が画面の外だった）
      if (sim.cheer >= 0) {
        const near = sim.dogs.filter((d) => d.down <= 0 && Math.abs(d.x - h.x) < 260);
        const k = Math.min(1, sim.cheer / 0.4);
        if (near.length) tx += ((this.wx(h.x) + this.wx(near.reduce((a, d) => a + d.x, 0) / near.length)) / 2 - tx) * k;
      }
      // 狼王：引いて、主人公と狼王の間を映す（大きくて寄った画面に入らない）
      const king = sim.wolves.find((w) => w.kind === 'king' && w.age > 0.3);
      if (king) {
        tz *= 0.6;
        tx = (this.wx(h.x) + this.wx(king.x)) / 2;
      }
      tx = Math.max(houseL + g.W / 2 / tz, Math.min(riftR - g.W / 2 / tz, tx));
      ty = g.Hm / 2 - Math.min(h.z * this.zk() * 0.15, g.Hm * 0.08) - (king ? g.Hm * 0.12 : 0);
    }
    const kc = 1 - Math.exp(-dt * (day ? 3 : 7));
    if (!this.cam.x) this.cam = { x: tx, y: ty, z: tz };
    this.cam.x += (tx - this.cam.x) * kc;
    this.cam.y += (ty - this.cam.y) * kc;
    this.cam.z += (tz - this.cam.z) * (sim.punch > 0.6 ? 0.5 : kc);
    // 画面の揺れ：当てた向きへ押してから戻る（ランダムだけより重く感じる）
    const s = sim.shake;
    const sx = (Math.random() - 0.5) * s + sim.shakeDir * s * 0.5;
    const sy = (Math.random() - 0.5) * s;
    const z = this.cam.z;
    const ox = g.W / 2 - this.cam.x * z + sx;
    const oy = g.Hm / 2 - this.cam.y * z + sy;
    this.world.scale.set(z);
    this.world.position.set(ox, oy);
    // 奥の花びらは画面の座標で動かす（世界の中に入れて、カメラの動きを打ち消す）
    this.airBack.root.scale.set(1 / z);
    this.airBack.root.position.set(-ox / z, -oy / z);
    this.xf = { z, ox, oy };
    for (const l of this.backdrop.layers) {
      l.c.scale.set(z);
      l.c.position.set(g.W / 2 - this.cam.x * l.f * z + sx * l.f, oy);
    }
    const fr = this.backdrop.front;
    fr.c.position.set(this.cam.x * (1 - fr.f), 0); // 世界の中で、さらに速く流す
    const horizonS = g.horizon * z + oy;
    const dl = this.dayLift.clear();
    if (this.dayK > 0.01) {
      dl.rect(0, horizonS - g.Hm * 0.3 * z, g.W, g.Hm * 0.3 * z).fill({ color: 0x302820, alpha: this.dayK });
      dl.rect(0, horizonS, g.W, g.Hm - horizonS).fill({ color: 0x584838, alpha: this.dayK });
    }
    // 空：夜が進むと月が左へ傾いていき、最後の1匹を倒すと空の端が白み始める（決めポーズのあいだに夜明けへ）
    const pend = sim.phase === 'wave' ? sim.pending().reduce((a, e) => a + e.n, 0) + sim.sleepers.length : 0;
    const total = sim.nightKills + sim.wolves.length + pend;
    const prog = sim.phase === 'wave' && total > 0 ? sim.nightKills / total : this.moonProg;
    this.moonProg += (prog - this.moonProg) * Math.min(1, dt * 0.8);
    const dawn = sim.cheer >= 0 ? 0.45 * Math.min(1, sim.cheer / 1.5) : 0;
    const skyK = Math.max(this.dayK, dawn);
    this.backdrop.update(this.vt, g.W, horizonS, skyK, 0);
    const mx = g.W * (0.84 - 0.3 * this.moonProg * (1 - this.dayK)) - this.cam.x * 0.02;
    const my = g.Hm * (0.17 - 0.05 * this.dayK + 0.03 * this.moonProg * (1 - this.dayK));
    this.backdrop.moon.position.set(mx, my);
    this.drawClouds(sim, dt, mx, my);
    UnitArt.rimK = 0.5 * (1 - skyK);

    // ── 新しい出来事から演出を起こす ──
    for (const f of sim.fx) {
      if (f.id <= this.seen) continue;
      this.spawn(sim, f);
    }
    if (sim.fx.length) this.seen = Math.max(this.seen, sim.fx[sim.fx.length - 1].id);
    this.ambient(sim, dt);

    // ── 地面・家・裂け目・影 ──
    const gr = this.ground.clear();
    if (!day) this.drawPath(gr, sim);
    if (sim.phase === 'wave' && this.lastPhase !== 'wave') this.groundPetals = []; // 晩の始まりに道をきれいに
    this.lastPhase = sim.phase;
    this.drawGroundMarks(gr, sim, dt);
    this.drawLamps(gr, sim);
    // 夜霧：地面すれすれを、平たい霧の塊がゆっくり左へ流れる
    const span = FIELD_LENGTH * g.K + g.W * 2;
    this.fog.forEach((f, i) => {
      f.visible = !day;
      f.width = g.W * (1.1 + 0.3 * Math.sin(i * 2.3));
      f.height = g.Hm * 0.12;
      f.x = ((((i * 0.37 * span - this.vt * (14 + i * 3)) % span) + span) % span) - g.W;
      f.y = this.wy(((i * 0.29) % 1) * 1.1 - 0.05) + g.Hm * 0.02;
      f.alpha = (0.09 + 0.03 * Math.sin(this.vt * 0.5 + i)) * (sim.mood === 'kiri' ? 3.2 : 1); // 濃いと画面全体が白くかすんだ（霧の夜だけ濃く）
    });
    this.drawHouse(gr, sim, dt);
    this.drawRift(gr, sim);
    const shadow = (x: number, lane: number, w: number, zz: number) => {
      const k = Math.max(0.35, 1 - zz / 300);
      gr.ellipse(this.wx(x), this.wy(lane) + 2, w * 0.55 * k, w * 0.13 * k).fill({ color: 0x000000, alpha: 0.42 * k });
    };
    const dogs: Dog[] = day ? DOG_ORDER.map((kind, i) => {
      const home = Sim.dogHome(kind);
      return { id: -i - 1, x: 230 + i * 75, lane: home.lane, hp: 1, maxHp: 1, size: DOGS[kind].size, cooldown: 0, hitFlash: 0, kind, role: sim.roles[kind], bite: 0, target: 0, down: 0, facing: 1 as const, run: 0 };
    }) : sim.dogs;
    // 番犬の足もとの輪：役目の色（守り＝青・攻撃＝赤・支援＝緑）
    for (const d of dogs) {
      if (d.down > 0) continue;
      shadow(d.x, d.lane, d.size * this.U(d.lane), 0);
      const r = d.size * this.U(d.lane) * 0.6;
      gr.ellipse(this.wx(d.x), this.wy(d.lane) + 2, r, r * 0.25).stroke({ width: 3, color: ROLE_COLOR[d.role], alpha: 0.75 });
    }
    this.roleText.forEach((t, i) => {
      const d = dogs[i];
      t.visible = !!day && !!d;
      if (!t.visible) return;
      t.text = DOG_ROLES[d.role].name;
      t.style.fill = ROLE_COLOR[d.role];
      t.scale.set(1 / this.cam.z); // 引いた昼の画面でも読める大きさ
      t.position.set(this.wx(d.x), this.wy(d.lane) - this.heroH(d.lane) * 0.42 * DOG_REL[d.kind] * 1.05);
    });
    // 画面の外の狼は描かない（狼が150匹の晩で、描画の半分が狼だった）
    const vx0 = -ox / z - 250;
    const vx1 = (g.W - ox) / z + 250;
    const seen = sim.wolves.filter((w) => { const wx = this.wx(w.x); return wx > vx0 && wx < vx1; });
    for (const w of seen) shadow(w.x, w.lane, w.size * this.U(w.lane), w.z);
    if (h.down <= 0) shadow(h.x + this.petShift / g.K, h.lane - this.petLift / (this.wy(1) - this.wy(0)), this.heroH(h.lane) * 0.5, h.z); // なでるときは寄せた絵の足もとに
    // 溜めの足もとの光
    if (h.charge >= 0) {
      const c = Math.min(1, h.charge / sim.chargeFull);
      const r = this.heroH(h.lane) * (0.35 + 0.25 * c);
      gr.ellipse(this.wx(h.x), this.wy(h.lane), r, r * 0.25).stroke({ width: 3 + 3 * c, color: c >= 1 ? 0xffe070 : 0xff9050, alpha: 0.5 + 0.4 * Math.sin(this.vt * 30) * c });
    }
    // ── 体（奥から手前へ。主人公より奥は backG、手前は frontG）──
    const bg = this.backG.clear();
    const fg = this.frontG.clear();
    this.wolfHud.clear();
    this.markUsed = 0;
    this.wolves.begin();
    this.dogArt.begin();
    type Item = { lane: number; draw: (gg: Graphics) => void };
    const items: Item[] = [];
    for (const d of dogs) items.push({ lane: d.lane, draw: (gg) => this.drawDog(gg, d, sim) });
    this.wolfBoxes.length = 0;
    for (const w of seen) items.push({ lane: w.lane, draw: (gg) => this.drawWolf(gg, w, sim) });
    for (const w of sim.sleepers) items.push({ lane: w.lane, draw: (gg) => this.drawSleeper(gg, w) });
    items.sort((a, b) => a.lane - b.lane);
    for (const it of items) it.draw(it.lane <= h.lane ? bg : fg);
    this.wolves.end();
    this.dogArt.end();
    for (let i = this.markUsed; i < this.headMarks.children.length; i++) this.headMarks.children[i].visible = false;

    // ── 主人公 ──
    const hx = this.wx(h.x);
    // なでる：伸ばした手のひらが犬の頭（犬の絵の、主人公の側の端の少し手前）に届くよう、主人公の絵を少し寄せる。
    // しゃがんだ絵の手は低く、秋田・土佐では首や胸に当たっていた（2026-10-04 アマネさん「手のひらと犬の頭の高さがズレてる」）。
    // 足りない高さの分だけ主人公を奥（画面の上）へずらし、犬の向こうから頭の上へ手を伸ばす形にする。
    // sim の並ぶ所は画面の縦横の比を知らないので、ここで合わせる
    const pd = sim.petting;
    let petWant = 0;
    let liftWant = 0;
    if (pd && this.dogArt.ready && this.rig.ready) {
      const m = this.dogArt.meta[pd.kind];
      const dh = this.heroH(pd.lane) * 0.42 * DOG_REL[pd.kind];
      const head = ((m.size[0] - m.feet[0]) / m.feet[1]) * dh; // 犬の足もとの真ん中から鼻先まで
      const dxs = this.wx(pd.x);
      const side = dxs >= hx ? 1 : -1;
      const hand = dxs - side * head * 0.7;
      const H = this.heroH(h.lane);
      const reach = this.rig.petReach(H);
      petWant = Math.max(-H * 0.6, Math.min(H * 0.6, hand - side * reach.x - hx));
      // 手のひらの下の縁を頭のてっぺんより少しだけ下に（毛に沈む）
      const crown = this.wy(h.lane) - this.wy(pd.lane) + dh * DOG_CROWN[pd.kind];
      liftWant = Math.max(0, Math.min(H * 0.4, crown - dh * 0.03 - reach.y));
    }
    this.petShift += (petWant - this.petShift) * Math.min(1, dt * 12);
    this.petLift += (liftWant - this.petLift) * Math.min(1, dt * 12);
    const hy = this.wy(h.lane) - this.petLift;
    const pose = this.rig.pose(sim, hx + this.petShift, hy, this.heroH(h.lane), this.vt, this.zk() * 0.75, this.gunAim(sim, hx, hy));
    if (pose) {
      // ガス灯の近くでは、ほんのり橙に照らされる
      const lamp = this.lamps.find((l) => Math.abs(l.x - h.x) < 80);
      if (lamp && pose.tint === 0xffffff && !day) pose.tint = 0xfff0dc;
      this.rig.apply(pose);
      if (this.rimRig.ready) {
        this.rimRig.root.visible = skyK < 0.99;
        this.rimRig.apply({ ...pose, x: pose.x + 3, y: pose.y - 3 }, 0xff4060, 0.5 * (1 - skyK) * pose.alpha);
      }
      this.afterimages(sim, pose, dt);
      this.trackBlade(sim);
    } else this.boxHero(fg, sim, hx, hy);
    const top = hy - this.heroH(h.lane) * 1.3 - h.z * this.zk() * 0.75;
    this.trackMarks(sim, dt);
    const toScreen = (x: number, y: number) => ({ x: x * z + ox, y: y * z + oy });
    this.heroAt = toScreen(hx, top - 6);
    const bodyTop = toScreen(hx, top);
    const bodyFoot = toScreen(hx, hy);
    const bh = bodyFoot.y - bodyTop.y;
    this.screenParts.avoid = { x: bodyFoot.x, y: (bodyTop.y + bodyFoot.y) / 2, rx: bh * 0.4, ry: bh * 0.62 };

    // ── 矢・砲弾・衝撃波・斬撃の弧・数字 ──
    this.drawOver(sim, dt);
    // 主砲の溜め：頭の上の丸い目盛り。撃てる所（短い印）から満タンまで溜まり、満タンで金色に脈打つ（ボタンをやめた代わり）
    if (h.charge >= 0) {
      const o = this.overG;
      const r = this.heroH(h.lane) * 0.07;
      const cx = hx;
      const cy = top - r * 2.2;
      const c = Math.min(1, h.charge / sim.chargeFull);
      const full = c >= 1;
      const a0 = -Math.PI / 2;
      o.circle(cx, cy, r + 3).fill({ color: 0x000000, alpha: 0.5 });
      o.circle(cx, cy, r).stroke({ width: 4, color: 0xffffff, alpha: 0.18 });
      o.moveTo(cx + Math.cos(a0) * r, cy + Math.sin(a0) * r).arc(cx, cy, r, a0, a0 + Math.PI * 2 * Math.max(0.001, c)).stroke({ width: 4, color: full ? 0xffe070 : h.charge >= sim.chargeMin ? 0xffa040 : 0xa08070, cap: 'round' });
      const am = a0 + (Math.PI * 2 * sim.chargeMin) / sim.chargeFull;
      o.moveTo(cx + Math.cos(am) * (r - 5), cy + Math.sin(am) * (r - 5)).lineTo(cx + Math.cos(am) * (r + 5), cy + Math.sin(am) * (r + 5)).stroke({ width: 2, color: 0xffffff, alpha: 0.8 });
      if (full) o.circle(cx, cy, r + 6 + 3 * Math.sin(this.vt * 20)).stroke({ width: 2, color: 0xffe070, alpha: 0.7 });
    }
    // 主人公の体力の棒（減ったときだけ）
    if (!day && h.down <= 0 && h.hp < sim.maxHp) {
      const w = this.heroH(h.lane) * 0.42;
      const o = this.overG;
      o.roundRect(hx - w / 2 - 1, top - 1, w + 2, 7, 3).fill({ color: COLOR.hpBack, alpha: 0.7 });
      o.roundRect(hx - w / 2, top, (w * Math.max(0, h.hp)) / sim.maxHp, 5, 2).fill(h.hp < sim.maxHp * 0.3 ? 0xff4050 : COLOR.heroHp);
    }

    // 締めの一撃：一瞬だけ世界の色が抜け、斬撃と花びら（演出の粒は色のまま）が残る
    if (sim.events.includes('finisher')) this.mono = 0.22;
    this.mono = Math.max(0, this.mono - dt);
    const monoOn = this.mono > 0;
    if (monoOn) {
      this.monoFilter.desaturate();
      this.monoFilter.alpha = Math.min(1, this.mono / 0.12);
    }
    for (const c of [this.paraRoot, this.ground, this.house, this.dogBack, this.dogFront, this.wolfBack, this.wolfFront, this.rig.root, this.backdrop.sky]) c.filters = monoOn ? [this.monoFilter] : null;
    // 一瞬の白い影：大きな一撃の2〜4コマだけ、狼を真っ白に抜き、まわりを暗くする（打撃の重さ）
    if (sim.events.includes('finisher')) this.impact = Math.max(this.impact, 0.07);
    this.impact = Math.max(0, this.impact - dt);
    if (this.impact > 0) for (const c of [this.wolfBack, this.wolfFront, this.splitLayer]) c.filters = [this.whiteFilter];
    else this.splitLayer.filters = null;
    this.runSplits(dt);
    this.watchCombo(sim);
    // 色の仕上げ：画面全体に、夜は藍・昼は暖かい色を薄く掛ける
    const gd = this.grade.clear();
    gd.rect(0, 0, g.W, g.Hm).fill({ color: mix(0xbcb4ec, 0xfff0d8, skyK), alpha: 0.35 });
    this.parts.update(pdt);
    this.parts.draw();
    this.airBack.update(dt);
    this.airBack.draw();
    this.screenParts.update(dt);
    this.screenParts.draw();

    // ── 画面に固定の演出 ──
    this.drawScreen(sim, dt, z, ox);
    this.mini.draw(sim, this.vt, { x0: (0 - ox) / z / g.K, x1: (g.W - ox) / z / g.K }, day);
  }

  // ── 出来事 → 演出 ──
  private spawn(sim: Sim, f: Fx) {
    const P = this.parts;
    const h = sim.hero;
    const x = this.wx(f.x);
    const y = this.wy(f.lane);
    const s = this.ds(f.lane) * this.geo.Hm / 600;
    const zy = (f.z ?? 0) * this.zk();
    switch (f.kind) {
      case 'spark': {
        const wolf = this.geo.Hm * 0.06;
        P.hit(x, y - zy - wolf, f.dir ?? 1, s, !!f.big);
        if (f.big) this.flash = Math.max(this.flash, 0.22);
        if (f.big) this.impact = Math.max(this.impact, 0.05);
        break;
      }
      case 'slash': {
        // 斬撃の弧。技ごとに向きと大きさを変える（右向きで決めて、左向きは裏返す）
        const dir = f.dir ?? 1;
        const hh = this.heroH(h.lane);
        const cx = this.wx(h.x) + dir * hh * 0.2;
        const cy = this.wy(h.lane) - hh * 0.45 - h.z * this.zk() * 0.75;
        const D = Math.PI / 180;
        const mir = (a: number) => (dir > 0 ? a : Math.PI - a);
        // 斬りはコンボの拍で弧を変える：1拍目は上から振り下ろす横なぎ・2拍目は下から返す・3拍目は前へまっすぐの突き
        const k = h.step % 3;
        let [a0, a1, r, w] = k === 0 ? [-115 * D, 35 * D, hh * 0.36, hh * 0.05] : k === 1 ? [45 * D, -105 * D, hh * 0.34, hh * 0.045] : [-12 * D, 12 * D, hh * 0.6, hh * 0.05];
        if (f.move === 'issen') [a0, a1, r, w] = [-160 * D, 70 * D, hh * 0.6, hh * 0.1];
        if (f.move === 'launch') [a0, a1, r, w] = [120 * D, -75 * D, hh * 0.44, hh * 0.07];
        if (f.move === 'air') [a0, a1, r, w] = [-60 * D, 70 * D, hh * 0.32, hh * 0.05];
        if (f.move === 'slam') [a0, a1, r, w] = [-140 * D, 70 * D, hh * 0.48, hh * 0.08];
        if (f.move === 'tosshin') {
          // 突進で斬った狼に、横一文字（大きな半径のほぼまっすぐな弧）
          const wy = y - this.geo.Hm * 0.07;
          const R = hh * 2.2;
          P.arc(x, wy + R, R, mir(-90 * D - 0.2), mir(-90 * D + 0.2), hh * 0.06, 0xffffff, 0.16);
          break;
        }
        // 斬り・追い打ちの弧は刃先の軌跡が描く（決まった位置の弧は刃の通り道とずれた）。大きな技だけ弧を重ねる
        if (f.move === 'launch' || f.move === 'slam' || f.move === 'issen' || f.big) P.arc(cx, cy, r, mir(a0), mir(a1), w, f.big ? 0xff5080 : 0xffa0b8, f.move === 'slam' || f.move === 'issen' ? 0.22 : 0.15);
        break;
      }
      case 'dash': {
        const dir = f.dir ?? 1;
        P.dust(x, y, s * 1.4, 6, 50, 60);
        for (let i = 0; i < 6; i++) P.petal(x, y - 4, s, -dir * (100 + Math.random() * 200), -120 - Math.random() * 200); // 足もとの花びらを巻き上げる
        P.glow(x, y - this.heroH(f.lane) * 0.5, this.heroH(f.lane) * 1.1, 0xff6090, 0.2, 0.5);
        for (let i = 0; i < 8; i++) {
          const ly = Math.random() * this.geo.Hm * 0.8 + this.geo.Hm * 0.1;
          this.screenParts.line(dir > 0 ? this.geo.W : -this.geo.W * 0.6, ly, this.geo.W * (0.3 + Math.random() * 0.4), -dir * this.geo.W * 5, 0xffffff, 0.5, 0.18, 1.5 + Math.random() * 2);
        }
        break;
      }
      case 'pound': {
        P.ring(x, y, 10, (f.r ?? 80) * this.geo.K * 1.6, 6 * s, 0xffe0c0, 0.35, 0.28);
        P.debris(x, y - 4, s, 14, y + 6);
        P.dust(x, y, s * 1.8, 8, 90, 50);
        for (let i = 0; i < 10; i++) P.petal(x + (Math.random() - 0.5) * 80, y, s, (Math.random() - 0.5) * 300, -200 - Math.random() * 300); // 地面の花びらが舞い上がる
        this.flash = Math.max(this.flash, 0.2);
        this.impact = Math.max(this.impact, 0.05);
        break;
      }
      case 'land':
        P.dust(x, y, s * (f.big ? 1.8 : 1), f.big ? 8 : 4, f.big ? 70 : 40, 30);
        if (f.big) {
          P.debris(x, y - 4, s, 8, y + 6);
          P.ring(x, y, 8, (f.r ?? 60) * this.geo.K * 1.3, 4 * s, 0xd0c0a0, 0.3, 0.28);
        }
        break;
      case 'blast': {
        const r = (f.r ?? 60) * this.geo.K;
        const by = y - this.geo.Hm * 0.08;
        P.glow(x, by, r * 2.6, f.big ? 0xffd080 : 0xffa040, 0.35, 1, 0.4);
        P.glow(x, by, r * 1.2, 0xffffff, 0.15, 1, 0.8);
        P.ring(x, by, r * 0.2, r * 1.3, 8 * s, 0xffc070, 0.32);
        P.ring(x, y, r * 0.3, r * 1.5, 5 * s, 0xffe0c0, 0.4, 0.28);
        P.debris(x, y - 6, s, f.big ? 22 : 12, y + 6);
        P.dust(x, y, s * 2.2, 10, 120, 80);
        for (let i = 0; i < (f.big ? 16 : 6); i++) P.petal(x, by, s, (Math.random() - 0.5) * 700, -Math.random() * 500);
        this.flash = Math.max(this.flash, f.big ? 0.55 : 0.3);
        this.flashColor = 0xfff0d0;
        this.impact = Math.max(this.impact, f.big ? 0.08 : 0.05);
        // 着いた地面に桜の紋が焼き付く（数秒で冷めて消える）
        this.crests.push({ x: f.x, lane: f.lane, r: (f.r ?? 60) * (f.big ? 1.1 : 0.8), t: 0 });
        if (this.crests.length > 8) this.crests.shift();
        break;
      }
      case 'muzzle': {
        const dir = f.dir ?? 1;
        const hh = this.heroH(f.lane);
        const my = y - hh * 0.62;
        P.glow(x + dir * hh * 0.25, my, hh * (f.big ? 1.6 : 1.1), 0xffe0a0, 0.18, 1, 0.3);
        for (let i = 0; i < 10; i++) P.line(x, my + (Math.random() - 0.5) * hh * 0.2, dir * hh * (0.6 + Math.random() * 0.8), 0, 0xfff0c0, 0.9, 0.12, 3);
        P.dust(x - dir * hh * 0.3, y, s * 1.6, 6, 60, 30); // 反動の土煙
        P.gunSmoke(x + dir * hh * 0.3, my, s, dir); // 砲口からたなびく白い煙
        P.casing(x - dir * hh * 0.1, my, s, dir, y + 4); // 金の薬莢が跳ねる
        if (f.big) P.casing(x - dir * hh * 0.15, my + 6, s, dir, y + 6);
        break;
      }
      case 'full':
        P.ring(x, y - this.heroH(f.lane) * 0.5, this.heroH(f.lane) * 0.9, 10, 4, 0xffe070, 0.25);
        P.glow(x, y - this.heroH(f.lane) * 0.5, this.heroH(f.lane) * 1.4, 0xffd060, 0.3, 0.9);
        this.flash = Math.max(this.flash, 0.15);
        this.flashColor = 0xfff0a0;
        break;
      case 'spin': {
        const r = (f.r ?? 90) * this.geo.K;
        const cy = y - this.heroH(f.lane) * 0.4;
        P.arc(x, cy, r * 0.8, 0, Math.PI * 1.9, this.heroH(f.lane) * 0.08, f.big ? 0xffd060 : 0xff80a0, 0.28);
        P.ring(x, y, r * 0.3, r * 1.2, 4 * s, 0xffffff, 0.3, 0.3);
        for (let i = 0; i < (f.big ? 8 : 4); i++) P.petal(x, cy, s, (Math.random() - 0.5) * 600, -Math.random() * 300);
        break;
      }
      case 'poof':
        // 倒した狼：影の狼なので、黒い煙と紅い火の粉になって昇り、桜の花びらが散る
        P.pop(x, y - zy - this.geo.Hm * 0.05, s, f.r ?? 30);
        P.smoke(x, y - zy - this.geo.Hm * 0.06, s, 4);
        if (f.wolf) this.splitWolf(f, x, y - zy, s);
        for (let i = 0; i < 8; i++) P.ember(x + (Math.random() - 0.5) * 40 * s, y - zy - this.geo.Hm * 0.06, s);
        for (let i = 0; i < 6; i++) P.petal(x, y - zy - this.geo.Hm * 0.05, s, (Math.random() - 0.5) * 500 + (f.dir ?? 0) * 200, -150 - Math.random() * 300);
        // 道に花びらが積もる（夜が進むほど道が桜色に）
        for (let i = 0; i < 5; i++) this.groundPetals.push({ x: f.x + (Math.random() - 0.5) * 60, lane: Math.max(0, Math.min(1, f.lane + (Math.random() - 0.5) * 0.25)), r: 2.5 + Math.random() * 3, c: PINK[Math.floor(Math.random() * 4)], rot: Math.random() * 3 });
        if (this.groundPetals.length > 500) this.groundPetals.splice(0, this.groundPetals.length - 500);
        break;
      case 'miss':
        P.dust(x, y, s * 0.7, 2, 20, 20);
        break;
      case 'bite':
        this.houseFlash = 0.25;
        P.debris(this.wx(HOUSE_X), y - 30, s, 4, y + 6);
        break;
      case 'howl': {
        // 遠吠え：大きな輪が3重に広がり、裂け目が光る
        const hy = y - this.geo.Hm * 0.12;
        for (let i = 0; i < 3; i++) P.ring(x, hy, 10 + i * 12, this.geo.Hm * (0.45 + i * 0.2), 5 * s, 0xffd060, 0.45 + i * 0.12, 1);
        P.glow(x, hy, this.geo.Hm * 0.2, 0xffd060, 0.35, 0.6);
        P.glow(this.wx(WOLF_SPAWN_X), y - this.geo.Hm * 0.06, this.geo.Hm * 0.5, 0xffb040, 0.45, 0.8);
        break;
      }
      case 'wake':
        // 緑が起き上がる：緑の輪と光
        P.glow(x, y - this.geo.Hm * 0.06, this.geo.Hm * 0.25, 0x7ad87a, 0.4, 0.7);
        P.ring(x, y, 6, this.geo.Hm * 0.1, 3 * s, 0x9af09a, 0.4, 0.3);
        break;
      case 'sunfade':
        // 朝日で消える：金色の光に溶けて、花びらになる
        P.glow(x, y - this.geo.Hm * 0.08, this.geo.Hm * 0.3, 0xffe0a0, 0.6, 0.9);
        for (let i = 0; i < 10; i++) P.petal(x, y - this.geo.Hm * 0.06, s, (Math.random() - 0.5) * 300, -200 - Math.random() * 250);
        break;
      case 'emerge':
        P.glow(this.wx(WOLF_SPAWN_X), y - this.geo.Hm * 0.06, this.geo.Hm * (f.big ? 0.8 : 0.35), 0xff3040, 0.4, 0.9);
        P.ring(this.wx(WOLF_SPAWN_X), y, 6, this.geo.Hm * 0.12, 3, 0xff6070, 0.35, 0.3);
        break;
      case 'arrowhit': {
        // 矢が頭に当たった：桜色の輪と火花、花びら。矢は少しのあいだ刺さって残る
        const w = sim.wolves.find((o) => o.id === f.n);
        const rel = w ? WOLF_REL[w.kind] : 1;
        const hd = this.wolfHead(f.x, f.lane, f.z ?? 0, rel);
        P.ring(hd.x, hd.y, 4, this.geo.Hm * 0.07 * rel, 3 * s, 0xffc0d8, 0.22);
        P.glow(hd.x, hd.y, this.geo.Hm * 0.12, 0xff90b8, 0.15, 0.9, 0.6);
        P.flower(hd.x, hd.y, this.geo.Hm * 0.03 * rel, 0.55); // 当たった所に桜がぱっと咲く
        for (let i = 0; i < 4; i++) P.petal(hd.x, hd.y, s, (Math.random() - 0.3) * 260 * (f.dir ?? 1), -120 - Math.random() * 200, 0.6);
        if (f.big) break; // 千本桜のナイフは刺さったまま残さない（数が多い）
        this.stuck.push({ id: f.n ?? 0, x: f.x, lane: f.lane, z: f.z ?? 0, rel, t: 0, dir: f.dir ?? 1 });
        if (this.stuck.length > 12) this.stuck.shift();
        break;
      }
      case 'num':
        break;
    }
  }

  // 走りの土煙・花びらの舞い・低い体力の息づかい
  private ambient(sim: Sim, dt: number) {
    const h = sim.hero;
    const P = this.parts;
    const g = this.geo;
    this.ambientT -= dt;
    if (sim.hitStop > 0) return;
    if (this.ambientT <= 0) {
      this.ambientT = 0.05;
      if (h.running > 0 && h.z <= 0 && Math.random() < (h.running > 400 ? 0.9 : 0.45)) P.dust(this.wx(h.x) - h.facing * 14, this.wy(h.lane), this.ds(h.lane) * g.Hm / 600, 1, 20, 30);
      // 夜風の花びら（画面の右上から）。2層に分ける（2026-10-04 アマネさん「桜吹雪がキャラにかぶって目障り」）：
      //   奥：主人公・狼より後ろ。小さく、夜の色に沈めて少し透かす（遠くの空気）。前は全部が体の手前で、顔にかぶっていた
      //   手前：カメラのすぐ前を横切る玉ボケが画面に3〜5枚だけ。大きく半透明で、主人公の体の上では透ける
      this.gustT -= 0.05;
      if (this.gustT < -1.6) this.gustT = 6 + Math.random() * 7;
      const gust = this.gustT < 0;
      const SP = this.screenParts;
      const AB = this.airBack;
      const few = sim.phase === 'shop' ? 0.25 : sim.mood === 'sakura' ? 2.5 : 1; // 昼は花びらを4分の1に（多すぎた。2026-10-04 アマネさん）。桜吹雪の夜は多く
      if (Math.random() < 0.35 * few) AB.petal(g.W * (0.2 + Math.random() * 0.9), -10, 0.6, -30 - Math.random() * 40, 20 + Math.random() * 25, 7 + Math.random() * 4, NIGHT_PINK, 0.75);
      if (Math.random() < 0.15 * few) AB.petal(g.W * (0.4 + Math.random() * 0.7), -10, 1.2, -90 - Math.random() * 80, 60 + Math.random() * 50, 3 + Math.random() * 2, NIGHT_PINK, 0.85);
      if (gust && Math.random() < few) for (let i = 0; i < 3; i++) AB.petal(g.W + 10, Math.random() * g.Hm * 0.8, 0.6 + Math.random() * 0.6, -380 - Math.random() * 300, (Math.random() - 0.3) * 120, 2.5, NIGHT_PINK, 0.85);
      if (Math.random() < 0.07 * few) {
        const big = g.Hm * (0.035 + Math.random() * 0.03);
        SP.bokeh(g.W + big, g.Hm * (0.05 + Math.random() * 0.85), big, -(g.W / 1.6) * (0.8 + Math.random() * 0.5), 40 + Math.random() * 60, 2.4);
      }
      // 蛍のような光の粒（夜・画面に映っている地面の上）・裂け目の火の粉
      if (sim.phase === 'wave' && Math.random() < 0.35) {
        const x = this.cam.x - g.W / 2 / this.cam.z + Math.random() * (g.W / this.cam.z); // 画面に映っている所
        P.firefly(x, this.wy(Math.random()) - Math.random() * g.Hm * 0.25, g.Hm / 600);
      }
      if (Math.random() < 0.6) P.ember(this.wx(WOLF_SPAWN_X) + (Math.random() - 0.5) * 30, this.wy(Math.random()) - Math.random() * g.Hm * 0.2, g.Hm / 600);
      // 裂け目から黒い瘴気が漏れて昇る
      if (sim.phase === 'wave' && Math.random() < 0.35) P.smoke(this.wx(WOLF_SPAWN_X) + 30 + (Math.random() - 0.5) * 40, g.horizon - g.Hm * (Math.random() * 0.6) + g.Hm * 0.1, g.Hm / 600, 1);
      // 桜嵐：花吹雪
      // 桜嵐：竜巻に沿って花びらが渦を巻いて昇る（画面を横切る花吹雪は少しだけ）
      if (h.ouran > 0) {
        const hh = this.heroH(h.lane);
        const cx = this.wx(h.x);
        const gy = this.wy(h.lane);
        for (let i = 0; i < 10; i++) {
          const k = Math.random();
          const a = this.vt * 9 + Math.random() * Math.PI * 2;
          const rad = hh * (0.25 + 0.75 * k);
          P.petal(cx + Math.cos(a) * rad, gy - hh * 1.5 * k, (g.Hm / 600) * 1.3, -Math.sin(a) * rad * 5, -180 - 260 * k, 0.5 + Math.random() * 0.3);
        }
        for (let i = 0; i < 2; i++) this.screenParts.petal(g.W + 10, Math.random() * g.Hm, 1.6, -600 - Math.random() * 500, (Math.random() - 0.5) * 200, 1.4);
      }
      // 溜め：まわりから光の粒が集まる
      if (h.charge >= 0) {
        const hh = this.heroH(h.lane);
        const cx = this.wx(h.x);
        const cy = this.wy(h.lane) - hh * 0.5;
        for (let i = 0; i < 2; i++) {
          const a = Math.random() * Math.PI * 2;
          const d = hh * (0.6 + Math.random() * 0.4);
          P.line(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 2, 0, 0xffd080, 1, 0.01, 0);
          P.glow(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 16, 0xffc060, 0.25, 0.9, -0.8);
        }
      }
      // 遠吠えの狼のまわりの速さの線
      for (const w of sim.wolves) if (w.hasted && Math.random() < 0.3) P.line(this.wx(w.x) + w.size * this.U(w.lane) * 0.6, this.wy(w.lane) - w.size * this.U(w.lane) * 0.4 * Math.random(), w.size * this.U(w.lane) * 0.5, 120, 0xffff80, 0.6, 0.15, 1.5);
    }
  }

  // 残像：速く動いた瞬間の姿を、色を付けて少し残す
  private afterimages(sim: Sim, pose: Pose, dt: number) {
    if (!this.ghosts.length) return;
    const h = sim.hero;
    const fast = h.move === 'tosshin' || (h.order?.sprint && h.running > 0) || h.move === 'launch' || (h.move === 'slam' && h.z > 0) || h.lungeTo !== null;
    if (sim.hitStop <= 0) this.ghostT -= dt;
    if (fast && this.ghostT <= 0) {
      this.ghostT = 0.028;
      const g = this.ghosts.reduce((a, b) => (a.t > b.t ? a : b));
      g.pose = { ...pose };
      g.t = 0;
      g.tint = h.ouran > 0 ? 0xffd060 : 0xff5a8a;
    }
    for (const g of this.ghosts) {
      if (sim.hitStop <= 0) g.t += dt;
      const life = 0.2;
      const on = g.pose && g.t < life;
      g.rig.root.visible = !!on;
      if (on) g.rig.apply(g.pose!, g.tint, 0.55 * (1 - g.t / life));
    }
  }

  // ── 狼（箱。動きで生き物に見せる）──
  private drawWolf(g: Graphics, w: Wolf, sim: Sim) {
    const u = this.U(w.lane);
    const bw = w.size * u;
    const big = WOLVES[w.kind].size > 100;
    const bh = bw * (big ? 0.78 : 0.62);
    const x = this.wx(w.x);
    const ground = this.wy(w.lane);
    const lift = w.z * this.zk();
    const t = sim.clock + w.id * 0.37;
    const moving = w.z <= 0 && w.stun <= 0 && w.vx === 0;
    const speed = WOLVES[w.kind].speed * (w.hasted ? 1.5 : 1);
    const ph = t * (6 + speed * 0.08);
    let rot = 0;
    let sx = 1;
    let sy = 1;
    let bob = 0;
    if (moving) {
      bob = Math.abs(Math.sin(ph)) * bh * 0.1;
      rot = Math.sin(ph * 2) * 0.04;
      sy = 1 + Math.sin(ph * 2) * 0.03;
    }
    // 噛みつき：前へ飛び出して戻る
    const s = WOLVES[w.kind];
    const biteK = w.cooldown > s.interval - 0.16 && w.z <= 0 ? Math.sin(((s.interval - w.cooldown) / 0.16) * Math.PI) : 0;
    const lunge = -biteK * bw * 0.25;
    if (biteK) { sx = 1 + biteK * 0.15; sy = 1 - biteK * 0.1; }
    // 当たった：つぶれる・のけぞる
    const hit = w.hitFlash / 0.12;
    if (hit > 0) { sx *= 1 - 0.22 * hit; sy *= 1 + 0.18 * hit; rot += (w.hitDir || 1) * 0.25 * hit; }
    if (w.kind === 'crow' && w.mode !== 'fall') {
      rot = w.mode === 'cling' ? Math.sin(t * 20) * 0.08 : Math.sin(t * 3) * 0.06; // 飛んでいる・とまっている：回らない
    } else if (w.z > 0) {
      if (w.pouncing) {
        rot = Math.atan2(-w.vz, -330) + Math.PI; // 跳びかかり：鼻先を進む向きへ
        rot = Math.max(-0.6, Math.min(0.6, -w.vz / 900));
        sx = 1.15;
        sy = 0.9;
      } else if (w.slammed) {
        sx = 0.8;
        sy = 1.3;
        rot = (w.hitDir || 1) * 0.3;
      } else rot = (w.hitDir || 1) * Math.min(Math.PI * 1.6, w.z / (w.size * 2.2)) * (w.vz > 0 ? 1 : 1.2); // 打ち上げ：くるくる回る
    } else if (w.stun > 0.05 && !hit) {
      sy *= 0.92; // 落ちたあと、へたりこむ
      sx *= 1.06;
    }
    // 裂け目から出てくる：ぽんっと大きくなる
    if (w.age < 0.45) {
      const k = backOut(w.age / 0.45);
      sx *= k;
      sy *= k;
    }
    const color = WOLF_COLOR[w.kind];
    const flash = w.hitFlash > 0;
    const cy = ground - lift - bob;
    if (this.wolves.ready) return this.wolfSprite(g, w, sim, { x: x + lunge, ground, lift, bob, rot, biteK, hit, flash, bw });
    place(g, x + lunge, cy, rot, sx, sy);
    // 脚（4本。走ると交互に）
    const legH = bh * 0.28;
    const legW = bw * 0.09;
    const legs = [-0.32, -0.16, 0.18, 0.34];
    legs.forEach((lx, i) => {
      const sw = moving ? Math.sin(ph + (i % 2) * Math.PI) * legH * 0.35 : w.z > 0 ? legH * 0.3 : 0;
      g.roundRect(bw * lx - legW / 2 + sw * 0.4, -legH, legW, legH - Math.abs(sw) * 0.3, legW / 2).fill(mix(color, 0x000000, 0.35));
    });
    // しっぽ（右。走ると振る）
    const tw = Math.sin(t * 9) * 0.4;
    g.moveTo(bw * 0.45, -bh * 0.85).quadraticCurveTo(bw * 0.7, -bh * (1.1 + tw * 0.3), bw * 0.72, -bh * (0.75 + tw * 0.4)).stroke({ width: bw * 0.09, color, cap: 'round' });
    // 体
    g.roundRect(-bw / 2, -bh - legH * 0.6, bw, bh, bw * 0.12).fill(flash ? 0xffffff : color);
    g.roundRect(-bw / 2, -legH * 0.6 - bh * 0.28, bw, bh * 0.28, bw * 0.1).fill({ color: 0x000000, alpha: flash ? 0 : 0.18 }); // 腹の影
    if (w.kind === 'armored') {
      for (let i = 0; i < 3; i++) g.rect(-bw * 0.35 + i * bw * 0.25, -bh - legH * 0.6 + bh * 0.12, bw * 0.18, bh * 0.4).fill({ color: 0xc8c8d8, alpha: flash ? 0 : 0.5 });
    }
    if (w.kind === 'howler') g.circle(-bw * 0.32, -bh - legH * 0.4, bw * 0.28).fill({ color: mix(color, 0xffffff, 0.15), alpha: flash ? 0 : 1 }); // たてがみ
    // 耳（左が頭）
    const top = -bh - legH * 0.6;
    g.poly([-bw * 0.48, top + 2, -bw * 0.4, top - bh * 0.32, -bw * 0.28, top + 2]).fill(flash ? 0xffffff : color);
    g.poly([-bw * 0.3, top + 2, -bw * 0.2, top - bh * 0.28, -bw * 0.1, top + 2]).fill(flash ? 0xffffff : mix(color, 0x000000, 0.1));
    // 目：ふつうは赤く光る。遠吠えのそばでは黄色。のびているときは ×
    const ex = -bw * 0.36;
    const ey = top + bh * 0.3;
    const er = Math.max(2, bw * 0.06);
    if (w.z <= 0 && w.stun > 0.12 && !hit) {
      g.moveTo(ex - er, ey - er).lineTo(ex + er, ey + er).moveTo(ex + er, ey - er).lineTo(ex - er, ey + er).stroke({ width: 2, color: 0xffffff });
    } else {
      g.circle(ex, ey, er).fill(w.hasted ? 0xffff60 : 0xff4040);
      g.circle(ex, ey, er * 2.4).fill({ color: w.hasted ? 0xffff60 : 0xff2020, alpha: 0.18 });
    }
    // 鼻先
    g.roundRect(-bw * 0.62, top + bh * 0.38, bw * 0.16, bh * 0.26, 3).fill(flash ? 0xffffff : mix(color, 0x000000, 0.15));
    if (biteK > 0.3) g.poly([-bw * 0.6, top + bh * 0.62, -bw * 0.5, top + bh * 0.78, -bw * 0.46, top + bh * 0.62]).fill(0xffffff); // 牙
    g.restore();
    // 体力の棒（減ったときだけ）
    if (w.hp < w.maxHp && w.age > 0.4) {
      const hb = bw * 0.8;
      const hy = cy - bh - legH - bh * 0.45;
      g.rect(x - hb / 2, hy, hb, 4).fill({ color: 0x000000, alpha: 0.6 });
      g.rect(x - hb / 2, hy, (hb * Math.max(0, w.hp)) / w.maxHp, 4).fill(0x70d070);
    }
  }

  // 狼の絵を置く。伸び縮みはさせず、位置・傾き・色で動かす。体力の棒は絵の上に
  private wolfSprite(g: Graphics, w: Wolf, sim: Sim, o: { x: number; ground: number; lift: number; bob: number; rot: number; biteK: number; hit: number; flash: boolean; bw: number }) {
    let hh = this.heroH(w.lane) * 0.6 * WOLF_REL[w.kind] * (w.color ? COLORS[w.color].size : 1); // 狼は主人公の0.6倍（0.46倍だと小さな犬に見えた）
    let rot = o.rot;
    if (o.biteK) rot -= o.biteK * 0.18; // 噛みつき：頭を上げて飛び出す
    if (w.z <= 0 && w.stun > 0.05 && !o.hit) rot += 0.08; // 落ちたあと、へたりこむ
    // 裂け目から出てくる：ふわっと現れる（大きさは少しだけ）
    const born = w.age < 0.45 ? w.age / 0.45 : 1;
    const tint = o.flash ? 0xff9a9a : 0xffffff;
    // 遠吠えで速くなった狼は、足もとの黄色い輪で示す（色を塗ると病気のように濁って見えた）
    // 遠吠えの溜め：頭の上の輪が満ちていき、満ちると吠えて裂け目から子狼が出る
    if (w.kind === 'howler' && w.skillCd <= HOWL.wind && w.skillCd > 0) {
      const k = 1 - w.skillCd / HOWL.wind;
      const r = Math.max(12, hh * 0.16);
      const cx = o.x - hh * 0.12;
      const cyy = o.ground - o.lift - hh * 1.15 - r;
      this.wolfHud.circle(cx, cyy, r + 2).fill({ color: 0x000000, alpha: 0.5 });
      this.wolfHud.moveTo(cx, cyy - r).arc(cx, cyy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k).stroke({ width: 4, color: 0xffd060, alpha: 0.95 });
      this.wolfHud.circle(cx, cyy, r * 0.45 * k).fill({ color: 0xffe080, alpha: 0.8 });
    }
    const layer: 0 | 1 = g === this.backG ? 0 : 1;
    const cy = o.ground - o.lift - o.bob * 0.6 - this.wolves.center(hh);
    // ふつうの狼は、動きに合わせて絵を差し替える。差し替えた絵は姿勢そのものなので、傾けすぎない
    let art: WolfArt = w.kind;
    const has = (a: string) => a in this.wolves.meta;
    if (w.kind === 'wolf') {
      if (w.z > 0 && !w.pouncing) { art = 'wolf_air'; rot *= 0.5; }
      else if (o.hit > 0 || (w.stun > 0.05 && w.z <= 0)) { art = 'wolf_hit'; rot *= 0.3; }
      else if (o.biteK > 0.15) { art = 'wolf_bite'; rot *= 0.3; }
      else if (w.vx === 0 && Math.sin((sim.clock + w.id * 0.37) * 7) < 0) art = 'wolf_walk2';
    } else if (w.kind === 'wman') {
      // 人狼男：振りかぶり → 大振り（休みの始め）→ のけぞり。打ち上げられたら宙で転がり、強くひるんだら倒れる（foes-motion-v1）
      if (w.z > 0) art = 'wman_air';
      else if (w.stun > 0.4) art = 'wman_down';
      else if (w.mode === 'wind') art = 'wman_wind';
      else if (w.mode === 'rest' && w.stun <= 0.05 && w.modeT > WMAN.rest - 0.35) art = 'wman_swing';
      else if (o.hit > 0 || w.stun > 0.05) art = 'wman_hit';
      rot *= 0.3;
    } else if (w.kind === 'wwoman') {
      // 人狼女：跳ぶ → 着地の構え → ひっかき → のけぞり。跳ぶ直前も構える
      if (w.z > 0 && w.mode === 'leap') art = 'wwoman_leap';
      else if (w.z > 0) art = 'wwoman_air'; // 打ち上げられた
      else if (w.stun > 0.4) art = 'wwoman_down';
      else if (o.hit > 0 || w.stun > 0.05) art = 'wwoman_hit';
      else if (w.mode === 'claw') art = 'wwoman_claw';
      else if (w.mode === 'land' || (w.mode === '' && w.skillCd < 0.35)) art = 'wwoman_crouch';
      rot *= 0.3;
    } else if (w.kind === 'king') {
      // 狼王：突進の溜めと突進＝身を低く／叩きつけ＝立ち上がる／遠吠え＝頭を上げる／倒れ込み
      const m = w.mode;
      art = m === 'kl' || m === 'lunge' ? 'king_crouch' : m === 'ks' ? 'king_rear' : m === 'kw' ? 'king_howl' : m === 'down' ? 'king_down' : 'king';
      rot = 0;
    } else if (w.kind === 'crow') {
      // カラス：羽ばたき（上げ・下げ）・とまって突く・叩かれて落ちる
      if (w.mode === 'cling') art = 'crow_cling';
      else if (w.z <= 0 && w.stun > 0 && w.mode === '') art = 'crow_ko'; // 叩き落とされて地面でのびている
      else if (w.mode === '' && o.hit <= 0 && w.stun <= 0.05 && Math.abs(w.x - sim.hero.x) < 150 && sim.hero.down <= 0) art = 'crow_dive'; // 主人公へ襲いかかる
      else if (w.mode === 'fall' || w.stun > 0.05 || o.hit > 0) art = 'crow_hit';
      else if (Math.sin((sim.clock + w.id * 0.37) * 16) < 0) art = 'crow_down';
    } else if ((o.hit > 0 || (w.stun > 0.05 && w.z <= 0)) && has(`${w.kind}_hit`)) { art = `${w.kind}_hit` as WolfArt; rot *= 0.3; }
    else if ((o.biteK > 0.15 || w.pouncing) && has(`${w.kind}_bite`)) { art = `${w.kind}_bite` as WolfArt; rot *= 0.3; }
    // 姿勢の絵は、立ち姿との背の高さの違いのまま描く（低い噛みつきまで同じ背に伸ばすと大きく見えた）
    const mk = this.wolves.meta[art];
    const base = this.wolves.meta[w.kind];
    // 狼王は立ち上がる・吠える姿のほうが背が高い（そのまま高く描く）
    if (mk && base && art !== w.kind) hh *= w.kind === 'king' ? (mk as { h?: number }).h! / (base as { h?: number }).h! : Math.min(1, (mk as { h?: number }).h! / (base as { h?: number }).h!);
    let cyy = cy;
    if (w.kind === 'king' && art !== 'king') cyy = o.ground - o.lift - this.wolves.center(hh);
    // 狼王は主人公の側を向く（絵は左向き）
    let flip = w.kind === 'king' && ((w.mode === '' || w.mode === 'kr' || w.mode === 'rest' || w.mode === 'down') ? sim.hero.x > w.x : (w.kdir ?? -1) > 0);
    if (w.kind === 'wman') flip = (w.kdir ?? -1) > 0; // 人狼男は振り向く（絵は左向き）
    this.wolves.put(layer, art, o.x, cyy, hh, rot, 0.85 + 0.15 * born, tint, born, flip, this.furOf(w.kind, w.color), w.color ? COLOR_GLOW(w.color) : w.kind === 'king' ? 0xff2030 : undefined);
    const top = o.ground - o.lift - hh;
    this.wolfBoxes.push({ id: w.id, lane: w.lane, x0: o.x - hh * 0.7, x1: o.x + hh * 0.7, y0: top, y1: o.ground - o.lift + hh * 0.05 });
    if (w.hp < w.maxHp && w.age > 0.4 && w.kind !== 'king') {
      const hb = Math.max(o.bw * 0.8, hh * 0.5);
      const hy = o.ground - o.lift - hh * 1.05;
      this.wolfHud.rect(o.x - hb / 2, hy, hb, 4).fill({ color: 0x000000, alpha: 0.6 });
      this.wolfHud.rect(o.x - hb / 2, hy, (hb * Math.max(0, w.hp)) / w.maxHp, 4).fill(0x70d070);
    }
    if (w.color && born > 0.5) {
      // 主人公から遠い狼の印は小さく薄く（色の狼が多い晩に、頭の上の印が十数個並んでにぎやかすぎた。レビュー13）
      const sx = o.x * this.world.scale.x + this.world.x;
      const far = Math.min(1, Math.max(0, (Math.abs(sx - this.heroAt.x) / this.geo.W - 0.18) / 0.35));
      this.mark(w.color, o.x, o.ground - o.lift - hh * 1.05 - 6, hh, far);
    }
    if (w.kind === 'king') this.kingHud(w, o.x, o.ground - o.lift, hh);
    // 人狼男の振りかぶり：頭の上に赤い「！」（大振りが来る。今なら大技で止められる）
    if (w.kind === 'wman' && w.mode === 'wind') {
      const r = Math.max(11, hh * 0.09);
      const ex = o.x;
      const ey = o.ground - o.lift - hh * 0.98 - r;
      const pulse = 1 + 0.15 * Math.sin(this.vt * 30);
      this.wolfHud.circle(ex, ey, r * pulse + 2).fill({ color: 0x000000, alpha: 0.5 });
      this.wolfHud.circle(ex, ey, r * pulse).fill({ color: 0xff3040, alpha: 0.95 });
      this.wolfHud.roundRect(ex - r * 0.16, ey - r * 0.62, r * 0.32, r * 0.78, r * 0.1).fill(0xffffff);
      this.wolfHud.circle(ex, ey + r * 0.45, r * 0.17).fill(0xffffff);
    }
  }

  // 狼王のまわり：倒れ込みの残り（体の上の輪）。印の並びと予兆の文字は画面の上（体力の棒の下・main.ts）
  private kingHud(w: Wolf, x: number, ground: number, hh: number) {
    const H = this.wolfHud;
    if (w.mode === 'down') {
      const k = Math.max(0, w.modeT) / KING.down;
      const r = Math.max(16, hh * 0.08);
      const cy = ground - hh * 0.75;
      H.moveTo(x, cy - r).arc(x, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k).stroke({ width: 5, color: 0xffd060, alpha: 0.9 });
    }
    if (w.mode === 'ks') {
      // 叩きつける所（地面に赤く）
      const c = w.x + (w.kdir ?? -1) * (KING.slam.near + KING.slam.reach / 2);
      const half = (KING.slam.reach / 2) * this.geo.K;
      H.ellipse(this.wx(c), this.wy(w.lane), half, half * 0.2).fill({ color: 0xff2030, alpha: 0.22 + 0.14 * Math.sin(this.vt * 20) });
    }
  }

  // 昼：色付きの狼の絵を今夜の分だけにする（2026-10-05 レビュー1。ためこむと 70晩で 35MB＋描いた紙の分）。
  // 前の晩の分は、倒した狼の割れる絵が消えてから捨てる。今夜の分は1コマに1枚ずつ先に作る（夜の途中で作ると一瞬引っかかる）
  private dyeWave = -1;
  private dyeWant: [WolfArt, [number, number, number]][] = [];
  private tidyDye(sim: Sim) {
    if (!this.wolves.ready) return;
    if (this.dyeWave !== sim.wave) {
      if (this.splits.length) return;
      this.dyeWave = sim.wave;
      const lines: { kind: WolfKind; color?: WolfColor }[] = night(sim.wave + 1);
      if (lines.some((l) => l.kind === 'howler')) lines.push({ kind: 'pup' }); // 遠吠えが呼ぶ子狼
      if (lines.some((l) => l.kind === 'king')) for (const color of ['red', 'black', 'purple', 'orange'] as const) lines.push({ kind: 'wolf', color }); // 狼王が呼ぶ手下
      const arts = Object.keys(this.wolves.tex) as WolfArt[];
      this.dyeWant = [];
      for (const l of lines) {
        const fur = this.furOf(l.kind, l.color);
        if (fur) for (const a of arts) if (a === l.kind || a.startsWith(`${l.kind}_`)) this.dyeWant.push([a, fur]);
      }
      this.wolves.keepDyed(new Set(this.dyeWant.map(([a, fur]) => UnitArt.dyeKey(a, fur))));
    }
    this.wolves.warmDyed(this.dyeWant);
  }

  // 毛の色：色の狼はその色、色の付かない狼は明るい銀灰（黒と見分けるため）。鎧狼は鎧の色を残す
  private furOf(kind: WolfKind, color?: WolfColor): [number, number, number] | undefined {
    if (color) return COLORS[color].fur;
    return kind === 'pup' || kind === 'wolf' || kind === 'howler' || kind === 'alpha' ? GRAY_FUR : undefined; // 鎧狼は鎧の色を、人狼は服の色を残す
  }

  // 頭の上の印：その色の丸に、弱い武器の絵（ナイフ・弓・主砲・桜。金は銭）
  // far：主人公からの遠さ（0〜1）。遠いほど小さく薄く
  private mark(color: WolfColor, x: number, y: number, hh: number, far = 0) {
    const tex = this.markTex[COLORS[color].icon];
    const r = Math.max(9, Math.min(17, hh * 0.13)) * (1 - 0.4 * far);
    const al = 1 - 0.6 * far;
    const cy = y - r;
    this.wolfHud.circle(x, cy, r + 2).fill({ color: 0x000000, alpha: 0.55 * al });
    this.wolfHud.circle(x, cy, r).fill({ color: COLOR_GLOW(color), alpha: 0.9 * al });
    if (!tex) return;
    let sp = this.headMarks.children[this.markUsed] as Sprite | undefined;
    if (!sp) {
      sp = new Sprite();
      sp.anchor.set(0.5);
      this.headMarks.addChild(sp);
    }
    this.markUsed++;
    sp.texture = tex;
    const k = (r * 1.7) / Math.max(tex.width, tex.height);
    sp.scale.set(k);
    sp.position.set(x, cy);
    sp.alpha = al;
    sp.visible = true;
  }

  // 緑が倒れて寝ている：横に倒れて薄く、起き上がるまでの残りを緑の輪で
  private drawSleeper(g: Graphics, w: Wolf) {
    if (!this.wolves.ready) return;
    const x = this.wx(w.x);
    const ground = this.wy(w.lane);
    const hh = this.heroH(w.lane) * 0.6 * WOLF_REL[w.kind];
    const layer: 0 | 1 = g === this.backG ? 0 : 1;
    const k = Math.max(0, w.sleep) / 4;
    const twitch = k < 0.25 ? Math.sin(this.vt * 40) * 0.05 : 0; // 起き上がる前にぴくぴく
    this.wolves.put(layer, w.kind, x, ground - hh * 0.22, hh, 1.35 + twitch, 1, 0xb0c8b0, 0.75, false, this.furOf(w.kind, w.color));
    const r = Math.max(10, hh * 0.14);
    const cy = ground - hh * 0.55;
    this.wolfHud.circle(x, cy, r).stroke({ width: 3, color: 0x000000, alpha: 0.4 });
    this.wolfHud.moveTo(x, cy - r).arc(x, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - k)).stroke({ width: 3, color: 0x7ad87a, alpha: 0.9 });
    this.mark('green', x, cy + r + 2, hh);
  }

  // ── 番犬（箱。右を向いて構える）──
  private drawDog(g: Graphics, d: Dog, sim: Sim, alpha = 1) {
    const u = this.U(d.lane);
    const bw = d.size * u;
    const bh = bw * 0.6;
    const x = this.wx(d.x);
    const ground = this.wy(d.lane);
    const t = (sim.phase === 'wave' ? sim.clock : this.vt) + d.id * 0.5;
    const color = DOG_COLOR[d.kind];
    const bite = d.bite > 0 ? Math.sin((1 - d.bite / 0.2) * Math.PI) : 0;
    const hit = d.hitFlash / 0.12;
    // 晩の終わりに赤ずきんのそばへ来たら、うれしくて跳ねる
    // なでてもらっている間はおとなしく（跳ねると頭が手のひらから離れた）
    const glad = sim.cheer >= 0 && Math.abs(d.x - sim.hero.x) < 160 && sim.petting !== d ? 1 : 0;
    const bob = Math.abs(Math.sin(t * 5)) * bh * 0.04 + glad * Math.abs(Math.sin(t * 9)) * bh * 0.22;
    if (this.dogArt.ready) {
      // 番犬の絵：噛むときは前へ飛び出して頭を下げる・噛まれたら赤く。伸び縮みはさせない
      const hh = this.heroH(d.lane) * 0.42 * DOG_REL[d.kind];
      const layer: 0 | 1 = g === this.backG ? 0 : 1;
      const f = d.facing;
      if (d.down > 0) {
        // 倒れた：横になって薄く、家の前で休む
        this.dogArt.put(layer, d.kind, x, ground - hh * 0.25, hh, -f * 1.3, 1, 0xb0a0a0, 0.55, f < 0);
        return;
      }
      // 走っているあいだは立ち姿と走りの絵を交互に・噛むときは噛みつきの絵（伸び縮みはさせない）
      const running = sim.phase === 'wave' && d.run > 20 && d.bite <= 0;
      const stride = running && Math.sin(t * (10 + d.run * 0.03)) < 0;
      const art: DogArt = d.bite > 0 || (d.cooldown > DOGS[d.kind].interval - 0.25 && sim.phase === 'wave') ? `${d.kind}_bite` : stride ? `${d.kind}_run` : d.kind;
      const mk = this.dogArt.meta[art];
      const base = this.dogArt.meta[d.kind];
      const ah = mk && base && art !== d.kind ? hh * Math.min(1, mk.h! / base.h!) : hh;
      const run = running ? Math.abs(Math.sin(t * 12)) * hh * 0.05 : 0;
      this.dogArt.put(layer, art, x + f * bite * bw * 0.15, ground - bob * 2 - run - this.dogArt.center(ah), ah, f * (bite * 0.06 - hit * 0.1), 1, d.hitFlash > 0 ? 0xff9a9a : 0xffffff, alpha, f < 0);
      if (d.hp < d.maxHp) {
        const hb = Math.max(bw * 0.8, hh * 0.5);
        const hy = ground - hh * 1.05;
        this.wolfHud.rect(x - hb / 2, hy, hb, 3).fill({ color: 0x000000, alpha: 0.6 });
        this.wolfHud.rect(x - hb / 2, hy, (hb * Math.max(0, d.hp)) / d.maxHp, 3).fill(0xe0b060);
      }
      return;
    }
    place(g, x + bite * bw * 0.25, ground - bob, 0, 1 + bite * 0.12 - hit * 0.15, 1 - bite * 0.08 + hit * 0.12);
    const legH = bh * 0.3;
    for (const lx of [-0.3, -0.15, 0.18, 0.32]) g.roundRect(bw * lx - bw * 0.045, -legH, bw * 0.09, legH, 3).fill({ color: mix(color, 0x000000, 0.3), alpha });
    // 巻いたしっぽ（振る）
    const wag = Math.sin(t * 14) * 0.25;
    g.circle(-bw * 0.5, -bh - legH * 0.4 - wag * bh * 0.2, bw * 0.12).stroke({ width: bw * 0.07, color, alpha });
    g.roundRect(-bw / 2, -bh - legH * 0.6, bw, bh, bw * 0.15).fill({ color: d.hitFlash > 0 ? 0xffffff : color, alpha });
    g.roundRect(-bw / 2 + bw * 0.1, -legH * 0.6 - bh * 0.3, bw * 0.8, bh * 0.3, bw * 0.1).fill({ color: 0xfff0e0, alpha: 0.5 * alpha }); // 白い腹
    const top = -bh - legH * 0.6;
    g.poly([bw * 0.2, top + 2, bw * 0.28, top - bh * 0.35, bw * 0.38, top + 2]).fill({ color, alpha });
    g.poly([bw * 0.36, top + 2, bw * 0.44, top - bh * 0.3, bw * 0.5, top + 2]).fill({ color, alpha });
    g.circle(bw * 0.36, top + bh * 0.3, Math.max(2, bw * 0.05)).fill({ color: 0x1a1010, alpha });
    g.roundRect(bw * 0.46, top + bh * 0.4, bw * 0.14, bh * 0.22, 3).fill({ color: mix(color, 0xffffff, 0.3), alpha });
    if (bite > 0.3 || sim.phase !== 'wave') g.roundRect(bw * 0.5, top + bh * 0.6, bw * 0.07, bh * 0.16, 2).fill({ color: 0xff7080, alpha }); // 舌
    g.restore();
    if (d.hp < d.maxHp) {
      const hb = bw * 0.8;
      const hy = ground - bh - legH - bh * 0.3;
      g.rect(x - hb / 2, hy, hb, 3).fill({ color: 0x000000, alpha: 0.6 });
      g.rect(x - hb / 2, hy, (hb * Math.max(0, d.hp)) / d.maxHp, 3).fill(0xe0b060);
    }
  }

  // 主人公が動ける道（2026-10-04 アマネさん「移動範囲がメイン画面でわかるように」）：奥行きの帯を土の道として明るく塗り、
  // 奥と手前の縁に小石を並べる。右の端（それより先へは行けない）は裂け目の紅い瘴気。走って行く先には輪
  private drawPath(g: Graphics, sim: Sim) {
    const x0 = this.wx(HOUSE_X);
    const x1 = this.wx(HERO.maxX);
    const top = this.wy(0) - 10;
    const bot = this.wy(1) + 12;
    g.rect(x0, top, x1 - x0, bot - top).fill({ color: 0x8a6a4e, alpha: 0.16 });
    for (const [y, a] of [[top, 0.5], [bot, 0.6]] as const) {
      g.rect(x0, y - 1, x1 - x0, 2).fill({ color: 0xc8a888, alpha: 0.18 });
      for (let x = x0 + 14; x < x1; x += 46) {
        const j = ((x * 13) % 17) - 8;
        g.ellipse(x + j, y + (j % 3), 6 + (j % 4), 3).fill({ color: 0x9a8a7a, alpha: a });
      }
    }
    // 右の端（それより先へは行けない）：しめ縄はやめ、裂け目から滲む紅い瘴気が道を染める所を行けない所にする（2026-10-04 アマネさん「しめ縄要る？」）
    const rx = this.wx(WOLF_SPAWN_X);
    for (let i = 0; i < 8; i++) {
      const k = i / 8;
      const xa = x1 + (rx - x1) * k;
      g.rect(xa, top - 4, (rx - x1) / 8 + 1, bot - top + 8).fill({ color: 0x8a0818, alpha: 0.05 + 0.22 * k });
    }
    g.moveTo(x1, top - 4).lineTo(x1, bot + 4).stroke({ width: 2, color: 0xff4050, alpha: 0.25 + 0.1 * Math.sin(this.vt * 3) });
    // 走って行く先
    const o = sim.hero.order;
    if (o) {
      const pulse = 1 + 0.15 * Math.sin(this.vt * 10);
      g.ellipse(this.wx(o.x), this.wy(o.lane), 34 * pulse, 10 * pulse).stroke({ width: 3, color: o.sprint ? 0xffe070 : 0xffffff, alpha: 0.7 });
    }
  }

  // おばあさんの家（仮の影絵：大正の和洋折衷の屋敷）。齧られると赤く光り、傷むとひびが入る
  private drawHouse(g: Graphics, sim: Sim, dt: number) {
    const gx = this.geo;
    const right = this.wx(HOUSE_X) + 8;
    // 足もとは道の奥の縁（手前の縁に置くと、奥の道に立つ主人公のほうが高く見えた。2026-10-04 アマネさん「家が主人公より低く見える」）
    const base = this.wy(0.1);
    const top = gx.horizon - gx.Hm * 0.32;
    const left = right - gx.Hm * 0.55;
    const f = Math.max(0, this.houseFlash);
    if (this.house.visible) {
      // 家の絵（2026-10-04 生成）。齧られると赤く、傷むほどひびが入る（ひびは絵の上に描く）
      const hh = this.heroH(1) * 1.9; // 主人公の1.9倍（二階建て。1.5倍で手前の縁に置くと、主人公より低く見えた）
      const hm = this.dogArt.meta['house' as DogArt];
      const hk = hh / hm.feet[1];
      this.house.scale.set(hk);
      this.house.position.set(right - (hm.size[0] - hm.feet[0]) * hk * 0.75, base); // 門と石垣は家の位置より少し右へ出す
      this.house.tint = f > 0 ? mix(0xffffff, 0xff6060, Math.min(1, f * 3)) : 0xffffff;
      const ho = this.houseOver.clear();
      const dmg = 1 - sim.houseHp / HOUSE_HP;
      const hx0 = this.house.x - this.house.width * 0.4;
      for (let i = 0; i < Math.floor(dmg * 6); i++) {
        const cx = hx0 + this.house.width * 0.7 * ((i * 0.37 + 0.1) % 0.9);
        const cy = base - hh * (0.15 + 0.6 * ((i * 0.53 + 0.2) % 0.8));
        ho.moveTo(cx, cy).lineTo(cx + 10, cy + 14).lineTo(cx + 4, cy + 26).lineTo(cx + 14, cy + 38).stroke({ width: 3, color: 0x1a1010 });
      }
      this.houseFlash -= dt;
      return;
    }
    const wall = mix(0x5a4636, 0xff4040, f * 2);
    g.rect(left, top, right - left, base - top).fill(wall);
    g.rect(left, top, right - left, (base - top) * 0.12).fill(mix(0x3a2c26, 0xff4040, f));
    // 屋根（瓦）
    g.poly([left - 20, top + 4, right + 18, top + 4, right - (right - left) * 0.25, top - gx.Hm * 0.13, left + (right - left) * 0.1, top - gx.Hm * 0.13]).fill(0x2a1e22);
    for (let i = 0; i < 6; i++) g.moveTo(left - 10 + i * ((right - left) / 5), top + 2).lineTo(left + 6 + i * ((right - left) / 5.6), top - gx.Hm * 0.12).stroke({ width: 1, color: 0x403038 });
    // 窓の灯り（昼は消える）
    const lit = sim.phase === 'shop' ? 0.2 : 0.9;
    for (const [fx, fy] of [[0.2, 0.3], [0.55, 0.3], [0.2, 0.62]]) {
      g.rect(left + (right - left) * fx, top + (base - top) * fy, (right - left) * 0.2, (base - top) * 0.16).fill({ color: 0xf0c060, alpha: lit });
    }
    // 戸
    g.rect(right - (right - left) * 0.28, top + (base - top) * 0.55, (right - left) * 0.2, (base - top) * 0.45).fill(0x2a1c18);
    // ひび（家の耐久が減るほど）
    const dmg = 1 - sim.houseHp / HOUSE_HP;
    for (let i = 0; i < Math.floor(dmg * 6); i++) {
      const cx = left + (right - left) * ((i * 0.37 + 0.1) % 0.9);
      const cy = top + (base - top) * ((i * 0.53 + 0.2) % 0.8);
      g.moveTo(cx, cy).lineTo(cx + 10, cy + 14).lineTo(cx + 4, cy + 26).lineTo(cx + 14, cy + 38).stroke({ width: 2, color: 0x1a1010 });
    }
    this.houseFlash -= dt; // 1コマごとに減らすと、画面の速さで長さが変わった
  }

  // 異界の裂け目（戦場の右の端）。狼はここから出てくる。
  // 空の高くから地面まで裂けた、ぎざぎざの黒い割れ目。縁が紅く脈打ち、枝分かれしたひび・紅い稲妻・中に光る目・地面の裂け目
  // （2026-10-04 アマネさん「裂け目がださい。もっと大きくて禍々しいのがいい」）
  private riftBolt = { t: 0, seed: 1 };
  private drawRift(g: Graphics, sim: Sim) {
    const gx = this.geo;
    const x = this.wx(WOLF_SPAWN_X) + 30;
    const top = gx.horizon - gx.Hm * 0.62;
    const bot = this.wy(1) + 14;
    const t = this.vt;
    const live = sim.phase === 'wave' ? 1 : 0.45;
    const pulse = 0.85 + 0.15 * Math.sin(t * 3.2) + 0.05 * Math.sin(t * 11);
    // 背の光（紅いにじみ）
    for (let i = 0; i < 4; i++) {
      const yy = top + (bot - top) * (0.15 + i * 0.25);
      g.ellipse(x, yy, gx.Hm * 0.24 * pulse * live, (bot - top) * 0.24).fill({ color: 0xc01028, alpha: 0.08 * live });
    }
    // 割れ目の背骨：決まったぎざぎざ（毎コマ同じ形）に、少しのゆらぎ
    const n = 18;
    const spine: [number, number][] = [];
    for (let i = 0; i <= n; i++) {
      const k = i / n;
      const zig = ((i * 7919) % 13) / 13 - 0.5;
      spine.push([x + zig * 34 + Math.sin(k * 7 + t * 1.5) * 4, top + (bot - top) * k]);
    }
    const width = (50 + 10 * Math.sin(t * 2.3)) * pulse * (0.6 + 0.4 * live);
    const half = (i: number) => width * Math.sin((Math.PI * i) / n) ** 0.5 * (0.75 + 0.25 * (((i * 31) % 7) / 7));
    const outline = (k: number) => {
      const pts: number[] = [];
      for (let i = 0; i <= n; i++) pts.push(spine[i][0] - half(i) * k, spine[i][1]);
      for (let i = n; i >= 0; i--) pts.push(spine[i][0] + half(i) * k * 0.8, spine[i][1]);
      return pts;
    };
    g.poly(outline(1.6)).fill({ color: 0xff2040, alpha: 0.18 * pulse });
    g.poly(outline(1.15)).fill({ color: 0xff3048, alpha: 0.55 });
    g.poly(outline(1)).fill(0x12000a);
    // 中の渦と、光る目（ときどき瞬く）
    for (let i = 0; i < 4; i++) {
      const k = 0.25 + i * 0.17;
      const sx = spine[Math.round(k * n)][0];
      const sy = top + (bot - top) * k;
      const blink = Math.sin(t * 1.3 + i * 2.1) > -0.6 ? 1 : 0;
      if (blink && live > 0.5) {
        g.circle(sx - 5, sy, 2.2).fill({ color: 0xff5060, alpha: 0.9 });
        g.circle(sx + 5, sy, 2.2).fill({ color: 0xff5060, alpha: 0.9 });
      }
    }
    // まもなく出てくる狼：裂け目の下のほう（狼の頭の高さ）で、赤い目がゆっくり開いて光る
    if (sim.phase === 'wave') {
      for (const c of sim.coming) {
        const k = Math.max(0, Math.min(1, 1 - c.next / 1.2));
        const rel = WOLF_REL[c.kind];
        const ey = this.wy(0.5) - this.heroH(0.5) * 0.6 * rel * 0.62 - (c.i % 3) * 8;
        const ex = spine[Math.round(n * 0.85)][0] - 4 + ((c.i * 7) % 5) - 2;
        const r = 3.2 * Math.max(0.8, rel);
        const open = k < 0.25 ? k / 0.25 : 1;
        g.circle(ex, ey, r * 5).fill({ color: 0xff1030, alpha: 0.12 * k });
        for (const dx of [-r * 2.4, r * 2.4]) g.ellipse(ex + dx, ey, r * 1.3, r * 0.75 * open).fill({ color: 0xff4050, alpha: 0.95 });
        for (const dx of [-r * 2.4, r * 2.4]) g.ellipse(ex + dx, ey, r * 0.5, r * 0.4 * open).fill({ color: 0xffe0e0, alpha: 0.9 * k });
      }
    }
    // 縁の光る線
    g.poly(outline(1)).stroke({ width: 2.5, color: 0xff7080, alpha: 0.9 * pulse });
    // 枝分かれしたひび（空へ・地面へ）
    const branches: [number, number, number][] = [[0.08, -1, 0.9], [0.18, 1, 1.1], [0.35, -1, 0.7], [0.55, 1, 0.8], [0.8, -1, 0.6]];
    for (const [k, dir, len] of branches) {
      const i = Math.round(k * n);
      let [bx, by] = spine[i];
      g.moveTo(bx, by);
      for (let j = 1; j <= 5; j++) {
        bx += dir * (14 + ((i + j) * 17 % 9)) * len;
        by += (((i * 3 + j * 5) % 9) - 4) * 3 - 6;
        g.lineTo(bx, by);
      }
      g.stroke({ width: 2, color: 0xff3048, alpha: 0.55 * pulse * live });
    }
    // 地面の裂け目：足もとから放射状に
    for (let i = 0; i < 6; i++) {
      const a = Math.PI * (0.55 + i * 0.18);
      let gx0 = x;
      let gy0 = bot - 6;
      g.moveTo(gx0, gy0);
      for (let j = 1; j <= 4; j++) {
        gx0 += Math.cos(a) * 26 * j * 0.5;
        gy0 -= Math.sin(a) * 6 * j * 0.5 - (((i + j) % 3) - 1) * 3;
        g.lineTo(gx0, gy0);
      }
      g.stroke({ width: 2, color: 0xff2840, alpha: 0.45 * live });
    }
    // 紅い稲妻：ときどき割れ目のまわりに走る
    if (live > 0.5) {
      this.riftBolt.t -= 1 / 60;
      if (this.riftBolt.t < -0.15) { this.riftBolt.t = 1 + Math.random() * 2.5; this.riftBolt.seed = Math.random() * 1000; }
      if (this.riftBolt.t < 0) {
        const al = 1 + this.riftBolt.t / 0.15;
        let r = this.riftBolt.seed;
        const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
        let bx = x + (rnd() - 0.5) * 30;
        let by = top + (bot - top) * rnd() * 0.5;
        g.moveTo(bx, by);
        const dir = rnd() < 0.5 ? -1 : 1;
        for (let j = 0; j < 7; j++) {
          bx += dir * (10 + rnd() * 26);
          by += 8 + rnd() * 22;
          g.lineTo(bx, by);
        }
        g.stroke({ width: 3, color: 0xffa0b0, alpha: al });
        if (al > 0.6) this.flash = Math.max(this.flash, 0.04);
      }
    }
  }

  // 背中の主砲を向ける角度（heroRig の aim）。撃ち込みは群れへ、主砲は前のいちばん近い狼へ。いなければ真っすぐ前
  private gunAim(sim: Sim, hx: number, hy: number) {
    const h = sim.hero;
    let tx = hx + h.facing * this.heroH(h.lane) * 2;
    let ty = hy - this.heroH(h.lane) * 0.7;
    if (h.move === 'hougeki') {
      tx = this.wx(h.dashTo);
      ty = this.wy(h.lane);
    } else if (h.ouran > 0 && h.special === 'midare') {
      tx = this.wx(h.aimX);
      ty = this.wy(h.aimLane) - this.heroH(h.lane) * 0.3;
    } else {
      const t = sim.wolves.filter((w) => (w.x - h.x) * h.facing > 0 && Math.abs(w.lane - h.lane) <= 0.6).sort((a, b) => Math.abs(a.x - h.x) - Math.abs(b.x - h.x))[0];
      if (t) {
        // 狼の頭を狙う（足もとを狙っていた。2026-10-04 アマネさん）
        const hd = this.wolfHead(t.x, t.lane, t.z, WOLF_REL[t.kind]);
        tx = hd.x;
        ty = hd.y;
      }
    }
    const ax = Math.max(1, (tx - hx) * h.facing); // 前へ（後ろの狼には向けない）
    const ay = ty - (hy - this.heroH(h.lane) * 0.7); // 肩から見て下が正
    let a = Math.atan2(-ax, ay); // 砲身（絵では下向き）をこの角度回すと、狙う向きになる
    if (a < 0) a += Math.PI * 2;
    return Math.max(Math.PI * 1.1, Math.min(Math.PI * 1.58, a)); // 前の上70度〜前の下15度（下へ向けすぎると腰から出ているように見えた）
  }

  // 刃先の通り道を覚える（技の振り抜きのあいだだけ）。古い点は0.12秒で消える
  private trackBlade(sim: Sim) {
    const h = sim.hero;
    const m = h.move;
    const p = m ? h.moveT / MOVES[m].dur : 0;
    const swinging = !!m && m !== 'bow' && m !== 'ame' && m !== 'hougeki' && h.charge < 0 && p >= 0.35 && p <= 0.85;
    const tips = this.rig.tips(this.world);
    const hh = this.heroH(h.lane);
    const cx = this.wx(h.x);
    const cy = this.wy(h.lane) - hh * 0.55 - h.z * this.zk() * 0.75; // 体の真ん中
    tips.forEach((q, i) => {
      const tr = this.blade[i];
      while (tr.length && this.vt - tr[0].t > 0.12) tr.shift();
      if (!swinging || !q || sim.hitStop > 0) return;
      const last = tr[tr.length - 1];
      // 絵の差し替えで刃先が大きく跳んだら、間を体の外側へふくらむ弧でつなぐ（振りの軌道に見せる）
      if (last && Math.hypot(q.x - last.x, q.y - last.y) > 30) {
        const mx = (last.x + q.x) / 2;
        const my = (last.y + q.y) / 2;
        let nx = -(q.y - last.y) * 0.35;
        let ny = (q.x - last.x) * 0.35;
        if (nx * (mx - cx) + ny * (my - cy) < 0) { nx = -nx; ny = -ny; }
        for (let k = 1; k < 8; k++) {
          const u = k / 8;
          tr.push({ x: (1 - u) * (1 - u) * last.x + 2 * (1 - u) * u * (mx + nx) + u * u * q.x, y: (1 - u) * (1 - u) * last.y + 2 * (1 - u) * u * (my + ny) + u * u * q.y, t: this.vt });
        }
      }
      tr.push({ x: q.x, y: q.y, t: this.vt });
    });
  }

  // 刃の軌跡：先へ行くほど太い1枚の帯（線を重ねると数珠のように見えた）
  private drawBlade(o: Graphics) {
    const w0 = this.geo.Hm * 0.03;
    for (const tr of this.blade) {
      const n = tr.length;
      if (n < 2) continue;
      for (const [wk, color, alpha] of [[1, 0xffb0c8, 0.55], [0.4, 0xffffff, 0.9]] as const) {
        const left: number[] = [];
        const right: number[] = [];
        for (let i = 0; i < n; i++) {
          const a = tr[Math.max(0, i - 1)];
          const b = tr[Math.min(n - 1, i + 1)];
          const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
          const age = Math.max(0, 1 - (this.vt - tr[i].t) / 0.12);
          const w = w0 * wk * (i / (n - 1)) * age * 0.5;
          const nx = (-(b.y - a.y) / len) * w;
          const ny = ((b.x - a.x) / len) * w;
          left.push(tr[i].x + nx, tr[i].y + ny);
          right.unshift(tr[i].x - nx, tr[i].y - ny);
        }
        o.poly([...left, ...right]).fill({ color, alpha });
      }
    }
  }

  // 漫画の記号（2026-10-04 レビュー A5）：噛まれたら汗と×、連撃中はキラキラ、締めは♪、倒れたら星がくるくる、昼は音符
  private trackMarks(sim: Sim, dt: number) {
    const h = sim.hero;
    const add = (kind: View['marks'][number]['kind'], life: number, ox: number, oy: number) => this.marks.push({ kind, t: 0, life, ox, oy });
    if (h.hitFlash > this.lastHitFlash + 0.05 && h.down <= 0) {
      add('sweat', 0.7, 0.32, 0.05);
      add('cross', 0.45, -0.3, -0.05);
    }
    this.lastHitFlash = h.hitFlash;
    if (sim.events.includes('finisher')) add('note', 0.9, 0.3, -0.1);
    if (sim.phase === 'wave' && sim.combo >= 10 && Math.random() < dt * 4) add('sparkle', 0.5, (Math.random() - 0.5) * 0.9, -Math.random() * 0.6);
    this.noteT -= dt;
    if (sim.phase === 'shop' && this.noteT <= 0) {
      this.noteT = 1.4 + Math.random();
      add('note', 1.6, 0.25 + Math.random() * 0.15, 0);
    }
    for (const m of this.marks) m.t += dt;
    this.marks = this.marks.filter((m) => m.t < m.life);
    if (this.marks.length > 24) this.marks.splice(0, this.marks.length - 24);
  }

  private drawMarks(o: Graphics, sim: Sim) {
    const h = sim.hero;
    const hh = this.heroH(h.lane);
    const hx = this.wx(h.x);
    const head = this.wy(h.lane) - hh * 1.05 - h.z * this.zk() * 0.75;
    const ink = 0x40202a;
    let ti = 0;
    for (const m of this.marks) {
      const q = m.t / m.life;
      const x = hx + m.ox * hh * h.facing;
      const y = head + m.oy * hh;
      const fade = q < 0.7 ? 1 : 1 - (q - 0.7) / 0.3;
      if (m.kind === 'sweat') {
        // 汗：頭の横から飛んで落ちる
        const r = hh * 0.035;
        const sx = x + h.facing * q * hh * 0.08;
        const sy = y + q * q * hh * 0.12;
        o.moveTo(sx, sy - r * 2.2).quadraticCurveTo(sx + r * 1.2, sy, sx, sy + r).quadraticCurveTo(sx - r * 1.2, sy, sx, sy - r * 2.2).fill({ color: 0x9fd8ff, alpha: fade }).stroke({ width: 2.5, color: ink, alpha: fade });
      } else if (m.kind === 'cross') {
        // 怒りの印（×）：ぽんと出て締まる
        const r = hh * 0.05 * (1 + 0.6 * Math.max(0, 1 - q * 5));
        for (const [a, b] of [[1, 1], [1, -1]]) o.moveTo(x - r * a, y - r * b).lineTo(x + r * a, y + r * b).stroke({ width: hh * 0.022, color: 0xff3050, alpha: fade, cap: 'round' });
      } else if (m.kind === 'sparkle') {
        const r = hh * 0.045 * Math.sin(q * Math.PI);
        o.poly([x, y - r, x + r * 0.25, y - r * 0.25, x + r, y, x + r * 0.25, y + r * 0.25, x, y + r, x - r * 0.25, y + r * 0.25, x - r, y, x - r * 0.25, y - r * 0.25]).fill({ color: 0xfff4c0, alpha: 0.9 });
      } else if (m.kind === 'note' && ti < this.markText.length) {
        const t = this.markText[ti++];
        t.visible = true;
        t.alpha = fade;
        t.scale.set((hh / 300) * (1 + 0.4 * Math.max(0, 1 - q * 6)));
        t.position.set(x + Math.sin(q * 9) * hh * 0.03, y - q * hh * 0.25);
      }
    }
    for (; ti < this.markText.length; ti++) this.markText[ti].visible = false;
    // 倒れたら頭の上を星がくるくる回る
    if (h.down > 0) {
      const gy = this.wy(h.lane) - hh * 0.25;
      for (let i = 0; i < 3; i++) {
        const a = this.vt * 4 + (i * Math.PI * 2) / 3;
        const sx = hx + Math.cos(a) * hh * 0.18;
        const sy = gy + Math.sin(a) * hh * 0.05;
        const r = hh * 0.04;
        const pts: number[] = [];
        for (let j = 0; j < 10; j++) {
          const rr = j % 2 ? r * 0.45 : r;
          const aa = -Math.PI / 2 + (j * Math.PI) / 5;
          pts.push(sx + Math.cos(aa) * rr, sy + Math.sin(aa) * rr);
        }
        o.poly(pts).fill(0xffe070).stroke({ width: 2, color: ink });
      }
    }
  }

  // 雲：月のそばほど紅く縁が光る。夜は藍、昼は白。月にかかると少し暗くなる
  private drawClouds(sim: Sim, dt: number, mx: number, my: number) {
    const g = this.geo;
    let cover = 0;
    for (const cl of this.clouds) {
      cl.x -= cl.sp * dt * (sim.phase === 'wave' ? 1 : 0.6);
      if (cl.x < -0.4) { cl.x = 1.3; cl.y = 0.05 + Math.random() * 0.3; }
      const x = cl.x * g.W * 1.6 - g.W * 0.2 - this.cam.x * 0.01;
      const y = g.Hm * cl.y;
      cl.c.position.set(x, y);
      cl.c.scale.set(cl.w * (g.W / 390));
      const d = Math.hypot(x - mx, y - my) / g.W;
      const near = Math.max(0, 1 - d * 2.2);
      cl.c.tint = mix(mix(0x3a2c58, 0x8a3a58, near), 0xffffff, this.dayK);
      cl.c.alpha = 0.55 + 0.25 * this.dayK;
      if (Math.abs(x - mx) < 90 * cl.w && Math.abs(y - my) < 30) cover = Math.max(cover, 1 - Math.abs(x - mx) / (90 * cl.w));
    }
    this.moonCover += (cover - this.moonCover) * Math.min(1, dt * 2);
  }
  private moonCover = 0;

  // 道に積もった花びらと、走った足あと
  private drawGroundMarks(gr: Graphics, sim: Sim, dt: number) {
    // 夜明けの光：決めポーズのあいだ、朝の光が地面を左から右へ走り、道の花びらが金色に光る
    const { z, ox } = this.xf;
    const band = sim.cheer >= 0 ? (-0.3 * this.geo.W + Math.min(1, sim.cheer / 1.3) * 1.6 * this.geo.W - ox) / z : NaN;
    const bw = this.geo.W * 0.18 / z;
    if (!Number.isNaN(band)) {
      const y0 = this.wy(0) - this.geo.Hm * 0.02;
      const y1 = this.wy(1) + this.geo.Hm * 0.03;
      for (let i = 0; i < 6; i++) {
        const k = 1 - i / 6;
        gr.rect(band - bw * k, y0, bw * 2 * k, y1 - y0).fill({ color: 0xffe0a0, alpha: 0.09 });
      }
    }
    for (const p of this.groundPetals) {
      const px = this.wx(p.x);
      const near = Number.isNaN(band) ? 0 : Math.max(0, 1 - Math.abs(px - band) / bw);
      const passed = !Number.isNaN(band) && px < band ? 0.35 : 0;
      const gold = Math.max(near, passed);
      gr.ellipse(px, this.wy(p.lane) + 2, p.r * 1.4 * (1 + near * 0.3), p.r * 0.6 * (1 + near * 0.3)).fill({ color: gold ? mix(p.c, 0xffd060, gold) : p.c, alpha: 0.55 + 0.4 * near });
    }
    // 主砲の跡：地面に平たく焼き付いた桜の紋。橙に光ってから冷めて紅く、薄れて消える
    this.crests = this.crests.filter((c) => (c.t += dt) < 3.2);
    for (const c of this.crests) {
      const q = c.t / 3.2;
      const r = c.r * this.geo.K * 1.7 * (c.t < 0.15 ? easeOut(c.t / 0.15) : 1); // 0.9 倍では小さく暗く、撮影で見えなかった
      const col = mix(0xffc060, 0xe04870, Math.min(1, c.t / 1.2));
      blossom(gr, this.wx(c.x), this.wy(c.lane) + 2, r * 1.15, 0.3, 0x200008, 0.35 * (1 - q), 0.32); // 焦げ
      blossom(gr, this.wx(c.x), this.wy(c.lane) + 2, r, 0.3, col, 0.85 * (1 - q) ** 1.2, 0.32);
      blossom(gr, this.wx(c.x), this.wy(c.lane) + 2, r * 0.55, 0.3 + Math.PI / 5, mix(col, 0xffffff, 0.5 * (1 - q)), 0.6 * (1 - q) ** 2, 0.32);
    }
    const h = sim.hero;
    this.stepT -= dt;
    if (h.running > 0 && h.z <= 0 && h.down <= 0 && this.stepT <= 0) {
      this.stepT = h.running > 400 ? 0.07 : 0.12;
      this.steps.push({ x: h.x, lane: h.lane, t: 0, side: this.steps.length % 2 ? 1 : -1 });
    }
    for (const st of this.steps) st.t += dt;
    this.steps = this.steps.filter((st) => st.t < 1.2);
    for (const st of this.steps) {
      const y = this.wy(st.lane) + st.side * 4;
      gr.ellipse(this.wx(st.x), y, 6, 2.5).fill({ color: 0x1a1018, alpha: 0.35 * (1 - st.t / 1.2) });
    }
  }

  // ガス灯：柱と灯り、地面の光だまり。灯りは少しゆらぐ。昼は消える
  private drawLamps(gr: Graphics, sim: Sim) {
    const g = this.geo;
    const night = 1 - this.dayK;
    for (const l of this.lamps) {
      const x = this.wx(l.x);
      const base = this.wy(0) - 12;
      const top = base - g.Hm * 0.24;
      gr.rect(x - 3, top, 6, base - top).fill(0x2a2028);
      gr.rect(x - 6, base - 6, 12, 6).fill(0x2a2028);
      gr.poly([x - 11, top, x + 11, top, x + 7, top - 20, x - 7, top - 20]).fill(0x3a2c30);
      gr.rect(x - 7, top - 18, 14, 16).fill({ color: 0xffd090, alpha: 0.4 + 0.5 * night });
      gr.poly([x - 13, top - 20, x + 13, top - 20, x, top - 30]).fill(0x2a2028);
      const flick = 0.85 + 0.1 * Math.sin(this.vt * 7 + l.x) + 0.05 * Math.sin(this.vt * 23 + l.x);
      l.head.position.set(x, top - 10);
      l.head.width = l.head.height = g.Hm * 0.16;
      l.head.alpha = 0.7 * night * flick;
      l.pool.position.set(x, this.wy(0.35));
      l.pool.width = g.Hm * 0.5;
      l.pool.height = g.Hm * 0.16;
      l.pool.alpha = 0.32 * night * flick;
    }
    void sim;
  }

  // 狼の頭の位置（狼は左を向く）。矢はここを狙う（2026-10-04 アマネさん「弓矢は頭狙ってほしい」）
  private wolfHead(x: number, lane: number, z: number, rel: number) {
    const wh = this.heroH(lane) * 0.6 * rel;
    return { x: this.wx(x) - wh * 0.32, y: this.wy(lane) - z * this.zk() - wh * 0.7 };
  }

  // 桜嵐の竜巻：足もとは細く、上へ行くほど広がる漏斗。花の色の帯が回りながら昇る（奥の半周は薄く）
  private drawTornado(o: Graphics, sim: Sim) {
    const h = sim.hero;
    if (h.ouran <= 0) return;
    const hh = this.heroH(h.lane);
    // 竜巻は始めた場所に立つ（千本桜の主人公は竜巻を突き抜けて駆ける）。締めのあとはしぼむ
    const cx = this.wx(h.spX);
    const gy = this.wy(h.spLane);
    const grow = Math.min(1, h.spT / 0.4, h.ouran / 0.5);
    const t = this.vt;
    const layers = 9;
    for (let i = 0; i < layers; i++) {
      const k = i / (layers - 1);
      const y = gy - hh * 1.7 * k * grow;
      const rx = hh * (0.18 + 0.85 * k) * grow;
      const ry = rx * 0.22;
      for (let j = 0; j < 3; j++) {
        const a0 = t * (7 - k * 2) + j * 2.1 + i * 0.6;
        const span = 1.3;
        const front = Math.sin(a0 + span / 2) > 0;
        const steps = 10;
        o.moveTo(cx + Math.cos(a0) * rx, y + Math.sin(a0) * ry);
        for (let q = 1; q <= steps; q++) {
          const a = a0 + (span * q) / steps;
          o.lineTo(cx + Math.cos(a) * rx, y + Math.sin(a) * ry);
        }
        o.stroke({ width: (3 + 5 * k) * (front ? 1 : 0.6), color: j === 0 ? 0xffffff : j === 1 ? 0xffb0cc : 0xff6a9a, alpha: (front ? 0.55 : 0.2) * (1 - k * 0.4), cap: 'round' });
      }
    }
    // 足もとの光
    o.ellipse(cx, gy, hh * 0.5 * grow, hh * 0.1 * grow).fill({ color: 0xff80b0, alpha: 0.18 + 0.08 * Math.sin(t * 12) });
  }

  // 主砲乱れ撃ちの弾：肩の砲口から狼まで、まっすぐ一瞬で届く光の線。締めの一発は極太
  private drawBeams(o: Graphics, sim: Sim) {
    for (const f of sim.fx) {
      if (f.kind !== 'beam') continue;
      const life = f.big ? 0.45 : 0.12;
      if (f.t > life) continue;
      const k = 1 - f.t / life;
      const h = sim.hero;
      const hh = this.heroH(f.lane);
      const dir = Math.sign((f.x2 ?? f.x) - f.x) || h.facing;
      const x0 = this.wx(f.x) + dir * hh * 0.35;
      const y0 = this.wy(f.lane) - hh * 0.72 - h.z * this.zk() * 0.75;
      const tw = f.n ? sim.wolves.find((w) => w.id === f.n) : undefined;
      const hd = tw ? this.wolfHead(tw.x, tw.lane, tw.z, WOLF_REL[tw.kind]) : null;
      const x1 = hd ? hd.x : this.wx(f.x2 ?? f.x);
      const y1 = hd ? hd.y : this.wy(f.lane2 ?? f.lane) - hh * (f.big ? 0.5 : 0.25);
      if (f.big) {
        const w = hh * 0.55 * (0.4 + 0.6 * k);
        o.moveTo(x0, y0).lineTo(x1, y1).stroke({ width: w * 1.8, color: 0xff8030, alpha: 0.25 * k, cap: 'round' });
        o.moveTo(x0, y0).lineTo(x1, y1).stroke({ width: w, color: 0xffd080, alpha: 0.6 * k, cap: 'round' });
        o.moveTo(x0, y0).lineTo(x1, y1).stroke({ width: w * 0.4, color: 0xffffff, alpha: 0.95 * k, cap: 'round' });
      } else {
        o.moveTo(x0, y0).lineTo(x1, y1).stroke({ width: 10 * k + 2, color: 0xff9040, alpha: 0.35 * k, cap: 'round' });
        o.moveTo(x0, y0).lineTo(x1, y1).stroke({ width: 3.5 * k + 1, color: 0xfff0c0, alpha: 0.95 * k, cap: 'round' });
        o.circle(x0, y0, hh * 0.09 * k).fill({ color: 0xffe0a0, alpha: 0.8 * k });
        o.circle(x1, y1, hh * 0.14 * k).fill({ color: 0xffc060, alpha: 0.6 * k });
      }
    }
  }

  private drawOver(sim: Sim, dt: number) {
    const o = this.overG.clear();
    const K = this.geo.K;
    this.drawTornado(o, sim);
    this.drawBeams(o, sim);
    this.drawBlade(o);
    this.drawMarks(o, sim);
    // 矢（放物線。高さは飛ぶ距離に比例させ、向きは軌道の接線に合わせる）
    for (const a of sim.arrows) {
      if (a.t < 0) continue;
      const hh = this.heroH(a.fromLane);
      const S = a.giant ? 3 : a.big ? 1.7 : 1; // 必殺技の矢は大きく
      // 弓の絵の矢の高さ（足もとから背の73%・前へ30%）から放つ（55%だと腰のあたりから出て見えた。2026-10-04 アマネさん）
      const x0 = this.wx(a.fromX) + Math.sign(a.toX - a.fromX) * hh * 0.3;
      const y0 = this.wy(a.fromLane) - hh * 0.73 - (a.fromZ ?? 0) * this.zk() * 0.75;
      const tw = !a.rain ? sim.wolves.find((w) => w.id === a.target) : undefined;
      const hd = tw ? this.wolfHead(tw.x, tw.lane, tw.z, WOLF_REL[tw.kind]) : null;
      const x1 = hd ? hd.x : this.wx(a.toX);
      const y1 = hd ? hd.y : a.giant ? y0 : this.wy(a.lane) - this.geo.Hm * 0.05;
      // 放った瞬間：弓のまわりに輪と花びら
      if (!this.seenArrows.has(a)) {
        this.seenArrows.add(a);
        this.parts.ring(x0, y0, 4, hh * 0.22, 3, 0xffd0e0, 0.18);
        for (let i = 0; i < 3; i++) this.parts.petal(x0, y0, this.geo.Hm / 600, Math.sign(x1 - x0) * (80 + Math.random() * 120), -60 - Math.random() * 120, 0.5);
      }
      // ふつうの矢はほぼまっすぐ。矢の雨だけ高い放物線
      const arc = Math.abs(x1 - x0) * (a.rain ? 0.3 : a.giant || a.fromZ ? 0 : 0.04);
      const at = (t: number) => {
        const vx = x1 - x0;
        const vy = y1 - y0 - Math.cos(Math.PI * t) * Math.PI * arc;
        const len = Math.hypot(vx, vy) || 1;
        return { x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t - Math.sin(Math.PI * t) * arc, ux: vx / len, uy: vy / len };
      };
      const { x, y, ux, uy } = at(a.t);
      const L = hh * 0.3 * S; // 矢の長さ
      // 残像：少し前の位置に、桜色の矢の影を4本。古いほど薄く小さい（主人公の残像とそろえる）
      for (let i = 4; i >= 1; i--) {
        const t = a.t - i * 0.06;
        if (t <= 0) continue;
        const p = at(t);
        const k = 1 - i / 5;
        const l = L * (0.75 + 0.25 * k);
        const al = 0.42 * k;
        o.moveTo(p.x - p.ux * l, p.y - p.uy * l).lineTo(p.x, p.y).stroke({ width: (3.5 * k + 1) * S, color: 0xff9cc0, alpha: al, cap: 'round' });
        o.poly([p.x + p.ux * 10, p.y + p.uy * 10, p.x - p.uy * 5, p.y + p.ux * 5, p.x + p.uy * 5, p.y - p.ux * 5]).fill({ color: 0xffd0e2, alpha: al });
        for (const sg of [1, -1]) {
          const fx = p.x - p.ux * l;
          const fy = p.y - p.uy * l;
          o.poly([fx, fy, fx + p.ux * 14 - p.uy * 6 * sg, fy + p.uy * 14 + p.ux * 6 * sg, fx + p.ux * 18, fy + p.uy * 18]).fill({ color: 0xffd0e2, alpha: al });
        }
      }
      // 光の尾（桜色）：飛んだ道に沿って長く
      const tail = Math.min(a.t, 0.35) * Math.hypot(x1 - x0, y1 - y0);
      o.moveTo(x - ux * (L + tail), y - uy * (L + tail)).lineTo(x - ux * L * 0.3, y - uy * L * 0.3).stroke({ width: 7 * S * (a.giant ? 2 : 1), color: 0xff7aa8, alpha: a.giant ? 0.35 : 0.18, cap: 'round' });
      o.moveTo(x - ux * (L + tail * 0.5), y - uy * (L + tail * 0.5)).lineTo(x - ux * L * 0.3, y - uy * L * 0.3).stroke({ width: 3 * S, color: 0xffd8e8, alpha: a.giant ? 0.9 : 0.5, cap: 'round' });
      // 矢柄・矢じり・矢羽
      o.moveTo(x - ux * L, y - uy * L).lineTo(x, y).stroke({ width: 4.5 * S, color: 0x3a2018, cap: 'round' });
      o.moveTo(x - ux * L, y - uy * L).lineTo(x, y).stroke({ width: 2.2 * S, color: 0xc89060, cap: 'round' });
      const hx = x + ux * 12 * S;
      const hy = y + uy * 12 * S;
      o.poly([hx, hy, x - uy * 6 * S, y + ux * 6 * S, x + uy * 6 * S, y - ux * 6 * S]).fill(0xe8eef8).stroke({ width: 1.5, color: 0x2a1a20 });
      for (const sg of [1, -1]) {
        const fx = x - ux * L;
        const fy = y - uy * L;
        o.poly([fx, fy, fx + (ux * 16 - uy * 7 * sg) * S, fy + (uy * 16 + ux * 7 * sg) * S, fx + ux * 20 * S, fy + uy * 20 * S]).fill(0xffe8f0).stroke({ width: 1.2, color: 0x2a1a20 });
      }
      // 放った瞬間の光・飛んでいるあいだのきらめき
      if (a.t < 0.12) this.parts.glow(x0, y0, hh * 0.5 * (1 - a.t / 0.12), 0xffc0d8, 0.08, 0.8, 0.5);
      if (Math.random() < 0.7) this.parts.glow(x - ux * L * 0.6, y - uy * L * 0.6, hh * 0.09 * S, 0xffe0ee, 0.25, 0.9, -0.6);
      if (a.giant) this.parts.glow(x, y, hh * 0.6, 0xffc0d8, 0.15, 0.9, 0.5);
    }
    // 頭に刺さった矢：狼について動き、0.35秒で消える
    this.stuck = this.stuck.filter((st) => (st.t += dt) < 0.35);
    for (const st of this.stuck) {
      const w = sim.wolves.find((o) => o.id === st.id);
      if (w) { st.x = w.x; st.lane = w.lane; st.z = w.z; }
      const hd = this.wolfHead(st.x, st.lane, st.z, st.rel);
      const L = this.heroH(st.lane) * 0.16;
      const al = 1 - st.t / 0.35;
      const ex = hd.x - st.dir * L;
      const ey = hd.y - L * 0.12;
      o.moveTo(ex, ey).lineTo(hd.x, hd.y).stroke({ width: 4, color: 0x3a2018, alpha: al, cap: 'round' });
      o.moveTo(ex, ey).lineTo(hd.x, hd.y).stroke({ width: 2, color: 0xc89060, alpha: al, cap: 'round' });
      o.poly([ex, ey, ex - st.dir * 12, ey - 6, ex - st.dir * 14, ey + 2]).fill({ color: 0xffe8f0, alpha: al });
    }
    // 弓を引いているあいだ、弓が桜色に光る
    const hb = sim.hero;
    if ((hb.move === 'bow' || hb.move === 'ame') && hb.moveT < MOVES[hb.move].dur * 0.5) {
      const hh = this.heroH(hb.lane);
      const k = hb.moveT / (MOVES[hb.move].dur * 0.5);
      const bx = this.wx(hb.x) + hb.facing * hh * 0.25;
      const by = this.wy(hb.lane) - hh * 0.73 - hb.z * this.zk() * 0.75;
      o.circle(bx, by, hh * (0.05 + 0.08 * k)).fill({ color: 0xffb0d0, alpha: 0.25 * k });
      o.circle(bx, by, hh * (0.02 + 0.03 * k)).fill({ color: 0xffffff, alpha: 0.5 * k });
    }
    // 砲弾（4連装・真っすぐ）：主砲の高さを真横へ。白く光る弾と、後ろへ伸びる火の尾
    for (const sh of sim.shells) {
      if (sh.t < 0) continue;
      const x = this.wx(sh.x);
      const hh = this.heroH(sh.lane);
      const y = this.wy(sh.lane) - hh * 0.62;
      const tail = Math.min(hh * 1.4, sh.t * SHELL.speed * this.U(sh.lane) * 0.02);
      o.moveTo(x - sh.dir * tail, y).lineTo(x, y).stroke({ width: hh * 0.07, color: 0xff7a30, alpha: 0.55, cap: 'round' });
      o.moveTo(x - sh.dir * tail * 0.55, y).lineTo(x, y).stroke({ width: hh * 0.035, color: 0xfff0c0, alpha: 0.9, cap: 'round' });
      o.circle(x, y, hh * 0.06).fill({ color: 0xffa040, alpha: 0.45 });
      o.circle(x, y, hh * 0.032).fill(0xfffaf0);
      if (Math.random() < 0.5) this.parts.dust(x - sh.dir * hh * 0.1, y, 0.5, 1, 10, 0);
    }
    // 狼王の遠吠えの波：地面を走る紅い三日月（跳べばよけられる）
    for (const v of sim.waves) {
      const x = this.wx(v.x);
      const H = this.geo.Hm;
      for (let ln = 0; ln <= 1.001; ln += 0.25) {
        const y = this.wy(ln) - H * 0.03;
        for (let i = 0; i < 3; i++) crescent(o, x - v.dir * i * 12, y, H * (0.07 - i * 0.015), v.dir > 0 ? -Math.PI * 0.35 : Math.PI * 0.65, v.dir > 0 ? Math.PI * 0.35 : Math.PI * 1.35, 9 - i * 2.5, 0xff3040, 0.9 - i * 0.25);
      }
    }
    // 数字：跳ねて上へ消える。出た瞬間に大きく、すぐ締まる。大きい一撃は大きく黄色く
    const live = new Map<number, Fx>();
    for (const f of sim.fx) if (f.kind === 'num' || (f.kind === 'poof' && f.n)) live.set(f.id, f);
    for (let i = 0; i < this.nums.length; i++) {
      if (this.numOwner[i] >= 0 && !live.has(this.numOwner[i])) this.numOwner[i] = -1;
    }
    const stack = { l: 0, r: 0 }; // 端に寄せた数字を、同じ向きどうし少しずつずらして積む（重ならないように）
    for (const f of live.values()) {
      let i = this.numOwner.indexOf(f.id);
      if (i < 0) {
        i = this.numOwner.indexOf(-1);
        if (i < 0) continue; // 枠が足りなければ出さない
        this.numOwner[i] = f.id;
        const t = this.nums[i];
        t.text = f.kind === 'poof' ? `+${f.n}銭` : String(f.n);
        t.style.fontSize = f.kind === 'poof' ? 15 : f.big ? 34 : 22;
        t.style.fill = f.kind === 'poof' ? 0xffd860 : f.color ? COLOR_GLOW(f.color) : f.big ? 0xffd040 : 0xffffff; // 弱い武器で当てた数字はその狼の色で
      }
      const t = this.nums[i];
      const q = f.t / (f.kind === 'num' ? 0.8 : 0.6);
      t.visible = true;
      const x = this.wx(f.x);
      const y = this.wy(f.lane) - (f.z ?? 0) * this.zk() - this.geo.Hm * 0.12;
      if (f.kind === 'poof') {
        t.scale.set(1);
        t.alpha = 1 - q;
        t.position.set(x, y - this.geo.Hm * 0.04 - q * 40);
        continue;
      }
      const pop = 1 + 0.7 * Math.max(0, 1 - q * 7);
      t.scale.set(pop);
      t.alpha = q < 0.6 ? 1 : 1 - (q - 0.6) / 0.4;
      let nx = x + ((f.id * 37) % 41) - 20;
      // 画面の外の狼に当てた数字は、その向きの画面の端に寄せて出す（2026-10-05 アマネさん「メイン画面の外の敵に当たったことわからない」）
      const zs = this.world.scale.x;
      const m = 34 / zs;
      const lo = -this.world.x / zs + m;
      const hi = (this.geo.W - this.world.x) / zs - m;
      const out = nx < lo || nx > hi;
      const label = String(f.n);
      if (t.text !== label) t.text = label;
      let ny = y - ((f.id * 53) % 17) - easeOut(Math.min(1, q * 3)) * 34;
      if (out) {
        // 向きは数字の外側の小さい三角で（前は「◀」の字で、大きくて数字が重なった。レビュー14）
        const right = nx > hi;
        nx = right ? hi : lo;
        t.scale.set(pop * 0.8 / zs); // 端の数字は引いた画面でも同じ大きさで読めるように
        t.alpha *= 0.9;
        ny = y - this.geo.Hm * 0.04 - (right ? stack.r++ : stack.l++) * 24 / zs - easeOut(Math.min(1, q * 3)) * 20 / zs;
        const d = right ? 1 : -1;
        const tx = nx + d * (m - 8 / zs);
        const a = 7 / zs;
        this.wolfHud.poly([tx + d * a, ny, tx - d * a * 0.6, ny - a, tx - d * a * 0.6, ny + a]).fill({ color: t.style.fill as number, alpha: t.alpha });
      }
      t.position.set(nx, ny);
    }
    for (let i = 0; i < this.nums.length; i++) if (this.numOwner[i] < 0) this.nums[i].visible = false;
    void K;
    void dt;
  }

  // 倒した狼：影が刃の線で上下に割れてずれ、端から花びらにほどけて消える
  private splitWolf(f: Fx, x: number, y: number, s: number) {
    const kind = f.wolf!;
    const dir = f.dir || 1;
    const hh = this.heroH(f.lane) * 0.6 * WOLF_REL[kind];
    const cy = y - this.wolves.center(hh);
    // 花びらにほどける：体のあたりから、影の色と桜色の花びらが当てた向きへ流れる
    const SHADOW = [0x2a1c2c, 0x45283c, 0x6a3850, ...PINK];
    for (let i = 0; i < 16; i++) {
      this.parts.petal(x + (Math.random() - 0.5) * hh * 0.9, cy + (Math.random() - 0.5) * hh * 0.6, s, dir * (80 + Math.random() * 220), -60 - Math.random() * 160, 0.9 + Math.random() * 0.8, SHADOW);
    }
    if (!this.wolves.ready || this.splits.length >= 10) return;
    const fur = this.furOf(kind, f.color);
    const tex = (fur ? this.wolves.dye(kind as WolfArt, fur) : this.wolves.tex[kind as keyof typeof this.wolves.tex]) as Texture | undefined;
    const m = this.wolves.meta[kind as keyof typeof this.wolves.meta] as { size: [number, number]; feet: [number, number] } | undefined;
    if (!tex || !m) return;
    const a = -dir * (0.25 + Math.random() * 0.25); // 刃の線（少し斜め）
    const half = (top: boolean) => {
      const c = new Container();
      c.position.set(x, cy);
      c.rotation = a;
      const sp = new Sprite(tex);
      sp.anchor.set(m.feet[0] / m.size[0], (m.feet[1] * 0.55) / m.size[1]);
      const k = hh / m.feet[1];
      sp.scale.set(k);
      sp.rotation = -a;
      sp.tint = 0xffd8e0;
      const L = hh * 2;
      const mask = new Graphics().rect(-L, top ? -L : 0, L * 2, L).fill(0xffffff);
      c.addChild(sp, mask);
      sp.mask = mask;
      this.splitLayer.addChild(c);
      return c;
    };
    this.splits.push({ top: half(true), bot: half(false), t: 0, dir, hh, x, y: cy, a });
  }

  private runSplits(dt: number) {
    const o = this.overG;
    this.splits = this.splits.filter((sp) => {
      sp.t += dt;
      const life = 0.45;
      if (sp.t >= life) {
        sp.top.destroy({ children: true });
        sp.bot.destroy({ children: true });
        return false;
      }
      const q = sp.t / life;
      const e = easeOut(Math.min(1, q * 1.4));
      // 上の半分は刃の向きへ滑って少し回り、下の半分は少し沈む
      const nx = Math.sin(sp.a);
      const ny = -Math.cos(sp.a);
      sp.top.position.set(sp.x + Math.cos(sp.a) * sp.dir * sp.hh * 0.22 * e + nx * sp.hh * 0.06 * e, sp.y + ny * sp.hh * 0.08 * e);
      sp.top.rotation = sp.a + sp.dir * 0.12 * e;
      sp.bot.position.set(sp.x - Math.cos(sp.a) * sp.dir * sp.hh * 0.05 * e, sp.y + sp.hh * 0.05 * e);
      sp.top.alpha = sp.bot.alpha = (1 - q) ** 1.3;
      // 割れた瞬間の白い刃の線
      if (sp.t < 0.12) {
        const L = sp.hh * 0.75 * (0.6 + 0.4 * (sp.t / 0.12));
        const c = Math.cos(sp.a);
        const s2 = Math.sin(sp.a);
        o.moveTo(sp.x - c * L, sp.y - s2 * L).lineTo(sp.x + c * L, sp.y + s2 * L).stroke({ width: 4 * (1 - sp.t / 0.12) + 1, color: 0xffffff, alpha: 0.95, cap: 'round' });
      }
      return true;
    });
  }

  // 連撃30・50・100：画面の左右の縁から桜の枝がすっと伸び、花が咲いて、少しして消える
  private watchCombo(sim: Sim) {
    const crossed = (n: number) => this.lastCombo < n && sim.combo >= n;
    if (crossed(30) || crossed(50) || crossed(100)) this.branch = { t: 0, big: sim.combo >= 50 };
    this.lastCombo = sim.combo;
  }

  private drawBranches(s: Graphics, dt: number) {
    const b = this.branch;
    if (!b) return;
    b.t += dt;
    const life = 2.4;
    if (b.t >= life) { this.branch = null; return; }
    const g = this.geo;
    const grow = easeOut(Math.min(1, b.t / 0.55));
    const fade = b.t > life - 0.5 ? (life - b.t) / 0.5 : 1;
    const L = g.W * (b.big ? 0.42 : 0.32);
    for (const side of [-1, 1]) {
      // 決まった形の枝（毎回同じ）。左の縁から右下へ、右の縁から左下へ
      const x0 = side < 0 ? -4 : g.W + 4;
      const y0 = g.Hm * 0.2;
      const pts: [number, number][] = [];
      for (let i = 0; i <= 10; i++) {
        const k = i / 10;
        pts.push([x0 - side * L * k, y0 + L * 0.35 * k * k + Math.sin(k * 5 + side) * g.W * 0.02]);
      }
      const shown = Math.max(1, Math.round(10 * grow));
      for (let i = 1; i <= shown; i++) {
        const w = (1 - i / 11) * g.W * 0.022 + 1;
        // 夜空に沈まないよう、暗い枝に月明かりの縁を1本
        s.moveTo(pts[i - 1][0], pts[i - 1][1]).lineTo(pts[i][0], pts[i][1]).stroke({ width: w + 2, color: 0xd8a0b8, alpha: 0.55 * fade, cap: 'round' });
        s.moveTo(pts[i - 1][0], pts[i - 1][1]).lineTo(pts[i][0], pts[i][1]).stroke({ width: w, color: 0x5a3038, alpha: 0.95 * fade, cap: 'round' });
      }
      // 小枝と花：枝が通ったところから順に咲く
      for (let i = 2; i <= 10; i += 2) {
        if (i > shown) break;
        const [px, py] = pts[i];
        const tx = px - side * g.W * 0.04;
        const ty = py + (i % 4 ? -1 : 1) * g.W * 0.05;
        s.moveTo(px, py).lineTo(tx, ty).stroke({ width: 3.5, color: 0xd8a0b8, alpha: 0.5 * fade, cap: 'round' });
        s.moveTo(px, py).lineTo(tx, ty).stroke({ width: 2, color: 0x5a3038, alpha: 0.95 * fade, cap: 'round' });
        const bt = Math.max(0, b.t - (i / 10) * 0.55);
        const open = Math.min(1, bt / 0.25);
        const r = g.W * (b.big ? 0.03 : 0.024) * easeOut(open) * (0.85 + ((i * 13) % 5) * 0.06);
        blossom(s, tx, ty, r, i * 0.7, PINK[i % 4], 0.95 * fade);
        blossom(s, px, py, r * 0.75, i * 1.3, PINK[(i + 1) % 4], 0.9 * fade);
      }
    }
  }

  private drawScreen(sim: Sim, dt: number, z: number, ox: number) {
    const s = this.screen.clear();
    const g = this.geo;
    const h = sim.hero;
    // 桜嵐：背景を暗く。夜の様子：紅月は赤く、霧は白くかすむ
    const sh = this.shade.clear();
    if (sim.phase === 'wave' && sim.mood === 'beni') sh.rect(0, 0, g.W, g.Hm).fill({ color: 0xa01020, alpha: 0.16 });
    if (this.moonCover > 0.02 && this.dayK < 0.5) sh.rect(0, 0, g.W, g.Hm).fill({ color: 0x000008, alpha: 0.12 * this.moonCover }); // 雲が月にかかると少し暗く
    if (sim.phase === 'wave' && sim.mood === 'kiri') sh.rect(0, g.horizon * 0.5, g.W, g.Hm).fill({ color: 0xb8b0d0, alpha: 0.12 });
    if (h.ouran > 0) sh.rect(0, 0, g.W, g.Hm).fill({ color: 0x100008, alpha: 0.45 });
    // 周辺の暗がり（ずっと薄く。体力が少ないと赤く脈打つ）
    const low = sim.phase === 'wave' && h.down <= 0 && h.hp < sim.maxHp * 0.3;
    const vc = low ? 0x800010 : h.ouran > 0 ? 0x601020 : 0x000000;
    const va = low ? 0.35 + 0.2 * Math.sin(this.vt * 6) : 0.3 + 0.12 * (1 - this.dayK); // 夜は四隅を少し濃く
    const edge = Math.min(g.W, g.Hm) * 0.12;
    for (let i = 0; i < 6; i++) {
      const k = i / 6;
      const a = va * (1 - k) * 0.35;
      const e = edge * k;
      s.rect(0, 0, g.W, e + 3).fill({ color: vc, alpha: a });
      s.rect(0, g.Hm - e - 3, g.W, e + 3).fill({ color: vc, alpha: a });
      s.rect(0, 0, e + 3, g.Hm).fill({ color: vc, alpha: a });
      s.rect(g.W - e - 3, 0, e + 3, g.Hm).fill({ color: vc, alpha: a });
    }
    // 溜め：画面の縁が暖かく光る
    if (h.charge >= 0) {
      const c = Math.min(1, h.charge / sim.chargeFull);
      s.rect(0, 0, g.W, g.Hm).stroke({ width: 10 * c, color: c >= 1 ? 0xffe070 : 0xff9040, alpha: 0.35 + 0.25 * Math.sin(this.vt * 20) * c });
    }
    // 閃光（大きい一撃・主砲）
    if (this.flash > 0) {
      s.rect(0, 0, g.W, g.Hm).fill({ color: this.flashColor, alpha: Math.min(0.45, this.flash) });
      this.flash = Math.max(0, this.flash - dt * 5);
      if (this.flash <= 0) this.flashColor = 0xffffff;
    }
    // 一瞬の白い影のあいだは、まわりを暗くする
    if (this.impact > 0) sh.rect(0, 0, g.W, g.Hm).fill({ color: 0x000000, alpha: 0.35 });
    // 噛まれた：画面に3本の爪あと（さっと走って薄れる）
    // （'hurt' は体力が3割を切ったときだけなので、噛まれるたびに立つ hitFlash を見る）
    const bitten = h.hitFlash > this.lastHeroFlash + 0.05;
    this.lastHeroFlash = h.hitFlash;
    if (bitten && (!this.claws || this.claws.t > 0.3)) {
      this.claws = { t: 0, x: g.W * (0.3 + Math.random() * 0.4), y: g.Hm * (0.3 + Math.random() * 0.25), a: (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 0.3) };
    }
    if (this.claws) {
      const c = this.claws;
      c.t += dt;
      const life = 0.55;
      if (c.t >= life) this.claws = null;
      else {
        const R = g.W * 0.9;
        for (let i = 0; i < 3; i++) {
          const run = Math.min(1, Math.max(0, (c.t - i * 0.025) / 0.08)); // 1本ずつ、さっと走る
          const al = (1 - c.t / life) * 0.85;
          const off = (i - 1) * g.W * 0.06;
          // 3本を横に並べる（中心ごと、線と直角の向きへずらす）
          const cx = c.x + Math.cos(c.a + Math.PI / 2) * R + Math.cos(c.a - Math.PI / 2) * off;
          const cy = c.y + Math.sin(c.a + Math.PI / 2) * R + Math.sin(c.a - Math.PI / 2) * off;
          const a0 = c.a - Math.PI / 2 - 0.13;
          crescent(s, cx, cy, R, a0, a0 + 0.26 * run, g.W * 0.022, 0xc01028, al);
          crescent(s, cx, cy, R, a0, a0 + 0.26 * run, g.W * 0.008, 0xffe0e0, al);
        }
      }
    }
    this.drawBranches(s, dt);
    // 画面の外の狼：端に矢印と数（家に近い狼がいると赤く脈打つ）
    const x0 = (0 - ox) / z / g.K;
    const x1 = (g.W - ox) / z / g.K;
    const leftN = sim.wolves.filter((w) => w.x < x0).length;
    const rightN = sim.wolves.filter((w) => w.x > x1).length;
    const danger = sim.wolves.some((w) => w.x < 200 && w.x < x0);
    const ay = g.Hm * 0.7;
    const arrow = (x: number, dir: number, n: number, i: number, red: boolean) => {
      const t = this.edgeText[i];
      t.visible = n > 0 && sim.phase === 'wave';
      if (!t.visible) return;
      const pulse = 1 + 0.12 * Math.sin(this.vt * (red ? 12 : 5));
      const c = red ? 0xff4050 : 0xffffff;
      s.poly([x, ay, x - dir * 16 * pulse, ay - 13 * pulse, x - dir * 16 * pulse, ay + 13 * pulse]).fill({ color: c, alpha: 0.85 });
      t.text = String(n);
      t.style.fill = c;
      t.position.set(x - dir * 30, ay);
    };
    arrow(g.W - 6, 1, rightN, 1, false);
    arrow(6, -1, leftN, 0, danger);
    if (danger && sim.phase === 'wave') s.rect(0, 0, 8, g.Hm).fill({ color: 0xff2030, alpha: 0.3 + 0.25 * Math.sin(this.vt * 12) });
    // 指の軌跡（はじいた手応え）
    const now = this.vt;
    this.trail = this.trail.filter((p) => now - p.t < 0.18);
    for (let i = 1; i < this.trail.length; i++) {
      const a = this.trail[i - 1];
      const b = this.trail[i];
      const k = 1 - (now - b.t) / 0.18;
      s.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ width: 2 + 8 * k, color: 0xffe0f0, alpha: 0.55 * k, cap: 'round' });
    }
  }

  // 絵が読めないときの主人公（赤い箱）
  private boxHero(g: Graphics, sim: Sim, x: number, y: number) {
    const h = sim.hero;
    const b = this.heroH(h.lane) * 0.22;
    const lift = h.z * this.zk() * 0.55;
    const col = h.ouran > 0 ? (Math.floor(sim.clock * 20) % 2 ? 0xffe060 : 0xff6040) : h.hitFlash > 0 ? 0xffffff : 0xc0303a;
    if (h.down > 0) {
      g.rect(x - b * 1.5, y - b * 0.8, b * 3, b * 0.8).fill({ color: col, alpha: 0.6 });
      return;
    }
    g.rect(x - b / 2, y - b * 3.6 - lift, b, b * 3.6).fill(col);
    g.circle(x, y - b * 4.1 - lift, b * 0.6).fill(0x201818);
  }

  // 主人公の絵が揃ったか（揃うまでは仮の細い姿になるので、始めるボタンを止めておく）
  get ready() {
    return this.rig.ready && this.wolves.ready;
  }

  // 撮影・点検用：主人公の今の姿勢（残像を作るのと同じ値）
  nowPose() {
    return this.rig.ready;
  }

  laneTolPx() {
    return LANE_TOL * this.geo.laneH;
  }
}

type DogArt = DogKind | `${DogKind}_run` | `${DogKind}_bite`;
type WolfArt = WolfKind | 'wolf_walk2' | 'wolf_bite' | 'wolf_hit' | 'wolf_air' | 'pup_bite' | 'armored_bite' | 'howler_bite' | 'alpha_bite' | 'howler_hit' | 'alpha_hit'
  | 'wman_wind' | 'wman_swing' | 'wman_hit' | 'wwoman_crouch' | 'wwoman_leap' | 'wwoman_claw' | 'wwoman_hit' | 'crow_down' | 'crow_cling' | 'crow_hit'
  | 'wman_air' | 'wman_down' | 'wwoman_air' | 'wwoman_down' | 'pup_hit' | 'armored_hit' | 'crow_dive' | 'crow_ko'
  | 'king_crouch' | 'king_rear' | 'king_howl' | 'king_down';
const ROLE_COLOR = { guard: 0x70b8ff, attack: 0xff6070, support: 0x80e090 };

// 少し行きすぎて戻る（出てくる・置く）
function backOut(t: number) {
  const c = 1.9;
  t = Math.min(1, t) - 1;
  return 1 + (c + 1) * t * t * t + c * t * t;
}

void glowTexture;

// 色の狼の縁取り・印の色（config の ui）
const COLOR_GLOW = (c: WolfColor) => parseInt(COLORS[c].ui.slice(1), 16);
