// 戦場の描画。主人公のアップをカメラで追い、下に戦場全体の小さい地図（minimap.ts）を出す（2026-10-04）。
// 狼・番犬はまだ灰色の箱（絵は生成で作る・plan.md §6）。動き・演出は箱のままでも作り込む：
// 走り・跳ね・のけぞり・打ち上げの回転・残像・斬撃の弧・火花・桜・土煙・画面の揺れと寄り・ヒットストップ。
import { Application, Assets, Container, Graphics, Sprite, Text, type Texture } from 'pixi.js';
import { Backdrop, mix } from './backdrop';
import { DOG_ORDER, DOG_ROLES, DOGS, FIELD_LENGTH, HERO, HOUSE_HP, HOUSE_X, LANE_TOL, MOVES, WOLF_SPAWN_X, WOLVES, type DogKind } from './config';
import { crescent, easeOut, glowTexture, Particles, place } from './fx';
import { HeroRig, type Pose } from './heroRig';
import { Minimap } from './minimap';
import { DOG_REL, UnitArt, WOLF_REL } from './wolfArt';
import { DOG_COLOR, WOLF_COLOR } from './palette';
import { Sim, type Dog, type Fx, type Wolf } from './sim';
import type { WolfKind } from './config';

const COLOR = {
  heroHp: 0xf06070,
  hpBack: 0x000000,
  arrow: 0xd8f0ff,
  shell: 0xe8c070,
  shock: 0x9ab0ff,
};

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
  // 動きの絵：ふつうの狼はもう1歩・噛みつき・のけぞり・宙で転がる（wolf-motion-v1）。
  // ほかの4種類は噛みつき、遠吠えと大狼はのけぞりも（pack-motion-v1）
  private wolves = new UnitArt<WolfArt>('wolves', ['pup', 'wolf', 'armored', 'howler', 'alpha', 'wolf_walk2', 'wolf_bite', 'wolf_hit', 'wolf_air', 'pup_bite', 'armored_bite', 'howler_bite', 'alpha_bite', 'howler_hit', 'alpha_hit'], this.wolfBack, this.wolfFront);
  private dogBack = new Container();
  private dogFront = new Container();
  private dogArt = new UnitArt<DogArt>('dogs', ['shiba', 'akita', 'tosa', 'shiba_run', 'akita_run', 'tosa_run', 'shiba_bite', 'akita_bite', 'tosa_bite'], this.dogBack, this.dogFront); // 走り・噛みつきの絵は dogs-motion-v1 // 入れ物は狼と分ける（同じだと狼の後片付けで犬が消えた）
  private house = new Sprite(); // おばあさんの家の絵
  private houseOver = new Graphics(); // 家のひび（絵の上）
  private overG = new Graphics(); // 矢・砲弾・衝撃波・斬撃の弧・裂け目
  private ghostLayer = new Container();
  private rig = new HeroRig();
  private ghosts: { rig: HeroRig; pose: Pose | null; t: number; tint: number }[] = [];
  private ghostT = 0;
  private parts = new Particles(); // 世界の粒
  private screenParts = new Particles(); // 画面の粒（速度線・桜嵐の花吹雪）
  private screen = new Graphics(); // 画面に固定の演出（周辺の暗がり・閃光・矢印・指の軌跡）
  private blade: { x: number; y: number; t: number }[][] = [[], []]; // 刃先の通り道（ナイフ2本）
  private marks: { kind: 'sweat' | 'cross' | 'sparkle' | 'note' | 'star'; t: number; life: number; ox: number; oy: number }[] = []; // 漫画の記号（頭のまわり）
  private markText: Text[] = [];
  private lastHitFlash = 0;
  private noteT = 0;
  private nums: Text[] = [];
  private numOwner: number[] = []; // 数字の枠ごとに、受け持つ fx の id（-1 は空き）。枠を固定して、文字の絵を作り直すのは出た瞬間だけにする
  private edgeText: Text[] = [];
  private mini = new Minimap();
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
    st.addChild(this.backdrop.sky, this.backdrop.stars, this.backdrop.rays, this.backdrop.moon, this.paraRoot, this.dayLift, this.shade, this.world);
    this.dayLift.blendMode = 'add';
    for (let i = 0; i < 7; i++) {
      const f = new Sprite(glowTexture());
      f.anchor.set(0.5);
      f.tint = 0xa898d0;
      this.fog.push(f);
    }
    this.world.addChild(this.ground, ...this.fog, this.house, this.houseOver, this.backG, this.dogBack, this.wolfBack, this.ghostLayer, this.rig.root, this.frontG, this.dogFront, this.wolfFront, this.wolfHud, this.overG, this.parts.root);
    for (let i = 0; i < 48; i++) {
      const t = new Text({ text: '', style: { fontFamily: 'system-ui, sans-serif', fontWeight: '900', fontStyle: 'italic', fontSize: 22, fill: 0xffffff, stroke: { color: 0x000000, width: 5 } } });
      t.anchor.set(0.5);
      t.visible = false;
      this.world.addChild(t);
      this.nums.push(t);
      this.numOwner.push(-1);
    }
    for (let i = 0; i < 4; i++) {
      const t = new Text({ text: '♪', style: { fontFamily: 'system-ui, sans-serif', fontWeight: '900', fontSize: 30, fill: 0xffe070, stroke: { color: 0x40202a, width: 5 } } });
      t.anchor.set(0.5);
      t.visible = false;
      this.world.addChild(t);
      this.markText.push(t);
    }
    for (let i = 0; i < DOG_ORDER.length; i++) {
      const t = new Text({ text: '', style: { fontFamily: 'system-ui, sans-serif', fontWeight: '900', fontSize: 22, fill: 0xffe0a0, stroke: { color: 0x000000, width: 5 } } });
      t.anchor.set(0.5, 1);
      t.visible = false;
      this.world.addChild(t);
      this.roleText.push(t);
    }
    st.addChild(this.screenParts.root, this.screen);
    for (let i = 0; i < 2; i++) {
      const t = new Text({ text: '', style: { fontFamily: 'system-ui, sans-serif', fontWeight: '900', fontSize: 14, fill: 0xffffff, stroke: { color: 0x000000, width: 4 } } });
      t.anchor.set(0.5);
      st.addChild(t);
      this.edgeText.push(t);
    }
    st.addChild(this.mini.root);
    Assets.load<Texture>(`${import.meta.env.BASE_URL}ui/moon.webp`).then((t) => {
      this.backdrop.moonArt.texture = t;
      this.backdrop.moonArt.visible = true;
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
      this.lastWave = ''; // 次の draw で作り直す
    }).catch((e) => console.warn('town', e));
    // 狼の絵。読み込めなければ箱のまま
    this.wolves.load().catch((e) => console.warn('wolves', e));
    this.house.visible = false;
    this.dogArt.load(['house']).then(() => {
      const m = this.dogArt.meta['house' as DogArt];
      this.house.texture = this.dogArt.tex['house' as DogArt];
      this.house.anchor.set(m.feet[0] / m.size[0], m.feet[1] / m.size[1]);
      this.house.visible = true;
    }).catch((e) => console.warn('dogs', e));
    // 赤ずきんの絵。読み込めなければ箱のまま遊べる（?rig=0 で箱：見比べ用）
    if (new URLSearchParams(location.search).get('rig') !== '0') {
      const all = [this.rig, ...Array.from({ length: GHOSTS }, () => new HeroRig())];
      Promise.all([...all.map((r) => r.load()), this.mini.load()]).then(() => {
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
    this.dayK += (day - this.dayK) * (1 - Math.exp(-dt * 3));
    if (Math.abs(day - this.dayK) < 0.002) this.dayK = day;

    // ── カメラ ──
    let tz: number;
    let tx: number;
    let ty: number;
    const fieldW = FIELD_LENGTH * g.K;
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
      const fast = h.running > 400 || h.move === 'tosshin' || h.ouran > 0;
      // 少し引いて広く映す（2026-10-04 アマネさん「ステージ狭い？」。寄りすぎて主人公と狼2匹で画面がいっぱいだった）
      tz = 0.85 * (fast ? 0.9 : 1) * (1 + sim.punch * 0.2) * (sim.finale > 0 ? 1.12 : 1); // 締めの一撃で寄る・最後の1匹のスローでさらに寄る
      tx = this.wx(h.x) + h.facing * g.W * 0.14;
      // 左の端は家の右半分（戸口と二階）が映るところまで
      const houseL = this.house.visible ? this.house.x - this.house.width * 0.28 : -this.heroH(1) * 1.2;
      // 家の前では、主人公を右へ寄せて家を広く映す（家が画面の外で、守っている感じがしなかった）
      const nearHome = Math.max(0, Math.min(1, (240 - h.x) / 150));
      if (nearHome > 0) tx += (Math.max(houseL + g.W / 2 / tz, this.wx(h.x) - (g.W / 2 / tz) * 0.5) - tx) * nearHome;
      tx = Math.max(houseL + g.W / 2 / tz, Math.min(fieldW - g.W / 2 / tz + 140, tx));
      ty = g.Hm / 2 - Math.min(h.z * this.zk() * 0.15, g.Hm * 0.08);
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
    this.backdrop.update(this.vt, g.W, horizonS, this.dayK, 0);
    this.backdrop.moon.position.set(g.W * 0.8 - this.cam.x * 0.02, g.Hm * (0.17 - 0.05 * this.dayK));

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
    if (h.down <= 0) shadow(h.x, h.lane, this.heroH(h.lane) * 0.5, h.z);
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
    this.wolves.begin();
    this.dogArt.begin();
    type Item = { lane: number; draw: (gg: Graphics) => void };
    const items: Item[] = [];
    for (const d of dogs) items.push({ lane: d.lane, draw: (gg) => this.drawDog(gg, d, sim) });
    this.wolfBoxes.length = 0;
    for (const w of seen) items.push({ lane: w.lane, draw: (gg) => this.drawWolf(gg, w, sim) });
    items.sort((a, b) => a.lane - b.lane);
    for (const it of items) it.draw(it.lane <= h.lane ? bg : fg);
    this.wolves.end();
    this.dogArt.end();

    // ── 主人公 ──
    const hx = this.wx(h.x);
    const hy = this.wy(h.lane);
    const pose = this.rig.pose(sim, hx, hy, this.heroH(h.lane), this.vt, this.zk() * 0.75, this.gunAim(sim, hx, hy));
    if (pose) {
      this.rig.apply(pose);
      this.afterimages(sim, pose, dt);
      this.trackBlade(sim);
    } else this.boxHero(fg, sim, hx, hy);
    const top = hy - this.heroH(h.lane) * 1.3 - h.z * this.zk() * 0.75;
    this.trackMarks(sim, dt);
    const toScreen = (x: number, y: number) => ({ x: x * z + ox, y: y * z + oy });
    this.heroAt = toScreen(hx, top - 6);

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

    this.parts.update(pdt);
    this.parts.draw();
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
        const flipStep = sim.combo % 2 === 0;
        let [a0, a1, r, w] = flipStep ? [-115 * D, 35 * D, hh * 0.36, hh * 0.05] : [45 * D, -105 * D, hh * 0.34, hh * 0.045];
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
        if (f.move === 'launch' || f.move === 'slam' || f.big) P.arc(cx, cy, r, mir(a0), mir(a1), w, f.big ? 0xff5080 : 0xffa0b8, f.move === 'slam' ? 0.2 : 0.15);
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
        break;
      }
      case 'muzzle': {
        const dir = f.dir ?? 1;
        const hh = this.heroH(f.lane);
        const my = y - hh * 0.62;
        P.glow(x + dir * hh * 0.25, my, hh * (f.big ? 1.6 : 1.1), 0xffe0a0, 0.18, 1, 0.3);
        for (let i = 0; i < 10; i++) P.line(x, my + (Math.random() - 0.5) * hh * 0.2, dir * hh * (0.6 + Math.random() * 0.8), 0, 0xfff0c0, 0.9, 0.12, 3);
        P.dust(x - dir * hh * 0.3, y, s * 1.6, 6, 60, 30); // 反動の土煙
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
        P.smoke(x, y - zy - this.geo.Hm * 0.06, s, 7);
        for (let i = 0; i < 8; i++) P.ember(x + (Math.random() - 0.5) * 40 * s, y - zy - this.geo.Hm * 0.06, s);
        for (let i = 0; i < 6; i++) P.petal(x, y - zy - this.geo.Hm * 0.05, s, (Math.random() - 0.5) * 500 + (f.dir ?? 0) * 200, -150 - Math.random() * 300);
        break;
      case 'miss':
        P.dust(x, y, s * 0.7, 2, 20, 20);
        break;
      case 'bite':
        this.houseFlash = 0.25;
        P.debris(this.wx(HOUSE_X), y - 30, s, 4, y + 6);
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
        for (let i = 0; i < 4; i++) P.petal(hd.x, hd.y, s, (Math.random() - 0.3) * 260 * (f.dir ?? 1), -120 - Math.random() * 200, 0.6);
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
      // 夜風の花びら（画面の右上から）。奥は小さくゆっくり、手前は大きく速く。ときどき風がひと吹きする
      this.gustT -= 0.05;
      if (this.gustT < -1.6) this.gustT = 6 + Math.random() * 7;
      const gust = this.gustT < 0;
      const SP = this.screenParts;
      const few = sim.phase === 'shop' ? 0.25 : sim.mood === 'sakura' ? 2.5 : 1; // 昼は花びらを4分の1に（多すぎた。2026-10-04 アマネさん）。桜吹雪の夜は多く
      if (Math.random() < 0.7 * few) SP.petal(g.W * (0.2 + Math.random() * 0.9), -10, 0.6, -30 - Math.random() * 40, 20 + Math.random() * 25, 7 + Math.random() * 4);
      if (Math.random() < 0.3 * few) SP.petal(g.W * (0.4 + Math.random() * 0.7), -10, 1.5, -90 - Math.random() * 80, 60 + Math.random() * 50, 3 + Math.random() * 2);
      if (gust && Math.random() < few) for (let i = 0; i < 4; i++) SP.petal(g.W + 10, Math.random() * g.Hm * 0.8, 0.6 + Math.random(), -380 - Math.random() * 300, (Math.random() - 0.3) * 120, 2.5);
      // 蛍のような光の粒（夜・画面に映っている地面の上）・裂け目の火の粉
      if (sim.phase === 'wave' && Math.random() < 0.35) {
        const x = this.cam.x - g.W / 2 / this.cam.z + Math.random() * (g.W / this.cam.z); // 画面に映っている所
        P.firefly(x, this.wy(Math.random()) - Math.random() * g.Hm * 0.25, g.Hm / 600);
      }
      if (Math.random() < 0.6) P.ember(this.wx(WOLF_SPAWN_X) + (Math.random() - 0.5) * 30, this.wy(Math.random()) - Math.random() * g.Hm * 0.2, g.Hm / 600);
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
    if (w.z > 0) {
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
    let hh = this.heroH(w.lane) * 0.6 * WOLF_REL[w.kind]; // 狼は主人公の0.6倍（0.46倍だと小さな犬に見えた）
    let rot = o.rot;
    if (o.biteK) rot -= o.biteK * 0.18; // 噛みつき：頭を上げて飛び出す
    if (w.z <= 0 && w.stun > 0.05 && !o.hit) rot += 0.08; // 落ちたあと、へたりこむ
    // 裂け目から出てくる：ふわっと現れる（大きさは少しだけ）
    const born = w.age < 0.45 ? w.age / 0.45 : 1;
    const tint = o.flash ? 0xff9a9a : 0xffffff;
    // 遠吠えで速くなった狼は、足もとの黄色い輪で示す（色を塗ると病気のように濁って見えた）
    if (w.hasted) this.wolfHud.ellipse(o.x, o.ground, hh * 0.45, hh * 0.08).stroke({ width: 3, color: 0xffe060, alpha: 0.55 + 0.3 * Math.sin(this.vt * 12) });
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
    } else if ((o.hit > 0 || (w.stun > 0.05 && w.z <= 0)) && has(`${w.kind}_hit`)) { art = `${w.kind}_hit` as WolfArt; rot *= 0.3; }
    else if ((o.biteK > 0.15 || w.pouncing) && has(`${w.kind}_bite`)) { art = `${w.kind}_bite` as WolfArt; rot *= 0.3; }
    // 姿勢の絵は、立ち姿との背の高さの違いのまま描く（低い噛みつきまで同じ背に伸ばすと大きく見えた）
    const mk = this.wolves.meta[art];
    const base = this.wolves.meta[w.kind];
    if (mk && base && art !== w.kind) hh *= Math.min(1, (mk as { h?: number }).h! / (base as { h?: number }).h!);
    this.wolves.put(layer, art, o.x, cy, hh, rot, 0.85 + 0.15 * born, tint, born);
    const top = o.ground - o.lift - hh;
    this.wolfBoxes.push({ id: w.id, lane: w.lane, x0: o.x - hh * 0.7, x1: o.x + hh * 0.7, y0: top, y1: o.ground - o.lift + hh * 0.05 });
    if (w.hp < w.maxHp && w.age > 0.4) {
      const hb = Math.max(o.bw * 0.8, hh * 0.5);
      const hy = o.ground - o.lift - hh * 1.05;
      this.wolfHud.rect(o.x - hb / 2, hy, hb, 4).fill({ color: 0x000000, alpha: 0.6 });
      this.wolfHud.rect(o.x - hb / 2, hy, (hb * Math.max(0, w.hp)) / w.maxHp, 4).fill(0x70d070);
    }
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
    const bob = Math.abs(Math.sin(t * 5)) * bh * 0.04;
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
  // 奥と手前の縁に小石を並べる。右の端（それより先へは行けない）には、しめ縄と紙垂を張る。走って行く先には輪
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
    // しめ縄（右の端）：2本の杭のあいだに縄を渡し、紙垂を下げる
    const h = this.geo.Hm * 0.16;
    for (const y of [top, bot]) {
      g.rect(x1 - 4, y - h, 8, h).fill(0x4a3428);
      g.rect(x1 - 4, y - h, 8, 4).fill(0x6a4c3a);
    }
    const sag = (q: number) => Math.sin(q * Math.PI) * 14;
    g.moveTo(x1, top - h + 6);
    for (let q = 0.1; q <= 1.0001; q += 0.1) g.lineTo(x1, top - h + 6 + (bot - top) * q + sag(q));
    g.stroke({ width: 6, color: 0xd8c08a });
    for (let q = 0.2; q < 0.9; q += 0.2) {
      const y = top - h + 6 + (bot - top) * q + sag(q);
      const sway = Math.sin(this.vt * 3 + q * 9) * 3;
      g.poly([x1, y, x1 + 9 + sway, y + 6, x1 + 2 + sway, y + 12, x1 + 11 + sway, y + 19, x1 + 4 + sway, y + 26]).stroke({ width: 3, color: 0xffffff, alpha: 0.9 });
    }
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

  // 異界の裂け目（戦場の右の端）。狼はここから出てくる
  private drawRift(g: Graphics, sim: Sim) {
    const gx = this.geo;
    const x = this.wx(WOLF_SPAWN_X) + 20;
    const top = gx.horizon - gx.Hm * 0.2;
    const bot = this.wy(1) + 6;
    const t = this.vt;
    const pts: number[] = [];
    const n = 12;
    for (let i = 0; i <= n; i++) {
      const k = i / n;
      pts.push(x + Math.sin(k * 9 + t * 2) * 6 + Math.sin(k * 23) * 5, top + (bot - top) * k);
    }
    const width = (sim.phase === 'wave' ? 1 : 0.4) * (22 + Math.sin(t * 4) * 4);
    const half = (i: number) => width * Math.sin((Math.PI * i) / n) ** 0.6;
    const poly: number[] = [];
    for (let i = 0; i <= n; i++) poly.push(pts[i * 2] - half(i), pts[i * 2 + 1]);
    for (let i = n; i >= 0; i--) poly.push(pts[i * 2] + half(i), pts[i * 2 + 1]);
    g.poly(poly).fill({ color: 0xff3040, alpha: 0.25 });
    g.poly(poly.map((v, i) => (i % 2 === 0 ? x + (v - x) * 0.5 : v))).fill({ color: 0x200008, alpha: 0.95 });
    g.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
    g.stroke({ width: 2, color: 0xff6070, alpha: 0.8 });
  }

  // 背中の主砲を向ける角度（heroRig の aim）。撃ち込みは群れへ、主砲は前のいちばん近い狼へ。いなければ真っすぐ前
  private gunAim(sim: Sim, hx: number, hy: number) {
    const h = sim.hero;
    let tx = hx + h.facing * this.heroH(h.lane) * 2;
    let ty = hy - this.heroH(h.lane) * 0.7;
    if (h.move === 'hougeki') {
      tx = this.wx(h.dashTo);
      ty = this.wy(h.lane);
    } else {
      const t = sim.wolves.filter((w) => (w.x - h.x) * h.facing > 0 && Math.abs(w.lane - h.lane) <= 0.6).sort((a, b) => Math.abs(a.x - h.x) - Math.abs(b.x - h.x))[0];
      if (t) {
        tx = this.wx(t.x);
        ty = this.wy(t.lane) - this.geo.Hm * 0.05 - t.z * this.zk();
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
    const cx = this.wx(h.x);
    const gy = this.wy(h.lane);
    const grow = Math.min(1, (3 - h.ouran) / 0.4); // 立ち上がり
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

  private drawOver(sim: Sim, dt: number) {
    const o = this.overG.clear();
    const K = this.geo.K;
    this.drawTornado(o, sim);
    this.drawBlade(o);
    this.drawMarks(o, sim);
    // 矢（放物線。高さは飛ぶ距離に比例させ、向きは軌道の接線に合わせる）
    for (const a of sim.arrows) {
      if (a.t < 0) continue;
      const hh = this.heroH(a.fromLane);
      // 弓の絵の矢の高さ（足もとから背の73%・前へ30%）から放つ（55%だと腰のあたりから出て見えた。2026-10-04 アマネさん）
      const x0 = this.wx(a.fromX) + Math.sign(a.toX - a.fromX) * hh * 0.3;
      const y0 = this.wy(a.fromLane) - hh * 0.73;
      const tw = !a.rain ? sim.wolves.find((w) => w.id === a.target) : undefined;
      const hd = tw ? this.wolfHead(tw.x, tw.lane, tw.z, WOLF_REL[tw.kind]) : null;
      const x1 = hd ? hd.x : this.wx(a.toX);
      const y1 = hd ? hd.y : this.wy(a.lane) - this.geo.Hm * 0.05;
      // 放った瞬間：弓のまわりに輪と花びら
      if (!this.seenArrows.has(a)) {
        this.seenArrows.add(a);
        this.parts.ring(x0, y0, 4, hh * 0.22, 3, 0xffd0e0, 0.18);
        for (let i = 0; i < 3; i++) this.parts.petal(x0, y0, this.geo.Hm / 600, Math.sign(x1 - x0) * (80 + Math.random() * 120), -60 - Math.random() * 120, 0.5);
      }
      // ふつうの矢はほぼまっすぐ。矢の雨だけ高い放物線
      const arc = Math.abs(x1 - x0) * (a.rain ? 0.3 : 0.04);
      const x = x0 + (x1 - x0) * a.t;
      const y = y0 + (y1 - y0) * a.t - Math.sin(Math.PI * a.t) * arc;
      const vx = x1 - x0;
      const vy = y1 - y0 - Math.cos(Math.PI * a.t) * Math.PI * arc;
      const len = Math.hypot(vx, vy) || 1;
      const ux = vx / len;
      const uy = vy / len;
      const L = hh * 0.3; // 矢の長さ
      // 光の尾（桜色）：飛んだ道に沿って長く
      const tail = Math.min(a.t, 0.35) * Math.hypot(x1 - x0, y1 - y0);
      o.moveTo(x - ux * (L + tail), y - uy * (L + tail)).lineTo(x - ux * L * 0.3, y - uy * L * 0.3).stroke({ width: 7, color: 0xff7aa8, alpha: 0.18, cap: 'round' });
      o.moveTo(x - ux * (L + tail * 0.5), y - uy * (L + tail * 0.5)).lineTo(x - ux * L * 0.3, y - uy * L * 0.3).stroke({ width: 3, color: 0xffd8e8, alpha: 0.5, cap: 'round' });
      // 矢柄・矢じり・矢羽
      o.moveTo(x - ux * L, y - uy * L).lineTo(x, y).stroke({ width: 4.5, color: 0x3a2018, cap: 'round' });
      o.moveTo(x - ux * L, y - uy * L).lineTo(x, y).stroke({ width: 2.2, color: 0xc89060, cap: 'round' });
      const hx = x + ux * 12;
      const hy = y + uy * 12;
      o.poly([hx, hy, x - uy * 6, y + ux * 6, x + uy * 6, y - ux * 6]).fill(0xe8eef8).stroke({ width: 1.5, color: 0x2a1a20 });
      for (const sg of [1, -1]) {
        const fx = x - ux * L;
        const fy = y - uy * L;
        o.poly([fx, fy, fx + ux * 16 - uy * 7 * sg, fy + uy * 16 + ux * 7 * sg, fx + ux * 20, fy + uy * 20]).fill(0xffe8f0).stroke({ width: 1.2, color: 0x2a1a20 });
      }
      // 放った瞬間の光・飛んでいるあいだのきらめき
      if (a.t < 0.12) this.parts.glow(x0, y0, hh * 0.5 * (1 - a.t / 0.12), 0xffc0d8, 0.08, 0.8, 0.5);
      if (Math.random() < 0.7) this.parts.glow(x - ux * L * 0.6, y - uy * L * 0.6, hh * 0.09, 0xffe0ee, 0.25, 0.9, -0.6);
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
    // 砲弾（放物線と火の尾）
    for (const sh of sim.shells) {
      if (sh.t < 0) continue;
      const x = this.wx(sh.fromX + (sh.toX - sh.fromX) * sh.t);
      const arc = Math.sin(Math.PI * sh.t) * this.geo.Hm * 0.45;
      const y = this.wy(sh.lane) - 60 - arc + 60 * sh.t;
      o.circle(x, y, 7).fill(COLOR.shell);
      o.circle(x, y, 14).fill({ color: 0xffa040, alpha: 0.35 });
      if (Math.random() < 0.6) this.parts.dust(x, y, 0.6, 1, 10, 0);
    }
    // 狼の衝撃波
    for (const sh of sim.shots) {
      const x = this.wx(sh.x);
      const y = this.wy(sh.lane) - this.geo.Hm * 0.06;
      const r = this.geo.Hm * 0.05;
      for (let i = 0; i < 3; i++) crescent(o, x + 10 + i * 9, y, r * (1 - i * 0.2), Math.PI * 0.65, Math.PI * 1.35, 6 - i * 1.5, COLOR.shock, 0.8 - i * 0.25);
    }
    // 数字：跳ねて上へ消える。出た瞬間に大きく、すぐ締まる。大きい一撃は大きく黄色く
    const live = new Map<number, Fx>();
    for (const f of sim.fx) if (f.kind === 'num' || (f.kind === 'poof' && f.n)) live.set(f.id, f);
    for (let i = 0; i < this.nums.length; i++) {
      if (this.numOwner[i] >= 0 && !live.has(this.numOwner[i])) this.numOwner[i] = -1;
    }
    for (const f of live.values()) {
      let i = this.numOwner.indexOf(f.id);
      if (i < 0) {
        i = this.numOwner.indexOf(-1);
        if (i < 0) continue; // 枠が足りなければ出さない
        this.numOwner[i] = f.id;
        const t = this.nums[i];
        t.text = f.kind === 'poof' ? `+${f.n}銭` : String(f.n);
        t.style.fontSize = f.kind === 'poof' ? 15 : f.big ? 34 : 22;
        t.style.fill = f.kind === 'poof' ? 0xffd860 : f.big ? 0xffd040 : 0xffffff;
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
      t.position.set(x + ((f.id * 37) % 41) - 20, y - ((f.id * 53) % 17) - easeOut(Math.min(1, q * 3)) * 34);
    }
    for (let i = 0; i < this.nums.length; i++) if (this.numOwner[i] < 0) this.nums[i].visible = false;
    void K;
    void dt;
  }

  private drawScreen(sim: Sim, dt: number, z: number, ox: number) {
    const s = this.screen.clear();
    const g = this.geo;
    const h = sim.hero;
    // 桜嵐：背景を暗く。夜の様子：紅月は赤く、霧は白くかすむ
    const sh = this.shade.clear();
    if (sim.phase === 'wave' && sim.mood === 'beni') sh.rect(0, 0, g.W, g.Hm).fill({ color: 0xa01020, alpha: 0.16 });
    if (sim.phase === 'wave' && sim.mood === 'kiri') sh.rect(0, g.horizon * 0.5, g.W, g.Hm).fill({ color: 0xb8b0d0, alpha: 0.12 });
    if (h.ouran > 0) sh.rect(0, 0, g.W, g.Hm).fill({ color: 0x100008, alpha: 0.45 });
    // 周辺の暗がり（ずっと薄く。体力が少ないと赤く脈打つ）
    const low = sim.phase === 'wave' && h.down <= 0 && h.hp < sim.maxHp * 0.3;
    const vc = low ? 0x800010 : h.ouran > 0 ? 0x601020 : 0x000000;
    const va = low ? 0.35 + 0.2 * Math.sin(this.vt * 6) : 0.3;
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
type WolfArt = WolfKind | 'wolf_walk2' | 'wolf_bite' | 'wolf_hit' | 'wolf_air' | 'pup_bite' | 'armored_bite' | 'howler_bite' | 'alpha_bite' | 'howler_hit' | 'alpha_hit';
const ROLE_COLOR = { guard: 0x70b8ff, attack: 0xff6070, support: 0x80e090 };

// 少し行きすぎて戻る（出てくる・置く）
function backOut(t: number) {
  const c = 1.9;
  t = Math.min(1, t) - 1;
  return 1 + (c + 1) * t * t * t + c * t * t;
}

void glowTexture;
