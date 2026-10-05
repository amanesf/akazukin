// 数値はすべて仮置き（plan.md §3・§4）。遊んで直す前提で、ここに集める。
// 距離の単位は「間合い」。0 がおばあさんの家の壁、FIELD_LENGTH が異界の裂け目。

export const FIELD_LENGTH = 1000;
export const HOUSE_X = 40; // 狼はここまで来ると家を齧る
export const GIRL_X = 70; // 赤ずきんは左に固定
export const WOLF_SPAWN_X = FIELD_LENGTH - 10;

export const STEP = 1 / 60; // 固定ステップ

export const HOUSE_HP = 600;
export const COIN_START = 100;
// 夜に時間で貯まる銭はやめた（2026-10-04・番犬は昼に置くので夜に使い道が無い）。狼の賞金と、夜明けの分だけ
export const dawnBonus = (n: number) => 30 + 3 * n; // n 晩目を越えたとき
export const FIRST_WAVE_DELAY = 2.5; // 最初の晩の前の間（秒）。「1日目の夜」の題を見せる

// 奥行き（lane 0＝奥、1＝手前）。主人公も狼も奥行きを動く。これだけ離れていると、噛めない・斬れない
export const LANE_TOL = 0.3;

// ── 主人公（指一本アクション・2026-10-04・アマネさん「Aでお願い。スピード感もほしい」）──
// タップ＝斬り（連打で連撃）、左右にはじく＝突進斬り、上＝斬り上げ、下＝叩き落とし、長押し→離す＝主砲。
// 触っていないときは軽く自動で斬り、離れた狼には弓で補助する（アマネさん「軽く自動」）
export const HERO = {
  hp: 220,
  size: 50, // 体の幅（2026-10-04 アップにしたので、絵の幅に合わせて大きく。狼・番犬も同じ倍率）
  speed: 330, // 走る
  sprint: 620, // 小さい地図のタップで駆けつける
  laneSpeed: 2.2, // 奥行きの動き（1秒あたり）
  minX: GIRL_X,
  maxX: FIELD_LENGTH - 200, // 裂け目のすぐ前には入らない（出てきた端から狩れてしまう。撮影の自動操作が裂け目に張り付いた）
  // 倒れたら家の前で立ち上がるまで。同じ晩に続けて倒れるほど長く（2026-10-05 アマネさん「やられたときのペナルティが少なすぎる」。前は4秒）
  reviveTime: 7,
  reviveMore: 3, // 同じ晩の2回目から、1回ごとに足す秒
  reviveMax: 16,
  hitStunTime: 0.22,
  lunge: 130, // タップした狼がこれより近ければ、踏み込んで斬る（遠ければ走って行って斬る）
  buffer: 0.4, // 技の途中の入力を覚えておく秒数（先行入力）
};
export const AUTO = { slash: 0.9, bow: 1.5, bowRange: 520 }; // 弓は速く・遠くまで（2026-10-04 アマネさん「弓矢もっと役に立たせたい」） // 触っていないとき：斬りの間隔・弓の間隔・弓の届く距離
// 突進斬り：その方向へ突き抜け、通り道の狼を全部斬る。2026-10-04 連発でほぼ無敵だった（狼がひるみ続けて噛めない）ので、
// 無敵は出始めだけ・斬られた狼のひるみは短く・次の突進まで間を空ける・威力は下げる（突進は動くための技。削るのは斬り）
export const DASH = { dist: 230, iframes: 0.12, cd: 1.0, stun: 0.1 };
export const CHARGE = { min: 0.4, full: 1.1, gain: 0.35 }; // 主砲の溜め（秒）。満タンは威力が倍

// 狼の体の動き：弾く（横の勢い）・打ち上げる（上の勢い）・叩き落とす（下へ叩きつけて跳ねる）
export const BODY = {
  gravity: 1400,
  friction: 6, // 横の勢いの減り方
  bounce: 260, // 叩き落とされて跳ね返る勢い
  slamSplash: 110, // 叩きつけた所のまわりの狼にも当たる
  slamSplashDamage: 15,
};

