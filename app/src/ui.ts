// 下のボタン類（DOM）。毎フレーム sim から状態を写すだけ。
// 夜（戦闘中）は銭・家・日付と桜嵐（主砲は戦場の長押し。ボタンは連打で強すぎたのでやめた・2026-10-04）。昼は体力・近接・主砲の鍛えと、番犬3匹の役目（タップで切り替え）。
import { DAYS_TO_CLEAR, DOG_ORDER, DOG_ROLES, DOGS, HOUSE_HP, REPAIR, TRACKS, type DogKind, type DogRole, type Track } from './config';
import type { Sim } from './sim';

// アイコン（2026-10-04 生成 icons-v1・tools/export-icons.py）。文字よりアイコンで（アマネさん）
export const ICON = (n: string) => `<img class="ic" src="${import.meta.env.BASE_URL}ui/icons/${n}.webp" alt="">`;
const TRACK_ICON: Record<Track, string> = { body: 'heart', near: 'knife', far: 'cannon', dog: '' };
const trackIcon = (t: Track) => (t === 'dog' ? `<img class="ic" src="${import.meta.env.BASE_URL}dogs/shiba.webp" alt="">` : ICON(TRACK_ICON[t]));
const ROLE_ICON: Record<DogRole, string> = { guard: 'house', attack: 'knife', support: 'heart' };

export class Panel {
  private coins: HTMLElement;
  private house: HTMLElement;
  private wave: HTMLElement;
  private battle: HTMLElement;
  private shop: HTMLElement;
  private ouran: HTMLButtonElement;
  private dogs: [DogKind, HTMLButtonElement][] = [];
  private ups: [Track, HTMLButtonElement][] = [];
  private repair: HTMLButtonElement;
  private next: HTMLButtonElement;
  private dawn: HTMLElement;
  private sim: () => Sim;
  private lastCoins = -1;
  private lastWave = '';

  constructor(host: HTMLElement, sim: () => Sim) {
    this.sim = sim;
    host.innerHTML = `
      <div class="status">
        <span class="coins"></span>
        ${ICON('house')}<span class="house"><i></i></span>
        <span class="wave"></span>
      </div>
      <div class="battle">
        <button class="ouran"><span class="row">${ICON('sakura')}桜嵐</span><small></small></button>
      </div>
      <div class="shop" hidden>
        <p class="dawn"></p>
        <div class="ups"></div>
        <button class="repair"></button>
        <div class="dogrow"><p class="dogtitle">番犬の役目 <span>（タップで切り替え）</span></p><div class="dogs"></div></div>
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
    this.repair = q('.repair');
    this.repair.addEventListener('click', () => this.sim().repair());
    this.next = q('.next');
    this.dawn = q('.dawn');
    this.ouran.addEventListener('pointerdown', () => this.sim().ouran());
    this.next.addEventListener('click', () => this.sim().nextWave());
    for (const kind of DOG_ORDER) {
      const b = document.createElement('button');
      b.className = 'dog';
      b.innerHTML = `<img class="pic" src="${import.meta.env.BASE_URL}dogs/${kind}.webp" alt=""><span><i>${DOGS[kind].name}<small>${DOGS[kind].breed}</small></i><b class="role"></b></span>`;
      b.addEventListener('click', () => this.sim().cycleRole(kind));
      q('.dogs').appendChild(b);
      this.dogs.push([kind, b]);
    }
    for (const t of Object.keys(TRACKS) as Track[]) {
      const b = document.createElement('button');
      b.className = 'up';
      b.innerHTML = `<b>${trackIcon(t)}${TRACKS[t].name}</b><span class="lv"></span><small></small><em></em>`;
      b.addEventListener('click', () => this.sim().buy(t));
      q('.ups').appendChild(b);
      this.ups.push([t, b]);
    }
  }

  update() {
    const s = this.sim();
    const c = Math.floor(s.coins);
    if (c !== this.lastCoins) {
      this.coins.innerHTML = `${ICON('coin')}${c}`;
      if (c > this.lastCoins && this.lastCoins >= 0) {
        this.coins.classList.remove('gain');
        void this.coins.offsetWidth;
        this.coins.classList.add('gain');
      }
      this.lastCoins = c;
    }
    this.house.style.width = `${(100 * s.houseHp) / HOUSE_HP}%`;
    this.house.classList.toggle('low', s.houseHp < HOUSE_HP * 0.3);
    const day = Math.min(s.wave + 1, DAYS_TO_CLEAR);
    const wv = `${day}${s.phase}`;
    if (wv !== this.lastWave) {
      this.lastWave = wv;
      this.wave.innerHTML = `${ICON(s.phase === 'shop' ? 'sun' : 'moon')}${day}日目`;
    }
    const shop = s.phase === 'shop';
    document.body.classList.toggle('day', shop);
    this.battle.hidden = shop;
    this.shop.hidden = !shop;
    if (shop) {
      this.dawn.innerHTML = (s.nightKills
        ? `夜が明けた。${s.nightKills}匹を倒し、${s.nightEarned}銭を得た`
        : '昼。鍛えて、番犬の役目を決める'); // 今夜の様子は戦場の下の帯に出す
      for (const [t, b] of this.ups) {
        const cost = s.trackCost(t);
        const next = s.nextPerk(t);
        b.disabled = !s.canBuy(t);
        b.querySelector('.lv')!.textContent = `Lv ${s.levels[t]}`;
        b.querySelector('small')!.textContent = `次：${next.note}`;
        b.querySelector('em')!.textContent = `${cost}銭`;
        b.classList.toggle('train', s.trained(t) > 0 || s.levels[t] >= TRACKS[t].perks.length);
      }
      const full = s.houseHp >= HOUSE_HP;
      this.repair.disabled = !s.canRepair();
      this.repair.innerHTML = `${ICON('house')}家を直す <span>${full ? '（傷はない）' : `+${REPAIR.hp}`}</span><em>${s.repairCost}銭</em>`;
      for (const [kind, b] of this.dogs) {
        const r = s.roles[kind];
        if (b.dataset.role === r) continue;
        b.dataset.role = r;
        b.querySelector('.role')!.innerHTML = `${ICON(ROLE_ICON[r])}${DOG_ROLES[r].name}<small>${DOG_ROLES[r].note}</small>`;
      }
      return;
    }
    this.ouran.disabled = !s.canOuran();
    this.ouran.classList.toggle('ready', s.canOuran());
    this.ouran.style.setProperty('--fill', String(s.gauge / 100));
    this.ouran.querySelector('small')!.textContent = s.hero.ouran > 0 ? '乱舞中' : s.gauge >= 100 ? '押せ！' : `${Math.floor(s.gauge)}%`;
  }
}
