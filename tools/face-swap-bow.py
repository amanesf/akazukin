#!/usr/bin/env python3
"""弓を下げて待つ絵の表情（hero-bow-faces-a-v1・b-v1）を、bowrun/bowcalm に重ねる。無料。

tools/face-swap.py と同じやり方：生成は「顔だけ変えて」と頼んだが体も数画素ずつ描き直されるので、
頭（頭巾・顔）だけを新しい絵から取り、あごの下から下は bowcalm のまま。境目は 250〜280行目で混ぜる。
大きさは bowcalm の背にそろえ、ずれは頭の不透明な所の重なりが一番大きくなる所を探す。

    python3 tools/face-swap-bow.py
"""
import cv2
import numpy as np

calm = cv2.imread('assets/game/parts/bowrun/bowcalm.png', cv2.IMREAD_UNCHANGED).astype(np.float32)
H, W = calm.shape[:2]
NECK0, NECK1 = 250, 280
head = calm[:NECK1, :, 3] > 128
for name in ('bowhappy', 'bowwink', 'bowcry', 'bowsmug', 'bowteary', 'bowyawn', 'bowsurprised'):
    im = cv2.imread(f'assets/game/parts/bowfaces/{name}.png', cv2.IMREAD_UNCHANGED)
    k = H / im.shape[0]
    im = cv2.resize(im, (round(im.shape[1] * k), H), interpolation=cv2.INTER_CUBIC).astype(np.float32)
    best = None
    for dy in range(-12, 13):
        for dx in range(-12, 13):
            pad = np.zeros_like(calm)
            sh = np.roll(np.roll(im, dy, 0), dx, 1)
            h, w = min(H, sh.shape[0]), min(W, sh.shape[1])
            pad[:h, :w] = sh[:h, :w]
            a = pad[:NECK1, :, 3] > 128
            score = (a & head).sum() / max(1, (a | head).sum())
            if best is None or score > best[0]:
                best = (score, dx, dy, pad)
    score, dx, dy, pad = best
    k = np.clip((NECK1 - np.arange(H, dtype=np.float32)) / (NECK1 - NECK0), 0, 1)[:, None, None]
    out = pad * k + calm * (1 - k)
    cv2.imwrite(f'assets/game/parts/bowfaces/{name}.png', np.clip(out, 0, 255).astype(np.uint8))
    print(name, dx, dy, round(score, 3))
