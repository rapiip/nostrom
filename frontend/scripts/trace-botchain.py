"""
Vectorise the official BOT Chain "B" mark to a single SVG path so it can be
embedded as a component and recoloured. Source artwork: botchain.ai/logo.png
(the standalone symbol). Brand green is #10A37F.

Also emits a trimmed PNG of the mark on transparent, in case a raster is wanted.
"""
import re
from PIL import Image

SRC = r"D:\VScode\botchain\frontend\_botchain_logos\logo.png"
OUT = r"D:\VScode\botchain\frontend\_botchain_logos"

im = Image.open(SRC).convert("RGBA")
px = im.load()
w, h = im.size

# Mask = the green glyph.
mask = Image.new("L", (w, h), 0)
mp = mask.load()
for y in range(h):
    for x in range(w):
        r, g, b, a = px[x, y]
        mp[x, y] = 255 if (a > 150 and g > 90 and g >= r) else 0

bbox = mask.getbbox()
mask = mask.crop(bbox)
mw, mh = mask.size

# Trace at native-ish res into a 100-tall viewBox for a clean path.
V = 120
scale_h = V / mh
vw = int(mw * scale_h)
vm = mask.resize((vw, V), Image.LANCZOS).point(lambda p: 1 if p > 128 else 0)
gp = vm.load()

def get(x, y):
    if 0 <= x < vw and 0 <= y < V:
        return gp[x, y]
    return 0

def is_edge(x, y):
    if get(x, y) != 1:
        return False
    return any(get(x + dx, y + dy) == 0 for dx, dy in [(1, 0), (-1, 0), (0, 1), (0, -1)])

dirs = [(1, 0), (1, 1), (0, 1), (-1, 1), (-1, 0), (-1, -1), (0, -1), (1, -1)]
visited = set()
paths = []
for sy in range(V):
    for sx in range(vw):
        if is_edge(sx, sy) and (sx, sy) not in visited:
            contour = []
            cx, cy = sx, sy
            b = 0
            start = (sx, sy)
            steps = 0
            while steps < vw * V * 4:
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
                if not found or ((cx, cy) == start and len(contour) > 2):
                    break
            if len(contour) > 8:
                paths.append(contour)

def simplify(pts, tol=1.4):
    out = [pts[0]]
    for p in pts[1:]:
        if abs(p[0] - out[-1][0]) + abs(p[1] - out[-1][1]) >= tol:
            out.append(p)
    return out

segs = []
for c in paths:
    c = simplify(c)
    if len(c) < 3:
        continue
    d = "M" + " ".join(f"{x:.1f} {y:.1f}" for x, y in c) + "Z"
    segs.append(d)

path = " ".join(segs)
with open(f"{OUT}/_botB_path.txt", "w") as f:
    f.write(path)

# Trimmed transparent raster of the green mark, for optional raster use.
green = Image.new("RGBA", (mw, mh), (16, 163, 127, 0))
green.putalpha(mask)
solid = Image.new("RGBA", (mw, mh), (16, 163, 127, 255))
solid.putalpha(mask)
solid.save(f"{OUT}/botchain-mark.png")

print("viewBox 0 0", vw, V, "contours:", len(segs), "chars:", len(path))
