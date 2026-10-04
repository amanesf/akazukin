// 戦いの中身。描画を知らない。固定ステップで進め、同じ入力なら同じ結果になる。
// 指一本アクション（2026-10-04）：プレイヤーの指で技を出す。触っていないときは軽く自動で斬り、弓で補助する。
// 奥行き（lane）がある：主人公も狼も奥行きを動き、離れた奥行きの相手は噛めない・斬れない。
import {
  AUTO, BODY, BOW_FLIGHT, CHARGE, COMBO_BASE, COMBO_RESET, COIN_START, DASH, DOG_BLOCK, DOG_MAX, DOG_POST_MAX, DOGS,
  FIRST_WAVE_DELAY, GIRL_X, HERO, HOUSE_HP, HOUSE_X, HOWL, LANE_TOL, MOVE_CD, MOVES, OURAN, POUNCE, SHOCKWAVE, STEER, STEP,
  DAWN_REPAIR, DAYS_TO_CLEAR, TRACK_COSTS, TRACKS, WOLF_SPAWN_X, WOLVES, dawnBonus,
  type DogKind, type MoveId, type Perk, type SkillId, type Track, type WolfKind,
} from './config';
import { hpScale, night, SURGE_WARN } from './nights';

const FINALE = 0.45; // 晩の最後の1匹のあとのスローの長さ（sim の秒。実時間ではこの約3倍）

export interface Unit {
  id: number;
  x: number;
  lane: number; // 奥行き（0＝奥〜1＝手前）
  hp: number;
  maxHp: number;
  size: number;
  cooldown: number;
  hitFlash: number;
}
export interface Wolf extends Unit {
  kind: WolfKind;
  hasted: boolean;
  z: number; // 高さ（打ち上げ）
  vz: number;
  vx: number; // 弾かれた勢い
  stun: number; // のけぞり
  slammed: boolean; // 叩き落とされて落ちている
  pouncing: boolean; // 子狼の跳び越え
  skillCd: number; // 衝撃波・飛びかかり
  age: number; // 裂け目から出てきてからの秒（出てくる演出）
  hitDir: number; // 最後に当たった向き（描画で傾ける）
}
export interface Post { kind: DogKind; x: number; lane: number } // 番犬の持ち場（昼に置く）
export interface Dog extends Unit { kind: DogKind; post: Post; bite: number }
export interface Arrow { fromX: number; fromLane: number; toX: number; lane: number; t: number; flight: number; damage: number }
export interface Shell { fromX: number; toX: number; t: number; lane: number; damage: number; area: number }
export interface Shot { x: number; lane: number } // 狼の衝撃波（左へ飛ぶ）
export type FxKind = 'blast' | 'poof' | 'slash' | 'miss' | 'num' | 'spin' | 'land' | 'spark' | 'dash' | 'pound' | 'muzzle' | 'full' | 'bite' | 'emerge';
export interface Fx {
  id: number;
  kind: FxKind;
  x: number; lane: number; t: number; r?: number; n?: number; z?: number; big?: boolean;
  dir?: number; // 向き（1 右・-1 左）
  x2?: number; // 突進の終わり
  move?: MoveId;
}

export type Result = 'playing' | 'won' | 'lost';
// lead：最初の晩の前／wave：夜（戦闘中）／shop：昼（鍛える・番犬を置く。「夜を迎える」で進む）
export type Phase = 'lead' | 'wave' | 'shop';
// 画面の演出と主人公の吹き出しのための出来事（main が受け取って消す）
export type Sound = 'swing' | 'hit' | 'heavy' | 'slam' | 'boom' | 'bow' | 'hurt' | 'ouran' | 'horn' | 'buy' | 'dash' | 'charge' | 'full' | 'jump';
export type Event = 'night' | 'finisher' | 'ouran' | 'hurt' | 'down' | 'revive' | 'dawn' | 'surge' | 'combo10' | 'combo30';

export interface Save {
  v: 2; wave: number; coins: number; houseHp: number; levels: Record<Track, number>; kills: number; bestCombo: number;
  posts: Post[]; losses: number;
}

interface Spawner { kind: WolfKind; left: number; interval: number; next: number; surge: boolean; warned: boolean }
type Flick = 'left' | 'right' | 'up' | 'down';
type Act = () => boolean;

export interface Hero {
  x: number;
  lane: number;
  z: number; // 跳んだ高さ（斬り上げで一緒に跳ぶ）
  vz: number;
  hp: number;
  move: MoveId | null; // 出している技
  moveT: number;
  moveTarget: number; // 技の相手（wolf id）。0 は無し
  dashTo: number; // 突進の行き先・撃ち込む先
  lungeTo: number | null; // 踏み込みの行き先
  lungeLane: number;
  dashHit: number[]; // 突進で斬った狼
  auto: boolean; // 自動で出した技（連撃の手数を進めない）
  step: number; // 連撃の何手目か
  down: number; // 倒れている残り秒数
  stun: number;
  iframes: number; // 無敵の残り（突進）
  jumps: number; // 着地までに跳んだ回数（2段ジャンプまで）
  armor: number; // ひるまない残り（噛まれてひるんだ直後。囲まれてひるみ続けて動けなくなるのを防ぐ）
  hitFlash: number;
  ouran: number; // 桜嵐の残り秒数
  ouranTick: number;
  facing: 1 | -1;
  order: { x: number; lane: number; target: number; sprint: boolean } | null; // 走って行く先（target は着いたら斬る狼）
  running: number; // 走っている速さ（描画の脚と土煙）
  charge: number; // 主砲の溜め（秒）。溜めていなければ -1
  autoT: number;
  bowT: number;
}

export class Sim {
  clock = 0;
  coins = COIN_START;
  houseHp = HOUSE_HP;
  wave = 0; // 0 始まり（何晩を越えたか）。DAYS_TO_CLEAR に達したら狼絶滅
  lead = FIRST_WAVE_DELAY;
  phase: Phase = 'lead';
  result: Result = 'playing';
  kills = 0;
  losses = 0; // 家が落ちた回数（負けても1日目には戻らない・2026-10-04）
  nightKills = 0;
  stats = { downs: 0, houseBite: 0, houseShock: 0, heroDmg: 0 }; // 計測用（scripts/balance.mjs）
  nightEarned = 0;

  hero: Hero = {
    x: GIRL_X + 60, lane: 0.5, z: 0, vz: 0, hp: HERO.hp, move: null, moveT: 0, moveTarget: 0, dashTo: 0, lungeTo: null, lungeLane: 0.5,
    dashHit: [], jumps: 0, auto: false, step: 0, down: 0, stun: 0, iframes: 0, armor: 0, hitFlash: 0, ouran: 0, ouranTick: 0, facing: 1,
    order: null, running: 0, charge: -1, autoT: 0, bowT: 0,
  };
  gauge = 0; // 桜嵐のゲージ（0〜100）
  combo = 0;
  bestCombo = 0;
  sinceHit = 99;
  hitStop = 0;
  shake = 0;
  shakeDir = 0; // 揺れの向き（当てた向きへ押す）
  punch = 0; // 画面を一瞬寄せる（締めの一撃）
  events: Event[] = [];
  sounds: Sound[] = []; // 効果音（main が受け取って鳴らす）

