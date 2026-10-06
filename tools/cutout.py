#!/usr/bin/env python3
"""一色の背景の上に並んだ絵（三面図・装備の一覧）から、背景を抜いて1つずつ切り出す。無料。

背景は四隅の色を取り、画像の縁から「背景に近い色」だけを塗りつぶしで辿って透明にする
（人物の中にある灰色——狼の毛皮など——は縁とつながっていないので残る）。
残った塊を大きい順に、左から並べて書き出す。

    python3 tools/cutout.py assets/game/hero-turn-v1.jpg --out assets/game/parts --names front,side,back
"""
import argparse
import os

import cv2
import numpy as np

ap = argparse.ArgumentParser()
ap.add_argument('src')
ap.add_argument('--out', required=True)
ap.add_argument('--names', required=True, help='左から順の名前（カンマ区切り）')
ap.add_argument('--tol', type=int, default=14, help='背景とみなす色の差')
ap.add_argument('--hole', type=int, default=1500, help='囲まれた背景（弓と弦のあいだ等）も、この画素数より大きければ抜く')
ap.add_argument('--merge', type=int, default=0, help='この画素数より大きい離れた塊（宙に投げたナイフ等）を、横の位置がいちばん近い絵に足す（0 で足さない）')
a = ap.parse_args()

im = cv2.imread(a.src)
h, w = im.shape[:2]
bg = np.median(np.array([im[2, 2], im[2, w - 3], im[h - 3, 2], im[h - 3, w - 3]]), axis=0)
near = (np.abs(im.astype(int) - bg).max(axis=2) <= a.tol).astype(np.uint8)

# 縁から辿れる背景だけを抜く
mask = np.zeros((h + 2, w + 2), np.uint8)
fill = near.copy()
for x in range(w):
    for y in (0, h - 1):
        if fill[y, x] == 1:
            cv2.floodFill(fill, mask, (x, y), 2)
for y in range(h):
    for x in (0, w - 1):
        if fill[y, x] == 1:
            cv2.floodFill(fill, mask, (x, y), 2)
# 囲まれた背景（弓と弦のあいだ、腕と体のすきま）も、大きければ抜く。小さい灰色は絵の一部とみなす
k, lab, st, _ = cv2.connectedComponentsWithStats((fill == 1).astype(np.uint8))
for i in range(1, k):
    if st[i, cv2.CC_STAT_AREA] >= a.hole:
        fill[lab == i] = 2
alpha = np.where(fill == 2, 0, 255).astype(np.uint8)
# 縁のにじみを1画素削って、ぼかして馴染ませる
alpha = cv2.erode(alpha, np.ones((3, 3), np.uint8))
alpha = cv2.GaussianBlur(alpha, (3, 3), 0)

n, labels, stats, _ = cv2.connectedComponentsWithStats((alpha > 0).astype(np.uint8))
names = a.names.split(',')
blobs = sorted(range(1, n), key=lambda i: -stats[i, cv2.CC_STAT_AREA])[: len(names)]
blobs.sort(key=lambda i: stats[i, cv2.CC_STAT_LEFT])
# 離れた塊を、横の真ん中がいちばん近い絵の仲間にする（2026-10-06 ナイフ投げの宙のナイフが落ちた）
extra = {i: [] for i in blobs}
if a.merge:
    cx = lambda i: stats[i, cv2.CC_STAT_LEFT] + stats[i, cv2.CC_STAT_WIDTH] / 2
    for j in range(1, n):
        if j in extra or stats[j, cv2.CC_STAT_AREA] < a.merge:
            continue
        extra[min(blobs, key=lambda i: abs(cx(i) - cx(j)))].append(j)
for i in blobs:
    for j in extra[i]:
        labels[labels == j] = i
        x0 = min(stats[i, 0], stats[j, 0]); y0 = min(stats[i, 1], stats[j, 1])
        x1 = max(stats[i, 0] + stats[i, 2], stats[j, 0] + stats[j, 2]); y1 = max(stats[i, 1] + stats[i, 3], stats[j, 1] + stats[j, 3])
        stats[i, :4] = [x0, y0, x1 - x0, y1 - y0]
os.makedirs(a.out, exist_ok=True)
rgba = cv2.cvtColor(im, cv2.COLOR_BGR2BGRA)
rgba[:, :, 3] = alpha
for name, i in zip(names, blobs):
    x, y, bw, bh = stats[i, :4]
    m = 8
    x0, y0, x1, y1 = max(0, x - m), max(0, y - m), min(w, x + bw + m), min(h, y + bh + m)
    part = rgba[y0:y1, x0:x1].copy()
    keep = (labels[y0:y1, x0:x1] == i) | (labels[y0:y1, x0:x1] == 0)
    part[:, :, 3] = np.where(keep, part[:, :, 3], 0)  # 隣の塊が入り込んだ分は消す
    path = os.path.join(a.out, f'{name}.png')
    cv2.imwrite(path, part)
    print(f'{path}  {x1 - x0}x{y1 - y0}  (元の位置 {x0},{y0})')
