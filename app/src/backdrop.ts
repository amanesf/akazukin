// 背景：奥行きの層に分け、カメラが動くと層ごとにずれる（スピード感）。
// いまは仮の影絵（山・町の屋根・桜・電柱・石灯籠）。絵が入ったら層ごとに差し替える（plan.md §0.5）。
import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import { glowTexture, PINK } from './fx';

export interface Layer { c: Container; f: number } // f：カメラに付いてくる割合（1＝地面と同じ）

// 決まった並びの乱数（作り直しても同じ景色）
function rng(seed: number) {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Backdrop {
  sky = new Graphics(); // 画面に固定
  stars = new Graphics();
  moon = new Container();
  rays = new Graphics(); // 月から斜めに差す光の筋（画面に固定・加算）
  layers: Layer[] = [];
  front!: Layer; // 手前の草（体より前）
  private moonG = new Graphics();
  private sunG = new Graphics();
  private moonGlow = new Sprite(glowTexture());
  private lights: { s: Sprite; x: number; y: number; ph: number }[] = [];
  private starList: { x: number; y: number; r: number; ph: number }[] = [];
  moonArt = new Sprite(); // 紅い月の絵（moon-v1）。あれば図形の月の代わり
  town: Texture | null = null;
  private daylight: Sprite[] = [];
  props: Record<string, Texture> | null = null; // 草と小物の絵（2026-10-04 生成 grass-v1）。あれば手前の影絵の代わり
  private sway: { s: Sprite; ph: number; amp: number }[] = []; // 町並みの絵（2026-10-04 生成）。あれば奥の山と町の影絵の代わりに使う

  constructor() {
    this.moonGlow.anchor.set(0.5);
    this.rays.blendMode = 'add';
    this.moonGlow.blendMode = 'add';
    this.moonArt.anchor.set(0.5);
    this.moonArt.visible = false;
    this.moon.addChild(this.moonGlow, this.moonG, this.moonArt, this.sunG);
  }

  // 画面の大きさが変わったら作り直す。horizon は地面の奥の端（世界の y）、width は戦場の幅（世界の px）
  build(w: number, h: number, horizon: number, width: number) {
    for (const l of this.layers) l.c.destroy({ children: true });
    if (this.front) this.front.c.destroy({ children: true });
    this.layers = [];
    this.lights = [];
    this.daylight = [];
    const span = width + w * 4;
    const x0 = -w * 2;

    // 星
    const r = rng(7);
    this.starList = Array.from({ length: 70 }, () => ({ x: r() * w, y: r() * horizon * 0.85, r: 0.5 + r() * 1.3, ph: r() * 6 }));

    // 月（赤い月。裂け目から狼が来る：メインビジュアルの構図）
    const mg = this.moonG.clear();
    const R = h * 0.1;
    mg.circle(0, 0, R).fill(0xa8323a);
    mg.circle(-R * 0.25, -R * 0.2, R * 0.82).fill({ color: 0xc04048, alpha: 0.5 });
    mg.circle(R * 0.3, R * 0.25, R * 0.18).fill({ color: 0x802028, alpha: 0.6 });
    mg.circle(-R * 0.35, R * 0.35, R * 0.1).fill({ color: 0x802028, alpha: 0.5 });
    // 月の裂け目
    mg.moveTo(R * 0.1, -R).lineTo(-R * 0.05, -R * 0.4).lineTo(R * 0.15, -R * 0.05).lineTo(-R * 0.1, R * 0.45).lineTo(R * 0.05, R)
      .stroke({ width: 3, color: 0xff9080, alpha: 0.9 });
    this.sunG.clear().circle(0, 0, R * 0.8).fill(0xfff4d0).circle(0, 0, R * 0.62).fill(0xffffff);
    this.moonArt.width = this.moonArt.height = R * 1.7; // 大きいと画面の主役を食った
    this.moonGlow.width = this.moonGlow.height = R * 6;
    this.moonGlow.tint = 0xff4050;
    this.moonGlow.alpha = 0.35;

    if (this.town) {
      // 町並みの絵を、左右反転しながら並べる（つなぎ目が鏡になって目立たない）
      const tc = new Container();
      const k = (h * 0.36) / this.town.height;
      const tw = this.town.width * k;
      let n = 0;
      for (let x = x0; x < x0 + span; x += tw, n++) {
        const sp = new Sprite(this.town);
        sp.scale.set(n % 2 ? -k : k, k);
        sp.position.set(n % 2 ? x + tw : x, horizon + 3 - h * 0.36);
        tc.addChild(sp);
        // 昼の光：同じ絵を明るい色で足し合わせて重ね、昼だけ見せる（夜の絵の色を変えただけで、昼も暗い町だった。2026-10-04）
        const lit = new Sprite(this.town);
        lit.scale.copyFrom(sp.scale);
        lit.position.copyFrom(sp.position);
        lit.blendMode = 'add';
        lit.tint = 0x8a7a68;
        lit.alpha = 0;
        tc.addChild(lit);
        this.daylight.push(lit);
      }
      this.layers.push({ c: tc, f: 0.25 });
    } else {
      // 遠い山
      const far = new Graphics();
      const rf = rng(11);
      const ridge = (base: number, amp: number, step: number, color: number) => {
        const pts = [x0, horizon + 4];
        for (let x = x0; x <= x0 + span; x += step) pts.push(x, base - amp * (0.4 + rf() * 0.6) - Math.sin(x * 0.004) * amp * 0.5);
        pts.push(x0 + span, horizon + 4);
        far.poly(pts).fill(color);
      };
      ridge(horizon - h * 0.12, h * 0.1, 70, 0x2a1626);
      ridge(horizon - h * 0.04, h * 0.07, 50, 0x22121e);
      this.layers.push({ c: wrap(far), f: 0.12 });

      // 町の屋根（瓦屋根の影絵）と窓の灯り
      const town = new Graphics();
      const rt = rng(23);
      const tc = new Container();
      tc.addChild(town);
      for (let x = x0; x < x0 + span; x += 50 + rt() * 70) {
        const bw = 50 + rt() * 60;
        const bh = h * (0.05 + rt() * 0.08);
        const top = horizon - bh;
        town.rect(x, top, bw, bh + 6).fill(0x1c0f19);
        town.poly([x - 8, top, x + bw + 8, top, x + bw * 0.8, top - bh * 0.45, x + bw * 0.2, top - bh * 0.45]).fill(0x180c15);
        if (rt() < 0.7) {
          const wx = x + bw * (0.2 + rt() * 0.5);
          const wy = top + bh * 0.35;
          town.rect(wx, wy, 7, 6).fill({ color: 0xe8b060, alpha: 0.85 });
          const s = new Sprite(glowTexture());
          s.anchor.set(0.5);
          s.blendMode = 'add';
          s.tint = 0xe89040;
          s.width = s.height = 40;
          s.alpha = 0.35;
          s.position.set(wx + 3, wy + 3);
          tc.addChild(s);
          this.lights.push({ s, x: wx, y: wy, ph: rt() * 6 });
        }
      }
      this.layers.push({ c: tc, f: 0.3 });
    }

    // 中景：桜の木・電柱と電線・石灯籠（大正の夜道）
    const mid = new Graphics();
    const mc = new Container();
    mc.addChild(mid);
    const rm = rng(41);
    const poles: [number, number][] = [];
    for (let x = x0; x < x0 + span; x += 140 + rm() * 160) {
      const kind = this.town ? 0.9 : rm(); // 町並みの絵には桜と電柱が描いてあるので、石灯籠だけ
      if (this.town && rm() > 0.35) continue; // 石灯籠だけだと並びすぎるので間引く
      if (kind < 0.5) {
        // 桜：幹と枝、花の塊
        const th = h * (0.16 + rm() * 0.08);
        mid.moveTo(x, horizon + 2).lineTo(x + 6, horizon - th * 0.6).lineTo(x - 2, horizon - th).stroke({ width: 7, color: 0x3a2028 });
        mid.moveTo(x + 5, horizon - th * 0.55).lineTo(x + 40, horizon - th * 0.85).stroke({ width: 4, color: 0x3a2028 });
        mid.moveTo(x + 3, horizon - th * 0.7).lineTo(x - 36, horizon - th * 0.95).stroke({ width: 4, color: 0x3a2028 });
        // 花の塊：小さな丸をたくさん重ねて、ふわっとした輪郭に（大きな丸だと泡に見えた）
        for (let i = 0; i < 34; i++) {
          const a = rm() * Math.PI * 2;
          const d = Math.sqrt(rm());
          const bx = x + Math.cos(a) * d * 62;
          const by = horizon - th * 1.02 + Math.sin(a) * d * 30;
          mid.circle(bx, by, 6 + rm() * 9).fill({ color: PINK[Math.floor(rm() * 4)], alpha: 0.14 + rm() * 0.14 });
        }
      } else if (kind < 0.8) {
        // 電柱
        const ph = h * 0.3;
        mid.rect(x - 2.5, horizon - ph, 5, ph + 4).fill(0x1e1218);
        mid.rect(x - 16, horizon - ph + 10, 32, 3).fill(0x1e1218);
        poles.push([x, horizon - ph + 11]);
      } else {
        // 石灯籠と灯り
        const lh = h * 0.07;
        mid.rect(x - 4, horizon - lh, 8, lh).fill(0x2a1e24);
        mid.rect(x - 11, horizon - lh - 14, 22, 14).fill(0x2a1e24);
        mid.poly([x - 15, horizon - lh - 14, x + 15, horizon - lh - 14, x, horizon - lh - 26]).fill(0x2a1e24);
        mid.rect(x - 5, horizon - lh - 11, 10, 8).fill({ color: 0xffc070, alpha: 0.9 });
        const s = new Sprite(glowTexture());
        s.anchor.set(0.5);
        s.blendMode = 'add';
        s.tint = 0xffa050;
        s.width = s.height = 90;
        s.alpha = 0.45;
        s.position.set(x, horizon - lh - 7);
        mc.addChild(s);
        this.lights.push({ s, x, y: horizon - lh - 7, ph: rm() * 6 });
      }
    }
    for (let i = 1; i < poles.length; i++) {
      const [ax, ay] = poles[i - 1];
      const [bx, by] = poles[i];
      if (bx - ax > 500) continue;
      mid.moveTo(ax, ay).quadraticCurveTo((ax + bx) / 2, ay + 22, bx, by).stroke({ width: 1, color: 0x2e1c26 });
    }
    this.layers.push({ c: mc, f: 0.6 });

    // 地面：奥から手前へ少し明るく。道の筋と小石
    const ground = new Graphics();
    const rg = rng(57);
    const gx0 = -w * 2;
    const gw = width + w * 4;
    ground.rect(gx0, horizon, gw, h * 1.2).fill(0x342834);
    ground.rect(gx0, horizon + h * 0.06, gw, h * 1.2).fill(0x3a2d36);
    ground.rect(gx0, horizon + h * 0.14, gw, h * 1.2).fill(0x40323a);
    ground.rect(gx0, horizon, gw, 2).fill({ color: 0x5a4038, alpha: 0.8 });
    for (let i = 0; i < 160; i++) {
      const x = gx0 + rg() * gw;
      const y = horizon + 6 + rg() * h * 0.3;
      ground.ellipse(x, y, 2 + rg() * 5, 1 + rg() * 2).fill({ color: rg() < 0.5 ? 0x463630 : 0x1e1414, alpha: 0.8 });
    }
    // 草の房（地面の奥の縁）
    for (let x = gx0; x < gx0 + gw; x += 14 + rg() * 30) {
      const y = horizon + rg() * 4;
      for (let k = -2; k <= 2; k++) ground.moveTo(x + k * 2, y).lineTo(x + k * 4 + (rg() - 0.5) * 4, y - 6 - rg() * 8).stroke({ width: 1.5, color: 0x3a2a2a });
    }
    this.layers.push({ c: wrap(ground), f: 1 });

    // 手前の草と柵（体より前。ぼかす代わりに暗く）
    this.sway = [];
    if (this.props) {
      // 草と花の絵を並べ、根元を中心に風で揺らす（2026-10-04 アマネさん「草もリアルに」）
      const fc = new Container();
      const rr = rng(71);
      const fy = horizon + h * 0.4;
      const kinds = ['grass', 'nanohana', 'azalea', 'grass', 'dandelion', 'fence']; // 春の夜にそろえる（すすき・彼岸花は秋で、季節が混ざった）
      for (let x = gx0; x < gx0 + gw * 1.3; x += 70 + rr() * 150) {
        const k = kinds[Math.floor(rr() * kinds.length)];
        const sp = new Sprite(this.props[k]);
        sp.anchor.set(0.5, 1);
        const hh = h * (k === 'fence' ? 0.16 : k === 'flowers' ? 0.1 : 0.15 + rr() * 0.07);
        sp.scale.set((hh / sp.texture.height) * (rr() < 0.5 ? -1 : 1), hh / sp.texture.height);
        sp.position.set(x, fy + 26);
        sp.tint = 0x6a5a80; // 手前はうす暗く（主人公と狼に目が行くように）
        fc.addChild(sp);
        if (k !== 'fence') this.sway.push({ s: sp, ph: rr() * 6, amp: k === 'flowers' ? 0.03 : 0.07 });
      }
      this.front = { c: fc, f: 1.3 };
      return;
    }
    // 手前の草と柵（体より前。ぼかす代わりに暗く）
    const fg = new Graphics();
    const rr = rng(71);
    const fy = horizon + h * 0.4;
    for (let x = gx0; x < gx0 + gw * 1.3; x += 60 + rr() * 140) {
      if (rr() < 0.35) {
        fg.rect(x, fy - 40, 7, 60).fill(0x0e080a);
        fg.rect(x - 30, fy - 30, 70, 5).fill(0x0e080a);
      } else {
        for (let k = 0; k < 7; k++) fg.moveTo(x + k * 5, fy + 20).quadraticCurveTo(x + k * 5 + 4, fy - 6, x + k * 6 + (rr() - 0.5) * 16, fy - 18 - rr() * 22).stroke({ width: 3, color: 0x0e080a });
      }
    }
    this.front = { c: wrap(fg), f: 1.3 };
  }

  // 毎フレーム：星のまたたき・灯りのゆらぎ・空の色（昼 day=1）
  update(t: number, w: number, horizon: number, day: number, skyTop: number) {
    const s = this.sky.clear();
    // 夜は真っ暗にせず、深い藍から紫へ（2026-10-04 アマネさん「夜もあんまり暗くなくてもいい」）
    const top = mix(0x161a3c, 0x5a86b8, day);
    const mid = mix(0x34295a, 0x9ab8d8, day);
    const low = mix(0x6a3a5c, 0xf0d0b0, day);
    const bands = 36;
    for (let i = 0; i < bands; i++) {
      const k = i / (bands - 1);
      const c = k < 0.6 ? mix(top, mid, k / 0.6) : mix(mid, low, (k - 0.6) / 0.4);
      s.rect(0, skyTop + ((horizon - skyTop + 40) * i) / bands, w, (horizon - skyTop + 40) / bands + 1).fill(c);
    }
    const st = this.stars.clear();
    if (day < 1) {
      for (const p of this.starList) st.circle(p.x, p.y + skyTop, p.r).fill({ color: 0xffffff, alpha: (0.35 + 0.35 * Math.sin(t * 2 + p.ph)) * (1 - day) });
    }
    for (const l of this.lights) l.s.alpha = (0.32 + 0.1 * Math.sin(t * 3 + l.ph) + 0.05 * Math.sin(t * 11 + l.ph)) * (1 - day * 0.8);
    this.moonG.alpha = this.moonArt.visible ? 0 : 1 - day;
    this.moonArt.alpha = 1 - day;
    // 月から左下へ差す光の筋はやめた（2026-10-06 アマネさん「月から出てる放射状の線みたいなの嫌だな」）
    this.rays.clear();
    this.sunG.alpha = day;
    this.moonGlow.tint = mix(0xff4050, 0xfff0c0, day);
    const tint = mix(0xffffff, 0xd8c8d0, day);
    for (const l of this.layers) l.c.tint = tint;
    for (const d of this.daylight) d.alpha = day * 0.75;
    // 手前の草が風で揺れる（ときどき強く）
    const gust = Math.max(0, Math.sin(t * 0.45)) ** 6;
    for (const g of this.sway) g.s.rotation = Math.sin(t * 1.7 + g.ph) * g.amp * (1 + gust * 2) - gust * g.amp;
  }
}

function wrap(g: Graphics) {
  const c = new Container();
  c.addChild(g);
  return c;
}

// 色を混ぜる（a→b、k は 0〜1）
export function mix(a: number, b: number, k: number) {
  k = Math.max(0, Math.min(1, k));
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - k) + ((b >> s) & 255) * k);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}
