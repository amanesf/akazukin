// プレイ動画の晩の用意（movie-search.mjs と movie.mjs で同じものを使う。ページの中でも動かすので外の変数は使わない）。
// 主人公は強化しきり（体力・近接・主砲の段を全部・番犬も）。家は無傷。昼の画面を飛ばしてその晩を始める
export const FPS = 30;
export function setupNight(s, night) {
  s.wave = night - 1;
  for (const t of Object.keys(s.levels)) s.levels[t] = 12;
  s.houseHp = 600;
  s.coins = 0;
  s.hero.hp = s.maxHp;
  s.phase = 'shop';
  s.nextWave();
  s.hero.hp = s.maxHp;
}
