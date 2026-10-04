#!/usr/bin/env python3
"""草と小物（grass-v1：4列×2行）をマスごとに切り抜いて app/public/props/ に書き出す。無料。

縁から背景の灰色を辿って抜き、葉のすき間のような囲まれた小さな背景も抜く（草は葉のあいだに灰色が残る）。
足もと（下の端の真ん中）を基準にする。

    python3 tools/export-props.py
"""
import json
import os

import cv2
import numpy as np
from PIL import Image

NAMES = [['susuki', 'grass', 'flowers', 'higanbana'], ['petals', 'stones', 'fence', 'lantern']]
OUT = 'app/public/props'
H_PX = 260  # 書き出す高さの上限

im = cv2.imread('assets/game/grass-v1.jpg')
h, w = im.shape[:2]
bg = np.median(np.array([im[2, 2], im[2, w - 3], im[h - 3, 2], im[h - 3, w - 3]]), axis=0)
near = (np.abs(im.astype(int) - bg).max(axis=2) <= 14).astype(np.uint8)
# 背景：縁につながる灰色と、葉のすき間のような囲まれた灰色（40画素以上）
k, lab, st, _ = cv2.connectedComponentsWithStats(near)
alpha = np.full(near.shape, 255, np.uint8)
for i in range(1, k):
    x, y, bw, bh, area = st[i]
    if x == 0 or y == 0 or x + bw >= w or y + bh >= h or area >= 40:
        alpha[lab == i] = 0
# 小物ごとの塊：近い破片（散った花びら・小石）をまとめるため太らせてから数える。行→列の順に名前を付ける
# （マスで区切ると、すすきの穂がマスからはみ出して切れた）
grown = cv2.dilate((alpha > 0).astype(np.uint8), np.ones((41, 41), np.uint8))
k, lab, st, cen = cv2.connectedComponentsWithStats(grown)
blobs = sorted([i for i in range(1, k) if st[i, cv2.CC_STAT_AREA] > 20000], key=lambda i: -st[i, cv2.CC_STAT_AREA])[:8]
blobs.sort(key=lambda i: (int(cen[i][1] // (h / 2)), cen[i][0]))
alpha = cv2.GaussianBlur(cv2.erode(alpha, np.ones((3, 3), np.uint8)), (3, 3), 0)
rgb = cv2.cvtColor(im, cv2.COLOR_BGR2RGB)
os.makedirs(OUT, exist_ok=True)
meta = {}
for name, i in zip([n for row in NAMES for n in row], blobs):
    x, y, bw, bh = st[i, :4]
    a = np.where(lab[y:y + bh, x:x + bw] == i, alpha[y:y + bh, x:x + bw], 0)
    ys, xs = np.nonzero(a > 128)
    x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
    rgba = np.dstack([rgb[y:y + bh, x:x + bw], a])[y0:y1 + 1, x0:x1 + 1]
    img = Image.fromarray(np.ascontiguousarray(rgba), 'RGBA')
    kk = min(1, H_PX / img.height, 360 / img.width)
    img = img.resize((max(1, int(img.width * kk)), max(1, int(img.height * kk))), Image.LANCZOS)
    img.save(f'{OUT}/{name}.webp', quality=86, method=6)
    meta[name] = {'size': [img.width, img.height]}
json.dump(meta, open(f'{OUT}/meta.json', 'w'), indent=1)
print(meta, sum(os.path.getsize(f'{OUT}/{f}') for f in os.listdir(OUT)) // 1024, 'KB')
