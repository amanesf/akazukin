/*
 * 見せる自動操作（プレイ動画用・2026-10-04）。scripts/bot.mjs と同じく、0.1秒ごとに呼ぶ。
 * 素朴な bot と違い、技をつないで見せ場を作る：
 *   斬り2回 → 打ち上げ → 宙で追い打ち → 叩き落とし／群れの列へ突進／3匹以上固まったら満タンまで溜めて主砲／
 *   囲まれたら桜嵐／家に迫られたら駆けつける
 * 2026-10-06（武器の持ち替えのあとの作り）：まわりが空いていて遠くに狼がいれば弓に持ち替えて射る（流れ矢を溜める）、
 *   狼が寄ってきたらナイフに戻す。桜嵐は、まだこの夜に使っていない種類を先に出す（3種類を見せる）
 * 乱数は mem の中の決まった数列だけを使う（同じ seed なら毎回同じ動き。撮る前に描画なしで一番いい1回を選ぶため）。
 * 文字列にしてページの中でも動かすので、外の変数は使わない。
 * k：見せ方の癖（0〜1。乱数の種を変えるのと同じく、違う1回を作るためのつまみ）
 */
export function director(s, mem, k = 0.5) {
  mem.r ??= 1234567 + Math.floor(k * 1e6);
  const rnd = () => ((mem.r = (mem.r * 1103515245 + 12345) % 2147483648) / 2147483648);
  if (s.phase !== 'wave') return;
  const h = s.hero;
  if (h.down > 0) return;
  // 指の速さ：1秒に6回まで（溜めのあいだは毎回見る）
  mem.cool = (mem.cool ?? 0) - 0.1;
  if (h.charge >= 0) {
    if (h.charge >= s.chargeFull) s.holdEnd(); // 満タンで撃つ（光が満ちた瞬間に離す）
    return;
  }
  if (mem.cool > 0) return;
  mem.cool = 0.16;
  const ws = s.wolves.filter((w) => w.age > 0.3);
  if (!ws.length) return;
  const dist = (w) => Math.abs(w.x - h.x) + Math.abs(w.lane - h.lane) * 120;
  const near = ws.filter((w) => Math.abs(w.lane - h.lane) < 0.45 && Math.abs(w.x - h.x) < 130);
  // 家が危ない：小さい地図で駆けつける（残像つきの全力疾走）
  const threat = ws.filter((w) => w.x < 230 && w.x < h.x - 80);
  if (threat.length) {
    const t = threat.reduce((a, b) => (a.x < b.x ? a : b));
    s.runTo(t.x + 40, t.lane, true);
    mem.chain = 0;
    return;
  }
  // 桜嵐：まわりに5匹以上（または大狼が近い）
  const crowd = ws.filter((w) => Math.abs(w.x - h.x) < 220).length;
  const boss = ws.some((w) => w.kind === 'alpha' && Math.abs(w.x - h.x) < 200);
  if (crowd >= 5 || (boss && crowd >= 3)) {
    mem.used ??= {};
    const ready = ['senbon', 'nagare', 'midare'].filter((k) => s.canOuran(k));
    const sp = ready.find((k) => !mem.used[k]) ?? ready[0];
    if (sp && s.ouran(sp)) { mem.used[sp] = (mem.used[sp] ?? 0) + 1; return; }
  }
  // 武器：寄ってきたらナイフ。まわりが空いていて、流れ矢がまだ溜まっていなければ弓で遠くを射る
  const close = ws.filter((w) => Math.abs(w.x - h.x) < 160 && Math.abs(w.lane - h.lane) < 0.5).length;
  const wantBow = close === 0 && s.gauges.nagare < 100 && !(mem.used?.nagare >= 1 && s.gauges.senbon < 100);
  if (s.weapon === 'bow' && !wantBow) { s.switchWeapon('knife'); return; }
  if (wantBow) {
    const far = ws.filter((w) => Math.abs(w.x - h.x) <= s.bowRange && w.age >= 0.4);
    if (far.length) {
      if (s.weapon !== 'bow') { s.switchWeapon('bow'); return; }
      const t = far.reduce((a, b) => (dist(a) < dist(b) ? a : b));
      s.tap(t.x, t.lane, t.id);
      return;
    }
  }
  // 主砲：前に3匹以上が固まっている（噛まれていないとき）
  const ahead = (dir) => ws.filter((w) => (w.x - h.x) * dir > -20 && Math.abs(w.x - h.x) < 200 && Math.abs(w.lane - h.lane) < 0.55).length;
  if (h.stun <= 0 && Math.max(ahead(1), ahead(-1)) >= 3 && (mem.lastShot ?? -9) < s.clock - 5 - rnd() * 3) {
    mem.lastShot = s.clock;
    s.holdStart();
    return;
  }
  // 宙の狼：追い打ちを2回入れて叩き落とす
  const air = near.filter((w) => w.z > 25 && !w.pouncing);
  if (air.length) {
    const t = air.reduce((a, b) => (dist(a) < dist(b) ? a : b));
    mem.air = (mem.air ?? 0) + 1;
    if (mem.air >= 3 || (t.z < 60 && t.vz < 0)) { s.flick('down'); mem.air = 0; mem.chain = 0; }
    else s.tap(t.x, t.lane, t.id);
    return;
  }
  mem.air = 0;
  if (near.length) {
    const t = near.reduce((a, b) => (dist(a) < dist(b) ? a : b));
    // 斬り2回のあとに打ち上げ（大狼は打ち上がらないので斬り続ける）
    mem.chain = (mem.chain ?? 0) + 1;
    if (t.kind !== 'alpha' && mem.chain >= 3 && rnd() < 0.75) { s.flick('up'); mem.chain = 0; return; }
    s.tap(t.x, t.lane, t.id);
    return;
  }
  mem.chain = 0;
  // 離れた群れ：列になっていれば突進で抜ける。そうでなければ一番近い狼へ
  const t = ws.reduce((a, b) => (dist(a) < dist(b) ? a : b));
  const dir = t.x > h.x ? 1 : -1;
  const line = ws.filter((w) => (w.x - h.x) * dir > 60 && (w.x - h.x) * dir < 300 && Math.abs(w.lane - h.lane) < 0.4).length;
  if (line >= 2 && s.cds.tosshin <= 0 && rnd() < 0.8) { s.flick(dir > 0 ? 'right' : 'left'); return; }
  s.tap(t.x, t.lane, t.id);
}
