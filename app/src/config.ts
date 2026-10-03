// 数値はすべて仮置き（plan.md §3・§4）。遊んで直す前提で、ここに集める。
// 距離の単位は「間合い」。0 がおばあさんの家の壁、FIELD_LENGTH が異界の裂け目。

export const FIELD_LENGTH = 1000;
export const HOUSE_X = 40; // 狼はここまで来ると家を齧る
export const GIRL_X = 70; // 赤ずきんは左に固定
export const DOG_SPAWN_X = 90;
// 番犬の持ち場。ここより先へは出ない（裂け目で待ち伏せさせない。撮影で、出てきた端から狩られて簡単すぎた）
export const DOG_HOLD_X = 470; // 主人公（中央まで）の少し後ろで守る
export const WOLF_SPAWN_X = FIELD_LENGTH - 10;

export const STEP = 1 / 60; // 固定ステップ

export const HOUSE_HP = 600;
export const COIN_START = 100;
export const COIN_PER_SEC = 14;
export const FIRST_WAVE_DELAY = 2; // 最初の波までの間（秒）。2波目からは「次の波」ボタンで始める

// ── 主人公（無双風・2026-10-03・アマネさん）──
// 戦場を動き回り、攻撃は自動。プレイヤーは構え（近／遠）を切り替え、ゲージが溜まったら無双乱舞
export const HERO = {
  hp: 220,
  size: 26,
  speed: 190,
  farX: 110, // 遠の構えで下がる位置
  maxX: FIELD_LENGTH * 0.5, // 主人公は画面の中央まで（2026-10-03・アマネさん「端っこに行くとさみしい」）
  reviveTime: 4, // 倒れたら家の前で立ち上がるまで
  hitStunTime: 0.25,
};

// 狼の体の動き：弾く（横の勢い）・打ち上げる（上の勢い）・叩き落とす（下へ叩きつけて跳ねる）
export const BODY = {
  gravity: 1400,
  friction: 6, // 横の勢いの減り方
  bounce: 260, // 叩き落とされて跳ね返る勢い
  slamSplash: 70, // 叩きつけた所のまわりの狼にも当たる
  slamSplashDamage: 15,
};

// 技。kind は使う構え。hits はその技が当てる時刻（秒）
export type MoveId = 'slash' | 'launch' | 'air' | 'slam' | 'shiki' | 'kaiten' | 'tosshin' | 'bow' | 'ame' | 'hougeki';
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
  slash: { name: '斬り', dur: 0.2, reach: 34, damage: 10, kb: 40, stop: 0.03 },
  launch: { name: '斬り上げ', dur: 0.28, reach: 34, damage: 12, lift: 620, stop: 0.05, shake: 2 },
  air: { name: '追い打ち', dur: 0.2, reach: 40, damage: 9, lift: 260, stop: 0.03 },
  slam: { name: '叩き落とし', dur: 0.32, reach: 44, damage: 22, slam: true, stop: 0.09, shake: 6 },
  shiki: { name: '至近の主砲', dur: 0.45, reach: 60, damage: 40, kb: 650, area: 110, stop: 0.12, shake: 10 },
  kaiten: { name: '回転斬り', dur: 0.4, reach: 0, damage: 16, kb: 260, area: 90, stop: 0.05, shake: 4 },
  tosshin: { name: '突進斬り', dur: 0.3, reach: 40, damage: 18, kb: 320, stop: 0.06, shake: 4 },
  bow: { name: '弓', dur: 0.42, reach: 0, damage: 13 },
  ame: { name: '矢の雨', dur: 0.6, reach: 0, damage: 11 },
  hougeki: { name: '主砲の撃ち込み', dur: 0.7, reach: 0, damage: 32, area: 75, shake: 5 },
};
export const BOW_FLIGHT = { base: 0.3, perUnit: 0.0005, hitRadius: 26 };
export const MOVE_CD = { kaiten: 3, tosshin: 2.5, ame: 5, hougeki: 7 };
export const MUSOU = { time: 3, tick: 0.15, damage: 22, reach: 130, final: 90, finalArea: 380, gain: { hit: 1.6, hurt: 0.6 } };
export const COMBO_RESET = 1.2; // これだけ当てずにいるとコンボ数が0に戻る

