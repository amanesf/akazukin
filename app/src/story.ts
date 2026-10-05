// 題字の画面の「ストーリー」から開く読みもの：ストーリー・キャラクター・ゲーム概要（2026-10-04 アマネさん）。
// 文はアマネさんの note「ゲームを作り始める」をもとに詳しくした（**仮・アマネさん未確認**）。絵はゲームの中で使っている絵をそのまま使う
import { COLOR_ORDER, COLORS, COMBO, DOG_ORDER, DOGS, FINISHERS, SPECIALS, WOLVES, type DogKind, type Finisher, type Special, type WolfKind } from './config';

const B = import.meta.env.BASE_URL;

const CHAPTERS: { no: string; title: string; body: string[]; line?: string }[] = [
  {
    no: '其の一',
    title: '狼狩りの猟師',
    body: [
      '明治のはじめ。桜の名所として知られる山あいの町に、腕利きの猟師がいました。',
      'ある春の晩、町はずれの森で、ひとりの娘が狼の群れに囲まれていました。駆けつけた猟師は、背負った大砲と紅い弓で群れを一匹残らず退治し、娘を救います。',
      'その娘こそ、のちのおばあさん。それが縁でふたりは結ばれ、森の入り口に家を構えて、静かに暮らしました。',
    ],
  },
  {
    no: '其の二',
    title: '遺されたもの',
    body: [
      '時は流れて大正。町には汽車が通り、家も洋館づくりの二階家に建て替えられました。猟師――おじいさんは、数年前に世を去っています。',
      '家に遺されたのは、からくり仕掛けの大砲、紅い弓、二振りの大ナイフ、そして三匹の番犬。おじいさんは最期まで「狼はまた来る」と言い残していたといいます。',
      'その言葉を信じていたのは、休みのたびに遊びに来る孫娘だけでした。幼いころから、おじいさんに狩りの手ほどきを受けてきた子です。',
    ],
  },
  {
    no: '其の三',
    title: '紅い月',
    body: [
      '大正のある春、桜が満開を迎えた晩。空に、血のように紅い満月が昇りました。',
      '月に一筋の裂け目が走り、そこから異界の狼たちがあふれ出します。かつておじいさんに滅ぼされた群れの、さらに奥に潜んでいた眷属たち。狙いは、おじいさんが遺した家と、その一族です。',
      '裂け目は九十九夜のあいだ開き続け、夜ごとに狼の数は増えていきます。そして裂け目の最も奥には、かつて封じられた大神――狼王が眠っているといいます。',
    ],
  },
  {
    no: '其の四',
    title: '赤ずきん',
    body: [
      '迎え撃つのは、孫娘の赤ずきん。',
      '狼の耳のフードをかぶり、背中にはおじいさんの主砲、手には二振りのナイフと紅い弓。見た目はかわいい女の子ですが、猟師の技をすべて受け継いだ彼女こそ、狼から見れば最も恐ろしい相手です。',
    ],
    line: 'おばあちゃんの家には、一匹だって近づけさせないんだから♪',
  },
];

const PEOPLE: { name: string; kana: string; tag: string; img: string; fit?: string; text: string; line?: string }[] = [
  {
    name: '赤ずきん',
    kana: 'あかずきん',
    tag: '主人公',
    img: 'ui/cutin.webp',
    fit: 'cover',
    text: '猟師の孫娘。ふだんはのんびり屋で、鼻歌まじりに狼を数える。おばあちゃんが大好き。二振りの大ナイフで斬り込み、離れた狼は紅い弓で射抜き、溜めた力は背中の主砲で撃ち放つ。追い詰められるほど笑顔になるのが、ちょっと怖い。',
    line: '今夜は何匹かな♪',
  },
  {
    name: 'おばあさん',
    kana: 'おばあさん',
    tag: '守るべき人',
    img: 'dogs/house.webp',
    text: 'かつて猟師に救われた娘。おっとりしているが芯は強く、狼の夜にも家を離れない。昼のあいだに赤ずきんの傷を手当てし、夜明けには家を繕ってくれる。家が落ちたら負け。',
    line: '無理をおしでないよ。……でも、頼んだよ',
  },
  {
    name: 'おじいさん',
    kana: 'おじいさん',
    tag: '亡き猟師',
    img: 'hero/cannon.webp',
    text: '伝説の狼狩り。主砲・弓・ナイフをこしらえ、三匹の番犬を育て、孫娘に狩りの手ほどきをした。いまは仏間の写真立ての中から、少し誇らしげに孫を見守っている。',
  },
];

