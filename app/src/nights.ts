// 99晩の組み方（plan.md §5）。手で並べず、晩ごとの「狼の予算」から組む。
// 同じ晩はいつ遊んでも同じ並びになる（晩の番号から乱数を起こす）。
import { COLOR_ORDER, COLORS, DAYS_TO_CLEAR, FOES_READY, type WolfColor, type WolfKind } from './config';

export interface SpawnLine {
  kind: WolfKind;
  count: number;
  interval: number; // 秒
  delay: number; // 晩の始まりからの秒
  surge?: boolean; // 山場（群れの突撃）。2秒前に予告が出る
  color?: WolfColor; // 色の狼（plan.md §0.10②）
}

// 狼1匹の重さ（予算を食う量）と、出てくる晩
const THREAT: Record<WolfKind, number> = { pup: 1, wolf: 3, armored: 9, howler: 7, alpha: 50, wman: 30, wwoman: 20, crow: 3, king: 0 };
const FROM: Record<WolfKind, number> = { pup: 1, wolf: 2, armored: 4, howler: 5, alpha: 10, wman: 22, wwoman: 20, crow: 18, king: 999 };
const FOES: WolfKind[] = ['wman', 'wwoman', 'crow', 'king']; // 人狼・カラス（ふつうの流れとは別に組む）

// 晩 n（1始まり）の予算。序盤はゆっくり、後半は急に重くなる
// 2026-10-04 指一本アクションにして主人公が強くなったので、1.5倍に（自動操作が70晩まで家を守りきった）
export function budget(n: number) {
  return Math.round(1.5 * (24 + 5 * n + 0.06 * n * n)); // 2026-10-05 序盤も触らないと負けるように（前は 10 + 4n）
}

// 狼の体力の倍率。数だけでなく1匹も少しずつ硬くなる
export const HARD = 0.05; // 20晩から1晩ごとに足す硬さ（難しさの合わせどころ）
export function hpScale(n: number) {
  // 序盤の10晩で強化が要るくらい硬くなる（2026-10-05 アマネさん「武器強化していかないと負けるように」）、そのあとは1晩 3.8%
  // 2026-10-06 ナイフがまとめて斬れるようになり、自動操作が4つの種とも99晩を楽に越えた → 20晩から伸びを足す（序盤はそのまま）
  return 1 + 0.038 * (n - 1) + HARD * Math.max(0, n - 20) + 0.8 * Math.min(1, (n - 1) / 9);
}

// 番犬の伸び（狼の序盤の伸びには付き合わない。番犬を強くするのは昼の強化）
export function dogScale(n: number) {
  return 1 + 0.03 * (n - 1);
}

export const SURGE_WARN = 2;

// 夜の様子（2026-10-04 アマネさん「後半の変化」）。5晩目から、大狼の晩でなければ半分くらいの晩に。同じ晩はいつも同じ様子
export type Mood = 'kiri' | 'beni' | 'mure' | 'yoroi' | 'toboe' | 'sakura';
export const MOODS: Record<Mood, { name: string; note: string; from: number }> = {
  kiri: { name: '霧の夜', note: '霧で弓が近くまでしか届かない', from: 5 },
  beni: { name: '紅月の夜', note: '赤い狼（速い）が多い', from: 8 },
  mure: { name: '群れの夜', note: '子狼がたくさん来る', from: 5 },
  yoroi: { name: '鎧の夜', note: '鎧狼が多い', from: 12 },
  toboe: { name: '遠吠えの夜', note: '遠吠えが多い', from: 15 },
  sakura: { name: '桜吹雪の夜', note: '桜嵐（必殺技3つ）がよく溜まる', from: 6 },
};
export function mood(n: number): Mood | null {
  if (n < 5 || n % 10 === 0 || n === DAYS_TO_CLEAR) return null;
  let seed = n * 7919 + 3;
  const r = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  r();
  if (r() > 0.5) return null;
  const list = (Object.keys(MOODS) as Mood[]).filter((m) => MOODS[m].from <= n);
  return list[Math.floor(r() * list.length)];
}

