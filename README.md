# 武装赤ずきん / 桜狼異聞　大正赤ずきん

（旧題『鋼桜奇譚　大正赤ずきん』。2026-10-04 に変更）

**https://amanesf.github.io/akazukin/** ── ゲームの試作（横向きタワーディフェンス・スマホ縦長）。計画は [`plan.md`](plan.md)、本体は `app/`。

```sh
cd app && npm ci && npm run dev
```

## 資料

[amanesf/kabu](https://github.com/amanesf/kabu)（コミット 5b5a39b）から赤ずきん関連の資料一式を移したもの。パス構成は kabu と同じ。

- `docs/spinoff/akazukin.md` — 決定事項と経緯（正本）
- `docs/spinoff/akazukin-diary.md` — 制作日記
- `docs/HANDOFF.md` — 現在地（kabu の HANDOFF.md から該当部分を移したもの）
- `docs/image-pipeline-notes.md` — kabu `docs/09-image-pipeline.md` の該当節の抜粋
- `docs/generation-log.jsonl` — kabu の生成ログから akazukin 分だけ抜き出したもの
- `assets/spinoff/akazukin/` — 生成画像（全身見本 `front-v7.jpg`、本番 `keyart-v3.jpg`、立ち絵 `taisho-v11.jpg`、メインビジュアル `mainvisual-v5.jpg` ほか）
- `assets/characters/erika-front.png` — 画風の参照画像（エリカ）
- `prompts/spinoff-akazukin-*.txt`、`prompts/_styles/` — プロンプトと画風指定

本文中の `hoshikuzu.md` など kabu 本体へのリンクはこのリポジトリにはない。