// 技。kind は使う構え。hits はその技が当てる時刻（秒）
export type MoveId = 'slash' | 'launch' | 'air' | 'slam' | 'shiki' | 'kaiten' | 'tosshin' | 'bow' | 'ame' | 'hougeki' | 'issen' | 'jiwari';
export interface MoveSpec {
  name: string;
  dur: number;
  reach: number; // 前へ届く距離（主人公の体の端から）
  damage: number;
  kb?: number; // 弾く勢い
  lift?: number; // 打ち上げる勢い
  slam?: boolean;
  area?: number; // 範囲（主人公のまわり）
  shake?: number;
  stop?: number; // ヒットストップ（秒）
}
export const MOVES: Record<MoveId, MoveSpec> = {
  slash: { name: '斬り', dur: 0.18, reach: 62, damage: 10, kb: 50, stop: 0.035 },
  launch: { name: '斬り上げ', dur: 0.26, reach: 64, damage: 12, lift: 640, stop: 0.06, shake: 3 },
  air: { name: '追い打ち', dur: 0.18, reach: 72, damage: 9, lift: 280, stop: 0.035 },
  slam: { name: '叩き落とし', dur: 0.3, reach: 80, damage: 22, slam: true, stop: 0.1, shake: 7 },
  shiki: { name: '主砲', dur: 0.42, reach: 70, damage: 40, kb: 650, area: 180, stop: 0.13, shake: 11 },
  kaiten: { name: '回転斬り', dur: 0.36, reach: 0, damage: 16, kb: 280, area: 150, stop: 0.05, shake: 4 },
  tosshin: { name: '突進斬り', dur: 0.26, reach: 30, damage: 7, kb: 120, stop: 0.04, shake: 3 },
  bow: { name: '弓', dur: 0.36, reach: 0, damage: 16 },
  ame: { name: '矢の雨', dur: 0.6, reach: 0, damage: 11 },
  hougeki: { name: '主砲の撃ち込み', dur: 0.7, reach: 0, damage: 32, area: 75, shake: 5 },
  // コンボの締め（4発目）。威力は格（並・上・極）と近接の「締めの威力」で伸びる
  issen: { name: '一閃', dur: 0.34, reach: 92, damage: 34, kb: 460, stop: 0.11, shake: 9 },
  jiwari: { name: '地割り', dur: 0.36, reach: 0, damage: 26, kb: 480, lift: 360, area: 200, stop: 0.1, shake: 11 },
};
// ── コンボ：4拍子（2026-10-05 アマネさん）。1〜3発目はタップでも、はじく（上・下・左右）でもいい。4発目で締めを選ぶ ──
// 4発目：タップ＝一閃／左右＝突き抜け／上＝空中連舞／下＝地割り／長押し＝零距離主砲。
// 1〜3発目に違う種類を混ぜるほど締めが強い（格：並・上・極。アマネさん「かっこいい操作もコンボいれるとあんまりしなくなるのはやだ」）。
// 切れる：次の入力まで window 秒あく／空振り（アマネさん「空振りは切れていい」）／噛まれてひるむ／必殺技／小さい地図で駆けつける
export type Beat = 'tap' | 'up' | 'down' | 'side';
export type Finisher = 'issen' | 'tsuki' | 'renbu' | 'jiwari' | 'reishiki';
export const COMBO = {
  beats: 3, // 締めの前の拍
  window: 0.8, // 次の入力までこれだけあくと切れる（秒）
  grades: [
    { name: '並', mul: 1 },
    { name: '上', mul: 1.35 },
    { name: '極', mul: 1.8 },
  ],
  reishiki: 0.25, // 零距離主砲の溜め（秒）。満タンの主砲として撃つ
  tsuki: 1.5, // 突き抜けは突進の何倍の距離
};
export const FINISHERS: Record<Finisher, { name: string; key: string; short?: string }> = { // short：画面上部の早見に出す短い名前
  issen: { name: '一閃', key: '●' },
  tsuki: { name: '突き抜け', key: '⇆' },
  renbu: { name: '空中連舞', key: '↑' },
  jiwari: { name: '地割り', key: '↓' },
  reishiki: { name: '零距離主砲', key: '━', short: '零距離' },
};
// 矢はほぼまっすぐ速く（2026-10-04 アマネさん「弓矢がもっとまっすぐ飛ぶように。しょぼい」）。矢の雨だけ空から降る（RAIN）
export const BOW_FLIGHT = { base: 0.12, perUnit: 0.00025, hitRadius: 40, pierce: 3 }; // 矢は狙った狼を追い、通り道の狼を3匹まで貫く
export const RAIN_FLIGHT = { base: 0.3, perUnit: 0.0005 };
export const MOVE_CD = { kaiten: 2.5, tosshin: DASH.cd, ame: 5, hougeki: 0 };
// 桜嵐：3つの必殺技（2026-10-04 アマネさん「連撃して主砲みたいな感じ」「その夜の武器の使い方に応じて3種類がそれぞれ溜まる。ボタン3つ」）。
// どれも最初に桜の竜巻でまわりの狼を吸い寄せる（竜巻そのものは斬らない・アマネさん「竜巻は全部残す。ダメージはない。吸い寄せのみ」）。
// そのあと主人公が体ごと暴れて（連撃）、最後に大きく決める（締め）。2026-10-04 アマネさん「千本桜はナイフ持ちながら画面左右に駆け抜けて、
// 最後に大きくまわりダンとすべてを弾く」「乱れ撃ちは周囲の敵にズババババとうって、最後にズドン」「流れ矢も同じノリ」。
// 溜まり方：その夜の狼の体力の合計に対して、その武器でどれだけ削ったか（晩が進んで狼が増えても、1晩に1回くらい）。
// アマネさん「1晩に3種類を1回ずつくらい。運が良ければ2回、1回もできないこともある」
export type Special = 'senbon' | 'nagare' | 'midare';
export const SPECIAL_ORDER: Special[] = ['senbon', 'nagare', 'midare'];
export const SPECIALS: Record<Special, { name: string; icon: string; share: number }> = {
  // share：その夜の狼の体力の合計のうち、この割合をその武器で削ると満タン
  senbon: { name: '千本桜', icon: 'knife', share: 0.45 }, // 斬り（連撃・突進・斬り上げ・叩き落とし・回転）で溜まる
  nagare: { name: '桜流れ矢', icon: 'bow', share: 0.1 }, // 弓（自動の弓・矢の雨）で溜まる
  midare: { name: '主砲乱れ撃ち', icon: 'cannon', share: 0.16 }, // 主砲（長押し・撃ち込み・連撃の締めの主砲）で溜まる
};
export const OURAN = {
  time: 3.2,
  // 流れ：吸い寄せ（〜rush）→ 連撃（〜wind）→ 締めの構え（〜final）→ 締め（final の瞬間）→ 余韻
  rush: 0.5,
  wind: 2.3,
  final: 2.6,
  tick: 0.15, // 吸い寄せる間隔
  pull: 420, // 吸い寄せる距離
  hurt: 25, // 噛まれて体力を全部失うと、3つとも 25% 溜まる
  // 千本桜：ナイフを持って左右に駆け抜ける（passes 往復の片道）→ その場で回って地面をダン、まわりを全部弾く
  dash: { passes: 5, span: 260, damage: 70, final: 220, finalArea: 320 },
  // 主砲乱れ撃ち：まわりの狼へ次々に撃つ（弾はまっすぐ一瞬で届く）→ 溜めて前へ極太の一発
  barrage: { interval: 0.08, reach: 520, damage: 45, area: 50, final: 260, range: 760 },
  // 桜流れ矢：高く跳んで、下の狼へ矢を撃ち下ろす → 着地して、画面の端まで貫く大きな一本
  rain: { interval: 0.08, height: 190, reach: 520, damage: 45, final: 260, range: 900 },
};
export const COMBO_RESET = 1.2; // これだけ当てずにいるとコンボ数が0に戻る

