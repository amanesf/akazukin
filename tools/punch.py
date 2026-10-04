#!/usr/bin/env python3
"""切り抜いた絵に残った、囲まれた小さな背景（袖と毛皮のすき間・ブーツの紐の輪の中など）を、指した所から塗りつぶしで辿って抜く。無料。

cutout.py は縁から辿れる背景と大きな穴しか抜かない。小さな穴を色だけで自動で抜くと、
しっぽの先の白い毛や服の影まで抜けた（2026-10-04 実測）ので、場所を目で確かめて指す。

    python3 tools/punch.py assets/game/parts/motion/sweep.png 480,455 285,492 [--tol 22]
"""
import argparse

import cv2
import numpy as np

ap = argparse.ArgumentParser()
ap.add_argument('png')
ap.add_argument('seeds', nargs='+', help='x,y（その絵の画素）')
ap.add_argument('--tol', type=int, default=22, help='辿る色の差（隣の画素との差ではなく、指した所の色との差）')
a = ap.parse_args()

im = cv2.imread(a.png, cv2.IMREAD_UNCHANGED)
h, w = im.shape[:2]
bgr = np.ascontiguousarray(im[:, :, :3])
bgr[im[:, :, 3] < 100] = 0  # もう抜けている所は辿らない（外の背景へ伝わって、絵の縁まで抜けた）
for s in a.seeds:
    x, y = map(int, s.split(','))
    mask = np.zeros((h + 2, w + 2), np.uint8)
    t = (a.tol,) * 3
    cv2.floodFill(bgr.copy(), mask, (x, y), (0, 0, 0), t, t, cv2.FLOODFILL_FIXED_RANGE | cv2.FLOODFILL_MASK_ONLY | (255 << 8))
    m = mask[1:-1, 1:-1] > 0
    # 縁のにじみ（背景と線の中間の色）も1画素ぶん抜いて、ぼかして馴染ませる
    m = cv2.dilate(m.astype(np.uint8), np.ones((3, 3), np.uint8)).astype(bool)
    print(f'{s}: {int(m.sum())} 画素')
    im[:, :, 3][m] = 0
im[:, :, 3] = np.minimum(im[:, :, 3], cv2.GaussianBlur(im[:, :, 3], (3, 3), 0))
cv2.imwrite(a.png, im)
