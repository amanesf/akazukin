// 指一本の操作（2026-10-04）。戦場の上で：
//   タップ＝触った所にいちばん近い狼を、持っている武器で攻撃（ナイフ：走って行って斬る・弓：その場から撃つ。2026-10-05）／
//   はじく＝左右：突進（移動）・上：斬り上げ・下：叩き落とし／長押し→離す＝主砲。小さい地図のタップ＝そこへ駆けつける。
// 昼は戦場では何もしない（番犬は自分で動く。役目は下の板で決める）。
// はじきは指を離すのを待たず、動いた瞬間に出す（手応えを早く返す）。
import type { Sim } from './sim';
import type { View } from './view';

const FLICK_DIST = 26; // これだけ動けば、はじき
const FLICK_TIME = 0.22; // この秒数のうちに
const HOLD_TIME = 0.2; // これだけ動かずに押していれば溜め
const TAP_SLOP = 12;

export class Input {
  private down: { id: number; x: number; y: number; t: number; mini: boolean; done: boolean; holding: boolean } | null = null;
  private holdTimer = 0;

  private canvas: HTMLCanvasElement;
  private view: View;
  private sim: () => Sim;

  constructor(canvas: HTMLCanvasElement, view: View, sim: () => Sim) {
    this.canvas = canvas;
    this.view = view;
    this.sim = sim;
    canvas.addEventListener('pointerdown', (e) => this.onDown(e));
    window.addEventListener('pointermove', (e) => this.onMove(e));
    window.addEventListener('pointerup', (e) => this.onUp(e));
    window.addEventListener('pointercancel', (e) => this.onUp(e));
    // 指を離した合図を取りこぼしても操作が止まらないように、画面を離れたら押していた指を忘れる
    window.addEventListener('blur', () => this.forget());
    document.addEventListener('visibilitychange', () => document.hidden && this.forget());
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    this.keys();
  }

  private local(e: PointerEvent) {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private now() {
    return performance.now() / 1000;
  }

  private onDown(e: PointerEvent) {
    const s = this.sim();
    const p = this.local(e);
    if (s.phase === 'shop') return;
    if (this.down) {
      // 2本目の指は見ない。ただし最初の指（isPrimary）が来たなら、前の指の離した合図を取りこぼしている
      if (!e.isPrimary) return;
      this.forget();
    }
    const f = this.view.toField(p.x, p.y);
    this.down = { id: e.pointerId, x: p.x, y: p.y, t: this.now(), mini: !!f?.mini, done: false, holding: false };
    this.view.trail = [{ ...p, t: this.viewTime() }];
    // 長押しの判定は時間で（指を動かさなくても溜めに入る）
    clearTimeout(this.holdTimer);
    this.holdTimer = window.setTimeout(() => {
      const d = this.down;
      if (!d || d.done || d.mini) return;
      d.holding = true;
      d.done = true;
      this.sim().holdStart();
    }, HOLD_TIME * 1000);
  }

  private onMove(e: PointerEvent) {
    const s = this.sim();
    const p = this.local(e);
    const d = this.down;
    if (!d || e.pointerId !== d.id) return;
    this.view.trail.push({ ...p, t: this.viewTime() });
    if (d.done || d.mini) return;
    const dx = p.x - d.x;
    const dy = p.y - d.y;
    if (Math.hypot(dx, dy) >= FLICK_DIST) {
      d.done = true;
      clearTimeout(this.holdTimer);
      if (this.now() - d.t > FLICK_TIME) return; // ゆっくり動かしただけ
      if (Math.abs(dx) > Math.abs(dy) * 0.8) s.flick(dx > 0 ? 'right' : 'left');
      else s.flick(dy < 0 ? 'up' : 'down');
    }
  }

  private onUp(e: PointerEvent) {
    const s = this.sim();
    const p = this.local(e);
    const d = this.down;
    if (!d || e.pointerId !== d.id) return;
    this.down = null;
    clearTimeout(this.holdTimer);
    if (Math.hypot(p.x - d.x, p.y - d.y) > TAP_SLOP) {
      if (d.holding) s.holdEnd();
      return;
    }
    if (d.holding) {
      if (s.holdEnd() !== 'short') return;
      // 溜め不足で離した：ゆっくりめのタップとして斬る／走る
    } else if (d.done) return;
    const f = this.view.toField(d.x, d.y);
    if (!f) return;
    if (f.mini) s.runTo(f.x, f.lane, true);
    else s.tap(f.x, f.sky ? s.hero.lane : f.lane, this.view.wolfAt(d.x, d.y)); // 空に触れたら奥行きはそのまま（一番奥まで走っていた）。狼の絵に触れたらその狼
  }

  // 押していた指を忘れる（溜めていたら撃たずに止める）
  private forget() {
    const d = this.down;
    this.down = null;
    clearTimeout(this.holdTimer);
    if (d?.holding) this.sim().hero.charge = -1;
  }

  private viewTime() {
    return this.view.vt;
  }

  // 机の上で試すとき：矢印＝はじき、空白＝主人公の前をタップ、C を押しているあいだ溜め、B＝ナイフ⇔弓
  private keys() {
    window.addEventListener('keydown', (e) => {
      const s = this.sim();
      if (e.repeat) return;
      const map: Record<string, 'left' | 'right' | 'up' | 'down'> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
      if (map[e.key]) s.flick(map[e.key]);
      if (e.key === ' ') s.tap(s.hero.x + s.hero.facing * 30, s.hero.lane);
      if (e.key === 'c') s.holdStart();
      if (e.key === 'x') s.ouran();
      if (e.key === 'b' && s.phase === 'wave') s.switchWeapon();
    });
    window.addEventListener('keyup', (e) => {
      if (e.key === 'c') this.sim().holdEnd();
    });
  }
}
