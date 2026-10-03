// 下のボタン類（DOM）。毎フレーム sim から状態を写すだけ。
// 夜（戦闘中）は番犬、昼（波の合間）は強化と「夜を迎える」に入れ替わる。
import { DAYS_TO_CLEAR, DOGS, HOUSE_HP, UPGRADES, WAVES, type DogKind, type UpgradeId } from './config';
import type { Sim } from './sim';

export class Panel {
  private coins: HTMLElement;
  private house: HTMLElement;
  private wave: HTMLElement;
  private battle: HTMLElement;
  private shop: HTMLElement;
  private next: HTMLButtonElement;
  private dogs: [DogKind, HTMLButtonElement][] = [];
  private ups: [UpgradeId, HTMLButtonElement, HTMLElement][] = [];
  private sim: () => Sim;

  constructor(host: HTMLElement, sim: () => Sim) {
    this.sim = sim;
    host.innerHTML = `
      <div class="status">
        <span class="coins"></span>
        <span class="house"><i></i></span>
        <span class="wave"></span>
      </div>
      <div class="battle">
        <div class="dogs"></div>
        <p class="hint">タップで弓／長押しで主砲（離すと撃つ）</p>
      </div>
      <div class="shop" hidden>
        <div class="ups"></div>
        <button class="next">夜を迎える</button>
      </div>
    `;
    const q = <T extends HTMLElement>(sel: string) => host.querySelector(sel) as T;
    this.coins = q('.coins');
    this.house = q('.house i');
    this.wave = q('.wave');
    this.battle = q('.battle');
    this.shop = q('.shop');
    this.next = q('.next');
    this.next.addEventListener('click', () => this.sim().nextWave());
    for (const kind of Object.keys(DOGS) as DogKind[]) {
      const b = document.createElement('button');
      b.className = 'dog';
      b.innerHTML = `${DOGS[kind].name}<small>${DOGS[kind].cost}銭</small>`;
      b.addEventListener('pointerdown', () => this.sim().sendDog(kind));
      q('.dogs').appendChild(b);
      this.dogs.push([kind, b]);
    }
    for (const id of Object.keys(UPGRADES) as UpgradeId[]) {
      const b = document.createElement('button');
      b.className = 'up';
      b.innerHTML = `${UPGRADES[id].name}<small>${UPGRADES[id].note}</small><em></em>`;
      b.addEventListener('click', () => this.sim().buy(id));
      q('.ups').appendChild(b);
      this.ups.push([id, b, b.querySelector('em')!]);
    }
  }

  update() {
    const s = this.sim();
    this.coins.textContent = `${Math.floor(s.coins)} 銭`;
    this.house.style.width = `${(100 * s.houseHp) / HOUSE_HP}%`;
    const day = Math.min(s.wave + 1, WAVES.length);
    this.wave.textContent = `${day}日目・${s.phase === 'shop' ? '昼' : '夜'}　/ ${DAYS_TO_CLEAR}日`;
    const shop = s.phase === 'shop';
    this.battle.hidden = shop;
    this.shop.hidden = !shop;
    if (shop) {
      for (const [id, b, price] of this.ups) {
        const cost = s.upgradeCost(id);
        const max = UPGRADES[id].costs.length;
        b.disabled = !s.canBuy(id);
        price.textContent = cost === undefined ? '最大' : id === 'repair' ? `${cost}銭` : `${cost}銭・${s.levels[id]}/${max}`;
      }
      return;
    }
    for (const [kind, b] of this.dogs) {
      b.disabled = !s.canDog(kind);
      b.style.setProperty('--cd', String(s.dogCd[kind] / DOGS[kind].cooldown));
    }
  }
}
