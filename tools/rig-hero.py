#!/usr/bin/env python3
"""真横の全身（背景を抜いたもの）を、切り絵アニメの部品に切り分ける。無料。

部品：head（頭巾ごと）／torso（胴とスカートと尻尾）／arm（手前の腕）／legs。
胴には腕を残し、少し暗くして「奥の腕」に見せる（抜いた跡を周りの色で埋めると、濁った染みになった）。
座標は元の絵（side.png）の画素。絵は左向きなので、ゲームでは左右反転して右向きにする。
書き出すのは app/public/hero/ の縮小版（SCALE）と、各部品の位置と関節を書いた rig.json。

    python3 tools/rig-hero.py
"""
import json
import os

import cv2
import numpy as np

SRC = 'assets/game/parts/hero/side.png'
OUT = 'app/public/hero'
SCALE = 0.25  # 画面では高さ100画素ほどで出すので、元の1/4で足りる（2倍の解像度の端末でも粗くならない）

im = cv2.imread(SRC, cv2.IMREAD_UNCHANGED)
H, W = im.shape[:2]

# 部品の形（目盛りを入れた絵から読んだ）。pivot は関節（回す中心）
PARTS = {
    'arm': {'poly': [(214, 595), (335, 600), (340, 760), (318, 812), (300, 950), (212, 950), (208, 800), (206, 700)], 'pivot': (268, 625)},
    'head': {'poly': [(0, 0), (652, 0), (652, 370), (420, 370), (330, 372), (240, 366), (190, 350), (0, 350)], 'pivot': (215, 360)},
    'legs': {'poly': [(60, 1225), (360, 1225), (360, H), (60, H)], 'pivot': (215, 1230)},
}
os.makedirs(OUT, exist_ok=True)
alpha = im[:, :, 3]
rig = {'size': [W, H], 'scale': SCALE, 'feet': [215, H - 10], 'parts': {}}
taken = np.zeros((H, W), np.uint8)


def save(name, img, x0, y0, pivot, z):
    small = cv2.resize(img, (max(1, int(img.shape[1] * SCALE)), max(1, int(img.shape[0] * SCALE))), interpolation=cv2.INTER_AREA)
    cv2.imwrite(os.path.join(OUT, f'{name}.png'), small)
    rig['parts'][name] = {'x': x0, 'y': y0, 'w': img.shape[1], 'h': img.shape[0], 'pivot': list(pivot), 'z': z}
    print(f'{name}: {img.shape[1]}x{img.shape[0]} at {x0},{y0}')


for z, (name, p) in enumerate(PARTS.items()):
    m = np.zeros((H, W), np.uint8)
    cv2.fillPoly(m, [np.array(p['poly'], np.int32)], 255)
    m = cv2.bitwise_and(m, alpha)
    if name == 'arm':
        # 腕の形の中に入ったスカート（暗い赤）は外す。袖の白・肌・線の黒は残す
        b, g, r = [im[:, :, i].astype(int) for i in range(3)]
        skirt = (r - g > 35) & (r < 170) & (g < 90)
        skirt = cv2.morphologyEx(skirt.astype(np.uint8) * 255, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
        m[skirt > 0] = 0
        # 外したあとに残る細い線のかけらを消し、腕の本体（一番大きい塊）だけにする
        n, lab, st, _ = cv2.connectedComponentsWithStats((m > 0).astype(np.uint8))
        if n > 1:
            big = 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))
            m[lab != big] = 0
    ys, xs = np.nonzero(m)
    x0, y0, x1, y1 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
    piece = im[y0:y1, x0:x1].copy()
    piece[:, :, 3] = m[y0:y1, x0:x1]
    taken |= (m > 0).astype(np.uint8)
    save(name, piece, int(x0), int(y0), p['pivot'], z)

# 胴：残り全部。手前の腕の所は残して少し暗くし、奥の腕に見せる
body = im.copy()
arm = np.zeros((H, W), np.uint8)
cv2.fillPoly(arm, [np.array(PARTS['arm']['poly'], np.int32)], 255)
body[:, :, :3][arm > 0] = (body[:, :, :3][arm > 0] * 0.72).astype(np.uint8)
# 頭と脚の範囲は胴から外す
cut = np.zeros((H, W), np.uint8)
cv2.fillPoly(cut, [np.array(PARTS['head']['poly'], np.int32)], 255)
cv2.fillPoly(cut, [np.array([(60, 1240), (360, 1240), (360, H), (60, H)], np.int32)], 255)
body[:, :, 3][cut > 0] = 0
ys, xs = np.nonzero(body[:, :, 3])
x0, y0, x1, y1 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
save('torso', body[y0:y1, x0:x1], int(x0), int(y0), (215, 640), 1.5)

with open(os.path.join(OUT, 'rig.json'), 'w') as f:
    json.dump(rig, f, indent=1)

# ── 装備：一覧（hero-gear）から切り出したものを、主人公の大きさに合わせて縮める ──
# 高さは主人公（side.png の高さ）に対する割合。立ち絵 taisho-v11 での見え方から決めた（目分量）。
# pivot は部品の中の割合（0〜1）：手で握る所・肩に付く所
GEAR = {
    'knife': {'height': 0.24, 'pivot': (0.5, 0.86)},
    'bow': {'height': 0.62, 'pivot': (0.42, 0.5)},
    'cannon': {'height': 0.5, 'pivot': (0.78, 0.12)},
    'quiver': {'height': 0.36, 'pivot': (0.5, 0.35)},
}
rig['gear'] = {}
for name, g in GEAR.items():
    img = cv2.imread(f'assets/game/parts/gear/{name}.png', cv2.IMREAD_UNCHANGED)
    k = g['height'] * H / img.shape[0]  # 元の主人公の画素に合わせる倍率
    w, h = int(img.shape[1] * k * SCALE), int(img.shape[0] * k * SCALE)
    cv2.imwrite(os.path.join(OUT, f'{name}.png'), cv2.resize(img, (w, h), interpolation=cv2.INTER_AREA))
    rig['gear'][name] = {'w': img.shape[1] * k, 'h': img.shape[0] * k, 'pivot': list(g['pivot'])}
    print(f'{name}: {w}x{h}')
with open(os.path.join(OUT, 'rig.json'), 'w') as f:
    json.dump(rig, f, indent=1)
