#!/usr/bin/env python3
"""表情の追加（hero-faces2-v1）を、力を抜いた待機の絵（relax/calm）に重ねる。無料。

生成は「顔だけ変えて」と頼んだが、体の細かい所（ナイフ・裾・しっぽの毛）も数画素ずつ描き直されていた。
差し替えたときに体がちらつかないよう、頭（頭巾・顔・おさげの上）だけを新しい絵から取り、首から下は calm のまま。
境目は首のリボンの上で、40画素かけて混ぜる。ずれ（dx, dy）は不透明な所の重なりが一番大きくなる所を測った。

    python3 tools/face-swap.py
"""
import cv2
import numpy as np

calm = cv2.imread('assets/game/parts/relax/calm.png', cv2.IMREAD_UNCHANGED).astype(np.float32)
H, W = calm.shape[:2]
NECK0, NECK1 = 300, 340  # この行までは新しい絵、ここから下は calm（元の絵の画素）
for name, (dx, dy) in {'smug': (0, 0), 'teary': (-1, -1), 'yawn': (-1, -1), 'surprised': (-1, -1)}.items():
    im = cv2.imread(f'assets/game/parts/faces2/{name}.png', cv2.IMREAD_UNCHANGED)
    im = np.roll(np.roll(im, dy, 0), dx, 1)
    pad = np.zeros_like(calm)
    h, w = min(H, im.shape[0]), min(W, im.shape[1])
    pad[:h, :w] = im[:h, :w]
    k = np.clip((NECK1 - np.arange(H, dtype=np.float32)) / (NECK1 - NECK0), 0, 1)[:, None, None]
    out = pad * k + calm * (1 - k)
    cv2.imwrite(f'assets/game/parts/faces2/{name}.png', np.clip(out, 0, 255).astype(np.uint8))
    print(name)
