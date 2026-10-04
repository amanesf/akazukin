import './style.css';
import { Sfx } from './audio';
import { WOLVES, type WolfKind } from './config';
import { Input } from './input';
import { Sim, type Event, type Save } from './sim';
import { Panel } from './ui';
import { WOLF_COLOR } from './palette';
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
  sound.addEventListener('click', () => {
    const on = sfx.toggle();
    sound.textContent = on ? '♪ 音 入' : '♪ 音 切';
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
  const surge = document.getElementById('surge')!;
  const next = document.getElementById('next')!;
  const card = document.getElementById('card')!;
  const hint = document.getElementById('hint')!;
  // 1晩目だけ、指の使い方を順に出す
  const HINTS: [number, string][] = [[3, '狼をタップ：斬る（連打で連撃）'], [9, '左右にはじく：突進斬り'], [15, '上にはじく：斬り上げ／下：叩き落とし'], [21, '長押し→離す：主砲'], [27, '下の地図をタップ：駆けつける']];
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
    const hx = sim.wave === 0 && sim.phase === 'wave' ? HINTS.filter(([t]) => sim.clock >= t && sim.clock < t + 5.5).pop()?.[1] ?? '' : '';
    if (hx !== lastHint) {
      lastHint = hx;
      hint.textContent = hx;
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
      next.innerHTML = '<b>これから</b>' + kinds.map((k) => `<span><i style="background:#${WOLF_COLOR[k].toString(16).padStart(6, '0')}"></i>${WOLVES[k].name} ${pend[k]}</span>`).join('');
    }
  };

  let running = false;
  let shown = 'playing';
  function show(html: string, buttons: [string, () => void][]) {
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

  const saved = store.read();
  const title = `<h1>鋼桜奇譚<small>大正赤ずきん</small></h1>
     <p>月の裂け目から狼が来る。99日、おばあさんの家を守り抜け。</p>
     <ul><li><b>タップ</b>：斬る（連打で連撃）／遠くの地面：走る</li><li><b>はじく</b>：左右＝突進斬り・上＝斬り上げ・下＝叩き落とし</li><li><b>長押し→離す</b>：主砲</li><li><b>下の地図をタップ</b>：そこへ駆けつける</li><li>当てるとゲージが溜まる。満タンで桜嵐</li><li>昼：鍛える・番犬を戦場に置く</li></ul>`;
  show(title, saved
    ? [[`続きから（${saved.wave + 1}日目の昼）`, () => (sim = Sim.load(saved, seed()))], ['はじめから', fresh]]
    : [['はじめる', () => {}]]);
  if (params.get('auto')) {
    overlay.hidden = true;
    running = true;
  }

  // ?manual=1：時計を止め、外から akazukin.tick(秒) で1コマずつ進める（動きをコマ送りで点検する）
  const manual = !!params.get('manual');
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
