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
SCALE = 0.75  # 元の絵は高さ約1100画素。2026-10-04 主人公のアップ（画面で高さ約260画素）に合わせて上げた。端末の解像度3倍で縦約800画素
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

# 力を抜いた待機と表情（hero-idle-faces-v1）・走り2コマ・横なぎ・決めポーズ（hero-motion-v1）。2026-10-04 生成。
# ナイフは絵に描いてあるので、拳に差し込まない。大きさは、まっすぐ立った1人（待機・決めポーズ）の背の高さを構えに合わせ、
# 同じ1枚の他の絵も同じ倍率で縮める（同じカメラで描かれているので）
# 3枚目（hero-action2-v1：突進・斬り上げ・溜め）にはまっすぐ立った人がいない。3枚とも同じ頼み方・同じ大きさ（立って約1190画素）で
# 描かれたので、1枚目の待機と同じ倍率にする。のけぞりはナイフを持っていないので使わない。
# 4枚目（hero-extra-v1：弓を引く・放つ・ナイフを持ったのけぞり）も同じ。弓が頭より上に出るので背の高さでは測れない。後ろ姿は頭巾の柄が消えたので使わない
calm_h = height(cv2.imread('assets/game/parts/relax/calm.png', cv2.IMREAD_UNCHANGED))
# 2026-10-04 かわいさの追加（生成3回）：
#   faces2（hero-faces2-v1）＝待機の顔をあと4つ（どや・涙目・あくび・びっくり）。頭だけ calm に重ねてある（tools/face-swap.py）ので calm と同じ倍率
#   gesture（hero-gesture-v1）＝待機のしぐさ（伸び・花びら・ナイフ投げ・頭巾直し）。宙のナイフと花びらは切り抜きで落ちたので、試作で描く
#   victory2（hero-victory2-v1）＝晩の終わり（主砲を担ぐ・跳んで万歳・お辞儀・しゃがんで犬をなでる）
#   この2枚は立った人が1割ほど小さく描かれたので、まっすぐ立った1人（花びら・お辞儀）の背を calm にそろえる
for sheet, ref, names in (('relax', 'calm', ('calm', 'happy', 'wink', 'cry')), ('motion', 'victory', ('run1', 'run2', 'sweep', 'victory')),
                          ('action2', None, ('dash', 'rise', 'charge')), ('extra', None, ('aim', 'loose', 'knock')),
                          ('faces2', None, ('smug', 'teary', 'yawn', 'surprised')),
                          ('gesture', 'petal', ('stretch', 'petal', 'toss', 'hood')), ('victory2', 'curtsy', ('shoulder', 'cheer', 'curtsy', 'pet')),
                          # 2026-10-06 弓を持った絵（hero-bow-run-v1）：弓を持って走る2コマ・弓を下げて待つ・矢をつがえて構える。まっすぐ立った bowcalm の背を構えにそろえる
                          ('bowrun', 'bowcalm', ('bowrun1', 'bowrun2', 'bowcalm', 'bowready'))):
    k = height(p1) / (height(cv2.imread(f'assets/game/parts/{sheet}/{ref}.png', cv2.IMREAD_UNCHANGED)) if ref else calm_h)
    for name in names:
        img = cv2.imread(f'assets/game/parts/{sheet}/{name}.png', cv2.IMREAD_UNCHANGED)
        img = cv2.resize(img, (int(img.shape[1] * k), int(img.shape[0] * k)), interpolation=cv2.INTER_AREA)
        f = feet(img)
        if sheet == 'motion' or name in ('dash', 'rise', 'knock', 'cheer', 'bowrun1', 'bowrun2'):
            # 足が前後に開いた絵は、足の真ん中ではなくスカートの真ん中（背の高さの62〜72%の行の、不透明な所の端と端の真ん中）を基準にする。
            # 腰の高さはしっぽとナイフが横に出ていてずれる。
            # 一番下の足を基準にすると、走りの2コマで体が左右へ跳んだ
            a = img[:, :, 3] > 128
            ys = np.nonzero(a.any(axis=1))[0]
            top, bottom = ys.min(), ys.max()
            band = a[int(top + (bottom - top) * 0.62):int(top + (bottom - top) * 0.72)]
            xs = np.nonzero(band.any(axis=0))[0]
            f = [float((xs.min() + xs.max()) / 2), f[1]]
        frames[name] = {'size': save(name, img), 'feet': f}

