"""
Vectorise the brand mark into a clean, high-fidelity SVG path.

Supersedes the crude tracer that used to live in make-icons.py, which sampled the
mask at 200px and "simplified" it by dropping points closer than a fixed step.
That produced a 200+ vertex staircase: every straight edge of the mark arrived as
a flight of 1px steps, which is why the rendered logo looked lumpy.

This traces the mask at full resolution and then runs Douglas-Peucker. The mark is
composed entirely of straight edges, so a proper perpendicular-distance simplify
collapses each edge back to its two true endpoints instead of approximating it.
Holes are detected as background components that do not touch the border, so the
notch between the N's left stem and its diagonal survives.

Fidelity is measured, not assumed: the simplified polygons are rasterised back and
compared to the source mask by intersection-over-union.

    python scripts/vectorise-logo.py
"""
from collections import deque

from PIL import Image, ImageDraw

SRC = r"D:\Downloads\ChatGPT Image 22 Sep 2026, 13.29.14.png"
THRESHOLD = 110  # white mark vs near-black background
EPSILON = 0.8  # px, at source resolution
VIEW_W = 64.0  # target viewBox width

# ---------------------------------------------------------------- load + clean

im = Image.open(SRC).convert("L")
mask = im.point(lambda p: 255 if p > THRESHOLD else 0)
bbox = mask.getbbox()
m = mask.crop(bbox)
W, H = m.size
src = m.load()

grid = [[1 if src[x, y] else 0 for x in range(W)] for y in range(H)]


def neighbours4(x, y):
    yield x + 1, y
    yield x - 1, y
    yield x, y + 1
    yield x, y - 1


def components(value):
    """Connected components of cells equal to `value`, 4-connected."""
    seen = [[False] * W for _ in range(H)]
    out = []
    for sy in range(H):
        for sx in range(W):
            if grid[sy][sx] != value or seen[sy][sx]:
                continue
            q = deque([(sx, sy)])
            seen[sy][sx] = True
            cells = []
            touches_border = False
            while q:
                x, y = q.popleft()
                cells.append((x, y))
                if x in (0, W - 1) or y in (0, H - 1):
                    touches_border = True
                for nx, ny in neighbours4(x, y):
                    if 0 <= nx < W and 0 <= ny < H and not seen[ny][nx] and grid[ny][nx] == value:
                        seen[ny][nx] = True
                        q.append((nx, ny))
            out.append({"cells": cells, "border": touches_border})
    return out


# Drop specks: the source is a generated raster with slight edge noise.
fg = [c for c in components(1) if len(c["cells"]) >= 40]
for c in components(1):
    if len(c["cells"]) < 40:
        for x, y in c["cells"]:
            grid[y][x] = 0

holes = [c for c in components(0) if not c["border"] and len(c["cells"]) >= 40]

print(f"source {im.size}  bbox {bbox}  mark {W}x{H}  aspect {W / H:.4f}")
print(f"foreground components: {len(fg)}   enclosed holes: {len(holes)}")

# ---------------------------------------------------------------- trace

# Moore-neighbour boundary following, clockwise, starting from the west.
DIRS = [(-1, 0), (-1, -1), (0, -1), (1, -1), (1, 0), (1, 1), (0, 1), (-1, 1)]


def at(x, y, value):
    if 0 <= x < W and 0 <= y < H:
        return grid[y][x] == value
    return False if value == 1 else True


def trace(cells, value):
    """Boundary pixels of one component, in order."""
    start = min(cells, key=lambda p: (p[1], p[0]))
    contour = [start]
    cx, cy = start
    # Entered the start pixel from the west.
    back = 0
    guard = 0
    while guard < 8 * len(cells) + 1000:
        guard += 1
        # Search clockwise from just after the backtrack direction.
        for i in range(1, 9):
            d = (back + i) % 8
            dx, dy = DIRS[d]
            nx, ny = cx + dx, cy + dy
            if at(nx, ny, value):
                back = (d + 4 + 1) % 8  # face back towards where we came from
                cx, cy = nx, ny
                break
        else:
            break
        if (cx, cy) == start:
            break
        contour.append((cx, cy))
    return contour


def perp(p, a, b):
    (px_, py_), (ax, ay), (bx, by) = p, a, b
    dx, dy = bx - ax, by - ay
    if dx == 0 and dy == 0:
        return ((px_ - ax) ** 2 + (py_ - ay) ** 2) ** 0.5
    t = ((px_ - ax) * dx + (py_ - ay) * dy) / (dx * dx + dy * dy)
    t = max(0.0, min(1.0, t))
    return ((px_ - (ax + t * dx)) ** 2 + (py_ - (ay + t * dy)) ** 2) ** 0.5


def rdp(pts, eps):
    if len(pts) < 3:
        return list(pts)
    worst, idx = 0.0, 0
    for i in range(1, len(pts) - 1):
        d = perp(pts[i], pts[0], pts[-1])
        if d > worst:
            worst, idx = d, i
    if worst <= eps:
        return [pts[0], pts[-1]]
    return rdp(pts[: idx + 1], eps)[:-1] + rdp(pts[idx:], eps)


def simplify_closed(contour, eps):
    """RDP on a closed ring: split at the two extreme points so the seam is a
    real vertex rather than wherever the trace happened to start."""
    if len(contour) < 4:
        return list(contour)
    a = min(range(len(contour)), key=lambda i: (contour[i][0], contour[i][1]))
    far = max(range(len(contour)), key=lambda i: (contour[i][0] - contour[a][0]) ** 2
              + (contour[i][1] - contour[a][1]) ** 2)
    lo, hi = min(a, far), max(a, far)
    first = rdp(contour[lo:hi + 1], eps)
    second = rdp(contour[hi:] + contour[:lo + 1], eps)
    ring = first[:-1] + second[:-1]
    return ring


rings = []
for c in fg:
    rings.append(simplify_closed(trace(c["cells"], 1), EPSILON))
for c in holes:
    rings.append(simplify_closed(trace(c["cells"], 0), EPSILON))

print("vertices per ring:", [len(r) for r in rings])

# ---------------------------------------------------------------- verify (IoU)

check = Image.new("L", (W, H), 0)
d = ImageDraw.Draw(check)
for i, r in enumerate(rings):
    d.polygon([(x, y) for x, y in r], fill=(0 if i >= len(fg) else 255))
cp = check.load()
inter = union = 0
for y in range(H):
    for x in range(W):
        a, b = grid[y][x] == 1, cp[x, y] > 127
        if a or b:
            union += 1
        if a and b:
            inter += 1
iou = inter / union if union else 0.0
print(f"IoU vs source mask: {iou * 100:.3f}%  (eps={EPSILON}px)")

# ---------------------------------------------------------------- emit

scale = VIEW_W / W
vh = H * scale


def fmt(v):
    return f"{v:.2f}".rstrip("0").rstrip(".")


subpaths = []
for r in rings:
    pts = [(x * scale, y * scale) for x, y in r]
    subpaths.append("M" + "L".join(f"{fmt(x)} {fmt(y)}" for x, y in pts) + "Z")

path = "".join(subpaths)
print(f"\nviewBox 0 0 {fmt(VIEW_W)} {fmt(vh)}")
print(f"path chars: {len(path)}")
print("\n" + path)
