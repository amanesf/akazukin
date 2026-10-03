import './style.css';
import { Sim } from './sim';
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

  // 戦場を押すと照準が動き、押しているあいだ弓をそこへ射続ける。主砲は下のボタンで照準へ
  const canvas = view.app.canvas;
  const aimAt = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    sim.setAim(view.toFieldX(e.clientX - r.left));
  };
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    aimAt(e);
    sim.bowHeld = true;
  });
  canvas.addEventListener('pointermove', (e) => {
    if (sim.bowHeld) aimAt(e);
  });
  for (const ev of ['pointerup', 'pointercancel'] as const) canvas.addEventListener(ev, () => (sim.bowHeld = false));

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
     <p>月の裂け目から狼が来る。おばあさんの家を守れ。</p>
     <ul><li>戦場をタップ：そこへ弓を射る（押し続けると連射）</li><li>主砲ボタン：最後にタップした所へ一斉射</li><li>犬のボタン：番犬を出す</li></ul>`,
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
    if (sim.result !== shown) {
      shown = sim.result;
      if (sim.result === 'won') show(`<h1>狼絶滅</h1><p>${sim.kills} 匹を討った。</p>`, 'もう一度');
      if (sim.result === 'lost') show(`<h1>家が落ちた</h1><p>${sim.wave + 1} 波目で力尽きた。</p>`, 'もう一度');
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
