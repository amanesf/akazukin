#!/usr/bin/env python3
"""斜め向きの全身（hero-armout-v1）から、脚を別の部品にして歩かせられるか確かめる。無料。

脚は hero-limbs-v1（同じ位置に腕と脚だけを描かせた1枚。ずれは実測0〜1画素）から取る。
胴からは、スカートの裾より下の脚（タイツとブーツ）を抜く。裾のレースは胴に残す（脚は胴の後ろに置くので、
太ももはスカートに隠れる）。

    python3 tools/rig-legs.py --check 出力先
"""
import argparse
import os

import cv2
import numpy as np

ap = argparse.ArgumentParser()
ap.add_argument('--check', required=True)
a = ap.parse_args()

A = cv2.imread('assets/game/hero-armout-v1.jpg')
B = cv2.imread('assets/game/hero-limbs-v1.jpg')
H, W = A.shape[:2]


def fg(im, tol=18):
    bg = np.median(np.array([im[3, 3], im[3, -4], im[-4, 3], im[-4, -4]]), axis=0)
    near = (np.abs(im.astype(int) - bg).max(axis=2) <= tol).astype(np.uint8)
    mask = np.zeros((H + 2, W + 2), np.uint8)
    fill = near.copy()
    for (x, y) in [(0, 0), (W - 1, 0), (0, H - 1), (W - 1, H - 1)]:
        cv2.floodFill(fill, mask, (x, y), 2)
    k, lab, st, _ = cv2.connectedComponentsWithStats((fill == 1).astype(np.uint8))
    for i in range(1, k):
        if st[i, cv2.CC_STAT_AREA] >= 1500:
            fill[lab == i] = 2
    al = np.where(fill == 2, 0, 255).astype(np.uint8)
    return cv2.GaussianBlur(cv2.erode(al, np.ones((3, 3), np.uint8)), (3, 3), 0)


alA, alB = fg(A), fg(B)
legs = alB.copy()
legs[:1150] = 0  # 腕を外す
# 2本に分ける（左右の塊）
n, lab, st, cen = cv2.connectedComponentsWithStats((legs > 128).astype(np.uint8))
order = sorted(range(1, n), key=lambda i: -st[i, cv2.CC_STAT_AREA])[:2]
order.sort(key=lambda i: st[i, cv2.CC_STAT_LEFT])
names = ['legL', 'legR']
pieces = {}
for name, i in zip(names, order):
    m = np.where(lab == i, legs, 0).astype(np.uint8)
    img = np.dstack([B, m])
    x, y, w, h = st[i, :4]
    hip = (int(x + w / 2), int(y + 40))  # 股の関節：太ももの上の真ん中
    pieces[name] = (img, hip)
    print(name, 'hip', hip, 'box', x, y, w, h)

