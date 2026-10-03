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

  // 戦場をタップで弓、長押しで主砲のタメ（離すと撃つ）。押したまま指をずらすと狙いが動く
  const canvas = view.app.canvas;
  const fieldX = (e: PointerEvent) => view.toFieldX(e.clientX - canvas.getBoundingClientRect().left);
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    sim.press(fieldX(e));
  });
  canvas.addEventListener('pointermove', (e) => sim.drag(fieldX(e)));
  canvas.addEventListener('pointerup', () => sim.release());
  canvas.addEventListener('pointercancel', () => (sim.pressing = false));
  // 長押しでスマホの選択メニューが出ないように
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

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
     <ul><li>戦場をタップ：そこへ弓を射る</li><li>戦場を長押し：主砲をタメる。離すと撃つ（長いほど多く）</li><li>犬のボタン：番犬を出す</li><li>夜ごとに狼が来る。昼のあいだに銭で武器を強くする</li></ul>`,
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
      if (sim.result === 'won') show(`<h1>試作はここまで</h1><p>${sim.wave}晩を守り抜いた（${sim.kills} 匹）。<br>本番は99日目まで続く。</p>`, 'もう一度');
      if (sim.result === 'lost') show(`<h1>家が落ちた</h1><p>${sim.wave + 1}日目の夜に力尽きた。</p>`, 'もう一度');
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
