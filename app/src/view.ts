// 戦場の描画。主人公のアップをカメラで追い、下に戦場全体の小さい地図（minimap.ts）を出す（2026-10-04）。
// 狼・番犬はまだ灰色の箱（絵は生成で作る・plan.md §6）。動き・演出は箱のままでも作り込む：
// 走り・跳ね・のけぞり・打ち上げの回転・残像・斬撃の弧・火花・桜・土煙・画面の揺れと寄り・ヒットストップ。
import { Application, Container, Graphics, Sprite, Text } from 'pixi.js';
import { Backdrop, mix } from './backdrop';
import { DOG_POST_MAX, DOGS, FIELD_LENGTH, HERO, HOUSE_HP, HOUSE_X, LANE_TOL, MOVES, WOLF_SPAWN_X, WOLVES, type DogKind } from './config';
import { crescent, easeOut, glowTexture, Particles, place } from './fx';
import { HeroRig, type Pose } from './heroRig';
import { Minimap } from './minimap';
import { DOG_REL, UnitArt, WOLF_REL } from './wolfArt';
import { DOG_COLOR, WOLF_COLOR } from './palette';
import type { Dog, Fx, Sim, Wolf } from './sim';
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
  private ground = new Graphics(); // 影・地面の輪・家
  private backG = new Graphics(); // 主人公より奥の箱
  private frontG = new Graphics(); // 主人公より手前の箱
  private wolfBack = new Container(); // 狼の絵（主人公より奥）
  private wolfFront = new Container(); // 狼の絵（主人公より手前）
  private wolfHud = new Graphics(); // 狼の体力の棒（絵の上）
  private wolves = new UnitArt<WolfKind>('wolves', ['pup', 'wolf', 'armored', 'howler', 'alpha'], this.wolfBack, this.wolfFront);
  private dogBack = new Container();
  private dogFront = new Container();
  private dogArt = new UnitArt<DogKind>('dogs', ['shiba', 'akita', 'tosa'], this.dogBack, this.dogFront); // 入れ物は狼と分ける（同じだと狼の後片付けで犬が消えた）
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
  heroAt = { x: 0, y: 0 }; // 吹き出しを置く位置（画面の座標）
  trail: { x: number; y: number; t: number }[] = []; // 指の軌跡（input が足す）
  dragGhost: { kind: DogKind; x: number; lane: number } | null = null; // 昼：置こうとしている番犬
  picked = -1; // 昼：外すために選んだ番犬（もう一度タップで外す）
  private pickText!: Text;

  async init(host: HTMLElement) {
    await this.app.init({ preference: 'webgl', resizeTo: host, background: 0x2a1e1e, antialias: true, resolution: Math.min(devicePixelRatio, 2), autoDensity: true });
    host.appendChild(this.app.canvas);
    // resizeTo は窓の大きさしか見ない。下の板（昼と夜で高さが変わる）に合わせて、戦場の大きさを測り直す
    new ResizeObserver(() => this.app.resize()).observe(host);
    const st = this.app.stage;
    st.addChild(this.backdrop.sky, this.backdrop.stars, this.backdrop.moon, this.paraRoot, this.shade, this.world);
    this.world.addChild(this.ground, this.house, this.houseOver, this.backG, this.dogBack, this.wolfBack, this.ghostLayer, this.rig.root, this.frontG, this.dogFront, this.wolfFront, this.wolfHud, this.overG, this.parts.root);
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
    this.pickText = new Text({ text: 'もう一度タップで外す', style: { fontFamily: 'system-ui, sans-serif', fontWeight: '900', fontSize: 16, fill: 0xffe0a0, stroke: { color: 0x000000, width: 4 } } });
    this.pickText.anchor.set(0.5, 1);
    this.pickText.visible = false;
    this.world.addChild(this.pickText);
    st.addChild(this.screenParts.root, this.screen);
    for (let i = 0; i < 2; i++) {
      const t = new Text({ text: '', style: { fontFamily: 'system-ui, sans-serif', fontWeight: '900', fontSize: 14, fill: 0xffffff, stroke: { color: 0x000000, width: 4 } } });
      t.anchor.set(0.5);
      st.addChild(t);
      this.edgeText.push(t);
    }
    st.addChild(this.mini.root);
    // 狼の絵。読み込めなければ箱のまま
    this.wolves.load().catch((e) => console.warn('wolves', e));
    this.house.visible = false;
    this.dogArt.load(['house']).then(() => {
      const m = this.dogArt.meta['house' as DogKind];
      this.house.texture = this.dogArt.tex['house' as DogKind];
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
    this.geo = { W, H, Hm, MM, K, horizon: Hm * 0.58, laneTop: Hm * 0.66, laneH: Hm * 0.22 };
    this.backdrop.build(W, Hm, this.geo.horizon, FIELD_LENGTH * K);
    this.paraRoot.removeChildren();
    for (const l of this.backdrop.layers) this.paraRoot.addChild(l.c);
    this.world.addChildAt(this.backdrop.front.c, this.world.children.length);
    this.mini.layout(W, Hm, MM);
    this.lastWave = `${W}x${H}`;
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

  // 昼：画面の点の近くにある番犬の持ち場
  postAt(sim: Sim, sx: number, sy: number) {
    const f = this.toField(sx, sy);
    if (!f || f.mini) return -1;
    let best = -1;
    let bd = 60;
    sim.posts.forEach((p, i) => {
      const d = Math.abs(p.x - f.x) + Math.abs(p.lane - f.lane) * 200;
      if (d < bd) { bd = d; best = i; }
    });
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
      const x1 = 760 * g.K;
      tz = g.W / (x1 - x0);
      tx = (x0 + x1) / 2;
      ty = g.laneTop + g.laneH * 1.6 - (g.Hm * 0.12) / tz;
    } else {
      const fast = h.running > 400 || h.move === 'tosshin' || h.ouran > 0;
      tz = (fast ? 0.9 : 1) * (1 + sim.punch * 0.2) * (sim.finale > 0 ? 1.12 : 1); // 締めの一撃で寄る・最後の1匹のスローでさらに寄る
      tx = this.wx(h.x) + h.facing * g.W * 0.14;
      tx = Math.max(g.W / 2 / tz - 150, Math.min(fieldW - g.W / 2 / tz + 140, tx));
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
    for (const l of this.backdrop.layers) {
      l.c.scale.set(z);
      l.c.position.set(g.W / 2 - this.cam.x * l.f * z + sx * l.f, oy);
    }
    const fr = this.backdrop.front;
    fr.c.position.set(this.cam.x * (1 - fr.f), 0); // 世界の中で、さらに速く流す
    const horizonS = g.horizon * z + oy;
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
    this.drawHouse(gr, sim, dt);
    this.drawRift(gr, sim);
    const shadow = (x: number, lane: number, w: number, zz: number) => {
      const k = Math.max(0.35, 1 - zz / 300);
      gr.ellipse(this.wx(x), this.wy(lane) + 2, w * 0.55 * k, w * 0.13 * k).fill({ color: 0x000000, alpha: 0.42 * k });
    };
    for (const d of sim.dogs) shadow(d.x, d.lane, d.size * this.U(d.lane), 0);
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
    // 昼：番犬の持ち場の目印
    if (day) {
      // 番犬を置ける所（家の前〜持ち場の限り）と、置いた持ち場の目印
      const a = this.wx(HOUSE_X + 30);
      const b = this.wx(DOG_POST_MAX);
      gr.rect(a, this.wy(0) - 6, b - a, this.wy(1) - this.wy(0) + 12).fill({ color: 0xffe0a0, alpha: 0.1 }).stroke({ width: 3, color: 0xffe0a0, alpha: 0.3 });
      gr.moveTo(b, this.wy(0) - 6).lineTo(b, this.wy(1) + 6).stroke({ width: 3, color: 0xffe0a0, alpha: 0.35 });
      sim.posts.forEach((p, i) => {
        const on = i === this.picked;
        gr.ellipse(this.wx(p.x), this.wy(p.lane), 60, 16).stroke({ width: on ? 6 : 4, color: on ? 0xff7060 : 0xffe0a0, alpha: on ? 0.6 + 0.3 * Math.sin(this.vt * 10) : 0.7 });
      });
    }
    if (!day || !sim.posts[this.picked]) this.picked = -1;
    const pk = sim.posts[this.picked];
    this.pickText.visible = !!pk;
    if (pk) this.pickText.position.set(this.wx(pk.x), this.wy(pk.lane) - this.geo.Hm * 0.13);

    // ── 体（奥から手前へ。主人公より奥は backG、手前は frontG）──
    const bg = this.backG.clear();
    const fg = this.frontG.clear();
    this.wolfHud.clear();
    this.wolves.begin();
    this.dogArt.begin();
    type Item = { lane: number; draw: (gg: Graphics) => void };
    const items: Item[] = [];
    const dogs: Dog[] = day ? sim.posts.map((p, i) => ({ id: -i - 1, x: p.x, lane: p.lane, hp: 1, maxHp: 1, size: dogSize(p.kind), cooldown: 0, hitFlash: 0, kind: p.kind, post: p, bite: 0 })) : sim.dogs;
    for (const d of dogs) items.push({ lane: d.lane, draw: (gg) => this.drawDog(gg, d, sim) });
    if (this.dragGhost) {
      const p = this.dragGhost;
      items.push({ lane: p.lane, draw: (gg) => this.drawDog(gg, { id: -99, x: p.x, lane: p.lane, hp: 1, maxHp: 1, size: dogSize(p.kind), cooldown: 0, hitFlash: 0, kind: p.kind, post: p, bite: 0 }, sim, 0.6) });
    }
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
        // 倒した狼：煙と一緒に桜の花びらが散る（煙だけで消えると味気なかった）
        P.pop(x, y - zy - this.geo.Hm * 0.05, s, f.r ?? 30);
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
      // 夜風の花びら（画面の右上から）
      if (Math.random() < 0.35) this.screenParts.petal(g.W * (0.3 + Math.random() * 0.8), -10, 1, -40 - Math.random() * 60, 30 + Math.random() * 40, 5 + Math.random() * 3);
      // 桜嵐：花吹雪
      if (h.ouran > 0) for (let i = 0; i < 6; i++) this.screenParts.petal(g.W + 10, Math.random() * g.Hm, 1.6, -600 - Math.random() * 500, (Math.random() - 0.5) * 200, 1.4);
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
    const fast = h.move === 'tosshin' || (h.order?.sprint && h.running > 0) || h.ouran > 0 || h.move === 'launch' || (h.move === 'slam' && h.z > 0) || h.lungeTo !== null;
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
    const hh = this.heroH(w.lane) * 0.46 * WOLF_REL[w.kind];
    let rot = o.rot;
    if (o.biteK) rot -= o.biteK * 0.18; // 噛みつき：頭を上げて飛び出す
    if (w.z <= 0 && w.stun > 0.05 && !o.hit) rot += 0.08; // 落ちたあと、へたりこむ
    // 裂け目から出てくる：ふわっと現れる（大きさは少しだけ）
    const born = w.age < 0.45 ? w.age / 0.45 : 1;
    const tint = o.flash ? 0xff9a9a : w.hasted ? 0xfff0a0 : 0xffffff;
    const layer: 0 | 1 = g === this.backG ? 0 : 1;
    const cy = o.ground - o.lift - o.bob * 0.6 - this.wolves.center(hh);
    this.wolves.put(layer, w.kind, o.x, cy, hh, rot, 0.85 + 0.15 * born, tint, born);
    if (w.hp < w.maxHp && w.age > 0.4) {
      const hb = Math.max(o.bw * 0.8, hh * 0.5);
      const hy = o.ground - o.lift - hh * 1.05;
      this.wolfHud.rect(o.x - hb / 2, hy, hb, 4).fill({ color: 0x000000, alpha: 0.6 });
      this.wolfHud.rect(o.x - hb / 2, hy, (hb * Math.max(0, w.hp)) / w.maxHp, 4).fill(0x70d070);
    }
    void sim;
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
      this.dogArt.put(layer, d.kind, x + bite * bw * 0.3, ground - bob * 2 - this.dogArt.center(hh), hh, bite * 0.12 - hit * 0.1, 1, d.hitFlash > 0 ? 0xff9a9a : 0xffffff, alpha);
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
    const base = this.wy(1) + 8;
    const top = gx.horizon - gx.Hm * 0.32;
    const left = right - gx.Hm * 0.55;
    const f = Math.max(0, this.houseFlash);
    if (this.house.visible) {
      // 家の絵（2026-10-04 生成）。齧られると赤く、傷むほどひびが入る（ひびは絵の上に描く）
      const hh = this.geo.Hm * 0.5;
      const hm = this.dogArt.meta['house' as DogKind];
      const hk = hh / hm.feet[1];
      this.house.scale.set(hk);
      this.house.position.set(right - (hm.size[0] - hm.feet[0]) * hk, base); // 家の右の端を、家の位置にそろえる
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

  private drawOver(sim: Sim, dt: number) {
    const o = this.overG.clear();
    const K = this.geo.K;
    this.drawBlade(o);
    this.drawMarks(o, sim);
    // 矢（放物線。高さは飛ぶ距離に比例させ、向きは軌道の接線に合わせる）
    for (const a of sim.arrows) {
      if (a.t < 0) continue;
      const hh = this.heroH(a.fromLane);
      const x0 = this.wx(a.fromX);
      const y0 = this.wy(a.fromLane) - hh * 0.6;
      const x1 = this.wx(a.toX);
      const y1 = this.wy(a.lane) - this.geo.Hm * 0.05;
      const arc = Math.abs(x1 - x0) * 0.3;
      const x = x0 + (x1 - x0) * a.t;
      const y = y0 + (y1 - y0) * a.t - Math.sin(Math.PI * a.t) * arc;
      const vx = x1 - x0;
      const vy = y1 - y0 - Math.cos(Math.PI * a.t) * Math.PI * arc;
      const len = Math.hypot(vx, vy) || 1;
      const L = hh * 0.14;
      o.moveTo(x - (vx / len) * L * 2.2, y - (vy / len) * L * 2.2).lineTo(x, y).stroke({ width: 2, color: 0xffffff, alpha: 0.25 }); // 尾
      o.moveTo(x - (vx / len) * L, y - (vy / len) * L).lineTo(x, y).stroke({ width: 3, color: COLOR.arrow });
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
    // 桜嵐：背景を暗く
    const sh = this.shade.clear();
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
    void sim;
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

function dogSize(k: DogKind) {
  return DOGS[k].size;
}

// 少し行きすぎて戻る（出てくる・置く）
function backOut(t: number) {
  const c = 1.9;
  t = Math.min(1, t) - 1;
  return 1 + (c + 1) * t * t * t + c * t * t;
}

void glowTexture;
