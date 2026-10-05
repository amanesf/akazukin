// 下のボタン類（DOM）。毎フレーム sim から状態を写すだけ。
// 夜（戦闘中）は銭・家・日付と、武器の持ち替え（ナイフ⇔弓・2026-10-05）、桜嵐の3つの必殺技（斬り・弓・主砲で別々に溜まる・2026-10-04）（主砲は戦場の長押し。ボタンは連打で強すぎたのでやめた・2026-10-04）。
// 昼は10個の強化（上段＝基本・何回でも／下段＝特殊・各3つ。2026-10-05）と、番犬の役目（タップで切り替え）。
import { BASIC, DAYS_TO_CLEAR, DOG_ORDER, DOG_ROLES, DOGS, HOUSE_HP, REPAIR, SPECIAL_ORDER, SPECIAL_UPS, SPECIALS, TRACK_NAME, TRACK_ORDER, type DogKind, type DogRole, type Special, type Track } from './config';
import type { Sim } from './sim';

// アイコン（2026-10-04 生成 icons-v1・tools/export-icons.py）。文字よりアイコンで（アマネさん）
export const ICON = (n: string) => `<img class="ic" src="${import.meta.env.BASE_URL}ui/icons/${n}.webp" alt="">`;
const TRACK_ICON: Record<Track, string> = { body: 'heart', knife: 'knife', cannon: 'cannon', bow: 'bow', dog: '' };
const trackIcon = (t: Track) => (t === 'dog' ? `<img class="ic" src="${import.meta.env.BASE_URL}dogs/shiba.webp" alt="">` : ICON(TRACK_ICON[t]));
const ROLE_ICON: Record<DogRole, string> = { guard: 'house', attack: 'knife', support: 'heart' };

export class Panel {
  private coins: HTMLElement;
  private house: HTMLElement;
  private wave: HTMLElement;
  private battle: HTMLElement;
  private shop: HTMLElement;
  private specials: [Special, HTMLButtonElement][] = [];
  private dogs: [DogKind, HTMLButtonElement][] = [];
  private ups: [Track, HTMLButtonElement][] = [];
  private specialUps: [Track, HTMLButtonElement][] = [];
  private weapon: HTMLButtonElement;
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
      </div>
      <div class="shop" hidden>
        <p class="dawn"></p>
        <div class="ups"></div>
        <div class="ups sp"></div>
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
    // 武器の持ち替え：押すたびにナイフ⇔弓。いま持っている武器の絵を出す
    this.weapon = document.createElement('button');
    this.weapon.className = 'weapon';
    this.weapon.addEventListener('pointerdown', () => this.sim().switchWeapon());
    this.battle.appendChild(this.weapon);
    for (const sp of SPECIAL_ORDER) {
      const b = document.createElement('button');
      b.className = 'ouran';
      b.innerHTML = `<span class="row">${ICON(SPECIALS[sp].icon)}${SPECIALS[sp].name}</span><small></small>`;
      b.addEventListener('pointerdown', () => this.sim().ouran(sp));
      this.battle.appendChild(b);
      this.specials.push([sp, b]);
    }
    this.repair = q('.repair');
    this.repair.addEventListener('click', () => this.sim().repair());
    this.next = q('.next');
    this.dawn = q('.dawn');
    this.next.addEventListener('click', () => this.sim().nextWave());
    for (const kind of DOG_ORDER) {
      const b = document.createElement('button');
      b.className = 'dog';
      b.innerHTML = `<img class="pic" src="${import.meta.env.BASE_URL}dogs/${kind}.webp" alt=""><span><i>${DOGS[kind].name}<small>${DOGS[kind].breed}</small></i><b class="role"></b></span>`;
      b.addEventListener('click', () => this.sim().cycleRole(kind));
      q('.dogs').appendChild(b);
      this.dogs.push([kind, b]);
    }
    for (const t of TRACK_ORDER) {
      const b = document.createElement('button');
      b.className = 'up';
      b.innerHTML = `<b>${trackIcon(t)}${TRACK_NAME[t]}</b><span class="lv"></span><small>${BASIC[t].note}</small><em></em>`;
      b.addEventListener('click', () => this.sim().buy(t, 'basic'));
      q('.ups').appendChild(b);
      this.ups.push([t, b]);
      const c = document.createElement('button');
      c.className = 'up special';
      c.innerHTML = `<span class="lv"></span><small></small><em></em>`;
      c.addEventListener('click', () => this.sim().buy(t, 'special'));
      q('.ups.sp').appendChild(c);
      this.specialUps.push([t, c]);
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
        b.disabled = !s.canBuy(t, 'basic');
        const n = s.basic[t];
        b.querySelector('.lv')!.textContent = t === 'body' ? `Lv${n} +${n * BASIC.body.step}` : `Lv${n} +${Math.round(n * BASIC[t].step * 100)}%`;
        b.querySelector('em')!.textContent = `${s.basicCost(t)}銭`;
      }
      for (const [t, b] of this.specialUps) {
        const up = s.nextUp(t);
        const k = s.special[t];
        b.disabled = !up || !s.canBuy(t, 'special');
        b.classList.toggle('done', !up);
        b.querySelector('.lv')!.textContent = `特殊 ${k}/${SPECIAL_UPS[t].length}`;
        b.querySelector('small')!.textContent = up ? up.note : '覚えきった';
        b.querySelector('em')!.textContent = up ? `${s.specialCost(t)}銭` : '';
      }
      const full = s.houseHp >= HOUSE_HP;
      this.repair.disabled = !s.canRepair();
      this.repair.innerHTML = `${ICON('house')}家を直す <span>${full ? '（傷はない）' : `+${REPAIR.hp}`}</span><em>${s.repairCost}銭</em>`;
      const owned = s.dogKinds;
      for (const [kind, b] of this.dogs) {
        const r = s.roles[kind];
        const has = owned.includes(kind);
        b.disabled = !has;
        b.classList.toggle('locked', !has);
        if (!has) {
          if (b.dataset.role === 'locked') continue;
          b.dataset.role = 'locked';
          b.querySelector('.role')!.innerHTML = `まだいない<small>番犬の特殊で仲間に</small>`;
          continue;
        }
        if (b.dataset.role === r) continue;
        b.dataset.role = r;
        b.querySelector('.role')!.innerHTML = `${ICON(ROLE_ICON[r])}${DOG_ROLES[r].name}<small>${DOG_ROLES[r].note}</small>`;
      }
      return;
    }
    const wp = s.weapon;
    if (this.weapon.dataset.w !== wp) {
      this.weapon.dataset.w = wp;
      this.weapon.innerHTML = `<span class="row">${ICON(wp)}${wp === 'knife' ? 'ナイフ' : '弓'}</span><small>持ち替え</small>`;
    }
    for (const [sp, b] of this.specials) {
      const g = s.gauges[sp];
      const on = s.hero.ouran > 0 && s.hero.special === sp;
      b.disabled = !s.canOuran(sp);
      b.classList.toggle('ready', s.canOuran(sp));
      b.classList.toggle('on', on);
      b.style.setProperty('--fill', String(g / 100));
      b.querySelector('small')!.textContent = on ? '満開' : g >= 100 ? '押せ！' : `${Math.floor(g)}%`;
    }
  }
}