export function night(n: number): SpawnLine[] {
  let seed = n * 9973 + 17;
  const rand = () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const lines: SpawnLine[] = [];
  const md = mood(n);
  let left = budget(n) * (md === 'mure' ? 1.15 : 1);
  const length = 30 + Math.min(40, n * 0.5); // 晩の長さ（秒）の目安

  // 99夜目：狼王。手下は狼王が遠吠えで呼ぶので、ふつうの流れは少しだけ（裂け目の前を賑やかに）
  if (n === DAYS_TO_CLEAR) {
    return [
      { kind: 'king', count: 1, interval: 1, delay: 4 },
      { kind: 'wolf', count: 6, interval: 1.5, delay: 1, color: 'red' },
      { kind: 'wolf', count: 6, interval: 1.5, delay: 2, color: 'black' },
    ];
  }
  // 節目：10晩ごとと最後の晩に大狼。99日目は頭目（大狼を3匹）
  if (n % 10 === 0 || n === DAYS_TO_CLEAR) {
    const bosses = n === DAYS_TO_CLEAR ? 3 : 1 + Math.floor(n / 40);
    // 大狼にも色を回す（2026-10-05 plan.md §0.10②）。99日目の頭目は3匹それぞれ別の色
    if (n === DAYS_TO_CLEAR) for (const c of ['red', 'purple', 'black'] as WolfColor[]) lines.push({ kind: 'alpha', count: 1, interval: 1, delay: length * 0.35 + lines.length * 6, color: c });
    else lines.push({ kind: 'alpha', count: bossColor(n) === 'gold' ? 1 : bosses, interval: 6, delay: length * 0.35, color: bossColor(n) }); // 金（全部2倍）は1匹だけ
    left -= THREAT.alpha * bosses * 0.3; // 大狼の晩は取り巻きを少し減らす
  }

  // 色の狼：予算の一部を色の狼に回す（晩が進むほど多く）。初めて出る晩（新顔）は、ほかに紛れないよう晩の始めのほうに3匹だけ
  // 1晩に出す色は1〜2色だけ（2026-10-05 アマネさん「カラフルすぎるのもどうか」。前は出られる色が毎晩ぜんぶ出た）。
  // 色が少ないと「今夜は赤が多いから千本桜」と必殺技を選びやすい（レビュー5）
  const theme = themeColors(n, md);
  let back = 0; // 色の狼に回さなかった分。ふつうの流れに足す（山場には入れない。子狼の山場が膨らんで家を押し切った）
  const colors = COLOR_ORDER.filter((c) => theme.includes(c) || COLORS[c].from === n);
  if (colors.length) {
    const share = Math.min(0.6, 0.15 + n / 150); // 終盤は6割が色の狼（弱い武器を使い分けるほど楽になる）
    // 1色あたりは、出られる色ぜんぶで分けたときの2倍まで。残りはふつうの狼に戻す
    // （1色に全部回すと、赤（速い）ばかり145匹の晩ができて、そこで必ず家が落ちた）
    const can = COLOR_ORDER.filter((c) => COLORS[c].from < n && c !== 'gold' && c !== 'green').length;
    const full = left * share;
    const pot = full * Math.min(1, (2 * colors.length) / Math.max(colors.length, can));
    left -= full;
    back = full - pot;
    const cw: Partial<Record<WolfColor, number>> = {};
    for (const c of colors) cw[c] = (md === 'beni' && c === 'red' ? 2.5 : 1) * (COLORS[c].from === n ? 0 : 1);
    const cwSum = colors.reduce((a, c) => a + cw[c]!, 0);
    for (const c of colors) {
      if (COLORS[c].from === n) {
        lines.push({ kind: 'wolf', count: 3, interval: 2.5, delay: 3, color: c });
        continue;
      }
      if (!cwSum) continue;
      // 色の子狼は序盤だけ多め（終盤に数百匹の色の子狼が一度に来て、跳び越えて家を押し切る晩があった）。
      // 1色に予算がまとまるので、子狼と狼に割合で分ける（くじで片方にすると、子狼ばかり数百匹の晩ができた）
      const pupShare = Math.max(0.1, 0.7 - n / 50);
      for (const [kind, k] of [['pup', pupShare], ['wolf', 1 - pupShare]] as [WolfKind, number][]) {
        const count = Math.round((pot * cw[c]! * k) / cwSum / (THREAT[kind] * COLORS[c].threat));
        if (count < 1) continue;
        const span = length * (0.6 + rand() * 0.3);
        lines.push({ kind, count, interval: span / count, delay: 2 + rand() * length * 0.3, color: c });
      }
    }
  }
  // 緑（起き上がる）は1晩に2〜3匹まで（色が2色の晩は出さない）。金（全部強い）はめったに出ない（4晩に1晩くらい・1匹だけ）
  if (COLORS.green.from <= n && n % 10 !== 0 && (n === COLORS.green.from || (theme.length < 2 && rand() < 0.5))) {
    const count = n === COLORS.green.from ? 2 : 2 + (rand() < 0.4 ? 1 : 0);
    lines.push({ kind: 'wolf', count, interval: 6, delay: length * (0.15 + rand() * 0.3), color: 'green' });
    left -= THREAT.wolf * COLORS.green.threat * count;
  }
  if (COLORS.gold.from <= n && (n === COLORS.gold.from || rand() < 0.25)) {
    lines.push({ kind: 'wolf', count: 1, interval: 1, delay: length * (0.3 + rand() * 0.3), color: 'gold' });
    left -= THREAT.wolf * COLORS.gold.threat;
  }
  // 人狼：1晩に1〜2匹（男女のつがいで来る晩も）。カラス：小さな群れで
  if (FOES_READY && n % 10 !== 0) {
    const at = () => length * (0.2 + rand() * 0.5);
    if (n >= FROM.wwoman && (n === FROM.wwoman || rand() < 0.45)) {
      const pair = n >= FROM.wman && rand() < 0.35;
      const d = at();
      lines.push({ kind: 'wwoman', count: 1, interval: 1, delay: d });
      left -= THREAT.wwoman;
      if (pair) {
        lines.push({ kind: 'wman', count: 1, interval: 1, delay: d - 1.5 });
        left -= THREAT.wman;
      }
    } else if (n >= FROM.wman && (n === FROM.wman || rand() < 0.4)) {
      lines.push({ kind: 'wman', count: 1, interval: 1, delay: at() });
      left -= THREAT.wman;
    }
    if (n >= FROM.crow && (n === FROM.crow || rand() < 0.4)) {
      const count = 2 + Math.floor(rand() * Math.min(4, 1 + n / 25));
      lines.push({ kind: 'crow', count, interval: 0.6, delay: at() });
      left -= THREAT.crow * count;
    }
  }
  left = Math.max(0, left);

  // 3割は山場に取っておく（2晩目から）
  const surgeBudget = n >= 2 ? left * 0.3 : 0;
  left -= surgeBudget;
  left += back;

  // ふつうの流れ：晩が進むほど、子狼より重い狼の割合が増える
  const kinds = (Object.keys(THREAT) as WolfKind[]).filter((k) => k !== 'alpha' && !FOES.includes(k) && FROM[k] <= n);
  const weight: Record<WolfKind, number> = {
    pup: Math.max(0.15, 1.2 - n / 40),
    wolf: 0.6 + n / 100,
    armored: 0.3 + n / 80,
    howler: 0.2 + n / 150,
    alpha: 0,
    wman: 0,
    wwoman: 0,
    crow: 0,
    king: 0,
  };
  if (md === 'mure') weight.pup *= 4;
  if (md === 'yoroi') weight.armored *= 2; // 2026-10-06 3倍だと46晩で鎧狼が20匹（ふつうの晩の約3倍）になり、自動操作がそこで止まった
  if (md === 'toboe') weight.howler *= 3;
  const total = kinds.reduce((a, k) => a + weight[k], 0);
  for (const k of kinds) {
    // 出てくる晩に入ったら、少なくとも1匹は出す
    const count = Math.max(1, Math.round((left * weight[k] * (0.8 + rand() * 0.4)) / total / THREAT[k]));
    const span = length * (0.6 + rand() * 0.3);
    lines.push({ kind: k, count, interval: span / count, delay: rand() * length * 0.25 });
  }

  // 山場：晩の半ばすぎに、一番多い種類と重い種類をまとめて。
  // 10晩目からは半分くらいの晩で、今夜の色の狼ばかりの群れ（同じ弱い武器がまとめて効く見せ場。レビュー5）
  if (surgeBudget > 0) {
    const at = length * (0.5 + rand() * 0.15);
    const heavy = kinds.filter((k) => k !== 'pup');
    const pack = surgePack(n, theme);
    const main: WolfKind = pack ? (n < 25 ? 'pup' : 'wolf') : heavy.length && rand() < 0.5 ? heavy[Math.floor(rand() * heavy.length)] : 'pup';
    const count = Math.max(3, Math.floor((surgeBudget * 0.7) / (THREAT[main] * (pack ? COLORS[pack].threat : 1))));
    lines.push({ kind: main, count, interval: 0.25, delay: at, surge: true, color: pack });
    const pups = Math.floor((surgeBudget * 0.3) / THREAT.pup);
    if (pups > 0) lines.push({ kind: 'pup', count: pups, interval: 0.2, delay: at + 0.3, surge: true });
  }
  return lines;
}

