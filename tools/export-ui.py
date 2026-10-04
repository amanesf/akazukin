#!/usr/bin/env python3
"""画面の飾りの絵を app/public/ui/ に書き出す。無料（決まっている1枚絵から切り出す）。

- title.webp：題字の画面の背景（メインビジュアル mainvisual-v5）
- moon.webp：ゲームの紅い月（moon-v1 を丸く切り抜く）
- cutin.webp：桜嵐のカットイン（立ち絵 taisho-v11 の上半身。背景のクリーム色を抜く。肌が背景に近く、囲まれた所まで抜くと顔に穴が開いたので、縁から辿れる所だけ）

    python3 tools/export-ui.py
"""
import os
import subprocess
import tempfile

import cv2
import numpy as np
from PIL import Image

OUT = 'app/public/ui'
os.makedirs(OUT, exist_ok=True)
mv = Image.open('assets/spinoff/akazukin/mainvisual-v5.jpg').convert('RGB')

t = mv.copy()
t.thumbnail((900, 1200), Image.LANCZOS)
t.save(f'{OUT}/title.webp', quality=82, method=6)

# 月：moon-v1（クレーターのある紅い満月に、細く光る裂け目。2026-10-04 生成）。メインビジュアルの月は狼の影が
# 写っていて変だった（アマネさん「月変でしょ。狼写ってて」）。灰色の背景から月の丸を見つけ、丸の外を柔らかく抜く
mo = np.asarray(Image.open('assets/game/moon-v1.jpg').convert('RGB')).astype(int)
bgc = np.median(np.array([mo[2, 2], mo[2, -3], mo[-3, 2], mo[-3, -3]]), axis=0)
ys, xs = np.nonzero(np.abs(mo - bgc).max(axis=2) > 30)
cx, cy = (xs.min() + xs.max()) / 2, (ys.min() + ys.max()) / 2
r = (xs.max() - xs.min() + ys.max() - ys.min()) / 4
n = mo.shape[0]
yy, xx = np.mgrid[:n, :mo.shape[1]]
d = np.hypot(xx - cx, yy - cy)
alpha = np.clip((r - 2 - d) / 4, 0, 1)
rgba = np.dstack([mo.astype(np.uint8), (alpha * 255).astype(np.uint8)])
x0, y0 = int(cx - r - 4), int(cy - r - 4)
Image.fromarray(rgba[y0:y0 + int(2 * r + 8), x0:x0 + int(2 * r + 8)], 'RGBA').resize((360, 360), Image.LANCZOS).save(f'{OUT}/moon.webp', quality=88, method=6)

# カットイン：立ち絵の背景を抜き（tools/cutout.py）、頭から腰まで
with tempfile.TemporaryDirectory() as tmp:
    subprocess.run(['python3', 'tools/cutout.py', 'assets/spinoff/akazukin/taisho-v11.jpg', '--out', tmp, '--names', 'hero', '--tol', '18', '--hole', '100000000'], check=True, capture_output=True)
    # 弓と弦のあいだに囲まれたクリーム色（目で確かめて指す）
    subprocess.run(['python3', 'tools/punch.py', f'{tmp}/hero.png', '199,417', '161,605'], check=True, capture_output=True)
    hero = Image.open(f'{tmp}/hero.png').convert('RGBA')
w, h = hero.size
c = hero.crop((int(w * 0.05), int(h * 0.0), int(w * 0.95), int(h * 0.5)))
c.thumbnail((900, 700), Image.LANCZOS)
c.save(f'{OUT}/cutin.webp', quality=86, method=6)
for f in sorted(x for x in os.listdir(OUT) if x.endswith('.webp')):
    print(f, Image.open(f'{OUT}/{f}').size, os.path.getsize(f'{OUT}/{f}') // 1024, 'KB')