// ── 昼に買うもの：体力・近接・遠隔の3本（2026-10-03・アマネさん「何を強化するかがわかればいい」
// 「技選択までボタン増えると多くてしんどい」）。技は近接・遠隔の段を上げると自然に覚える ──
export type Track = 'body' | 'near' | 'far';
export type SkillId = 'kaiten' | 'tosshin' | 'shiki' | 'ame' | 'hougeki';
export interface Perk {
  note: string; // 昼のボタンに出す「次は何が起きるか」
  hp?: number;
  combo?: number;
  learn?: SkillId;
  power?: number; // その系統の威力 +割合
  rate?: number; // 弓の速さ +割合
}
export const TRACK_COSTS = [80, 140, 220, 320, 450, 600];
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
  near: {
    name: '近接',
    perks: [
      { note: 'コンボ +1', combo: 1 },
      { note: '突進斬りを覚える', learn: 'tosshin' },
      { note: '近接の威力 +2割', power: 0.2 },
      { note: '回転斬りを覚える', learn: 'kaiten' },
      { note: 'コンボ +1', combo: 1 },
      { note: '締めが至近の主砲に', learn: 'shiki' },
    ],
  },
  far: {
    name: '遠隔',
    perks: [
      { note: '遠隔の威力 +2割', power: 0.2 },
      { note: '矢の雨を覚える', learn: 'ame' },
      { note: '弓が3割速く', rate: 0.3 },
      { note: '主砲の撃ち込みを覚える', learn: 'hougeki' },
      { note: '遠隔の威力 +3割', power: 0.3 },
    ],
  },
};
export const DAWN_REPAIR = 100; // 夜が明けると家が直る（家の修繕を買う代わり。案）

export const COMBO_BASE = 4; // 斬り・斬り・斬り上げ・叩き落とし

export const AIM_MIN = 160;
export const AIM_MAX = FIELD_LENGTH - 20;

export type DogKind = 'shiba' | 'akita' | 'tosa';
export interface DogSpec {
  name: string;
  cost: number;
  cooldown: number;
  hp: number;
  damage: number;
  interval: number;
  speed: number;
  size: number;
}
export const DOGS: Record<DogKind, DogSpec> = {
  shiba: { name: '柴', cost: 50, cooldown: 2.5, hp: 70, damage: 8, interval: 0.55, speed: 75, size: 22 },
  akita: { name: '秋田', cost: 120, cooldown: 6, hp: 260, damage: 10, interval: 0.8, speed: 45, size: 32 },
  tosa: { name: '土佐', cost: 260, cooldown: 12, hp: 340, damage: 38, interval: 1.0, speed: 40, size: 38 },
};

export type WolfKind = 'pup' | 'wolf' | 'armored' | 'howler' | 'alpha';
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
  pup: { name: '子狼', hp: 30, damage: 5, interval: 0.6, speed: 70, size: 20, bounty: 6, arrowResist: 0 },
  wolf: { name: '狼', hp: 90, damage: 11, interval: 0.8, speed: 48, size: 30, bounty: 14, arrowResist: 0 },
  armored: { name: '鎧狼', hp: 300, damage: 20, interval: 1.0, speed: 28, size: 38, bounty: 40, arrowResist: 0.6, heavy: 0.4 },
  // 遠吠え：近くの狼を速くする（後ろに居座る。主砲で落とす相手）
  howler: { name: '遠吠え', hp: 120, damage: 6, interval: 1.0, speed: 30, size: 30, bounty: 30, arrowResist: 0.3 },
  alpha: { name: '大狼', hp: 1800, damage: 45, interval: 1.2, speed: 18, size: 64, bounty: 300, arrowResist: 0.4, heavy: 0.8 },
};
export const HOWL = { radius: 220, speedMul: 1.5, holdX: 620 };
// 狼の攻め方（特性ごと）：遠吠えは遠くから衝撃波、子狼は飛びかかる
export const SHOCKWAVE = { range: 460, interval: 3.2, speed: 260, damage: 12 };
export const POUNCE = { range: 130, interval: 2.5, lift: 380, speed: 320, damage: 8 };

// 1波＝1晩。波の合間は昼。99日生き残れば完全クリア＝狼絶滅（2026-10-03・アマネさん）。
// 試作は WAVES の数（6晩）で終わる。99晩ぶんの組み方は plan.md §5
export const DAYS_TO_CLEAR = 99;

// 波（晩）：[種類, 数, 間隔（秒）, 開始の遅れ（秒）]
export type SpawnLine = [WolfKind, number, number, number];
export const WAVES: SpawnLine[][] = [
  [['pup', 6, 1.4, 0]],
  [['pup', 8, 1.0, 0], ['wolf', 3, 3, 4]],
  [['wolf', 6, 2, 0], ['pup', 10, 0.8, 2]],
  [['armored', 2, 6, 0], ['wolf', 6, 1.6, 3], ['howler', 1, 1, 8]],
  [['pup', 16, 0.5, 0], ['armored', 3, 5, 4], ['howler', 2, 6, 6]],
  [['alpha', 1, 1, 6], ['wolf', 10, 1.5, 0], ['armored', 3, 5, 10]],
];
