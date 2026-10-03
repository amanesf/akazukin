// 下のボタン類（DOM）。毎フレーム sim から状態を写すだけ。
import { CANNON, DOGS, HOUSE_HP, WAVES, type DogKind } from './config';
import type { Sim } from './sim';

export class Panel {
  private coins: HTMLElement;
  private house: HTMLElement;
  private wave: HTMLElement;
  private cannon: HTMLButtonElement;
  private dogs: [DogKind, HTMLButtonElement][] = [];

  private sim: () => Sim;

  constructor(host: HTMLElement, sim: () => Sim) {
    this.sim = sim;
    host.innerHTML = `
      <div class="status">
        <span class="coins"></span>
        <span class="house"><i></i></span>
        <span class="wave"></span>
      </div>
      <div class="dogs"></div>
      <button class="cannon">主砲<small>照準へ一斉射</small></button>
    `;
    this.coins = host.querySelector('.coins')!;
    this.house = host.querySelector('.house i')!;
    this.wave = host.querySelector('.wave')!;
    this.cannon = host.querySelector('.cannon')!;
    this.cannon.addEventListener('pointerdown', () => this.sim().fireCannon());
    const dogs = host.querySelector('.dogs')!;
    for (const kind of Object.keys(DOGS) as DogKind[]) {
      const b = document.createElement('button');
      b.className = 'dog';
      b.innerHTML = `${DOGS[kind].name}<small>${DOGS[kind].cost}銭</small>`;
      b.addEventListener('pointerdown', () => this.sim().sendDog(kind));
      dogs.appendChild(b);
      this.dogs.push([kind, b]);
    }
  }

  update() {
    const s = this.sim();
    this.coins.textContent = `${Math.floor(s.coins)} 銭`;
    this.house.style.width = `${(100 * s.houseHp) / HOUSE_HP}%`;
    this.wave.textContent = `${Math.min(s.wave + 1, WAVES.length)} / ${WAVES.length} 波`;
    this.cannon.disabled = !s.canCannon();
    this.cannon.style.setProperty('--cd', String(s.cannonCd / CANNON.cooldown));
    for (const [kind, b] of this.dogs) {
      b.disabled = !s.canDog(kind);
      b.style.setProperty('--cd', String(s.dogCd[kind] / DOGS[kind].cooldown));
    }
  }
}
