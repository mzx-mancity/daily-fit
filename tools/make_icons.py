# -*- coding: utf-8 -*-
"""生成 PWA 图标:绿色圆角底 + 白色杠铃。需要 Pillow。用法: python make_icons.py"""
import os
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, '..', 'icons'))
os.makedirs(OUT, exist_ok=True)

GREEN = (34, 197, 94, 255)
WHITE = (255, 255, 255, 255)

def make(size):
    s = 4  # supersample for antialiasing
    S = size * s
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * 0.22), fill=GREEN)
    cx, cy = S // 2, S // 2
    bar_h = int(S * 0.085)
    bar_w = int(S * 0.56)
    plate_w = int(S * 0.105)
    plate_h = int(S * 0.40)
    inner_w = int(S * 0.06)
    inner_h = int(S * 0.30)
    d.rounded_rectangle([cx - bar_w // 2, cy - bar_h // 2, cx + bar_w // 2, cy + bar_h // 2],
                        radius=bar_h // 2, fill=WHITE)
    for dx in (-1, 1):
        px = cx + dx * int(S * 0.235)
        d.rounded_rectangle([px - plate_w // 2, cy - plate_h // 2, px + plate_w // 2, cy + plate_h // 2],
                            radius=int(S * 0.03), fill=WHITE)
        ix = cx + dx * int(S * 0.155)
        d.rounded_rectangle([ix - inner_w // 2, cy - inner_h // 2, ix + inner_w // 2, cy + inner_h // 2],
                            radius=int(S * 0.02), fill=WHITE)
    return img.resize((size, size), Image.LANCZOS)

for sz in (192, 512):
    make(sz).save(os.path.join(OUT, 'icon-%d.png' % sz))
    print('icon-%d.png ok' % sz)