  wolves: Wolf[] = [];
  dogs: Dog[] = [];
  posts: Post[] = []; // 昼に置いた番犬の持ち場。毎晩これで出す（銭は毎晩払う）
  arrows: Arrow[] = [];
  shells: Shell[] = [];
  shots: Shot[] = [];
  fx: Fx[] = [];

  cds: Record<'kaiten' | 'tosshin' | 'ame' | 'hougeki', number> = { kaiten: 0, tosshin: 0, ame: 0, hougeki: 0 };
  levels: Record<Track, number> = { body: 0, near: 0, far: 0 };

  private spawners: Spawner[] = [];
  private queued: { act: Act; t: number } | null = null;
  private nextId = 1;
  private fxId = 1;
  private seed: number;

  constructor(seed = 1) {
    this.seed = seed;
  }

  // 保存は夜明け（昼の始まり）だけ。家が落ちたら、この保存（その晩の前の昼）に戻る（2026-10-04）
  save(): Save {
    return {
      v: 2, wave: this.wave, coins: Math.floor(this.coins), houseHp: this.houseHp, levels: { ...this.levels }, kills: this.kills,
      bestCombo: this.bestCombo, posts: this.posts.map((p) => ({ ...p })), losses: this.losses,
    };
  }

  static load(d: Save | (Omit<Save, 'v' | 'posts' | 'losses'> & { v: 1 }), seed: number) {
    const s = new Sim(seed);
    s.wave = d.wave;
    s.coins = d.coins;
    s.houseHp = d.houseHp;
    s.levels = { ...s.levels, ...d.levels };
    s.kills = d.kills;
    s.bestCombo = d.bestCombo;
    if (d.v === 2) {
      s.posts = d.posts.map((p) => ({ ...p }));
      s.losses = d.losses;
    }
    s.phase = 'shop';
    s.hero.hp = s.maxHp;
    return s;
  }

  // 3本の段から、いま効いているものを数える
  private perks(t: Track): Perk[] {
    return TRACKS[t].perks.slice(0, this.levels[t]);
  }
  private sum(t: Track, key: 'hp' | 'combo' | 'power' | 'rate' | 'charge') {
    return this.perks(t).reduce((n, p) => n + (p[key] ?? 0), 0);
  }
  // 狼の噛む力も晩ごとに少しずつ強くなる（体力の伸びと同じ割合）
  private get bite() {
    return hpScale(this.wave + 1);
  }
  get maxHp() {
    return HERO.hp + this.sum('body', 'hp');
  }
  get comboLen() {
    return COMBO_BASE + this.sum('near', 'combo');
  }
  private get nearPower() {
    return 1 + this.sum('near', 'power');
  }
  private get farPower() {
    return 1 + this.sum('far', 'power');
  }
  get chargeFull() {
    return CHARGE.full / (1 + this.sum('far', 'charge'));
  }
  get chargeMin() {
    return CHARGE.min / (1 + this.sum('far', 'charge'));
  }
  knows(id: SkillId) {
    return [...this.perks('near'), ...this.perks('far')].some((p) => p.learn === id);
  }

  // ── 入力（夜）──
  private get canAct() {
    const h = this.hero;
    return this.phase === 'wave' && this.result === 'playing' && h.down <= 0 && h.ouran <= 0;
  }

  // 技の途中・ひるみの途中の入力は覚えておき、空いたらすぐ出す（先行入力）。
  // 突進だけは、技が当たったあとなら割り込める（すぐ動ける気持ちよさ）。突進から突進へは割り込めない（連発で無敵になる）
  private queue(act: Act, cancel = false) {
    const h = this.hero;
    if (!this.canAct) return;
    if (h.charge >= 0) return;
    // 自動の斬り・弓はいつでも指の操作で打ち消せる
    const busy = h.stun > 0 || (h.move && !h.auto && !(cancel && h.move !== 'tosshin' && h.moveT >= MOVES[h.move].dur * 0.5));
    if (!busy) {
      if (h.move) h.move = null;
      act();
      return;
    }
    this.queued = { act, t: this.clock };
  }

  // 戦場のタップ。狼に触れたらその狼を斬りに行く／主人公の近くなら、その向きの狼を斬る／それ以外はそこへ走る
  tap(x: number, lane: number) {
    if (!this.canAct) return;
    const h = this.hero;
    let best: Wolf | undefined;
    let bd = Infinity;
    for (const w of this.wolves) {
      const dx = Math.abs(w.x - x);
      if (dx > w.size / 2 + 45) continue;
      const d = dx + Math.abs(w.lane - lane) * 140;
      if (d < bd) { bd = d; best = w; }
    }
    if (best) {
      const t = best;
      this.did.tap++;
      return this.queue(() => this.attack(t));
    }
    if (Math.abs(x - h.x) <= 120 && Math.abs(lane - h.lane) > 0.3) {
      // 主人公の近くでも、奥行きが離れた地面なら、そこへ動く（奥行きのずれた狼を追えなかった）
      this.runTo(x, lane);
      return;
    }
    if (Math.abs(x - h.x) <= 120) {
      const dir = (Math.sign(x - h.x) || h.facing) as 1 | -1;
      return this.queue(() => this.attack(undefined, dir));
    }
    this.runTo(x, lane);
  }

  // 走って行く。sprint は小さい地図のタップ（駆けつける）
  runTo(x: number, lane: number, sprint = false) {
    if (!this.canAct) return;
    const h = this.hero;
    if (h.charge >= 0) return;
    h.order = { x: clamp(x, HERO.minX, HERO.maxX), lane: clamp(lane, 0, 1), target: 0, sprint };
    if (sprint) {
      this.sounds.push('dash');
      this.did.mini++;
    }
  }

  flick(dir: Flick) {
    if (!this.canAct) return;
    if (dir === 'left' || dir === 'right') {
      this.did.dash++;
      return this.queue(() => this.dash(dir === 'right' ? 1 : -1), true);
    }
    if (dir === 'up') {
      this.did.launch++;
      return this.queue(() => this.launch());
    }
    this.did.slam++;
    this.queue(() => this.slam());
  }

  // 長押し：溜める（足を止める）。離すと主砲
  holdStart() {
    if (!this.canAct) return;
    const h = this.hero;
    if (h.move && !h.auto) return;
    h.move = null;
    h.order = null;
    h.charge = 0;
    this.sounds.push('charge');
  }

  // 溜め不足で離したら撃たずに 'short' を返す（指の操作ではタップとして扱う。ゆっくりめのタップが空振りにならないように）
  holdEnd(): 'fired' | 'short' | 'none' {
    const h = this.hero;
    if (h.charge < 0) return 'none';
    const c = h.charge;
    h.charge = -1;
    if (!this.canAct) return 'none';
    if (c < this.chargeMin) return 'short';
    h.stun = 0;
    const full = c >= this.chargeFull;
    const t = this.nearest(this.wolves.filter((w) => Math.abs(w.lane - h.lane) <= 0.6), h.x);
    if (t) h.facing = t.x >= h.x ? 1 : -1;
    this.startMove('shiki', 0);
    this.did.shiki++;
    h.dashTo = full ? 2 : 1; // 溜めの段（strike で使う）
    return 'fired';
  }

