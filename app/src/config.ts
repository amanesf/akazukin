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
// タップ＝触った所にいちばん近い狼を、持っている武器（ナイフ／弓・ボタンで持ち替え）で攻撃。左右にはじく＝突進（移動）、上＝斬り上げ、下＝叩き落とし、長押し→離す＝主砲。
// 自動の攻撃はない・地面をタップして走るのもやめた（2026-10-05 アマネさん「自動攻撃一切なくす」「はじくのほうが直感的」）
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
// ナイフ：斬りは目の前の狼にまとめて当たる（狙った1匹に加えて cleave 匹まで、mul 倍の威力）。締めの一閃は前の狼に全部
// （2026-10-06 アマネさん「ナイフのほうが強くあってほしい」。1匹ずつだと、群れには主砲の3分の1も削れなかった）
export const KNIFE = { cleave: 2, mul: 0.7 };
// 弓は「離れて安全に削る」ぶん、ナイフより一段下に（2026-10-06 アマネさん「弓と主砲は被るからそんな強くなくていい」→「主砲は強めがいいな」）。
// 弓：狙った狼を抜けたあとの狼には pierceMul 倍。主砲：満タンの威力は fullMul 倍・半チャージは halfMul 倍（主砲は強めのまま）
export const RANGED = { pierceMul: 0.5, fullMul: 2, halfMul: 1 };
// 弓：届く距離・タップがこれより遠い狼には撃たない。矢の雨になる群れの数と、その群れの広さ
export const BOW = { range: 520, crowd: 3, crowdSpan: 160 };
// タップした所から、この距離までの狼を「触った狼」として探す（地面の位置で。いなければ空振り）
export const TAP_REACH = 420;
// 突進斬り：その方向へ突き抜け、通り道の狼を全部斬る。2026-10-04 連発でほぼ無敵だった（狼がひるみ続けて噛めない）ので、
// 無敵は出始めだけ・斬られた狼のひるみは短く・次の突進まで間を空ける・威力は下げる（突進は動くための技。削るのは斬り）
// 2026-10-05 はじくが移動の手段になったので、待ち時間を 1.0→0.5秒
export const DASH = { dist: 230, iframes: 0.12, cd: 0.5, stun: 0.1 };
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
  // 2026-10-05 自分で撃つようになったので、引く時間を 0.36→0.5秒（連打で離れた所から安全に削れすぎた。ナイフより遅く）
  bow: { name: '弓', dur: 0.5, reach: 0, damage: 16 },
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
// 主砲の撃ち込みの砲弾：速さ・届く距離・4発の間（秒）・貫いたときの威力の割合（届いた先の爆発は hougeki の威力そのまま）
// 2026-10-05 4発は同時に（アマネさん「4連装で一斉なのにバラバラ」）
export const SHELL = { speed: 1500, range: 620, pierce: 0.6 };
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
  nagare: { name: '桜流れ矢', icon: 'bow', share: 0.1 }, // 弓（弓・矢の雨）で溜まる
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

