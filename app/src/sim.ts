// 戦いの中身。描画を知らない。固定ステップで進め、同じ入力なら同じ結果になる。
import {
  AIM_MAX, AIM_MIN, BOW, CHARGE, COIN_PER_SEC, COIN_START, DOG_HOLD_X, DOG_SPAWN_X, DOGS, FIRST_WAVE_DELAY,
  GIRL_X, HOUSE_HP, HOUSE_X, HOWL, KNIFE, STEP, TAP_MAX, UP, UPGRADES, WAVES, WOLF_SPAWN_X, WOLVES,
  type DogKind, type UpgradeId, type WolfKind,
} from './config';

export interface Unit {
  id: number;
  x: number;
  lane: number; // 見た目の奥行き（0〜1）。当たり判定には使わない
  hp: number;
  maxHp: number;
  size: number;
  cooldown: number;
  hitFlash: number;
}
export interface Wolf extends Unit { kind: WolfKind; hasted: boolean }
export interface Dog extends Unit { kind: DogKind }
export interface Arrow { fromX: number; toX: number; t: number; flight: number; lane: number; damage: number }
export interface Shell { fromX: number; toX: number; t: number; lane: number; damage: number; splash: number }
export interface Fx { kind: 'blast' | 'poof' | 'slash' | 'miss'; x: number; lane: number; t: number; r?: number }

export type Result = 'playing' | 'won' | 'lost';
// lead：最初の波の前／wave：戦闘中／shop：波の合間（強化を買い、「次の波」で進む）
export type Phase = 'lead' | 'wave' | 'shop';

interface Spawner { kind: WolfKind; left: number; interval: number; next: number }

export class Sim {
  clock = 0;
  coins = COIN_START;
  houseHp = HOUSE_HP;
  aimX = 600;
  wave = 0; // 0 始まり。WAVES.length に達したら全滅させた
  lead = FIRST_WAVE_DELAY;
  phase: Phase = 'lead';
  result: Result = 'playing';
  kills = 0;

  wolves: Wolf[] = [];
  dogs: Dog[] = [];
  arrows: Arrow[] = [];
  shells: Shell[] = [];
  fx: Fx[] = [];

  bowCd = 0;
  knifeCd = 0;
  pressing = false; // 戦場を押している
  pressT = 0; // 押している秒数
  recover = 0; // 主砲を撃ったあとの待ち
  levels: Record<UpgradeId, number> = { bowPower: 0, bowCount: 0, chargeSpeed: 0, blastSize: 0, knifeReach: 0, repair: 0 };
  dogCd: Record<DogKind, number> = { shiba: 0, akita: 0, tosa: 0 };

  private spawners: Spawner[] = [];
  private nextId = 1;
  private seed: number;

  constructor(seed = 1) {
    this.seed = seed;
  }

  // ── 入力 ──
  setAim(x: number) {
    this.aimX = Math.min(AIM_MAX, Math.max(AIM_MIN, x));
  }

  // 戦場を押す・ずらす・離す。短く離せば弓、長く押して離せば主砲
  press(x: number) {
    this.setAim(x);
    this.pressing = true;
    this.pressT = 0;
  }

  drag(x: number) {
    if (this.pressing) this.setAim(x);
  }

  release() {
    if (!this.pressing) return;
    const st = this.chargeStage(); // 押している状態のまま数える
    this.pressing = false;
    if (this.pressT < TAP_MAX) this.shootBow();
    else if (st >= 0 && this.cannonInRange()) this.fireCannon(st);
    this.pressT = 0;
  }

  // タメの段（-1 はまだ届いていない）と、次の段までの進み具合
  chargeStage() {
    if (!this.charging()) return -1;
    let st = -1;
    CHARGE.stages.forEach((_, i) => { if (this.pressT >= this.chargeAt(i)) st = i; });
    return st;
  }

  chargeProgress() {
    const st = this.chargeStage();
    if (st >= CHARGE.stages.length - 1) return 1;
    const from = st < 0 ? TAP_MAX : this.chargeAt(st);
    return Math.min(1, (this.pressT - from) / (this.chargeAt(st + 1) - from));
  }

  charging() {
    return this.pressing && this.pressT >= TAP_MAX && this.recover <= 0;
  }

  cannonInRange() {
    return this.aimX >= CHARGE.minRange;
  }

  chargeAt(i: number) {
    return TAP_MAX + (CHARGE.stages[i].at - TAP_MAX) * UP.chargeSpeed ** this.levels.chargeSpeed;
  }