const DOG_TEXT: Record<DogKind, string> = {
  shiba: '小さくて足が速い。誰よりも先に狼へ駆けていく。首の鈴が自慢。',
  akita: '落ち着いた白い秋田犬。打たれ強く、狼の前に立ちはだかる。',
  tosa: '横綱の綱を締めた土佐犬。足は遅いが、ひと噛みが重い。',
};

const WOLF_TEXT: Record<WolfKind, string> = {
  pup: '弱いが速く、群れで来る。赤ずきんに飛びかかり、跳び越えて家へ向かう。',
  wolf: '群れの主力。赤ずきんを取り囲むように寄ってくる。',
  armored: '鎧をまとった硬い狼。弓と主砲が効きにくい。近づいて斬れ。',
  howler: '後ろに居座って吠え、裂け目から子狼を呼び続ける。倒さないと増える一方。',
  alpha: '十夜ごとに現れる、紅いたてがみの大物。ほとんど弾き飛ばせない。夜ごとに色が変わる。九十九夜目には三頭が来る。',
  wman: '立って歩く狼の男。腕を振りかぶったら大振りが来る。その隙に大技を当てれば止まる。後ろに回っても振り向く。',
  wwoman: '立って歩く狼の女。跳んで近くへ下り、ひっかきを三度。着地の隙を斬れ。',
  crow: '空から赤ずきんにとまり、足を鈍らせる。左右にはじいて振りほどけ。',
  king: '九十九夜目、裂け目の奥から現れる封じられた大神。頭に浮かぶ印の武器を順に当てて、封を砕け。',
};
const COLOR_TEXT: Record<(typeof COLOR_ORDER)[number], string> = {
  red: '足が二倍で突っ込んでくる。',
  purple: '体力が二倍で、少し大きい。',
  black: '噛む力が二倍。家もすぐ齧る。',
  orange: '倒すと爆ぜて、まわりの狼を巻き込む。近くで倒すと少し痛い。',
  green: '倒しても起き上がる。必殺技でしか消えない。ほかを全部倒せば朝日で消える。',
  gold: '足・体力・噛む力がすべて二倍。めったに出ないが、賞金は五倍。',
};
const WOLF_RANK: Record<WolfKind, number> = { pup: 1, wolf: 2, armored: 3, howler: 3, alpha: 5, wman: 4, wwoman: 4, crow: 2, king: 5 };

const CONTROLS: [string, string][] = [
  ['タップ', '触った所にいちばん近い狼を、持っている武器で攻撃（ナイフ：走って行って斬る・続けて連撃／弓：その場から射る）'],
  ['ナイフ／弓（下のボタン）', '押すたびに持ち替える'],
  ['左右にはじく', '突進（動くのもこれ。通り道の狼を斬る・とまったカラスも振りほどく）'],
  ['上にはじく', '斬り上げ（追い打ちはタップ）'],
  ['下にはじく', '叩き落とし'],
  ['長押し→離す', '主砲（長く溜めるほど強い）。撃つと熱くなり、5発続けるとオーバーヒートで10秒撃てない（温度計を見て、手を止めて冷ます）'],
  ['コンボ', '3発のあと、4発目で締めの技（下の技一覧）'],
  ['小さい地図をタップ', 'そこへ駆けつける'],
  ['桜嵐（下の3つ）', '満タンで押す必殺技（下の技一覧）'],
  ['頭の上の印', '色の狼の頭の武器の絵は、弱い武器。その武器で当てると2倍（必殺技も同じ分け方）'],
];

