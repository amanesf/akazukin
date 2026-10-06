import './style.css';
import { Sfx } from './audio';
import { COLORS, COMBO, FINISHERS, GROWTH_TABLE, HOUSE_HP, SPECIALS, TRACK_ORDER, WOLVES, type Beat, type Track, type Finisher, type Special, type WolfColor, type WolfKind } from './config';
import { Input } from './input';
import { MOODS, mood as moodOf, newColors, night as nightOf, surgePack } from './nights';
import { TALKS } from './talks';
import { Sim, type Event, type Save } from './sim';
import { ICON, Panel } from './ui';
import { openStory } from './story';
import { View } from './view';

const params = new URLSearchParams(location.search);
// 撮影用：?auto=1 で題字を飛ばして始める、?speed=4 で早回し
const SPEED = Number(params.get('speed') ?? 1);
const SAVE_KEY = 'akazukin.save.v1';

// デバッグモードのあいだは、保存をこの端末に書かずに覚えておくだけ（遊んでいる続きを消さない）
let debug = false;
let debugSave: Save | null = null;
// 保存はこの端末のブラウザだけ。読めない環境（非公開窓など）でも遊べるように、失敗は黙って無視する
const store = {
  read(): Save | null {
    if (debug) return debugSave;
    try {
      const d = JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null');
      return d && (d.v === 1 || d.v === 2 || d.v === 3) ? d : null;
    } catch {
      return null;
    }
  },
  write(d: Save) {
    if (debug) return void (debugSave = d);
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(d)); } catch { /* 保存できなくても続ける */ }
  },
  clear() {
    if (debug) return void (debugSave = null);
    try { localStorage.removeItem(SAVE_KEY); } catch { /* 同上 */ }
  },
};

// top-level await は使わない：本番ビルドでは Pixi の遅延読み込みの塊が index を待ち、index が
// その塊を待って、互いに止まる（撮影で実測。開発サーバーでは起きない）。
main();

