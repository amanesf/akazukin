#!/usr/bin/env python3
"""アイコン（icons-v1：4列×3行の丸い札）を1つずつ切り抜いて app/public/ui/icons/ に書き出す。無料。

背景の灰色を縁から辿って抜き（tools/cutout.py と同じ考え）、残った12個の塊を行→列の順に名前を付ける。

    python3 tools/export-icons.py
"""
import os

import cv2
import numpy as np
from PIL import Image

NAMES = ['coin', 'house', 'heart', 'knife', 'bow', 'cannon', 'sakura', 'moon', 'sun', 'pause', 'note', 'tap']
OUT = 'app/public/ui/icons'
SIZE = 128  # 画面では最大40画素ほど×端末の解像度3倍

im = cv2.imread('assets/game/icons-v1.jpg')
h, w = im.shape[:2]
bg = np.median(np.array([im[2, 2], im[2, w - 3], im[h - 3, 2], im[h - 3, w - 3]]), axis=0)
fg = (np.abs(im.astype(int) - bg).max(axis=2) > 16).astype(np.uint8)
fg = cv2.morphologyEx(fg, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
k, lab, st, cen = cv2.connectedComponentsWithStats(fg)
blobs = sorted([i for i in range(1, k) if st[i, cv2.CC_STAT_AREA] > 20000], key=lambda i: -st[i, cv2.CC_STAT_AREA])[:12]
blobs.sort(key=lambda i: (round(cen[i][1] / (h / 3)), cen[i][0]))
os.makedirs(OUT, exist_ok=True)
for name, i in zip(NAMES, blobs):
    x, y, bw, bh = st[i, :4]
    # 札は丸いので、塊を囲む円の外を抜く（縁は1画素ぼかす）
    cx, cy, r = x + bw / 2, y + bh / 2, max(bw, bh) / 2
    crop = cv2.cvtColor(im[y:y + bh, x:x + bw], cv2.COLOR_BGR2RGB)
    yy, xx = np.mgrid[:bh, :bw]
    d = np.hypot(xx + x - cx, yy + y - cy)
    alpha = (np.clip(r - d, 0, 1.5) / 1.5 * 255).astype(np.uint8)
    Image.fromarray(np.dstack([crop, alpha]), 'RGBA').resize((SIZE, SIZE), Image.LANCZOS).save(f'{OUT}/{name}.webp', quality=90, method=6)
print(len(blobs), 'icons', sum(os.path.getsize(f'{OUT}/{f}') for f in os.listdir(OUT)) // 1024, 'KB')
