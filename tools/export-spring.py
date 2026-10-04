#!/usr/bin/env python3
"""おばあさんの家（二階建て）と春の草花（house-spring-v1）を切り抜いて書き出す。無料。

- 家 → app/public/dogs/house.webp（前の平屋を置き換え。meta.json の house も書き直す）
- 菜の花・たんぽぽ・つつじ・桜の若木 → app/public/props/（meta.json に足す）
- 家の屋根の上に、煙のような薄いにじみが描かれた → 屋根より上の薄い所だけ抜く

    python3 tools/export-spring.py
"""
import json
import os

import cv2
import numpy as np
from PIL import Image

im = cv2.imread('assets/game/house-spring-v1.jpg')
h, w = im.shape[:2]
bg = np.median(np.array([im[2, 2], im[2, w - 3], im[h - 3, 2], im[h - 3, w - 3]]), axis=0)
diff = np.abs(im.astype(int) - bg).max(axis=2)
near = (diff <= 14).astype(np.uint8)
k, lab, st, _ = cv2.connectedComponentsWithStats(near)
alpha = np.full(near.shape, 255, np.uint8)
for i in range(1, k):
    x, y, bw, bh, a = st[i]
    if x == 0 or y == 0 or x + bw >= w or y + bh >= h or (a >= 40 and not (x < 1900 and y > 150)):
        alpha[lab == i] = 0  # 家の中の囲まれた灰色は抜かない（白壁が背景の灰色に近く、壁に穴が開いた）
# にじみ：屋根の上の、背景との差が小さい（45未満）画素だけ抜く。色だけで全体を抜くと白壁や桜の花まで欠けた。
# 屋根の上＝各列で、背景との差が大きい（80以上）画素が初めて出るより上
strong = diff >= 80
first = np.where(strong.any(axis=0), strong.argmax(axis=0), h)
above = np.arange(h)[:, None] < first[None, :]
alpha[above & (diff < 45)] = 0
# 残ったにじみ（桃色がかった灰色。背景との差は45〜80）：瓦（赤み R−G>45）か輪郭（暗い）が各列で初めて出るより上を抜く。
# 瓦も輪郭もない列（門・石垣・提灯）には触らない。桜は桃色で赤みが強いので残る（2026-10-04）
b, g, r = [im[:, :, c].astype(int) for c in range(3)]
roofish = ((r - g > 45) | (im.max(axis=2) < 80)) & (diff >= 45)
roofish[int(h * 0.55):] = False
first2 = np.where(roofish.any(axis=0), roofish.argmax(axis=0), h)
ys0 = np.nonzero((alpha > 0).any(axis=1))[0]
has = first2 < ys0.min() + h * 0.12  # 屋根の棟の近くで瓦が出る列だけ（桜の列まで切ると、花の縁が縦に欠けた）
alpha[(np.arange(h)[:, None] < first2[None, :]) & has[None, :]] = 0
grown = cv2.dilate((alpha > 0).astype(np.uint8), np.ones((25, 25), np.uint8))
k, lab, st, cen = cv2.connectedComponentsWithStats(grown)
blobs = sorted([i for i in range(1, k) if st[i, cv2.CC_STAT_AREA] > 60000], key=lambda i: -st[i, cv2.CC_STAT_AREA])
house = blobs[0]
rest = sorted(blobs[1:5], key=lambda i: (cen[i][1] > h * 0.5, cen[i][0]))  # 上の段の左・右、下の段の左・右
alpha = cv2.GaussianBlur(cv2.erode(alpha, np.ones((3, 3), np.uint8)), (3, 3), 0)
rgb = cv2.cvtColor(im, cv2.COLOR_BGR2RGB)


def cut(i, max_h, max_w):
    x, y, bw, bh = st[i, :4]
    a = np.where(lab[y:y + bh, x:x + bw] == i, alpha[y:y + bh, x:x + bw], 0)
    ys, xs = np.nonzero(a > 128)
    rgba = np.dstack([rgb[y:y + bh, x:x + bw], a])[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    img = Image.fromarray(np.ascontiguousarray(rgba), 'RGBA')
    kk = min(1, max_h / img.height, max_w / img.width)
    return img.resize((int(img.width * kk), int(img.height * kk)), Image.LANCZOS)


img = cut(house, 520, 900)
img.save('app/public/dogs/house.webp', quality=86, method=6)
m = json.load(open('app/public/dogs/meta.json'))
m['house'] = {'size': [img.width, img.height], 'feet': [img.width / 2, img.height - 1], 'h': 2.0}
json.dump(m, open('app/public/dogs/meta.json', 'w'), indent=1)
pm = json.load(open('app/public/props/meta.json'))
for name, i in zip(['nanohana', 'dandelion', 'azalea', 'sapling'], rest):
    img = cut(i, 260, 360)
    img.save(f'app/public/props/{name}.webp', quality=86, method=6)
    pm[name] = {'size': [img.width, img.height]}
json.dump(pm, open('app/public/props/meta.json', 'w'), indent=1)
print('house', m['house']['size'], {k: v for k, v in pm.items() if k in ('nanohana', 'dandelion', 'azalea', 'sapling')})
