// 戦いの中身。描画を知らない。固定ステップで進め、同じ入力なら同じ結果になる。
// 指一本アクション（2026-10-04）：プレイヤーの指で技を出す。自動の攻撃はない（2026-10-05）。タップは持っている武器（ナイフ／弓）で攻撃。
// 奥行き（lane）がある：主人公も狼も奥行きを動き、離れた奥行きの相手は噛めない・斬れない。
import {
  BASIC, BODY, BOW, BOW_FLIGHT, KNIFE, RANGED, TAIYA, RAIN_FLIGHT, CHARGE, COMBO, COMBO_RESET, FINISHERS, COIN_START, DASH, DOG_BLOCK, DOG_DEFAULT_ROLES, DOG_MAX_X, DOG_ORDER, DOG_REVIVE, DOG_ROLE_ORDER, DOGS,
  BLAST, COLORS, CROW, KING, SHELL, WEAK_MUL, WMAN, WWOMAN, FIRST_WAVE_DELAY, GIRL_X, HERO, HOUSE_HP, HOUSE_X, HOWL, LANE_TOL, MOVE_CD, MOVES, OURAN, POUNCE, SPECIAL_ORDER, SPECIALS, STEER, STEP,
  DAYS_TO_CLEAR, HEAT, OLD_TRACK_COSTS, OLD_TRAIN_COST, SPECIAL_UPS, TAP_REACH, TRACK_ORDER, UP, WOLF_SPAWN_X, WOLVES, basicCost, dawnBonus, specialCost,
  type Beat, type DogKind, type DogRole, type Finisher, type MoveId, type Special, type Track, type UpId, type WolfColor, type WolfKind,
} from './config';
import { dogScale, hpScale, mood, newColors, night, SURGE_WARN, themeColors, type Mood } from './nights';

const PET_GAP = 45; // なでる犬の体の端から主人公の足もとまで（世界の単位。絵の手の届く所は view が合わせる）
const PET_STEP = 60; // 2匹目・3匹目はその後ろに並ぶ
const FINALE = 0.4; // 晩の最後の1匹のあとのスローの長さ（sim の秒。実時間ではこの約3倍）
const CHEER = 2.6;
const GREEN_SLEEP = 4; // 緑が倒れて寝ている秒
const GREEN_GAIN = 12; // 緑1匹から溜まる必殺技の上限（%） // スローが明けてから、決めポーズ→寄ってきた番犬をなでて昼になるまで（秒）。なでる分を足した（2026-10-04 かわいさ）

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
  color?: WolfColor; // 色の狼（config.ts の COLORS）
  lastSrc?: Special | 'sp'; // 最後に当たった武器（緑は必殺技で倒れたときだけ消える）
  sleep: number; // 緑：倒れて寝ている残り秒（寝ているあいだは sleepers に移す）
  zgain: number; // 緑：この1匹から溜まった必殺技（上限あり）
  summoned?: boolean; // 遠吠えに呼ばれた子狼（賞金なし）
  naps: number; // 緑が寝た回数（緑の大狼は2回まで。3回目で倒れる）
  mode: '' | 'wind' | 'rest' | 'leap' | 'land' | 'claw' | 'back' | 'cling' | 'fall' | 'kl' | 'lunge' | 'kr' | 'ks' | 'kw' | 'down' | 'turn'; // 人狼・カラス・狼王の動きの段
  modeT: number; // その段の残り秒
  clawN: number; // 人狼女：残りのひっかき
  seq?: Special[]; // 狼王：頭の上の印（当てる武器の順）
  markIdx?: number; // 狼王：いま光っている印
  markHp?: number; // 狼王：いまの印に当てた量
  toLane?: number; // 人狼女：跳んで下りる奥行き
  kBurst?: number; // 狼王：続けて吠える残りの回数（弓の印のあいだ）
  kdir?: number; // 狼王：攻める向き。人狼男：向いている向き（-1＝家の側）
  kHit?: boolean; // 狼王：この突進で当てた
}
// 狼王の遠吠えの波（地面を走る。跳んでよける）
export interface Wave { x: number; dir: number; lane: number; hit: boolean; dogs: number[]; house?: boolean } // house：家まで届く（狼王の体力が3割を切ってから）
// 番犬（3匹・自分で動く）。role は昼に決めた役目、target は追っている狼、down は倒れて休んでいる残り秒数
export interface Dog extends Unit { kind: DogKind; role: DogRole; bite: number; target: number; down: number; facing: 1 | -1; run: number } // run：走っている速さ（描画）
// 矢：target を追いかけ（少し曲がる）、通り道の狼を pierce 匹まで貫く（2026-10-04 アマネさん「弓矢もっと役に立たせたい」）
// sp：必殺技が出したもの（当てても必殺技は溜まらない）。fromZ：跳んだ高さから放つ。big：大きい矢・giant：奥行き全部を貫く大きな一本
// leg：狙った狼を抜けたあとの2本目の道（届く所 endX までまっすぐ。通り道の狼を貫く）
// full：貫いても弱まらない（桜の大矢）
export interface Arrow { full?: boolean; fromX: number; fromLane: number; toX: number; lane: number; t: number; flight: number; damage: number; rain: boolean; target: number; pierce: number; hits: number[]; sp?: boolean; fromZ?: number; big?: boolean; giant?: boolean; endX?: number; leg?: number }
// 主砲の撃ち込み：4連装の砲身から真っすぐ飛ぶ砲弾。通り道の狼を貫き、届く所まで行くと爆ぜる（t が負のあいだはまだ撃っていない）
// row：どの砲口から出たか（0〜3。2本の砲×上下2段。描画の高さ）
// slash：ナイフの締めから前へ飛ぶ斬撃（下段「締めで斬撃が前へ飛ぶ」。爆ぜずに消える）
export interface Shell { x: number; dir: number; t: number; lane: number; left: number; damage: number; area: number; hit: number[]; row: number; slash?: boolean }
export type FxKind = 'bark' | 'vent' | 'endure' | 'howl' | 'wake' | 'sunfade' | 'arrowhit' | 'blast' | 'poof' | 'slash' | 'miss' | 'num' | 'spin' | 'land' | 'spark' | 'dash' | 'pound' | 'muzzle' | 'full' | 'bite' | 'emerge' | 'beam';
export interface Fx {
  id: number;
  kind: FxKind;
  x: number; lane: number; t: number; r?: number; n?: number; z?: number; big?: boolean;
  dir?: number; // 向き（1 右・-1 左）
  x2?: number; // 突進の終わり・主砲の弾の行き先
  lane2?: number; // 主砲の弾の行き先の奥行き
  move?: MoveId;
  wolf?: WolfKind; // 倒した狼の種類（倒れる演出で絵を割る）
  color?: WolfColor; // 倒した狼・弱い武器で当てた数字の色
}

export type Result = 'playing' | 'won' | 'lost';
// lead：最初の晩の前／wave：夜（戦闘中）／shop：昼（鍛える・番犬の役目を決める。「夜を迎える」で進む）
export type Phase = 'lead' | 'wave' | 'shop';
// 画面の演出と主人公の吹き出しのための出来事（main が受け取って消す）
export type Sound = 'swing' | 'hit' | 'heavy' | 'slam' | 'boom' | 'bow' | 'hurt' | 'ouran' | 'horn' | 'buy' | 'dash' | 'charge' | 'full' | 'jump' | 'steam';
export type Event = 'overheat' | 'night' | 'finisher' | 'ouran' | 'hurt' | 'down' | 'revive' | 'dawn' | 'surge' | 'combo10' | 'combo30' | 'newface' | 'weak' | 'kingdown' | 'kingdie';

// v4（2026-10-05）：強化は 上段（basic・何回でも）と 下段（special・各3つ）の10個。武器の持ち替え（weapon）
export interface Save {
  v: 4; wave: number; coins: number; houseHp: number; basic: Record<Track, number>; special: Record<Track, number>; kills: number; bestCombo: number;
  roles: Record<DogKind, DogRole>; losses: number; weapon?: Weapon;
}
// v3 まで：体力・近接・主砲と弓・番犬の4本の段（levels）。読み込むとき、使った銭を返す
type OldSave = Omit<Save, 'v' | 'basic' | 'special' | 'roles' | 'losses' | 'weapon'> & { v: 1 | 2 | 3; levels: Record<string, number>; roles?: Record<DogKind, DogRole>; losses?: number };
export type Weapon = 'knife' | 'bow';