async function main() {
  const seed = () => (Date.now() & 0xffff) || 1;
  let sim = new Sim(Number(params.get('seed') ?? 1));
  const view = new View();
  const sfx = new Sfx();
  const field = document.getElementById('field')!;
  const overlay = document.getElementById('overlay')!;
  await view.init(field);
  new Input(view.app.canvas, view, () => sim);
  const panel = new Panel(document.getElementById('panel')!, () => sim);

  // 音：最初は切。押すと入る
  const sound = document.getElementById('sound') as HTMLButtonElement;
  sound.innerHTML = `${ICON('note')}切`;
  document.getElementById('pause')!.innerHTML = ICON('pause');
  sound.addEventListener('click', () => {
    const on = sfx.toggle();
    sound.innerHTML = `${ICON('note')}${on ? '入' : '切'}`;
    sound.classList.toggle('on', on);
  });

  // 主人公の台詞（**仮・アマネさん未確認**）。出来事ごとに1つ、短く。続けては喋らない
  const LINES: Partial<Record<Event, string[]>> = {
    night: ['今夜は何匹かな♪', 'さ、狩りの時間'],
    finisher: ['ばーん♪', 'おやすみ', 'つぎのひと〜'],
    ouran: ['ぜーんぶ、まとめて――おやすみ'], // 必殺技ごとの台詞は SP_LINES
    hurt: ['いったぁ……噛んだね？'],
    overheat: ['あちち、主砲が焼けちゃった', 'ちょっと冷まさなきゃ'],
    down: ['おばあちゃん、ちょっと待ってて'],
    revive: ['……お返し、しなきゃ'],
    surge: ['わ、いっぱい来た♪'],
    combo10: ['ふふっ、まだまだ♪'],
    combo30: ['止まらないよ〜♪'],
    dawn: ['朝だ〜。おばあちゃん、無事？'],
    kingdown: ['今だっ！ 封が割れた！'],
    kingdie: ['……おやすみ、王さま'],
  };
  // 色の狼が初めて出てきたとき（新顔）の台詞。弱い武器の使い方を1回だけ（**仮**）
  const FACE_LINES: Record<WolfColor, string> = {
    red: '速い子は、ナイフで待ち伏せ♪',
    purple: 'おっきい子は、主砲でどーん',
    black: '噛まれたら痛そう……弓で遠くから',
    orange: '群れのまんなかで、爆ぜさせちゃお',
    green: '起き上がってくる……桜でしか眠らないみたい',
    gold: '金ぴか！ つかまえたらご褒美かも',
  };
  // 狼の名前と絵（色の狼は色の名前と、頭の上と同じ弱い武器の印）
  const wolfTag = (kind: WolfKind, color: WolfColor | undefined, n: number) => {
    const c = color ? COLORS[color] : null;
    const img = color && (kind === 'wolf' || kind === 'pup') ? `col/${color}` : kind; // 色の狼はゲームと同じ色付けの絵（scripts/export-colors.mjs）
    return `<span${c ? ` class="col" style="color:${c.ui}"` : ''}><img src="${BASE}wolves/${img}.webp" alt="">${c ? c.name : ''}${WOLVES[kind].name}${c?.weak ? ICON(c.icon) : ''}<i>${n}</i></span>`;
  };
  // 一覧を短く（2026-10-05 レビュー11・12。70晩目で右上が12行になり月と裂け目を隠した）：
  // 色の狼は子狼と狼をまとめて「赤い狼」1つに。max を超えたら、大物と数の多い順に残して、残りは「ほか○匹」
  type Row = { kind: WolfKind; color?: WolfColor; n: number };
  const BIG: WolfKind[] = ['king', 'alpha', 'wman', 'wwoman'];
  const tidyList = (list: Row[], max: number) => {
    const rows: Row[] = [];
    for (const e of list) {
      const kind: WolfKind = e.color && e.kind === 'pup' ? 'wolf' : e.kind;
      const o = rows.find((r) => r.kind === kind && r.color === e.color);
      if (o) o.n += e.n;
      else rows.push({ kind, color: e.color, n: e.n });
    }
    if (rows.length <= max) return { rows, rest: 0 };
    const rank = (r: Row) => (BIG.includes(r.kind) ? 1e6 : 0) + (r.color ? 1e5 : 0) + r.n;
    const keep = new Set([...rows].sort((a, b) => rank(b) - rank(a)).slice(0, max - 1));
    return { rows: rows.filter((r) => keep.has(r)), rest: rows.filter((r) => !keep.has(r)).reduce((a, r) => a + r.n, 0) };
  };
  const SP_LINES: Record<Special, string> = {
    senbon: 'ぜーんぶ、まとめて――おやすみ',
    nagare: '逃げても、無駄だよ♪',
    midare: '撃って撃って――撃ちまくる！',
  };
  // 操作の早見（夜だけ・画面の上）。2026-10-04 アマネさん「タップ＝斬る、長押し＝主砲、みたいなのがわかるように」
  // 狼王の体力（99夜目・画面の上）
  const bossbar = document.createElement('div');
  bossbar.id = 'bossbar';
  bossbar.hidden = true;
  bossbar.innerHTML = '<b>狼王</b><div><i></i></div><p class="marks"></p><em class="warn" hidden></em>';
  field.appendChild(bossbar);
  const bossFill = bossbar.querySelector('i') as HTMLElement;
  const bossMarks = bossbar.querySelector('.marks') as HTMLElement;
  const bossWarn = bossbar.querySelector('.warn') as HTMLElement;
  let lastMarks = '';
  const legend = document.getElementById('legend')!;
  // 2026-10-05 コンボを4拍子に。1段目は基本の操作（はじくは上下左右をまとめる）、2段目は4発目の締め（3拍打つと光る）
  const FIN_ORDER: Finisher[] = ['issen', 'tsuki', 'renbu', 'jiwari', 'reishiki'];
  legend.innerHTML = `<div class="row"><span>${ICON('tap')}<b>タップ</b>斬る</span><span><i>✥</i><b>はじく</b>技</span><span>${ICON('cannon')}<b>長押し</b>主砲</span></div>`
    + `<div class="row fin">${FIN_ORDER.map((f) => `<span><i>${FINISHERS[f].key}</i>${FINISHERS[f].short ?? FINISHERS[f].name}</span>`).join('')}</div>`;
  const legendFin = legend.querySelector('.fin') as HTMLElement;
  // 打った拍（桜の印）と、決まった締めの名前
  const beatsEl = document.getElementById('beats')!;
  const finEl = document.getElementById('finname')!;
  const BEAT_MARK: Record<Beat, string> = { tap: '斬', up: '↑', down: '↓', side: '⇆' };
  let lastBeats = '';
  let lastFin = 0;
  // 桜嵐で倒した数（締めのあとに「○体撃破」と大きく出す）
  let spKills0 = -1;
  const comboEl = document.getElementById('combo')!;
  const bubble = document.getElementById('bubble')!;
  const cutin = document.getElementById('cutin')!;
  // 絵の場所は公開先の置き場所で変わるので、ここで渡す
  const BASE = import.meta.env.BASE_URL;
  cutin.style.setProperty('--art', `url(${BASE}ui/cutin.webp)`);
  overlay.style.setProperty('--title', `url(${BASE}ui/title.webp)`);
  const surge = document.getElementById('surge')!;
  const next = document.getElementById('next')!;
  const card = document.getElementById('card')!;
  const hint = document.getElementById('hint')!;
  // 1晩目だけ、指の使い方を「やってみよう」で1つずつ。やるまで次へ進まない（2026-10-04 アマネさん「操作よくわからん」。
  // 前は時間で流れて消える文字だった）
  type Did = Sim['did'];
  const STEPS: { text: string; done: (d: Did, b: Did) => boolean }[] = [
    { text: '右から来る狼をタップして斬ろう（続けてタップで連撃）', done: (d, b) => d.tap - b.tap >= 3 },
    { text: '画面を左か右に、さっとはじこう → 突進（動くのもこれ）', done: (d, b) => d.dash > b.dash },
    { text: '下の「ナイフ／弓」で持ち替えて、遠くの狼をタップ → 弓', done: (d, b) => d.bow > b.bow },
    { text: '上か下にはじこう → 斬り上げ／叩き落とし', done: (d, b) => d.launch + d.slam > b.launch + b.slam },
    { text: '長押しして、光が満ちたら離そう → 背中の主砲', done: (d, b) => d.shiki > b.shiki },
    { text: '下の小さい地図をタップ → そこへ駆けつける', done: (d, b) => d.mini > b.mini },
  ];
  let step = -1;
  let base: Did = { ...sim.did };
  let doneUntil = -1;
  let lastHint = '';
  const showCard = (big: string, small: string) => {
    card.innerHTML = `<b>${big}</b><small>${small}</small>`;
    restart(card);
  };
  let said = -99;
  let saidLen = 0;
  let surgeUntil = -1;
  let lastCombo = 0;
  let lastPending = '';
  let lastTonight = -1;
  const tonight = document.getElementById('tonight')!;
  // 節目の会話：タップで次へ。昼は時が止まっているので、そのまま読める
  const talkEl = document.getElementById('talk')!;
  const showTalk = (lines: [string, string][]) => {
    let i = 0;
    const next = () => {
      if (i >= lines.length) {
        talkEl.hidden = true;
        talkEl.onclick = null;
        return;
      }
      const [who, text] = lines[i++];
      talkEl.innerHTML = `<b class="${who === '赤ずきん' ? 'hero' : 'oba'}">${who}</b><p>${text}</p><small>${i < lines.length ? '▼ タップで次へ' : '▼ タップで閉じる'}</small>`;
      restart(talkEl);
    };
    talkEl.onclick = next;
    next();
  };
  const restart = (el: HTMLElement) => {
    el.hidden = true;
    void el.offsetWidth; // 演出をやり直す
    el.hidden = false;
  };
  const say = (ev: Event) => {
    const lines = LINES[ev];
    if (!lines) return;
    const urgent = ev === 'ouran' || ev === 'down' || ev === 'hurt' || ev === 'surge' || ev === 'dawn' || ev === 'kingdown' || ev === 'kingdie';
    if (!urgent && sim.clock - said < 6) return; // しゃべりすぎない
    bubble.textContent = ev === 'ouran' ? SP_LINES[sim.hero.special] : lines[(sim.kills + Math.floor(sim.clock)) % lines.length];
    bubble.hidden = false;
    said = sim.clock;
    saidLen = 2.2;
  };
  const overlays = () => {
    sfx.play(sim.sounds.splice(0));
    for (const ev of sim.events.splice(0)) {
      if (ev === 'ouran') {
        spKills0 = sim.kills;
        const name = SPECIALS[sim.hero.special].name;
        cutin.textContent = name;
        cutin.style.fontSize = name.length > 4 ? '30px' : ''; // 長い名前は立ち絵にかからないよう小さく
        restart(cutin);
      }
      if (ev === 'surge') {
        // 色の狼ばかりの群れは、その色の名前で（どの必殺技が効くか分かるように）
        const pack = surgePack(sim.wave + 1);
        surge.innerHTML = pack ? `<span style="color:${COLORS[pack].ui}">${COLORS[pack].name}狼</span>の群れが来る！${COLORS[pack].weak ? ICON(COLORS[pack].icon) : ''}` : '群れが来る！';
        restart(surge);
        surgeUntil = sim.clock + 2;
      }
      if (ev === 'dawn') {
        store.write(sim.save()); // 夜が明けたら保存（家が落ちたら、ここへ戻る）
        showCard('夜明け', `${sim.wave}日目の夜を越えた`);
        const talk = TALKS[sim.wave];
        if (talk) setTimeout(() => showTalk(talk), 1800); // 節目の晩のあとは、昼におばあさんと話す
      }
      if (ev === 'night') {
        const n = sim.pending().reduce((a, e) => a + e.n, 0);
        const m = sim.mood ? MOODS[sim.mood] : null;
        // 新顔の晩は、題の下に「新顔：赤い狼（速い）」
        const face = newColors(sim.wave + 1).map((c) => `<br><span style="color:${COLORS[c].ui}">新顔：${COLORS[c].name}狼（${COLORS[c].word}）</span>`).join('');
        const boss = sim.pending().filter((e) => e.kind === 'alpha' && e.color).map((e) => `<br><span style="color:${COLORS[e.color!].ui}">${COLORS[e.color!].name}大狼（${COLORS[e.color!].word}）</span>`).join('');
        if (sim.pending().some((e) => e.kind === 'king')) showCard('狼王', '九十九夜目・封じられた大神が目を覚ます<br>頭の印の武器を順に当てて、封を砕け');
        else showCard(m ? m.name : `${sim.wave + 1}日目の夜`, (m ? `${sim.wave + 1}日目・狼 ${n}匹<br>${m.note}` : `狼 ${n}匹`) + face + boss);
        document.body.dataset.mood = sim.mood ?? '';
      }
      if (ev === 'newface' && sim.newface) {
        bubble.textContent = FACE_LINES[sim.newface];
        bubble.hidden = false;
        said = sim.clock;
        saidLen = 3.2;
      }
      say(ev);
    }
    if (sim.clock > surgeUntil) surge.hidden = true;
    const king = sim.wolves.find((w) => w.kind === 'king');
    bossbar.hidden = !king;
    if (king) {
      bossFill.style.width = `${Math.max(0, (100 * king.hp) / king.maxHp)}%`;
      bossbar.classList.toggle('down', king.mode === 'down');
      // 印の並び：光っている印＝いま当てる武器。割れた印は薄く。倒れ込みのあいだは「今だ！」
      const mk = `${(king.seq ?? []).join(',')}|${king.markIdx}|${king.mode === 'down'}`;
      if (mk !== lastMarks) {
        lastMarks = mk;
        bossMarks.innerHTML = king.mode === 'down' ? '<span class="now">倒れた！ 今だ！</span>'
          : (king.seq ?? []).map((sp, i) => `<span class="${i < (king.markIdx ?? 0) ? 'done' : i === king.markIdx ? 'cur' : ''}">${ICON(SPECIALS[sp].icon)}</span>`).join('<i>›</i>');
      }
      // 予兆：↑ 跳べ（突進・遠吠え）／ ← → 引け（叩きつけ。狼王から離れる向き）
      const wind = king.mode === 'kl' || king.mode === 'kw' ? '↑ 跳べ' : king.mode === 'ks' ? `${(king.kdir ?? -1) > 0 ? '→' : '←'} 引け` : '';
      bossWarn.hidden = !wind;
      if (wind && bossWarn.textContent !== wind) bossWarn.textContent = wind;
    }
    if (sim.clock - said > saidLen) bubble.hidden = true;
    const { x, y } = view.heroAt;
    // 右端からはみ出さない
    bubble.style.left = `${Math.max(6, Math.min(x, field.clientWidth - bubble.offsetWidth * 0.8 - 6))}px`;
    bubble.style.top = `${Math.max(bubble.offsetHeight + 4, y - 6)}px`;
    let hx = '';
    if (sim.wave === 0 && sim.phase === 'wave') {
      if (step < 0 && sim.wolves.length > 0) { // 狼が出てから（いないのに「狼をタップ」と出すと迷う）
        step = 0;
        base = { ...sim.did };
      }
      if (step >= 0 && step < STEPS.length) {
        if (doneUntil < 0 && STEPS[step].done(sim.did, base)) doneUntil = sim.clock + 1;
        if (doneUntil >= 0 && sim.clock >= doneUntil) {
          step++;
          doneUntil = -1;
          base = { ...sim.did };
        }
        hx = step >= STEPS.length ? '' : doneUntil >= 0 ? '✨ できた！' : STEPS[step].text;
      }
    } else step = -1;
    if (hx !== lastHint) {
      lastHint = hx;
      hint.innerHTML = hx && !hx.startsWith('✨') ? `${ICON('tap')}${hx}` : hx;
      hint.classList.toggle('ok', hx.startsWith('✨'));
      document.body.classList.toggle('tutorial', !!hx); // 説明のあいだは右上の「これから」を隠す（重なる）
      if (hx) restart(hint);
      else hint.hidden = true;
    }
    legend.hidden = sim.phase !== 'wave' || !!hx;
    legendFin.classList.toggle('lit', sim.atFinish);
    // 拍：打った分だけ桜の印が埋まり、次の入力までの残りでしぼむ。混ぜた数で格（並・上・極）
    const bk = sim.beats.join(',');
    if (bk !== lastBeats) {
      lastBeats = bk;
      const grade = COMBO.grades[Math.max(0, new Set(sim.beats).size - 1)];
      beatsEl.innerHTML = [0, 1, 2].map((i) => (sim.beats[i] ? `<b data-k="${sim.beats[i]}">${BEAT_MARK[sim.beats[i]]}</b>` : '<b class="empty">・</b>')).join('')
        + `<i>→</i><b class="empty last">締</b>${sim.beats.length ? `<em data-g="${grade.name}">${grade.name}</em>` : ''}`;
    }
    beatsEl.hidden = sim.phase !== 'wave' || !sim.beats.length;
    beatsEl.style.setProperty('--left', String(Math.max(0, 1 - sim.beatT / COMBO.window)));
    if (spKills0 >= 0 && sim.hero.ouran <= 0) {
      const n = sim.kills - spKills0;
      spKills0 = -1;
      if (n > 0) {
        finEl.innerHTML = `<b>${n}体撃破</b><small data-g="極">桜嵐</small>`;
        restart(finEl);
      }
    }
    if (sim.finished.n !== lastFin) {
      lastFin = sim.finished.n;
      const f = sim.finished;
      finEl.innerHTML = `<b>${f.name}</b><small data-g="${COMBO.grades[f.grade].name}">${COMBO.grades[f.grade].name}</small>${f.chain >= 2 ? `<em>×${f.chain}</em>` : ''}`;
      restart(finEl);
    }
    comboEl.hidden = sim.combo < 2;
    if (sim.combo !== lastCombo) {
      comboEl.innerHTML = `${sim.combo}<small>HIT</small>`;
      comboEl.dataset.tier = sim.combo >= 50 ? '3' : sim.combo >= 20 ? '2' : sim.combo >= 10 ? '1' : '0';
      if (sim.combo > lastCombo) {
        comboEl.classList.remove('pop');
        void comboEl.offsetWidth;
        comboEl.classList.add('pop');
      }
      lastCombo = sim.combo;
    }
    // 昼：今夜の予告（夜の様子と、来る狼の種類と数）。戦場の下の帯に
    const tn = sim.phase === 'shop' ? sim.wave + 1 : 0;
    if (tn !== lastTonight) {
      lastTonight = tn;
      tonight.hidden = !tn;
      if (tn) {
        const m = moodOf(tn);
        const count: { kind: WolfKind; color?: WolfColor; n: number }[] = [];
        for (const l of nightOf(tn)) {
          const e = count.find((o) => o.kind === l.kind && o.color === l.color);
          if (e) e.n += l.count;
          else count.push({ kind: l.kind, color: l.color, n: l.count });
        }
        const face = newColors(tn).map((c) => `<small style="color:${COLORS[c].ui}">新顔：${COLORS[c].name}狼（${COLORS[c].word}）</small>`).join('');
        const t = tidyList(count, 6);
        tonight.innerHTML = `<b>今夜 ${tn}日目${m ? `・<em>${MOODS[m].name}</em>` : ''}</b>${m ? `<small>${MOODS[m].note}</small>` : ''}${face}<div>${t.rows.map((e) => wolfTag(e.kind, e.color, e.n)).join('')}${t.rest ? `<span class="rest">ほか<i>${t.rest}</i></span>` : ''}</div>`;
      }
    }
    // 予告：この晩にまだ来ていない狼
    const pend = sim.phase === 'wave' ? sim.pending() : [];
    const key = JSON.stringify(pend);
    if (key !== lastPending) {
      lastPending = key;
      next.hidden = pend.length === 0;
      const t = tidyList(pend, 5);
      next.innerHTML = '<b>これから</b>' + t.rows.map((e) => wolfTag(e.kind, e.color, e.n)).join('') + (t.rest ? `<span class="rest">ほか<i>${t.rest}</i></span>` : '');
    }
  };

  const manual = !!params.get('manual');
  let running = false;
  let shown = 'playing';
  function show(html: string, buttons: [string, () => void][], title = false) {
    overlay.classList.toggle('title', title); // 題字の画面だけ、メインビジュアルを敷く
    overlay.innerHTML = `${html}<div class="choices"></div>`;
    const box = overlay.querySelector('.choices')!;
    for (const [label, act] of buttons) {
      const b = document.createElement('button');
      b.textContent = label;
      b.addEventListener('click', () => {
        act();
        shown = sim.result;
        overlay.hidden = true;
        running = true;
      }, { once: true });
      box.appendChild(b);
    }
    overlay.hidden = false;
    // 主人公の絵が揃うまでは押せない（揃う前に始めると、仮の細い姿で戦った。2026-10-04 アマネさん「棒みたい」）
    if (!view.ready) {
      const bs = Array.from(box.querySelectorAll('button'));
      const labels = bs.map((b) => b.textContent);
      for (const b of bs) {
        b.disabled = true;
        b.textContent = '読み込み中…';
      }
      const wait = () => {
        if (!view.ready) return void requestAnimationFrame(wait);
        bs.forEach((b, i) => {
          b.disabled = false;
          b.textContent = labels[i];
        });
      };
      wait();
    }
  }
  const fresh = () => {
    store.clear();
    sim = new Sim(seed());
  };
  // 家が落ちた：その晩の前の昼に戻る。負けた晩に拾った銭は残さない（2026-10-04・アマネさん）
  // 負けたら前の昼に戻る。その夜に拾った銭は残す（2026-10-05 アマネさん「負けてもお金は残るように」。強化して挑み直せる）
  const retry = () => {
    const losses = sim.losses;
    const earned = Math.floor(sim.nightEarned);
    const d = store.read();
    sim = d ? Sim.load(d, seed()) : new Sim(seed());
    sim.losses = losses;
    sim.coins += earned;
    if (d) store.write(sim.save());
  };

  // 一時停止（2026-10-04 レビュー 12）。画面を離れたときも止める
  const pause = () => {
    if (!running || sim.result !== 'playing' || !overlay.hidden) return;
    running = false;
    show(`<h1>一時停止</h1><p>${Math.min(sim.wave + 1, 99)}日目・${sim.phase === 'shop' ? '昼' : '夜'}${debug ? '<br><small>デバッグモード</small>' : ''}</p>`,
      debug ? [['続ける', () => {}], ['デバッグをやめる（題字へ）', () => location.reload()]] : [['続ける', () => {}]]);
  };
  document.getElementById('pause')!.addEventListener('click', pause);
  document.addEventListener('visibilitychange', () => document.hidden && !manual && pause());

  const saved = store.read();
  // 題字の画面（2026-10-05 アマネさん「タイトルと顔が被る」「明朝で」→ 見本の案2）：絵は上に寄せて顔の下から夜の色に溶かし、
  // 題字は細い明朝で「赤」だけ赤、上に「桜狼異聞」と細い線、下に細い線と桜の紋
  const title = `<div class="tv"></div>
     <h1 class="logo"><span class="s">桜狼異聞</span><span class="t">大正<em>赤</em>ずきん</span><span class="k">❀</span></h1>
     <p class="lead">紅い月の裂け目から狼が来る。<br>99夜、おばあさんの家を守り抜け。</p>`; // 操作の一覧は、絵が見えるように外した（2026-10-04 アマネさん「画像しっかり見えるように」）
  const showTitle = () => {
    show(title, saved
      ? [[`続きから（${saved.wave + 1}日目の昼）`, () => (sim = Sim.load(saved, seed()))], ['はじめから', fresh]]
      : [['はじめる', () => {}]], true);
    // ストーリー・キャラクター・ゲーム概要（題字の画面だけ。押しても始まらない）
    const sb = document.createElement('button');
    sb.className = 'storybtn';
    sb.textContent = 'ストーリー';
    sb.addEventListener('click', () => openStory());
    overlay.querySelector('.choices')!.appendChild(sb);
    // デバッグモード：題字の画面のいちばん下に小さく（誰でも押せる）
    const db = document.createElement('button');
    db.className = 'debugbtn';
    db.textContent = 'デバッグモード';
    db.addEventListener('click', openDebug);
    overlay.appendChild(db);
  };

  // デバッグモード（2026-10-05 アマネさん「好きな夜から。成長度もあわせて。お金無限で昼から」）。
  // 選んだ晩の昼から始まる。銭はいつも満タン。強化は「その晩らしく」（自動操作が平均でその晩に着く段）か、なし。
  // この端末の保存には書かない。やめるときは一時停止の「デバッグをやめる」（読み直して題字へ。続きはそのまま）
  const DEBUG_COINS = 999999;
  // 自動操作（scripts/bot.mjs）が、その晩の前の昼に着いていた強化（上段は5つの平均の回数・下段は5つの平均の数）
  // [晩, 上段, 下段]。あいだの晩は直線でつなぐ。2026-10-05 強化を10個にしたので測り直し
  const GROWTH: [number, number, number][] = GROWTH_TABLE;
  const growthAt = (n: number): { basic: Record<Track, number>; special: Record<Track, number> } => {
    const i = Math.max(1, GROWTH.findIndex((g) => g[0] >= n));
    const [a, b] = [GROWTH[i - 1], GROWTH[i] ?? GROWTH[i - 1]];
    const k = b[0] === a[0] ? 1 : Math.min(1, Math.max(0, (n - a[0]) / (b[0] - a[0])));
    const v = (j: number) => Math.round(a[j] + (b[j] - a[j]) * k);
    const each = (x: number, cap = Infinity) => Object.fromEntries(TRACK_ORDER.map((t) => [t, Math.min(cap, x)])) as Record<Track, number>;
    return { basic: each(v(1)), special: each(v(2), 6) };
  };
  function openDebug() {
    overlay.classList.remove('title');
    overlay.innerHTML = `<h1>デバッグモード</h1>
      <p>選んだ晩の昼から始める。銭は無限<br><small>この端末の保存には書かない（続きはそのまま）</small></p>
      <div class="dbg">
        <label>始める晩 <input type="number" min="1" max="99" value="99" inputmode="numeric"> 日目</label>
        <div class="quick">${[1, 10, 15, 30, 50, 70, 99].map((n) => `<button type="button" data-n="${n}">${n}</button>`).join('')}</div>
        <label class="grow"><input type="checkbox" checked> 強化をその晩らしくそろえる</label>
        <p class="lv"></p>
      </div>
      <div class="choices"><button class="go">この晩の昼から始める</button><button class="back">もどる</button></div>`;
    const input = overlay.querySelector('input[type=number]') as HTMLInputElement;
    const grow = overlay.querySelector('.grow input') as HTMLInputElement;
    const lv = overlay.querySelector('.lv') as HTMLElement;
    const night = () => Math.min(99, Math.max(1, Math.round(Number(input.value) || 1)));
    const note = () => {
      const g = growthAt(night());
      lv.textContent = grow.checked ? `上段 ${g.basic.body}回ずつ・下段 ${g.special.body}つずつ（昼に銭で足せる）` : 'すべて 0（昼に銭で上げる）';
    };
    input.addEventListener('input', note);
    grow.addEventListener('change', note);
    overlay.querySelectorAll<HTMLButtonElement>('.quick button').forEach((b) => b.addEventListener('click', () => { input.value = b.dataset.n!; note(); }));
    note();
    overlay.querySelector('.back')!.addEventListener('click', showTitle);
    overlay.querySelector('.go')!.addEventListener('click', () => {
      const n = night();
      debug = true;
      const s0 = new Sim(seed());
      sim = Sim.load({ ...s0.save(), wave: n - 1, coins: DEBUG_COINS, houseHp: HOUSE_HP, ...(grow.checked ? growthAt(n) : {}) }, seed());
      store.write(sim.save()); // 負けたらこの昼に戻る
      shown = sim.result;
      overlay.hidden = true;
      running = true;
    });
  }
  showTitle();
  if (params.get('auto')) {
    overlay.hidden = true;
    running = true;
  }

  // ?manual=1：時計を止め、外から akazukin.tick(秒) で1コマずつ進める（動きをコマ送りで点検する）
  const frame = (dt: number) => {
    if (debug) sim.coins = DEBUG_COINS; // デバッグモード：銭は無限
    if (running) sim.advance(dt);
    view.draw(sim, dt);
    panel.update();
    overlays();
  };
  view.app.ticker.add((t) => {
    if (!manual) frame((t.deltaMS / 1000) * SPEED);
    if (sim.result !== shown) {
      shown = sim.result;
      running = false;
      if (sim.result === 'won') {
        store.clear();
        show(`<h1>狼絶滅</h1><p>99日を守り抜いた（${sim.kills} 匹・最大 ${sim.bestCombo} コンボ・家が落ちたのは ${sim.losses} 回）。</p>`, [['もう一度', fresh]]);
      }
      if (sim.result === 'lost') {
        const back = store.read();
        show(`<h1>家が落ちた</h1><p>${sim.wave + 1}日目の夜に力尽きた。<br>${back ? `${back.wave + 1}日目の昼に戻る` : '1日目の夜からやり直す'}<br>この夜に拾った銭 ${Math.floor(sim.nightEarned)} は残る</p>`, [['もう一度', retry]]);
      }
    }
  });

  // 撮影・計測用の窓口
  (window as unknown as { akazukin: unknown }).akazukin = {
    get clock() { return sim.clock; },
    get sim() { return sim; },
    get view() { return view; },
    tick(dt: number, n = 1) { for (let i = 0; i < n; i++) frame(dt); },
  };
  document.body.classList.add('ready');
}
