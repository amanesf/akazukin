#!/usr/bin/env python3
"""右向きのポーズの絵（差し替え用）と歩きの脚を、ゲームで使う大きさに縮めて app/public/hero/ に書き出す。無料。

- 絵：idle（構え。胴だけ。脚は legL・legR を別に重ねて歩かせる）／up（頭上へ振り上げ）／strike（前へ突く）／
  down（倒れた姿）／back（後ろ斜め向き。回転の一瞬に使う。元は左向きなので左右反転）
- 各絵の「足もと」（ブーツの下端の真ん中）を基準にそろえる。frames.json に、絵ごとの足もとの位置と、
  両手の拳の位置（ナイフを差し込む所）と、ナイフの向きを書く
- 拳の位置は、目盛りを入れた絵から読んだ（各ポーズの元の切り抜き assets/game/parts/poses/*.png の画素）

    python3 tools/export-hero.py
"""
import json
import os

import cv2
import numpy as np
from PIL import Image

OUT = 'app/public/hero'
SCALE = 0.35  # 元の絵は高さ約1100画素。画面では高さ120画素ほど（端末の解像度が3倍でも粗くならない）
P = 'assets/game/parts/poses'


def feet(img):
    """ブーツの下端の真ん中（不透明な画素の一番下から40行の平均）"""
    a = img[:, :, 3] > 128
    ys = np.nonzero(a.any(axis=1))[0]
    bottom = ys.max()
    xs = np.nonzero(a[bottom - 40:bottom + 1].any(axis=0))[0]
    return [float(xs.mean()), float(bottom)]


def save(name, img):
    small = cv2.resize(img, (int(img.shape[1] * SCALE), int(img.shape[0] * SCALE)), interpolation=cv2.INTER_AREA)
    # WebP（画質90・透明は劣化なし）。PNG の 923KB が約110KB になる。3倍に拡大して見比べて差は見えない
    Image.fromarray(cv2.cvtColor(small, cv2.COLOR_BGRA2RGBA)).save(os.path.join(OUT, f'{name}.webp'), quality=90, method=6)
    return [img.shape[1], img.shape[0]]


os.makedirs(OUT, exist_ok=True)
for f in os.listdir(OUT):
    os.remove(os.path.join(OUT, f))
frames = {}

# 構え：胴（tools/rig-p1.py の出力。ref-p1 の枠＝p1.png を (84, 66) ずらした所）と2本の脚
rig = json.load(open('assets/game/parts/p1rig/rig.json'))
body = cv2.imread('assets/game/parts/p1rig/body.png', cv2.IMREAD_UNCHANGED)
OX, OY = 84, 66
p1 = cv2.imread(f'{P}/p1.png', cv2.IMREAD_UNCHANGED)
f1 = feet(p1)
frames['idle'] = {'size': save('idle', body), 'feet': [f1[0] + OX, f1[1] + OY], 'legs': {}}
for leg in ('legL', 'legR'):
    img = cv2.imread(f'assets/game/parts/p1rig/{leg}.png', cv2.IMREAD_UNCHANGED)
    save(leg, img)
    frames['idle']['legs'][leg] = {'hip': rig['legs'][leg]['hip']}

for name, src in (('up', 'p2'), ('strike', 'p3'), ('down', 'p4')):
    img = cv2.imread(f'{P}/{src}.png', cv2.IMREAD_UNCHANGED)
    frames[name] = {'size': save(name, img), 'feet': feet(img)}

back = cv2.flip(cv2.imread('assets/game/parts/body34/back34.png', cv2.IMREAD_UNCHANGED), 1)
# 後ろ向きの絵は別の1枚から来たので、背の高さを構えに合わせる（ブーツの下端から頭巾の耳の先まで）
def height(img):
    ys = np.nonzero((img[:, :, 3] > 128).any(axis=1))[0]
    return ys.max() - ys.min()
k = height(p1) / height(back)
back = cv2.resize(back, (int(back.shape[1] * k), int(back.shape[0] * k)), interpolation=cv2.INTER_AREA)
frames['back'] = {'size': save('back', back), 'feet': feet(back)}

# 拳（ナイフを差し込む所）と、ナイフの刃の向き（度。0＝真上、正＝時計回り＝前へ倒す）
# 向きは、指が巻いている筒の向き（拳の穴の通る向き）に合わせる。腕の向きに沿わせると拳から刃が生えて見える（2026-10-04・アマネさん）
# 3つ目の数は、握りを筒に沿って押し込む量（画素。負＝柄頭の側へ）。鍔が人差し指（逆手なら小指）にぴったり付く所
# 構え（idle）の座標は胴の枠（ref-p1）なので OX, OY を足す。元の解像度で試すには tools/grip-test.py
fists = {
    'idle': [([150 + OX, 122 + OY], 25, -35), ([478 + OX, 352 + OY], 10, -40)],
    'up': [([195, 32], 80, -30), ([460, 498], -15, -30)],  # 振り上げた拳は手のひらがこちら向き：筒は横。小指の側から前へ（逆手）
    'strike': [([632, 522], 20, -30), ([328, 434], 5, -30, 'front')],  # 突いた拳は下に筒の穴が見える：刃は上へ、柄頭が下から少し出る
}
# 'front'：拳が胴の前にある（胴の裏に差すと刃ごと隠れる）。柄は拳が隠すことにして、鍔から先の刃だけを胴の前に描く
for name, fs in fists.items():
    out = []
    for at, deg, slide, *front in fs:
        r = np.radians(deg)
        grip = [round(at[0] + slide * np.sin(r), 1), round(at[1] - slide * np.cos(r), 1)]
        # at＝ナイフの握り、hand＝拳の真ん中（弓はここで持つ）
        out.append({'at': grip, 'hand': at, 'deg': deg, **({'front': True} if front else {})})
    frames[name]['fists'] = out

# ナイフと弓（装備の一覧から）。長さは主人公の背の高さに対する割合（ナイフは前腕より少し長い）
p1h = height(p1)
for name, frac, pivot in (('knife', 0.21, [0.5, 0.84]), ('bow', 0.55, [0.42, 0.5])):
    img = cv2.imread(f'assets/game/parts/gear/{name}.png', cv2.IMREAD_UNCHANGED)
    meta = {'pivot': pivot}
    if name == 'knife':
        # 鍔の下端（柄の赤が始まる行）。刃だけを描くときはここで切る
        rows = [y for y in range(img.shape[0] // 2, img.shape[0]) if (m := img[y, :, 3] > 128).any()
                and (c := img[y][m][:, :3].mean(0))[2] > 1.8 * c[1] + 20]
        meta['guard'] = round(rows[0] / img.shape[0], 3)
    kk = frac * p1h / img.shape[0]
    img = cv2.resize(img, (int(img.shape[1] * kk), int(img.shape[0] * kk)), interpolation=cv2.INTER_AREA)
    frames[name] = {'size': save(name, img), **meta}

json.dump({'scale': SCALE, 'height': int(p1h), 'frames': frames}, open(os.path.join(OUT, 'frames.json'), 'w'), indent=1)
total = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT))
print('written', sorted(os.listdir(OUT)), f'{total / 1024:.0f}KB')