interface Spawner { kind: WolfKind; color?: WolfColor; left: number; interval: number; next: number; surge: boolean; warned: boolean }
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
  auto: boolean; // 自分で出していない技（連撃の手数を進めない）。2026-10-05 自動の攻撃はやめたので、いまは使わない
  step: number; // 連撃の何手目か
  down: number; // 倒れている残り秒数
  stun: number;
  iframes: number; // 無敵の残り（突進）
  jumps: number; // 着地までに跳んだ回数（2段ジャンプまで）
  armor: number; // ひるまない残り（噛まれてひるんだ直後。囲まれてひるみ続けて動けなくなるのを防ぐ）
  hitFlash: number;
  ouran: number; // 桜嵐（必殺技）の残り秒数
  special: Special; // 出している必殺技
  spT: number; // 必殺技が始まってからの秒
  spX: number; // 竜巻の場所（吸い寄せる先）
  spLane: number;
  spShot: number; // 連撃の何手目まで出したか
  spFire: number; // 主砲を撃った回数（描画の反動）
  facing0: 1 | -1; // 必殺技を始めたときの向き
  aimX: number; // 主砲を向ける先
  aimLane: number;
  aimId: number; // 乱れ撃ちで撃った狼（砲身をその狼へ向ける。0 は無し）
  ouranTick: number;
  facing: 1 | -1;
  order: { x: number; lane: number; target: number; sprint: boolean } | null; // 走って行く先（target は着いたら斬る狼）
  running: number; // 走っている速さ（描画の脚と土煙）
  charge: number; // 主砲の溜め（秒）。溜めていなければ -1
  heat: number; // 主砲の熱（0〜上限）。上限でオーバーヒート
  heatWait: number; // 最後に撃ってからの秒（HEAT.wait を過ぎると冷める）
  overheat: number; // オーバーヒートの残り秒（0 なら撃てる）
  beat: Beat | null; // 出している技が何の拍か（自動の技・締めは null）
  fin: Finisher | null; // 出している締め
  finMul: number; // 締めの威力の倍率（空中連舞は続く技にも）
  seq: MoveId[]; // 締めのあと自動で続く技（空中連舞：追い打ち×3 → 叩きつけ）
  follow: boolean; // seq で続いている技（拍に数えない）
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
  stats = { downs: 0, houseBite: 0, houseShock: 0, heroDmg: 0, summoned: 0 }; // 計測用（scripts/balance.mjs）
  nightEarned = 0;
  nightDowns = 0; // 今夜倒れた回数（続けて倒れるほど起き上がるのが遅い）
  downFor = HERO.reviveTime; // 今の倒れの長さ

  hero: Hero = {
    x: GIRL_X + 60, lane: 0.5, z: 0, vz: 0, hp: HERO.hp, move: null, moveT: 0, moveTarget: 0, dashTo: 0, lungeTo: null, lungeLane: 0.5,
    dashHit: [], jumps: 0, auto: false, step: 0, down: 0, stun: 0, iframes: 0, armor: 0, hitFlash: 0, ouran: 0, special: 'senbon', spT: 0, spX: 0, spLane: 0.5, spShot: -1, spFire: 0, facing0: 1, aimX: 0, aimLane: 0.5, aimId: 0, ouranTick: 0, facing: 1,
    order: null, running: 0, charge: -1, heat: 0, heatWait: 99, overheat: 0, beat: null, fin: null, finMul: 1, seq: [], follow: false,
  };
  gauges: Record<Special, number> = { senbon: 0, nagare: 0, midare: 0 }; // 必殺技3つのゲージ（0〜100）
  // いちばん溜まっているゲージ。代入すると3つとも（点検・撮影の台本が s.gauge=100 を使う）
  get gauge() {
    return Math.max(...SPECIAL_ORDER.map((k) => this.gauges[k]));
  }
  set gauge(v: number) {
    for (const k of SPECIAL_ORDER) this.gauges[k] = v;
  }
  combo = 0;
  // コンボ（4拍子）：打った拍・次の入力までの秒・連携数（切らさずに締めまで行った回数）・最後に決まった締め（画面に出す）
  beats: Beat[] = [];
  beatT = 0;
  chain = 0;
  finished = { name: '', grade: 0, chain: 0, n: 0 };
  private finGrade = 0; // 締めを出したときの格。締めが当たるまでに連撃が切れても（カラス・噛まれる）この格で出す
  nightHp = 1000; // 今夜の狼の体力の合計（必殺技の溜まり方の物差し）
  bestCombo = 0;
  sinceHit = 99;
  hitStop = 0;
  shake = 0;
  shakeDir = 0; // 揺れの向き（当てた向きへ押す）
  punch = 0; // 画面を一瞬寄せる（締めの一撃）
  events: Event[] = [];
  sounds: Sound[] = []; // 効果音（main が受け取って鳴らす）

  wolves: Wolf[] = [];
  sleepers: Wolf[] = []; // 緑：倒れて寝ている（狙われない・噛まない。4秒で起き上がる）
  newface: WolfColor | null = null; // 今夜の新顔が初めて出てきた（main が台詞を出す）
  weakSeen = new Set<WolfColor>(); // 弱い武器で初めて当てた色（main が「効いてる」と言う）
  private faced = new Set<WolfColor>();
  dogs: Dog[] = [];
  roles: Record<DogKind, DogRole> = { ...DOG_DEFAULT_ROLES }; // 番犬の役目（昼に決める）
  arrows: Arrow[] = [];
  shells: Shell[] = [];
  waves: Wave[] = [];
  fx: Fx[] = [];

  cds: Record<'kaiten' | 'tosshin' | 'ame' | 'hougeki', number> = { kaiten: 0, tosshin: 0, ame: 0, hougeki: 0 };
  basic: Record<Track, number> = { body: 0, knife: 0, cannon: 0, bow: 0, dog: 0 }; // 上段：買った回数
  special: Record<Track, number> = { body: 0, knife: 0, cannon: 0, bow: 0, dog: 0 }; // 下段：覚えた数（0〜3）
  weapon: Weapon = 'knife'; // 持っている武器（ボタンで持ち替え）
  private endured = false; // 下段「一晩に一度、倒れずに踏みとどまる」を今夜使った
  private repelT = 0; // 下段「噛まれるとまわりを弾き返す」の待ち
  private howlT = 0; // 下段「番犬が吠えて狼をすくませる」の待ち
  private dashSecond = false; // 下段「突進を2回続けて」：2回目を出せる
  private lastDash = -99;

  private spawners: Spawner[] = [];
  // まもなく裂け目から出てくる狼（画面の予告：裂け目の中で赤い目が開く）。next＝出てくるまでの秒
  get coming(): { kind: WolfKind; color?: WolfColor; next: number; i: number }[] {
    return this.spawners.flatMap((s, i) => (s.left > 0 && s.next < 1.2 ? [{ kind: s.kind, color: s.color, next: s.next, i }] : []));
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
      v: 4, wave: this.wave, coins: Math.floor(this.coins), houseHp: this.houseHp, basic: { ...this.basic }, special: { ...this.special }, kills: this.kills,
      bestCombo: this.bestCombo, roles: { ...this.roles }, losses: this.losses, weapon: this.weapon,
    };
  }

  static load(d: Save | OldSave, seed: number) {
    const s = new Sim(seed);
    s.wave = d.wave;
    s.coins = d.coins; // 前の版なら、このあと強化に使った銭を足す
    s.houseHp = d.houseHp;
    if (d.v === 4) {
      s.basic = { ...s.basic, ...d.basic };
      s.special = { ...s.special, ...d.special };
      if (d.weapon) s.weapon = d.weapon;
    } else {
      // 前の強化（4本の段）は作りが変わったので、使った銭を全部返して買い直してもらう（2026-10-05 アマネさん）
      for (const lv of Object.values(d.levels ?? {})) {
        for (let i = 0; i < lv; i++) s.coins += i < OLD_TRACK_COSTS.length ? OLD_TRACK_COSTS[i] : OLD_TRAIN_COST(i - OLD_TRACK_COSTS.length);
      }
    }
    s.kills = d.kills;
    s.bestCombo = d.bestCombo;
    s.losses = d.losses ?? 0;
    if (d.roles) s.roles = { ...s.roles, ...d.roles };
    s.phase = 'shop';
    s.hero.hp = s.maxHp;
    return s;
  }

  // 下段で覚えたか
  has(id: UpId) {
    for (const t of TRACK_ORDER) if (SPECIAL_UPS[t].slice(0, this.special[t]).some((u) => u.id === id)) return true;
    return false;
  }
  // 上段：攻撃力などの倍率（足し算で +10% ずつ）
  private boost(t: Track) {
    return 1 + BASIC[t].step * this.basic[t];
  }
  get dogHpMul() {
    return this.boost('dog');
  }
  get dogPowerMul() {
    return this.boost('dog');
  }
  // 狼の噛む力も晩ごとに少しずつ強くなる（体力の伸びと同じ割合）
  private get bite() {
    return hpScale(this.wave + 1);
  }
  get maxHp() {
    return HERO.hp + BASIC.body.step * this.basic.body;
  }
  // 下段「体力が3割を切ると攻撃力1.3倍」
  private get rageMul() {
    return this.has('rage') && this.hero.hp < this.maxHp * UP.rage.below ? UP.rage.mul : 1;
  }
  private get nearPower() {
    return this.boost('knife') * this.rageMul;
  }
  private get cannonPower() {
    return this.boost('cannon') * this.rageMul;
  }
  private get bowPower() {
    return this.boost('bow') * this.rageMul;
  }
  get bowRange() {
    return BOW.range * (this.has('longBow') ? UP.longBow : 1) * (this.mood === 'kiri' ? 0.55 : 1);
  }
  get chargeFull() {
    return CHARGE.full / (1 + (this.has('quick') ? UP.quick : 0));
  }
  get chargeMin() {
    return CHARGE.min / (1 + (this.has('quick') ? UP.quick : 0));
  }
  // 主砲の熱の上限（下段「熱の上限 +1」で 6）
  get heatMax() {
    return HEAT.max + (this.has('cool') ? 1 : 0);
  }
  // 番犬：最初は柴だけ。下段で秋田・土佐が仲間に
  get dogKinds(): DogKind[] {
    return DOG_ORDER.filter((k) => k === 'shiba' || this.has(k as UpId));
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
    const busy = h.stun > 0 || (h.move && !h.auto && !(cancel && h.move !== 'tosshin' && h.moveT >= MOVES[h.move].dur * 0.5));
    if (!busy) {
      if (h.move) h.move = null;
      act();
      return;
    }
    this.queued = { act, t: this.clock };
  }

  // 戦場のタップ（2026-10-05）：触った所にいちばん近い狼を、持っている武器で攻撃する。ナイフはその狼まで走って行って斬る、弓はその場から撃つ。
  // 近くに狼がいなければ、触った側へ空振り。地面をタップして走るのはやめた（移動ははじく・小さい地図。アマネさん「はじくのほうが直感的」）
  // wolfId：画面で狼の絵に触れたとき（view が絵の範囲で決める）。地面の位置から探すと、絵の上の方に触れたときに外れた
  tap(x: number, lane: number, wolfId = 0) {
    if (!this.canAct) return;
    const h = this.hero;
    let best: Wolf | undefined = wolfId ? this.wolves.find((w) => w.id === wolfId) : undefined;
    if (!best) {
      let bd = TAP_REACH;
      for (const w of this.wolves) {
        if (w.age < 0.4) continue;
        const d = Math.max(0, Math.abs(w.x - x) - w.size / 2) + Math.abs(w.lane - lane) * 140;
        if (d < bd) { bd = d; best = w; }
      }
    }
    const t = best;
    const dir = (Math.sign(x - h.x) || h.facing) as 1 | -1;
    if (this.weapon === 'bow') {
      this.did.bow++;
      return this.queue(() => this.shoot(t, x, dir));
    }
    this.did.tap++;
    if (t) return this.queue(() => this.attack(t));
    return this.queue(() => this.attack(undefined, dir));
  }

  // 武器の持ち替え（ナイフ⇔弓）。技の途中でもすぐ替わる（次のタップから）
  switchWeapon(w?: Weapon) {
    this.weapon = w ?? (this.weapon === 'knife' ? 'bow' : 'knife');
    this.sounds.push('buy');
  }

  // 弓：その場から撃つ。狙った狼が届かなければ、触った側の届くいちばん近い狼。それもいなければ触った所へ空撃ち。
  // 群れ（BOW.crowd 匹以上）を狙って、矢の雨を覚えていて使えるなら矢の雨
  private shoot(t: Wolf | undefined, x: number, dir: 1 | -1): boolean {
    const h = this.hero;
    const range = this.bowRange;
    const reach = (w: Wolf) => Math.abs(w.x - h.x) <= range && w.age >= 0.4;
    if (t && !reach(t)) t = undefined;
    t ??= this.nearest(this.wolves.filter((w) => reach(w) && (w.x - h.x) * dir >= -20), h.x);
    h.order = null;
    if (t) h.facing = t.x >= h.x ? 1 : -1;
    else h.facing = dir;
    if (t && this.has('ame') && this.cds.ame <= 0) {
      const n = this.wolves.filter((w) => reach(w) && Math.abs(w.x - t!.x) <= BOW.crowdSpan && Math.abs(w.lane - t!.lane) <= 0.6).length;
      if (n >= BOW.crowd) {
        this.startMove('ame', 0, t.x);
        return true;
      }
    }
    const fin = this.atFinish; // 4発目：桜の大矢
    this.startMove('bow', t?.id ?? 0, clamp(h.x + dir * Math.min(range, Math.abs(x - h.x) || range), HOUSE_X, WOLF_SPAWN_X));
    if (fin) this.startFinish('taiya');
    else h.beat = 'bow';
    return true;
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
      this.breakCombo();
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
    // オーバーヒート中は溜められない（連撃の締めの零距離主砲だけは熱を使わないので撃てる）
    if (h.overheat > 0 && !this.atFinish) {
      this.holdWanted = false;
      this.sounds.push('steam');
      return;
    }
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
    const fin = this.atFinish && c >= COMBO.reishiki; // 4発目：零距離主砲（短い溜めで満タンの主砲）
    if (c < this.chargeMin && !fin) return 'short';
    if (h.overheat > 0 && !fin) return 'none';
    h.stun = 0;
    const full = fin || c >= this.chargeFull;
    const t = this.nearest(this.wolves.filter((w) => Math.abs(w.lane - h.lane) <= 0.6), h.x);
    if (t) h.facing = t.x >= h.x ? 1 : -1;
    this.startMove('shiki', 0);
    if (fin) this.startFinish('reishiki');
    this.did.shiki++;
    h.dashTo = full ? 2 : 1; // 溜めの段（strike で使う）
    // 熱：半チャージ 0.5・満タン 1・零距離主砲 0。上限でオーバーヒート
    if (!fin) {
      h.heat += full ? HEAT.full : HEAT.half;
      h.heatWait = 0;
      if (h.heat >= this.heatMax - 1e-6) {
        h.heat = this.heatMax;
        h.overheat = HEAT.lock;
        this.events.push('overheat');
        // 下段「オーバーヒートでまわりを吹き飛ばす」：たまった熱を一気に吐き出す
        if (this.has('vent')) {
          for (const w of this.wolves) {
            if (Math.abs(w.x - h.x) <= UP.vent.r + w.size / 2 && Math.abs(w.lane - h.lane) <= 0.6) this.hit(w, UP.vent.damage * this.cannonPower, { kb: UP.vent.kb, lift: 320, stop: 0.08, stun: 0.6, src: 'midare' });
          }
          this.fx.push(this.mk({ kind: 'vent', x: h.x, lane: h.lane, r: UP.vent.r }));
          this.sounds.push('boom');
          this.kick(10, 0);
        }
        this.sounds.push('steam');
      }
    }
    return 'fired';
  }

  // 斬る：相手に踏み込んで連撃の次の手。遠ければ走って行ってから
  private attack(target?: Wolf, dir?: 1 | -1): boolean {
    const h = this.hero;
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
      this.tapMove(0);
      return true;
    }
    if (this.gap(t) > HERO.lunge) {
      // 遠い：走って行って、着いたら斬る
      h.order = { x: t.x, lane: t.lane, target: t.id, sprint: false };
      return true;
    }
    h.facing = t.x >= h.x ? 1 : -1;
    this.tapMove(t.id, t.z > 0);
    this.lunge(t);
    return true;
  }

  // タップの技：4発目なら一閃、それまでは斬り（宙の相手には追い打ち）
  private tapMove(target: number, air = false) {
    const h = this.hero;
    if (this.atFinish) {
      this.startMove('issen', target);
      this.startFinish('issen');
      return;
    }
    this.startMove(air ? 'air' : 'slash', target);
    h.beat = 'tap';
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
    const fin = this.atFinish; // 4発目：突き抜け（長く・強く・抜けるまで無敵。間を置かずに出せる）
    if (this.cds.tosshin > 0 && !fin) return false;
    if (this.clock - this.lastDash > DASH.cd) this.dashSecond = false; // しばらく空いたら1回目から
    this.lastDash = this.clock;
    h.facing = dir;
    h.order = null;
    this.startMove('tosshin', 0, clamp(h.x + dir * DASH.dist * (this.has('dashFar') ? UP.dashFar : 1) * (fin ? COMBO.tsuki : 1), HERO.minX, HERO.maxX));
    h.dashHit = [];
    // とまっているカラスを振りほどく
    for (const c of this.wolves) if (c.kind === 'crow' && c.mode === 'cling') this.hit(c, CROW.shake * this.nearPower, { kb: 450, lift: 260, stop: 0.04, stun: 0.6, src: 'senbon' });
    h.iframes = fin ? MOVES.tosshin.dur : DASH.iframes;
    if (fin) this.startFinish('tsuki');
    else h.beat = 'side';
    // 下段「突進を2回続けて出せる」：1回目のあとはすぐ2回目を出せる。2回目のあとはふつうの待ち
    if (this.has('dash2') && !fin) {
      this.dashSecond = !this.dashSecond;
      if (this.dashSecond) this.cds.tosshin = UP.dash2;
    }
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
    const fin = this.atFinish;
    this.startMove('launch', t?.id ?? 0);
    if (fin) {
      // 4発目：空中連舞。打ち上げたら、宙で追い打ち×3 → 叩きつけ（自動で続く）
      this.startFinish('renbu');
      h.seq = ['air', 'air', 'air', 'slam'];
    } else h.beat = 'up';
    // 一緒に跳ぶ。2段ジャンプまで（上へはじき続けると、どこまでも昇っていった）。3回目からは跳ばずに斬り上げだけ
    if (h.jumps < 2 || fin) {
      h.jumps++;
      h.vz = 640;
      h.z = Math.max(h.z, 0.01);
    }
    this.sounds.push('jump');
    return true;
  }

  private slam(): boolean {
    const h = this.hero;
    if (this.atFinish) {
      // 4発目：地割り。その場で地面を割って、まわりを丸く弾き飛ばす
      h.order = null;
      this.startMove('jiwari', 0);
      this.startFinish('jiwari');
      if (h.z > 0) h.vz = Math.min(h.vz, -600);
      return true;
    }
    // 宙の狼がいれば叩き落とす。いなければ地面を叩く（まわりを跳ね上げる）
    const t = this.nearest(this.wolves.filter((w) => w.z > 0 && !w.pouncing && Math.abs(w.lane - h.lane) <= 0.5 && this.gap(w) <= HERO.lunge + 40), h.x)
      ?? this.nearest(this.wolves.filter((w) => Math.abs(w.lane - h.lane) <= 0.5 && this.gap(w) <= HERO.lunge), h.x);
    h.order = null;
    if (t) {
      h.facing = t.x >= h.x ? 1 : -1;
      this.lunge(t);
    }
    this.startMove('slam', t?.id ?? 0);
    h.beat = 'down';
    if (h.z > 0) h.vz = Math.min(h.vz, -300);
    return true;
  }

  // sp を省くと、溜まっているどれか（千本桜→流れ矢→乱れ撃ちの順）
  canOuran(sp?: Special) {
    const ready = sp ? this.gauges[sp] >= 100 : this.gauge >= 100;
    return this.phase === 'wave' && ready && this.hero.down <= 0 && this.hero.ouran <= 0;
  }

  ouran(sp?: Special) {
    sp ??= SPECIAL_ORDER.find((k) => this.gauges[k] >= 100);
    if (!sp || !this.canOuran(sp)) return false;
    this.gauges[sp] = 0;
    this.breakCombo();
    const h = this.hero;
    h.special = sp;
    h.ouran = OURAN.time;
    h.ouranTick = 0;
    h.spT = 0;
    h.spX = h.x;
    h.spLane = h.lane;
    h.spShot = -1;
    h.facing0 = h.facing;
    h.order = null;
    h.lungeTo = null;
    this.hero.move = null;
    this.hero.charge = -1;
    // ひるみを消す（必殺技のあいだは減らないので、噛まれた直後に出すと最後まで >_< の絵になり、桜流れ矢で弓を持っていなかった）
    this.hero.stun = 0;
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

  // ── 昼：10個の強化。上段（basic）は何回でも、下段（special）は各3つを順に ──
  basicCost(t: Track): number {
    return basicCost(this.basic[t]);
  }
  // 下段の次の1つ（覚えきったら undefined）と値段
  nextUp(t: Track) {
    return SPECIAL_UPS[t][this.special[t]];
  }
  // 下段の値段：どの列でも、これまでに下段をいくつ買ったかで上がる（覚えきった列は買えない）
  specialCost(t: Track): number {
    if (this.special[t] >= SPECIAL_UPS[t].length) return Infinity;
    return specialCost(TRACK_ORDER.reduce((n, k) => n + this.special[k], 0));
  }

  canBuy(t: Track, row: 'basic' | 'special' = 'basic') {
    const cost = row === 'basic' ? this.basicCost(t) : this.specialCost(t);
    return this.phase === 'shop' && this.coins >= cost;
  }

  buy(t: Track, row: 'basic' | 'special' = 'basic') {
    if (!this.canBuy(t, row)) return false;
    this.coins -= row === 'basic' ? this.basicCost(t) : this.specialCost(t);
    this[row][t]++;
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
    const lines = night(this.wave + 1);
    this.nightHp = Math.max(1, lines.reduce((n, l) => n + l.count * WOLVES[l.kind].hp * (l.color ? COLORS[l.color].hp : 1), 0) * hpScale(this.wave + 1));
    this.faced.clear();
    this.sleepers = [];
    this.spawners = lines.map((l) => ({ kind: l.kind, color: l.color, left: l.count, interval: l.interval, next: l.delay, surge: !!l.surge, warned: false }));
    this.phase = 'wave';
    // 家と桜嵐のゲージは毎晩まっさらから（2026-10-06 アマネさん「毎回家はリセット。桜嵐ゲージもリセット」）
    this.houseHp = HOUSE_HP;
    for (const k of SPECIAL_ORDER) this.gauges[k] = 0;
    const h = this.hero;
    // 主砲の熱も毎晩0から（2026-10-06 アマネさん「加熱状態もクリアでリセット」）
    h.heat = 0;
    h.overheat = 0;
    h.heatWait = 99;
    h.hp = this.maxHp; // 昼のあいだに傷は癒える（案）
    h.down = 0;
    h.x = GIRL_X + 60;
    h.lane = 0.5;
    h.order = null;
    h.charge = -1;
    this.nightKills = 0;
    this.nightEarned = 0;
    this.nightDowns = 0;
    this.endured = false;
    this.howlT = UP.dogHowl.every;
    this.dogs = [];
    for (const kind of this.dogKinds) {
      const s = DOGS[kind];
      const home = Sim.dogHome(kind);
      // 番犬も晩ごとに少し鍛えられる（dogScale。狼より緩い。あとは昼の強化）
      this.dogs.push({ ...this.unit(home.x, s.hp * dogScale(this.wave + 1) * this.dogHpMul, s.size), lane: home.lane, kind, role: this.roles[kind], bite: 0, target: 0, down: 0, facing: 1, run: 0 });
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
  // 晩の終わりに番犬が並ぶ所（犬の id → 主人公のどちら側の何番目か）。晩の最後の1匹を倒した瞬間に決める
  private petPlan = new Map<number, { side: 1 | -1; slot: number }>();
  // いまなでてもらっている犬：決めポーズの1.5秒より後で、並ぶ所に着いた犬のうち、主人公に一番近い1匹
  get petting(): Dog | undefined {
    if (this.cheer < 1.5 || this.hero.down > 0) return undefined;
    return this.dogs
      .filter((d) => d.down <= 0 && this.petPlan.has(d.id) && Math.abs(d.x - this.petSpot(d)) < 6)
      .sort((a, b) => Math.abs(a.x - this.hero.x) - Math.abs(b.x - this.hero.x))[0];
  }
  private petSpot(d: Dog) {
    const p = this.petPlan.get(d.id)!;
    return clamp(this.hero.x + p.side * (PET_GAP + p.slot * PET_STEP + d.size / 2), HOUSE_X + 20, DOG_MAX_X);
  }
  // 決めポーズに入ってからの秒（入っていなければ -1）
  get cheer() {
    return this.finale > 0 && this.finale <= CHEER ? CHEER - this.finale : -1;
  }
  did = { tap: 0, dash: 0, launch: 0, slam: 0, shiki: 0, mini: 0, bow: 0 }; // 指で出した操作の回数（1晩目の「やってみよう」）

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
    // コンボの拍：技を出していない・溜めていない・狼へ走っていないあいだに window 秒あくと切れる
    const hh = this.hero;
    const waiting = !(hh.move && !hh.auto) && hh.charge < 0 && !(hh.order && hh.order.target) && hh.ouran <= 0; // 自動の斬り・弓は待っているうち
    if ((this.beats.length || this.chain) && waiting && (this.beatT += dt) > COMBO.window * (this.has('chain') ? UP.chain : 1)) this.breakCombo();
    for (const k of Object.keys(this.cds) as (keyof Sim['cds'])[]) this.cds[k] = Math.max(0, this.cds[k] - dt);

    this.runWaves(dt);
    this.moveWolves(dt);
    this.moveDogs(dt);
    this.runHero(dt);
    // 踏み込み・追いかけ・桜嵐など、どの動きでも右端（裂け目の前）と家の前より外へは出ない
    this.hero.x = clamp(this.hero.x, HERO.minX, HERO.maxX);
    this.flyArrows(dt);
    this.flyShells(dt);
    this.flyWaves(dt);
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
        const wolf = this.makeWolf(s.kind, WOLF_SPAWN_X, s.color);
        wolf.skillCd = s.kind === 'howler' ? HOWL.first : 1 + this.rand() * 2; // 遠吠えは出てすぐ1回吠える
        this.wolves.push(wolf);
        // 今夜の新顔が初めて出てきた
        if (s.color && !this.faced.has(s.color)) {
          this.faced.add(s.color);
          if (newColors(this.wave + 1).includes(s.color)) {
            this.newface = s.color;
            this.events.push('newface');
          }
        }
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
  debugSpawn(kind: WolfKind, x: number, lane: number, color?: WolfColor) {
    const wolf = this.makeWolf(kind, x, color);
    wolf.lane = lane;
    wolf.skillCd = 9;
    wolf.age = 1;
    this.wolves.push(wolf);
    return wolf;
  }

  private makeWolf(kind: WolfKind, x: number, color?: WolfColor): Wolf {
    const w = WOLVES[kind];
    const c = color ? COLORS[color] : undefined;
    return {
      ...this.unit(x, w.hp * hpScale(this.wave + 1) * (c?.hp ?? 1), w.size * (c?.size ?? 1)), kind, color, hasted: false,
      z: 0, vz: 0, vx: 0, stun: 0, slammed: false, pouncing: false, skillCd: 0, age: 0, hitDir: 0, sleep: 0, zgain: 0, naps: 0, mode: '', modeT: 0, clawN: 0,
    };
  }

  // 次に来る群れの予告：この晩にまだ出ていない狼を種類ごとに数える
  // 色の狼は色ごとに分けて数える
  pending(): { kind: WolfKind; color?: WolfColor; n: number }[] {
    const out: { kind: WolfKind; color?: WolfColor; n: number }[] = [];
    for (const s of this.spawners) {
      const o = out.find((e) => e.kind === s.kind && e.color === s.color);
      if (o) o.n += s.left;
      else out.push({ kind: s.kind, color: s.color, n: s.left });
    }
    return out;
  }

  // 晩の狼を全滅させたら昼へ。夜明けの銭が入り、家が少し直る
  private endWave() {
    // 緑（起き上がる）だけが残ったら、朝日で消えて夜が明ける
    if (this.spawners.length === 0 && (this.wolves.length || this.sleepers.length) && [...this.wolves, ...this.sleepers].every((w) => w.color === 'green')) {
      for (const w of [...this.wolves, ...this.sleepers]) this.fx.push(this.mk({ kind: 'sunfade', x: w.x, lane: w.lane, r: w.size, wolf: w.kind, color: w.color }));
      this.wolves = [];
      this.sleepers = [];
    }
    if (this.spawners.length > 0 || this.wolves.length > 0) {
      this.finale = -1;
      return;
    }
    // 最後の1匹：すぐ昼にせず、スローで見せてから。桜嵐の途中なら、締めまで見せてから（途中で決めポーズに瞬間移動していた）
    if (this.finale < 0 && this.hero.ouran > 0) return;
    if (this.finale < 0) {
      this.finale = FINALE + CHEER;
      this.punch = 1;
      // 番犬の並び方：いま犬がいる側（駆け寄ってくる側）に、近い順に並ぶ。主人公を追い越して向こう側へ回ると、
      // 背中を向けて止まり、なでる手と反対を向いた（2026-10-04 アマネさん「犬なでなでできてない」）。その側に場所がなければ反対側
      this.petPlan.clear();
      const h = this.hero;
      const up = this.dogs.filter((d) => d.down <= 0).sort((a, b) => Math.abs(a.x - h.x) - Math.abs(b.x - h.x));
      const count = { [1]: 0, [-1]: 0 } as Record<1 | -1, number>;
      for (const d of up) {
        let side: 1 | -1 = d.x >= h.x ? 1 : -1;
        const room = (sd: 1 | -1) => { const x = h.x + sd * (PET_GAP + count[sd] * PET_STEP + d.size); return x <= DOG_MAX_X && x >= HOUSE_X + 20; };
        if (!room(side)) side = side === 1 ? -1 : 1;
        this.petPlan.set(d.id, { side, slot: count[side]++ });
      }
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
    this.waves = [];
    this.sleepers = [];
    this.combo = 0;
    this.hero.move = null;
    this.hero.charge = -1;
    this.hero.order = null;
    this.hero.heat = 0; // 夜が明けたら主砲も冷める
    this.hero.overheat = 0;
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
      this.houseHp = HOUSE_HP; // 家は毎晩、元どおりに直る（修繕はやめた）
      this.events.push('dawn');
    }
  }

  // ── 狼 ──
  private moveWolves(dt: number) {
    // 緑：寝ているあいだは狙われず噛まない。4秒で起き上がる。必殺技を出しているあいだは近くの緑が起き上がる（桜でしか消えない）
    this.sleepers = this.sleepers.filter((w) => {
      w.sleep -= dt;
      w.hitFlash = Math.max(0, w.hitFlash - dt);
      if (w.sleep > 0 && !(this.hero.ouran > 0 && Math.abs(w.x - this.hero.x) < 600)) return true;
      w.sleep = 0;
      w.hp = w.maxHp;
      w.stun = 0.3;
      w.age = 0.4;
      this.wolves.push(w);
      this.fx.push(this.mk({ kind: 'wake', x: w.x, lane: w.lane, r: w.size }));
      return false;
    });
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

      if (w.kind === 'king' && this.runKing(w, dt)) continue;
      if (w.kind === 'crow' && this.runCrow(w, dt)) continue;
      // 体の動き：弾かれた勢い・打ち上げ・叩きつけ
      if (w.vx !== 0) {
        w.x = clamp(w.x + w.vx * dt, HOUSE_X + 10, WOLF_SPAWN_X);
        if (!w.pouncing) w.vx *= Math.max(0, 1 - BODY.friction * dt);
        if (Math.abs(w.vx) < 5) w.vx = 0;
      }
      if (w.z > 0 || w.vz > 0) {
        // 人狼女の跳び：宙にいるあいだに奥行きを少しずつ主人公の奥行きへ（前は跳んだ瞬間に移った。レビュー3）
        if (w.kind === 'wwoman' && w.mode === 'leap' && w.toLane !== undefined) w.lane += clamp(w.toLane - w.lane, -1.6 * dt, 1.6 * dt);
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
                this.hit(o, BODY.slamSplashDamage, { stop: 0, kb: 120, src: 'senbon' });
              }
            }
            this.kick(6, 0);
          } else {
            if (w.pouncing) {
              // 跳び越えの着地：主人公の上に落ちたら噛む
              w.pouncing = false;
              w.vx = 0;
              if (heroUp && Math.abs(w.x - h.x) <= (w.size + HERO.size) / 2 && Math.abs(w.lane - h.lane) <= LANE_TOL) this.hurtHero(POUNCE.damage * this.bite * this.biteMul(w));
            } else w.stun = Math.max(w.stun, 0.3); // 落ちたら起き上がるまで少し
            w.vz = 0;
            this.fx.push(this.mk({ kind: 'land', x: w.x, lane: w.lane, r: w.size }));
          }
        }
        continue; // 宙にいるあいだは何もできない
      }
      if (w.stun > 0) continue;

      const ahead = w.x - h.x; // 主人公より右（家と反対側）にいる距離

      // 奥行き：狼・鎧狼・大狼は主人公が近いと寄せてくる（子狼と遠吠えは寄せない＝すり抜けて家へ）。1匹ずつ少しずらして、取り囲むように
      if (heroUp && (w.kind === 'wolf' || w.kind === 'armored' || w.kind === 'alpha' || w.kind === 'wman' || w.kind === 'wwoman') && ahead > 0 && ahead < STEER.range) {
        const want = clamp(h.lane + ((w.id % 3) - 1) * 0.17, 0, 1);
        w.lane += clamp(want - w.lane, -STEER.speed * dt, STEER.speed * dt);
      }

      if (w.kind === 'wman' && this.runWman(w, dt)) continue;
      if (w.kind === 'wwoman' && this.runWwoman(w, dt)) continue;
      // 特性ごとの攻め方
      // 遠吠え：溜めて（skillCd が wind を切ってから0まで。そのあいだは動かない）吠え、裂け目から仲間を呼ぶ。
      // 出てすぐ1回、そのあとは歩いているあいだも居座ってからも interval 秒ごと（2026-10-05 アマネさん「すぐ倒されるのがなんだかな」。
      // 前は居座る所に着いてから3秒待ったので、歩いているうちに倒されて、ほとんど呼べなかった）
      if (w.kind === 'howler' && w.age > 0) {
        if (w.skillCd <= 0) {
          w.skillCd = HOWL.interval;
          this.fx.push(this.mk({ kind: 'howl', x: w.x, lane: w.lane, r: w.size }));
          if (this.wolves.length < HOWL.cap) {
            const calls = this.howlCalls();
            for (let i = 0; i < calls.length; i++) {
              const p = this.makeWolf(calls[i].kind, WOLF_SPAWN_X, calls[i].color);
              p.summoned = true;
              this.stats.summoned++;
              p.age = -0.15 * i;
              p.skillCd = 1 + this.rand() * 2;
              this.wolves.push(p);
              this.fx.push(this.mk({ kind: 'emerge', x: p.x, lane: p.lane }));
            }
          }
          this.sounds.push('horn');
        }
        if (w.skillCd <= HOWL.wind) continue; // 溜めているあいだは噛まない・動かない
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
      const dog = this.dogs.find((d) => d.down <= 0 && d.x < w.x && w.x - d.x <= (w.size + d.size) / 2 && Math.abs(w.lane - d.lane) <= LANE_TOL && (blocked.get(d) ?? 0) < DOG_BLOCK + (this.has('dogHold') ? 1 : 0));
      if (dog) blocked.set(dog, (blocked.get(dog) ?? 0) + 1);
      if (heroTouch || dog || w.x <= HOUSE_X + w.size / 2) {
        if (w.cooldown <= 0) {
          w.cooldown = s.interval;
          const bite = s.damage * this.bite * this.biteMul(w);
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
      w.x -= s.speed * (w.color ? COLORS[w.color].speed : 1) * dt;
    }
  }

  // 番犬：役目に合わせて自分で狼を選び、走って行って噛む（2026-10-04 アマネさん）。
  //   守り＝家にいちばん近い狼／攻撃＝いちばん強い狼（体力の多い狼）／支援＝赤ずきんのまわりの狼。
  //   相手がいないときは、守りは家の前、ほかは赤ずきんの後ろについて行く。倒れたら家で休んで戻る
  private moveDogs(dt: number) {
    const h = this.hero;
    // 下段「番犬が吠えて狼をすくませる」：ときどき、狼のいちばん近くにいる番犬が吠え、まわりの狼が止まる
    if (this.has('dogHowl') && (this.howlT -= dt) <= 0) {
      this.howlT = UP.dogHowl.every;
      let best: Dog | undefined;
      let bn = 0;
      for (const d of this.dogs) {
        if (d.down > 0) continue;
        const n = this.wolves.filter((w) => w.kind !== 'king' && Math.abs(w.x - d.x) <= UP.dogHowl.r).length;
        if (n > bn) { bn = n; best = d; }
      }
      if (best) {
        for (const w of this.wolves) if (w.kind !== 'king' && Math.abs(w.x - best.x) <= UP.dogHowl.r) w.stun = Math.max(w.stun, UP.dogHowl.stun);
        this.fx.push(this.mk({ kind: 'bark', x: best.x, lane: best.lane, r: UP.dogHowl.r }));
      } else this.howlT = 1;
    }
    const live = this.wolves.filter((w) => w.age > 0.4 && w.x <= DOG_MAX_X + 60 && w.kind !== 'king'); // 狼王は狙わない（手下の相手をする）
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
          this.hit(bitee, s.damage * dogScale(this.wave + 1) * this.dogPowerMul, { stop: 0, quiet: true });
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
      } else if (this.finale > 0 && this.petPlan.has(d.id)) {
        // 晩の最後の1匹を倒したら、守りの犬も赤ずきんのそばへ寄ってくる（なでてもらう）。着いたら主人公の方を向く
        const p = this.petPlan.get(d.id)!;
        tx = this.petSpot(d);
        tl = clamp(h.lane + (p.slot === 0 ? 0 : p.slot * 0.14 * p.side), 0, 1);
        if (Math.abs(tx - d.x) <= 4) {
          d.x = tx;
          d.facing = h.x >= d.x ? 1 : -1;
          d.lane += clamp(tl - d.lane, -1.6 * dt, 1.6 * dt);
          continue;
        }
      } else {
        tx = h.x - h.facing * (50 + DOG_ORDER.indexOf(d.kind) * 25);
        tl = clamp(h.lane + (DOG_ORDER.indexOf(d.kind) - 1) * 0.3, 0, 1);
      }
      tx = clamp(tx, HOUSE_X + 20, DOG_MAX_X);
      const sp = s.speed * (this.has('dogFast') ? UP.dogFast : 1) * (this.finale > 0 ? 2 : 1); // 晩の終わりは急いで駆け寄る
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
    const heavy = h.move === 'shiki' || h.move === 'slam' || h.move === 'kaiten' || !!h.fin || h.follow; // 締めの途中もひるまない
    if (h.armor <= 0 && h.charge < 0 && !(heavy && !h.auto)) {
      // 溜めているあいだと、指で出した大技（主砲・叩き落とし・回転斬り）のあいだはひるまない。
      // 斬りの連打はひるむ（2026-10-04 指の技すべてをひるまなくしたら、連打が最強になった）。
      // ひるむと技も溜めも途切れる。そのあと少しのあいだは、噛まれてもひるまない
      h.stun = HERO.hitStunTime;
      h.armor = this.has('tough') ? UP.tough : 0.7;
      this.breakCombo(); // ひるむとコンボが切れる
      h.move = null;
      h.charge = -1;
      h.lungeTo = null;
    }
    for (const k of SPECIAL_ORDER) this.gain(k, (OURAN.hurt * dmg) / this.maxHp);
    this.kick(3, 0);
    // 下段「噛まれるとまわりを弾き返す」
    if (this.has('repel') && this.clock >= this.repelT) {
      this.repelT = this.clock + UP.repel.cd;
      for (const w of this.wolves) {
        if (Math.abs(w.x - h.x) <= UP.repel.r + w.size / 2 && Math.abs(w.lane - h.lane) <= 0.6) this.hit(w, UP.repel.damage * this.nearPower, { kb: UP.repel.kb, lift: 200, stop: 0.04, stun: 0.5, src: 'senbon' });
      }
      this.fx.push(this.mk({ kind: 'pound', x: h.x, lane: h.lane, r: UP.repel.r }));
    }
    // 下段「一晩に一度、倒れずに踏みとどまる」
    if (h.hp <= 0 && this.has('endure') && !this.endured) {
      this.endured = true;
      h.hp = 1;
      h.iframes = 1.2;
      this.fx.push(this.mk({ kind: 'endure', x: h.x, lane: h.lane }));
      this.sounds.push('full');
    }
    if (h.hp <= 0) {
      h.hp = 0;
      h.down = this.downFor = Math.min(HERO.reviveMax, HERO.reviveTime + HERO.reviveMore * this.nightDowns) * (this.has('rise') ? UP.rise : 1);
      this.nightDowns++;
      this.stats.downs++;
      this.breakCombo();
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
    h.running = 0;
    // 主砲の熱：撃っている間は冷えない。最後に撃ってから HEAT.wait 秒で冷め始める。オーバーヒート中は lock 秒かけて 0 へ
    h.heatWait += dt;
    if (h.overheat > 0) {
      h.overheat = Math.max(0, h.overheat - dt);
      h.heat = (this.heatMax * h.overheat) / HEAT.lock;
    } else if (h.heatWait >= (this.has('coolFast') ? UP.coolWait : HEAT.wait)) h.heat = Math.max(0, h.heat - HEAT.rate * dt);
    if (this.has('regen') && h.down <= 0 && h.hp > 0) h.hp = Math.min(this.maxHp, h.hp + this.maxHp * UP.regen * dt);
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
      if (h.down < this.downFor - 0.6) h.x = Math.max(GIRL_X, h.x - 900 * dt); // 少し寝てから家の前へ下がる
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
    const speed = (o.sprint ? HERO.sprint : HERO.speed) * (this.clung ? CROW.slow : 1); // カラスにとまられると足が遅い
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

  private startMove(id: MoveId, targetId: number, at = 0, auto = false) {
    const h = this.hero;
    h.move = id;
    h.moveT = 0;
    h.moveTarget = targetId;
    h.dashTo = at;
    h.auto = auto;
    h.lungeTo = null;
    h.lungeLane = h.lane;
    h.step = this.beats.length; // 何拍目の技か（描画で動きを変える）
    h.beat = null;
    h.fin = null;
    h.finMul = 1;
    h.seq = [];
    h.follow = false;
    if (id in this.cds) this.cds[id as keyof Sim['cds']] = MOVE_CD[id as keyof typeof MOVE_CD];
  }

  // 技の中身。当てる瞬間は技の長さのちょうど半ば
  private runMove(dt: number) {
    const h = this.hero;
    const id = h.move!;
    const m = MOVES[id];
    const before = h.moveT;
    h.moveT += dt * (id === 'bow' && this.has('draw') ? 1 + UP.draw : 1);
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
      if (id === 'tosshin') this.landMove(h.dashHit.length > 0);
      if (h.seq.length) this.nextInSeq();
    }
  }

  // 空中連舞：打ち上げた狼を追って、宙で追い打ち → 叩きつけ
  private nextInSeq() {
    const h = this.hero;
    const t = this.wolves.find((w) => w.id === h.moveTarget);
    const [next, ...rest] = h.seq;
    const mul = h.finMul;
    if (!t) {
      h.seq = [];
      return;
    }
    this.startMove(next, t.id);
    h.finMul = mul;
    h.seq = rest;
    h.follow = true;
    h.facing = t.x >= h.x ? 1 : -1;
    this.lunge(t);
    if (next === 'air') {
      h.vz = Math.max(h.vz, 320);
      h.z = Math.max(h.z, 0.01);
    }
    if (next === 'slam') h.vz = Math.min(h.vz, -500);
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
      const fin = h.fin === 'tsuki';
      this.hit(w, (fin ? 26 : m.damage) * this.nearPower * h.finMul, { kb: fin ? 380 : m.kb!, lift: w.z > 0 ? 200 : fin ? 260 : 140, stop: fin ? 0.06 : m.stop, stun: fin ? 0.5 : DASH.stun, src: 'senbon' });
      this.fx.push(this.mk({ kind: 'slash', x: w.x, lane: w.lane, z: 0, move: 'tosshin', dir: h.facing }));
    }
  }

  private strike(id: MoveId) {
    const h = this.hero;
    const m = MOVES[id];
    const power = id === 'bow' || id === 'ame' ? this.bowPower : id === 'hougeki' || id === 'shiki' ? this.cannonPower : this.nearPower;
    let dmg = m.damage * power * h.finMul;
    if (id === 'tosshin') return;
    if (id === 'bow') {
      const t = h.moveTarget ? this.wolves.find((w) => w.id === h.moveTarget) : undefined;
      if (h.fin === 'taiya') {
        // 桜の大矢：同じ奥行きの狼を、届く所まで弱まらずに貫く大きな一本
        const dir = t ? Math.sign(t.x - h.x) || h.facing : (Math.sign(h.dashTo - h.x) || h.facing);
        this.loose(clamp(h.x + dir * this.bowRange, HOUSE_X, WOLF_SPAWN_X), h.lane, dmg * TAIYA.mul, 0, false, 0, TAIYA.pierce);
        const a = this.arrows[this.arrows.length - 1];
        a.big = true;
        a.full = true;
        a.flight = 0.28;
        a.endX = undefined;
        this.landMove(true);
        return;
      }
      // 矢は狙った狼を追いかける（外れて地面に刺さるのが多かった）。狙う狼がいなければ、触った側へ空撃ち
      if (t) this.loose(t.x, t.lane, dmg, 0, false, t.id);
      else this.loose(h.dashTo, h.lane, dmg);
      // 弓のコンボ：狙う狼がいれば拍に数える（空撃ちは切れる）
      this.landMove(!!t);
      // 下段「矢を2本ずつ放つ」：2本目は狙った狼のそばの別の狼へ（いなければ同じ狼へ、少し遅れて）
      if (this.has('twin')) {
        const range = this.bowRange;
        const o = t ? this.nearest(this.wolves.filter((w) => w !== t && w.age >= 0.4 && Math.abs(w.x - h.x) <= range && Math.abs(w.x - t.x) <= 260), t.x) : undefined;
        const u = o ?? t;
        if (u) this.loose(u.x, u.lane, dmg * UP.twin, o ? 0.03 : 0.08, false, u.id);
        else this.loose(h.dashTo, clamp(h.lane + 0.2, 0, 1), dmg * UP.twin, 0.05);
      }
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
      if (lvl < 2) dmg *= RANGED.halfMul; // 半チャージは弱め（熱あたりで満タンより得にならないように）
      if (lvl >= 2) {
        dmg *= RANGED.fullMul;
        area = m.area! * 1.5 * (this.has('bigBlast') ? UP.bigBlast : 1);
        kb *= 1.3;
        if (this.has('hougeki')) {
          // 4連装：2本の砲×上下2段の砲口から、同時に真っすぐ4発（2026-10-05 アマネさん「溜めてドンで真っ直ぐ」「4連装だから4発」
          // 「4連装で一斉なのにバラバラ」。前は群れへ山なりに落ちた・0.07秒ずつずれていた）
          for (let i = 0; i < 4; i++) {
            this.shells.push({ x: h.x + h.facing * 40, dir: h.facing, t: 0, lane: clamp(h.lane + (i - 1.5) * 0.05, 0, 1), left: SHELL.range, damage: MOVES.hougeki.damage * this.cannonPower, area: MOVES.hougeki.area!, hit: [], row: i });
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
      for (const w of hits) this.hit(w, dmg * 0.7, { lift: 260, kb: 60, stop: 0.06, src: 'senbon' });
      this.fx.push(this.mk({ kind: 'pound', x: h.x + h.facing * 40, lane: h.lane, r: 120 }));
      this.sounds.push('slam');
      this.kick(m.shake ?? 0, 0);
      this.landMove(hits.length > 0);
      return;
    }
    // 範囲の技と主砲はまとめて。ナイフの斬りは狙った1匹に加え、目の前の狼にもまとめて当たる（近い順に KNIFE.cleave 匹まで・少し弱く）。一閃は前の全部に
    const main = hits.find((w) => w.id === h.moveTarget) ?? hits[0];
    const near = (w: Wolf) => Math.abs(w.x - h.x);
    const extra = area || !main ? [] : hits.filter((w) => w !== main).sort((a, b) => near(a) - near(b)).slice(0, id === 'issen' ? 99 : KNIFE.cleave);
    const targets = area ? hits : main ? [main, ...extra] : [];
    for (const w of targets) {
      this.hit(w, dmg * (area || w === main || id === 'issen' ? 1 : KNIFE.mul), { kb, lift: m.lift, slam: m.slam, stop: m.stop, src: id === 'shiki' ? 'midare' : 'senbon' });
    }
    this.sounds.push(id === 'shiki' ? 'boom' : 'swing');
    if (id === 'kaiten') this.fx.push(this.mk({ kind: 'spin', x: h.x, lane: h.lane, r: area }));
    else if (id === 'jiwari') {
      this.fx.push(this.mk({ kind: 'pound', x: h.x, lane: h.lane, r: area, big: true }));
      this.fx.push(this.mk({ kind: 'land', x: h.x, lane: h.lane, r: area, big: true }));
      this.sounds.push('slam');
    }
    else if (id === 'shiki') this.fx.push(this.mk({ kind: 'blast', x: h.x + h.facing * area! * 0.5, lane: h.lane, r: area, big: (h.dashTo || 1) >= 2 }));
    else this.fx.push(this.mk({ kind: 'slash', x: h.x + h.facing * 50, lane: h.lane, z: h.z, move: id, dir: h.facing, big: targets.length > 0 }));
    if (m.shake && (targets.length || id === 'shiki' || id === 'jiwari')) this.kick(m.shake, h.facing);
    this.landMove(targets.length > 0);
  }

  // ── コンボ（4拍子）──
  // 技が当たったか外れたかで、拍を進める・締めを決める・切る。自動の技は数えない
  private landMove(landed: boolean) {
    const h = this.hero;
    if (h.auto || h.follow) return;
    if (h.fin) {
      const fin = h.fin;
      h.fin = null;
      if (!landed) {
        h.seq = [];
        return this.breakCombo();
      }
      this.chain++;
      // 下段「締めで斬撃が前へ飛ぶ」（主砲の締めは除く）
      if (this.has('slashWave') && fin !== 'reishiki') {
        const W = UP.slashWave;
        this.shells.push({ x: h.x + h.facing * 30, dir: h.facing, t: 0, lane: h.lane, left: W.range, damage: W.damage * this.nearPower * h.finMul, area: 0, hit: [], row: 0, slash: true });
      }
      this.finished = { name: FINISHERS[fin].name, grade: this.finGrade, chain: this.chain, n: this.finished.n + 1 };
      this.beats = [];
      this.beatT = 0;
      this.punch = Math.max(this.punch, 0.7);
      this.events.push('finisher');
      return;
    }
    if (!h.beat) return this.breakCombo(); // 拍に数えない技（ふつうの主砲）を挟んだら切れる
    if (!landed) return this.breakCombo();
    this.beats.push(h.beat);
    h.beat = null;
    this.beatT = 0;
  }

  breakCombo() {
    this.beats = [];
    this.chain = 0;
    this.beatT = 0;
  }

  // 1〜3発目に何種類混ぜたか → 格（0 並・1 上・2 極）
  // 拍が空でも 0（前は -1 になり、締めの最中に連撃が切れると画面の札が COMBO.grades[-1] を読んで止まった。27晩目のフリーズ）
  private gradeOf(beats: Beat[]) {
    return Math.max(0, Math.min(COMBO.grades.length, new Set(beats).size) - 1);
  }
  get atFinish() {
    return this.beats.length >= COMBO.beats;
  }
  // 締めを出す：格と近接の「締めの威力」で強くする
  private startFinish(fin: Finisher) {
    const h = this.hero;
    h.fin = fin;
    this.finGrade = this.gradeOf(this.beats);
    h.finMul = COMBO.grades[this.finGrade].mul * (this.has('finBig') ? UP.finBig : 1);
  }

  // 必殺技：桜の竜巻でまわりの狼を吸い寄せ（竜巻は斬らない）、主人公が体ごと暴れて（連撃）、最後に大きく決める（締め）
  private runOuran(dt: number) {
    const h = this.hero;
    const O = OURAN;
    const e0 = h.spT;
    h.ouran -= dt;
    h.spT += dt;
    const e = h.spT;
    h.ouranTick -= dt;
    if (h.ouranTick <= 0 && e < O.final) {
      h.ouranTick = O.tick;
      for (const w of this.wolves) {
        if (Math.abs(w.x - h.spX) > O.pull || w.age < 0.4) continue;
        w.x += (h.spX - w.x) * 0.28;
        w.lane += (h.spLane - w.lane) * 0.3;
        w.vx = 0;
      }
    }
    if (h.special === 'senbon') this.runSenbon(e0, e, dt);
    else if (h.special === 'midare') this.runMidare(e0, e);
    else this.runNagare(e0, e);
    if (e0 < O.final && e >= O.final) {
      this.hitStop = 0.22;
      this.kick(16, h.facing);
      this.punch = 1;
    }
    if (h.ouran <= 0) {
      h.ouran = 0;
      h.step = 0;
      h.z = Math.max(0, h.z);
    }
  }

  // 千本桜：ナイフを持って左右に駆け抜け、通り道の狼を全部斬る → 真ん中で回って、地面をダン
  private runSenbon(e0: number, e: number, dt: number) {
    const h = this.hero;
    const O = OURAN;
    const D = O.dash;
    const lo = Math.max(HERO.minX, h.spX - D.span);
    const hi = Math.min(HERO.maxX, h.spX + D.span);
    const LANES = [0.5, 0.2, 0.8, 0.35, 0.65];
    const before = h.x;
    if (e >= O.rush && e < O.wind) {
      const per = (O.wind - O.rush) / D.passes;
      const i = Math.floor((e - O.rush) / per);
      const p = Math.min(1, ((e - O.rush) % per) / (per * 0.75)); // 片道の4分の3で駆け抜け、残りは止まる
      const dir = (i % 2 === 0 ? h.facing0 : -h.facing0) as 1 | -1;
      const from = i === 0 ? h.spX : dir > 0 ? lo : hi;
      const to = dir > 0 ? hi : lo;
      if (i !== h.spShot) {
        h.spShot = i;
        h.dashHit = [];
        this.sounds.push('dash');
        this.fx.push(this.mk({ kind: 'dash', x: from, lane: h.lane, x2: to, dir }));
      }
      h.facing = dir;
      h.x = from + (to - from) * (1 - (1 - p) * (1 - p));
      const lane0 = i === 0 ? h.spLane : LANES[(i - 1) % LANES.length];
      h.lane = lane0 + (LANES[i % LANES.length] - lane0) * p;
      h.running = p < 1 ? 2 : 0;
      const a = Math.min(before, h.x) - 30;
      const b = Math.max(before, h.x) + 30;
      for (const w of this.wolves) {
        if (h.dashHit.includes(w.id) || w.x < a || w.x > b || Math.abs(w.lane - h.lane) > 0.5) continue;
        h.dashHit.push(w.id);
        this.hit(w, D.damage * this.nearPower, { kb: 60, lift: 120, stop: 0.03, stun: 0.5, src: 'sp' });
        this.fx.push(this.mk({ kind: 'slash', x: w.x, lane: w.lane, z: 0, move: 'tosshin', dir, big: true }));
      }
    } else if (e >= O.wind && e < O.final) {
      // 真ん中へ戻って、回る
      h.x += (h.spX - h.x) * Math.min(1, dt * 18);
      h.lane += (h.spLane - h.lane) * Math.min(1, dt * 18);
      h.facing = h.facing0;
      if (e0 < O.wind) this.sounds.push('swing');
    }
    if (e0 < O.final && e >= O.final) {
      // ダン：まわりの狼を全部弾き飛ばす
      for (const w of this.wolves) {
        if (Math.abs(w.x - h.x) <= D.finalArea) this.hit(w, D.final * this.nearPower, { kb: 650, lift: 420, stop: 0, stun: 0.6, src: 'sp' });
      }
      this.fx.push(this.mk({ kind: 'pound', x: h.x, lane: h.lane, r: D.finalArea, big: true }));
      this.fx.push(this.mk({ kind: 'spin', x: h.x, lane: h.lane, r: D.finalArea * 0.7, big: true }));
      this.fx.push(this.mk({ kind: 'land', x: h.x, lane: h.lane, r: D.finalArea * 0.5, big: true }));
      this.sounds.push('slam', 'boom');
    }
  }

  // 主砲乱れ撃ち：まわりの狼へ次々に撃つ（まっすぐ一瞬で届く）→ 溜めて、前へ極太の一発
  private runMidare(e0: number, e: number) {
    const h = this.hero;
    const O = OURAN;
    const B = O.barrage;
    if (e >= O.rush && e < O.wind) {
      const n = Math.floor((e - O.rush) / B.interval);
      if (n !== h.spShot) {
        h.spShot = n;
        const list = this.wolves.filter((w) => w.age >= 0.4 && Math.abs(w.x - h.x) <= B.reach).sort((a, b) => a.x - b.x);
        const t = list.length ? list[(n * 7) % list.length] : undefined;
        const tx = t ? t.x : h.x + h.facing * (120 + this.rand() * 300);
        const tl = t ? t.lane : this.rand();
        if (Math.abs(tx - h.x) > 20) h.facing = tx > h.x ? 1 : -1;
        h.aimX = tx;
        h.aimLane = tl;
        h.aimId = t?.id ?? 0;
        h.spFire++;
        for (const w of this.wolves) {
          if (w.age >= 0.4 && Math.abs(w.x - tx) <= B.area + w.size / 2 && Math.abs(w.lane - tl) <= 0.35) {
            this.hit(w, B.damage * this.cannonPower, { kb: 90, lift: 90, stop: 0.015, stun: 0.4, src: 'sp' });
          }
        }
        this.fx.push(this.mk({ kind: 'beam', x: h.x, lane: h.lane, x2: tx, lane2: tl, n: t?.id ?? 0 }));
        this.fx.push(this.mk({ kind: 'spark', x: tx, lane: tl, z: 0, big: n % 3 === 0, dir: h.facing }));
        if (n % 2 === 0) this.sounds.push('boom');
        this.kick(3, h.facing);
      }
    } else if (e >= O.wind && e < O.final) {
      // 溜め：群れの多いほうへ向き直り、光を集める
      if (e0 < O.wind) {
        const right = this.wolves.filter((w) => w.x > h.x).length;
        h.facing = right * 2 >= this.wolves.length ? 1 : -1;
        h.aimX = h.x + h.facing * 300;
        h.aimLane = h.lane;
        h.aimId = 0;
        this.sounds.push('charge');
        this.fx.push(this.mk({ kind: 'full', x: h.x, lane: h.lane }));
      }
    }
    if (e0 < O.final && e >= O.final) {
      // ズドン：前へ、奥行き全部を貫く
      for (const w of this.wolves) {
        const d = (w.x - h.x) * h.facing;
        if (d >= -40 && d <= B.range) this.hit(w, B.final * this.cannonPower, { kb: 700, lift: 300, stop: 0, stun: 0.6, src: 'sp' });
      }
      h.spFire++;
      this.fx.push(this.mk({ kind: 'beam', x: h.x, lane: h.lane, x2: h.x + h.facing * B.range, lane2: h.lane, big: true }));
      this.fx.push(this.mk({ kind: 'muzzle', x: h.x + h.facing * 40, lane: h.lane, dir: h.facing, big: true }));
      for (let i = 1; i <= 3; i++) this.fx.push(this.mk({ kind: 'blast', x: h.x + h.facing * B.range * (i / 3.5), lane: h.lane, r: 90, big: i === 2 }));
      this.sounds.push('boom');
    }
  }

  // 桜流れ矢：高く跳んで、下の狼へ矢を撃ち下ろす → 着地して、画面の端まで貫く大きな一本
  private runNagare(e0: number, e: number) {
    const h = this.hero;
    const O = OURAN;
    const R = O.rain;
    h.vz = 0;
    const up = e < O.rush ? 0 : e < O.rush + 0.2 ? (e - O.rush) / 0.2 : e < O.wind ? 1 : e < O.wind + 0.15 ? 1 - (e - O.wind) / 0.15 : 0;
    h.z = R.height * (1 - (1 - up) * (1 - up));
    if (e0 < O.rush && e >= O.rush) this.sounds.push('jump');
    if (e >= O.rush + 0.15 && e < O.wind) {
      const n = Math.floor((e - O.rush - 0.15) / R.interval);
      if (n !== h.spShot) {
        h.spShot = n;
        const list = this.wolves.filter((w) => w.age >= 0.4 && Math.abs(w.x - h.x) <= R.reach).sort((a, b) => a.x - b.x);
        const t = list.length ? list[(n * 5) % list.length] : undefined;
        if (t && Math.abs(t.x - h.x) > 20) h.facing = t.x > h.x ? 1 : -1;
        const tx = t ? t.x : h.x + h.facing * (80 + this.rand() * 300);
        this.loose(tx, t ? t.lane : this.rand(), R.damage * this.bowPower, 0, false, t?.id ?? 0, 2, true);
        this.arrows[this.arrows.length - 1].fromZ = h.z;
        this.arrows[this.arrows.length - 1].big = true;
      }
    } else if (e >= O.wind && e < O.final && e0 < O.wind + 0.15 && e >= O.wind + 0.15) {
      this.fx.push(this.mk({ kind: 'land', x: h.x, lane: h.lane, r: 60, big: true }));
      const right = this.wolves.filter((w) => w.x > h.x).length;
      h.facing = right * 2 >= this.wolves.length ? 1 : -1;
      this.sounds.push('charge');
      this.fx.push(this.mk({ kind: 'full', x: h.x, lane: h.lane }));
    }
    if (e0 < O.final && e >= O.final) {
      // 大きな一本：奥行き全部を、画面の端まで貫く
      this.loose(h.x + h.facing * R.range, h.lane, R.final * this.bowPower, 0, false, 0, 999, true);
      const a = this.arrows[this.arrows.length - 1];
      a.giant = true;
      a.flight = 0.3;
      this.fx.push(this.mk({ kind: 'muzzle', x: h.x + h.facing * 40, lane: h.lane, dir: h.facing, big: true }));
    }
  }

  // ── 飛び道具 ──
  private loose(toX: number, lane: number, damage: number, delay = 0, rain = false, target = 0, pierce = rain ? 1 : BOW_FLIGHT.pierce + (this.has('pierce') ? UP.pierce : 0), sp = false) {
    const h = this.hero;
    const F = rain ? RAIN_FLIGHT : BOW_FLIGHT;
    const flight = F.base + Math.abs(toX - h.x) * F.perUnit;
    const endX = rain || sp ? undefined : clamp(h.x + (Math.sign(toX - h.x) || h.facing) * this.bowRange, HOUSE_X, WOLF_SPAWN_X);
    this.arrows.push({ fromX: h.x, fromLane: h.lane, toX, lane, t: -delay / flight, flight, damage, rain, target, pierce, hits: [], sp, endX });
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
          if (a.hits.includes(w.id) || w.age < 0.4 || w.z > (a.giant ? 400 : 80) || (!a.giant && Math.abs(w.lane - lane) > 0.35)) continue;
          if (w.x + w.size / 2 < lo || w.x - w.size / 2 > hi) continue;
          a.hits.push(w.id);
          const first = a.hits.length === 1 || a.giant || a.sp || a.full || this.has('pierce'); // 2匹目からは弱く（必殺技の矢・下段「貫く数+2」を覚えたらそのまま）
          this.hit(w, a.damage * (first ? 1 : RANGED.pierceMul) * (a.giant ? 1 : 1 - WOLVES[w.kind].arrowResist), { stop: 0, kb: a.giant ? 650 : 70, lift: a.giant ? 300 : 0, stun: a.giant ? 0.6 : this.has('stagger') && !a.sp ? UP.stagger : 0.3, src: a.sp ? 'sp' : 'nagare' });
          this.fx.push(this.mk({ kind: 'arrowhit', x: w.x, lane: w.lane, z: w.z, n: w.id, dir: Math.sign(a.toX - a.fromX) || 1, big: a.sp }));
          if (a.hits.length >= a.pierce) return false;
        }
        if (a.t < 1) return true;
        // 狙った狼を抜けて、届く所までまっすぐ飛び続ける（貫く数が残っていれば。前は狙った狼の所で消え、後ろの狼に「貫く」が効かなかった）
        const rest = a.endX !== undefined && !a.leg ? (a.endX - a.toX) * Math.sign(a.toX - a.fromX || 1) : 0;
        if (rest > 30 && a.hits.length < a.pierce) {
          const dir = Math.sign(a.toX - a.fromX) || 1;
          a.leg = 1;
          a.fromX = a.toX;
          a.fromLane = a.lane;
          a.toX = a.toX + dir * rest;
          a.target = 0;
          a.t = 0;
          a.flight = Math.max(0.05, rest * BOW_FLIGHT.perUnit * 1.3);
          return true;
        }
        if (!a.hits.length) this.fx.push(this.mk({ kind: 'miss', x: a.toX, lane: a.lane }));
        return false;
      }
      if (a.t < 1) return true;
      const near = this.wolves.filter((w) => Math.abs(w.x - a.toX) <= BOW_FLIGHT.hitRadius + w.size / 2 && Math.abs(w.lane - a.lane) <= 0.4);
      const t = this.nearest(near, a.toX);
      if (t) this.hit(t, a.damage * (1 - WOLVES[t.kind].arrowResist), { stop: 0, kb: 30, src: a.sp ? 'sp' : 'nagare' });
      else this.fx.push(this.mk({ kind: 'miss', x: a.toX, lane: a.lane }));
      return false;
    });
  }

  private flyShells(dt: number) {
    this.shells = this.shells.filter((s) => {
      const was = s.t;
      s.t += dt;
      if (s.t < 0) return true;
      if (was < 0) this.sounds.push('boom'); // 撃った
      const step = (s.slash ? UP.slashWave.speed : SHELL.speed) * dt;
      s.x += s.dir * step;
      s.left -= step;
      // 通り道の狼を貫く（1発で同じ狼には1回）
      for (const w of this.wolves) {
        if (s.hit.includes(w.id) || w.hp <= 0 || Math.abs(w.x - s.x) > w.size / 2 + 16 || Math.abs(w.lane - s.lane) > 0.32 || w.z > 120) continue;
        s.hit.push(w.id);
        if (s.slash) this.hit(w, s.damage, { kb: 260, lift: 120, stop: 0.03, stun: 0.4, src: 'senbon' });
        else this.hit(w, s.damage * SHELL.pierce * (1 - WOLVES[w.kind].arrowResist), { kb: 140, lift: 60, stop: 0.02, src: 'midare' });
      }
      if (s.left > 0 && s.x > HOUSE_X && s.x < WOLF_SPAWN_X) return true;
      if (s.slash) return false; // 斬撃は届く所で消える
      // 届く所まで行ったら爆ぜる
      for (const w of this.wolves) {
        if (w.hp > 0 && Math.abs(w.x - s.x) <= s.area + w.size / 2 && Math.abs(w.lane - s.lane) <= 0.5) this.hit(w, s.damage * (1 - WOLVES[w.kind].arrowResist), { kb: 160, lift: 180, stop: 0, src: 'midare' });
      }
      this.fx.push(this.mk({ kind: 'blast', x: s.x, lane: s.lane, r: s.area }));
      this.sounds.push('boom');
      this.kick(3, 0);
      return false;
    });
  }

  // ── 当てる ──
  // 弾く向きはいつも右（裂け目の側）。主人公との位置で向きを決めていたので、重なった狼が家の側へ飛ぶことがあった
  // （2026-10-04 アマネさん「ノックバックが左側に飛んでくときあるの困る」）
  // src：どの必殺技のゲージが溜まるか（sp は必殺技そのもの＝溜まらない）
  private hit(w: Wolf, dmg: number, o: { kb?: number; lift?: number; slam?: boolean; stop?: number; quiet?: boolean; stun?: number; src?: Special | 'sp' }) {
    if (w.age < 0.4) return; // 裂け目から出てくる途中は当たらない
    if (w.kind === 'king') {
      dmg = this.kingHit(w, dmg, o);
      o = { ...o, kb: 0, lift: 0, slam: false, stun: 0 };
    }
    if (o.kb) o = { ...o, kb: Math.abs(o.kb) };
    // 弱い武器で当てると2倍（色の狼の頭の上の印）
    // 必殺技も武器の種類で数える（千本桜＝ナイフ・流れ矢＝弓・乱れ撃ち＝主砲）。緑はどの必殺技でも
    const wk = w.color ? COLORS[w.color].weak : null;
    const weapon = o.src === 'sp' && wk !== 'sp' ? this.hero.special : o.src;
    const weak = !!wk && !o.quiet && wk === weapon;
    if (weak) {
      dmg *= WEAK_MUL;
      if (!this.weakSeen.has(w.color!)) {
        this.weakSeen.add(w.color!);
        this.events.push('weak');
      }
    }
    if (o.src) w.lastSrc = o.src;
    else if (o.quiet) w.lastSrc = undefined;
    const light = 1 - (WOLVES[w.kind].heavy ?? 0);
    this.hurt(w, dmg);
    // 下段「斬ると体力が戻る」：ナイフで当てるたび
    if (o.src === 'senbon' && !o.quiet && this.hero.down <= 0 && this.has('drain')) this.hero.hp = Math.min(this.maxHp, this.hero.hp + this.maxHp * UP.drain);
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
    let stun = o.stun ?? 0.25;
    if (w.kind === 'wman') {
      // 人狼男はふつうの斬りではひるまない。振りかぶりの間に重い一撃を当てると、大振りが止まる
      const heavyHit = (o.stop ?? 0) >= 0.06 || !!o.slam || (o.kb ?? 0) >= 300 || (o.lift ?? 0) >= 250 || o.src === 'midare' || o.src === 'sp';
      stun = heavyHit ? 0.3 : 0;
      if (heavyHit && w.mode === 'wind') {
        w.mode = 'rest';
        w.modeT = WMAN.broken;
        stun = WMAN.stun;
        this.fx.push(this.mk({ kind: 'full', x: w.x, lane: w.lane }));
        this.sounds.push('heavy');
      }
    }
    if (w.kind === 'crow' && (o.kb || o.lift || w.mode === 'cling')) {
      w.mode = 'fall'; // 叩かれたカラスは落ちる
      w.z = Math.max(w.z, 0.01);
    }
    if (w.kind !== 'king') w.stun = Math.max(w.stun, stun);
    const big = dmg >= 30;
    this.fx.push(this.mk({ kind: 'num', x: w.x, lane: w.lane, n: Math.round(dmg), z: w.z, big: big || weak, color: weak ? w.color : undefined }));
    if (o.quiet) return; // 番犬の噛みつきはコンボに数えない
    this.fx.push(this.mk({ kind: 'spark', x: w.x, lane: w.lane, z: w.z, big: big || !!o.slam, dir: w.hitDir || this.hero.facing }));
    this.sounds.push(o.slam || (o.stop ?? 0) >= 0.08 ? 'heavy' : 'hit');
    this.combo++;
    if (this.combo === 10) this.events.push('combo10');
    if (this.combo === 30) this.events.push('combo30');
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    this.sinceHit = 0;
    if (o.src && o.src !== 'sp' && !w.summoned) { // 遠吠えに呼ばれた子狼では溜まらない（呼ばせて溜め放題にしない）
      let n = (100 * dmg) / (this.nightHp * SPECIALS[o.src].share);
      // 緑は叩き続ければ溜まる（詰まない理由）。ただし溜め放題にならないよう1匹から溜まる量に上限
      if (w.color === 'green') {
        n = Math.max(0, Math.min(n, GREEN_GAIN - w.zgain));
        w.zgain += n;
      }
      this.gain(o.src, n);
    }
    if (o.stop) this.hitStop = Math.max(this.hitStop, o.stop);
  }

  // ── 狼王 ──
  private kingPhase(w: Wolf) {
    const k = w.hp / w.maxHp;
    return k > 0.66 ? 0 : k > 0.33 ? 1 : 2;
  }

  // 新しい印の並び（同じ武器は続けない）
  private newSeq(w: Wolf) {
    const n = KING.marks[this.kingPhase(w)];
    const seq: Special[] = [];
    for (let i = 0; i < n; i++) {
      const opts = SPECIAL_ORDER.filter((k) => k !== seq[i - 1]);
      seq.push(opts[Math.floor(this.rand() * opts.length)]);
    }
    w.seq = seq;
    w.markIdx = 0;
    w.markHp = 0;
  }

  // 狼王に当てた：光っている印の武器なら印が削れ（割れたら次へ）、違う武器はほとんど効かない。倒れ込んでいるあいだは大きく効く
  private kingHit(w: Wolf, dmg: number, o: { src?: Special | 'sp'; quiet?: boolean }) {
    if (!w.seq) this.newSeq(w);
    if (o.quiet) return dmg * KING.dog; // 番犬はほとんど効かない（手下の相手をする）
    if (w.mode === 'down') return dmg * KING.downMul;
    const weapon = o.src === 'sp' ? this.hero.special : o.src;
    if (!weapon || weapon !== w.seq![w.markIdx!]) return dmg * KING.wrong;
    // 光っている印の武器：当てた回数で印が削れる（必殺技は1回で割れる）
    w.markHp! += o.src === 'sp' ? KING.points.sp : KING.points[weapon];
    if (w.markHp! >= KING.mark) {
      w.markHp = 0;
      w.markIdx!++;
      this.fx.push(this.mk({ kind: 'full', x: w.x, lane: w.lane }));
      this.sounds.push('full');
      if (w.markIdx! >= w.seq!.length) {
        // 全部割った：倒れ込む（大チャンス）
        w.mode = 'down';
        w.modeT = KING.down;
        this.events.push('kingdown');
        this.sounds.push('boom');
        this.kick(10, 0);
        this.fx.push(this.mk({ kind: 'land', x: w.x, lane: w.lane, r: w.size * 1.5, big: true }));
      }
    }
    return dmg;
  }

  // 主人公を吹き飛ばす（dir の向きへ）
  private pushHero(dir: number, d: number) {
    const h = this.hero;
    h.x = clamp(h.x + dir * d, HERO.minX, HERO.maxX);
    h.vz = Math.max(h.vz, 320);
    h.z = Math.max(h.z, 0.01);
  }

  // 狼王：居座る所まで来たら、間を置いて3つの攻めのどれかを出す。予兆（溜め）は wind 秒。true を返す（体の動きは自分でする）
  private runKing(w: Wolf, dt: number): boolean {
    const h = this.hero;
    const ph = this.kingPhase(w);
    if (!w.seq) this.newSeq(w);
    const heroOk = h.down <= 0 && h.ouran <= 0 && h.iframes <= 0;
    const lane = (o: { lane: number }) => Math.abs(o.lane - w.lane) < 0.55;
    switch (w.mode) {
      case 'down':
        if ((w.modeT -= dt) > 0) return true;
        w.mode = '';
        w.modeT = KING.gap[ph];
        this.newSeq(w);
        this.fx.push(this.mk({ kind: 'wake', x: w.x, lane: w.lane, r: w.size }));
        return true;
      case 'kl': // 突進の溜め
        if ((w.modeT -= dt) > 0) return true;
        w.mode = 'lunge';
        w.modeT = KING.lunge.time;
        w.kHit = false;
        this.sounds.push('dash');
        return true;
      case 'lunge': {
        w.x = clamp(w.x + w.kdir! * KING.lunge.speed * dt, HOUSE_X + 80, WOLF_SPAWN_X - 40);
        const touch = (x: number) => Math.abs(x - w.x) < w.size / 2 + 20;
        if (!w.kHit && heroOk && touch(h.x) && lane(h) && h.z < KING.lunge.clear) {
          w.kHit = true;
          this.hurtHero(KING.lunge.damage * this.bite);
          this.pushHero(w.kdir!, KING.lunge.push);
        }
        for (const d of this.dogs) if (d.down <= 0 && touch(d.x) && lane(d)) this.hurt(d, KING.lunge.damage * this.bite * dt * 3);
        if ((w.modeT -= dt) <= 0) w.mode = 'kr';
        return true;
      }
      case 'kr': { // 居座る所へ戻る
        const dx = KING.holdX - w.x;
        w.x += Math.sign(dx) * Math.min(Math.abs(dx), 280 * dt);
        if (Math.abs(dx) < 2) { w.mode = ''; w.modeT = KING.gap[ph]; }
        return true;
      }
      case 'ks': { // 立ち上がって叩きつけ
        if ((w.modeT -= dt) > 0) return true;
        const c = w.x + w.kdir! * (KING.slam.near + KING.slam.reach / 2);
        const inside = (x: number) => Math.abs(x - c) <= KING.slam.reach / 2;
        this.fx.push(this.mk({ kind: 'land', x: c, lane: w.lane, r: KING.slam.reach / 2, big: true }));
        this.fx.push(this.mk({ kind: 'pound', x: c, lane: w.lane, r: KING.slam.reach / 2 }));
        this.sounds.push('slam');
        this.kick(9, w.kdir!);
        if (heroOk && inside(h.x) && lane(h)) {
          this.hurtHero(KING.slam.damage * this.bite);
          this.pushHero(w.kdir!, KING.slam.push);
        }
        for (const d of this.dogs) if (d.down <= 0 && inside(d.x) && lane(d)) this.hurt(d, KING.slam.damage * this.bite);
        w.mode = 'rest';
        w.modeT = 0.6;
        return true;
      }
      case 'kw': { // 吠えて波・手下を呼ぶ
        if ((w.modeT -= dt) > 0) return true;
        // 体力が3割を切ったら、波は家まで届く。主人公が裂け目の側にいても、家の側へも1つ出す（レビュー7：最後に家の心配を）
        const rage = w.hp / w.maxHp < KING.rage;
        this.waves.push({ x: w.x + w.kdir! * w.size * 0.4, dir: w.kdir!, lane: w.lane, hit: false, dogs: [], house: rage });
        if (rage && w.kdir! > 0) this.waves.push({ x: w.x - w.size * 0.4, dir: -1, lane: w.lane, hit: true, dogs: [], house: true });
        this.fx.push(this.mk({ kind: 'howl', x: w.x, lane: w.lane, r: w.size }));
        this.sounds.push('horn');
        // 続けて吠える（弓の印のあいだ）：手下は最初の1回だけ呼ぶ
        if ((w.kBurst ?? 0) > 1) {
          w.kBurst!--;
          w.modeT = KING.burst.gap;
          return true;
        }
        const first = !w.kBurst;
        w.kBurst = 0;
        if (first && this.wolves.length < 30) {
          const cols: WolfColor[] = ['red', 'black', 'purple', 'orange'];
          for (let i = 0; i < KING.wave.minions; i++) {
            const m = this.makeWolf('wolf', WOLF_SPAWN_X, cols[Math.floor(this.rand() * cols.length)]);
            m.summoned = true;
            m.age = -0.2 * i;
            m.skillCd = 1 + this.rand() * 2;
            this.wolves.push(m);
            this.fx.push(this.mk({ kind: 'emerge', x: m.x, lane: m.lane }));
          }
        }
        w.mode = 'rest';
        w.modeT = 0.6;
        return true;
      }
      case 'rest':
        if ((w.modeT -= dt) <= 0) { w.mode = ''; w.modeT = KING.gap[ph]; }
        return true;
    }
    // 居座る所まで歩いてくる
    if (w.x > KING.holdX + 1) {
      w.x = Math.max(KING.holdX, w.x - WOLVES.king.speed * 3 * dt);
      w.modeT = 1.5;
      return true;
    }
    w.lane += clamp(h.lane - w.lane, -0.3 * dt, 0.3 * dt); // 主人公の奥行きへゆっくり寄る
    if ((w.modeT -= dt) > 0 || h.down > 0) return true;
    // 攻めを選ぶ：近ければ叩きつけか突進、遠ければ突進か遠吠え
    w.kdir = h.x >= w.x ? 1 : -1;
    const near = Math.abs(h.x - w.x) < KING.slam.near + KING.slam.reach;
    const r = this.rand();
    if (near) { w.mode = r < 0.55 ? 'ks' : 'kl'; }
    else { w.mode = r < 0.5 ? 'kl' : 'kw'; }
    // 弓の印のあいだに離れていると、波を続けて3つ（間をあけて）。跳んでよけながら矢を当てる
    // （2026-10-05 アマネさん「狼王の攻撃をジャンプで避けるとか」。前は離れて待つだけだった）
    if (!near && w.seq![w.markIdx!] === 'nagare') {
      w.mode = r < 0.75 ? 'kw' : 'kl';
      if (w.mode === 'kw') w.kBurst = KING.burst.n;
    }
    w.modeT = w.mode === 'kl' ? KING.lunge.wind : w.mode === 'ks' ? KING.slam.wind : KING.wave.wind;
    return true;
  }

  // 遠吠えの波：地面を走る。跳んでいれば当たらない。家には当たらない
  private flyWaves(dt: number) {
    const h = this.hero;
    this.waves = this.waves.filter((v) => {
      v.x += v.dir * KING.wave.speed * dt;
      if (!v.hit && h.down <= 0 && h.ouran <= 0 && h.iframes <= 0 && Math.abs(h.x - v.x) < 26 && h.z < KING.wave.clear) {
        v.hit = true;
        this.hurtHero(KING.wave.damage * this.bite);
        this.pushHero(v.dir, 90);
      }
      for (const d of this.dogs) {
        if (d.down <= 0 && !v.dogs.includes(d.id) && Math.abs(d.x - v.x) < 26) {
          v.dogs.push(d.id);
          this.hurt(d, KING.wave.damage * this.bite * 0.5);
        }
      }
      if (v.house && v.x <= HOUSE_X + 20) {
        // 家に届いた波（体力が3割を切った狼王）
        this.houseHp -= KING.wave.house;
        this.stats.houseShock += KING.wave.house;
        this.fx.push(this.mk({ kind: 'land', x: HOUSE_X + 30, lane: v.lane, r: 90, big: true }));
        this.sounds.push('slam');
        this.kick(6, -1);
        return false;
      }
      return v.x > HOUSE_X && v.x < WOLF_SPAWN_X;
    });
  }

  // カラスがとまっている
  get clung() {
    return this.wolves.some((w) => w.kind === 'crow' && w.mode === 'cling');
  }

  // カラス：飛んで主人公へ向かい、とまって突く。叩かれると落ち、起きてまた飛ぶ。true を返したら、この1コマはここまで
  private runCrow(w: Wolf, dt: number): boolean {
    const h = this.hero;
    if (w.mode === 'fall') {
      if (w.z > 0 || w.vz > 0) return false; // 落ちている：ふつうの体の動き（重力）
      w.mode = '';
      w.stun = Math.max(w.stun, CROW.ko); // 落ちたら少しのあいだ地面でのびる（追い打ちの隙。絵は crow_ko）
    }
    if (w.mode === 'cling') {
      if (h.down > 0 || h.ouran > 0) {
        w.mode = 'fall';
        w.vx = 200;
        return false;
      }
      w.x = h.x - h.facing * 6;
      w.lane = Math.min(1, h.lane + 0.002); // 主人公の手前に描く
      w.z = 150 + h.z; // 肩の高さ
      if (w.skillCd <= 0) {
        w.skillCd = CROW.every;
        this.hurtHero(CROW.peck * this.bite * this.biteMul(w));
      }
      return true;
    }
    if (w.stun > 0) return true; // 地面でのびている
    w.z = Math.min(CROW.fly, w.z + 160 * dt);
    w.vz = 0;
    if (w.vx) {
      w.x = clamp(w.x + w.vx * dt, HOUSE_X + 10, WOLF_SPAWN_X);
      w.vx *= Math.max(0, 1 - BODY.friction * dt);
      if (Math.abs(w.vx) < 5) w.vx = 0;
    }
    const up = h.down <= 0 && h.ouran <= 0;
    const tx = up ? h.x : HOUSE_X;
    const tl = up ? h.lane : w.lane;
    const dx = tx - w.x;
    w.x += Math.sign(dx) * Math.min(Math.abs(dx), WOLVES.crow.speed * (w.color ? COLORS[w.color].speed : 1) * dt);
    w.lane += clamp(tl - w.lane, -1.2 * dt, 1.2 * dt);
    if (up && w.age > 0.6 && Math.abs(h.x - w.x) < 26 && Math.abs(h.lane - w.lane) < 0.12 && h.iframes <= 0 && !this.clung) {
      w.mode = 'cling';
      w.skillCd = CROW.every;
      this.breakCombo(); // とまられると連撃が切れる
      this.sounds.push('hurt');
    }
    if (!up && w.x <= HOUSE_X + w.size / 2 && w.cooldown <= 0) {
      w.cooldown = WOLVES.crow.interval;
      const bite = WOLVES.crow.damage * this.bite * this.biteMul(w);
      this.houseHp -= bite;
      this.stats.houseBite += bite;
    }
    return true;
  }

  // 遠吠えが呼ぶ仲間（晩が進むほど強く）：序盤は子狼2匹、20晩目から狼と子狼、40晩目から今夜の色の狼と子狼
  private howlCalls(): { kind: WolfKind; color?: WolfColor }[] {
    const n = this.wave + 1;
    if (n < HOWL.wolfFrom) return [{ kind: 'pup' }, { kind: 'pup' }];
    const theme = n >= HOWL.colorFrom ? themeColors(n, this.mood) : [];
    const color = theme.length ? theme[Math.floor(this.rand() * theme.length)] : undefined;
    return [{ kind: 'wolf', color }, { kind: 'pup' }];
  }

  // 人狼男：寄ると振りかぶり、大振り。そのあと少し休む。true を返したら、この1コマはここまで
  private runWman(w: Wolf, dt: number): boolean {
    const h = this.hero;
    if (w.mode === 'wind') {
      if ((w.modeT -= dt) > 0) return true;
      w.mode = 'rest';
      w.modeT = WMAN.rest;
      const face = w.kdir ?? -1;
      const at = w.x + face * WMAN.reach * 0.55;
      this.fx.push(this.mk({ kind: 'land', x: at, lane: w.lane, r: WMAN.reach, big: true }));
      this.sounds.push('slam');
      this.kick(7, -1);
      if (h.down <= 0 && Math.abs(h.x - at) <= WMAN.reach * 0.75 && Math.abs(h.lane - w.lane) <= LANE_TOL + 0.1 && h.iframes <= 0 && h.ouran <= 0) {
        this.hurtHero(WMAN.swing * this.bite * this.biteMul(w));
        h.x = clamp(h.x + face * WMAN.push, HERO.minX, HERO.maxX); // 大きく吹き飛ぶ
        h.vz = Math.max(h.vz, 320);
        h.z = Math.max(h.z, 0.01);
      }
      for (const d of this.dogs) if (d.down <= 0 && Math.abs(d.x - at) <= WMAN.reach * 0.75 && Math.abs(d.lane - w.lane) <= LANE_TOL + 0.1) this.hurt(d, WMAN.swing * this.bite * this.biteMul(w));
      return true;
    }
    if (w.mode === 'rest') {
      if ((w.modeT -= dt) <= 0) w.mode = '';
      return true;
    }
    // 振り向く：後ろ（裂け目の側）に回られたら、少し間をおいて向きを変えてから振りかぶる
    // （2026-10-05 レビュー6。前は家の側しか振りかぶらず、後ろに回ると殴り放題だった）
    if (w.mode === 'turn') {
      if ((w.modeT -= dt) > 0) return true;
      w.kdir = -(w.kdir ?? -1);
      w.mode = '';
    }
    const face = w.kdir ?? -1;
    const ahead = (h.x - w.x) * face; // 向いている側にどれだけ前か
    const near = h.down <= 0 && h.ouran <= 0 && Math.abs(w.lane - h.lane) <= LANE_TOL + 0.1;
    if (near && ahead > -20 && ahead <= WMAN.reach) {
      w.mode = 'wind';
      w.modeT = WMAN.wind;
      return true;
    }
    if (near && ahead < -20 && -ahead <= WMAN.reach * 1.6) {
      w.mode = 'turn';
      w.modeT = WMAN.turn;
      return true;
    }
    if (face > 0) {
      // 主人公が離れたら、また家のほうを向いて歩く
      w.mode = 'turn';
      w.modeT = WMAN.turn;
      return true;
    }
    return false; // ふつうに歩く・番犬と家を噛む
  }

  // 人狼女：近くへ跳んで下り、着地の隙のあとひっかき3連、下がってまた跳ぶ
  private runWwoman(w: Wolf, dt: number): boolean {
    const h = this.hero;
    switch (w.mode) {
      case 'leap': // 宙にいるあいだは体の動きの所で止まるので、ここに来たら着地した
        if (w.toLane !== undefined) w.lane = w.toLane; // 寄せきれなかった分（わずか）
        w.mode = 'land';
        w.modeT = WWOMAN.land;
        return true;
      case 'land':
        if ((w.modeT -= dt) > 0) return true;
        w.mode = 'claw';
        w.clawN = WWOMAN.claws;
        w.modeT = 0;
        return true;
      case 'claw':
        if ((w.modeT -= dt) > 0) return true;
        w.clawN--;
        w.modeT = WWOMAN.gap;
        this.fx.push(this.mk({ kind: 'slash', x: w.x - 30, lane: w.lane, dir: -1 }));
        this.sounds.push('swing');
        if (h.down <= 0 && Math.abs(h.x - w.x) <= WWOMAN.reach + w.size / 2 && Math.abs(h.lane - w.lane) <= LANE_TOL) this.hurtHero(WWOMAN.claw * this.bite * this.biteMul(w));
        if (w.clawN <= 0) {
          w.mode = 'back';
          w.vx = WWOMAN.back;
          w.skillCd = WWOMAN.cd;
        }
        return true;
      case 'back':
        if (w.vx > 5) return true;
        w.mode = '';
        return false;
    }
    const d = Math.abs(w.x - h.x);
    if (w.skillCd <= 0 && h.down <= 0 && h.ouran <= 0 && d <= WWOMAN.range && d > 70) {
      const T = (2 * WWOMAN.lift) / BODY.gravity;
      const to = h.x + (w.x > h.x ? 45 : -45);
      w.vz = WWOMAN.lift;
      w.z = 0.01;
      w.vx = (to - w.x) / T;
      w.toLane = h.lane;
      w.pouncing = true;
      w.mode = 'leap';
      this.sounds.push('jump');
      return true;
    }
    return false;
  }

  // 色の狼の噛む力
  private biteMul(w: Wolf) {
    return w.color ? COLORS[w.color].damage : 1;
  }

  private gain(sp: Special, n: number) {
    if (this.hero.ouran > 0) return;
    this.gauges[sp] = Math.min(100, this.gauges[sp] + n * (this.mood === 'sakura' ? 1.8 : 1));
  }

  // 画面を揺らす。dir があれば当てた向きへ押す
  private kick(n: number, dir: number) {
    this.shake = Math.max(this.shake, n);
    if (dir) this.shakeDir = dir;
  }

  private reap() {
    // 橙が倒れると爆ぜて、まわりの狼も巻き込む（巻き込まれた橙も爆ぜる）
    for (let guard = 0; guard < 20; guard++) {
      const boom = this.wolves.filter((w) => w.hp <= 0 && w.color === 'orange' && w.sleep >= 0);
      if (!boom.length) break;
      for (const b of boom) {
        b.sleep = -1; // 爆ぜた印（もう一度は爆ぜない）
        this.fx.push(this.mk({ kind: 'blast', x: b.x, lane: b.lane, r: BLAST.radius, big: true }));
        this.sounds.push('boom');
        this.kick(5, 0);
        const dmg = BLAST.damage * hpScale(this.wave + 1);
        for (const o of this.wolves) {
          if (o !== b && o.hp > 0 && Math.abs(o.x - b.x) <= BLAST.radius + o.size / 2 && Math.abs(o.lane - b.lane) <= 0.5) {
            o.lastSrc = undefined; // 爆ぜは武器なし。前に当てた武器（必殺技）を残すと、爆ぜで倒れた緑が寝ずに消えた（2026-10-05 レビュー2）
            this.hit(o, dmg, { kb: 220, lift: 220, stop: 0, stun: 0.5 });
          }
        }
        const h = this.hero;
        if (h.down <= 0 && h.iframes <= 0 && h.ouran <= 0 && Math.abs(h.x - b.x) <= BLAST.radius && Math.abs(h.lane - b.lane) <= 0.5) this.hurtHero(BLAST.hero * this.bite);
        for (const d of this.dogs) if (d.down <= 0 && Math.abs(d.x - b.x) <= BLAST.radius && Math.abs(d.lane - b.lane) <= 0.5) this.hurt(d, BLAST.hero * this.bite);
      }
    }
    this.wolves = this.wolves.filter((w) => {
      if (w.hp > 0) return true;
      // 緑は必殺技で倒れたときだけ消える。ほかは寝て、4秒で起き上がる（寝ているあいだは家を噛まない）
      if (w.color === 'green' && w.lastSrc !== 'sp' && !(w.kind === 'alpha' && w.naps >= 2)) {
        w.naps++;
        w.hp = 0;
        w.sleep = GREEN_SLEEP;
        w.z = 0;
        w.vz = 0;
        w.vx = 0;
        w.slammed = false;
        w.pouncing = false;
        this.sleepers.push(w);
        this.fx.push(this.mk({ kind: 'land', x: w.x, lane: w.lane, r: w.size }));
        return false;
      }
      if (w.kind === 'king') {
        // 狼王が倒れると封が砕け、残った狼も消える
        for (const o of this.wolves) if (o !== w && o.hp > 0) { o.hp = 0; o.summoned = true; this.fx.push(this.mk({ kind: 'sunfade', x: o.x, lane: o.lane, r: o.size, wolf: o.kind, color: o.color })); }
        this.spawners = [];
        this.sleepers = [];
        this.waves = [];
        this.events.push('kingdie');
        this.kick(14, 0);
        this.punch = 1;
      }
      const b = w.summoned ? 0 : WOLVES[w.kind].bounty * (w.color ? COLORS[w.color].bounty : 1);
      this.coins += b;
      this.nightEarned += b;
      this.kills++;
      this.nightKills++;
      this.fx.push(this.mk({ kind: 'poof', x: w.x, lane: w.lane, z: w.z, r: w.size, n: Math.round(b), dir: w.hitDir, wolf: w.kind, color: w.color }));
      return false;
    });
    // 番犬は消えずに倒れて、家で休んでから戻る
    for (const d of this.dogs) {
      if (d.hp > 0 || d.down > 0) continue;
      d.hp = 0;
      d.down = DOG_REVIVE * (this.has('dogRevive') ? 0.5 : 1);
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
