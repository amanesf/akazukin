/*
 * 素朴な自動操作（指一本アクションの版・2026-10-04）。撮影（capture.js）と難しさの計測（balance.mjs）で同じものを使う。
 * 0.1秒ごとに呼ぶ（指を動かすのは1秒に4回まで）。mem は呼び出しをまたいで覚えておく入れ物。
 *   昼：近接→体力→主砲の順に買えるだけ。番犬3匹は自分で動く（dogs=false なら全員休ませる＝計測用）
 *   夜：近い狼をタップで斬る。連撃の途中で上・下にはじく。離れた群れへは突進。家に狼が迫れば地図で駆けつける。
 *       群れが目の前に3匹以上なら溜めて主砲。桜嵐は溜まったら押す
 * 文字列にしてページの中でも動かすので、外の変数は使わない。
 */
export function bot(s, mem, dogs = true) {
  if (s.phase === 'shop') {
    for (let i = 0; i < 6; i++) for (const t of ['near', 'body', 'far']) s.buy(t);
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
  const near = ws.filter((w) => Math.abs(w.lane - h.lane) < 0.4 && Math.abs(w.x - h.x) < 120);
  const threat = ws.filter((w) => w.x < 220 && w.x < h.x - 60);
  if (threat.length) {
    const t = threat.reduce((a, b) => (a.x < b.x ? a : b));
    s.runTo(t.x + 40, t.lane, true);
    return;
  }
  if (near.length >= 3 && Math.random() < 0.15) {
    s.holdStart();
    mem.charging = 1.2;
    return;
  }
  if (near.length) {
    const t = near.reduce((a, b) => (Math.abs(a.x - h.x) < Math.abs(b.x - h.x) ? a : b));
    const r = Math.random();
    if (t.z > 30 && r < 0.3) s.flick('down');
    else if (r < 0.08) s.flick('up');
    else s.tap(t.x, t.lane);
    return;
  }
  const t = ws.reduce((a, b) => (Math.abs(a.x - h.x) < Math.abs(b.x - h.x) ? a : b));
  if (Math.abs(t.x - h.x) < 300 && Math.random() < 0.2) s.flick(t.x > h.x ? 'right' : 'left');
  else s.tap(t.x, t.lane);
}