// ── 昼に買うもの：体力・近接・主砲の3本（2026-10-03・アマネさん「何を強化するかがわかればいい」
// 「技選択までボタン増えると多くてしんどい」）。技は近接・遠隔の段を上げると自然に覚える ──
export type Track = 'body' | 'near' | 'far' | 'dog';
export type SkillId = 'ame' | 'hougeki';
export interface Perk {
  note: string; // 昼のボタンに出す「次は何が起きるか」
  hp?: number;
  finish?: number; // 締めの威力 +割合
  learn?: SkillId;
  power?: number; // その系統の威力 +割合
  rate?: number; // 弓の速さ +割合
  charge?: number; // 溜めの速さ +割合
  dogHp?: number; // 番犬の体力 +割合
  dogPower?: number; // 番犬の噛む力 +割合
  dogRevive?: number; // 番犬が戻るまでの時間 -割合
  dogSpeed?: number; // 番犬の速さ +割合
}
export const TRACK_COSTS = [80, 180, 340, 560, 850, 1200]; // 2026-10-04 99晩のあいだ鍛え続けられるよう、狼の賞金を減らして値段を上げた（自動操作で15晩目に全部上がった）
export const TRACKS: Record<Track, { name: string; perks: Perk[] }> = {
  body: {
    name: '体力',
    perks: [
      { note: '体力 +50', hp: 50 },
      { note: '体力 +50', hp: 50 },
      { note: '体力 +60', hp: 60 },
      { note: '体力 +60', hp: 60 },
      { note: '体力 +80', hp: 80 },
    ],
  },
  // はじく技（突進・斬り上げ・叩き落とし・主砲）は最初から。段で伸ばすのは手数・威力と、自動の技
  near: {
    name: '近接',
    perks: [
      // コンボは4拍子で長さは変わらない・締めは最初から全部使える（2026-10-05）。段で伸ばすのは威力
      { note: '締めの威力 +3割', finish: 0.3 },
      { note: '近接の威力 +2割', power: 0.2 },
      { note: '締めの威力 +3割', finish: 0.3 },
      { note: '近接の威力 +2割', power: 0.2 },
      { note: '締めの威力 +4割', finish: 0.4 },
      { note: '近接の威力 +3割', power: 0.3 },
    ],
  },
  far: {
    name: '主砲・弓',
    perks: [
      { note: '主砲と弓の威力 +2割', power: 0.2 },
      { note: '溜めが3割速く', charge: 0.3 },
      { note: '弓が群れに矢の雨', learn: 'ame' },
      { note: '弓が3割速く', rate: 0.3 },
      { note: '満タンの主砲で撃ち込み', learn: 'hougeki' },
      { note: '主砲と弓の威力 +3割', power: 0.3 },
    ],
  },
  // 番犬（2026-10-04 アマネさん。番犬の費用がなくなり、40晩あたりで銭の使い道がなくなったので）
  dog: {
    name: '番犬',
    perks: [
      { note: '番犬の体力 +3割', dogHp: 0.3 },
      { note: '番犬の噛む力 +3割', dogPower: 0.3 },
      { note: '倒れても半分の時間で戻る', dogRevive: 0.5 },
      { note: '番犬の体力 +4割', dogHp: 0.4 },
      { note: '番犬が2割速く走る', dogSpeed: 0.2 },
      { note: '番犬の噛む力 +5割', dogPower: 0.5 },
    ],
  },
};
// 段を上げきったあとも「修練」で少しずつ伸びる（銭がいつまでも使える）。1段ごとの伸びと、値段
// 2026-10-04 1段 +5% / 値段 +250 では自動操作が99晩を守りきった（前は80晩で止まった）→ 伸びを小さく、値段の上がり方を急に
export const TRAIN = { cost: (n: number) => 1300 + 450 * n, body: 10, near: 0.03, far: 0.03, dog: 0.05 };
export const TRAIN_NOTE: Record<Track, string> = { body: '修練：体力 +10', near: '修練：近接の威力 +3%', far: '修練：主砲と弓の威力 +3%', dog: '修練：番犬の体力と噛む力 +5%' };
// 家の修繕（昼に銭で買う）。値段は晩が進むほど少し上がる
export const REPAIR = { hp: 150, cost: (wave: number) => 60 + 4 * wave };
export const DAWN_REPAIR = 100; // 夜が明けると家が直る（家の修繕を買う代わり。案）


