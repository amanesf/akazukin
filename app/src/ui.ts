// 下のボタン類（DOM）。毎フレーム sim から状態を写すだけ。
import { CANNON, DOGS, HOUSE_HP, WAVES, type DogKind } from './config';
import type { Sim } from './sim';

export class Panel {
  private coins: HTMLElement;
  private house: HTMLElement;
  private wave: HTMLElement;
  private cannon: HTMLElement;
  private cannonLabel: HTMLElement;
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
      <div class="cannon">主砲<small></small></div>
    `;
    this.coins = host.querySelector('.coins')!;
    this.house = host.querySelector('.house i')!;
    this.wave = host.querySelector('.wave')!;
    this.cannon = host.querySelector('.cannon')!;
    this.cannonLabel = this.cannon.querySelector('small')!;
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
    // 主砲は戦場のタップで撃つ。ここは装填の具合を見せるだけ
    const ready = s.cannonCd <= 0;
    this.cannon.classList.toggle('ready', ready);
    this.cannonLabel.textContent = ready ? '装填完了・戦場をタップで一斉射' : '装填中';
    this.cannon.style.setProperty('--cd', String(s.cannonCd / CANNON.cooldown));
    for (const [kind, b] of this.dogs) {
      b.disabled = !s.canDog(kind);
      b.style.setProperty('--cd', String(s.dogCd[kind] / DOGS[kind].cooldown));
    }
  }
}