# 胴：裾のレースより下の、脚の所を抜く。レースは明るいベージュ、タイツは暗い紫、ブーツは赤
body = np.dstack([A, alA])
hsv = cv2.cvtColor(A, cv2.COLOR_BGR2HSV)
# レース：明るいベージュ。背景の明るい灰色と分けるため、赤みがあること・絵の中であることも条件にする
lace = (A[:, :, 2] > 170) & (A[:, :, 1] > 135) & (A[:, :, 2].astype(int) - A[:, :, 0] > 25) & (alA > 128)
legzone = cv2.dilate((legs > 128).astype(np.uint8), np.ones((9, 9), np.uint8)) > 0
# 裾：列ごとに、レース（明るいベージュ）の一番下。探すのは裾のあたり（LACE_Y）だけ
# （暗いひだや、ブーツのつやを裾と取り違えないように。撮って確かめて直した）
LACE_Y = (1850, 2150)
# 裾より下は脚とブーツしかないので、レースのある列は裾より下を全部抜く
# （脚の形だけで抜くと、元の絵と生成した脚の輪郭のわずかな差が、黒い切れ端として残った）
# 裾の線：列ごとに探す範囲の一番下のレース。ただしタイツやブーツのつやを読み違える列があるので、
# 裾はなめらかにつながる、として左右の列の中央値から大きく外れた列はならす（撮って確かめて直した）
cut = np.zeros((H, W), bool)
lace_cols = np.nonzero(lace[LACE_Y[0]:LACE_Y[1]].any(axis=0))[0]
xs = np.arange(lace_cols.min(), lace_cols.max() + 1)
raw = np.array([LACE_Y[0] + (np.nonzero(lace[LACE_Y[0]:LACE_Y[1], x])[0].max() + 1 if lace[LACE_Y[0]:LACE_Y[1], x].any() else 0) for x in xs])
k = 31
pad = np.pad(raw, k // 2, mode='edge')
med = np.array([np.median(pad[i:i + k]) for i in range(len(raw))])
hem_y = np.where(raw > med + 12, med + 4, raw).astype(int)
for x, y in zip(xs, hem_y):
    cut[y:, x] = True
# レースの山と山のあいだから見える脚も抜く。脚は元の絵と生成した脚が1画素以内で重なるので、
# 「同じ位置の生成した脚とほぼ同じ色」の画素は、見えていた脚とみなす（色の名前で探すと取りこぼした）
same = (np.abs(A.astype(int) - B.astype(int)).max(axis=2) < 34) & (legs > 128)
lace_band = np.zeros((H, W), bool)  # 判定はレースの帯の中だけ（スカートの暗いひだは太ももと色が近い）
for x, y in zip(xs, hem_y):
    lace_band[max(0, y - 70):y, x] = True
cut |= same & lace_band
# 縁のにじみ：抜いた所に接する暗い画素も抜く
dark = A.max(axis=2) < 120
cut |= (cv2.dilate(cut.astype(np.uint8), np.ones((5, 5), np.uint8)) > 0) & dark & legzone & (lace_band | (np.arange(H)[:, None] >= 2000))
body[cut, 3] = 0
# 裾より下に残った小さな切れ端（胴の本体とつながっていない塊）を消す
low = np.zeros((H, W), np.uint8)
low[1950:] = (body[1950:, :, 3] > 40)
n2, lab2, st2, _ = cv2.connectedComponentsWithStats(low)
main = np.zeros((H, W), bool)
top_connected = set(np.unique(lab2[1950, :])) - {0}
for i in range(1, n2):
    if i not in top_connected or st2[i, cv2.CC_STAT_AREA] < 300:
        body[lab2 == i, 3] = 0
print('lace bottom range found')
dbg = A.copy()
for x, y in zip(xs, raw):
    dbg[min(H - 1, y), x] = (0, 255, 0)
for x, y in zip(xs, hem_y):
    dbg[min(H - 1, y), x] = (0, 0, 255)
cv2.imwrite(os.path.join(a.check, 'hem.png'), cv2.resize(dbg[1850:2200, 300:1150], None, fx=2, fy=2, interpolation=cv2.INTER_NEAREST))

os.makedirs(a.check, exist_ok=True)


def comp(rots):
    c = np.zeros((H, W, 3), np.float32)
    c[:] = (180, 40, 200)

    def over(img, rot=0, piv=None):
        if rot:
            M = cv2.getRotationMatrix2D(piv, rot, 1.0)
            img = cv2.warpAffine(img, M, (W, H))
        al = img[:, :, 3:4].astype(np.float32) / 255
        c[:] = img[:, :, :3] * al + c * (1 - al)
    for name in names:
        img, hip = pieces[name]
        over(img, rots.get(name, 0), hip)
    over(body)
    return c.astype(np.uint8)


cv2.imwrite(os.path.join(a.check, 'body-only.png'), (lambda b: (b[:, :, :3] * (b[:, :, 3:4] / 255.0) + np.array([180, 40, 200]) * (1 - b[:, :, 3:4] / 255.0)).astype(np.uint8))(body)[1900:2300, 300:1150])
for tag, r in (('rest', {}), ('stepA', {'legL': -14, 'legR': 10}), ('stepB', {'legL': 12, 'legR': -14})):
    cv2.imwrite(os.path.join(a.check, f'legs-{tag}.png'), comp(r)[1700:2752, 200:1250])
print('written')
