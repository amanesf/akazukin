// 戦いの中身。描画を知らない。固定ステップで進め、同じ入力なら同じ結果になる。
import {
  AIM_MAX, AIM_MIN, BOW, CANNON, COIN_PER_SEC, COIN_START, DOG_HOLD_X, DOG_SPAWN_X, DOGS, GIRL_X, HOUSE_HP,
  HOUSE_X, HOWL, KNIFE, STEP, WAVE_GAP, WAVES, WOLF_SPAWN_X, WOLVES,
  type DogKind, type WolfKind,
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
export interface Arrow { targetId: number; x: number; lane: number }
export interface Shell { fromX: number; toX: number; t: number; lane: number }
export interface Fx { kind: 'blast' | 'poof' | 'slash'; x: number; lane: number; t: number }

export type Result = 'playing' | 'won' | 'lost';

interface Spawner { kind: WolfKind; left: number; interval: number; next: number }

export class Sim {
  clock = 0;
  coins = COIN_START;
  houseHp = HOUSE_HP;
  aimX = 600;
  wave = 0; // 0 始まり。WAVES.length に達したら全滅させた
  waveGap = 2; // 次のウェーブまでの残り（最初は短め）
  inWave = false;
  result: Result = 'playing';
  kills = 0;

  wolves: Wolf[] = [];
  dogs: Dog[] = [];
  arrows: Arrow[] = [];
  shells: Shell[] = [];
  fx: Fx[] = [];

  bowCd = 0;
  knifeCd = 0;
  cannonCd = 0;
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

  canCannon() {
    return this.result === 'playing' && this.cannonCd <= 0 && this.aimX >= CANNON.minRange;
  }

  fireCannon() {
    if (!this.canCannon()) return false;
    for (let i = 0; i < CANNON.shells; i++) {
      const off = (i - (CANNON.shells - 1) / 2) * (CANNON.spread / 1.5) + (this.rand() - 0.5) * CANNON.spread;
      this.shells.push({ fromX: GIRL_X, toX: this.aimX + off, t: -i * 0.08, lane: this.rand() });
    }
    this.cannonCd = CANNON.cooldown;
    return true;
  }

  canDog(kind: DogKind) {
    return this.result === 'playing' && this.dogCd[kind] <= 0 && this.coins >= DOGS[kind].cost;
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
    this.coins += COIN_PER_SEC * dt;
    this.bowCd -= dt;
    this.knifeCd -= dt;
    this.cannonCd = Math.max(0, this.cannonCd - dt);
    for (const k of Object.keys(this.dogCd) as DogKind[]) this.dogCd[k] = Math.max(0, this.dogCd[k] - dt);

    this.runWaves(dt);
    this.moveWolves(dt);
    this.moveDogs(dt);
    this.girl();
    this.flyArrows(dt);
    this.flyShells(dt);
    this.reap();

    if (this.houseHp <= 0) {
      this.houseHp = 0;
      this.result = 'lost';
    }
  }

  private runWaves(dt: number) {
    if (this.wave >= WAVES.length) return;
    if (!this.inWave) {
      this.waveGap -= dt;
      if (this.waveGap > 0) return;
      this.spawners = WAVES[this.wave].map(([kind, count, interval, delay]) => ({ kind, left: count, interval, next: delay }));
      this.inWave = true;
    }
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
    if (this.spawners.length === 0 && this.wolves.length === 0) {
      this.inWave = false;
      this.waveGap = WAVE_GAP;
      this.wave++;
      if (this.wave >= WAVES.length) this.result = 'won'; // 狼絶滅
    }
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

  // 赤ずきん：近くはナイフ、中は弓。照準の近くの狼を優先する
  private girl() {
    if (this.knifeCd <= 0) {
      const near = this.nearest(this.wolves.filter((w) => w.x - GIRL_X <= KNIFE.reach), GIRL_X);
      if (near) {
        this.hurt(near, KNIFE.damage);
        this.fx.push({ kind: 'slash', x: near.x, lane: near.lane, t: 0 });
        this.knifeCd = KNIFE.interval;
      }
    }
    if (this.bowCd <= 0) {
      const inRange = this.wolves.filter((w) => w.x - GIRL_X <= BOW.range && w.x - GIRL_X > KNIFE.reach * 0.5);
      const aimed = inRange.filter((w) => Math.abs(w.x - this.aimX) <= BOW.aimRadius);
      const target = this.nearest(aimed.length ? aimed : inRange, aimed.length ? this.aimX : GIRL_X);
      if (target) {
        this.arrows.push({ targetId: target.id, x: GIRL_X, lane: target.lane });
        this.bowCd = BOW.interval;
      }
    }
  }

  private flyArrows(dt: number) {
    this.arrows = this.arrows.filter((a) => {
      const t = this.wolves.find((w) => w.id === a.targetId);
      if (!t) return false;
      a.x += BOW.speed * dt;
      a.lane += (t.lane - a.lane) * 0.2;
      if (a.x < t.x) return true;
      this.hurt(t, BOW.damage * (1 - WOLVES[t.kind].arrowResist));
      return false;
    });
  }

  private flyShells(dt: number) {
    this.shells = this.shells.filter((s) => {
      s.t += dt / CANNON.flight;
      if (s.t < 1) return true;
      for (const w of this.wolves) if (Math.abs(w.x - s.toX) <= CANNON.splash + w.size / 2) this.hurt(w, CANNON.damage);
      this.fx.push({ kind: 'blast', x: s.toX, lane: s.lane, t: 0 });
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
