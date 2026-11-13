#!/usr/bin/env python3
"""Numeric layout verification for the rendered share cards.

Run after scripts/render-sample-cards.ts (which writes the samples to
/tmp by default): every design change to src/lib/share-card.ts should
keep this green — positions, brand colors, ink bands, no margin
overflows.
"""

Checks structural invariants pixel-by-pixel (I cannot eyeball the cards in
this environment, so the design is verified programmatically):
  - exact canvas size
  - brand colors land where expected (header, gold bar, paper, rows, medals)
  - every text element leaves ink in its expected band
  - nothing overflows the side margins in the body area
  - podium/standings rows are where the layout math says they are

Event card rows (game baseline 406, sinhala 464, chips 506-564,
podium 604/760/916 h140, strip label 1118/line 1168, footer
divider 1234, label 1292, track 1318-1328, wordmark 1390, bottom 1434).
Standings rows start 384, h 112, gap 14 (stride 126); footer divider
1156 (6 rows), label 1214, track 1240-1250, wordmark 1311, bottom 1356.
"""
from PIL import Image
import sys

W = 1080
M = 64
failures = []
passed = 0

def check(name, cond, detail=""):
    global passed
    if cond:
        passed += 1
        print(f"  ok  {name}")
    else:
        failures.append(name)
        print(f"  FAIL {name}  {detail}")

def px(img, x, y):
    return img.getpixel((x, y))

def near(c1, c2, tol=42):
    return all(abs(a - b) <= tol for a, b in zip(c1[:3], c2[:3]))

def band_ink(img, x0, y0, x1, y1, bg, tol=40):
    """min_x, max_x, count of pixels differing from bg in a region."""
    mn, mx, cnt = None, None, 0
    p = img.convert("RGB")
    for yy in range(y0, min(y1, img.height)):
        for xx in range(x0, min(x1, img.width)):
            if not near(p.getpixel((xx, yy)), bg, tol):
                cnt += 1
                if mn is None or xx < mn: mn = xx
                if mx is None or xx > mx: mx = xx
    return mn, mx, cnt

def region_is(img, x0, y0, x1, y1, color, tol=30, sample=7):
    """True if a sparse grid of the region is all ~color."""
    p = img.convert("RGB")
    pts = 0
    bad = 0
    for yy in range(y0, y1, max(1, (y1 - y0) // sample)):
        for xx in range(x0, x1, max(1, (x1 - x0) // sample)):
            pts += 1
            if not near(p.getpixel((xx, yy)), color, tol):
                bad += 1
    return bad == 0, f"{bad}/{pts} off-color pixels (e.g. {p.getpixel((x0 + 5, y0 + 5))} vs {color})"

PAPER = (0xF7, 0xFA, 0xF7)
CARD = (0xFF, 0xFF, 0xFF)
STROKE = (0xE4, 0xEA, 0xE6)
GOLDMID = (0xE7, 0xC2, 0x38)      # gold gradient midpoint
SILVERMID = (0xBB, 0xC5, 0xC0)
BRONZEMID = (0xC2, 0x85, 0x4D)
EMERALDHEAD = (0x07, 0x70, 0x48)  # header gradient midpoint
TRACK = STROKE

# ── event card ───────────────────────────────────────────────
print("event card (/tmp/sample-event.jpg)")
img = Image.open("/tmp/sample-event.jpg")
check("event size 1080 x 1434", img.size == (1080, 1434), img.size)
check("header is emerald", near(px(img, 540, 20), EMERALDHEAD, 60), px(img, 540, 20))
check("gold bar under header", near(px(img, 540, 319), (0xEA, 0xC6, 0x30), 55), px(img, 540, 319))

# header text bands
mn, mx, cnt = band_ink(img, 40, 88, 1000, 130, EMERALDHEAD, 60)
check("eyebrow ink present in band y88-130", cnt > 150, (mn, mx, cnt))
check("eyebrow letter-spacing applied (extent > 260px)", mx and (mx - mn) > 260, (mn, mx))
mn, mx, cnt = band_ink(img, 40, 130, 1040, 200, EMERALDHEAD, 60)
check("tournament title ink present", cnt > 700, (mn, mx, cnt))
mn, mx, cnt = band_ink(img, 40, 215, 1000, 262, EMERALDHEAD, 60)
check("organizer ink present", cnt > 100, (mn, mx, cnt))

# body
ok, d = region_is(img, 400, 330, 680, 352, PAPER, 25)
check("breathing room after gold bar", ok, d)
mn, mx, cnt = band_ink(img, M, 352, 1040, 414, PAPER, 35)
check("game name ink present", cnt > 800, (mn, mx, cnt))
mn, mx, cnt = band_ink(img, M, 420, 1040, 476, PAPER, 35)
check("sinhala subtitle ink present", cnt > 400, (mn, mx, cnt))

# chips (outline) — strokes around y506-564
mn, mx, cnt = band_ink(img, M, 492, 1040, 580, PAPER, 25)
check("chips ink present", cnt > 200, (mn, mx, cnt))

# podium rows 604..1044
for i, (rowtop, badge, label) in enumerate([
    (604, GOLDMID, "gold"), (760, SILVERMID, "silver"), (916, BRONZEMID, "bronze")
]):
    ok, d = region_is(img, 300, rowtop + 8, 700, rowtop + 132, CARD, 12)
    check(f"podium row {i+1} is white card", ok, d)
    # probe above the numeral (numeral cap starts ~cy-15), inside the coin (r=42)
    c = px(img, 136, rowtop + 70 - 28)
    check(f"podium row {i+1} medal is {label}", near(c, badge, 60), c)
    mn, mx, cnt = band_ink(img, M, rowtop + 30, 1040, rowtop + 70, CARD, 30)
    check(f"podium row {i+1} center name ink", cnt > 150, (mn, mx, cnt))
    mn, mx, cnt = band_ink(img, 900, rowtop + 40, 1000, rowtop + 96, CARD, 30)
    check(f"podium row {i+1} points ink right-aligned", cnt > 60 and mx and mx > 930, (mn, mx, cnt))

# nothing overflows the right margin in the body
_, mx, _ = band_ink(img, 1030, 340, 1080, 1190, PAPER, 30)
check("no ink beyond right margin in body", mx is None, mx)

# standings strip (label 1102, line 1152)
mn, mx, cnt = band_ink(img, M, 1076, 1040, 1112, PAPER, 35)
check("overall standings label ink", cnt > 100, (mn, mx, cnt))
mn, mx, cnt = band_ink(img, M, 1124, 1040, 1166, PAPER, 35)
check("overall standings line ink", cnt > 300, (mn, mx, cnt))

# footer (divider 1234, label 1292, track 1318-1328, wordmark/date 1390)
mn, mx, cnt = band_ink(img, M, 1262, 1040, 1302, PAPER, 35)
check("progress label ink", cnt > 150, (mn, mx, cnt))
check("progress track present", near(px(img, 900, 1323), TRACK, 30), px(img, 900, 1323))
check("progress fill emerald", near(px(img, 150, 1323), (0x08, 0x90, 0x5B), 55), px(img, 150, 1323))
mn, mx, cnt = band_ink(img, M, 1352, 1040, 1392, PAPER, 35)
check("wordmark + date ink", cnt > 150, (mn, mx, cnt))

# ── standings card ───────────────────────────────────────────
print("standings card (/tmp/sample-standings.jpg)")
img = Image.open("/tmp/sample-standings.jpg")
check("standings size", img.size == (1080, 1356), img.size)
check("header is emerald", near(px(img, 540, 20), EMERALDHEAD, 60), px(img, 540, 20))
check("gold bar under header", near(px(img, 540, 319), (0xEA, 0xC6, 0x30), 55), px(img, 540, 319))

mn, mx, cnt = band_ink(img, 40, 88, 1000, 130, EMERALDHEAD, 60)
check("eyebrow ink present", cnt > 150, (mn, mx, cnt))

# rows at 384 + n*126 (h 112, gap 14); badge cx=126 cy=row+56 r=36
rowtops = [384 + i * 126 for i in range(6)]
for i, rowtop in enumerate(rowtops):
    ok, d = region_is(img, 300, rowtop + 8, 700, rowtop + 104, CARD, 12)
    check(f"standings row {i+1} is white card", ok, d)
    # probe above the numeral, inside the coin (r=36)
    c = px(img, 126, rowtop + 56 - 24)
    if i < 3:
        expected = [GOLDMID, SILVERMID, BRONZEMID][i]
        check(f"standings row {i+1} medal color", near(c, expected, 65), c)
    else:
        mn, mx, cnt = band_ink(img, M + 20, rowtop + 20, M + 110, rowtop + 92, CARD, 30)
        check(f"standings row {i+1} rank numeral ink", cnt > 40, (mn, mx, cnt))
    mn, mx, cnt = band_ink(img, M, rowtop + 16, 1040, rowtop + 56, CARD, 30)
    check(f"standings row {i+1} name ink", cnt > 100, (mn, mx, cnt))
    mn, mx, cnt = band_ink(img, 890, rowtop + 28, 1000, rowtop + 84, CARD, 30)
    check(f"standings row {i+1} total points ink", cnt > 50, (mn, mx, cnt))
mn, mx, _ = band_ink(img, 1030, 340, 1080, 1130, PAPER, 30)
check("no ink beyond right margin in standings body", mx is None, mx)

# footer (divider 1156, label 1214, track 1240-1250, wordmark/date 1311)
mn, mx, cnt = band_ink(img, M, 1184, 1040, 1224, PAPER, 35)
check("progress label ink", cnt > 150, (mn, mx, cnt))
check("progress track present", near(px(img, 900, 1245), TRACK, 30), px(img, 900, 1245))
check("progress fill emerald", near(px(img, 150, 1245), (0x08, 0x90, 0x5B), 55), px(img, 150, 1245))
mn, mx, cnt = band_ink(img, M, 1273, 1040, 1313, PAPER, 35)
check("wordmark + date ink", cnt > 150, (mn, mx, cnt))

print()
print(f"layout check: {passed} passed · {len(failures)} failed")
if failures:
    print("failures:", ", ".join(failures))
    sys.exit(1)