  // 斬る：相手に踏み込んで連撃の次の手。遠ければ走って行ってから
  private attack(target?: Wolf, dir?: 1 | -1): boolean {
    const h = this.hero;
    const around = this.wolves.filter((w) => w.z <= 0 && Math.abs(w.x - h.x) <= MOVES.kaiten.area! && Math.abs(w.lane - h.lane) <= 0.6).length;
    if (this.knows('kaiten') && this.cds.kaiten <= 0 && around >= 3) {
      this.startMove('kaiten', 0);
      return true;
    }
    const facing = dir ?? (target ? (target.x >= h.x ? 1 : -1) : h.facing);
    const t = target ?? this.nearest(this.wolves.filter((w) => (w.x - h.x) * facing >= -10 && Math.abs(w.lane - h.lane) <= 0.5 && this.gap(w) <= HERO.lunge), h.x);
    h.order = null;
    if (!t) {
      // 空振りでも振る（触った手応えは必ず返す）
      h.facing = facing;
      this.startMove(h.step >= this.comboLen - 1 ? 'slam' : 'slash', 0);
      return true;
    }
    if (this.gap(t) > HERO.lunge) {
      // 遠い：走って行って、着いたら斬る
      h.order = { x: t.x, lane: t.lane, target: t.id, sprint: false };
      return true;
    }
    h.facing = t.x >= h.x ? 1 : -1;
    this.startMove(this.comboMove(t), t.id);
    this.lunge(t);
    return true;
  }

  // 踏み込み：相手の手前まで一気に寄る（奥行きもそろえる）
  private lunge(t: Wolf) {
    const h = this.hero;
    const side = t.x >= h.x ? 1 : -1;
    const stop = t.x - side * ((t.size + HERO.size) / 2 + 6);
    if ((stop - h.x) * side > 0) h.lungeTo = stop;
    h.lungeLane = t.lane;
  }

  private dash(dir: 1 | -1): boolean {
    const h = this.hero;
    if (this.cds.tosshin > 0) return false;
    h.facing = dir;
    h.order = null;
    this.startMove('tosshin', 0, clamp(h.x + dir * DASH.dist, HERO.minX, HERO.maxX));
    h.dashHit = [];
    h.iframes = DASH.iframes;
    this.sounds.push('dash');
    this.fx.push(this.mk({ kind: 'dash', x: h.x, lane: h.lane, x2: h.dashTo, dir }));
    return true;
  }

  private launch(): boolean {
    const h = this.hero;
    const t = this.nearest(this.wolves.filter((w) => w.z <= 0 && Math.abs(w.lane - h.lane) <= 0.5 && this.gap(w) <= HERO.lunge), h.x);
    h.order = null;
    if (t) {
      h.facing = t.x >= h.x ? 1 : -1;
      this.lunge(t);
    }
    this.startMove('launch', t?.id ?? 0);
    // 一緒に跳ぶ。2段ジャンプまで（上へはじき続けると、どこまでも昇っていった）。3回目からは跳ばずに斬り上げだけ
    if (h.jumps < 2) {
      h.jumps++;
      h.vz = 640;
      h.z = Math.max(h.z, 0.01);
    }
    this.sounds.push('jump');
    return true;
  }

  private slam(): boolean {
    const h = this.hero;
    // 宙の狼がいれば叩き落とす。いなければ地面を叩く（まわりを跳ね上げる）
    const t = this.nearest(this.wolves.filter((w) => w.z > 0 && !w.pouncing && Math.abs(w.lane - h.lane) <= 0.5 && this.gap(w) <= HERO.lunge + 40), h.x)
      ?? this.nearest(this.wolves.filter((w) => Math.abs(w.lane - h.lane) <= 0.5 && this.gap(w) <= HERO.lunge), h.x);
    h.order = null;
    if (t) {
      h.facing = t.x >= h.x ? 1 : -1;
      this.lunge(t);
    }
    this.startMove('slam', t?.id ?? 0);
    if (h.z > 0) h.vz = Math.min(h.vz, -300);
    return true;
  }

  canOuran() {
    return this.phase === 'wave' && this.gauge >= 100 && this.hero.down <= 0 && this.hero.ouran <= 0;
  }

  ouran() {
    if (!this.canOuran()) return false;
    this.gauge = 0;
    this.hero.ouran = OURAN.time;
    this.hero.ouranTick = 0.35; // カットインのぶん少し待つ
    this.hero.move = null;
    this.hero.charge = -1;
    this.hitStop = 0.35;
    this.events.push('ouran');
    this.sounds.push('ouran');
    return true;
  }

  // ── 昼：番犬を置く（毎晩の費用制）──
  get postCost() {
    return this.posts.reduce((n, p) => n + DOGS[p.kind].cost, 0);
  }
  canPlace() {
    return this.phase !== 'wave' && this.posts.length < DOG_MAX;
  }
  place(kind: DogKind, x: number, lane: number) {
    if (!this.canPlace()) return -1;
    this.posts.push({ kind, x: clamp(x, HOUSE_X + 30, DOG_POST_MAX), lane: clamp(lane, 0, 1) });
    this.sounds.push('buy');
    return this.posts.length - 1;
  }
  movePost(i: number, x: number, lane: number) {
    const p = this.posts[i];
    if (!p) return;
    p.x = clamp(x, HOUSE_X + 30, DOG_POST_MAX);
    p.lane = clamp(lane, 0, 1);
  }
  removePost(i: number) {
    this.posts.splice(i, 1);
  }

  // ── 昼：体力・近接・主砲のどれかを1段上げる ──
  trackCost(t: Track): number | undefined {
    return this.levels[t] < TRACKS[t].perks.length ? TRACK_COSTS[this.levels[t]] : undefined;
  }

  nextPerk(t: Track): Perk | undefined {
    return TRACKS[t].perks[this.levels[t]];
  }

  canBuy(t: Track) {
    const cost = this.trackCost(t);
    return this.phase === 'shop' && cost !== undefined && this.coins >= cost;
  }

  buy(t: Track) {
    if (!this.canBuy(t)) return false;
    this.coins -= this.trackCost(t)!;
    this.levels[t]++;
    this.sounds.push('buy');
    return true;
  }

  // 夜を迎える：番犬の銭を払う（足りなければ払えない分は出さない）
  nextWave() {
    if (this.phase !== 'shop' || this.result !== 'playing') return false;
    this.startWave();
    return true;
  }

  private startWave() {
    this.spawners = night(this.wave + 1).map((l) => ({ kind: l.kind, left: l.count, interval: l.interval, next: l.delay, surge: !!l.surge, warned: false }));
    this.phase = 'wave';
    const h = this.hero;
    h.hp = this.maxHp; // 昼のあいだに傷は癒える（案）
    h.down = 0;
    h.x = GIRL_X + 60;
    h.lane = 0.5;
    h.order = null;
    h.charge = -1;
    this.nightKills = 0;
    this.nightEarned = 0;
    this.dogs = [];
    for (const p of this.posts) {
      const s = DOGS[p.kind];
      if (this.coins < s.cost) continue;
      this.coins -= s.cost;
      // 番犬も晩ごとに鍛えられる（狼の硬さと同じ割合で、体力と噛む力が伸びる）
      this.dogs.push({ ...this.unit(p.x, s.hp * hpScale(this.wave + 1), s.size), lane: p.lane, kind: p.kind, post: p, bite: 0 });
    }
    this.events.push('night');
  }