const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);

function storyPage() {
  return `
    <figure class="st-hero"><img src="${B}ui/story-walk.webp" alt=""></figure>
    ${CHAPTERS.map((c) => `
      <article class="st-ch">
        <h3><small>${c.no}</small>${c.title}</h3>
        ${c.body.map((p) => `<p>${esc(p)}</p>`).join('')}
        ${c.line ? `<blockquote>「${esc(c.line)}」</blockquote>` : ''}
      </article>`).join('<div class="st-orn" aria-hidden="true"><i></i>❀<i></i></div>')}
    <p class="st-end">九十九の夜を守り抜き、狼王の封を砕けば、<br>月の裂け目は閉じ、異界の狼は絶える――。</p>`;
}

function charaPage() {
  const people = PEOPLE.map((p, i) => `
    <article class="st-card${i === 0 ? ' main' : ''}">
      <div class="pic${p.fit ? ' cover' : ''}"><img src="${B}${p.img}" alt=""></div>
      <div class="txt">
        <span class="tag">${p.tag}</span>
        <h4>${p.name}${p.kana !== p.name ? `<small>${p.kana}</small>` : ''}</h4>
        <p>${esc(p.text)}</p>
        ${p.line ? `<q>${esc(p.line)}</q>` : ''}
      </div>
    </article>`).join('');
  const dogs = DOG_ORDER.map((k) => `
    <article class="st-mini">
      <img src="${B}dogs/${k}.webp" alt="">
      <h5>${DOGS[k].name}<small>${DOGS[k].breed}</small></h5>
      <p>${DOG_TEXT[k]}</p>
    </article>`).join('');
  const colors = COLOR_ORDER.map((c) => `
    <article class="st-mini wolf col" style="--c:${COLORS[c].ui}">
      <img src="${B}wolves/col/${c}.webp" alt="">
      <h5>${COLORS[c].name}狼<small>${COLORS[c].word}</small></h5>
      <p>${COLOR_TEXT[c]}${COLORS[c].weak ? `<span class="weak"><img src="${B}ui/icons/${COLORS[c].icon}.webp" alt="">${COLORS[c].weak === 'sp' ? '必殺技' : SPECIALS[COLORS[c].weak].icon === 'knife' ? 'ナイフ' : SPECIALS[COLORS[c].weak].icon === 'bow' ? '弓' : '主砲'}に弱い</span>` : '<span class="weak">弱い武器なし</span>'}</p>
    </article>`).join('');
  const wolves = (Object.keys(WOLVES) as WolfKind[]).filter((k) => k !== 'king').map((k) => `
    <article class="st-mini wolf">
      <img src="${B}wolves/${k}.webp" alt="">
      <h5>${WOLVES[k].name}<small class="rank">${'★'.repeat(WOLF_RANK[k])}<span>${'★'.repeat(5 - WOLF_RANK[k])}</span></small></h5>
      <p>${WOLF_TEXT[k]}</p>
    </article>`).join('');
  return `
    ${people}
    <h3 class="st-sub"><small>番犬</small>おじいさんの三匹</h3>
    <p class="st-lead">はじめは豆助だけ。昼の強化（番犬の特殊）で白雪・鉄丸が仲間になる。「守り・攻撃・支援」の役目を決めると、夜は自分で考えて駆け回る。</p>
    <div class="st-grid">${dogs}</div>
    <h3 class="st-sub"><small>異界の狼</small>裂け目から来るもの</h3>
    <div class="st-grid">${wolves}</div>
    <h3 class="st-sub"><small>色の狼</small>ひとことで分かる</h3>
    <p class="st-lead">子狼と狼には色が付くことがある。頭の上の絵は弱い武器。1晩に出る色は1〜2色。同じ色ばかりの群れが来たら、その色に効く必殺技の出番。初めて出る夜は「新顔」と教えてくれる。</p>
    <div class="st-grid">${colors}</div>
    <h3 class="st-sub"><small>九十九夜目</small>裂け目の主</h3>
    <article class="st-card boss">
      <div class="pic"><img src="${B}wolves/king.webp" alt=""></div>
      <div class="txt">
        <span class="tag">最後の敵</span>
        <h4>狼王<small>ろうおう</small></h4>
        <p>${esc(WOLF_TEXT.king)}</p>
        <p>${esc('身を低くしたら跳べ。立ち上がったら引け。弓の印のあいだは、続けて来る遠吠えの波を跳びながら射て。印を全部砕けば、王は倒れ込む。追い詰められた王の遠吠えは、家まで届く。')}</p>
      </div>
    </article>`;
}

