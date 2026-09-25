"""
One-shot: turn the supplied brand PNG into the raster icon assets the app needs.

- Crops to the white mark, squares it with even padding.
- Emits raster icons (favicon.ico, apple-touch, PWA 192/512, OG) on the brand
  ink background so they read on any OS chrome.

The in-app <Logo> SVG is produced separately by scripts/vectorise-logo.py.
"""
from PIL import Image

SRC = r"D:\Downloads\ChatGPT Image 22 Sep 2026, 13.29.14.png"
PUB = r"D:\VScode\botchain\frontend\public"
INK = (8, 9, 10)  # #08090A, matches theme-color / favicon background

im = Image.open(SRC).convert("RGBA")
gray = im.convert("L")
mask = gray.point(lambda p: 255 if p > 110 else 0)  # white mark vs near-black bg
bbox = mask.getbbox()
mark = im.crop(bbox)
mask_c = mask.crop(bbox)
w, h = mark.size

# Square canvas with padding (mark centered).
pad = int(max(w, h) * 0.28)
side = max(w, h) + pad * 2
sq_mask = Image.new("L", (side, side), 0)
ox, oy = (side - w) // 2, (side - h) // 2
sq_mask.paste(mask_c, (ox, oy))

# White mark on transparent (for flexible reuse / apple-touch on ink).
white = Image.new("RGBA", (side, side), (255, 255, 255, 0))
white.putalpha(sq_mask)
white_rgb = Image.new("RGBA", (side, side), (255, 255, 255, 255))
white_rgb.putalpha(sq_mask)

def on_ink(size):
    base = Image.new("RGBA", (side, side), INK + (255,))
    base.paste(white_rgb, (0, 0), sq_mask)
    return base.resize((size, size), Image.LANCZOS)

# Raster outputs.
on_ink(512).save(f"{PUB}/icon-512.png")
on_ink(192).save(f"{PUB}/icon-192.png")
on_ink(180).save(f"{PUB}/apple-touch-icon.png")
on_ink(256).save(f"{PUB}/icon.ico",
                 sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])

# OG image 1200x630 on ink, mark centered ~ 300px tall.
og = Image.new("RGBA", (1200, 630), INK + (255,))
scale = 300 / side
mk = white_rgb.resize((int(side * scale), int(side * scale)), Image.LANCZOS)
og.alpha_composite(mk, ((1200 - mk.width) // 2, (630 - mk.height) // 2))
og.convert("RGB").save(f"{PUB}/og.png")

# ---- SVG ----
# The in-app <Logo> path is NOT generated here. Vectorising lives in
# scripts/vectorise-logo.py, which traces at full resolution and simplifies with
# Douglas-Peucker; the marching-squares tracer that used to sit in this file
# sampled at 200px and thinned by dropping nearby points, turning every straight
# edge of the mark into a 1px staircase.

print("raster: icon-512/192, apple-touch, icon.ico, og.png")
print("square side px:", side)
print("svg: run scripts/vectorise-logo.py")