// ── 昼に買うもの：10個（2026-10-05 アマネさん「強化はわかりやすいのがいい。安めの金額で攻撃力アップ、高い金額で機能アップ」
// 「今の強化は比率でアップしたり機能もアップしたりルールわからん」）。列は 体力・ナイフ・主砲・弓・番犬 の5つ。
// 上段（基本）：安い・何回でも・毎回同じだけ上がる（攻撃力は足し算で +10% ずつ）。下段（特殊）：高い・各3つを順に・新しいことができる ──
export type Track = 'body' | 'knife' | 'cannon' | 'bow' | 'dog';
export const TRACK_ORDER: Track[] = ['body', 'knife', 'cannon', 'bow', 'dog'];
export const TRACK_NAME: Record<Track, string> = { body: '体力', knife: 'ナイフ', cannon: '主砲', bow: '弓', dog: '番犬' };
// 上段：1回で step 上がる（体力は数、ほかは割合・足し算）。値段は買った回数 n で 1.35倍ずつ（最初は安く、たくさん買うほど高い）。
// 2026-10-05 +10%・値段 60+25n だと、自動操作が40晩で +100%・99晩で +400% になり、後半は何もしなくても勝てた。
// 前の強化（99晩で近接の威力 約2倍）に合わせ、+5%・1.35倍に：30晩で約+50%・99晩で約+100%（1つの列に約20回）
export const BASIC: Record<Track, { note: string; step: number }> = {
  body: { note: '体力 +20', step: 20 },
  knife: { note: '攻撃力 +5%', step: 0.05 },
  cannon: { note: '攻撃力 +5%', step: 0.05 },
  bow: { note: '攻撃力 +5%', step: 0.05 },
  dog: { note: '体力・噛む力 +5%', step: 0.05 },
};
export const basicCost = (n: number) => Math.round((25 * 1.4 ** n) / 5) * 5;
// 下段：順に覚える。id で効き目を見る（2026-10-06 アマネさん「下段は３段階しかないのは寂しい。５個以上」→ 各6つ）。
// 列ごとの性格：体力＝倒れない・粘る／ナイフ＝前へ攻める・つなぐ／主砲＝熱と付き合う・一発を大きく／弓＝離れて手数・崩す／番犬＝仲間を増やして任せる。
// 並びは「安い順に、効き目が分かりやすい物 → 遊び方が変わる物」。熱を軽くするもの（主砲 2・4）は、熱そのものを無くさない
// （連射すれば 6発でオーバーヒートする）。主砲 6 はオーバーヒートを「罰」から「見せ場」に変える
export type UpId =
  | 'rise' | 'tough' | 'regen' | 'repel' | 'rage' | 'endure' // 体力
  | 'dashFar' | 'finBig' | 'drain' | 'chain' | 'slashWave' | 'dash2' // ナイフ
  | 'quick' | 'cool' | 'hougeki' | 'coolFast' | 'bigBlast' | 'vent' // 主砲
  | 'draw' | 'ame' | 'pierce' | 'longBow' | 'stagger' | 'twin' // 弓
  | 'akita' | 'tosa' | 'dogRevive' | 'dogFast' | 'dogHold' | 'dogHowl'; // 番犬
