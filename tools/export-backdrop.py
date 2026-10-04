#!/usr/bin/env python3
"""背景の町並み（backdrop-town-v1）を app/public/bg/town.webp に書き出す。無料。

生成した絵は町並みの帯が縦に3段、もやを挟んで重なった（頼んだのは1段）。いちばん下の段は山から通りまで欠けずに
描けたので、そこだけを使う。上の端はもやの中に上の段の町が薄く透けるので、上から下へだんだん透明にして夜霧にする。

    python3 tools/export-backdrop.py
"""
import os

import numpy as np
from PIL import Image

im = Image.open('assets/game/backdrop-town-v1.jpg').convert('RGB')
W, H = im.size
strip = im.crop((0, int(H * 345 / 679), W, int(H * 588 / 679)))
a = np.asarray(strip).copy()
h = a.shape[0]
y = np.arange(h)[:, None]
alpha = np.clip((y - h * 0.06) / (h * 0.16), 0, 1) * 255  # 上の22%で透明から不透明へ
# もやの明るい灰色が夜空との境で白く浮いた（2026-10-04 アマネさん「境が明るすぎる」）。上の35%を夜の藍へ沈める
night = np.array([38, 30, 62], dtype=np.float32)
k = np.clip(1 - y / (h * 0.35), 0, 1)[:, :, None] * 0.75
a = (a.astype(np.float32) * (1 - k) + night * k).astype(np.uint8)
rgba = np.dstack([a, np.broadcast_to(alpha, a.shape[:2]).astype(np.uint8)])
out = Image.fromarray(rgba, 'RGBA')
k = 400 / h
out = out.resize((int(W * k), 400), Image.LANCZOS)
os.makedirs('app/public/bg', exist_ok=True)
out.save('app/public/bg/town.webp', quality=86, method=6)
print(out.size, os.path.getsize('app/public/bg/town.webp') // 1024, 'KB')
