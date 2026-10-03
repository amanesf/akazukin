// 数値はすべて仮置き（plan.md §4）。遊んで直す前提で、ここに集める。
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
export const WAVE_GAP = 5; // ウェーブの合間（秒）

// 武器の距離の割り当て（案）：近＝ナイフ（自動）／中＝弓（照準の近くを自動で狙う）／遠＝主砲（ボタン）
export const KNIFE = { reach: 150, damage: 14, interval: 0.45 };
export const BOW = { range: 700, damage: 12, interval: 0.55, speed: 900, aimRadius: 140 };
export const CANNON = {
  minRange: 320, // 上45度までしか起きないので、近すぎる所は撃てない
  shells: 4,
  damage: 45,
  splash: 75,
  flight: 0.9,
  cooldown: 9,
  spread: 40,
};
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

// ウェーブ：[種類, 数, 間隔（秒）, 開始の遅れ（秒）]
export type SpawnLine = [WolfKind, number, number, number];
export const WAVES: SpawnLine[][] = [
  [['pup', 6, 1.4, 0]],
  [['pup', 8, 1.0, 0], ['wolf', 3, 3, 4]],
  [['wolf', 6, 2, 0], ['pup', 10, 0.8, 2]],
  [['armored', 2, 6, 0], ['wolf', 6, 1.6, 3], ['howler', 1, 1, 8]],
  [['pup', 16, 0.5, 0], ['armored', 3, 5, 4], ['howler', 2, 6, 6]],
  [['alpha', 1, 1, 6], ['wolf', 10, 1.5, 0], ['armored', 3, 5, 10]],
];