  private shootBow() {
    if (this.bowCd > 0 || this.aimX < BOW.minX) return;
    const n = 1 + this.levels.bowCount;
    const damage = BOW.damage + UP.bowPower * this.levels.bowPower;
    for (let i = 0; i < n; i++) {
      const toX = this.aimX + (i - (n - 1) / 2) * BOW.fan;
      const flight = BOW.flightBase + (toX - GIRL_X) * BOW.flightPerUnit;
      this.arrows.push({ fromX: GIRL_X, toX, t: 0, flight, lane: 0.5, damage });
    }
    this.bowCd = BOW.interval;
  }

  private fireCannon(stage: number) {
    const c = CHARGE.stages[stage];
    const splash = c.splash * UP.blastSize ** this.levels.blastSize;
    for (let i = 0; i < c.shells; i++) {
      const off = (i - (c.shells - 1) / 2) * (CHARGE.spread / 1.5) + (this.rand() - 0.5) * CHARGE.spread;
      this.shells.push({ fromX: GIRL_X, toX: this.aimX + off, t: -i * 0.08, lane: this.rand(), damage: c.damage, splash });
    }
    this.recover = CHARGE.recover;
  }

  // ── 強化（波の合間だけ） ──
  upgradeCost(id: UpgradeId): number | undefined {
    const costs = UPGRADES[id].costs;
    return id === 'repair' ? costs[0] : costs[this.levels[id]];
  }

  canBuy(id: UpgradeId) {
    const cost = this.upgradeCost(id);
    if (this.phase !== 'shop' || cost === undefined || this.coins < cost) return false;
    return id !== 'repair' || this.houseHp < HOUSE_HP;
  }

  buy(id: UpgradeId) {
    if (!this.canBuy(id)) return false;
    this.coins -= this.upgradeCost(id)!;
    this.levels[id]++;
    if (id === 'repair') this.houseHp = Math.min(HOUSE_HP, this.houseHp + UP.repair);
    return true;
  }

  nextWave() {
    if (this.phase !== 'shop' || this.result !== 'playing') return false;
    this.startWave();
    return true;
  }

  private startWave() {
    this.spawners = WAVES[this.wave].map(([kind, count, interval, delay]) => ({ kind, left: count, interval, next: delay }));
    this.phase = 'wave';
  }

  canDog(kind: DogKind) {
    return this.result === 'playing' && this.phase === 'wave' && this.dogCd[kind] <= 0 && this.coins >= DOGS[kind].cost;
  }

  sendDog(kind: DogKind) {
    if (!this.canDog(kind)) return false;
    const s = DOGS[kind];
    this.coins -= s.cost;
    this.dogCd[kind] = s.cooldown;
    this.dogs.push({ ...this.unit(DOG_SPAWN_X, s.hp, s.size), kind });
    return true;
  }

  // ── 進行 ──
  advance(dt: number) {
    // 実時間を固定ステップに刻む。重い端末でも結果は変わらない
    this.acc += Math.min(dt, 0.25);
    while (this.acc >= STEP) {
      this.acc -= STEP;
      this.step(STEP);
    }
  }
  private acc = 0;

  step(dt: number) {
    for (const f of this.fx) f.t += dt;
    this.fx = this.fx.filter((f) => f.t < 0.6);
    if (this.result !== 'playing') return;
    this.clock += dt;
    this.bowCd -= dt;
    this.recover = Math.max(0, this.recover - dt);
    if (this.pressing) this.pressT += dt;
    if (this.phase !== 'wave') {
      // 合間は時が止まる（待てば銭が貯まる、にはしない）
      if (this.phase === 'lead' && (this.lead -= dt) <= 0) this.startWave();
      return;
    }
    this.coins += COIN_PER_SEC * dt;
    this.knifeCd -= dt;
    for (const k of Object.keys(this.dogCd) as DogKind[]) this.dogCd[k] = Math.max(0, this.dogCd[k] - dt);

    this.runWaves(dt);
    this.moveWolves(dt);
    this.moveDogs(dt);
    this.girl();
    this.flyArrows(dt);
    this.flyShells(dt);
    this.reap();
    this.endWave();

    if (this.houseHp <= 0) {
      this.houseHp = 0;
      this.result = 'lost';
    }
  }

  private runWaves(dt: number) {
    for (const s of this.spawners) {
      s.next -= dt;
      while (s.left > 0 && s.next <= 0) {
        const w = WOLVES[s.kind];
        this.wolves.push({ ...this.unit(WOLF_SPAWN_X, w.hp, w.size), kind: s.kind, hasted: false });
        s.left--;
        s.next += s.interval;
      }
    }
    this.spawners = this.spawners.filter((s) => s.left > 0);
  }

