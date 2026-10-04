import './style.css';
import { Sfx } from './audio';
import { WOLVES, type WolfKind } from './config';
import { Input } from './input';
import { Sim, type Event, type Save } from './sim';
import { ICON, Panel } from './ui';
import { View } from './view';

const params = new URLSearchParams(location.search);
// 撮影用：?auto=1 で題字を飛ばして始める、?speed=4 で早回し
const SPEED = Number(params.get('speed') ?? 1);
const SAVE_KEY = 'akazukin.save.v1';

// 保存はこの端末のブラウザだけ。読めない環境（非公開窓など）でも遊べるように、失敗は黙って無視する
const store = {
  read(): Save | null {
    try {
      const d = JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null');
      return d && (d.v === 1 || d.v === 2) ? d : null;
    } catch {
      return null;
    }
  },
  write(d: Save) {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(d)); } catch { /* 保存できなくても続ける */ }
  },
  clear() {
    try { localStorage.removeItem(SAVE_KEY); } catch { /* 同上 */ }
  },
};

// top-level await は使わない：本番ビルドでは Pixi の遅延読み込みの塊が index を待ち、index が
// その塊を待って、互いに止まる（撮影で実測。開発サーバーでは起きない）。
main();

async function main() {
  const seed = () => (Date.now() & 0xffff) || 1;
  let sim = new Sim(Number(params.get('seed') ?? 1));
  const view = new View();
  const sfx = new Sfx();
  const field = document.getElementById('field')!;
  const overlay = document.getElementById('overlay')!;
  await view.init(field);
  const input = new Input(view.app.canvas, view, () => sim);
  const panel = new Panel(document.getElementById('panel')!, () => sim, (kind, e) => input.startNewDog(kind, e));

  // 音：最初は切。押すと入る
  const sound = document.getElementById('sound') as HTMLButtonElement;
  sound.innerHTML = `${ICON('note')}切`;
  document.getElementById('pause')!.innerHTML = ICON('pause');
  sound.addEventListener('click', () => {
    const on = sfx.toggle();
    sound.innerHTML = `${ICON('note')}${on ? '入' : '切'}`;
    sound.classList.toggle('on', on);
  });

  // 主人公の台詞（**仮・アマネさん未確認**）。出来事ごとに1つ、短く。続けては喋らない
  const LINES: Partial<Record<Event, string[]>> = {
    night: ['今夜は何匹かな♪', 'さ、狩りの時間'],
    finisher: ['ばーん♪', 'おやすみ', 'つぎのひと〜'],
    ouran: ['ぜーんぶ、まとめて――おやすみ'],
    hurt: ['いったぁ……噛んだね？'],
    down: ['おばあちゃん、ちょっと待ってて'],
    revive: ['……お返し、しなきゃ'],
    surge: ['わ、いっぱい来た♪'],
    combo10: ['ふふっ、まだまだ♪'],
    combo30: ['止まらないよ〜♪'],
    dawn: ['朝だ〜。おばあちゃん、無事？'],
  };
  const comboEl = document.getElementById('combo')!;
  const bubble = document.getElementById('bubble')!;
  const cutin = document.getElementById('cutin')!;
  // 絵の場所は公開先の置き場所で変わるので、ここで渡す
  const BASE = import.meta.env.BASE_URL;
  cutin.style.setProperty('--art', `url(${BASE}ui/cutin.webp)`);
  overlay.style.setProperty('--title', `url(${BASE}ui/title.webp)`);
  const surge = document.getElementById('surge')!;
  const next = document.getElementById('next')!;
  const card = document.getElementById('card')!;
  const hint = document.getElementById('hint')!;
  // 1晩目だけ、指の使い方を「やってみよう」で1つずつ。やるまで次へ進まない（2026-10-04 アマネさん「操作よくわからん」。
  // 前は時間で流れて消える文字だった）
  type Did = Sim['did'];
  const STEPS: { text: string; done: (d: Did, b: Did) => boolean }[] = [
    { text: '右から来る狼をタップして斬ろう（続けてタップで連撃）', done: (d, b) => d.tap - b.tap >= 3 },
    { text: '画面を左か右に、さっとはじこう → 突進斬り', done: (d, b) => d.dash > b.dash },
    { text: '上か下にはじこう → 斬り上げ／叩き落とし', done: (d, b) => d.launch + d.slam > b.launch + b.slam },
    { text: '長押しして、離そう → 背中の主砲', done: (d, b) => d.shiki > b.shiki },
    { text: '下の小さい地図をタップ → そこへ駆けつける', done: (d, b) => d.mini > b.mini },
  ];
  let step = -1;
  let base: Did = { ...sim.did };
  let doneUntil = -1;
  let lastHint = '';
  const showCard = (big: string, small: string) => {
    card.innerHTML = `<b>${big}</b><small>${small}</small>`;
    restart(card);
  };
  let said = -99;
  let saidLen = 0;
  let surgeUntil = -1;
  let lastCombo = 0;
  let lastPending = '';
  const restart = (el: HTMLElement) => {
    el.hidden = true;
    void el.offsetWidth; // 演出をやり直す
    el.hidden = false;
  };
  const say = (ev: Event) => {
    const lines = LINES[ev];
    if (!lines) return;
    const urgent = ev === 'ouran' || ev === 'down' || ev === 'hurt' || ev === 'surge' || ev === 'dawn';
    if (!urgent && sim.clock - said < 6) return; // しゃべりすぎない
    bubble.textContent = lines[(sim.kills + Math.floor(sim.clock)) % lines.length];
    bubble.hidden = false;
    said = sim.clock;
    saidLen = 2.2;
  };
  const overlays = () => {
    sfx.play(sim.sounds.splice(0));
    for (const ev of sim.events.splice(0)) {
      if (ev === 'ouran') restart(cutin);
      if (ev === 'surge') {
        restart(surge);
        surgeUntil = sim.clock + 2;
      }
      if (ev === 'dawn') {
        store.write(sim.save()); // 夜が明けたら保存（家が落ちたら、ここへ戻る）
        showCard('夜明け', `${sim.wave}日目の夜を越えた`);
      }
      if (ev === 'night') {
        const n = Object.values(sim.pending()).reduce((a, b) => a + (b ?? 0), 0);
        showCard(`${sim.wave + 1}日目の夜`, `狼 ${n}匹`);
      }
      say(ev);
    }
    if (sim.clock > surgeUntil) surge.hidden = true;
    if (sim.clock - said > saidLen) bubble.hidden = true;
    const { x, y } = view.heroAt;
    // 右端からはみ出さない
    bubble.style.left = `${Math.max(6, Math.min(x, field.clientWidth - bubble.offsetWidth * 0.8 - 6))}px`;
    bubble.style.top = `${Math.max(bubble.offsetHeight + 4, y - 6)}px`;
    let hx = '';
    if (sim.wave === 0 && sim.phase === 'wave') {
      if (step < 0 && sim.wolves.length > 0) { // 狼が出てから（いないのに「狼をタップ」と出すと迷う）
        step = 0;
        base = { ...sim.did };
      }
      if (step >= 0 && step < STEPS.length) {
        if (doneUntil < 0 && STEPS[step].done(sim.did, base)) doneUntil = sim.clock + 1;
        if (doneUntil >= 0 && sim.clock >= doneUntil) {
          step++;
          doneUntil = -1;
          base = { ...sim.did };
        }
        hx = step >= STEPS.length ? '' : doneUntil >= 0 ? '✨ できた！' : STEPS[step].text;
      }
    } else step = -1;
    if (hx !== lastHint) {
      lastHint = hx;
      hint.innerHTML = hx && !hx.startsWith('✨') ? `${ICON('tap')}${hx}` : hx;
      hint.classList.toggle('ok', hx.startsWith('✨'));
      document.body.classList.toggle('tutorial', !!hx); // 説明のあいだは右上の「これから」を隠す（重なる）
      if (hx) restart(hint);
      else hint.hidden = true;
    }
    comboEl.hidden = sim.combo < 2;
    if (sim.combo !== lastCombo) {
      comboEl.innerHTML = `${sim.combo}<small>HIT</small>`;
      comboEl.dataset.tier = sim.combo >= 50 ? '3' : sim.combo >= 20 ? '2' : sim.combo >= 10 ? '1' : '0';
      if (sim.combo > lastCombo) {
        comboEl.classList.remove('pop');
        void comboEl.offsetWidth;
        comboEl.classList.add('pop');
      }
      lastCombo = sim.combo;
    }
    // 予告：この晩にまだ来ていない狼
    const pend = sim.phase === 'wave' ? sim.pending() : {};
    const key = JSON.stringify(pend);
    if (key !== lastPending) {
      lastPending = key;
      const kinds = Object.keys(pend) as WolfKind[];
      next.hidden = kinds.length === 0;
      next.innerHTML = '<b>これから</b>' + kinds.map((k) => `<span><img src="${BASE}wolves/${k}.webp" alt="">${WOLVES[k].name} ${pend[k]}</span>`).join('');
    }
  };

  const manual = !!params.get('manual');
  let running = false;
  let shown = 'playing';
  function show(html: string, buttons: [string, () => void][], title = false) {
    overlay.classList.toggle('title', title); // 題字の画面だけ、メインビジュアルを敷く
    overlay.innerHTML = `${html}<div class="choices"></div>`;
    const box = overlay.querySelector('.choices')!;
    for (const [label, act] of buttons) {
      const b = document.createElement('button');
      b.textContent = label;
      b.addEventListener('click', () => {
        act();
        shown = sim.result;
        overlay.hidden = true;
        running = true;
      }, { once: true });
      box.appendChild(b);
    }
    overlay.hidden = false;
    // 主人公の絵が揃うまでは押せない（揃う前に始めると、仮の細い姿で戦った。2026-10-04 アマネさん「棒みたい」）
    if (!view.ready) {
      const bs = Array.from(box.querySelectorAll('button'));
      const labels = bs.map((b) => b.textContent);
      for (const b of bs) {
        b.disabled = true;
        b.textContent = '読み込み中…';
      }
      const wait = () => {
        if (!view.ready) return void requestAnimationFrame(wait);
        bs.forEach((b, i) => {
          b.disabled = false;
          b.textContent = labels[i];
        });
      };
      wait();
    }
  }
  const fresh = () => {
    store.clear();
    sim = new Sim(seed());
  };
  // 家が落ちた：その晩の前の昼に戻る。負けた晩に拾った銭は残さない（2026-10-04・アマネさん）
  const retry = () => {
    const losses = sim.losses;
    const d = store.read();
    sim = d ? Sim.load(d, seed()) : new Sim(seed());
    sim.losses = losses;
    if (d) store.write(sim.save());
  };

  // 一時停止（2026-10-04 レビュー 12）。画面を離れたときも止める
  const pause = () => {
    if (!running || sim.result !== 'playing' || !overlay.hidden) return;
    running = false;
    show(`<h1>一時停止</h1><p>${Math.min(sim.wave + 1, 99)}日目・${sim.phase === 'shop' ? '昼' : '夜'}</p>`, [['続ける', () => {}]]);
  };
  document.getElementById('pause')!.addEventListener('click', pause);
  document.addEventListener('visibilitychange', () => document.hidden && !manual && pause());

  const saved = store.read();
  const title = `<h1><small>鋼桜奇譚</small>大正赤ずきん</h1>
     <p>月の裂け目から狼が来る。99日、おばあさんの家を守り抜け。</p>
     <p class="how">操作は1晩目に「やってみよう」で</p>`; // 操作の一覧は、絵が見えるように外した（2026-10-04 アマネさん「画像しっかり見えるように」）
  show(title, saved
    ? [[`続きから（${saved.wave + 1}日目の昼）`, () => (sim = Sim.load(saved, seed()))], ['はじめから', fresh]]
    : [['はじめる', () => {}]], true);
  if (params.get('auto')) {
    overlay.hidden = true;
    running = true;
  }

  // ?manual=1：時計を止め、外から akazukin.tick(秒) で1コマずつ進める（動きをコマ送りで点検する）
  const frame = (dt: number) => {
    if (running) sim.advance(dt);
    view.draw(sim, dt);
    panel.update();
    overlays();
  };
  view.app.ticker.add((t) => {
    if (!manual) frame((t.deltaMS / 1000) * SPEED);
    if (sim.result !== shown) {
      shown = sim.result;
      running = false;
      if (sim.result === 'won') {
        store.clear();
        show(`<h1>狼絶滅</h1><p>99日を守り抜いた（${sim.kills} 匹・最大 ${sim.bestCombo} コンボ・家が落ちたのは ${sim.losses} 回）。</p>`, [['もう一度', fresh]]);
      }
      if (sim.result === 'lost') {
        const back = store.read();
        show(`<h1>家が落ちた</h1><p>${sim.wave + 1}日目の夜に力尽きた。<br>${back ? `${back.wave + 1}日目の昼に戻る（この夜に拾った銭は残らない）` : '1日目の夜からやり直す'}</p>`, [['もう一度', retry]]);
      }
    }
  });

  // 撮影・計測用の窓口
  (window as unknown as { akazukin: unknown }).akazukin = {
    get clock() { return sim.clock; },
    get sim() { return sim; },
    get view() { return view; },
    tick(dt: number, n = 1) { for (let i = 0; i < n; i++) frame(dt); },
  };
  document.body.classList.add('ready');
}
