// 下のボタン類（DOM）。毎フレーム sim から状態を写すだけ。
// 夜（戦闘中）は番犬・構え・桜嵐、昼（波の合間）は体力・近接・遠隔の強化と「夜を迎える」に入れ替わる。
import { DAWN_REPAIR, DAYS_TO_CLEAR, DOGS, HOUSE_HP, TRACKS, type DogKind, type Track } from './config';
import type { Sim, Stance } from './sim';

export class Panel {
  private coins: HTMLElement;
  private house: HTMLElement;
  private wave: HTMLElement;
  private battle: HTMLElement;
  private shop: HTMLElement;
  private ouran: HTMLButtonElement;
  private stances: [Stance, HTMLButtonElement][] = [];
  private dogs: [DogKind, HTMLButtonElement][] = [];
  private ups: [Track, HTMLButtonElement][] = [];
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
        <div class="acts">
          <div class="stance">
            <button data-s="near">近<small>踏み込む</small></button>
            <button data-s="far">遠<small>下がる</small></button>
          </div>
          <button class="ouran">桜嵐<small></small></button>
        </div>
      </div>
      <div class="shop" hidden>
        <p class="dawn">夜が明けた。家が ${DAWN_REPAIR} 直った</p>
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
    this.ouran = q('.ouran');
    this.ouran.addEventListener('pointerdown', () => this.sim().ouran());
    q('.next').addEventListener('click', () => this.sim().nextWave());
    host.querySelectorAll<HTMLButtonElement>('.stance button').forEach((b) => {
      const s = b.dataset.s as Stance;
      b.addEventListener('pointerdown', () => this.sim().setStance(s));
      this.stances.push([s, b]);
    });
    for (const kind of Object.keys(DOGS) as DogKind[]) {
      const b = document.createElement('button');
      b.className = 'dog';
      b.innerHTML = `${DOGS[kind].name}<small>${DOGS[kind].cost}銭</small>`;
      b.addEventListener('pointerdown', () => this.sim().sendDog(kind));
      q('.dogs').appendChild(b);
      this.dogs.push([kind, b]);
    }
    for (const t of Object.keys(TRACKS) as Track[]) {
      const b = document.createElement('button');
      b.className = 'up';
      b.innerHTML = `<b>${TRACKS[t].name}</b><span class="lv"></span><small></small><em></em>`;
      b.addEventListener('click', () => this.sim().buy(t));
      q('.ups').appendChild(b);
      this.ups.push([t, b]);
    }
  }

  update() {
    const s = this.sim();
    this.coins.textContent = `${Math.floor(s.coins)} 銭`;
    this.house.style.width = `${(100 * s.houseHp) / HOUSE_HP}%`;
    const day = Math.min(s.wave + 1, DAYS_TO_CLEAR);
    this.wave.textContent = `${day}日目・${s.phase === 'shop' ? '昼' : '夜'}　/ ${DAYS_TO_CLEAR}日`;
    const shop = s.phase === 'shop';
    this.battle.hidden = shop;
    this.shop.hidden = !shop;
    if (shop) {
      for (const [t, b] of this.ups) {
        const cost = s.trackCost(t);
        const next = s.nextPerk(t);
        b.disabled = !s.canBuy(t);
        b.querySelector('.lv')!.textContent = `Lv ${s.levels[t]}`;
        b.querySelector('small')!.textContent = next ? `次：${next.note}` : 'これ以上は上がらない';
        b.querySelector('em')!.textContent = cost === undefined ? '最大' : `${cost}銭`;
      }
      return;
    }
    for (const [st, b] of this.stances) b.classList.toggle('on', s.stance === st);
    this.ouran.disabled = !s.canOuran();
    this.ouran.classList.toggle('ready', s.canOuran());
    this.ouran.style.setProperty('--fill', String(s.gauge / 100));
    this.ouran.querySelector('small')!.textContent = s.hero.ouran > 0 ? '乱舞中' : s.gauge >= 100 ? '押せ！' : `${Math.floor(s.gauge)}%`;
    for (const [kind, b] of this.dogs) {
      b.disabled = !s.canDog(kind);
      b.style.setProperty('--cd', String(s.dogCd[kind] / DOGS[kind].cooldown));
    }
  }
}
