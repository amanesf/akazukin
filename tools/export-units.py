#!/usr/bin/env python3
"""狼の絵（assets/game/parts/wolves/*.png。wolves-v1 から切り抜き）と、番犬・家の絵（parts/dogs。dogs-house-v1）を、ゲームで使う大きさに縮めて app/public/wolves/ に書き出す。無料。

- 絵は右向きに描かれた（頼んだのは左向き）。狼は家（左）へ向かうので、左右反転して左向きにする
- meta.json の h は、絵の中の、ふつうの狼を1とした高さ（参考。画面での大きさは試作の側でゲームの大きさに合わせる。
  絵の大狼はふつうの狼の1.5倍しかなく、ゲームの大きさ（2.1倍）より小さかった）
- 足もと（脚の下端の真ん中）を基準にする

    python3 tools/export-units.py
"""
import json
import os

import cv2
import numpy as np
from PIL import Image

OUT = 'app/public/wolves'
SRC = 'assets/game/parts/wolves'
NAMES = ['pup', 'wolf', 'armored', 'howler', 'alpha']
WOLF_PX = 420  # ふつうの狼の高さ（書き出す画素）。画面で約130画素×端末の解像度3倍

os.makedirs(OUT, exist_ok=True)
imgs = {n: cv2.flip(cv2.imread(f'{SRC}/{n}.png', cv2.IMREAD_UNCHANGED), 1) for n in NAMES}


def bounds(img):
    a = img[:, :, 3] > 128
    ys = np.nonzero(a.any(axis=1))[0]
    xs = np.nonzero(a.any(axis=0))[0]
    return xs.min(), ys.min(), xs.max(), ys.max()


wolf_h = bounds(imgs['wolf'])[3] - bounds(imgs['wolf'])[1]
k = WOLF_PX / wolf_h
# ふつうの狼の動き（wolf-motion-v1：もう1歩・噛みつき・のけぞり・宙で転がる）。別の1枚なので、歩きの背の高さを
# ふつうの狼にそろえた倍率で、4枚とも縮める
MOTION = ['wolf_walk2', 'wolf_bite', 'wolf_hit', 'wolf_air']
mimgs = {n: cv2.flip(cv2.imread(f'{SRC}/{n}.png', cv2.IMREAD_UNCHANGED), 1) for n in MOTION}
km = wolf_h / (bounds(mimgs['wolf_walk2'])[3] - bounds(mimgs['wolf_walk2'])[1])
for n, img in mimgs.items():
    imgs[n] = cv2.resize(img, (int(img.shape[1] * km), int(img.shape[0] * km)), interpolation=cv2.INTER_AREA)
# 子狼・鎧狼・遠吠え・大狼の動き（pack-motion-v1：噛みつき4つ・のけぞり2つ。子狼と鎧狼ののけぞりは別の狼に描かれたので使わない）。
# 別の1枚で縮尺が違うので、同じ姿勢で描かれた所で倍率を測る：遠吠え（頭を上げた立ち姿）と大狼（のけぞりの立ち姿）。
# 子狼・鎧狼は遠吠えの倍率を使う（同じ1枚の中は互いの大きさで描かせた）
PACK = {'pup_bite': 'pup', 'armored_bite': 'armored', 'howler_bite': 'howler', 'alpha_bite': 'alpha', 'howler_hit': 'howler', 'alpha_hit': 'alpha'}
pimgs = {n: cv2.flip(cv2.imread(f'{SRC}/{n}.png', cv2.IMREAD_UNCHANGED), 1) for n in PACK}
hgt = lambda im: bounds(im)[3] - bounds(im)[1]
sheet = {'howler': hgt(imgs['howler']) / hgt(pimgs['howler_hit']), 'alpha': hgt(imgs['alpha']) / hgt(pimgs['alpha_hit'])}
for n, kind in PACK.items():
    kk = sheet.get(kind, sheet['howler'])
    imgs[n] = cv2.resize(pimgs[n], (int(pimgs[n].shape[1] * kk), int(pimgs[n].shape[0] * kk)), interpolation=cv2.INTER_AREA)
