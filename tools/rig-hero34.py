#!/usr/bin/env python3
"""斜め向きの赤ずきん（手前の腕を前へ伸ばした1枚 hero-armout-v1）を、切り絵の部品に分ける。無料。

層（後ろから）：body（腕を抜いた全身）→ arm（伸ばした腕＋付け根の丸い関節）→ fur（肩の毛皮。関節の上にかぶせる）
- 腕は毛皮の手前（CUT_X より左。腕が全部見えている所）で切る。切り口には袖の生地から取った円盤を付け、
  どの角度に回しても丸い肩に見えるようにする（切り口を見せない）
- 立ち姿（回していないとき）は、元の絵と同じ画素になる置き方にする
- 絵は左向き。ゲームでは左右反転して右向きにする

    python3 tools/rig-hero34.py [--check 出力先]   # --check で、腕を回した姿を拡大して書き出す
"""
import argparse
import json
import os

import cv2
import numpy as np

SRC = 'assets/game/parts/armout/full.png'
OUT = 'app/public/hero'
SCALE = 0.2
CUT_X = 330  # 腕を切る位置（ここより左は腕の全体が見えている）
ARM_BOX = (0, 600, CUT_X, 830)  # 腕のある範囲（x0, y0, x1, y1）
JOINT = (CUT_X, 730)  # 関節（回す中心）＝切り口の真ん中
FUR_BOX = [(330, 590), (500, 590), (500, 1010), (330, 1010)]  # 肩から垂れる毛皮の範囲

ap = argparse.ArgumentParser()
ap.add_argument('--check')
a = ap.parse_args()

im = cv2.imread(SRC, cv2.IMREAD_UNCHANGED)
H, W = im.shape[:2]
alpha = im[:, :, 3]

# ── 腕 ──
x0, y0, x1, y1 = ARM_BOX
arm_mask = np.zeros((H, W), np.uint8)
arm_mask[y0:y1, x0:x1] = alpha[y0:y1, x0:x1]
ys = np.nonzero(arm_mask[:, CUT_X - 1] > 128)[0]
r = (ys.max() - ys.min()) / 2  # 切り口での袖の半分の太さ
cy = (ys.max() + ys.min()) / 2
jx, jy = CUT_X, int(round(cy))
# 円盤：切り口のすぐ左の袖の生地を、関節を中心に右へ折り返して円を埋める（生地の明暗が切り口で続く）
arm = np.zeros((H, W, 4), np.uint8)
arm[arm_mask > 0] = im[arm_mask > 0]
disk = np.zeros((H, W), np.uint8)
cv2.circle(disk, (jx, jy), int(r), 255, -1)
fill = disk.copy()
fill[:, :CUT_X] = 0
yy, xx = np.nonzero(fill)
src_x = np.clip(2 * jx - xx - 1, 0, W - 1)  # 切り口で左右に折り返した位置
arm[yy, xx] = im[yy, src_x]
arm[yy, xx, 3] = 255
# 円盤の縁に、袖の輪郭と同じ色の線を引く（輪郭は切り口のすぐ左の一番暗い色から取る）
edge_col = im[ys.min() + 2, CUT_X - 3, :3].tolist()
ring = np.zeros((H, W), np.uint8)
cv2.circle(ring, (jx, jy), int(r), 255, 3)
ring[:, :CUT_X] = 0
arm[ring > 0, :3] = edge_col
arm[ring > 0, 3] = 255

# ── 胴：腕を抜く。毛皮の所は残る ──
body = im.copy()
body[arm_mask > 0, 3] = 0

# ── 毛皮の層：肩から垂れる毛皮のうち、灰色の毛だけ（袖の白・三つ編みの黒は外す） ──
box = np.zeros((H, W), np.uint8)
cv2.fillPoly(box, [np.array(FUR_BOX, np.int32)], 255)
hsv = cv2.cvtColor(im[:, :, :3], cv2.COLOR_BGR2HSV)
v = hsv[:, :, 2].astype(int)
s = hsv[:, :, 1].astype(int)
furpx = (v > 70) & (v < 205) & (s < 60)
fur = np.zeros((H, W, 4), np.uint8)
m = (box > 0) & furpx & (alpha > 128)
m = cv2.morphologyEx(m.astype(np.uint8) * 255, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8)) > 0
fur[m] = im[m]

os.makedirs(OUT, exist_ok=True)
rig = {'size': [W, H], 'scale': SCALE, 'feet': [int(W * 0.45), H - 6], 'joint': [jx, jy], 'parts': {}}


def save(name, img):
    ys, xs = np.nonzero(img[:, :, 3])
    bx0, by0, bx1, by1 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
    crop = img[by0:by1, bx0:bx1]
    small = cv2.resize(crop, (max(1, int(crop.shape[1] * SCALE)), max(1, int(crop.shape[0] * SCALE))), interpolation=cv2.INTER_AREA)
    cv2.imwrite(os.path.join(OUT, f'{name}.png'), small)
    rig['parts'][name] = {'x': int(bx0), 'y': int(by0), 'w': int(bx1 - bx0), 'h': int(by1 - by0)}
    print(f'{name}: {bx1 - bx0}x{by1 - by0} at {bx0},{by0}')
    return crop, bx0, by0


parts = {n: save(n, img) for n, img in (('body', body), ('arm', arm), ('fur', fur))}
with open(os.path.join(OUT, 'rig.json'), 'w') as f:
    json.dump(rig, f, indent=1)

if a.check:
    # 腕を回した姿を、元の解像度で重ねて書き出す（拡大して継ぎ目を見るため）
    os.makedirs(a.check, exist_ok=True)

    def comp(deg):
        c = np.zeros((H, W, 4), np.float32)

        def over(img, x, y, rot=0):
            layer = np.zeros((H, W, 4), np.uint8)
            layer[y:y + img.shape[0], x:x + img.shape[1]] = img
            if rot:
                M = cv2.getRotationMatrix2D((jx, jy), rot, 1.0)
                layer = cv2.warpAffine(layer, M, (W, H), flags=cv2.INTER_LINEAR)
            al = layer[:, :, 3:4].astype(np.float32) / 255
            c[:, :, :3] = layer[:, :, :3] * al + c[:, :, :3] * (1 - al)
            c[:, :, 3:4] = np.maximum(c[:, :, 3:4], al * 255)
        over(*parts['body'])
        over(*parts['arm'], rot=deg)
        over(*parts['fur'])
        bg = np.zeros((H, W, 3), np.float32)
        bg[:] = (180, 40, 200)
        al = c[:, :, 3:4] / 255
        return (c[:, :, :3] * al + bg * (1 - al)).astype(np.uint8)
    for deg in (0, 90, -60, 150):
        out = comp(deg)
        cv2.imwrite(os.path.join(a.check, f'arm{deg}.png'), out[350:1250, 0:800])
    print('check written')