// 技一覧（2026-10-05 アマネさん「ストーリー画面に技一覧ほしい」）。武器の印は、色の狼の弱い武器と同じ分け方
// （ナイフ＝斬り全部・弓・主砲）。[入力, 名前, 武器の印, 説明]
const MOVE_LIST: [string, string, string, string][] = [
  ['タップ（ナイフ）', '斬り', 'knife', '触った所の狼へ走って行って斬る。続けて押すと連撃'],
  ['タップ（弓）', '弓', 'bow', 'その場から、触った所の狼を射る。矢は狙った狼を追い、通り道の狼を3匹まで貫く。群れを狙うと矢の雨（覚えていれば）'],
  ['左右にはじく', '突進', 'knife', 'はじいた向きへ駆け抜けて、通り道の狼をまとめて斬る。動くのもこれ。とまったカラスも振りほどく'],
  ['上にはじく', '斬り上げ', 'knife', '狼を宙へ打ち上げて一緒に跳ぶ。宙でタップすると追い打ち（2段ジャンプまで）'],
  ['下にはじく', '叩き落とし', 'knife', '宙の狼を地面へ叩きつける。跳ね返った狼がまわりにも当たる'],
  ['長押し→離す', '主砲', 'cannon', '背中の主砲を撃つ。長く溜めるほど強く、まわりの狼をまとめて吹き飛ばす。熱がたまる（半分の溜め 0.5・満タン 1・零距離主砲 0）。5でオーバーヒート、10秒撃てない'],
];
const FIN_TEXT: Record<Finisher, [string, string, string]> = { // [入力, 武器の印, 説明]
  issen: ['タップ', 'knife', '大きな一太刀。前の狼をまとめて吹き飛ばす'],
  tsuki: ['左右にはじく', 'knife', 'ふつうの突進の1.5倍の距離を駆け抜け、斬った狼を打ち上げる'],
  renbu: ['上にはじく', 'knife', '打ち上げて宙で追い打ち3回、最後に叩きつける（自動で続く）'],
  jiwari: ['下にはじく', 'knife', '地面を割って、まわりの狼をまとめて打ち上げる'],
  reishiki: ['長押し', 'cannon', 'ほんの少しの溜めで、満タンの主砲を目の前に撃ち込む'],
};
const SP_TEXT: Record<Special, string> = {
  senbon: '斬りで溜まる。桜の竜巻で狼を吸い寄せ、ナイフを手に画面の左右を駆け抜け、最後にまわりをダンとすべて弾く',
  nagare: '弓で溜まる。竜巻で吸い寄せ、跳んで矢を撃ち下ろし、最後に大きな一本ですべてを貫く',
  midare: '主砲で溜まる。竜巻で吸い寄せ、まわりの狼に光の弾をズババババと撃ち込み、最後にズドン',
};
const FIN_ORDER: Finisher[] = ['issen', 'tsuki', 'renbu', 'jiwari', 'reishiki'];
const SP_ORDER: Special[] = ['senbon', 'nagare', 'midare'];
const moveRow = (key: string, name: string, icon: string, text: string) =>
  `<li><span class="key">${key}</span><b><img src="${B}ui/icons/${icon}.webp" alt="">${name}</b><p>${text}</p></li>`;