  // ── 進行 ──
  advance(dt: number) {
    // 実時間を固定ステップに刻む。重い端末でも結果は変わらない
    // 晩の最後の1匹を倒したあとは少しのあいだスローに（2026-10-04 レビュー A6）
    this.acc += Math.min(dt, 0.25) * (this.finale > 0 ? 0.3 : 1);
    while (this.acc >= STEP) {
      this.acc -= STEP;
      this.step(STEP);
    }
  }
  private acc = 0;
  finale = -1; // 晩の最後の1匹を倒してから昼になるまでの残り（スロー）。-1 は始まっていない
  did = { tap: 0, dash: 0, launch: 0, slam: 0, shiki: 0, mini: 0 }; // 指で出した操作の回数（1晩目の「やってみよう」）

  step(dt: number) {
    for (const f of this.fx) f.t += dt;
    this.fx = this.fx.filter((f) => f.t < (f.kind === 'num' ? 0.8 : 0.6));
    this.shake = Math.max(0, this.shake - dt * 30);
    this.punch = Math.max(0, this.punch - dt * 4);
    if (this.result !== 'playing') return;
    // ヒットストップ：当たった瞬間、世界を一瞬止める
    if (this.hitStop > 0) {
      this.hitStop -= dt;
      return;
    }
    this.clock += dt;
    if (this.phase !== 'wave') {
      // 昼は時が止まる（待てば銭が貯まる、にはしない）
      if (this.phase === 'lead' && (this.lead -= dt) <= 0) this.startWave();
      return;
    }
    this.sinceHit += dt;
    if (this.sinceHit > COMBO_RESET) this.combo = 0;
    for (const k of Object.keys(this.cds) as (keyof Sim['cds'])[]) this.cds[k] = Math.max(0, this.cds[k] - dt);

    this.runWaves(dt);
    this.moveWolves(dt);
    this.moveDogs(dt);
    this.runHero(dt);
    this.flyArrows(dt);
    this.flyShells(dt);
    this.flyShots(dt);
    this.reap();
    this.endWave();

    if (this.houseHp <= 0) {
      this.houseHp = 0;
      this.losses++;
      this.result = 'lost'; // その晩の前の昼に戻る（main が保存から読み直す）
    }
  }

  private runWaves(dt: number) {
    let warn = false;
    for (const s of this.spawners) {
      s.next -= dt;
      if (s.surge && !s.warned && s.next <= SURGE_WARN) {
        s.warned = true;
        warn = true;
      }
      while (s.left > 0 && s.next <= 0) {
        const w = WOLVES[s.kind];
        const wolf: Wolf = {
          ...this.unit(WOLF_SPAWN_X, w.hp * hpScale(this.wave + 1), w.size), kind: s.kind, hasted: false,
          z: 0, vz: 0, vx: 0, stun: 0, slammed: false, pouncing: false, skillCd: 1 + this.rand() * 2, age: 0, hitDir: 0,
        };
        this.wolves.push(wolf);
        this.fx.push(this.mk({ kind: 'emerge', x: wolf.x, lane: wolf.lane, big: s.kind === 'alpha' }));
        s.left--;
        s.next += s.interval;
      }
    }
    this.spawners = this.spawners.filter((s) => s.left > 0);
    if (warn) {
      this.events.push('surge');
      this.sounds.push('horn');
    }
  }

  // 点検用：狼を1匹置く（撮影の場面づくり）
  debugSpawn(kind: WolfKind, x: number, lane: number) {
    const w = WOLVES[kind];
    const wolf: Wolf = {
      ...this.unit(x, w.hp * hpScale(this.wave + 1), w.size), lane, kind, hasted: false,
      z: 0, vz: 0, vx: 0, stun: 0, slammed: false, pouncing: false, skillCd: 9, age: 1, hitDir: 0,
    };
    this.wolves.push(wolf);
    return wolf;
  }

  // 次に来る群れの予告：この晩にまだ出ていない狼を種類ごとに数える
  pending(): Partial<Record<WolfKind, number>> {
    const out: Partial<Record<WolfKind, number>> = {};
    for (const s of this.spawners) out[s.kind] = (out[s.kind] ?? 0) + s.left;
    return out;
  }

  // 晩の狼を全滅させたら昼へ。夜明けの銭が入り、家が少し直る
  private endWave() {
    if (this.spawners.length > 0 || this.wolves.length > 0) {
      this.finale = -1;
      return;
    }
    // 最後の1匹：すぐ昼にせず、スローで見せてから
    if (this.finale < 0) {
      this.finale = FINALE;
      this.punch = 1;
      return;
    }
    if (this.finale > 0) {
      this.finale -= STEP;
      if (this.finale > 0) return;
    }
    this.finale = -1;
    this.wave++;
    this.arrows = [];
    this.shells = [];
    this.shots = [];
    this.combo = 0;
    this.hero.move = null;
    this.hero.charge = -1;
    this.hero.order = null;
    // 跳んでいるうちに晩が終わると、昼は体が動かないので宙に浮いたままになった
    this.hero.z = 0;
    this.hero.vz = 0;
    this.hero.jumps = 0;
    this.queued = null;
    if (this.wave >= DAYS_TO_CLEAR) this.result = 'won';
    else {
      this.phase = 'shop';
      const bonus = dawnBonus(this.wave);
      this.coins += bonus;
      this.nightEarned += bonus;
      this.houseHp = Math.min(HOUSE_HP, this.houseHp + DAWN_REPAIR);
      this.events.push('dawn');
    }
  }

