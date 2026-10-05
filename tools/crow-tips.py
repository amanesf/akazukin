#!/usr/bin/env python3
"""カラスの絵の、白っぽく残った羽の先（参照の狼の霧が紛れ込んだのを消した名残り）を、羽の暗い紫に寄せて薄くする。無料。
赤い目・赤い裂け目（色の濃い赤）は触らない。2026-10-05 レビュー17。

    python3 tools/crow-tips.py app/public/wolves/crow*.webp
"""
import sys

import numpy as np
from PIL import Image

FEATHER = np.array([62, 50, 82], np.float32)  # 羽の暗い紫
for path in sys.argv[1:]:
    im = np.asarray(Image.open(path).convert('RGBA')).astype(np.float32)
    rgb, a = im[..., :3], im[..., 3]
    L = rgb @ np.array([0.299, 0.587, 0.114], np.float32)
    mx, mn = rgb.max(-1), rgb.min(-1)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1), 0)
    red = (rgb[..., 0] > rgb[..., 1] + 50) & (sat > 0.45)
    t = np.clip((L - 105) / 70, 0, 1) * (sat < 0.35) * (~red) * (a > 0)
    rgb[:] = rgb * (1 - t[..., None]) + FEATHER * t[..., None]
    im[..., 3] = a * (1 - 0.45 * t)
    Image.fromarray(im.clip(0, 255).astype(np.uint8)).save(path, 'WEBP', quality=90, method=6)
    print(path, f'{int((t > 0.05).sum())}px')
