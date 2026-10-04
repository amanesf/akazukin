#!/usr/bin/env python3
"""背景の町並み（backdrop-town-v1）を app/public/bg/town.webp に書き出す。無料。

生成した絵は町並みの帯が縦に3段、もやを挟んで重なった（頼んだのは1段）。いちばん下の段は山から通りまで欠けずに
描けたので、そこだけを使う。

上の端：前は上から下へだんだん透明にして夜霧にしたが、灰色のもやが夜空より明るい帯になり、屋根の上まで薄れて消えた
（2026-10-04 アマネさん「空との境目が変」「建物もぼかして消えてる」）。いまは、上の端からつながった明るい灰色のもや
（空の所）だけを抜いて、試作の夜空を見せる。屋根・山・電柱・電線は残す。山は夜空になじむよう少し暗く

    python3 tools/export-backdrop.py
"""
import os

import cv2
import numpy as np
from PIL import Image

im = Image.open('assets/game/backdrop-town-v1.jpg').convert('RGB')
W, H = im.size
strip = im.crop((0, int(H * 360 / 679), W, int(H * 588 / 679)))  # 上の段の町が透けるもやの上の方は入れない
a = np.asarray(strip).copy()
h, w = a.shape[:2]
f = a.astype(np.int16)
lum = f.mean(axis=2)
sat = f.max(axis=2) - f.min(axis=2)
haze = ((lum > 120) & (sat < 45)).astype(np.uint8)
# 上の端からつながったもやだけ（白壁・障子は屋根の下で、上とつながっていない）
# 電線（細い暗い線）でもやが仕切られて、抜けない所が残った → 細い線をふさいでから辿る
bridged = cv2.morphologyEx(haze, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
mask = np.zeros((h + 2, w + 2), np.uint8)
fill = bridged.copy()
for x in range(0, w, 2):
    if fill[0, x] == 1:
        cv2.floodFill(fill, mask, (x, 0), 2)
sky = (fill == 2) & (haze == 1) | ((fill == 2) & (lum > 90))  # 電線そのものは残す（暗い）
# 上半分より下にはもやは無い（念のため）
sky[int(h * 0.5):] = False
alpha = np.where(sky, 0, 255).astype(np.uint8)
alpha = cv2.GaussianBlur(cv2.dilate(alpha, np.ones((3, 3), np.uint8)), (5, 5), 0)
alpha = np.minimum(alpha, (np.clip((np.arange(h) - h * 0.02) / (h * 0.06), 0, 1) * 255)[:, None].astype(np.uint8))  # 電柱の上の切り口だけ薄く
# 山（上の半分の、建物でない暗い灰紫）を夜の藍へ少し寄せる
night = np.array([30, 24, 52], dtype=np.float32)
upper = (np.arange(h)[:, None] < h * 0.42) & (sat < 40) & (lum < 120)
k = (upper * 0.45)[:, :, None]
a = (a.astype(np.float32) * (1 - k) + night * k).astype(np.uint8)
out = Image.fromarray(np.dstack([a, alpha]), 'RGBA')
k = 400 / h
out = out.resize((int(w * k), 400), Image.LANCZOS)
os.makedirs('app/public/bg', exist_ok=True)
out.save('app/public/bg/town.webp', quality=86, method=6)
print(out.size, os.path.getsize('app/public/bg/town.webp') // 1024, 'KB')