  // ── 狼 ──
  private moveWolves(dt: number) {
    const howlers = this.wolves.filter((w) => w.kind === 'howler');
    const blocked = new Map<Dog, number>();
    const h = this.hero;
    const heroUp = h.down <= 0;
    for (const w of this.wolves) {
      const s = WOLVES[w.kind];
      w.age += dt;
      w.hitFlash = Math.max(0, w.hitFlash - dt);
      w.cooldown -= dt;
      w.skillCd -= dt;
      w.stun = Math.max(0, w.stun - dt);

      // 体の動き：弾かれた勢い・打ち上げ・叩きつけ
      if (w.vx !== 0) {
        w.x = clamp(w.x + w.vx * dt, HOUSE_X + 10, WOLF_SPAWN_X);
        if (!w.pouncing) w.vx *= Math.max(0, 1 - BODY.friction * dt);
        if (Math.abs(w.vx) < 5) w.vx = 0;
      }
      if (w.z > 0 || w.vz > 0) {
        w.vz -= BODY.gravity * (w.slammed ? 2.2 : 1) * dt;
        w.z += w.vz * dt;
        if (w.z <= 0) {
          w.z = 0;
          if (w.slammed) {
            // 叩きつけ：跳ね返り、まわりの狼にも当たる
            w.slammed = false;
            w.vz = BODY.bounce;
            w.z = 0.01;
            this.fx.push(this.mk({ kind: 'land', x: w.x, lane: w.lane, r: BODY.slamSplash, big: true }));
            this.sounds.push('slam');
            for (const o of this.wolves) {
              if (o !== w && o.z <= 0 && Math.abs(o.x - w.x) <= BODY.slamSplash && Math.abs(o.lane - w.lane) <= 0.5) {
                this.hit(o, BODY.slamSplashDamage, { stop: 0, kb: 120 * Math.sign(o.x - w.x || 1) });
              }
            }
            this.kick(6, 0);
          } else {
            if (w.pouncing) {
              // 跳び越えの着地：主人公の上に落ちたら噛む
              w.pouncing = false;
              w.vx = 0;
              if (heroUp && Math.abs(w.x - h.x) <= (w.size + HERO.size) / 2 && Math.abs(w.lane - h.lane) <= LANE_TOL) this.hurtHero(POUNCE.damage * this.bite);
            } else w.stun = Math.max(w.stun, 0.3); // 落ちたら起き上がるまで少し
            w.vz = 0;
            this.fx.push(this.mk({ kind: 'land', x: w.x, lane: w.lane, r: w.size }));
          }
        }
        continue; // 宙にいるあいだは何もできない
      }
      if (w.stun > 0) continue;

      w.hasted = w.kind !== 'howler' && howlers.some((o) => Math.abs(o.x - w.x) < HOWL.radius);
      const ahead = w.x - h.x; // 主人公より右（家と反対側）にいる距離

      // 奥行き：狼・鎧狼・大狼は主人公が近いと寄せてくる（子狼と遠吠えは寄せない＝すり抜けて家へ）。1匹ずつ少しずらして、取り囲むように
      if (heroUp && (w.kind === 'wolf' || w.kind === 'armored' || w.kind === 'alpha') && ahead > 0 && ahead < STEER.range) {
        const want = clamp(h.lane + ((w.id % 3) - 1) * 0.17, 0, 1);
        w.lane += clamp(want - w.lane, -STEER.speed * dt, STEER.speed * dt);
      }

      // 特性ごとの攻め方
      if (w.kind === 'howler' && w.skillCd <= 0) {
        const near = (heroUp && ahead > 0 && ahead <= SHOCKWAVE.range) || this.dogs.some((d) => d.x < w.x && w.x - d.x <= SHOCKWAVE.range);
        if (near) {
          this.shots.push({ x: w.x - w.size / 2, lane: w.lane });
          w.skillCd = SHOCKWAVE.interval;
        }
      }
      if (w.kind === 'pup' && w.skillCd <= 0 && heroUp && ahead > 0 && ahead <= POUNCE.range && Math.abs(w.lane - h.lane) <= LANE_TOL + 0.1) {
        // 飛びかかり：主人公を跳び越えて家へ（立っているだけでは止められない）
        w.vz = POUNCE.lift;
        w.z = 0.01;
        w.vx = -POUNCE.speed;
        w.pouncing = true;
        w.skillCd = POUNCE.interval;
        continue;
      }

      // 噛みつく相手：主人公 → 番犬 → 家
      // 2段目で高く跳んだときだけ噛まれない（宙で噛まれていた。低い所まで避けられると、上へはじき続けるだけで噛まれにくかった）
      const heroTouch = heroUp && h.ouran <= 0 && h.z < 150 && Math.abs(w.x - h.x) <= (w.size + HERO.size) / 2 && Math.abs(w.lane - h.lane) <= LANE_TOL;
      // 番犬1匹が足止めできるのは DOG_BLOCK 匹まで。あふれた狼はすり抜けて家へ向かう
      const dog = this.dogs.find((d) => d.x < w.x && w.x - d.x <= (w.size + d.size) / 2 && Math.abs(w.lane - d.lane) <= LANE_TOL && (blocked.get(d) ?? 0) < DOG_BLOCK);
      if (dog) blocked.set(dog, (blocked.get(dog) ?? 0) + 1);
      if (heroTouch || dog || w.x <= HOUSE_X + w.size / 2) {
        if (w.cooldown <= 0) {
          w.cooldown = s.interval;
          const bite = s.damage * this.bite;
          if (heroTouch) this.hurtHero(bite);
          else if (dog) this.hurt(dog, bite);
          else {
            this.houseHp -= bite;
            this.stats.houseBite += bite;
            this.fx.push(this.mk({ kind: 'bite', x: HOUSE_X, lane: w.lane }));
          }
        }
        continue;
      }
      if (w.kind === 'howler' && w.x <= HOWL.holdX) continue; // 遠吠えは後ろに居座る
      // 前の狼に詰まったら、奥行きをずらして回り込む（同じ所に重なって固まらない）
      const front = this.wolves.find((o) => o !== w && o.z <= 0 && o.x < w.x && w.x - o.x < (o.size + w.size) * 0.4 && Math.abs(o.lane - w.lane) < 0.14);
      if (front) {
        w.lane = clamp(w.lane + (w.lane >= front.lane ? 1 : -1) * 0.5 * dt, 0, 1);
        continue;
      }
      w.x -= s.speed * (w.hasted ? HOWL.speedMul : 1) * dt;
    }
  }

  private flyShots(dt: number) {
    const h = this.hero;
    this.shots = this.shots.filter((s) => {
      s.x -= SHOCKWAVE.speed * dt;
      if (h.down <= 0 && h.ouran <= 0 && h.iframes <= 0 && Math.abs(s.x - h.x) < HERO.size / 2 && Math.abs(s.lane - h.lane) <= LANE_TOL) {
        this.hurtHero(SHOCKWAVE.damage * this.bite);
        return false;
      }
      const dog = this.dogs.find((d) => Math.abs(s.x - d.x) < d.size / 2 && Math.abs(s.lane - d.lane) <= LANE_TOL);
      if (dog) {
        this.hurt(dog, SHOCKWAVE.damage * this.bite);
        return false;
      }
      if (s.x <= HOUSE_X) {
        this.houseHp -= SHOCKWAVE.damage * this.bite;
        this.stats.houseShock += SHOCKWAVE.damage * this.bite;
        this.fx.push(this.mk({ kind: 'bite', x: HOUSE_X, lane: s.lane }));
        return false;
      }
      return true;
    });
  }

  // 番犬：持ち場で待ち、近くの狼に跳びかかって噛む。狼がいなくなれば持ち場へ戻る
  private moveDogs(dt: number) {
    for (const d of this.dogs) {
      const s = DOGS[d.kind];
      d.hitFlash = Math.max(0, d.hitFlash - dt);
      d.bite = Math.max(0, d.bite - dt);
      d.cooldown -= dt;
      const reach = (w: Wolf) => w.z <= 0 && Math.abs(w.lane - d.lane) <= LANE_TOL && Math.abs(w.x - d.x) <= (w.size + d.size) / 2;
      const wolf = this.nearest(this.wolves.filter(reach), d.x);
      if (wolf) {
        if (d.cooldown <= 0) {
          d.cooldown = s.interval;
          d.bite = 0.2;
          this.hit(wolf, s.damage * hpScale(this.wave + 1), { stop: 0, quiet: true });
        }
        continue;
      }
      // 持ち場から110までの狼には寄っていく
      const prey = this.nearest(this.wolves.filter((w) => w.z <= 0 && Math.abs(w.x - d.post.x) <= 110 && Math.abs(w.lane - d.post.lane) <= 0.4), d.x);
      const tx = prey ? prey.x - (prey.size + d.size) / 2 : d.post.x;
      const tl = prey ? prey.lane : d.post.lane;
      d.x += clamp(tx - d.x, -s.speed * dt, s.speed * dt);
      d.lane += clamp(tl - d.lane, -dt, dt);
    }
  }

