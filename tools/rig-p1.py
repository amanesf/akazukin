#!/usr/bin/env python3
"""右向きの構え（hero-poses-v1 の1人目）を、歩かせられるように胴と脚に分ける。無料。

脚は hero-p1-legs-v1（同じ子を短いスカートで描いた1枚。ブーツは元の絵と1画素のずれ・実測）から取る。
脚の上の端（短いスカートの裾）は、構えの姿では長いスカートの下に隠れる。
胴からは、長いスカートのレースより下の脚を抜く（tools/rig-legs.py で詰めた方法と同じ）。

    python3 tools/rig-p1.py [--check 出力先]
"""
import argparse
import json
import os

import cv2
import numpy as np

ap = argparse.ArgumentParser()
ap.add_argument('--check')
a = ap.parse_args()

A = cv2.imread('assets/game/ref-p1.jpg')
L = cv2.imread('assets/game/hero-p1-legs-v1.jpg')
L = cv2.resize(L, (A.shape[1], A.shape[0]), interpolation=cv2.INTER_AREA)
L = np.roll(L, 1, axis=1)  # 実測のずれ（右へ1画素）を戻す
H, W = A.shape[:2]


def fg(im, tol=18):
    bg = np.median(np.array([im[3, 3], im[3, -4], im[-4, 3], im[-4, -4]]), axis=0)
    near = (np.abs(im.astype(int) - bg).max(axis=2) <= tol).astype(np.uint8)
    mask = np.zeros((H + 2, W + 2), np.uint8)
    fill = near.copy()
    for p in [(0, 0), (W - 1, 0), (0, H - 1), (W - 1, H - 1)]:
        cv2.floodFill(fill, mask, p, 2)
    k, lab, st, _ = cv2.connectedComponentsWithStats((fill == 1).astype(np.uint8))
    for i in range(1, k):
        if st[i, cv2.CC_STAT_AREA] >= 800:
            fill[lab == i] = 2
    al = np.where(fill == 2, 0, 255).astype(np.uint8)
    return cv2.GaussianBlur(cv2.erode(al, np.ones((3, 3), np.uint8)), (3, 3), 0)


alA, alL = fg(A), fg(L)

# 脚：短いスカートの裾より下の、タイツとブーツ。裾は「タイツが始まる高さ」を列ごとに見る
Bc, Gc, Rc = [L[:, :, i].astype(int) for i in range(3)]
tights = (np.maximum(Rc, np.maximum(Gc, Bc)) < 110) & (Bc >= Rc - 15) & (alL > 128)
boots = (Rc > Gc + 35) & (Rc > 90) & (alL > 128)
rows = np.arange(H)[:, None]
leg_px = (tights | boots) & (rows > H * 0.42)
leg_px = cv2.morphologyEx(leg_px.astype(np.uint8) * 255, cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8)) > 0
leg_px &= alL > 128
# 2本の脚は太ももの付け根でつながるので、ひざから下（脚が離れている所）で一番すいた列を境に左右に分ける。
# 境の上の方（付け根）は長いスカートに隠れる
n, lab, st, _ = cv2.connectedComponentsWithStats(leg_px.astype(np.uint8))
main = 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))
both = lab == main
lo = both[int(H * 0.72):int(H * 0.85)]
xs_all = np.nonzero(both.any(axis=0))[0]
cols = lo.sum(axis=0)
inner = range(xs_all.min() + 40, xs_all.max() - 40)
split = min(inner, key=lambda x: cols[x])
print('split x', split)
legs = {}
for name, side in (('legL', np.arange(W) < split), ('legR', np.arange(W) >= split)):
    m = both & side[None, :]
    ys_m, xs_m = np.nonzero(m)
    st_i = (xs_m.min(), ys_m.min(), xs_m.max() - xs_m.min(), ys_m.max() - ys_m.min())
    # 輪郭の線（暗い紫）も含めるため少し太らせて、絵の中だけに戻す
    m = (cv2.dilate(m.astype(np.uint8), np.ones((5, 5), np.uint8)) > 0) & (alL > 64)
    x, y, w, h = st_i
    legs[name] = (np.dstack([L, np.where(m, alL, 0).astype(np.uint8)]), (int(x + w / 2), int(y + 10)))
    print(name, 'top', y, 'box', x, y, w, h)
legmask = np.zeros((H, W), bool)
for img, _ in legs.values():
    legmask |= img[:, :, 3] > 64

