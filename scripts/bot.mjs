/*
 * 素朴な自動操作（指一本アクションの版・2026-10-05 タップ＝持っている武器で攻撃・自動の攻撃なし・主砲の熱）。撮影（capture.js）と難しさの計測（balance.mjs）で同じものを使う。
 * 0.1秒ごとに呼ぶ（指を動かすのは1秒に4回まで）。mem は呼び出しをまたいで覚えておく入れ物。
 *   昼：下段（特殊）を買えるだけ（番犬→主砲→弓→ナイフ→体力の順）、残りは上段（基本）を安い順に。家が傷んでいれば直す。番犬は自分で動く（dogs=false なら全員休ませる＝計測用）
 *   夜：近い狼にはナイフでタップ（連撃の途中で上・下にはじく）。離れた狼には弓に持ち替えてタップ。離れた群れへは突進。家に狼が迫れば地図で駆けつける。
 *       群れが目の前に3匹以上なら溜めて主砲（熱があふれそうなら撃たない）。桜嵐は溜まったら押す
 * 文字列にしてページの中でも動かすので、外の変数は使わない。
 */
export function bot(s, mem, dogs = true) {
  if (s.phase === 'shop') {
    if (s.houseHp < 450) s.repair();
    for (let i = 0; i < 40; i++) {
      let bought = false;
      for (const t of ['dog', 'cannon', 'bow', 'knife', 'body']) if (s.buy(t, 'special')) bought = true;
      if (bought) continue;
      // 下段がまだ残っているなら、その分は少し取っておく（上段ばかり買って下段に届かない、を避ける）
      const next = Math.min(...['dog', 'cannon', 'bow', 'knife', 'body'].map((t) => s.specialCost(t)));
      const tracks = ['knife', 'body', 'cannon', 'bow', 'dog'].sort((a, b) => s.basicCost(a) - s.basicCost(b));
      const t = tracks[0];
      if (Number.isFinite(next) && s.coins - s.basicCost(t) < next * 0.5) break;
      if (!s.buy(t, 'basic')) break;
    }
    s.nextWave();
    if (!dogs) s.dogs = [];
    mem.charging = 0;
    return;
  }
  if (s.phase !== 'wave') return;
  // 人の指の速さ：1秒に4回くらいまで
  mem.cool = (mem.cool ?? 0) - 0.1;
  if (mem.cool > 0 && !(mem.charging > 0)) return;
  mem.cool = 0.25;
  const h = s.hero;
  if (h.down > 0) return;
  s.ouran();
  if (mem.charging > 0) {
    mem.charging -= 0.25;
    if (mem.charging <= 0) s.holdEnd();
    return;
  }
  const ws = s.wolves;
  if (!ws.length) return;
  // 狼王：予兆を見てよけ（突進・遠吠えの波は跳ぶ、叩きつけは引く）、光っている印の武器で当てる
  const king = ws.find((w) => w.kind === 'king' && w.age > 0.5);
  if (king) {
    const toward = king.kdir ?? -1;
    const lungeNear = (king.mode === 'kl' && king.modeT < 0.3) || (king.mode === 'lunge' && Math.abs(king.x - h.x) < 220);
    const waveNear = s.waves.some((v) => Math.abs(v.x - h.x) < 110 && Math.sign(h.x - v.x) === v.dir);
    if ((lungeNear || waveNear) && h.z <= 0) { s.flick('up'); return; }
    if (king.mode === 'ks') {
      const c = king.x + toward * 190;
      if (Math.abs(h.x - c) < 190) { s.flick(toward > 0 ? 'right' : 'left'); return; }
    }
    const want = king.mode === 'down' ? 'senbon' : king.seq?.[king.markIdx ?? 0];
    if (want === 'nagare') { // 弓：離れて射る（離れるのは小さい地図で駆けつける）
      const away = h.x <= king.x ? Math.max(90, king.x - 430) : Math.min(800, king.x + 430);
      if (Math.abs(h.x - away) > 120) { s.runTo(away, king.lane, true); return; }
      if (s.weapon !== 'bow') s.switchWeapon('bow');
      s.tap(king.x, king.lane, king.id);
      return;
    }
    if (want === 'midare') { // 主砲：長押しで溜めて離す
      if (Math.abs(h.x - king.x) > 400) { s.runTo(king.x - 300, king.lane, true); return; }
      if (h.overheat > 0) return;
      s.holdStart();
      mem.charging = 1.1;
      return;
    }
    if (s.weapon !== 'knife') s.switchWeapon('knife');
    s.tap(king.x, king.lane, king.id);
    return;
  }
  // カラスにとまられたら左右にはじいて振りほどく
  if (s.clung) {
    s.flick(Math.random() < 0.5 ? 'left' : 'right');
    return;
  }
  const near = ws.filter((w) => Math.abs(w.lane - h.lane) < 0.4 && Math.abs(w.x - h.x) < 120);
  const threat = ws.filter((w) => w.x < 220 && w.x < h.x - 60);
  if (threat.length) {
    const t = threat.reduce((a, b) => (a.x < b.x ? a : b));
    s.runTo(t.x + 40, t.lane, true);
    return;
  }
  // 遠吠えは放っておくと子狼を呼び続けるので、家が危なくなければ倒しに行く（人もそうする）
  const howler = ws.find((w) => w.kind === 'howler' && w.x <= 640 && w.age > 0.5);
  if (howler && Math.random() < 0.6) {
    if (Math.abs(howler.x - h.x) > 200) { if (s.weapon !== 'bow') s.switchWeapon('bow'); }
    else if (s.weapon !== 'knife') s.switchWeapon('knife');
    s.tap(howler.x, howler.lane, howler.id);
    return;
  }
  // 主砲：熱があふれない（満タン1発ぶんの余裕がある）ときだけ
  if (near.length >= 3 && h.overheat <= 0 && h.heat + 1 < s.heatMax && Math.random() < 0.15) {
    s.holdStart();
    mem.charging = 1.2;
    return;
  }
  if (near.length) {
    if (s.weapon !== 'knife') s.switchWeapon('knife');
    const t = near.reduce((a, b) => (Math.abs(a.x - h.x) < Math.abs(b.x - h.x) ? a : b));
    const r = Math.random();
    if (t.z > 30 && r < 0.3) s.flick('down');
    else if (r < 0.08) s.flick('up');
    else s.tap(t.x, t.lane);
    return;
  }
  const t = ws.reduce((a, b) => (Math.abs(a.x - h.x) < Math.abs(b.x - h.x) ? a : b));
  // 離れた狼：黒（弓に弱い）や遠い狼は弓で。ほかはナイフで走って行くか突進
  const far = Math.abs(t.x - h.x);
  if (far > 160 && far <= 520 && (t.color === 'black' || Math.random() < 0.5)) {
    if (s.weapon !== 'bow') s.switchWeapon('bow');
    s.tap(t.x, t.lane);
    return;
  }
  if (s.weapon !== 'knife') s.switchWeapon('knife');
  if (far < 400 && Math.random() < 0.2) s.flick(t.x > h.x ? 'right' : 'left');
  else s.tap(t.x, t.lane);
}