  // 波を全滅させたら合間へ。最後の波なら狼絶滅
  private endWave() {
    if (this.spawners.length > 0 || this.wolves.length > 0) return;
    this.wave++;
    this.arrows = [];
    this.shells = [];
    if (this.wave >= WAVES.length) this.result = 'won';
    else this.phase = 'shop';
  }

  private moveWolves(dt: number) {
    const howlers = this.wolves.filter((w) => w.kind === 'howler');
    for (const w of this.wolves) {
      const s = WOLVES[w.kind];
      w.hitFlash = Math.max(0, w.hitFlash - dt);
      w.cooldown -= dt;
      w.hasted = w.kind !== 'howler' && howlers.some((h) => Math.abs(h.x - w.x) < HOWL.radius);
      const dog = this.dogs.find((d) => d.x < w.x && w.x - d.x <= (w.size + d.size) / 2);
      if (dog || w.x <= HOUSE_X + w.size / 2) {
        if (w.cooldown <= 0) {
          w.cooldown = s.interval;
          if (dog) this.hurt(dog, s.damage);
          else this.houseHp -= s.damage;
        }
        continue;
      }
      // 遠吠えは後ろで止まって吠え続ける
      if (w.kind === 'howler' && w.x <= HOWL.holdX) continue;
      w.x -= s.speed * (w.hasted ? HOWL.speedMul : 1) * dt;
    }
  }

  private moveDogs(dt: number) {
    for (const d of this.dogs) {
      const s = DOGS[d.kind];
      d.hitFlash = Math.max(0, d.hitFlash - dt);
      d.cooldown -= dt;
      const wolf = this.nearest(this.wolves.filter((w) => w.x > d.x && w.x - d.x <= (w.size + d.size) / 2), d.x);
      if (wolf) {
        if (d.cooldown <= 0) {
          d.cooldown = s.interval;
          this.hurt(wolf, s.damage);
        }
        continue;
      }
      d.x = Math.min(DOG_HOLD_X - d.lane * 40, d.x + s.speed * dt);
    }
  }

  // 赤ずきん：近くはナイフで自動（弓と主砲は入力から）
  private girl() {
    if (this.knifeCd <= 0) {
      const reach = KNIFE.reach + UP.knifeReach * this.levels.knifeReach;
      const near = this.nearest(this.wolves.filter((w) => w.x - GIRL_X <= reach), GIRL_X);
      if (near) {
        this.hurt(near, KNIFE.damage);
        this.fx.push({ kind: 'slash', x: near.x, lane: near.lane, t: 0 });
        this.knifeCd = KNIFE.interval;
      }
    }
  }

  private flyArrows(dt: number) {
    this.arrows = this.arrows.filter((a) => {
      a.t += dt / a.flight;
      if (a.t < 1) return true;
      const near = this.wolves.filter((w) => Math.abs(w.x - a.toX) <= BOW.hitRadius + w.size / 2);
      const t = this.nearest(near, a.toX);
      if (t) this.hurt(t, a.damage * (1 - WOLVES[t.kind].arrowResist));
      else this.fx.push({ kind: 'miss', x: a.toX, lane: a.lane, t: 0 });
      return false;
    });
  }

  private flyShells(dt: number) {
    this.shells = this.shells.filter((s) => {
      s.t += dt / CHARGE.flight;
      if (s.t < 1) return true;
      for (const w of this.wolves) if (Math.abs(w.x - s.toX) <= s.splash + w.size / 2) this.hurt(w, s.damage);
      this.fx.push({ kind: 'blast', x: s.toX, lane: s.lane, t: 0, r: s.splash });
      return false;
    });
  }

  private reap() {
    this.wolves = this.wolves.filter((w) => {
      if (w.hp > 0) return true;
      this.coins += WOLVES[w.kind].bounty;
      this.kills++;
      this.fx.push({ kind: 'poof', x: w.x, lane: w.lane, t: 0 });
      return false;
    });
    this.dogs = this.dogs.filter((d) => d.hp > 0);
  }

  // ── 下回り ──
  private hurt(u: Unit, dmg: number) {
    u.hp -= dmg;
    u.hitFlash = 0.12;
  }

  private nearest<T extends Unit>(list: T[], x: number): T | undefined {
    let best: T | undefined;
    for (const u of list) if (!best || Math.abs(u.x - x) < Math.abs(best.x - x)) best = u;
    return best;
  }

  private unit(x: number, hp: number, size: number): Unit {
    return { id: this.nextId++, x, lane: this.rand(), hp, maxHp: hp, size, cooldown: 0, hitFlash: 0 };
  }

  private rand() {
    // mulberry32
    let t = (this.seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
}
