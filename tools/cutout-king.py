#!/usr/bin/env python3
"""狼王の1枚（wolf-king-v1）から5つの姿を切り抜く。無料。
冠（割れた月のかけら）・煙・炎のしっぽの先は体から離れて浮いているので、cutout.py のように一番大きい塊だけ取ると落ちる。
大きい塊5つを体とし、ほかの塊は重心が一番近い体に付ける。右上に紛れ込んだ別の狼の頭（参照の狼）は捨てる。

    python3 tools/cutout-king.py
"""
import cv2
import numpy as np

SRC = 'assets/game/wolf-king-v1.jpg'
OUT = 'assets/game/parts/wolves'
NAMES = ['king', 'king_crouch', 'king_rear', 'king_howl', 'king_down']  # 左から（倒れ込みは右下）
im = cv2.imread(SRC)
h, w = im.shape[:2]
bg = np.median(np.array([im[2, 2], im[2, w - 3], im[h - 3, 2], im[h - 3, w - 3]]), axis=0)
near = (np.abs(im.astype(int) - bg).max(axis=2) <= 22).astype(np.uint8)
fill = near.copy()
mask = np.zeros((h + 2, w + 2), np.uint8)
for x in range(w):
    for y in (0, h - 1):
        if fill[y, x] == 1:
            cv2.floodFill(fill, mask, (x, y), 2)
for y in range(h):
    for x in (0, w - 1):
        if fill[y, x] == 1:
            cv2.floodFill(fill, mask, (x, y), 2)
k, lab, st, _ = cv2.connectedComponentsWithStats((fill == 1).astype(np.uint8))
# 囲まれた背景（脚のあいだ等）も抜く。ただし紙垂の白い紙は背景に近い色なので、平均の色が背景とほぼ同じ囲みだけ
for i in range(1, k):
    if st[i, cv2.CC_STAT_AREA] < 60:
        continue
    m = lab == i
    if np.abs(im[m].mean(axis=0) - bg).max() <= 6 and im[m].std(axis=0).max() <= 6:
        fill[m] = 2
alpha = np.where(fill == 2, 0, 255).astype(np.uint8)
alpha = cv2.GaussianBlur(cv2.erode(alpha, np.ones((3, 3), np.uint8)), (3, 3), 0)
n, labels, stats, cents = cv2.connectedComponentsWithStats((alpha > 0).astype(np.uint8))
# 紛れ込んだ頭：右上（幅の 78% より右・高さの 45% より上）の大きな塊
stray = [i for i in range(1, n) if cents[i][0] > w * 0.78 and cents[i][1] < h * 0.45 and stats[i, cv2.CC_STAT_AREA] > 5000]
bodies = sorted([i for i in range(1, n) if i not in stray], key=lambda i: -stats[i, cv2.CC_STAT_AREA])[:5]
bodies.sort(key=lambda i: cents[i][0])
owner = {b: [b] for b in bodies}
for i in range(1, n):
    if i in bodies or i in stray or stats[i, cv2.CC_STAT_AREA] < 40:
        continue
    # かけらは上に浮いているので、横の近さを重く見る
    b = min(bodies, key=lambda b: abs(cents[i][0] - cents[b][0]) + 0.3 * abs(cents[i][1] - cents[b][1]))
    owner[b].append(i)
rgba = cv2.cvtColor(im, cv2.COLOR_BGR2BGRA)
rgba[:, :, 3] = alpha
for name, b in zip(NAMES, bodies):
    keep = np.isin(labels, owner[b])
    ys, xs = np.nonzero(keep)
    x0, y0, x1, y1 = max(0, xs.min() - 8), max(0, ys.min() - 8), min(w, xs.max() + 9), min(h, ys.max() + 9)
    part = rgba[y0:y1, x0:x1].copy()
    part[:, :, 3] = np.where(keep[y0:y1, x0:x1], part[:, :, 3], 0)
    cv2.imwrite(f'{OUT}/{name}.png', part)
    print(name, part.shape[1], part.shape[0], len(owner[b]), '塊')
