// 数値はすべて仮置き（plan.md §3・§4）。遊んで直す前提で、ここに集める。
// 距離の単位は「間合い」。0 がおばあさんの家の壁、FIELD_LENGTH が異界の裂け目。

export const FIELD_LENGTH = 1000;
export const HOUSE_X = 40; // 狼はここまで来ると家を齧る
export const GIRL_X = 70; // 赤ずきんは左に固定
export const DOG_SPAWN_X = 90;
// 番犬の持ち場。ここより先へは出ない（裂け目で待ち伏せさせない。撮影で、出てきた端から狩られて簡単すぎた）
export const DOG_HOLD_X = 560;
export const WOLF_SPAWN_X = FIELD_LENGTH - 10;

export const STEP = 1 / 60; // 固定ステップ

export const HOUSE_HP = 600;
export const COIN_START = 100;
export const COIN_PER_SEC = 14;
export const FIRST_WAVE_DELAY = 2; // 最初の波までの間（秒）。2波目からは「次の波」ボタンで始める

// 武器：近＝ナイフ（自動）／弓＝戦場のタップ／主砲＝戦場の長押し（タメ）（2026-10-03・アマネさん）
export const KNIFE = { reach: 150, damage: 14, interval: 0.45 };
export const TAP_MAX = 0.25; // これより早く指を離せばタップ＝弓。長く押せばタメ

// 弓は放物線で、タップした所に落ちる。落ちた所の近くの狼1匹に当たる（外れもある）
export const BOW = { damage: 15, interval: 0.15, hitRadius: 30, flightBase: 0.3, flightPerUnit: 0.0005, minX: 110, fan: 24 };

// 主砲：押した時間で段が上がる（at は押し始めからの秒）。段に届かずに離すと撃たない。
// タメているあいだは弓が射てない——それが主砲の代償なので、撃ったあとの待ちは短くした
export interface ChargeStage { at: number; shells: number; damage: number; splash: number }
export const CHARGE = {
  stages: [
    { at: 0.8, shells: 2, damage: 25, splash: 60 },
    { at: 1.6, shells: 4, damage: 30, splash: 75 },
    { at: 2.5, shells: 6, damage: 40, splash: 95 },
  ] as ChargeStage[],
  minRange: 320, // 上45度までしか起きないので、近すぎる所は撃てない
  flight: 0.9,
  spread: 40,
  recover: 1.0, // 撃ったあと、次のタメに入れるまで
};

// 強化：波の合間に銭で買う（2026-10-03・アマネさん）。costs の長さが段の数
export type UpgradeId = 'bowPower' | 'bowCount' | 'chargeSpeed' | 'blastSize' | 'knifeReach' | 'repair';
export const UPGRADES: Record<UpgradeId, { name: string; note: string; costs: number[] }> = {
  bowPower: { name: '弓・威力', note: '1本 +5', costs: [80, 160, 300] },
  bowCount: { name: '弓・本数', note: '1回に +1本', costs: [150, 400] },
  chargeSpeed: { name: '主砲・タメ', note: 'タメ 2割速く', costs: [100, 220, 400] },
  blastSize: { name: '主砲・範囲', note: '爆発 2割広く', costs: [120, 280] },
  knifeReach: { name: 'ナイフ', note: '間合い +50', costs: [60, 150] },
  repair: { name: '家の修繕', note: '耐久 +150', costs: [80] }, // 何度でも買える
};
export const UP = { bowPower: 5, chargeSpeed: 0.8, blastSize: 1.2, knifeReach: 50, repair: 150 };

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
  arrowResist: number; // 弓の効きにくさ（0〜1）
}
export const WOLVES: Record<WolfKind, WolfSpec> = {
  pup: { name: '子狼', hp: 30, damage: 5, interval: 0.6, speed: 70, size: 20, bounty: 6, arrowResist: 0 },
  wolf: { name: '狼', hp: 90, damage: 11, interval: 0.8, speed: 48, size: 30, bounty: 14, arrowResist: 0 },
  armored: { name: '鎧狼', hp: 300, damage: 20, interval: 1.0, speed: 28, size: 38, bounty: 40, arrowResist: 0.6 },
  // 遠吠え：近くの狼を速くする（後ろに居座る。主砲で落とす相手）
  howler: { name: '遠吠え', hp: 120, damage: 6, interval: 1.0, speed: 30, size: 30, bounty: 30, arrowResist: 0.3 },
  alpha: { name: '大狼', hp: 1800, damage: 45, interval: 1.2, speed: 18, size: 64, bounty: 300, arrowResist: 0.4 },
};
export const HOWL = { radius: 220, speedMul: 1.5, holdX: 620 };

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