# 拳（ナイフを差し込む所）と、ナイフの刃の向き（度。0＝真上、正＝時計回り＝前へ倒す）
# 向きは、指が巻いている筒の向き（拳の穴の通る向き）に合わせ、前腕にほぼ直角（手首で曲がるのは±20°まで）。
# 腕の向きに沿わせると拳から刃が生えて見え、直角から大きく外すと手首が折れて見える（2026-10-04・アマネさん「傾きがイマイチ」）
# 3つ目の数は、握りを筒に沿ってずらす量（画素。負＝柄頭の側へ）。鍔が人差し指（逆手なら小指）にぴったり付く所
# 構え（idle）の座標は胴の枠（ref-p1）なので OX, OY を足す。元の解像度で試すには tools/grip-test.py
fists = {
    # 前の手（上・前に出た拳）は順手で刃が上、後ろの手（下・胸の拳）は逆手で刃が下。後ろの手を順手にすると刃が自分の顔へ向く
    'idle': [([150 + OX, 122 + OY], -35, -30), ([478 + OX, 352 + OY], 160, -3)],
    'up': [([195, 32], 80, -30), ([460, 498], 160, -15)],  # 振り上げた拳は手のひらがこちら向き：筒は横。小指の側から前へ（逆手）
    'strike': [([632, 522], 35, -30), ([328, 434], 175, -15, 'front')],  # 突いた拳は下に筒の穴が見える：刃は上へ、柄頭が下から少し出る
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

# ナイフと弓（装備の一覧から。cams＝弓の握りから見た上下の滑車の位置。弓の絵の大きさの画素）。長さは主人公の背の高さに対する割合（ナイフは前腕より少し長い）
p1h = height(p1)
# 弓は2026-10-04から絵に描いてある（弓を引く・放つ）ので書き出さない。主砲は背中の取り付け部（上の金の継ぎ手）を中心に回す
# 主砲は背の0.8倍（0.5倍では小さくて見えなかった。2026-10-04）
for name, frac, pivot in (('knife', 0.21, [0.5, 0.84]), ('cannon', 0.8, [0.55, 0.13])):
    img = cv2.imread(f'assets/game/parts/gear/{name}.png', cv2.IMREAD_UNCHANGED)
    meta = {'pivot': pivot}
    if name == 'knife':
        # 鍔の下端（柄の赤が始まる行）。刃だけを描くときはここで切る
        rows = [y for y in range(img.shape[0] // 2, img.shape[0]) if (m := img[y, :, 3] > 128).any()
                and (c := img[y][m][:, :3].mean(0))[2] > 1.8 * c[1] + 20]
        meta['guard'] = round(rows[0] / img.shape[0], 3)
    if name == 'bow':
        # 弦は試作で描く（引いた形・放した形）ので、絵の弦を消す：各行で、弓の腕より外の細い線（幅40画素まで。2本が重なる所がある）
        h, w = img.shape[:2]
        a = img[:, :, 3] > 40
        for y in range(140, h - 140):
            xs = np.flatnonzero(np.diff(np.r_[0, a[y].astype(np.int8), 0]))
            runs = list(zip(xs[::2], xs[1::2]))
            for x0, x1 in runs[1:]:
                if x1 - x0 <= 40:
                    img[y, x0:x1, 3] = 0
        # 弦をかける滑車（上下の端の丸）の真ん中
        def cam(y0, y1):
            ys, xs = np.nonzero(img[y0:y1, w // 2:, 3] > 128)
            return [xs.mean() + w // 2, ys.mean() + y0]
        cams = [cam(0, 140), cam(h - 140, h)]
        # 絵は弦が右。右向きの主人公が前の手で持つと弦は体の側（左）に来るので、左右反転する
        img = cv2.flip(img, 1)
        meta['pivot'] = pivot = [round(1 - pivot[0], 3), pivot[1]]
        kk = frac * p1h / h
        meta['cams'] = [[round((w - 1 - cx - pivot[0] * w) * kk, 1), round((cy - pivot[1] * h) * kk, 1)] for cx, cy in cams]
    kk = frac * p1h / img.shape[0]
    img = cv2.resize(img, (int(img.shape[1] * kk), int(img.shape[0] * kk)), interpolation=cv2.INTER_AREA)
    frames[name] = {'size': save(name, img), **meta}

json.dump({'scale': SCALE, 'height': int(p1h), 'frames': frames}, open(os.path.join(OUT, 'frames.json'), 'w'), indent=1)
total = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT))
print('written', sorted(os.listdir(OUT)), f'{total / 1024:.0f}KB')