  // ── 主人公 ──
  private hurtHero(dmg: number) {
    const h = this.hero;
    if (h.down > 0 || h.ouran > 0 || h.iframes > 0) return;
    const before = h.hp;
    this.sounds.push('hurt');
    h.hp -= dmg;
    this.stats.heroDmg += dmg;
    h.hitFlash = 0.18;
    const heavy = h.move === 'shiki' || h.move === 'slam' || h.move === 'kaiten';
    if (h.armor <= 0 && h.charge < 0 && !(heavy && !h.auto)) {
      // 溜めているあいだと、指で出した大技（主砲・叩き落とし・回転斬り）のあいだはひるまない。
      // 斬りの連打はひるむ（2026-10-04 指の技すべてをひるまなくしたら、連打が最強になった）。
      // ひるむと技も溜めも途切れる。そのあと少しのあいだは、噛まれてもひるまない
      h.stun = HERO.hitStunTime;
      h.armor = 0.7;
      h.move = null;
      h.charge = -1;
      h.lungeTo = null;
    }
    this.gain(OURAN.gain.hurt * dmg);
    this.kick(3, 0);
    if (h.hp <= 0) {
      h.hp = 0;
      h.down = HERO.reviveTime;
      this.stats.downs++;
      h.step = 0;
      h.order = null;
      this.events.push('down');
    } else if (h.hp < this.maxHp * 0.3 && before >= this.maxHp * 0.3) this.events.push('hurt');
  }

  private runHero(dt: number) {
    const h = this.hero;
    h.hitFlash = Math.max(0, h.hitFlash - dt);
    h.iframes = Math.max(0, h.iframes - dt);
    h.armor = Math.max(0, h.armor - dt);
    h.autoT -= dt;
    h.bowT -= dt;
    h.running = 0;
    // 跳び（斬り上げで一緒に跳ぶ）
    if (h.z > 0 || h.vz > 0) {
      h.vz -= BODY.gravity * 1.15 * dt;
      h.z += h.vz * dt;
      if (h.z <= 0) {
        h.z = 0;
        h.vz = 0;
        h.jumps = 0;
        this.fx.push(this.mk({ kind: 'land', x: h.x, lane: h.lane, r: 30 }));
      }
    }
    if (h.down > 0) {
      // 倒れたら家の前で立ち上がる。負けは家が落ちたときだけ
      h.down -= dt;
      if (h.down < HERO.reviveTime - 0.6) h.x = Math.max(GIRL_X, h.x - 900 * dt); // 少し寝てから家の前へ下がる
      if (h.down <= 0) {
        h.hp = this.maxHp;
        h.x = GIRL_X + 20;
        h.iframes = 1;
        this.events.push('revive');
      }
      return;
    }
    if (h.ouran > 0) return this.runOuran(dt);
    if (h.stun > 0) {
      h.stun -= dt;
      return;
    }
    if (h.charge >= 0) {
      const before = h.charge;
      h.charge += dt;
      if (before < this.chargeFull && h.charge >= this.chargeFull) {
        this.sounds.push('full');
        this.fx.push(this.mk({ kind: 'full', x: h.x, lane: h.lane }));
      }
      return;
    }
    if (h.move) return this.runMove(dt);
    // 先行入力：空いたらすぐ出す
    if (this.queued) {
      const q = this.queued;
      this.queued = null;
      if (this.clock - q.t <= HERO.buffer && q.act()) return;
    }
    if (h.order) return this.runOrder(dt);
    this.idle();
  }

  private runOrder(dt: number) {
    const h = this.hero;
    const o = h.order!;
    const t = o.target ? this.wolves.find((w) => w.id === o.target) : undefined;
    if (o.target && !t) {
      h.order = null;
      return;
    }
    if (t) {
      o.x = t.x;
      o.lane = t.lane;
      if (this.gap(t) <= HERO.lunge * 0.8) {
        h.order = null;
        this.attack(t);
        return;
      }
    }
    // 走る途中で目の前に来た狼は斬る（足は止めない相手は追わない）
    const speed = o.sprint ? HERO.sprint : HERO.speed;
    const dx = o.x - h.x;
    const dl = o.lane - h.lane;
    if (Math.abs(dx) < 3 && Math.abs(dl) < 0.02) {
      h.order = null;
      return;
    }
    h.facing = dx > 0 ? 1 : dx < 0 ? -1 : h.facing;
    h.x += Math.sign(dx) * Math.min(Math.abs(dx), speed * dt);
    h.lane += clamp(dl, -HERO.laneSpeed * dt, HERO.laneSpeed * dt);
    h.running = speed;
    if (!o.sprint) {
      const blocker = this.wolves.find((w) => w.z <= 0 && Math.abs(w.lane - h.lane) <= LANE_TOL && (w.x - h.x) * h.facing > 0 && this.gap(w) <= 4);
      if (blocker) {
        h.order = null;
        this.attack(blocker);
      }
    }
  }

  // 触っていないとき：目の前の狼を軽く斬る（連撃の手数は進めない）。離れた狼には弓
  private idle() {
    const h = this.hero;
    const inReach = this.wolves.filter((w) => w.z <= 0 && Math.abs(w.lane - h.lane) <= LANE_TOL && this.gap(w) <= MOVES.slash.reach * 0.8);
    if (inReach.length) {
      if (h.autoT > 0) return;
      const t = this.nearest(inReach, h.x)!;
      h.facing = t.x >= h.x ? 1 : -1;
      this.startMove('slash', t.id, 0, true);
      h.autoT = AUTO.slash;
      return;
    }
    if (h.bowT > 0) return;
    const far = this.wolves.filter((w) => Math.abs(w.x - h.x) <= AUTO.bowRange && w.age > 0.6);
    const t = this.nearest(far.filter((w) => (w.x - h.x) * h.facing > 0), h.x) ?? this.nearest(far, h.x);
    if (!t) return;
    h.facing = t.x >= h.x ? 1 : -1;
    const crowd = this.densest(far);
    if (crowd && crowd.n >= 3 && this.knows('ame') && this.cds.ame <= 0) this.startMove('ame', 0, crowd.x, true);
    else this.startMove('bow', t.id, 0, true);
    h.bowT = AUTO.bow / (1 + this.sum('far', 'rate'));
  }

  private comboMove(target: Wolf): MoveId {
    const h = this.hero;
    if (h.step >= this.comboLen - 1) return this.knows('shiki') ? 'shiki' : 'slam';
    if (target.z > 0) return 'air';
    if (h.step >= this.comboLen - 3) return 'launch'; // 締めの手前で打ち上げる
    return 'slash';
  }

  private startMove(id: MoveId, targetId: number, at = 0, auto = false) {
    const h = this.hero;
    h.move = id;
    h.moveT = 0;
    h.moveTarget = targetId;
    h.dashTo = at;
    h.auto = auto;
    h.lungeTo = null;
    h.lungeLane = h.lane;
    if (id === 'launch' && !auto) h.step = Math.max(h.step, this.comboLen - 3);
    if (id in this.cds) this.cds[id as keyof Sim['cds']] = MOVE_CD[id as keyof typeof MOVE_CD];
  }

  // 技の中身。当てる瞬間は技の長さのちょうど半ば
  private runMove(dt: number) {
    const h = this.hero;
    const id = h.move!;
    const m = MOVES[id];
    const before = h.moveT;
    h.moveT += dt * (id === 'bow' ? 1 + this.sum('far', 'rate') : 1);
    const at = m.dur * 0.5;
    if (h.lungeTo !== null && h.moveT < at) {
      h.x += (h.lungeTo - h.x) * Math.min(1, dt * 22);
      h.lane += (h.lungeLane - h.lane) * Math.min(1, dt * 16);
      h.running = 1;
    }
    if (id === 'tosshin') this.runDash(dt);
    if (before < at && h.moveT >= at) this.strike(id);
    if (h.moveT >= m.dur) {
      h.move = null;
      h.lungeTo = null;
    }
  }