export const DOG_BLOCK = 2; // 番犬1匹が足止めできる狼の数
// 番犬は3匹（柴・秋田・土佐）が自分で動く（2026-10-04 アマネさん「5匹固定配置じゃなく3匹が自律的に動くように」）。
// 昼に1匹ずつ役目を決める（3匹とも同じ役目でもよい）。銭はかからない（銭は鍛えるだけに使う）
export type DogKind = 'shiba' | 'akita' | 'tosa';
export type DogRole = 'guard' | 'attack' | 'support';
export const DOG_ORDER: DogKind[] = ['shiba', 'akita', 'tosa'];
export const DOG_ROLES: Record<DogRole, { name: string; note: string }> = {
  guard: { name: '守り', note: '家にいちばん近い狼を噛む' },
  attack: { name: '攻撃', note: 'いちばん強い狼を噛む' },
  support: { name: '支援', note: '赤ずきんのまわりの狼を噛む' },
};
export const DOG_ROLE_ORDER: DogRole[] = ['guard', 'attack', 'support'];
export const DOG_DEFAULT_ROLES: Record<DogKind, DogRole> = { shiba: 'guard', akita: 'support', tosa: 'attack' };
export const DOG_REVIVE = 10; // 倒れた番犬は家で休んで、これだけたつと戻る
export const DOG_MAX_X = 800; // 番犬が出ていく先（主人公と同じ。裂け目の前には行かない）
export interface DogSpec {
  name: string;
  breed: string;
  hp: number;
  damage: number;
  interval: number;
  speed: number;
  size: number;
}
export const DOGS: Record<DogKind, DogSpec> = {
  shiba: { name: '豆助', breed: '柴', hp: 110, damage: 9, interval: 0.5, speed: 230, size: 40 },
  akita: { name: '白雪', breed: '秋田', hp: 300, damage: 12, interval: 0.75, speed: 170, size: 58 },
  tosa: { name: '鉄丸', breed: '土佐', hp: 360, damage: 34, interval: 1.0, speed: 150, size: 70 },
};