# 胴：長いスカートのレースより下を抜く。レースは赤みのあるベージュ（背景の灰色と分ける）
lace = (A[:, :, 2] > 170) & (A[:, :, 1] > 135) & (A[:, :, 2].astype(int) - A[:, :, 0] > 25) & (alA > 128)
legzone = cv2.dilate(legmask.astype(np.uint8), np.ones((9, 9), np.uint8)) > 0
ys_l = np.nonzero(lace[int(H * 0.6):].any(axis=1))[0]
LACE_Y = (int(H * 0.6) + ys_l.min(), int(H * 0.6) + ys_l.max() + 1)
lace_cols = np.nonzero(lace[LACE_Y[0]:LACE_Y[1]].any(axis=0))[0]
xs = np.arange(lace_cols.min(), lace_cols.max() + 1)
raw = np.array([LACE_Y[0] + (np.nonzero(lace[LACE_Y[0]:LACE_Y[1], x])[0].max() + 1 if lace[LACE_Y[0]:LACE_Y[1], x].any() else 0) for x in xs])
k = 31
pad = np.pad(raw, k // 2, mode='edge')
med = np.array([np.median(pad[i:i + k]) for i in range(len(raw))])
hem_y = np.where(raw > med + 12, med + 4, raw).astype(int)
# さらに、まわり約60列の中央値＋14より下には裾を置かない（レース色の切れ端を裾と読む列があった）
k2 = 61
pad2 = np.pad(raw, k2 // 2, mode='edge')
med2 = np.array([np.median(pad2[i:i + k2]) for i in range(len(raw))])
hem_y = np.minimum(hem_y, (med2 + 14).astype(int))
cut = np.zeros((H, W), bool)
lace_band = np.zeros((H, W), bool)
for x, y in zip(xs, hem_y):
    cut[y:, x] = True
    lace_band[max(0, y - 40):y, x] = True
# この構えの絵では、レースのすき間から脚は見えない（左向きの絵とちがい、裾の上を抜くとスカートに穴が開いた）。
# レースの左右の端より外でも、脚の範囲の列は端の裾の高さから下を抜く（端の外に脚の輪郭の線が残った）
for x in np.nonzero(legzone.any(axis=0))[0]:
    if x < xs[0]:
        cut[hem_y[0]:, x] = True
    elif x > xs[-1]:
        cut[hem_y[-1]:, x] = True
body = np.dstack([A, alA])
body[cut, 3] = 0
low = (np.arange(H)[:, None] >= LACE_Y[0]) & (body[:, :, 3] > 40)
n2, lab2, st2, _ = cv2.connectedComponentsWithStats(low.astype(np.uint8))
top = set(np.unique(lab2[LACE_Y[0], :])) - {0}
for i in range(1, n2):
    if i not in top or st2[i, cv2.CC_STAT_AREA] < 150:
        body[lab2 == i, 3] = 0

# 仕上げ：列ごとに、一番下のレース（ベージュ）より下に残った暗い画素（脚の輪郭のかけら）を抜く。
# 3倍に拡大して、レースの谷の下に10〜20画素の切れ端が残っているのを見つけた
bodyA = body[:, :, :3]
lace_b = (bodyA[:, :, 2] > 170) & (bodyA[:, :, 1] > 135) & (bodyA[:, :, 2].astype(int) - bodyA[:, :, 0] > 25) & (body[:, :, 3] > 128)
darkp = bodyA.max(axis=2) < 140
for x in np.nonzero(legzone.any(axis=0))[0]:
    ly = np.nonzero(lace_b[LACE_Y[0]:, x])[0]
    if not len(ly):
        continue
    bottom = LACE_Y[0] + ly.max() + 1
    col = darkp[bottom:, x]
    body[bottom:, x, 3] = np.where(col, 0, body[bottom:, x, 3])

os.makedirs('assets/game/parts/p1rig', exist_ok=True)
cv2.imwrite('assets/game/parts/p1rig/body.png', body)
meta = {}
for name, (img, hip) in legs.items():
    cv2.imwrite(f'assets/game/parts/p1rig/{name}.png', img)
    meta[name] = {'hip': hip}
json.dump({'size': [W, H], 'legs': meta}, open('assets/game/parts/p1rig/rig.json', 'w'), indent=1)

if a.check:
    os.makedirs(a.check, exist_ok=True)

    def comp(rots):
        c = np.zeros((H, W, 3), np.float32)
        c[:] = (180, 40, 200)

        def over(img, rot=0, piv=None):
            if rot:
                img = cv2.warpAffine(img, cv2.getRotationMatrix2D(piv, rot, 1.0), (W, H))
            al = img[:, :, 3:4].astype(np.float32) / 255
            c[:] = img[:, :, :3] * al + c * (1 - al)
        for name, (img, hip) in legs.items():
            over(img, rots.get(name, 0), hip)
        over(body)
        return c.astype(np.uint8)
    y0 = int(H * 0.55)
    tiles = [comp(r)[y0:, :] for r in ({}, {'legL': -12, 'legR': 10}, {'legL': 10, 'legR': -12})]
    cv2.imwrite(os.path.join(a.check, 'p1-walk.png'), np.hstack(tiles))
    print('check written')
