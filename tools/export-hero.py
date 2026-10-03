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
    cv2.imwrite(os.path.join(OUT, f'{name}.png'), small)
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
# 構え（idle）の座標は胴の枠（ref-p1）なので OX, OY を足す
fists = {
    'idle': [([150 + OX, 122 + OY], -35), ([478 + OX, 352 + OY], 55)],
    'up': [([195, 32], 10), ([460, 498], 55)],
    'strike': [([632, 522], 95), ([328, 434], 40)],
}
for name, fs in fists.items():
    frames[name]['fists'] = [{'at': at, 'deg': d} for at, d in fs]

# ナイフと弓（装備の一覧から）。長さは主人公の背の高さに対する割合（ナイフは前腕より少し長い）
p1h = height(p1)
for name, frac, pivot in (('knife', 0.21, [0.5, 0.84]), ('bow', 0.55, [0.42, 0.5])):
    img = cv2.imread(f'assets/game/parts/gear/{name}.png', cv2.IMREAD_UNCHANGED)
    kk = frac * p1h / img.shape[0]
    img = cv2.resize(img, (int(img.shape[1] * kk), int(img.shape[0] * kk)), interpolation=cv2.INTER_AREA)
    frames[name] = {'size': save(name, img), 'pivot': pivot}

json.dump({'scale': SCALE, 'height': int(p1h), 'frames': frames}, open(os.path.join(OUT, 'frames.json'), 'w'), indent=1)
total = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT))
print('written', sorted(os.listdir(OUT)), f'{total / 1024:.0f}KB')