export const SPECIAL_UPS: Record<Track, { id: UpId; note: string }[]> = {
  body: [
    { id: 'rise', note: '倒れても早く起きる' },
    { id: 'tough', note: '噛まれてもひるみにくい' },
    { id: 'regen', note: '体力が少しずつ戻る' },
    { id: 'repel', note: '噛まれるとまわりを弾き返す' },
    { id: 'rage', note: '体力が3割を切ると攻撃力1.3倍' },
    { id: 'endure', note: '一晩に一度、倒れずに踏みとどまる' },
  ],
  knife: [
    { id: 'dashFar', note: '突進が遠くまで' },
    { id: 'finBig', note: '締めの威力 1.5倍' },
    { id: 'drain', note: '斬ると体力が戻る' },
    { id: 'chain', note: '連撃がつながりやすい' },
    { id: 'slashWave', note: '締めで斬撃が前へ飛ぶ' },
    { id: 'dash2', note: '突進を2回続けて出せる' },
  ],
  cannon: [
    { id: 'quick', note: '溜めが速く' },
    { id: 'cool', note: '熱の上限 +1' },
    { id: 'hougeki', note: '満タンで4連装の砲弾' },
    { id: 'coolFast', note: '撃ち止めると早く冷める' },
    { id: 'bigBlast', note: '満タンの爆発が広く' },
    { id: 'vent', note: 'オーバーヒートでまわりを吹き飛ばす' },
  ],
  bow: [
    { id: 'draw', note: '弓を引くのが速く' },
    { id: 'ame', note: '群れに矢の雨' },
    { id: 'pierce', note: '矢が貫く数 +2・抜けても弱まらない' },
    { id: 'longBow', note: '矢が遠くまで届く' },
    { id: 'stagger', note: '矢の当たった狼が止まる' },
    { id: 'twin', note: '矢を2本ずつ放つ' },
  ],
  dog: [
    { id: 'akita', note: '秋田（白雪）が仲間に' },
    { id: 'tosa', note: '土佐（鉄丸）が仲間に' },
    { id: 'dogRevive', note: '倒れても半分の時間で戻る' },
    { id: 'dogFast', note: '番犬が速く走る' },
    { id: 'dogHold', note: '番犬が足止めできる数 +1' },
    { id: 'dogHowl', note: '番犬が吠えて狼をすくませる' },
  ],
};
// 下段の値段は「どの列でも、下段をいくつ買ったか（n）」で決まる：1つ買うたびに全部の下段が高くなる
// （2026-10-06 アマネさん「70晩で全部揃うのは嫌。かなりやり込まないと全部揃わない。99晩である武器種はマックス、あとは5〜6割」）。
// 最初は安く（5個で約2,600銭：序盤の壁に間に合う）、後ほど急に高く：20個で約5.4万・30個で約15.4万銭。
// 99晩の稼ぎ（約13.5万）では、上段にも使うと20個前後＝1つの列を極めて、ほかは半分くらい。
// 2026-10-06 400+320n だと序盤の下段が高すぎ、自動操作が20晩前後で止まった
// 家が落ちても、その夜に拾った銭は残る：繰り返し挑むほど銭が貯まり、そろいに近づく（アマネさん「繰り返し死ぬことでお金が貯まっていく」）
export const specialCost = (n: number) => Math.round((250 + 100 * n + 12 * n * n) / 10) * 10;
// デバッグモードの「強化をその晩らしく」：自動操作（scripts/bot.mjs）がその晩の前の昼に着いていた強化。[晩, 上段の回数（5つの平均）, 下段の数（5つの平均）]
export const GROWTH_TABLE: [number, number, number][] = [[1, 0, 0], [11, 2, 1], [21, 4, 2], [31, 7, 3], [41, 10, 3], [61, 15, 3], [81, 18, 3], [99, 20, 3]]; // 2026-10-05 計測（種1〜3）
// 下段の効き目の数値
export const UP = {
  rise: 0.6, // 倒れている時間の倍率
  tough: 1.6, // 噛まれてひるんだあと、ひるまない秒（ふつう 0.7）
  regen: 0.01, // 1秒に体力の何割が戻る
  repel: { cd: 5, r: 130, damage: 20, kb: 520 }, // 噛まれたとき、まわり r を弾き返す（cd 秒に1回）
  rage: { below: 0.3, mul: 1.3 },
  dashFar: 1.5, // 突進の距離の倍率
  finBig: 1.5,
  drain: 0.01, // 斬って当てるたび、体力の何割が戻る
  chain: 1.5, // 連撃の間（COMBO.window）の倍率
  slashWave: { damage: 30, range: 420, speed: 1100 }, // 締めが当たると、前へ飛ぶ斬撃（通り道の狼を斬る）
  dash2: 0.12, // 1回目の突進のあと、2回目までの待ち（秒）
  quick: 0.3, // 溜めの速さ +割合
  coolWait: 0.7, // 冷め始めるまで（ふつう HEAT.wait）
  bigBlast: 1.4, // 満タンの主砲の範囲の倍率
  vent: { r: 240, damage: 70, kb: 700 }, // オーバーヒートの瞬間、まわりを吹き飛ばす
  draw: 0.3, // 弓を引く速さ +割合
  pierce: 2,
  longBow: 1.3, // 弓の届く距離の倍率
  stagger: 0.9, // 矢の当たった狼が止まる秒（ふつう 0.3）
  dogFast: 1.25,
  dogHowl: { every: 12, r: 200, stun: 0.9 }, // 番犬が吠える間隔・届く距離・すくむ秒
  twin: 1, // 2本目の矢の威力の割合（2026-10-06 アマネさん「弓は中盤まで弱めだけど、マックスまで育てたらかなり強い」→ 全力）
};
// 前の版（v3 まで）の強化の値段。読み込むとき、使った銭を返す（作りが変わったので買い直してもらう）
export const OLD_TRACK_COSTS = [80, 180, 340, 560, 850, 1200];
export const OLD_TRAIN_COST = (n: number) => 1300 + 450 * n;

// 主砲の熱（2026-10-05 アマネさん「主砲の温度が上昇して一定に達するとしばらく使えなくなる。連続使用の制限。5回とか」）。
// 半チャージ 0.5・満タン 1（撃ち込みもまとめて1）・零距離主砲 0。撃っている間は冷えない：最後に撃ってから wait 秒たつと rate/秒で冷める。
// max でオーバーヒート：lock 秒撃てない（そのあと 0）
// 2026-10-06 アマネさん「5回多い気がする。4回くらいでも」→ 上限 5→4
export const HEAT = { half: 0.5, full: 1, max: 4, wait: 1.5, rate: 1, lock: 10 };
// 家の修繕はやめた：家は毎晩、元どおりに直って始まる（2026-10-06 アマネさん「家の修理はなくしたい。毎回家はリセット」）


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