  // 突進：通り道の狼を全部斬って突き抜ける
  private runDash(dt: number) {
    const h = this.hero;
    const m = MOVES.tosshin;
    if (h.moveT > m.dur * 0.7) return;
    const from = h.x;
    h.x += (h.dashTo - h.x) * Math.min(1, dt * 20);
    h.running = 2;
    const lo = Math.min(from, h.x) - 20;
    const hi = Math.max(from, h.x) + 20;
    for (const w of this.wolves) {
      if (h.dashHit.includes(w.id) || w.x < lo || w.x > hi || Math.abs(w.lane - h.lane) > 0.42) continue;
      h.dashHit.push(w.id);
      this.hit(w, m.damage * this.nearPower, { kb: m.kb! * h.facing, lift: w.z > 0 ? 200 : 140, stop: m.stop, stun: DASH.stun });
      this.fx.push(this.mk({ kind: 'slash', x: w.x, lane: w.lane, z: 0, move: 'tosshin', dir: h.facing }));
    }
  }

  private strike(id: MoveId) {
    const h = this.hero;
    const m = MOVES[id];
    const far = id === 'bow' || id === 'ame' || id === 'hougeki' || id === 'shiki';
    let dmg = m.damage * (far ? this.farPower : this.nearPower);
    if (id === 'tosshin') return;
    if (id === 'bow') {
      const t = this.wolves.find((w) => w.id === h.moveTarget) ?? this.nearest(this.wolves, h.x);
      // 矢は遅れて落ちるので、狼の進む先を狙う
      if (t) this.loose(t.x - WOLVES[t.kind].speed * (BOW_FLIGHT.base + Math.abs(t.x - h.x) * BOW_FLIGHT.perUnit), t.lane, dmg);
      return;
    }
    if (id === 'ame') {
      for (let i = 0; i < 8; i++) this.loose(h.dashTo + (this.rand() - 0.5) * 160, this.rand(), dmg, i * 0.04);
      return;
    }
    // 主砲：溜めの段（dashTo：1 ふつう・2 満タン）で威力と範囲が伸びる。満タンで撃ち込みを覚えていれば群れへ4発
    let area = m.area;
    let kb = m.kb ?? 0;
    if (id === 'shiki') {
      const lvl = h.dashTo || 1;
      if (lvl >= 2) {
        dmg *= 2;
        area = m.area! * 1.5;
        kb *= 1.3;
        if (this.knows('hougeki')) {
          const crowd = this.densest(this.wolves.filter((w) => (w.x - h.x) * h.facing > 60));
          if (crowd) {
            for (let i = 0; i < 4; i++) {
              const off = (i - 1.5) * 26 + (this.rand() - 0.5) * 30;
              this.shells.push({ fromX: h.x, toX: crowd.x + off, t: -i * 0.08, lane: crowd.lane + (this.rand() - 0.5) * 0.3, damage: MOVES.hougeki.damage * this.farPower, area: MOVES.hougeki.area! });
            }
          }
        }
      }
      this.fx.push(this.mk({ kind: 'muzzle', x: h.x + h.facing * 40, lane: h.lane, dir: h.facing, big: lvl >= 2 }));
      this.punch = lvl >= 2 ? 1 : 0.6;
    }
    // 近接の技：前（area があればまわり）にいる狼に当てる
    const laneTol = area ? 0.6 : 0.42;
    const inReach = (w: Wolf) => {
      if (Math.abs(w.lane - h.lane) > laneTol) return false;
      if (id === 'shiki') {
        const d = (w.x - h.x) * h.facing;
        return d >= -40 && d <= area!; // 主砲は前へ
      }
      if (area) return Math.abs(w.x - h.x) <= area;
      const d = (w.x - h.x) * h.facing;
      return d >= -HERO.size / 2 && d <= HERO.size / 2 + m.reach + w.size / 2;
    };
    let hits = this.wolves.filter(inReach);
    if (id === 'slam' && !hits.some((w) => w.z > 0)) {
      // 地面を叩く：まわりを少し跳ね上げる
      hits = this.wolves.filter((w) => w.z <= 0 && Math.abs(w.x - (h.x + h.facing * 40)) <= 120 && Math.abs(w.lane - h.lane) <= 0.5);
      for (const w of hits) this.hit(w, dmg * 0.7, { lift: 260, kb: 60 * Math.sign(w.x - h.x || h.facing), stop: 0.06 });
      this.fx.push(this.mk({ kind: 'pound', x: h.x + h.facing * 40, lane: h.lane, r: 120 }));
      this.sounds.push('slam');
      this.kick(m.shake ?? 0, 0);
      this.advanceCombo(id, hits.length > 0);
      return;
    }
    // 連撃は相手1匹に。範囲の技と主砲はまとめて
    const targets = area ? hits : [hits.find((w) => w.id === h.moveTarget) ?? hits[0]].filter((w): w is Wolf => !!w);
    for (const w of targets) {
      this.hit(w, dmg, { kb: kb * Math.sign(w.x - h.x || h.facing), lift: m.lift, slam: m.slam, stop: m.stop });
    }
    this.sounds.push(id === 'shiki' ? 'boom' : 'swing');
    if (id === 'kaiten') this.fx.push(this.mk({ kind: 'spin', x: h.x, lane: h.lane, r: area }));
    else if (id === 'shiki') this.fx.push(this.mk({ kind: 'blast', x: h.x + h.facing * area! * 0.5, lane: h.lane, r: area, big: (h.dashTo || 1) >= 2 }));
    else this.fx.push(this.mk({ kind: 'slash', x: h.x + h.facing * 50, lane: h.lane, z: h.z, move: id, dir: h.facing, big: targets.length > 0 }));
    if (m.shake && (targets.length || id === 'shiki')) this.kick(m.shake, h.facing);
    this.advanceCombo(id, targets.length > 0);
  }

  // 連撃の手数を進める。締めを出したら最初から
  private advanceCombo(id: MoveId, landed: boolean) {
    const h = this.hero;
    if (h.auto) return;
    if (id !== 'slash' && id !== 'launch' && id !== 'air' && id !== 'slam' && id !== 'shiki') return;
    if (!landed) {
      if (id !== 'launch') h.step = 0;
      return;
    }
    if (id === 'slam' || (id === 'shiki' && !h.dashTo)) {
      h.step = 0;
      h.stun = 0.12; // 締めのあとの残心
      this.punch = Math.max(this.punch, 0.7);
      this.events.push('finisher');
    } else if (id !== 'shiki') h.step++;
  }

