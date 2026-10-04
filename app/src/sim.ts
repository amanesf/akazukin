// 戦いの中身。描画を知らない。固定ステップで進め、同じ入力なら同じ結果になる。
// 指一本アクション（2026-10-04）：プレイヤーの指で技を出す。触っていないときは軽く自動で斬り、弓で補助する。
// 奥行き（lane）がある：主人公も狼も奥行きを動き、離れた奥行きの相手は噛めない・斬れない。
import {
  AUTO, BODY, BOW_FLIGHT, RAIN_FLIGHT, CHARGE, COMBO_BASE, COMBO_RESET, COIN_START, DASH, DOG_BLOCK, DOG_DEFAULT_ROLES, DOG_MAX_X, DOG_ORDER, DOG_REVIVE, DOG_ROLE_ORDER, DOGS,
  FIRST_WAVE_DELAY, GIRL_X, HERO, HOUSE_HP, HOUSE_X, HOWL, LANE_TOL, MOVE_CD, MOVES, OURAN, POUNCE, SHOCKWAVE, STEER, STEP,
  DAWN_REPAIR, DAYS_TO_CLEAR, REPAIR, TRACK_COSTS, TRACKS, TRAIN, TRAIN_NOTE, WOLF_SPAWN_X, WOLVES, dawnBonus,
  type DogKind, type DogRole, type MoveId, type Perk, type SkillId, type Track, type WolfKind,
} from './config';
import { hpScale, mood, night, SURGE_WARN, type Mood } from './nights';

const FINALE = 0.4; // 晩の最後の1匹のあとのスローの長さ（sim の秒。実時間ではこの約3倍）
const CHEER = 2.6; // スローが明けてから、決めポーズ→寄ってきた番犬をなでて昼になるまで（秒）。なでる分を足した（2026-10-04 かわいさ）

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
// 番犬（3匹・自分で動く）。role は昼に決めた役目、target は追っている狼、down は倒れて休んでいる残り秒数
export interface Dog extends Unit { kind: DogKind; role: DogRole; bite: number; target: number; down: number; facing: 1 | -1; run: number } // run：走っている速さ（描画）
// 矢：target を追いかけ（少し曲がる）、通り道の狼を pierce 匹まで貫く（2026-10-04 アマネさん「弓矢もっと役に立たせたい」）
export interface Arrow { fromX: number; fromLane: number; toX: number; lane: number; t: number; flight: number; damage: number; rain: boolean; target: number; pierce: number; hits: number[] }
export interface Shell { fromX: number; toX: number; t: number; lane: number; damage: number; area: number }
export interface Shot { x: number; lane: number } // 狼の衝撃波（左へ飛ぶ）
export type FxKind = 'arrowhit' | 'blast' | 'poof' | 'slash' | 'miss' | 'num' | 'spin' | 'land' | 'spark' | 'dash' | 'pound' | 'muzzle' | 'full' | 'bite' | 'emerge';
export interface Fx {
  id: number;
  kind: FxKind;
  x: number; lane: number; t: number; r?: number; n?: number; z?: number; big?: boolean;
  dir?: number; // 向き（1 右・-1 左）
  x2?: number; // 突進の終わり
  move?: MoveId;
  wolf?: WolfKind; // 倒した狼の種類（倒れる演出で絵を割る）
}

export type Result = 'playing' | 'won' | 'lost';
// lead：最初の晩の前／wave：夜（戦闘中）／shop：昼（鍛える・番犬の役目を決める。「夜を迎える」で進む）
export type Phase = 'lead' | 'wave' | 'shop';
// 画面の演出と主人公の吹き出しのための出来事（main が受け取って消す）
export type Sound = 'swing' | 'hit' | 'heavy' | 'slam' | 'boom' | 'bow' | 'hurt' | 'ouran' | 'horn' | 'buy' | 'dash' | 'charge' | 'full' | 'jump';
export type Event = 'night' | 'finisher' | 'ouran' | 'hurt' | 'down' | 'revive' | 'dawn' | 'surge' | 'combo10' | 'combo30';

