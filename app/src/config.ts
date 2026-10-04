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
  reviveTime: 4, // 倒れたら家の前で立ち上がるまで
  hitStunTime: 0.22,
  lunge: 130, // タップした狼がこれより近ければ、踏み込んで斬る（遠ければ走って行って斬る）
  buffer: 0.4, // 技の途中の入力を覚えておく秒数（先行入力）
};
export const AUTO = { slash: 0.5, bow: 0.85, bowRange: 520 }; // 弓は速く・遠くまで（2026-10-04 アマネさん「弓矢もっと役に立たせたい」） // 触っていないとき：斬りの間隔・弓の間隔・弓の届く距離
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
};
// 矢はほぼまっすぐ速く（2026-10-04 アマネさん「弓矢がもっとまっすぐ飛ぶように。しょぼい」）。矢の雨だけ空から降る（RAIN）
export const BOW_FLIGHT = { base: 0.12, perUnit: 0.00025, hitRadius: 40, pierce: 3 }; // 矢は狙った狼を追い、通り道の狼を3匹まで貫く
export const RAIN_FLIGHT = { base: 0.3, perUnit: 0.0005 };
export const MOVE_CD = { kaiten: 2.5, tosshin: DASH.cd, ame: 5, hougeki: 0 };
// 桜嵐：3つの必殺技（2026-10-04 アマネさん「連撃して主砲みたいな感じ」「その夜の武器の使い方に応じて3種類がそれぞれ溜まる。ボタン3つ」）。
// どれも桜の竜巻でまわりの狼を吸い寄せる（竜巻そのものは斬らない・アマネさん「竜巻は全部残す。ダメージはない。吸い寄せのみ」）。
// 削るのは技ごとの飛び道具。溜まり方は当てたダメージに比例（斬りは手数が多いので数で数えると千本桜ばかり溜まる）。
// 噛まれても溜まる（3つとも。前の半分）
export type Special = 'senbon' | 'nagare' | 'midare';
export const SPECIAL_ORDER: Special[] = ['senbon', 'nagare', 'midare'];
export const SPECIALS: Record<Special, { name: string; icon: string; gain: number }> = {
  // gain：当てたダメージ1あたり、どれだけ溜まるか（0〜100）
  senbon: { name: '千本桜', icon: 'knife', gain: 0.07 }, // 斬り（連撃・突進・斬り上げ・叩き落とし・回転）で溜まる
  nagare: { name: '桜流れ矢', icon: 'bow', gain: 0.25 }, // 弓（自動の弓・矢の雨）で溜まる
  midare: { name: '主砲乱れ撃ち', icon: 'cannon', gain: 0.1 }, // 主砲（長押し・撃ち込み・連撃の締めの主砲）で溜まる
};
export const OURAN = {
  time: 3,
  tick: 0.15, // 吸い寄せと、技の手を出す間隔
  pull: 420, // 吸い寄せる距離
  hurt: 0.3, // 噛まれたダメージ1あたり、3つとも溜まる
  // 千本桜：まわりの狼めがけてナイフを投げ続け、最後に一斉に刺す
  knife: { damage: 11, perTick: 6, reach: 420, final: 70 },
  // 桜流れ矢：前へまっすぐ貫く矢を奥・中・手前に一斉に。最後に大きく一斉射
  volley: { damage: 16, lanes: 3, range: 640, pierce: 8, final: 9 },
  // 主砲乱れ撃ち：群れへ砲弾を連射し、最後に満タンの主砲
  barrage: { damage: 30, area: 80, perTick: 2, final: 110, finalArea: 260 },
};
export const COMBO_RESET = 1.2; // これだけ当てずにいるとコンボ数が0に戻る

// ── 昼に買うもの：体力・近接・主砲の3本（2026-10-03・アマネさん「何を強化するかがわかればいい」
// 「技選択までボタン増えると多くてしんどい」）。技は近接・遠隔の段を上げると自然に覚える ──
export type Track = 'body' | 'near' | 'far' | 'dog';
export type SkillId = 'kaiten' | 'tosshin' | 'shiki' | 'ame' | 'hougeki';
export interface Perk {
  note: string; // 昼のボタンに出す「次は何が起きるか」
  hp?: number;
  combo?: number;
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
      { note: 'コンボ +1', combo: 1 },
      { note: '回転斬りを覚える（囲まれてタップ）', learn: 'kaiten' },
      { note: '近接の威力 +2割', power: 0.2 },
      { note: 'コンボ +1', combo: 1 },
      { note: '近接の威力 +2割', power: 0.2 },
      { note: '連撃の締めが主砲に', learn: 'shiki' },
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

export const COMBO_BASE = 4; // 斬り・斬り・斬り上げ・叩き落とし

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
  pup: { name: '子狼', hp: 30, damage: 5, interval: 0.6, speed: 70, size: 38, bounty: 2, arrowResist: 0 },
  wolf: { name: '狼', hp: 90, damage: 11, interval: 0.8, speed: 48, size: 56, bounty: 4, arrowResist: 0 },
  armored: { name: '鎧狼', hp: 300, damage: 20, interval: 1.0, speed: 28, size: 70, bounty: 12, arrowResist: 0.6, heavy: 0.4 },
  // 遠吠え：近くの狼を速くする（後ろに居座る。主砲で落とす相手）
  howler: { name: '遠吠え', hp: 120, damage: 6, interval: 1.0, speed: 30, size: 56, bounty: 10, arrowResist: 0.3 },
  alpha: { name: '大狼', hp: 1800, damage: 45, interval: 1.2, speed: 18, size: 120, bounty: 120, arrowResist: 0.4, heavy: 0.8 },
};
export const HOWL = { radius: 220, speedMul: 1.5, holdX: 620 };
// 狼の攻め方（特性ごと）：遠吠えは遠くから衝撃波、子狼は飛びかかる
export const SHOCKWAVE = { range: 460, interval: 3.2, speed: 260, damage: 12 };
// 子狼は主人公を跳び越えて家へ向かう（立っているだけでは止められない）
export const POUNCE = { range: 160, interval: 2.5, lift: 420, speed: 400, damage: 8 };
// 狼は主人公が近いと奥行きを寄せて向かってくる（子狼は寄せない）
export const STEER = { range: 200, speed: 0.5 };

// 1波＝1晩。波の合間は昼。99日生き残れば完全クリア＝狼絶滅（2026-10-03・アマネさん）。
// 晩は手で並べず、晩ごとの「狼の予算」で組む（nights.ts。plan.md §5）
export const DAYS_TO_CLEAR = 99;
