#!/usr/bin/env python3
"""画面の飾りの絵を app/public/ui/ に書き出す。無料（決まっている1枚絵から切り出す）。

- title.webp：題字の画面の背景（メインビジュアル mainvisual-v5）
- moon.webp：ゲームの紅い月（メインビジュアルの月を丸く切り抜く。裂け目から狼の影が飛び出す絵。
  図形の月が「リアルじゃない」（2026-10-04 アマネさん））
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

# 月：メインビジュアルの月の真ん中と半径（目で測った。1856x2304 の画素）
cx, cy, r = 1468, 316, 300
m = mv.crop((cx - int(r * 1.25), cy - int(r * 1.25), cx + int(r * 1.25), cy + int(r * 1.25)))
a = np.asarray(m).copy()
n = a.shape[0]
yy, xx = np.mgrid[:n, :n]
d = np.hypot(xx - n / 2, yy - n / 2) / r
alpha = np.clip((1.08 - d) / 0.12, 0, 1)  # 月の縁で柔らかく抜く
rgba = np.dstack([a, (alpha * 255).astype(np.uint8)])
Image.fromarray(rgba, 'RGBA').resize((360, 360), Image.LANCZOS).save(f'{OUT}/moon.webp', quality=88, method=6)

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
for f in sorted(os.listdir(OUT)):
    print(f, Image.open(f'{OUT}/{f}').size, os.path.getsize(f'{OUT}/{f}') // 1024, 'KB')
