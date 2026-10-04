// 下のボタン類（DOM）。毎フレーム sim から状態を写すだけ。
// 夜（戦闘中）は銭・家・日付と桜嵐だけ（技は戦場を指で出す）。昼は体力・近接・主砲の鍛えと、番犬の札（戦場へ引っぱって置く）。
import { DAYS_TO_CLEAR, DOG_MAX, DOGS, HOUSE_HP, TRACKS, type DogKind, type Track } from './config';
import type { Sim } from './sim';

// アイコン（2026-10-04 生成 icons-v1・tools/export-icons.py）。文字よりアイコンで（アマネさん）
export const ICON = (n: string) => `<img class="ic" src="${import.meta.env.BASE_URL}ui/icons/${n}.webp" alt="">`;
const TRACK_ICON: Record<Track, string> = { body: 'heart', near: 'knife', far: 'cannon' };

export class Panel {
  private coins: HTMLElement;
  private house: HTMLElement;
  private wave: HTMLElement;
  private battle: HTMLElement;
  private shop: HTMLElement;
  private ouran: HTMLButtonElement;
  private dogs: [DogKind, HTMLButtonElement][] = [];
  private ups: [Track, HTMLButtonElement][] = [];
  private posts: HTMLElement;
  private next: HTMLButtonElement;
  private dawn: HTMLElement;
  private sim: () => Sim;
  private lastCoins = -1;
  private lastWave = '';

  constructor(host: HTMLElement, sim: () => Sim, onDogDrag: (kind: DogKind, e: PointerEvent) => void) {
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
        <div class="dogrow"><div class="dogs"></div><p class="posts"></p></div>
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
    this.posts = q('.posts');
    this.next = q('.next');
    this.dawn = q('.dawn');
    this.ouran.addEventListener('pointerdown', () => this.sim().ouran());
    this.next.addEventListener('click', () => this.sim().nextWave());
    for (const kind of Object.keys(DOGS) as DogKind[]) {
      const b = document.createElement('button');
      b.className = 'dog';
      b.innerHTML = `<img class="pic" src="${import.meta.env.BASE_URL}dogs/${kind}.webp" alt=""><span>${DOGS[kind].name}<small>${DOGS[kind].cost}銭／晩</small></span>`;
      b.addEventListener('pointerdown', (e) => {
        if (!this.sim().canPlace()) return;
        e.preventDefault();
        onDogDrag(kind, e);
      });
      q('.dogs').appendChild(b);
      this.dogs.push([kind, b]);
    }
    for (const t of Object.keys(TRACKS) as Track[]) {
      const b = document.createElement('button');
      b.className = 'up';
      b.innerHTML = `<b>${ICON(TRACK_ICON[t])}${TRACKS[t].name}</b><span class="lv"></span><small></small><em></em>`;
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
      this.dawn.textContent = s.nightKills
        ? `夜が明けた。${s.nightKills}匹を倒し、${s.nightEarned}銭を得た`
        : '昼。鍛えて、番犬を置く';
      for (const [t, b] of this.ups) {
        const cost = s.trackCost(t);
        const next = s.nextPerk(t);
        b.disabled = !s.canBuy(t);
        b.querySelector('.lv')!.textContent = `Lv ${s.levels[t]}`;
        b.querySelector('small')!.textContent = next ? `次：${next.note}` : 'これ以上は上がらない';
        b.querySelector('em')!.textContent = cost === undefined ? '最大' : `${cost}銭`;
      }
      for (const [, b] of this.dogs) b.disabled = !s.canPlace();
      const cost = s.postCost;
      const short = cost > s.coins;
      this.posts.innerHTML = s.posts.length
        ? `今夜の番犬 ${s.posts.length}/${DOG_MAX}匹・<b class="${short ? 'short' : ''}">${cost}銭</b>${short ? '（足りない分は出ない）' : ''}<br><span>戦場の犬を引っぱって動かす・タップで選んで、もう一度タップで外す</span>`
        : `札を戦場へ引っぱって番犬を置く（毎晩 銭がかかる）`;
      return;
    }
    this.ouran.disabled = !s.canOuran();
    this.ouran.classList.toggle('ready', s.canOuran());
    this.ouran.style.setProperty('--fill', String(s.gauge / 100));
    this.ouran.querySelector('small')!.textContent = s.hero.ouran > 0 ? '乱舞中' : s.gauge >= 100 ? '押せ！' : `${Math.floor(s.gauge)}%`;
  }
}
