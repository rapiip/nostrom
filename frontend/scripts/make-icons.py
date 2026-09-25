"""
One-shot: turn the supplied brand PNG into the icon assets the app needs.

- Crops to the white mark, squares it with even padding.
- Emits raster icons (favicon.ico, apple-touch, PWA 192/512, OG) on the brand
  ink background so they read on any OS chrome.
- Vectorises the mark to a single monochrome SVG path so the in-app <Logo>
  component can inherit currentColor (green/amber/red status theming).
"""
import json
from PIL import Image, ImageOps

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

# ---- Vectorise to SVG path (marching squares on the mask) ----
# Downscale the mask for a manageable contour, then trace boundaries.
V = 200
vm = sq_mask.resize((V, V), Image.LANCZOS).point(lambda p: 1 if p > 128 else 0)
px = vm.load()

def get(x, y):
    if 0 <= x < V and 0 <= y < V:
        return px[x, y]
    return 0

# Trace outlines using a simple boundary-following (Moore neighborhood).
visited = set()
paths = []
dirs = [(1, 0), (1, 1), (0, 1), (-1, 1), (-1, 0), (-1, -1), (0, -1), (1, -1)]

def is_edge(x, y):
    if get(x, y) != 1:
        return False
    return any(get(x + dx, y + dy) == 0 for dx, dy in [(1, 0), (-1, 0), (0, 1), (0, -1)])

for sy in range(V):
    for sx in range(V):
        if is_edge(sx, sy) and (sx, sy) not in visited:
            contour = []
            cx, cy = sx, sy
            b = 0
            start = (sx, sy)
            steps = 0
            while steps < V * V * 4:
                contour.append((cx, cy))
                visited.add((cx, cy))
                found = False
                for i in range(8):
                    d = (b + i) % 8
                    nx, ny = cx + dirs[d][0], cy + dirs[d][1]
                    if get(nx, ny) == 1:
                        b = (d + 5) % 8
                        cx, cy = nx, ny
                        found = True
                        break
                steps += 1
                if not found or (cx, cy) == start and len(contour) > 2:
                    break
            if len(contour) > 8:
                paths.append(contour)

def simplify(pts, tol=1.2):
    if len(pts) < 3:
        return pts
    out = [pts[0]]
    for p in pts[1:]:
        if abs(p[0] - out[-1][0]) + abs(p[1] - out[-1][1]) >= tol:
            out.append(p)
    return out

sc = 64.0 / V
segs = []
for c in paths:
    c = simplify(c)
    if len(c) < 3:
        continue
    d = "M" + " L".join(f"{x*sc:.2f} {y*sc:.2f}" for x, y in c) + " Z"
    segs.append(d)

svg_path = " ".join(segs)
with open(f"{PUB}/_logo_path.txt", "w") as f:
    f.write(svg_path)

print("raster: icon-512/192, apple-touch, icon.ico, og.png")
print("square side px:", side, "contours:", len(segs), "path chars:", len(svg_path))