export type WolfKind = 'pup' | 'wolf' | 'armored' | 'howler' | 'alpha' | 'wman' | 'wwoman' | 'crow' | 'king';
export interface WolfSpec {
  name: string;
  hp: number;
  damage: number;
  interval: number;
  speed: number;
  size: number;
  bounty: number;
  arrowResist: number; // 弓・主砲の効きにくさ（0〜1）。鎧狼は近づいて斬れ
  heavy?: number; // 弾かれ・打ち上げられにくさ（0〜1）
}
export const WOLVES: Record<WolfKind, WolfSpec> = {
  pup: { name: '子狼', hp: 30, damage: 5, interval: 0.6, speed: 70, size: 38, bounty: 2, arrowResist: 0 },
  wolf: { name: '狼', hp: 90, damage: 11, interval: 0.8, speed: 48, size: 56, bounty: 4, arrowResist: 0 },
  armored: { name: '鎧狼', hp: 300, damage: 20, interval: 1.0, speed: 28, size: 70, bounty: 12, arrowResist: 0.6, heavy: 0.4 },
  // 遠吠え：近くの狼を速くする（後ろに居座る。主砲で落とす相手）
  howler: { name: '遠吠え', hp: 260, damage: 6, interval: 1.0, speed: 30, size: 56, bounty: 20, arrowResist: 0.3 },
  alpha: { name: '大狼', hp: 1800, damage: 45, interval: 1.2, speed: 18, size: 120, bounty: 120, arrowResist: 0.4, heavy: 0.8 },
  // 人狼（2026-10-05 アマネさん「人狼男、人狼女。ちょっと強めの敵」）。男＝重い一撃、女＝素早い。カラス＝主人公にとまって邪魔をする
  wman: { name: '人狼男', hp: 650, damage: 14, interval: 1.0, speed: 30, size: 72, bounty: 40, arrowResist: 0.2, heavy: 0.6 },
  wwoman: { name: '人狼女', hp: 280, damage: 8, interval: 0.8, speed: 62, size: 58, bounty: 30, arrowResist: 0 },
  crow: { name: 'カラス', hp: 40, damage: 3, interval: 1.0, speed: 110, size: 36, bounty: 3, arrowResist: 0 },
  // 狼王：99夜目の最終ボス（2026-10-05 アマネさん「ジャンプや引きで攻撃避けながら、マークのでた武器を順番に使っていく」「巨大な狼ボス」「狼王らしい禍々しさ」）
  king: { name: '狼王', hp: 3000, damage: 30, interval: 1.2, speed: 22, size: 170, bounty: 999, arrowResist: 0, heavy: 1 },
};
// 狼王：居座る所（holdX）から主人公を攻める。頭の上（画面の上）に武器の印が並び、光っている印の武器で mark 回当てると割れて次へ
// （当てた回数で数える。points：1回あたり。主砲は重いので3、必殺技は1回で割れる）。印と違う武器は wrong 倍、番犬は dog 倍しか効かない。
// 全部割ると倒れ込み（down 秒・どの武器も downMul 倍。ここが削りどころ）。体力が減るほど印が増え、攻めの間が短くなる。
// 攻め：突進の噛みつき（身を低く溜める → 跳んでよける）・叩きつけ（立ち上がる → 引いてよける）・遠吠えの波（頭を上げる → 跳んでよける。手下も呼ぶ）
export const KING = {
  holdX: 640, mark: 5, points: { senbon: 1, nagare: 1, midare: 3, sp: 5 }, wrong: 0.25, dog: 0.05, down: 7, downMul: 3, marks: [3, 4, 5], gap: [2.4, 1.9, 1.4],
  lunge: { wind: 1.0, speed: 760, time: 0.55, damage: 40, push: 160, clear: 70 },
  slam: { wind: 1.0, reach: 300, near: 40, damage: 46, push: 200 },
  wave: { wind: 1.0, speed: 520, damage: 28, clear: 50, minions: 3, house: 25 }, // house：家に届いたとき（晩で強くしない）
  rage: 0.3, // 体力がこの割合を切ると、遠吠えの波が家まで届く
  burst: { n: 3, gap: 0.55 }, // 弓の印のあいだ、波を続けて n 個（gap 秒おき）
};
// 人狼男：主人公に寄ると腕を振りかぶり（wind 秒・予兆がはっきり見える）、大振り（swing）。当たると大きく吹き飛ぶ。
// 振りかぶりの間に重い一撃（締め・叩き落とし・主砲・突進・必殺技）を当てると、ひるんで止まる。ふつうの斬りではひるまない
export const WMAN = { reach: 100, wind: 0.85, swing: 42, push: 140, stun: 0.6, rest: 0.8, broken: 0.9, turn: 0.4 }; // turn：振り向くのにかかる秒
// 人狼女：近くへ跳んで下り（着地の隙 land 秒）、ひっかき3連、下がってまた跳ぶ
export const WWOMAN = { range: 340, cd: 3.2, lift: 520, land: 0.6, claws: 3, gap: 0.22, claw: 9, reach: 80, back: 300 };
// カラス：飛んで主人公にとまる（足が遅くなり、連撃が切れる）。左右にはじくと振りほどける。とまっている間は少しずつ突く
export const CROW = { fly: 60, peck: 4, every: 0.9, slow: 0.6, shake: 35, ko: 1.0 }; // ko：叩き落とされて地面でのびる秒
// 人狼・カラスを晩に出す（絵は werewolves-v1・crow-v1。false にすると出ない）
export const FOES_READY = true;
// 色の狼（2026-10-05 plan.md §0.10② 5〜6回目・アマネさん「ひとことで分かる」「弱い武器くらいでいい」「弱い武器は2倍・敵の強化も2倍」）。
// 色は1匹に1つまで、子狼と狼だけ（遠吠え・鎧狼は形で役目が分かる。大狼は10晩ごとに色を回す）。
// weak：この武器で当てると2倍（senbon＝ナイフ・斬り全部／nagare＝弓／midare＝主砲／sp＝必殺技）。ほかの武器もふつうに効く
// fur：毛のグラデーション（暗い所・中ほど・明るい所）。掛け算で重ねると沈んで暗くなるので、明るさで色を引き当てる（wolfArt.ts）
export type WolfColor = 'red' | 'purple' | 'black' | 'orange' | 'green' | 'gold';
export const COLOR_ORDER: WolfColor[] = ['red', 'purple', 'black', 'orange', 'green', 'gold'];
export interface ColorSpec {
  name: string; // 「赤い」狼
  word: string; // ひとこと
  weak: Special | 'sp' | null;
  icon: string; // 頭の上の印（ui/icons）
  speed: number; hp: number; damage: number; size: number; bounty: number;
  threat: number; // 晩の予算を食う倍率
  from: number; // 初めて出る晩
  fur: [number, number, number];
  ui: string; // 文字の色
}
export const COLORS: Record<WolfColor, ColorSpec> = {
  red: { name: '赤い', word: '速い', weak: 'senbon', icon: 'knife', speed: 2, hp: 1, damage: 1, size: 1, bounty: 1.5, threat: 1.3, from: 3, fur: [0x400404, 0xd42a20, 0xff9a78], ui: '#ff6a55' },
  purple: { name: '紫の', word: '体力が多い', weak: 'midare', icon: 'cannon', speed: 1, hp: 2, damage: 1, size: 1.15, bounty: 2, threat: 2, from: 7, fur: [0x280a4a, 0x9a50e0, 0xe0c4ff], ui: '#c08aff' },
  black: { name: '黒い', word: '攻撃力が高い', weak: 'nagare', icon: 'bow', speed: 1, hp: 1, damage: 2, size: 1, bounty: 1.5, threat: 1.5, from: 16, fur: [0x020204, 0x18161e, 0x5a5468], ui: '#b0a8c8' },
  orange: { name: '橙の', word: '倒すと爆ぜる', weak: 'midare', icon: 'cannon', speed: 1, hp: 1, damage: 1, size: 1, bounty: 1.5, threat: 1.2, from: 12, fur: [0x4a1002, 0xe85a0c, 0xffb870], ui: '#ff7a2a' },
  green: { name: '緑の', word: '起き上がる', weak: 'sp', icon: 'sakura', speed: 1, hp: 1, damage: 1, size: 1, bounty: 2, threat: 2.5, from: 24, fur: [0x0a2a14, 0x5aa860, 0xc8f0b8], ui: '#7ad87a' },
  gold: { name: '金の', word: '全部強い', weak: null, icon: 'coin', speed: 2, hp: 2, damage: 2, size: 1.1, bounty: 5, threat: 5, from: 35, fur: [0x5a3c06, 0xf2cc3a, 0xfffbe0], ui: '#ffe050' },
};
// 色の付かない狼（灰）も明るい銀灰にそろえる（2026-10-05 アマネさん「黒と灰色区別つかない。灰色はもっと明るく」）
export const GRAY_FUR: [number, number, number] = [0x4a4a58, 0xa8a8b8, 0xf0f0f8];
export const BLAST = { radius: 130, damage: 70, hero: 10 }; // 橙が倒れたときの爆発（狼へ・主人公と番犬へ）
export const WEAK_MUL = 2; // 弱い武器で当てたとき
// 遠吠え：後ろに居座り、6秒ごとに1.5秒溜めて吠え、裂け目から仲間を2匹呼ぶ（序盤は子狼2匹・wolfFrom 晩から狼と子狼・colorFrom 晩から今夜の色の狼と子狼）。
// 出てすぐ（first 秒）1回吠え、歩いているあいだも吠える。何回でも呼ぶ（倒さないと増え続ける）。
// 場の狼が cap 匹を超えているあいだは呼ばない（重くならないように）。呼ばれた狼は賞金なし（稼ぎ場にしない）。賞金は 10→20（倒しに行く得）
// 2026-10-05 アマネさん「倒さないとどんどん敵を呼ぶ」「1匹は無限に呼べていい」。近くの狼を速くする・音波はやめた（見えにくい）
// 2026-10-05 体力 120→260（アマネさん「体力増やすか」。呼ぶ前に倒されて、99晩で呼ばれた子狼が10匹くらいしかいなかった）
export const HOWL = { holdX: 620, interval: 6, wind: 1.5, cap: 60, first: 1.2, wolfFrom: 20, colorFrom: 40 }; // 2026-10-05 呼ぶ仲間を晩で強く・出てすぐ吠える・上限 40→60
// 子狼は主人公を跳び越えて家へ向かう（立っているだけでは止められない）
export const POUNCE = { range: 160, interval: 2.5, lift: 420, speed: 400, damage: 8 };
// 狼は主人公が近いと奥行きを寄せて向かってくる（子狼は寄せない）
export const STEER = { range: 200, speed: 0.5 };

// 1波＝1晩。波の合間は昼。99日生き残れば完全クリア＝狼絶滅（2026-10-03・アマネさん）。
// 晩は手で並べず、晩ごとの「狼の予算」で組む（nights.ts。plan.md §5）
export const DAYS_TO_CLEAR = 99;
