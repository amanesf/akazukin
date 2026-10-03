import './style.css';
import { Sim, type Event } from './sim';
import { Panel } from './ui';
import { View } from './view';

const params = new URLSearchParams(location.search);
// 撮影用：?auto=1 で題字を飛ばして始める、?speed=4 で早回し
const SPEED = Number(params.get('speed') ?? 1);

// top-level await は使わない：本番ビルドでは Pixi の遅延読み込みの塊が index を待ち、index が
// その塊を待って、互いに止まる（撮影で実測。開発サーバーでは起きない）。
main();

async function main() {
  let sim = new Sim(Number(params.get('seed') ?? 1));
  const view = new View();
  const field = document.getElementById('field')!;
  const overlay = document.getElementById('overlay')!;
  await view.init(field);
  const panel = new Panel(document.getElementById('panel')!, () => sim);

  // 主人公の台詞（**仮・アマネさん未確認**）。出来事ごとに1つ、短く。続けては喋らない
  const LINES: Partial<Record<Event, string[]>> = {
    night: ['今夜は何匹かな♪', 'さ、狩りの時間'],
    finisher: ['ばーん♪', 'おやすみ', 'つぎのひと〜'],
    musou: ['ぜーんぶ、まとめて――おやすみ'],
    hurt: ['いったぁ……噛んだね？'],
    down: ['おばあちゃん、ちょっと待ってて'],
    revive: ['……お返し、しなきゃ'],
  };
  const comboEl = document.getElementById('combo')!;
  const bubble = document.getElementById('bubble')!;
  const cutin = document.getElementById('cutin')!;
  let said = -99;
  let saidLen = 0;
  let lastCombo = 0;
  const say = (ev: Event) => {
    const lines = LINES[ev];
    if (!lines) return;
    const urgent = ev === 'musou' || ev === 'down' || ev === 'hurt';
    if (!urgent && sim.clock - said < 6) return; // しゃべりすぎない
    bubble.textContent = lines[(sim.kills + Math.floor(sim.clock)) % lines.length];
    bubble.hidden = false;
    said = sim.clock;
    saidLen = 2.2;
  };
  const overlays = () => {
    for (const ev of sim.events.splice(0)) {
      if (ev === 'musou') {
        cutin.hidden = true;
        void cutin.offsetWidth; // 演出をやり直す
        cutin.hidden = false;
      }
      say(ev);
    }
    if (sim.clock - said > saidLen) bubble.hidden = true;
    const { x, y } = view.heroAt;
    // 右端からはみ出さない
    bubble.style.left = `${Math.min(x, field.clientWidth - bubble.offsetWidth * 0.8 - 6)}px`;
    bubble.style.top = `${y - 6}px`;
    comboEl.hidden = sim.combo < 2;
    if (sim.combo !== lastCombo) {
      comboEl.innerHTML = `${sim.combo}<small>HIT</small>`;
      if (sim.combo > lastCombo) {
        comboEl.classList.remove('pop');
        void comboEl.offsetWidth;
        comboEl.classList.add('pop');
      }
      lastCombo = sim.combo;
    }
  };

  let running = false;
  let shown = 'playing';
  function show(html: string, label: string) {
    overlay.innerHTML = `${html}<button>${label}</button>`;
    overlay.hidden = false;
    overlay.querySelector('button')!.addEventListener('click', () => {
      if (sim.result !== 'playing') {
        sim = new Sim((sim.clock * 1000) | 0);
        shown = 'playing';
      }
      overlay.hidden = true;
      running = true;
    }, { once: true });
  }

  show(
    `<h1>鋼桜奇譚<small>大正赤ずきん</small></h1>
     <p>月の裂け目から狼が来る。99日、おばあさんの家を守り抜け。</p>
     <ul><li>赤ずきんは自分で戦う。「近」で踏み込み、「遠」で下がって撃つ</li><li>当てるとゲージが溜まる。満タンで無双乱舞</li><li>犬のボタン：番犬を出す</li><li>夜ごとに狼が来る。昼に銭で体力・近接・遠隔を鍛える（技は鍛えると覚える）</li></ul>`,
    'はじめる',
  );
  if (params.get('auto')) {
    overlay.hidden = true;
    running = true;
  }

  view.app.ticker.add((t) => {
    if (running) sim.advance((t.deltaMS / 1000) * SPEED);
    view.draw(sim);
    panel.update();
    overlays();
    if (sim.result !== shown) {
      shown = sim.result;
      if (sim.result === 'won') show(`<h1>試作はここまで</h1><p>${sim.wave}晩を守り抜いた（${sim.kills} 匹・最大 ${sim.bestCombo} コンボ）。<br>本番は99日目まで続く。</p>`, 'もう一度');
      if (sim.result === 'lost') show(`<h1>家が落ちた</h1><p>${sim.wave + 1}日目の夜に力尽きた。<br>1日目からやり直し。</p>`, 'もう一度');
      running = false;
    }
  });

  // 撮影・計測用の窓口
  (window as unknown as { akazukin: unknown }).akazukin = {
    get clock() { return sim.clock; },
    get sim() { return sim; },
  };
  document.body.classList.add('ready');
}