// その晩の色（1〜2色）。新顔の晩は新顔だけ。紅月の夜は赤を必ず入れる。同じ晩はいつも同じ
export function themeColors(n: number, md = mood(n)): WolfColor[] {
  const can = COLOR_ORDER.filter((c) => COLORS[c].from < n && c !== 'gold' && c !== 'green');
  if (!can.length || newColors(n).some((c) => c !== 'gold' && c !== 'green')) return [];
  const quiet = newColors(n).length > 0; // 緑・金の新顔の晩は1色だけ
  let seed = n * 4931 + 11;
  const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  r();
  const pick: WolfColor[] = md === 'beni' && can.includes('red') ? ['red'] : [];
  const want = can.length >= 2 && n >= 20 && !quiet && r() < 0.45 ? 2 : 1;
  while (pick.length < want) {
    const c = can[Math.floor(r() * can.length)];
    if (!pick.includes(c)) pick.push(c);
  }
  return pick;
}

// 山場を色の狼の群れにする晩なら、その色（10晩目から半分くらい）
export function surgePack(n: number, theme = themeColors(n)): WolfColor | undefined {
  if (n < 10 || !theme.length) return undefined;
  const seed = (n * 2654435761) >>> 0;
  return (seed >>> 8) % 100 < 50 ? theme[(seed >>> 4) % theme.length] : undefined;
}

// 10晩ごとの大狼の色：10晩は灰、そのあと 赤・紫・橙・黒・緑・金 と回す
const BOSS_COLORS: (WolfColor | undefined)[] = [undefined, 'red', 'purple', 'orange', 'black', 'green', 'gold'];
export function bossColor(n: number): WolfColor | undefined {
  return BOSS_COLORS[(n / 10 - 1) % BOSS_COLORS.length];
}

// その晩に初めて出る色（新顔）
export function newColors(n: number): WolfColor[] {
  return COLOR_ORDER.filter((c) => COLORS[c].from === n);
}