function movesPart() {
  const grades = COMBO.grades.map((g) => `${g.name}×${g.mul}`).join('・');
  return `
    <h3 class="st-sub"><small>技一覧</small>赤ずきんの技</h3>
    <p class="st-lead">技の横の絵は武器（ナイフ・弓・主砲）。色の狼の頭の印と同じ武器で当てると2倍。</p>
    <h4 class="st-mh">基本の技</h4>
    <ul class="st-moves">${MOVE_LIST.map(([k, n, i, t]) => moveRow(k, n, i, t)).join('')}</ul>
    <h4 class="st-mh">コンボの締め<small>3発のあとの4発目</small></h4>
    <p class="st-lead">タップ・はじくを何でも3発つなぎ、4発目の入力で締めの技を選ぶ。1〜3発目に違う種類を混ぜるほど締めが強くなる（${grades}）。0.8秒あく・空振り・噛まれると切れる。</p>
    <ul class="st-moves">${FIN_ORDER.map((f) => moveRow(FIN_TEXT[f][0], FINISHERS[f].name, FIN_TEXT[f][1], FIN_TEXT[f][2])).join('')}</ul>
    <h4 class="st-mh">必殺技・桜嵐<small>画面の下の3つ</small></h4>
    <p class="st-lead">当てた武器のゲージが溜まり、満タンになったら押す。その夜の狼の体力に対する割合で溜まる（1晩に1回ずつくらい）。</p>
    <ul class="st-moves">${SP_ORDER.map((sp) => moveRow('満タンで押す', SPECIALS[sp].name, SPECIALS[sp].icon, SP_TEXT[sp])).join('')}</ul>`;
}

function gamePage() {
  return `
    <p class="st-catch">夜は戦い、昼は備える。<br><span>99夜、おばあさんの家を守り抜け。</span></p>
    <div class="st-flow">
      <div class="night"><b>夜</b><p>右の月の裂け目から来る狼を、赤ずきんで迎え撃つ。家が落ちたら、その日の昼からやり直し（その夜に拾った銭は残る）。</p></div>
      <div class="day"><b>昼</b><p>倒した狼の銭で「体力・近接・主砲と弓・番犬」を鍛え、家を直し、番犬3匹の役目を決める。</p></div>
      <div class="goal"><b>99夜</b><p>最後の夜、裂け目の主・狼王を倒せば狼は絶滅。完全クリア。</p></div>
    </div>
    <h3 class="st-sub"><small>操作</small>指一本で</h3>
    <dl class="st-ctl">${CONTROLS.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>
    ${movesPart()}
    <p class="st-note">5夜目からは、霧の夜・紅月の夜など、夜の様子が変わることがある。夜が進むと色の狼・人狼・カラスも現れ、十夜ごとに大狼が来る。ゴリ押しより、弱い武器の使い分けと強化が大事。節目の夜を越えると、昼におばあさんと話せる。</p>
    <p class="st-note">スマホの縦画面で遊ぶ。1晩目は「やってみよう」で順に教えてくれる。</p>`;
}

// ストーリー → キャラクター → ゲーム概要を1本に続けて読む（2026-10-04 アマネさん「タブ切り替えじゃなくて下に続けて」）
const PARTS: [string, string, string, () => string][] = [
  ['story', '物語', 'ストーリー', storyPage],
  ['chara', '登場人物', 'キャラクター', charaPage],
  ['game', '遊び方', 'ゲーム概要', gamePage],
];

let root: HTMLElement | null = null;

export function openStory() {
  if (!root) {
    root = document.createElement('div');
    root.id = 'story';
    root.innerHTML = `
      <header><h2><small>桜狼異聞</small>大正赤ずきん</h2></header>
      <div class="st-body">${PARTS.map(([id, kanji, name, page], i) => `
        <section data-page="${id}">
          ${i ? `<h2 class="st-part"><i></i><span><small>${kanji}</small>${name}</span><i></i></h2>` : ''}
          ${page()}
        </section>`).join('')}</div>
      <button class="st-close">もどる</button>`;
    document.body.appendChild(root);
    root.querySelector('.st-close')!.addEventListener('click', () => root!.classList.remove('open'));
  }
  root.querySelector('.st-body')!.scrollTop = 0;
  root.classList.add('open');
}
