// 戦いの中身。描画を知らない。固定ステップで進め、同じ入力なら同じ結果になる。
// 主人公は自動で動いて戦う（無双風）。プレイヤーが決めるのは構え・無双乱舞・番犬だけ。
import {
  BODY, BOW_FLIGHT, COIN_PER_SEC, COIN_START, COMBO_BASE, COMBO_RESET, DOG_HOLD_X, DOG_SPAWN_X, DOGS,
  FIRST_WAVE_DELAY, GIRL_X, HERO, HOUSE_HP, HOUSE_X, HOWL, MOVE_CD, MOVES, MUSOU, POUNCE, SHOCKWAVE, STEP,
  UP, UPGRADES, WAVES, WOLF_SPAWN_X, WOLVES,
  type DogKind, type MoveId, type UpgradeId, type WolfKind,
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
export interface Wolf extends Unit {
  kind: WolfKind;
  hasted: boolean;
  z: number; // 高さ（打ち上げ）
  vz: number;
  vx: number; // 弾かれた勢い
  stun: number; // のけぞり
  slammed: boolean; // 叩き落とされて落ちている
  skillCd: number; // 衝撃波・飛びかかり
}
export interface Dog extends Unit { kind: DogKind }
export interface Arrow { fromX: number; toX: number; t: number; flight: number; lane: number; damage: number }
export interface Shell { fromX: number; toX: number; t: number; lane: number; damage: number; area: number }
export interface Shot { x: number; lane: number } // 狼の衝撃波（左へ飛ぶ）
export interface Fx {
  kind: 'blast' | 'poof' | 'slash' | 'miss' | 'num' | 'spin' | 'land';
  x: number; lane: number; t: number; r?: number; n?: number; z?: number; big?: boolean;
}

export type Result = 'playing' | 'won' | 'lost';
// lead：最初の晩の前／wave：夜（戦闘中）／shop：昼（強化を買い、「夜を迎える」で進む）
export type Phase = 'lead' | 'wave' | 'shop';
export type Stance = 'near' | 'far';
// 画面の演出と主人公の吹き出しのための出来事（main が受け取って消す）
export type Event = 'night' | 'finisher' | 'musou' | 'hurt' | 'down' | 'revive' | 'dawn';

interface Spawner { kind: WolfKind; left: number; interval: number; next: number }

export interface Hero {
  x: number;
  hp: number;
  move: MoveId | null; // 出している技
  moveT: number;
  moveTarget: number; // 技の相手（wolf id）。0 は無し
  dashTo: number; // 突進の行き先・撃ち込む先
  step: number; // 連撃の何手目か
  down: number; // 倒れている残り秒数
  stun: number;
  hitFlash: number;
  musou: number; // 無双乱舞の残り秒数
  musouTick: number;
  facing: 1 | -1;
}

export class Sim {
  clock = 0;
  coins = COIN_START;
  houseHp = HOUSE_HP;
  wave = 0; // 0 始まり。WAVES.length に達したら試作はおしまい
  lead = FIRST_WAVE_DELAY;
  phase: Phase = 'lead';
  result: Result = 'playing';
  kills = 0;

  stance: Stance = 'near';
  hero: Hero = {
    x: GIRL_X + 40, hp: HERO.hp, move: null, moveT: 0, moveTarget: 0, dashTo: 0, step: 0,
    down: 0, stun: 0, hitFlash: 0, musou: 0, musouTick: 0, facing: 1,
  };
  gauge = 0; // 無双ゲージ（0〜100）
  combo = 0;
  bestCombo = 0;
  sinceHit = 99;
  hitStop = 0;
  shake = 0;
  events: Event[] = [];

  wolves: Wolf[] = [];
  dogs: Dog[] = [];
  arrows: Arrow[] = [];
  shells: Shell[] = [];
  shots: Shot[] = [];
  fx: Fx[] = [];

  cds: Record<'kaiten' | 'tosshin' | 'ame' | 'hougeki', number> = { kaiten: 0, tosshin: 0, ame: 0, hougeki: 0 };
  dogCd: Record<DogKind, number> = { shiba: 0, akita: 0, tosa: 0 };
  levels: Record<UpgradeId, number> = {
    kaiten: 0, tosshin: 0, shiki: 0, ame: 0, hougeki: 0, combo: 0, vigor: 0, power: 0, repair: 0,
  };

  private spawners: Spawner[] = [];
  private nextId = 1;
  private seed: number;

  constructor(seed = 1) {
    this.seed = seed;
  }

  get maxHp() {
    return HERO.hp + UP.vigor * this.levels.vigor;
  }
  get comboLen() {
    return COMBO_BASE + UP.combo * this.levels.combo;
  }
  private get power() {
    return 1 + UP.power * this.levels.power;
  }
  knows(id: UpgradeId) {
    return this.levels[id] > 0;
  }

  // ── 入力 ──
  setStance(s: Stance) {
    this.stance = s;
  }

  canMusou() {
    return this.phase === 'wave' && this.gauge >= 100 && this.hero.down <= 0 && this.hero.musou <= 0;
  }

  musou() {
    if (!this.canMusou()) return false;
    this.gauge = 0;
    this.hero.musou = MUSOU.time;
    this.hero.musouTick = 0.35; // カットインのぶん少し待つ
    this.hero.move = null;
    this.hitStop = 0.35;
    this.events.push('musou');
    return true;
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

  // ── 昼に買う ──
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
    this.hero.hp = this.maxHp; // 昼のあいだに傷は癒える（案）
    this.hero.down = 0;
    this.events.push('night');
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
    this.fx = this.fx.filter((f) => f.t < (f.kind === 'num' ? 0.8 : 0.6));
    this.shake = Math.max(0, this.shake - dt * 30);
    if (this.result !== 'playing') return;
    // ヒットストップ：当たった瞬間、世界を一瞬止める
    if (this.hitStop > 0) {
      this.hitStop -= dt;
      return;
    }
    this.clock += dt;
    if (this.phase !== 'wave') {
      // 昼は時が止まる（待てば銭が貯まる、にはしない）
      if (this.phase === 'lead' && (this.lead -= dt) <= 0) this.startWave();
      return;
    }
    this.coins += COIN_PER_SEC * dt;
    this.sinceHit += dt;
    if (this.sinceHit > COMBO_RESET) this.combo = 0;
    for (const k of Object.keys(this.cds) as (keyof Sim['cds'])[]) this.cds[k] = Math.max(0, this.cds[k] - dt);
    for (const k of Object.keys(this.dogCd) as DogKind[]) this.dogCd[k] = Math.max(0, this.dogCd[k] - dt);

    this.runWaves(dt);
    this.moveWolves(dt);
    this.moveDogs(dt);
    this.runHero(dt);
    this.flyArrows(dt);
    this.flyShells(dt);
    this.flyShots(dt);
    this.reap();
    this.endWave();

    if (this.houseHp <= 0) {
      this.houseHp = 0;
      this.result = 'lost'; // 家が落ちたら1日目から（決定）
    }
  }

  private runWaves(dt: number) {
    for (const s of this.spawners) {
      s.next -= dt;
      while (s.left > 0 && s.next <= 0) {
        const w = WOLVES[s.kind];
        this.wolves.push({
          ...this.unit(WOLF_SPAWN_X, w.hp, w.size), kind: s.kind, hasted: false,
          z: 0, vz: 0, vx: 0, stun: 0, slammed: false, skillCd: 1 + this.rand() * 2,
        });
        s.left--;
        s.next += s.interval;
      }
    }
    this.spawners = this.spawners.filter((s) => s.left > 0);
  }

  // 晩の狼を全滅させたら昼へ。最後の晩なら試作はおしまい
  private endWave() {
    if (this.spawners.length > 0 || this.wolves.length > 0) return;
    this.wave++;
    this.arrows = [];
    this.shells = [];
    this.shots = [];
    this.combo = 0;
    this.hero.move = null;
    if (this.wave >= WAVES.length) this.result = 'won';
    else {
      this.phase = 'shop';
      this.events.push('dawn');
    }
  }

  // ── 狼 ──
  private moveWolves(dt: number) {
    const howlers = this.wolves.filter((w) => w.kind === 'howler');
    const h = this.hero;
    const heroUp = h.down <= 0;
    for (const w of this.wolves) {
      const s = WOLVES[w.kind];
      w.hitFlash = Math.max(0, w.hitFlash - dt);
      w.cooldown -= dt;
      w.skillCd -= dt;
      w.stun = Math.max(0, w.stun - dt);

      // 体の動き：弾かれた勢い・打ち上げ・叩きつけ
      if (w.vx !== 0) {
        w.x = Math.min(WOLF_SPAWN_X, Math.max(HOUSE_X + 10, w.x + w.vx * dt));
        w.vx *= Math.max(0, 1 - BODY.friction * dt);
        if (Math.abs(w.vx) < 5) w.vx = 0;
      }
      if (w.z > 0 || w.vz > 0) {
        w.vz -= BODY.gravity * (w.slammed ? 2.2 : 1) * dt;
        w.z += w.vz * dt;
        if (w.z <= 0) {
          w.z = 0;
          if (w.slammed) {
            // 叩きつけ：跳ね返り、まわりの狼にも当たる
            w.slammed = false;
            w.vz = BODY.bounce;
            w.z = 0.01;
            this.fx.push({ kind: 'land', x: w.x, lane: w.lane, t: 0, r: BODY.slamSplash });
            for (const o of this.wolves) {
              if (o !== w && o.z <= 0 && Math.abs(o.x - w.x) <= BODY.slamSplash) {
                this.hit(o, BODY.slamSplashDamage, { stop: 0, kb: 120 * Math.sign(o.x - w.x || 1) });
              }
            }
            this.shake = Math.max(this.shake, 5);
          } else {
            w.vz = 0;
            w.stun = Math.max(w.stun, 0.3); // 落ちたら起き上がるまで少し
          }
        }
        continue; // 宙にいるあいだは何もできない
      }
      if (w.stun > 0) continue;

      w.hasted = w.kind !== 'howler' && howlers.some((o) => Math.abs(o.x - w.x) < HOWL.radius);

      // 特性ごとの攻め方
      if (w.kind === 'howler' && w.skillCd <= 0) {
        const near = (heroUp && h.x < w.x && w.x - h.x <= SHOCKWAVE.range) || this.dogs.some((d) => d.x < w.x && w.x - d.x <= SHOCKWAVE.range);
        if (near) {
          this.shots.push({ x: w.x - w.size / 2, lane: w.lane });
          w.skillCd = SHOCKWAVE.interval;
        }
      }
      if (w.kind === 'pup' && w.skillCd <= 0 && heroUp && h.x < w.x && w.x - h.x <= POUNCE.range && w.x - h.x > (w.size + HERO.size) / 2) {
        // 飛びかかり：跳んで一気に詰める
        w.vz = POUNCE.lift;
        w.z = 0.01;
        w.vx = -POUNCE.speed;
        w.skillCd = POUNCE.interval;
        continue;
      }

      // 噛みつく相手：主人公 → 番犬 → 家
      const heroTouch = heroUp && h.musou <= 0 && Math.abs(w.x - h.x) <= (w.size + HERO.size) / 2;
      const dog = this.dogs.find((d) => d.x < w.x && w.x - d.x <= (w.size + d.size) / 2);
      if (heroTouch || dog || w.x <= HOUSE_X + w.size / 2) {
        if (w.cooldown <= 0) {
          w.cooldown = s.interval;
          if (heroTouch) this.hurtHero(s.damage);
          else if (dog) this.hurt(dog, s.damage);
          else this.houseHp -= s.damage;
        }
        continue;
      }
      if (w.kind === 'howler' && w.x <= HOWL.holdX) continue; // 遠吠えは後ろに居座る
      w.x -= s.speed * (w.hasted ? HOWL.speedMul : 1) * dt;
    }
  }

  private flyShots(dt: number) {
    const h = this.hero;
    this.shots = this.shots.filter((s) => {
      s.x -= SHOCKWAVE.speed * dt;
      if (h.down <= 0 && h.musou <= 0 && Math.abs(s.x - h.x) < HERO.size / 2) {
        this.hurtHero(SHOCKWAVE.damage);
        return false;
      }
      const dog = this.dogs.find((d) => Math.abs(s.x - d.x) < d.size / 2);
      if (dog) {
        this.hurt(dog, SHOCKWAVE.damage);
        return false;
      }
      if (s.x <= HOUSE_X) {
        this.houseHp -= SHOCKWAVE.damage;
        return false;
      }
      return true;
    });
  }

  private moveDogs(dt: number) {
    for (const d of this.dogs) {
      const s = DOGS[d.kind];
      d.hitFlash = Math.max(0, d.hitFlash - dt);
      d.cooldown -= dt;
      const wolf = this.nearest(this.wolves.filter((w) => w.z <= 0 && w.x > d.x && w.x - d.x <= (w.size + d.size) / 2), d.x);
      if (wolf) {
        if (d.cooldown <= 0) {
          d.cooldown = s.interval;
          this.hit(wolf, s.damage, { stop: 0, quiet: true });
        }
        continue;
      }
      d.x = Math.min(DOG_HOLD_X - d.lane * 40, d.x + s.speed * dt);
    }
  }

  // ── 主人公 ──
  private hurtHero(dmg: number) {
    const h = this.hero;
    if (h.down > 0 || h.musou > 0) return;
    const before = h.hp;
    h.hp -= dmg;
    h.hitFlash = 0.15;
    h.stun = HERO.hitStunTime;
    h.move = null; // 噛まれると技が途切れる
    this.gain(MUSOU.gain.hurt * dmg);
    if (h.hp <= 0) {
      h.hp = 0;
      h.down = HERO.reviveTime;
      h.step = 0;
      this.events.push('down');
    } else if (h.hp < this.maxHp * 0.3 && before >= this.maxHp * 0.3) this.events.push('hurt');
  }

  private runHero(dt: number) {
    const h = this.hero;
    h.hitFlash = Math.max(0, h.hitFlash - dt);
    if (h.down > 0) {
      // 倒れたら家の前で立ち上がる。負けは家が落ちたときだけ
      h.down -= dt;
      h.x = GIRL_X;
      if (h.down <= 0) {
        h.hp = this.maxHp;
        this.events.push('revive');
      }
      return;
    }
    if (h.musou > 0) return this.runMusou(dt);
    if (h.stun > 0) {
      h.stun -= dt;
      return;
    }
    if (h.move) return this.runMove(dt);

    const target = this.nearest(this.wolves, h.x);
    if (this.stance === 'far') return this.thinkFar(dt, target);
    this.thinkNear(dt, target);
  }

  // 近：踏み込んで連撃。斬る→斬る→斬り上げ→（追い打ち）→叩き落とし／至近の主砲
  private thinkNear(dt: number, target: Wolf | undefined) {
    const h = this.hero;
    if (!target) return this.walk(dt, Math.max(h.x, GIRL_X + 40));
    h.facing = target.x >= h.x ? 1 : -1;
    const around = this.wolves.filter((w) => w.z <= 0 && Math.abs(w.x - h.x) <= MOVES.kaiten.area!).length;
    if (this.knows('kaiten') && this.cds.kaiten <= 0 && around >= 3) return this.startMove('kaiten', 0);
    const gap = Math.abs(target.x - h.x) - (target.size + HERO.size) / 2;
    if (this.knows('tosshin') && this.cds.tosshin <= 0 && gap > 160) {
      this.startMove('tosshin', target.id, target.x - h.facing * (target.size + HERO.size) / 2);
      return;
    }
    if (gap > MOVES.slash.reach * 0.8) return this.walk(dt, target.x - h.facing * (target.size + HERO.size) / 2);
    this.startMove(this.comboMove(target), target.id);
  }

  private comboMove(target: Wolf): MoveId {
    const h = this.hero;
    if (h.step >= this.comboLen - 1) return this.knows('shiki') ? 'shiki' : 'slam';
    if (target.z > 0) return 'air';
    if (h.step >= this.comboLen - 3) return 'launch'; // 締めの手前で打ち上げる
    return 'slash';
  }

  // 遠：家の前へ下がって弓。群れには矢の雨と主砲の撃ち込み
  private thinkFar(dt: number, target: Wolf | undefined) {
    const h = this.hero;
    if (Math.abs(h.x - HERO.farX) > 4) return this.walk(dt, HERO.farX);
    h.facing = 1;
    if (!target) return;
    const crowd = this.densest();
    if (crowd && crowd.n >= 3 && this.knows('hougeki') && this.cds.hougeki <= 0) return this.startMove('hougeki', 0, crowd.x);
    if (crowd && crowd.n >= 3 && this.knows('ame') && this.cds.ame <= 0) return this.startMove('ame', 0, crowd.x);
    this.startMove('bow', target.id);
  }

  private walk(dt: number, to: number) {
    const h = this.hero;
    const d = to - h.x;
    if (Math.abs(d) < 1) return;
    h.facing = d > 0 ? 1 : -1;
    h.x += Math.sign(d) * Math.min(Math.abs(d), HERO.speed * dt);
  }

  private startMove(id: MoveId, targetId: number, at = 0) {
    const h = this.hero;
    h.move = id;
    h.moveT = 0;
    h.moveTarget = targetId;
    h.dashTo = at;
    if (id in this.cds) this.cds[id as keyof Sim['cds']] = MOVE_CD[id as keyof typeof MOVE_CD];
  }

  // 技の中身。当てる瞬間は技の長さのちょうど半ば
  private runMove(dt: number) {
    const h = this.hero;
    const id = h.move!;
    const m = MOVES[id];
    const before = h.moveT;
    h.moveT += dt;
    const at = m.dur * 0.5;
    if (id === 'tosshin' && h.moveT < at) h.x += (h.dashTo - h.x) * Math.min(1, dt * 18);
    if (before < at && h.moveT >= at) this.strike(id);
    if (h.moveT >= m.dur) h.move = null;
  }

  private strike(id: MoveId) {
    const h = this.hero;
    const m = MOVES[id];
    const dmg = m.damage * this.power;
    if (id === 'bow') {
      const t = this.wolves.find((w) => w.id === h.moveTarget) ?? this.nearest(this.wolves, h.x);
      // 矢は遅れて落ちるので、狼の進む先を狙う
      if (t) this.loose(t.x - WOLVES[t.kind].speed * (BOW_FLIGHT.base + (t.x - h.x) * BOW_FLIGHT.perUnit), dmg);
      return;
    }
    if (id === 'ame') {
      for (let i = 0; i < 8; i++) this.loose(h.dashTo + (this.rand() - 0.5) * 160, dmg, i * 0.04);
      return;
    }
    if (id === 'hougeki') {
      for (let i = 0; i < 4; i++) {
        const off = (i - 1.5) * 26 + (this.rand() - 0.5) * 30;
        this.shells.push({ fromX: h.x, toX: h.dashTo + off, t: -i * 0.08, lane: this.rand(), damage: dmg, area: m.area! });
      }
      this.shake = Math.max(this.shake, m.shake ?? 0);
      return;
    }
    // 近接の技：前（area があればまわり）にいる狼に当てる
    const inReach = (w: Wolf) => {
      if (m.area) return Math.abs(w.x - h.x) <= m.area;
      const d = (w.x - h.x) * h.facing;
      return d >= -HERO.size / 2 && d <= HERO.size / 2 + m.reach + w.size / 2;
    };
    const hits = this.wolves.filter(inReach);
    // 連撃は相手1匹に。範囲の技と主砲はまとめて
    const targets = m.area ? hits : [hits.find((w) => w.id === h.moveTarget) ?? hits[0]].filter((w): w is Wolf => !!w);
    for (const w of targets) {
      this.hit(w, dmg, { kb: (m.kb ?? 0) * Math.sign(w.x - h.x || h.facing), lift: m.lift, slam: m.slam, stop: m.stop });
    }
    if (id === 'kaiten') this.fx.push({ kind: 'spin', x: h.x, lane: 0.5, t: 0, r: m.area });
    else if (id === 'shiki') this.fx.push({ kind: 'blast', x: h.x + h.facing * 50, lane: 0.5, t: 0, r: m.area });
    else this.fx.push({ kind: 'slash', x: h.x + h.facing * 30, lane: 0.5, t: 0, z: id === 'launch' || id === 'air' ? 1 : id === 'slam' ? -1 : 0 });
    if (m.shake && targets.length) this.shake = Math.max(this.shake, m.shake);

    // 連撃の手数を進める。締めを出したら最初から
    if (id === 'slash' || id === 'launch' || id === 'air' || id === 'slam' || id === 'shiki') {
      if (!targets.length) h.step = 0;
      else if (id === 'slam' || id === 'shiki') {
        h.step = 0;
        h.stun = 0.15; // 締めのあとの残心
        this.events.push('finisher');
      } else h.step++;
    }
  }

  private runMusou(dt: number) {
    const h = this.hero;
    h.musou -= dt;
    h.musouTick -= dt;
    if (h.musouTick <= 0) {
      h.musouTick = MUSOU.tick;
      // 次の狼へ一足で跳び、まわりをまとめて斬る
      const t = this.nearest(this.wolves.filter((w) => Math.abs(w.x - h.x) <= 360), h.x);
      if (t) {
        h.facing = t.x >= h.x ? 1 : -1;
        h.x = Math.max(GIRL_X, t.x - h.facing * 20);
      }
      for (const w of this.wolves) {
        if (Math.abs(w.x - h.x) <= MUSOU.reach) this.hit(w, MUSOU.damage * this.power, { lift: 240, stop: 0.02, kb: 60 * Math.sign(w.x - h.x || 1) });
      }
      this.fx.push({ kind: 'spin', x: h.x, lane: 0.5, t: 0, r: MUSOU.reach });
      this.shake = Math.max(this.shake, 4);
    }
    if (h.musou <= 0) {
      // 締め：主砲の全弾
      for (const w of this.wolves) {
        if (Math.abs(w.x - h.x) <= MUSOU.finalArea) this.hit(w, MUSOU.final * this.power, { kb: 500 * Math.sign(w.x - h.x || 1), stop: 0 });
      }
      this.fx.push({ kind: 'blast', x: h.x + 120, lane: 0.5, t: 0, r: MUSOU.finalArea * 0.6 });
      this.hitStop = 0.2;
      this.shake = 14;
      h.musou = 0;
      h.step = 0;
    }
  }

  // ── 飛び道具 ──
  private loose(toX: number, damage: number, delay = 0) {
    const h = this.hero;
    const flight = BOW_FLIGHT.base + Math.abs(toX - h.x) * BOW_FLIGHT.perUnit;
    this.arrows.push({ fromX: h.x, toX, t: -delay / flight, flight, lane: 0.5, damage });
  }

  private flyArrows(dt: number) {
    this.arrows = this.arrows.filter((a) => {
      a.t += dt / a.flight;
      if (a.t < 1) return true;
      const near = this.wolves.filter((w) => Math.abs(w.x - a.toX) <= BOW_FLIGHT.hitRadius + w.size / 2);
      const t = this.nearest(near, a.toX);
      if (t) this.hit(t, a.damage * (1 - WOLVES[t.kind].arrowResist), { stop: 0, kb: 30 });
      else this.fx.push({ kind: 'miss', x: a.toX, lane: a.lane, t: 0 });
      return false;
    });
  }

  private flyShells(dt: number) {
    this.shells = this.shells.filter((s) => {
      s.t += dt / 0.9;
      if (s.t < 1) return true;
      for (const w of this.wolves) {
        if (Math.abs(w.x - s.toX) <= s.area + w.size / 2) {
          this.hit(w, s.damage * (1 - WOLVES[w.kind].arrowResist), { kb: 160 * Math.sign(w.x - s.toX || 1), lift: 180, stop: 0 });
        }
      }
      this.fx.push({ kind: 'blast', x: s.toX, lane: s.lane, t: 0, r: s.area });
      this.shake = Math.max(this.shake, 3);
      return false;
    });
  }

  // ── 当てる ──
  private hit(w: Wolf, dmg: number, o: { kb?: number; lift?: number; slam?: boolean; stop?: number; quiet?: boolean }) {
    const light = 1 - (WOLVES[w.kind].heavy ?? 0);
    this.hurt(w, dmg);
    if (o.kb) w.vx = o.kb * light;
    if (o.lift) {
      w.vz = Math.max(w.vz, o.lift * light);
      w.z = Math.max(w.z, 0.01);
    }
    if (o.slam && w.z > 0) {
      w.slammed = true;
      w.vz = -900;
    }
    w.stun = Math.max(w.stun, 0.25);
    this.fx.push({ kind: 'num', x: w.x, lane: w.lane, t: 0, n: Math.round(dmg), z: w.z, big: dmg >= 30 });
    if (o.quiet) return; // 番犬の噛みつきはコンボに数えない
    this.combo++;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    this.sinceHit = 0;
    this.gain(MUSOU.gain.hit);
    if (o.stop) this.hitStop = Math.max(this.hitStop, o.stop);
  }

  private gain(n: number) {
    if (this.hero.musou > 0) return;
    this.gauge = Math.min(100, this.gauge + n);
  }

  private densest(): { x: number; n: number } | undefined {
    let best: { x: number; n: number } | undefined;
    for (const w of this.wolves) {
      const n = this.wolves.filter((o) => Math.abs(o.x - w.x) <= 80).length;
      if (!best || n > best.n) best = { x: w.x, n };
    }
    return best;
  }

  private reap() {
    this.wolves = this.wolves.filter((w) => {
      if (w.hp > 0) return true;
      this.coins += WOLVES[w.kind].bounty;
      this.kills++;
      this.fx.push({ kind: 'poof', x: w.x, lane: w.lane, t: 0, z: w.z });
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
