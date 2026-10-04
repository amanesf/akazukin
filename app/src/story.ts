// 題字の画面の「ストーリー」から開く読みもの：ストーリー・キャラクター・ゲーム概要（2026-10-04 アマネさん）。
// 文はアマネさんの note「ゲームを作り始める」をもとに詳しくした（**仮・アマネさん未確認**）。絵はゲームの中で使っている絵をそのまま使う
import { DOG_ORDER, DOGS, WOLVES, type DogKind, type WolfKind } from './config';

const B = import.meta.env.BASE_URL;

const CHAPTERS: { no: string; title: string; body: string[]; line?: string }[] = [
  {
    no: '其の一',
    title: '狼狩りの猟師',
    body: [
      '大正のころ。帝都から汽車で半日、桜の名所として知られる山あいの町に、腕利きの猟師がいました。',
      'ある春の晩、町はずれの森で、ひとりの娘が狼の群れに囲まれていました。駆けつけた猟師は、背負った大砲と紅い弓で群れを一匹残らず退治し、娘を救います。',
      'その娘こそ、のちのおばあさん。それが縁でふたりは結ばれ、森の入り口に洋館づくりの二階家を建てて、静かに暮らしました。',
    ],
  },
  {
    no: '其の二',
    title: '遺されたもの',
    body: [
      '年月が過ぎ、猟師――おじいさんは数年前に世を去りました。',
      '家に遺されたのは、からくり仕掛けの大砲、紅い弓、二振りの大ナイフ、そして三匹の番犬。おじいさんは最期まで「狼はまた来る」と言い残していたといいます。',
      'その言葉を信じていたのは、休みのたびに遊びに来る孫娘だけでした。幼いころから、おじいさんに狩りの手ほどきを受けてきた子です。',
    ],
  },
  {
    no: '其の三',
    title: '紅い月',
    body: [
      '今年の春、桜が満開を迎えた晩。空に、血のように紅い満月が昇りました。',
      '月に一筋の裂け目が走り、そこから異界の狼たちがあふれ出します。かつておじいさんに滅ぼされた群れの、さらに奥に潜んでいた眷属たち。狙いは、おじいさんが遺した家と、その一族です。',
      '裂け目は九十九夜のあいだ開き続け、夜ごとに狼の数は増えていきます。',
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
  howler: '後ろに居座って吠え、まわりの狼を速くする。遠くから衝撃波も撃つ。',
  alpha: '十夜ごとに現れる、紅いたてがみの大物。ほとんど弾き飛ばせない。九十九夜目には三頭が来る。',
};
const WOLF_RANK: Record<WolfKind, number> = { pup: 1, wolf: 2, armored: 3, howler: 3, alpha: 5 };

const CONTROLS: [string, string][] = [
  ['タップ', '斬る（続けて連撃）'],
  ['左右にはじく', '突進斬り'],
  ['上にはじく', '斬り上げ（追い打ちはタップ）'],
  ['下にはじく', '叩き落とし'],
  ['長押し→離す', '主砲（下の「主砲」ボタンでも）'],
  ['小さい地図をタップ', 'そこへ駆けつける'],
  ['桜嵐', 'ゲージが満タンで押す必殺技'],
  ['触らない', '近くは自動で斬り、離れた狼は弓で射る'],
];

const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);

function storyPage() {
  return `
    <figure class="st-hero"><img src="${B}ui/title.webp" alt=""><figcaption>紅い月の晩、狼が来る。</figcaption></figure>
    ${CHAPTERS.map((c) => `
      <article class="st-ch">
        <h3><small>${c.no}</small>${c.title}</h3>
        ${c.body.map((p) => `<p>${esc(p)}</p>`).join('')}
        ${c.line ? `<blockquote>「${esc(c.line)}」</blockquote>` : ''}
      </article>`).join('<div class="st-orn" aria-hidden="true"><i></i>❀<i></i></div>')}
    <p class="st-end">九十九の夜を守り抜けば、<br>月の裂け目は閉じ、異界の狼は絶える――。</p>`;
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
  const wolves = (Object.keys(WOLVES) as WolfKind[]).map((k) => `
    <article class="st-mini wolf">
      <img src="${B}wolves/${k}.webp" alt="">
      <h5>${WOLVES[k].name}<small class="rank">${'★'.repeat(WOLF_RANK[k])}<span>${'★'.repeat(5 - WOLF_RANK[k])}</span></small></h5>
      <p>${WOLF_TEXT[k]}</p>
    </article>`).join('');
  return `
    ${people}
    <h3 class="st-sub"><small>番犬</small>おじいさんの三匹</h3>
    <p class="st-lead">昼に「守り・攻撃・支援」の役目を決めると、夜は自分で考えて駆け回る。</p>
    <div class="st-grid">${dogs}</div>
    <h3 class="st-sub"><small>異界の狼</small>裂け目から来るもの</h3>
    <div class="st-grid">${wolves}</div>`;
}

function gamePage() {
  return `
    <p class="st-catch">夜は戦い、昼は備える。<br><span>99夜、おばあさんの家を守り抜け。</span></p>
    <div class="st-flow">
      <div class="night"><b>夜</b><p>右の月の裂け目から来る狼を、赤ずきんで迎え撃つ。家が落ちたら、その日の昼からやり直し。</p></div>
      <div class="day"><b>昼</b><p>倒した狼の銭で「体力・近接・主砲と弓・番犬」を鍛え、家を直し、番犬3匹の役目を決める。</p></div>
      <div class="goal"><b>99夜</b><p>守り抜けば狼は絶滅。完全クリア。</p></div>
    </div>
    <h3 class="st-sub"><small>操作</small>指一本で</h3>
    <dl class="st-ctl">${CONTROLS.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>
    <p class="st-note">5夜目からは、霧の夜・紅月の夜など、夜の様子が変わることがある。節目の夜を越えると、昼におばあさんと話せる。</p>
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
