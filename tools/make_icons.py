# -*- coding: utf-8 -*-
"""生成「小橘爱运动」的应用图标:橘色圆角底 + 白色杠铃。
用法: python tools/make_icons.py            # 生成 icons/icon-192.png 与 icon-512.png
      python tools/make_icons.py --android  # 顺便铺到 android/res/mipmap-*/ic_launcher.png
需要 Pillow。"""
import argparse
import os
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.normpath(os.path.join(HERE, '..'))
OUT = os.path.join(REPO, 'icons')

ORANGE = (249, 115, 22, 255)       # #f97316 主色
ORANGE_LIGHT = (251, 146, 60, 255) # #fb923c 顶部渐变
WHITE = (255, 255, 255, 255)

DENSITIES = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}


def make(size):
    s = 4  # 超采样抗锯齿
    S = size * s
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))

    # 竖向渐变底:上浅下深,再裁成圆角
    grad = Image.new('RGBA', (S, S), ORANGE)
    dg = ImageDraw.Draw(grad)
    for y in range(S):
        t = y / float(S - 1)
        c = tuple(int(ORANGE_LIGHT[i] + (ORANGE[i] - ORANGE_LIGHT[i]) * t) for i in range(3)) + (255,)
        dg.line([(0, y), (S, y)], fill=c)
    mask = Image.new('L', (S, S), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * 0.22), fill=255)
    img.paste(grad, (0, 0), mask)

    d = ImageDraw.Draw(img)
    cx, cy = S // 2, S // 2
    bar_h = int(S * 0.085)
    bar_w = int(S * 0.56)
    plate_w = int(S * 0.105)
    plate_h = int(S * 0.40)
    inner_w = int(S * 0.06)
    inner_h = int(S * 0.30)

    # 杠铃杆
    d.rounded_rectangle([cx - bar_w // 2, cy - bar_h // 2, cx + bar_w // 2, cy + bar_h // 2],
                        radius=bar_h // 2, fill=WHITE)
    for dx in (-1, 1):
        # 外侧配重片
        px = cx + dx * int(S * 0.235)
        d.rounded_rectangle([px - plate_w // 2, cy - plate_h // 2, px + plate_w // 2, cy + plate_h // 2],
                            radius=int(S * 0.03), fill=WHITE)
        # 内侧配重片
        ix = cx + dx * int(S * 0.155)
        d.rounded_rectangle([ix - inner_w // 2, cy - inner_h // 2, ix + inner_w // 2, cy + inner_h // 2],
                            radius=int(S * 0.02), fill=WHITE)
    return img.resize((size, size), Image.LANCZOS)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--android', action='store_true', help='同时铺到 android/res/mipmap-*')
    args = ap.parse_args()

    os.makedirs(OUT, exist_ok=True)
    big = make(512)
    big.save(os.path.join(OUT, 'icon-512.png'))
    big.resize((192, 192), Image.LANCZOS).save(os.path.join(OUT, 'icon-192.png'))
    print('icons/icon-192.png + icon-512.png ok')

    if args.android:
        for name, px in DENSITIES.items():
            d = os.path.join(REPO, 'android', 'res', 'mipmap-' + name)
            os.makedirs(d, exist_ok=True)
            big.resize((px, px), Image.LANCZOS).save(os.path.join(d, 'ic_launcher.png'), optimize=True)
        print('android/res/mipmap-* ok (%d 个密度)' % len(DENSITIES))


if __name__ == '__main__':
    main()