MOTION += list(PACK)
meta = {}
for n, img in imgs.items():
    x0, y0, x1, y1 = bounds(img)
    img = img[max(0, y0 - 4):y1 + 5, max(0, x0 - 4):x1 + 5]
    small = cv2.resize(img, (int(img.shape[1] * k), int(img.shape[0] * k)), interpolation=cv2.INTER_AREA)
    Image.fromarray(cv2.cvtColor(small, cv2.COLOR_BGRA2RGBA)).save(f'{OUT}/{n}.webp', quality=88, method=6)
    a = small[:, :, 3] > 128
    bottom = np.nonzero(a.any(axis=1))[0].max()
    # 前足と後ろ足のあいだの真ん中（下から背の高さの12%の行に写る脚の端と端）
    xs = np.nonzero(a[int(bottom - small.shape[0] * 0.12):bottom + 1].any(axis=0))[0]
    fx = float((xs.min() + xs.max()) / 2)
    if n in MOTION:
        fx = small.shape[1] / 2  # 動きの絵は前足を伸ばすので、絵の真ん中を基準に（コマを替えても体が跳ばない）
    meta[n] = {'size': [small.shape[1], small.shape[0]], 'feet': [fx, float(bottom)],
               'h': round(float((y1 - y0) / wolf_h), 3)}
json.dump(meta, open(f'{OUT}/meta.json', 'w'), indent=1)
total = sum(os.path.getsize(f'{OUT}/{f}') for f in os.listdir(OUT))
print(meta, f'{total / 1024:.0f}KB')

# 番犬（右向きに描かれた。そのまま）と家。h は秋田を1とした高さ。家は足もと＝土台の下端の真ん中
OUT = 'app/public/dogs'
os.makedirs(OUT, exist_ok=True)
imgs = {n: cv2.imread(f'assets/game/parts/dogs/{n}.png', cv2.IMREAD_UNCHANGED) for n in ('shiba', 'akita', 'tosa', 'house')}
akita_h = bounds(imgs['akita'])[3] - bounds(imgs['akita'])[1]
# 番犬の動き（dogs-motion-v1：走り・噛みつき）。別の1枚なので、秋田の噛みつき（頭を上げた立ち姿に近い）の背を秋田にそろえた倍率で
DMOTION = [f'{d}_{m}' for m in ('run', 'bite') for d in ('shiba', 'akita', 'tosa')]
dimgs = {n: cv2.imread(f'assets/game/parts/dogs/{n}.png', cv2.IMREAD_UNCHANGED) for n in DMOTION}
kd = akita_h / (bounds(dimgs['akita_bite'])[3] - bounds(dimgs['akita_bite'])[1])
for n, img in dimgs.items():
    imgs[n] = cv2.resize(img, (int(img.shape[1] * kd), int(img.shape[0] * kd)), interpolation=cv2.INTER_AREA)
k = 360 / akita_h
meta = {}
for n, img in imgs.items():
    x0, y0, x1, y1 = bounds(img)
    img = img[max(0, y0 - 4):y1 + 5, max(0, x0 - 4):x1 + 5]
    kk = k * (0.8 if n == 'house' else 1)  # 家は大きいので少し粗く
    small = cv2.resize(img, (int(img.shape[1] * kk), int(img.shape[0] * kk)), interpolation=cv2.INTER_AREA)
    Image.fromarray(cv2.cvtColor(small, cv2.COLOR_BGRA2RGBA)).save(f'{OUT}/{n}.webp', quality=88, method=6)
    a = small[:, :, 3] > 128
    bottom = np.nonzero(a.any(axis=1))[0].max()
    xs = np.nonzero(a[int(bottom - small.shape[0] * 0.12):bottom + 1].any(axis=0))[0]
    fx = small.shape[1] / 2 if n in DMOTION else float((xs.min() + xs.max()) / 2)  # 動きの絵は絵の真ん中を基準に
    meta[n] = {'size': [small.shape[1], small.shape[0]], 'feet': [fx, float(bottom)],
               'h': round(float((y1 - y0) / akita_h), 3)}
json.dump(meta, open(f'{OUT}/meta.json', 'w'), indent=1)
total = sum(os.path.getsize(f'{OUT}/{f}') for f in os.listdir(OUT))
print(meta, f'{total / 1024:.0f}KB')
