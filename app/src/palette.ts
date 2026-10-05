// 仮の色（灰色の箱の版）。絵が入ったら、予告の印と小さい地図の色だけに使う
import type { DogKind, WolfKind } from './config';

export const WOLF_COLOR: Record<WolfKind, number> = {
  pup: 0x8a8a96,
  wolf: 0x6a6a76,
  armored: 0x9a9aa8,
  howler: 0x5a6a8a,
  alpha: 0x4a4650,
  wman: 0x3a3440,
  wwoman: 0x5a4060,
  crow: 0x202028,
  king: 0x200810,
};
export const DOG_COLOR: Record<DogKind, number> = { shiba: 0xd09060, akita: 0xe0c8a0, tosa: 0xa06848 };
