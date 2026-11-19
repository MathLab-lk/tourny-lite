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
  - gold / silver / bronze medal coins and pedestals, outlined
    chips, neutral coins
  - steel-blue progress fill, hairline dividers
  - every text element leaves ink in its expected band
  - no text-like ink beyond the side margins (starfield dots are
    allowed; ink-bright pixels are not)

The two broadcasts carry deliberately different silhouettes — the
checker pins both:

Event card = the podium. Header: eyebrow 124, game 190, sinhala 248,
context 300, hairline 346, chips 402..460. Stage panel 490..1114
(6 centers seeded, full podium): pedestals gold 395..684 x 862..1074
(h 212), silver 90..379 x 920..1074 (h 154), bronze 710..999 x
954..1074 (h 120), floor line 1082, coins/identity stacked above
each pedestal (positions follow the content, so coins are located by
color scan). Overall line 1168/1218, footer divider 1284 (H 1484);
live variant: pill 1276..1368, footer divider 1410 (H 1610).

Standings card = the classification table. Masthead: eyebrow 124,
title 188, organizer 250, hairline 292. One panel 340..1030 with
header row (labels 384, divider 404) and 6 hairline rows h 104
(rowtops 406/510/614/718/822/926): medal coin cx 110, identity
152..640, G/S/B columns 676/754/832, points right-aligned to 986,
leader gold tab x 69. Footer divider 1060 (H 1260); live variant:
pill 1052..1144, footer divider 1186 (H 1386).

event-partial.jpg (a podium with empty places) is checked when the
seed data produces one; the canonical seed has none, so it is
skipped there.

