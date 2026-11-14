#!/usr/bin/env python3
"""Numeric layout verification for the rendered share cards.

Run after scripts/render-sample-cards.ts (which writes the samples to
/tmp by default): every design change to src/lib/share-card.ts should
keep this green — positions, brand colors, ink bands, no margin
overflows.

Checks structural invariants pixel-by-pixel (the design is verified
programmatically; VLM reviews are subjective, this is not):

"liquid glass night" palette anchors:
  - night-sky background gradient (#1A1C25 -> #12131A)
  - glass panels (#2D3345-ish body, top-bright gradient edge,
    specular rim) at their exact layout positions
  - gold / silver / bronze medal coins, outlined chips, neutral coins
  - steel-blue progress fill, hairline dividers
  - every text element leaves ink in its expected band
  - no text-like ink beyond the side margins (starfield dots are
    allowed; ink-bright pixels are not)

Event card (with Sinhala subtitle): eyebrow 124, title 188, organizer
250, hairline 292, game 370, sinhala 428, chips 470..528, podium rows
564/720/876 h140, strip label 1078 / line 1128, footer divider 1194,
label 1252, track 1278-1288, wordmark 1336, bottom 1394. With the
guest link the WATCH LIVE pill sits at 1186..1278 (H 1520).
Standings rows start 340, h 112, stride 126 (7 rows); footer divider
1238 (H 1438); live variant pill 1230..1322 (H 1564).
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
    for yy in range(y0, min(y1, p.height)):
        for xx in range(x0, min(x1, p.width)):
            if not near(p.getpixel((xx, yy)), bg, tol):
                cnt += 1
                if mn is None or xx < mn: mn = xx
                if mx is None or xx > mx: mx = xx
    return mn, mx, cnt

def band_bright(img, x0, y0, x1, y1, floor):
    """count of ink-bright pixels (text-like, brighter than any star)."""
    p = img.convert("RGB")
    return sum(
        1
        for yy in range(y0, min(y1, p.height))
        for xx in range(x0, min(x1, p.width))
        if max(p.getpixel((xx, yy))) > floor
    )

def region_is(img, x0, y0, x1, y1, color, tol=18, sample=7):
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

def sky_at(y, h):
    """The night-sky gradient at height y (sampled #1A1C25 -> #12131A)."""
    t = min(1.0, y / max(1, h - 1))
    return tuple(round(a + (b - a) * t) for a, b in zip((26, 28, 37), (18, 19, 26)))

# palette anchors (measured from renders; see share-card.ts)
PANEL = (45, 53, 72)          # glass body composite
EDGE_TOP = (134, 154, 191)    # gradient border, top
GOLD = (232, 190, 54)
SILVER = (214, 220, 216)
BRONZE = (211, 151, 97)
COIN = (120, 132, 170)        # neutral coin stroke
TRACK = (42, 43, 48)          # progress track composite
FILL = (66, 134, 199)         # steel-blue progress fill
PILL = (33, 83, 132)          # WATCH LIVE pill body (upper half)

def check_common_head(img, name):
    """Masthead: eyebrow, title, organizer, hairline — on the sky."""
    sky = sky_at(20, img.height)
    check(f"{name} size", img.size == (1080, EXPECTED[name]), img.size)
    check(f"{name} night sky at top", near(px(img, 900, 20), sky, 18), px(img, 900, 20))
    check(f"{name} night sky at bottom", near(px(img, 60, img.height - 20), sky_at(img.height - 20, img.height), 18), px(img, 60, img.height - 20))
    # eyebrow (accent, letter-spaced caps)
    sky1 = sky_at(114, img.height)
    mn, mx, cnt = band_ink(img, 40, 100, 1000, 132, sky1, 26)
    check(f"{name} eyebrow ink in band y100-132", cnt > 120, (mn, mx, cnt))
    check(f"{name} eyebrow letter-spacing applied (extent > 260px)", mx and (mx - mn) > 260, (mn, mx))
    # title
    mn, mx, cnt = band_ink(img, 40, 148, 1040, 204, sky1, 30)
    check(f"{name} title ink present", cnt > 700, (mn, mx, cnt))
    # organizer
    mn, mx, cnt = band_ink(img, 40, 222, 1000, 262, sky1, 30)
    check(f"{name} organizer ink present", cnt > 100, (mn, mx, cnt))
    # hairline divider
    d = px(img, 540, 292)
    check(f"{name} hairline under masthead", near(d, (40, 42, 50), 16), d)
    # starfield lives in the sky margins (dots are faint but present)
    dots = band_ink(img, 6, 330, 56, img.height - 40, sky_at(700, img.height), 10)[2]
    dots += band_ink(img, 1030, 330, 1076, img.height - 40, sky_at(700, img.height), 10)[2]
    check(f"{name} starfield present in margins", dots > 20, dots)

def check_footer(img, name, divider_y):
    d = px(img, 540, divider_y)
    check(f"{name} footer divider", near(d, (39, 40, 46), 16), d)
    sky = sky_at(divider_y + 50, img.height)
    mn, mx, cnt = band_ink(img, M, divider_y + 30, 1040, divider_y + 74, sky, 26)
    check(f"{name} progress label ink", cnt > 150, (mn, mx, cnt))
    check(f"{name} progress track present", near(px(img, 900, divider_y + 89), TRACK, 14), px(img, 900, divider_y + 89))
    check(f"{name} progress fill steel blue", near(px(img, 150, divider_y + 89), FILL, 40), px(img, 150, divider_y + 89))
    mn, mx, cnt = band_ink(img, M, divider_y + 122, 1040, divider_y + 162, sky, 26)
    check(f"{name} wordmark + date ink", cnt > 150, (mn, mx, cnt))

def check_no_margin_ink(img, name, y0, y1):
    """No text-bright pixels in the side margins (star dots allowed)."""
    left = band_bright(img, 8, y0, 60, y1, 165)
    right = band_bright(img, 1030, y0, 1080, y1, 165)
    check(f"{name} no ink beyond left margin", left == 0, left)
    check(f"{name} no ink beyond right margin", right == 0, right)

def check_podium_row(img, i, rowtop, medal):
    # clean-body probes (no text: name glyphs end x<500, points start x>860,
    # chip lives at y>72 on the left, rim at top+2..5)
    clean = [(540, rowtop + 16), (650, rowtop + 16), (540, rowtop + 36), (750, rowtop + 50), (540, rowtop + 118)]
    bad = [p for p in clean if not near(px(img, *p), PANEL, 16)]
    check(f"podium row {i+1} is glass panel", not bad, [p for p in bad])
    e = px(img, 540, rowtop)
    check(f"podium row {i+1} top edge is lit", near(e, EDGE_TOP, 46), e)
    c = px(img, 136, rowtop + 70 - 28)
    check(f"podium row {i+1} medal is {medal[0]}", near(c, medal[1], 60), c)
    mn, mx, cnt = band_ink(img, 198, rowtop + 26, 1040, rowtop + 66, PANEL, 24)
    check(f"podium row {i+1} center identity ink", cnt > 140, (mn, mx, cnt))
    mn, mx, cnt = band_ink(img, 900, rowtop + 40, 1000, rowtop + 96, PANEL, 24)
    check(f"podium row {i+1} points ink right-aligned", cnt > 60 and mx and mx > 930, (mn, mx, cnt))

def check_watch_pill(img, name, top):
    check(f"{name} pill body upper", near(px(img, 100, top + 10), PILL, 30), px(img, 100, top + 10))
    check(f"{name} pill body lower", near(px(img, 100, top + 84), (23, 71, 111), 30), px(img, 100, top + 84))
    b = px(img, 540, top)
    check(f"{name} pill lit border on top", near(b, (57, 116, 172), 40), b)
    sky = sky_at(top + 46, img.height)
    # play glyph cluster around x=140
    cnt = band_ink(img, 110, top + 24, 175, top + 70, PILL, 40)[2]
    check(f"{name} play glyph present", cnt > 60, cnt)
    # WATCH LIVE label ink
    mn, mx, cnt = band_ink(img, 176, top + 28, 430, top + 64, PILL, 34)
    check(f"{name} label ink present", cnt > 150, (mn, mx, cnt))
    # url ink right of the divider
    mn, mx, cnt = band_ink(img, 430, top + 24, 1020, top + 70, PILL, 34)
    check(f"{name} url ink present", cnt > 80, (mn, mx, cnt))

EXPECTED = {
    "event": 1394,
    "event-partial": 1238,
    "event-live": 1520,
    "standings": 1438,
    "standings-live": 1564,
}

# ── event card ───────────────────────────────────────────────
print("event card (/tmp/sample-event.jpg)")
img = Image.open("/tmp/sample-event.jpg")
check_common_head(img, "event")
sky1 = sky_at(370, img.height)
mn, mx, cnt = band_ink(img, M, 344, 1040, 386, sky1, 26)
check("game name ink present", cnt > 800, (mn, mx, cnt))
mn, mx, cnt = band_ink(img, M, 400, 1040, 436, sky1, 26)
check("sinhala subtitle ink present", cnt > 400, (mn, mx, cnt))
mn, mx, cnt = band_ink(img, M, 462, 1040, 534, sky1, 22)
check("chips ink present", cnt > 200, (mn, mx, cnt))
for i, (rowtop, medal) in enumerate(
    [(564, ("gold", GOLD)), (720, ("silver", SILVER)), (876, ("bronze", BRONZE))]
):
    check_podium_row(img, i, rowtop, medal)
mn, mx, cnt = band_ink(img, M, 1052, 1040, 1086, sky1, 22)
check("overall standings label ink", cnt > 100, (mn, mx, cnt))
mn, mx, cnt = band_ink(img, M, 1104, 1040, 1136, sky1, 22)
check("overall standings line ink", cnt > 300, (mn, mx, cnt))
check_no_margin_ink(img, "event", 330, 1300)
check_footer(img, "event", 1194)

# ── event card with guest link ───────────────────────────────
print("event card + guest link (/tmp/sample-event-live.jpg)")
img = Image.open("/tmp/sample-event-live.jpg")
check_common_head(img, "event-live")
check_watch_pill(img, "event-live", 1186)
check_footer(img, "event-live", 1320)

# ── partial podium event card ────────────────────────────────
print("partial event card (/tmp/sample-event-partial.jpg)")
img = Image.open("/tmp/sample-event-partial.jpg")
check_common_head(img, "event-partial")
clean = [(540, 574 + 16), (650, 574 + 16), (540, 594), (750, 608), (540, 676)]
bad = [p for p in clean if not near(px(img, *p), PANEL, 16)]
check("partial row 1 is glass panel", not bad, bad)
clean = [(540, 730 + 16), (650, 730 + 16), (540, 750), (750, 764), (540, 832)]
bad = [p for p in clean if not near(px(img, *p), PANEL, 16)]
check("partial row 2 is glass panel", not bad, bad)

# ── standings card ───────────────────────────────────────────
print("standings card (/tmp/sample-standings.jpg)")
img = Image.open("/tmp/sample-standings.jpg")
check_common_head(img, "standings")
rowtops = [340 + i * 126 for i in range(7)]
for i, rowtop in enumerate(rowtops):
    clean = [(540, rowtop + 14), (650, rowtop + 14), (540, rowtop + 30), (750, rowtop + 44), (540, rowtop + 100)]
    bad = [p for p in clean if not near(px(img, *p), PANEL, 16)]
    check(f"standings row {i+1} is glass panel", not bad, [p for p in bad])
    if i < 3:
        c = px(img, 126, rowtop + 56 - 24)
        expected = [GOLD, SILVER, BRONZE][i]
        check(f"standings row {i+1} medal color", near(c, expected, 65), c)
    else:
        c = px(img, 126, rowtop + 56 - 36)
        check(f"standings row {i+1} neutral coin stroke", near(c, COIN, 46), c)
        mn, mx, cnt = band_ink(img, M + 20, rowtop + 20, M + 110, rowtop + 92, PANEL, 26)
        check(f"standings row {i+1} rank numeral ink", cnt > 40, (mn, mx, cnt))
    mn, mx, cnt = band_ink(img, 176, rowtop + 16, 1040, rowtop + 56, PANEL, 26)
    check(f"standings row {i+1} name ink", cnt > 100, (mn, mx, cnt))
    mn, mx, cnt = band_ink(img, 890, rowtop + 28, 1000, rowtop + 84, PANEL, 26)
    check(f"standings row {i+1} total points ink", cnt > 50, (mn, mx, cnt))
check_no_margin_ink(img, "standings", 320, 1200)
check_footer(img, "standings", 1238)

# ── standings card with guest link ───────────────────────────
print("standings card + guest link (/tmp/sample-standings-live.jpg)")
img = Image.open("/tmp/sample-standings-live.jpg")
check_common_head(img, "standings-live")
check_watch_pill(img, "standings-live", 1230)
check_footer(img, "standings-live", 1364)

print()
print(f"layout check: {passed} passed · {len(failures)} failed")
if failures:
    print("failures:", ", ".join(failures))
    sys.exit(1)