export interface Save {
  v: 3; wave: number; coins: number; houseHp: number; levels: Record<Track, number>; kills: number; bestCombo: number;
  roles: Record<DogKind, DogRole>; losses: number;
}
type OldSave = Omit<Save, 'v' | 'roles' | 'losses'> & { v: 1 | 2; losses?: number };

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
  mood: Mood | null = null; // 今夜の様子（霧・紅月など）
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
  roles: Record<DogKind, DogRole> = { ...DOG_DEFAULT_ROLES }; // 番犬の役目（昼に決める）
  arrows: Arrow[] = [];
  shells: Shell[] = [];
  shots: Shot[] = [];
  fx: Fx[] = [];

  cds: Record<'kaiten' | 'tosshin' | 'ame' | 'hougeki', number> = { kaiten: 0, tosshin: 0, ame: 0, hougeki: 0 };
  levels: Record<Track, number> = { body: 0, near: 0, far: 0, dog: 0 };

  private spawners: Spawner[] = [];
  // まもなく裂け目から出てくる狼（画面の予告：裂け目の中で赤い目が開く）。next＝出てくるまでの秒
  get coming(): { kind: WolfKind; next: number; i: number }[] {
    return this.spawners.flatMap((s, i) => (s.left > 0 && s.next < 1.2 ? [{ kind: s.kind, next: s.next, i }] : []));
  }
  private holdWanted = false;
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
      v: 3, wave: this.wave, coins: Math.floor(this.coins), houseHp: this.houseHp, levels: { ...this.levels }, kills: this.kills,
      bestCombo: this.bestCombo, roles: { ...this.roles }, losses: this.losses,
    };
  }

  static load(d: Save | OldSave, seed: number) {
    const s = new Sim(seed);
    s.wave = d.wave;
    s.coins = d.coins;
    s.houseHp = d.houseHp;
    s.levels = { ...s.levels, ...d.levels };
    s.kills = d.kills;
    s.bestCombo = d.bestCombo;
    s.losses = d.losses ?? 0;
    if (d.v === 3) s.roles = { ...s.roles, ...d.roles };
    s.phase = 'shop';
    s.hero.hp = s.maxHp;
    return s;
  }

  // 3本の段から、いま効いているものを数える
  private perks(t: Track): Perk[] {
    return TRACKS[t].perks.slice(0, this.levels[t]);
  }
  private sum(t: Track, key: 'hp' | 'combo' | 'power' | 'rate' | 'charge' | 'dogHp' | 'dogPower' | 'dogRevive' | 'dogSpeed') {
    return this.perks(t).reduce((n, p) => n + (p[key] ?? 0), 0);
  }
  // 段を上げきったあとの修練の回数
  trained(t: Track) {
    return Math.max(0, this.levels[t] - TRACKS[t].perks.length);
  }
  get dogHpMul() {
    return 1 + this.sum('dog', 'dogHp') + TRAIN.dog * this.trained('dog');
  }
  get dogPowerMul() {
    return 1 + this.sum('dog', 'dogPower') + TRAIN.dog * this.trained('dog');
  }
  // 狼の噛む力も晩ごとに少しずつ強くなる（体力の伸びと同じ割合）
  private get bite() {
    return hpScale(this.wave + 1);
  }
  get maxHp() {
    return HERO.hp + this.sum('body', 'hp') + TRAIN.body * this.trained('body');
  }
  get comboLen() {
    return COMBO_BASE + this.sum('near', 'combo');
  }
  private get nearPower() {
    return 1 + this.sum('near', 'power') + TRAIN.near * this.trained('near');
  }
  private get farPower() {
    return 1 + this.sum('far', 'power') + TRAIN.far * this.trained('far');
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
  // wolfId：画面で狼の絵に触れたとき（view が絵の範囲で決める）。地面の位置から探すと、絵の上の方に触れたときに外れた
  tap(x: number, lane: number, wolfId = 0) {
    if (!this.canAct) return;
    const h = this.hero;
    let best: Wolf | undefined = wolfId ? this.wolves.find((w) => w.id === wolfId) : undefined;
    let bd = best ? -1 : Infinity;
    for (const w of this.wolves) {
      if (bd < 0) break;
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
      // 主人公の近く：触れた側を先に、いなければ反対側でも、届く狼を斬る
      const dir = (Math.sign(x - h.x) || h.facing) as 1 | -1;
      this.did.tap++;
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
    if ((h.move && !h.auto) || h.stun > 0) {
      this.holdWanted = true; // 技の途中なら、終わってから溜めに入る（押したのに何も起きない、をなくす）
      return;
    }
    this.holdWanted = false;
    h.move = null;
    h.order = null;
    h.charge = 0;
    this.sounds.push('charge');
  }

  // 溜め不足で離したら撃たずに 'short' を返す（指の操作ではタップとして扱う。ゆっくりめのタップが空振りにならないように）
  holdEnd(): 'fired' | 'short' | 'none' {
    const h = this.hero;
    if (this.holdWanted && h.charge < 0) {
      this.holdWanted = false;
      return 'short';
    }
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
    const inLunge = (w: Wolf) => Math.abs(w.lane - h.lane) <= 0.5 && this.gap(w) <= HERO.lunge;
    // 前の狼 → 後ろの狼 → 少し離れた狼（走って行く）。触れた手応えのない空振りは、まわりに狼がいないときだけ
    const t = target
      ?? this.nearest(this.wolves.filter((w) => (w.x - h.x) * facing >= -10 && inLunge(w)), h.x)
      ?? this.nearest(this.wolves.filter(inLunge), h.x)
      ?? (dir === undefined ? undefined : this.nearest(this.wolves.filter((w) => w.age > 0.4 && Math.abs(w.x - h.x) <= 320 && w.x <= HERO.maxX + 40), h.x));
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
    const stop = clamp(t.x - side * ((t.size + HERO.size) / 2 + 6), HERO.minX, HERO.maxX);
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

  // ── 昼：番犬の役目を決める（銭はかからない）──
  setRole(kind: DogKind, role: DogRole) {
    if (this.phase === 'wave') return;
    this.roles[kind] = role;
    this.sounds.push('buy');
  }
  cycleRole(kind: DogKind) {
    const i = DOG_ROLE_ORDER.indexOf(this.roles[kind]);
    this.setRole(kind, DOG_ROLE_ORDER[(i + 1) % DOG_ROLE_ORDER.length]);
  }
  // 番犬が晩の始めに立つ所（家の前）。昼の画面でもここに描く
  static dogHome(kind: DogKind) {
    const i = DOG_ORDER.indexOf(kind);
    return { x: HOUSE_X + 70 + i * 28, lane: [0.2, 0.55, 0.88][i] };
  }

  // ── 昼：体力・近接・主砲のどれかを1段上げる ──
  trackCost(t: Track): number {
    const n = TRACKS[t].perks.length;
    return this.levels[t] < n ? TRACK_COSTS[this.levels[t]] : TRAIN.cost(this.levels[t] - n);
  }

  nextPerk(t: Track): Perk {
    return TRACKS[t].perks[this.levels[t]] ?? { note: TRAIN_NOTE[t] };
  }

  // 家の修繕（昼）
  get repairCost() {
    return REPAIR.cost(this.wave);
  }
  canRepair() {
    return this.phase === 'shop' && this.houseHp < HOUSE_HP && this.coins >= this.repairCost;
  }
  repair() {
    if (!this.canRepair()) return false;
    this.coins -= this.repairCost;
    this.houseHp = Math.min(HOUSE_HP, this.houseHp + REPAIR.hp);
    this.sounds.push('buy');
    return true;
  }

  canBuy(t: Track) {
    const cost = this.trackCost(t);
    return this.phase === 'shop' && this.coins >= cost;
  }

  buy(t: Track) {
    if (!this.canBuy(t)) return false;
    this.coins -= this.trackCost(t);
    this.levels[t]++;
    this.sounds.push('buy');
    return true;
  }

  // 夜を迎える
  nextWave() {
    if (this.phase !== 'shop' || this.result !== 'playing') return false;
    this.startWave();
    return true;
  }

  private startWave() {
    this.mood = mood(this.wave + 1);
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
    for (const kind of DOG_ORDER) {
      const s = DOGS[kind];
      const home = Sim.dogHome(kind);
      // 番犬も晩ごとに鍛えられる（狼の硬さと同じ割合で、体力と噛む力が伸びる）
      this.dogs.push({ ...this.unit(home.x, s.hp * hpScale(this.wave + 1) * this.dogHpMul, s.size), lane: home.lane, kind, role: this.roles[kind], bite: 0, target: 0, down: 0, facing: 1, run: 0 });
    }
    this.events.push('night');
  }

  // ── 進行 ──
  advance(dt: number) {
    // 実時間を固定ステップに刻む。重い端末でも結果は変わらない
    // 晩の最後の1匹を倒したあとは少しのあいだスローに（2026-10-04 レビュー A6）
    this.acc += Math.min(dt, 0.25) * (this.finale > CHEER ? 0.3 : 1);
    while (this.acc >= STEP) {
      this.acc -= STEP;
      this.step(STEP);
    }
  }
  private acc = 0;
  finale = -1; // 晩の最後の1匹を倒してから昼になるまでの残り（初めはスロー、あとは決めポーズ）。-1 は始まっていない
  // 決めポーズに入ってからの秒（入っていなければ -1）
  get cheer() {
    return this.finale > 0 && this.finale <= CHEER ? CHEER - this.finale : -1;
  }
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
    // 踏み込み・追いかけ・桜嵐など、どの動きでも右端（裂け目の前）と家の前より外へは出ない
    this.hero.x = clamp(this.hero.x, HERO.minX, HERO.maxX);
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
      this.finale = FINALE + CHEER;
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
    this.holdWanted = false;
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
                this.hit(o, BODY.slamSplashDamage, { stop: 0, kb: 120 });
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
        const near = (heroUp && ahead > 0 && ahead <= SHOCKWAVE.range) || this.dogs.some((d) => d.down <= 0 && d.x < w.x && w.x - d.x <= SHOCKWAVE.range);
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
      const dog = this.dogs.find((d) => d.down <= 0 && d.x < w.x && w.x - d.x <= (w.size + d.size) / 2 && Math.abs(w.lane - d.lane) <= LANE_TOL && (blocked.get(d) ?? 0) < DOG_BLOCK);
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
      w.x -= s.speed * (w.hasted ? HOWL.speedMul : 1) * (this.mood === 'beni' ? 1.3 : 1) * dt;
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
      const dog = this.dogs.find((d) => d.down <= 0 && Math.abs(s.x - d.x) < d.size / 2 && Math.abs(s.lane - d.lane) <= LANE_TOL);
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

  // 番犬：役目に合わせて自分で狼を選び、走って行って噛む（2026-10-04 アマネさん）。
  //   守り＝家にいちばん近い狼／攻撃＝いちばん強い狼（体力の多い狼）／支援＝赤ずきんのまわりの狼。
  //   相手がいないときは、守りは家の前、ほかは赤ずきんの後ろについて行く。倒れたら家で休んで戻る
  private moveDogs(dt: number) {
    const h = this.hero;
    const live = this.wolves.filter((w) => w.age > 0.4 && w.x <= DOG_MAX_X + 60);
    for (const d of this.dogs) {
      const s = DOGS[d.kind];
      d.hitFlash = Math.max(0, d.hitFlash - dt);
      d.bite = Math.max(0, d.bite - dt);
      d.cooldown -= dt;
      const home = Sim.dogHome(d.kind);
      d.run = 0;
      if (d.down > 0) {
        d.down -= dt;
        d.x += clamp(home.x - d.x, -s.speed * 2 * dt, s.speed * 2 * dt);
        if (d.down <= 0) {
          d.down = 0;
          d.hp = d.maxHp;
          d.x = home.x;
          this.fx.push(this.mk({ kind: 'land', x: d.x, lane: d.lane, r: 30 }));
        }
        continue;
      }
      // 相手を選ぶ。追っている相手は、役目の上でよほど外れない限り追い続ける（目移りしてうろうろしない）
      let t = live.find((w) => w.id === d.target);
      const pick = (): Wolf | undefined => {
        if (!live.length) return undefined;
        if (d.role === 'guard') return live.reduce((a, b) => (b.x < a.x ? b : a));
        if (d.role === 'attack') return live.reduce((a, b) => (b.maxHp > a.maxHp || (b.maxHp === a.maxHp && Math.abs(b.x - d.x) < Math.abs(a.x - d.x)) ? b : a));
        if (h.down > 0) return undefined;
        const near = live.filter((w) => Math.abs(w.x - h.x) <= 240);
        return near.length ? near.reduce((a, b) => (Math.abs(b.x - h.x) + Math.abs(b.lane - h.lane) * 100 < Math.abs(a.x - h.x) + Math.abs(a.lane - h.lane) * 100 ? b : a)) : undefined;
      };
      const best = pick();
      if (!t || (best && best !== t && (d.role === 'guard' ? best.x < t.x - 80 : d.role === 'attack' ? best.maxHp > t.maxHp : Math.abs(t.x - h.x) > 260))) t = best;
      d.target = t?.id ?? 0;
      // 届く相手がいれば噛む（追っている相手が先。目の前に別の狼がいれば、そちらでもよい）
      const reach = (w: Wolf) => w.z <= 0 && Math.abs(w.lane - d.lane) <= LANE_TOL && Math.abs(w.x - d.x) <= (w.size + d.size) / 2 + 6;
      const bitee = t && reach(t) ? t : this.nearest(live.filter(reach), d.x);
      if (bitee) {
        d.facing = bitee.x >= d.x ? 1 : -1;
        if (d.cooldown <= 0) {
          d.cooldown = s.interval;
          d.bite = 0.2;
          this.hit(bitee, s.damage * hpScale(this.wave + 1) * this.dogPowerMul, { stop: 0, quiet: true });
        }
        if (bitee === t || !t) continue;
      }
      // 走って行く先：相手の手前（家の側から回り込む）。相手がいなければ持ち場へ
      let tx: number;
      let tl: number;
      if (t) {
        const side = t.x >= d.x ? -1 : 1;
        tx = t.x + side * ((t.size + d.size) / 2);
        tl = t.lane;
      } else if ((d.role === 'guard' && this.finale <= 0) || h.down > 0) {
        tx = home.x + 60;
        tl = home.lane;
      } else if (this.finale > 0) {
        // 晩の最後の1匹を倒したら、守りの犬も赤ずきんの前へ寄ってくる（なでてもらう）
        // 体に重ならず、しゃがんだ手が届く所。前に場所がなければ（右端・家の前）後ろに並ぶ
        const off = (HERO.size + d.size) / 2 + 40 + DOG_ORDER.indexOf(d.kind) * 50;
        const side = h.x + h.facing * off > DOG_MAX_X || h.x + h.facing * off < HOUSE_X + 20 ? -h.facing : h.facing;
        tx = h.x + side * off;
        tl = clamp(h.lane + (DOG_ORDER.indexOf(d.kind) - 1) * 0.12, 0, 1);
      } else {
        tx = h.x - h.facing * (50 + DOG_ORDER.indexOf(d.kind) * 25);
        tl = clamp(h.lane + (DOG_ORDER.indexOf(d.kind) - 1) * 0.3, 0, 1);
      }
      tx = clamp(tx, HOUSE_X + 20, DOG_MAX_X);
      const sp = s.speed * (1 + this.sum('dog', 'dogSpeed')) * (this.finale > 0 ? 2 : 1); // 晩の終わりは急いで駆け寄る
      const dx = clamp(tx - d.x, -sp * dt, sp * dt);
      if (Math.abs(tx - d.x) > 4) d.facing = tx > d.x ? 1 : -1;
      d.x += dx;
      d.run = Math.abs(dx) / dt;
      d.lane += clamp(tl - d.lane, -1.6 * dt, 1.6 * dt);
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
    if (this.holdWanted) return this.holdStart();
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
    const far = this.wolves.filter((w) => Math.abs(w.x - h.x) <= AUTO.bowRange * (this.mood === 'kiri' ? 0.55 : 1) && w.age > 0.6);
    // 家へ向かって主人公の後ろへ抜けた狼が先。いなければ前の近い狼
    const behind = far.filter((w) => w.x < h.x - 30);
    const t = (behind.length ? behind.reduce((a, b) => (b.x < a.x ? b : a)) : undefined)
      ?? this.nearest(far.filter((w) => (w.x - h.x) * h.facing > 0), h.x) ?? this.nearest(far, h.x);
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
      h.lane += (h.lungeLane - h.lane) * Math.min(1, dt * 32); // 奥行きを打つ前にそろえる（遅いと奥行きのずれた狼に当たらなかった）
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
      this.hit(w, m.damage * this.nearPower, { kb: m.kb!, lift: w.z > 0 ? 200 : 140, stop: m.stop, stun: DASH.stun });
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
      // 矢は狙った狼を追いかける（外れて地面に刺さるのが多かった）
      if (t) this.loose(t.x, t.lane, dmg, 0, false, t.id);
      return;
    }
    if (id === 'ame') {
      for (let i = 0; i < 8; i++) this.loose(h.dashTo + (this.rand() - 0.5) * 160, this.rand(), dmg, i * 0.04, true);
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
      if (Math.abs(w.lane - h.lane) > (w.id === h.moveTarget ? Math.max(laneTol, 0.6) : laneTol)) return false; // 狙った相手は少し奥行きがずれていても当てる
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
      for (const w of hits) this.hit(w, dmg * 0.7, { lift: 260, kb: 60, stop: 0.06 });
      this.fx.push(this.mk({ kind: 'pound', x: h.x + h.facing * 40, lane: h.lane, r: 120 }));
      this.sounds.push('slam');
      this.kick(m.shake ?? 0, 0);
      this.advanceCombo(id, hits.length > 0);
      return;
    }
    // 連撃は相手1匹に。範囲の技と主砲はまとめて
    const targets = area ? hits : [hits.find((w) => w.id === h.moveTarget) ?? hits[0]].filter((w): w is Wolf => !!w);
    for (const w of targets) {
      this.hit(w, dmg, { kb, lift: m.lift, slam: m.slam, stop: m.stop });
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
      // その場で竜巻：まわりの狼を吸い寄せ（奥行きも寄せる）、近い狼を巻き上げて斬る
      for (const w of this.wolves) {
        const d = Math.abs(w.x - h.x);
        if (d > OURAN.pull || w.age < 0.4) continue;
        w.x += (h.x + 30 - w.x) * 0.28;
        w.lane += (h.lane - w.lane) * 0.3;
        w.vx = 0;
        if (d <= OURAN.reach) this.hit(w, OURAN.damage * this.nearPower, { lift: 260, stop: 0.02 });
      }
      this.fx.push(this.mk({ kind: 'spin', x: h.x, lane: h.lane, r: OURAN.reach, big: true }));
      this.kick(4, h.facing);
    }
    if (h.ouran <= 0) {
      // 締め：主砲の全弾
      for (const w of this.wolves) {
        if (Math.abs(w.x - h.x) <= OURAN.finalArea) this.hit(w, OURAN.final * this.nearPower, { kb: 500, stop: 0 });
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
  private loose(toX: number, lane: number, damage: number, delay = 0, rain = false, target = 0) {
    const h = this.hero;
    const F = rain ? RAIN_FLIGHT : BOW_FLIGHT;
    const flight = F.base + Math.abs(toX - h.x) * F.perUnit;
    this.arrows.push({ fromX: h.x, fromLane: h.lane, toX, lane, t: -delay / flight, flight, damage, rain, target, pierce: rain ? 1 : BOW_FLIGHT.pierce, hits: [] });
    this.sounds.push('bow');
  }

  private flyArrows(dt: number) {
    this.arrows = this.arrows.filter((a) => {
      const before = a.t;
      a.t += dt / a.flight;
      if (!a.rain && a.t > 0) {
        // 狙った狼を追う（行き先を今の位置へ寄せる）
        const t = a.target ? this.wolves.find((w) => w.id === a.target) : undefined;
        if (t && !a.hits.includes(t.id)) {
          a.toX = t.x;
          a.lane = t.lane;
        }
        // 通り道の狼を貫く：前のコマから今のコマまでに矢が通った所にいる狼
        const x0 = a.fromX + (a.toX - a.fromX) * Math.max(0, before);
        const x1 = a.fromX + (a.toX - a.fromX) * Math.min(1, a.t);
        const lane = a.fromLane + (a.lane - a.fromLane) * Math.min(1, a.t);
        const lo = Math.min(x0, x1);
        const hi = Math.max(x0, x1);
        for (const w of this.wolves) {
          if (a.hits.includes(w.id) || w.age < 0.4 || w.z > 80 || Math.abs(w.lane - lane) > 0.35) continue;
          if (w.x + w.size / 2 < lo || w.x - w.size / 2 > hi) continue;
          a.hits.push(w.id);
          this.hit(w, a.damage * (1 - WOLVES[w.kind].arrowResist), { stop: 0, kb: 70, stun: 0.3 });
          this.fx.push(this.mk({ kind: 'arrowhit', x: w.x, lane: w.lane, z: w.z, n: w.id, dir: Math.sign(a.toX - a.fromX) || 1 }));
          if (a.hits.length >= a.pierce) return false;
        }
        if (a.t < 1) return true;
        if (!a.hits.length) this.fx.push(this.mk({ kind: 'miss', x: a.toX, lane: a.lane }));
        return false;
      }
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
          this.hit(w, s.damage * (1 - WOLVES[w.kind].arrowResist), { kb: 160, lift: 180, stop: 0 });
        }
      }
      this.fx.push(this.mk({ kind: 'blast', x: s.toX, lane: s.lane, r: s.area }));
      this.sounds.push('boom');
      this.kick(3, 0);
      return false;
    });
  }

  // ── 当てる ──
  // 弾く向きはいつも右（裂け目の側）。主人公との位置で向きを決めていたので、重なった狼が家の側へ飛ぶことがあった
  // （2026-10-04 アマネさん「ノックバックが左側に飛んでくときあるの困る」）
  private hit(w: Wolf, dmg: number, o: { kb?: number; lift?: number; slam?: boolean; stop?: number; quiet?: boolean; stun?: number }) {
    if (w.age < 0.4) return; // 裂け目から出てくる途中は当たらない
    if (o.kb) o = { ...o, kb: Math.abs(o.kb) };
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
    this.gauge = Math.min(100, this.gauge + n * (this.mood === 'sakura' ? 1.8 : 1));
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
      this.fx.push(this.mk({ kind: 'poof', x: w.x, lane: w.lane, z: w.z, r: w.size, n: b, dir: w.hitDir, wolf: w.kind }));
      return false;
    });
    // 番犬は消えずに倒れて、家で休んでから戻る
    for (const d of this.dogs) {
      if (d.hp > 0 || d.down > 0) continue;
      d.hp = 0;
      d.down = DOG_REVIVE * (1 - this.sum('dog', 'dogRevive'));
      d.target = 0;
      this.fx.push(this.mk({ kind: 'land', x: d.x, lane: d.lane, r: d.size }));
    }
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