  private runOuran(dt: number) {
    const h = this.hero;
    h.ouran -= dt;
    h.ouranTick -= dt;
    if (h.ouranTick <= 0) {
      h.ouranTick = OURAN.tick;
      // 次の狼へ一足で跳び、まわりをまとめて斬る
      const t = this.nearest(this.wolves.filter((w) => Math.abs(w.x - h.x) <= 380 && w.x <= HERO.maxX + 60), h.x);
      if (t) {
        h.facing = t.x >= h.x ? 1 : -1;
        h.x = clamp(t.x - h.facing * 20, GIRL_X, HERO.maxX + 60);
        h.lane = t.lane;
      }
      for (const w of this.wolves) {
        if (Math.abs(w.x - h.x) <= OURAN.reach) this.hit(w, OURAN.damage * this.nearPower, { lift: 240, stop: 0.02, kb: 60 * Math.sign(w.x - h.x || 1) });
      }
      this.fx.push(this.mk({ kind: 'spin', x: h.x, lane: h.lane, r: OURAN.reach, big: true }));
      this.kick(4, h.facing);
    }
    if (h.ouran <= 0) {
      // 締め：主砲の全弾
      for (const w of this.wolves) {
        if (Math.abs(w.x - h.x) <= OURAN.finalArea) this.hit(w, OURAN.final * this.nearPower, { kb: 500 * Math.sign(w.x - h.x || 1), stop: 0 });
      }
      this.fx.push(this.mk({ kind: 'blast', x: h.x + h.facing * 120, lane: h.lane, r: OURAN.finalArea * 0.6, big: true }));
      this.fx.push(this.mk({ kind: 'muzzle', x: h.x + h.facing * 40, lane: h.lane, dir: h.facing, big: true }));
      this.hitStop = 0.2;
      this.kick(14, h.facing);
      this.punch = 1;
      h.ouran = 0;
      h.step = 0;
    }
  }

  // ── 飛び道具 ──
  private loose(toX: number, lane: number, damage: number, delay = 0) {
    const h = this.hero;
    const flight = BOW_FLIGHT.base + Math.abs(toX - h.x) * BOW_FLIGHT.perUnit;
    this.arrows.push({ fromX: h.x, fromLane: h.lane, toX, lane, t: -delay / flight, flight, damage });
    this.sounds.push('bow');
  }

  private flyArrows(dt: number) {
    this.arrows = this.arrows.filter((a) => {
      a.t += dt / a.flight;
      if (a.t < 1) return true;
      const near = this.wolves.filter((w) => Math.abs(w.x - a.toX) <= BOW_FLIGHT.hitRadius + w.size / 2 && Math.abs(w.lane - a.lane) <= 0.4);
      const t = this.nearest(near, a.toX);
      if (t) this.hit(t, a.damage * (1 - WOLVES[t.kind].arrowResist), { stop: 0, kb: 30 });
      else this.fx.push(this.mk({ kind: 'miss', x: a.toX, lane: a.lane }));
      return false;
    });
  }

  private flyShells(dt: number) {
    this.shells = this.shells.filter((s) => {
      s.t += dt / 0.9;
      if (s.t < 1) return true;
      for (const w of this.wolves) {
        if (Math.abs(w.x - s.toX) <= s.area + w.size / 2 && Math.abs(w.lane - s.lane) <= 0.5) {
          this.hit(w, s.damage * (1 - WOLVES[w.kind].arrowResist), { kb: 160 * Math.sign(w.x - s.toX || 1), lift: 180, stop: 0 });
        }
      }
      this.fx.push(this.mk({ kind: 'blast', x: s.toX, lane: s.lane, r: s.area }));
      this.sounds.push('boom');
      this.kick(3, 0);
      return false;
    });
  }

  // ── 当てる ──
  private hit(w: Wolf, dmg: number, o: { kb?: number; lift?: number; slam?: boolean; stop?: number; quiet?: boolean; stun?: number }) {
    if (w.age < 0.4) return; // 裂け目から出てくる途中は当たらない
    const light = 1 - (WOLVES[w.kind].heavy ?? 0);
    this.hurt(w, dmg);
    if (o.kb) {
      w.vx = o.kb * light;
      w.hitDir = Math.sign(o.kb);
    }
    if (o.lift) {
      w.vz = Math.max(w.vz, o.lift * light);
      w.z = Math.max(w.z, 0.01);
    }
    if (o.slam && w.z > 0) {
      w.slammed = true;
      w.vz = -900;
    }
    w.pouncing = false;
    w.stun = Math.max(w.stun, o.stun ?? 0.25);
    const big = dmg >= 30;
    this.fx.push(this.mk({ kind: 'num', x: w.x, lane: w.lane, n: Math.round(dmg), z: w.z, big }));
    if (o.quiet) return; // 番犬の噛みつきはコンボに数えない
    this.fx.push(this.mk({ kind: 'spark', x: w.x, lane: w.lane, z: w.z, big: big || !!o.slam, dir: w.hitDir || this.hero.facing }));
    this.sounds.push(o.slam || (o.stop ?? 0) >= 0.08 ? 'heavy' : 'hit');
    this.combo++;
    if (this.combo === 10) this.events.push('combo10');
    if (this.combo === 30) this.events.push('combo30');
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    this.sinceHit = 0;
    this.gain(OURAN.gain.hit);
    if (o.stop) this.hitStop = Math.max(this.hitStop, o.stop);
  }

  private gain(n: number) {
    if (this.hero.ouran > 0) return;
    this.gauge = Math.min(100, this.gauge + n);
  }

  // 画面を揺らす。dir があれば当てた向きへ押す
  private kick(n: number, dir: number) {
    this.shake = Math.max(this.shake, n);
    if (dir) this.shakeDir = dir;
  }

  private densest(list: Wolf[] = this.wolves): { x: number; lane: number; n: number } | undefined {
    let best: { x: number; lane: number; n: number } | undefined;
    for (const w of list) {
      const n = list.filter((o) => Math.abs(o.x - w.x) <= 80).length;
      if (!best || n > best.n) best = { x: w.x, lane: w.lane, n };
    }
    return best;
  }

  private reap() {
    this.wolves = this.wolves.filter((w) => {
      if (w.hp > 0) return true;
      const b = WOLVES[w.kind].bounty;
      this.coins += b;
      this.nightEarned += b;
      this.kills++;
      this.nightKills++;
      this.fx.push(this.mk({ kind: 'poof', x: w.x, lane: w.lane, z: w.z, r: w.size, n: b, dir: w.hitDir }));
      return false;
    });
    this.dogs = this.dogs.filter((d) => {
      if (d.hp > 0) return true;
      this.fx.push(this.mk({ kind: 'poof', x: d.x, lane: d.lane, z: 0, r: d.size }));
      return false;
    });
  }

  // ── 下回り ──
  // 相手との隙間（体の端から端）
  private gap(w: Unit) {
    return Math.abs(w.x - this.hero.x) - (w.size + HERO.size) / 2;
  }

  private mk(f: Omit<Fx, 'id' | 't'>): Fx {
    return { id: this.fxId++, t: 0, ...f };
  }

  private hurt(u: Unit, dmg: number) {
    u.hp -= dmg;
    u.hitFlash = 0.12;
  }

  private nearest<T extends Unit>(list: T[], x: number): T | undefined {
    let best: T | undefined;
    for (const u of list) if (!best || Math.abs(u.x - x) < Math.abs(best.x - x)) best = u;
    return best;
  }

  private unit(x: number, hp: number, size: number): Unit {
    return { id: this.nextId++, x, lane: 0.1 + this.rand() * 0.8, hp, maxHp: hp, size, cooldown: 0, hitFlash: 0 };
  }

  private rand() {
    // mulberry32
    let t = (this.seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}