Positions assume the canonical demo data (bun scripts/seed.ts —
6 centers, full podiums).
"""
from PIL import Image
import os
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

def color_count(img, x0, y0, x1, y1, color, tol=55):
    """count of pixels ~color in a region (locating movable elements)."""
    p = img.convert("RGB")
    return sum(
        1
        for yy in range(y0, min(y1, p.height))
        for xx in range(x0, min(x1, p.width))
        if near(p.getpixel((xx, yy)), color, tol)
    )

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

def check_stage_panel(img, name, top, bottom):
    """The podium stage: one glass panel under the three columns."""
    e = px(img, 540, top)
    check(f"{name} stage panel top edge is lit", near(e, EDGE_TOP, 46), e)
    clean = [(200, top + 30), (860, top + 30), (200, top + 60), (860, top + 60)]
    bad = [p for p in clean if not near(px(img, *p), PANEL, 20)]
    check(f"{name} stage panel is glass body", not bad, bad)

def check_pedestal(img, name, x0, x1, py, ph, color, label):
    """A rank pedestal: gradient body, ring stroke, specular rim."""
    body = px(img, x0 + 45, py + int(ph * 0.72))
    check(f"{name} {label} pedestal body", near(body, color, 70), body)
    rim = px(img, (x0 + x1) // 2, py + 5)
    check(f"{name} {label} pedestal specular rim", max(rim) > 150 and near(rim, (color[0], color[1], color[2]), 90), rim)
    stroke = px(img, x0 + 1, py + ph // 2)
    check(f"{name} {label} pedestal ring stroke", near(stroke, color, 80), stroke)

def check_coin(img, name, x0, x1, y0, y1, color, label):
    """The medal coin above a pedestal — located by color scan, since
    its height follows the identity stack above the pedestal."""
    cnt = color_count(img, x0, y0, x1, y1, color, 55)
    check(f"{name} {label} coin present above pedestal", cnt > 40, cnt)

EXPECTED = {
    "event": 1484,
    "event-live": 1610,
    "standings": 1260,
    "standings-live": 1386,
}

# ── event card (the podium) ──────────────────────────────────
print("event card (/tmp/sample-event.jpg)")
img = Image.open("/tmp/sample-event.jpg")
check_common_head(img, "event")
sky1 = sky_at(370, img.height)
# game hero (the event is the story), sinhala line, context line
mn, mx, cnt = band_ink(img, M, 150, 1040, 212, sky1, 26)
check("game name ink present", cnt > 800, (mn, mx, cnt))
mn, mx, cnt = band_ink(img, M, 214, 1040, 262, sky1, 26)
check("sinhala subtitle ink present", cnt > 400, (mn, mx, cnt))
mn, mx, cnt = band_ink(img, M, 266, 1040, 312, sky1, 26)
check("context line ink present", cnt > 300, (mn, mx, cnt))
d = px(img, 540, 346)
check("hairline under event header", near(d, (40, 42, 50), 16), d)
mn, mx, cnt = band_ink(img, M, 390, 1040, 472, sky1, 22)
check("chips ink present", cnt > 200, (mn, mx, cnt))

# the stage: panel + three pedestals, bases on one floor
check_stage_panel(img, "event", 490, 1114)
check_pedestal(img, "event", 395, 684, 862, 212, GOLD, "gold")
check_pedestal(img, "event", 90, 379, 920, 154, SILVER, "silver")
check_pedestal(img, "event", 710, 999, 954, 120, BRONZE, "bronze")
# gap between the pedestals shows panel, not a fourth column
g = px(img, 388, 1050)
check("gap between pedestals is panel", near(g, PANEL, 20), g)
# the floor hairline the pedestals stand on
f = px(img, 540, 1082)
check("stage floor line", near(f, (56, 63, 82), 24), f)
# coins above each pedestal (height follows the identity stack)
check_coin(img, "event", 460, 620, 540, 700, GOLD, "gold")
check_coin(img, "event", 155, 315, 620, 760, SILVER, "silver")
check_coin(img, "event", 775, 935, 680, 820, BRONZE, "bronze")
# identity + points ink in each column
mn, mx, cnt = band_ink(img, 400, 700, 680, 850, PANEL, 22)
check("gold column identity ink", cnt > 250, (mn, mx, cnt))
mn, mx, cnt = band_ink(img, 95, 760, 375, 912, PANEL, 22)
check("silver column identity ink", cnt > 200, (mn, mx, cnt))
mn, mx, cnt = band_ink(img, 715, 790, 995, 945, PANEL, 22)
check("bronze column identity ink", cnt > 200, (mn, mx, cnt))
# the quiet overall line under the stage
mn, mx, cnt = band_ink(img, M, 1148, 1040, 1180, sky1, 22)
check("overall standings label ink", cnt > 100, (mn, mx, cnt))
mn, mx, cnt = band_ink(img, M, 1198, 1040, 1232, sky1, 22)
check("overall standings line ink", cnt > 300, (mn, mx, cnt))
check_no_margin_ink(img, "event", 330, 1260)
check_footer(img, "event", 1284)

# ── event card with guest link ───────────────────────────────
print("event card + guest link (/tmp/sample-event-live.jpg)")
img = Image.open("/tmp/sample-event-live.jpg")
check_common_head(img, "event-live")
check_watch_pill(img, "event-live", 1276)
check_footer(img, "event-live", 1410)

# ── partial podium event card (when the seed data has one) ────
if os.path.exists("/tmp/sample-event-partial.jpg"):
    print("partial event card (/tmp/sample-event-partial.jpg)")
    img = Image.open("/tmp/sample-event-partial.jpg")
    check("partial card renders with a shorter stage", img.height < EXPECTED["event"], img.height)
    check_stage_panel(img, "event-partial", 490, img.height - 780)
else:
    print("partial event card: skipped (no partial podium in seed data)")

# ── standings card (the classification table) ─────────────────
print("standings card (/tmp/sample-standings.jpg)")
img = Image.open("/tmp/sample-standings.jpg")
check_common_head(img, "standings")
# one glass panel, not stacked row cards
e = px(img, 540, 340)
check("table panel top edge is lit", near(e, EDGE_TOP, 46), e)
clean = [(450, 360), (700, 480), (700, 700), (450, 980)]
bad = [p for p in clean if not near(px(img, *p), PANEL, 20)]
check("table panel is one glass body", not bad, [p for p in bad])
# header row
mn, mx, cnt = band_ink(img, M, 352, 700, 392, PANEL, 24)
check("table header labels ink", cnt > 120, (mn, mx, cnt))
cnt = color_count(img, 640, 358, 700, 392, GOLD, 55)
check("header gold dot present", cnt > 8, cnt)
cnt = color_count(img, 796, 358, 856, 392, BRONZE, 55)
check("header bronze dot present", cnt > 8, cnt)
d = px(img, 540, 404)
check("header divider", near(d, (58, 66, 85), 18), d)
# rows: coins, identity, G/S/B counts, points
rowtops = [406 + i * 104 for i in range(6)]
for i, rowtop in enumerate(rowtops):
    if i < 3:
        c = px(img, 98, rowtop + 44)
        expected = [GOLD, SILVER, BRONZE][i]
        check(f"standings row {i+1} medal color", near(c, expected, 65), c)
    else:
        c = px(img, 110, rowtop + 22)
        check(f"standings row {i+1} neutral coin stroke", near(c, COIN, 46), c)
        mn, mx, cnt = band_ink(img, 90, rowtop + 28, 132, rowtop + 70, PANEL, 26)
        check(f"standings row {i+1} rank numeral ink", cnt > 30, (mn, mx, cnt))
    mn, mx, cnt = band_ink(img, 152, rowtop + 12, 640, rowtop + 52, PANEL, 26)
    check(f"standings row {i+1} identity ink", cnt > 60, (mn, mx, cnt))
    mn, mx, cnt = band_ink(img, 646, rowtop + 20, 706, rowtop + 76, PANEL, 26)
    check(f"standings row {i+1} gold count ink", cnt > 15, (mn, mx, cnt))
    mn, mx, cnt = band_ink(img, 802, rowtop + 20, 862, rowtop + 76, PANEL, 26)
    check(f"standings row {i+1} bronze count ink", cnt > 15, (mn, mx, cnt))
    mn, mx, cnt = band_ink(img, 850, rowtop + 16, 992, rowtop + 84, PANEL, 26)
    check(f"standings row {i+1} total points ink right-aligned", cnt > 40 and mx and mx > 900, (mn, mx, cnt))
    if i < 5:
        d = px(img, 300, rowtop + 103)
        check(f"standings row {i+1} hairline divider", near(d, (50, 58, 77), 16), d)
# leader gold tab on the left edge
t = px(img, 71, 450)
check("leader gold tab", near(t, GOLD, 70), t)
check_no_margin_ink(img, "standings", 320, 1000)
check_footer(img, "standings", 1060)

# ── standings card with guest link ───────────────────────────
print("standings card + guest link (/tmp/sample-standings-live.jpg)")
img = Image.open("/tmp/sample-standings-live.jpg")
check_common_head(img, "standings-live")
check_watch_pill(img, "standings-live", 1052)
check_footer(img, "standings-live", 1186)

print()
print(f"layout check: {passed} passed · {len(failures)} failed")
if failures:
    print("failures:", ", ".join(failures))
    sys.exit(1)
