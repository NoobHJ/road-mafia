"""Road Mafia v0.1 card generator: writes one SVG per card and HTML sheets for screenshotting."""
import os, json

OUT = os.path.dirname(os.path.abspath(__file__))
SVG_DIR = os.path.join(OUT, "svg")
os.makedirs(SVG_DIR, exist_ok=True)

W, H = 200, 300
CX, CY = W / 2, H / 2
FONT = "'Apple SD Gothic Neo','Noto Sans KR',sans-serif"
EDGE = {"N": (CX, 0), "E": (W, CY), "S": (CX, H), "W": (0, CY)}

INK = "#1f2328"
ASPHALT = "#3b3f46"
CURB = "#c9c4b6"
LINE = "#ffd23f"
GROUND = "#ece6d6"


def frame(inner, bg=GROUND, border=INK):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">'
            f'<defs><clipPath id="c"><rect x="4" y="4" width="{W-8}" height="{H-8}" rx="14"/></clipPath>'
            f'<pattern id="hz" width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">'
            f'<rect width="16" height="16" fill="#ffc400"/><rect width="8" height="16" fill="{INK}"/></pattern></defs>'
            f'<rect x="1" y="1" width="{W-2}" height="{H-2}" rx="16" fill="{border}"/>'
            f'<g clip-path="url(#c)"><rect width="{W}" height="{H}" fill="{bg}"/>{inner}</g>'
            f'<rect x="4" y="4" width="{W-8}" height="{H-8}" rx="14" fill="none" stroke="#ffffff55" stroke-width="1.5"/></svg>')


def city_blocks():
    """Small building blocks in the four corners, so road tiles read as a city map."""
    s = ""
    for (x, y) in [(14, 14), (126, 14), (14, 226), (126, 226)]:
        s += f'<rect x="{x}" y="{y}" width="60" height="60" rx="6" fill="#ddd5c0"/>'
        for i, (dx, dy, w, h) in enumerate([(6, 6, 22, 18), (32, 6, 22, 30), (6, 28, 22, 26), (32, 40, 22, 14)]):
            c = ["#c7bda6", "#bfb49b", "#cfc6b1", "#b8ad94"][i]
            s += f'<rect x="{x+dx}" y="{y+dy}" width="{w}" height="{h}" rx="2" fill="{c}"/>'
    return s


def road_paths(conns):
    """conns: list of (a, b) edge pairs joined through the tile, or (a,) stub to centre."""
    ds = []
    for c in conns:
        if len(c) == 1:
            x, y = EDGE[c[0]]
            ds.append(f"M{x},{y} L{CX},{CY}")
            continue
        a, b = c
        (x1, y1), (x2, y2) = EDGE[a], EDGE[b]
        if {a, b} in ({"N", "S"}, {"E", "W"}):
            ds.append(f"M{x1},{y1} L{x2},{y2}")
        else:
            ds.append(f"M{x1},{y1} Q{CX},{CY} {x2},{y2}")
    return ds


def draw_road(ds):
    s = ""
    for d in ds:
        s += f'<path d="{d}" stroke="{CURB}" stroke-width="70" fill="none" stroke-linecap="butt"/>'
    for d in ds:
        s += f'<path d="{d}" stroke="{ASPHALT}" stroke-width="56" fill="none" stroke-linecap="butt"/>'
    for d in ds:
        s += f'<path d="{d}" stroke="{LINE}" stroke-width="3.5" fill="none" stroke-dasharray="14 10"/>'
    return s


def centre_cap():
    return (f'<circle cx="{CX}" cy="{CY}" r="35" fill="{CURB}"/>'
            f'<circle cx="{CX}" cy="{CY}" r="28" fill="{ASPHALT}"/>')


def road_tile(open_sides, conns):
    s = city_blocks()
    s += draw_road(road_paths(conns))
    if len(open_sides) >= 3:
        s += centre_cap() + ''.join(
            f'<path d="M{EDGE[d][0]},{EDGE[d][1]} L{CX},{CY}" stroke="{LINE}" stroke-width="3.5" stroke-dasharray="14 10"/>'
            for d in open_sides)
    return frame(s)


def barricade(x, y, vertical):
    w, h = (64, 18) if not vertical else (18, 64)
    return (f'<rect x="{x-w/2}" y="{y-h/2}" width="{w}" height="{h}" rx="3" fill="url(#hz)" stroke="{INK}" stroke-width="2"/>'
            f'<circle cx="{x}" cy="{y}" r="4" fill="#ff3b30" stroke="{INK}" stroke-width="1.5"/>')


def dead_end(open_sides):
    """Open edges match neighbours, but each stub stops at a barricade: no passage through."""
    s = city_blocks()
    stub = {"N": (CX, 0, CX, 82), "S": (CX, H, CX, 218), "E": (W, CY, 128, CY), "W": (0, CY, 72, CY)}
    ds = [f"M{a},{b} L{c},{d}" for k in open_sides for (a, b, c, d) in [stub[k]]]
    s += draw_road(ds)
    for k in open_sides:
        _, _, x, y = stub[k]
        s += barricade(x, y, vertical=k in "EW")
    # cracked lot in the middle
    s += (f'<path d="M{CX-18},{CY-10} l10,6 l-4,10 l12,4 l6,-12 l10,8" stroke="#a89e86" stroke-width="2.5" fill="none" stroke-linecap="round"/>'
          f'<text x="{CX}" y="{CY+52}" font-family="{FONT}" font-size="11" font-weight="800" fill="#8a2a22" text-anchor="middle">공사 중단</text>')
    return frame(s)


def badge(text, color, y=26):
    return (f'<rect x="0" y="0" width="{W}" height="{y+18}" fill="{color}"/>'
            f'<text x="{CX}" y="{y+6}" font-family="{FONT}" font-size="20" font-weight="900" fill="#fff" text-anchor="middle">{text}</text>')


def action(title, color, icons, desc, mark=None, sub=None):
    s = badge(title, color)
    s += f'<rect x="0" y="44" width="{W}" height="6" fill="url(#hz)"/>'
    s += f'<circle cx="{CX}" cy="146" r="62" fill="#fff" stroke="{color}" stroke-width="6"/>'
    if len(icons) == 1:
        s += f'<text x="{CX}" y="170" font-size="64" text-anchor="middle">{icons[0]}</text>'
    else:
        s += (f'<text x="{CX-28}" y="160" font-size="44" text-anchor="middle">{icons[0]}</text>'
              f'<text x="{CX}" y="160" font-family="{FONT}" font-size="30" font-weight="900" fill="{color}" text-anchor="middle">/</text>'
              f'<text x="{CX+28}" y="160" font-size="44" text-anchor="middle">{icons[1]}</text>')
    if mark == "x":
        s += (f'<path d="M{CX-46},100 L{CX+46},192 M{CX+46},100 L{CX-46},192" stroke="#e5383b" stroke-width="10" stroke-linecap="round" opacity="0.9"/>')
    elif mark == "ok":
        s += (f'<circle cx="{CX+46}" cy="192" r="18" fill="#2f9e44" stroke="#fff" stroke-width="3"/>'
              f'<path d="M{CX+37},192 l6,6 l12,-13" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round"/>')
    if sub:
        s += f'<text x="{CX}" y="236" font-family="{FONT}" font-size="15" font-weight="800" fill="{INK}" text-anchor="middle">{sub}</text>'
    s += f'<text x="{CX}" y="268" font-family="{FONT}" font-size="11.5" fill="#4a4f57" text-anchor="middle">{desc}</text>'
    return frame(s, bg="#f7f4ec")


def special(title, bg, color, icon, desc, roads=False):
    s = ""
    if roads:
        s += city_blocks() + draw_road(road_paths([("N", "S"), ("E", "W")])) + centre_cap()
    s += badge(title, color)
    s += (f'<circle cx="{CX}" cy="{CY+6}" r="48" fill="#fff" stroke="{color}" stroke-width="6"/>'
          f'<text x="{CX}" y="{CY+26}" font-size="52" text-anchor="middle">{icon}</text>')
    s += (f'<rect x="20" y="{H-50}" width="{W-40}" height="30" rx="8" fill="#ffffffcc"/>'
          f'<text x="{CX}" y="{H-30}" font-family="{FONT}" font-size="12" font-weight="700" fill="{INK}" text-anchor="middle">{desc}</text>')
    return frame(s, bg=bg)


def role(title, eng, bg, fg, icon, desc):
    s = (f'<text x="{CX}" y="60" font-family="{FONT}" font-size="13" font-weight="800" fill="{fg}" opacity="0.7" text-anchor="middle" letter-spacing="3">{eng}</text>'
         f'<circle cx="{CX}" cy="140" r="58" fill="#ffffff22" stroke="{fg}" stroke-width="4"/>'
         f'<text x="{CX}" y="162" font-size="66" text-anchor="middle">{icon}</text>'
         f'<text x="{CX}" y="230" font-family="{FONT}" font-size="30" font-weight="900" fill="{fg}" text-anchor="middle">{title}</text>'
         f'<text x="{CX}" y="262" font-family="{FONT}" font-size="11.5" fill="{fg}" opacity="0.85" text-anchor="middle">{desc}</text>')
    s = f'<rect x="0" y="0" width="{W}" height="14" fill="url(#hz)"/><rect x="0" y="{H-14}" width="{W}" height="14" fill="url(#hz)"/>' + s
    return frame(s, bg=bg)


def cash(value):
    bills = "".join(
        f'<g transform="translate({CX-54+i*6},{108+i*-8}) rotate({-6+i*6} 54 32)">'
        f'<rect width="108" height="64" rx="6" fill="#8fd19e" stroke="#2b8a3e" stroke-width="3"/>'
        f'<circle cx="54" cy="32" r="16" fill="#d3f9d8" stroke="#2b8a3e" stroke-width="2"/>'
        f'<text x="54" y="39" font-family="{FONT}" font-size="18" font-weight="900" fill="#2b8a3e" text-anchor="middle">$</text></g>'
        for i in range(value))
    s = (f'<rect x="12" y="12" width="{W-24}" height="{H-24}" rx="10" fill="none" stroke="#2b8a3e" stroke-width="2" stroke-dasharray="6 4"/>'
         f'<text x="26" y="48" font-family="{FONT}" font-size="30" font-weight="900" fill="#2b8a3e">{value}</text>'
         f'<text x="{W-26}" y="{H-24}" font-family="{FONT}" font-size="30" font-weight="900" fill="#2b8a3e" text-anchor="end">{value}</text>'
         + bills +
         f'<text x="{CX}" y="236" font-family="{FONT}" font-size="20" font-weight="900" fill="#2b8a3e" text-anchor="middle">현금 다발</text>')
    return frame(s, bg="#e6f6e9")


def back(kind):
    if kind == "play":
        s = (f'<rect width="{W}" height="{H}" fill="url(#hz)" opacity="0.95"/>'
             f'<rect x="22" y="70" width="{W-44}" height="160" rx="12" fill="{INK}"/>'
             f'<path d="M40,200 Q100,120 160,100" stroke="{ASPHALT}" stroke-width="26" fill="none"/>'
             f'<path d="M40,200 Q100,120 160,100" stroke="{LINE}" stroke-width="2.5" stroke-dasharray="8 6" fill="none"/>'
             f'<text x="{CX}" y="128" font-family="{FONT}" font-size="30" font-weight="900" fill="#ffc400" text-anchor="middle">ROAD</text>'
             f'<text x="{CX}" y="170" font-family="{FONT}" font-size="30" font-weight="900" fill="#fff" text-anchor="middle">MAFIA</text>')
        return frame(s, bg="#ffc400")
    if kind == "role":
        s = (f'<rect x="22" y="22" width="{W-44}" height="{H-44}" rx="12" fill="none" stroke="#ffc400" stroke-width="3"/>'
             f'<text x="{CX}" y="160" font-size="70" text-anchor="middle">❔</text>'
             f'<text x="{CX}" y="220" font-family="{FONT}" font-size="16" font-weight="900" fill="#ffc400" text-anchor="middle" letter-spacing="4">ROLE</text>')
        return frame(s, bg="#23262b")
    if kind == "goal":
        s = (f'<rect x="0" y="0" width="{W}" height="22" fill="url(#hz)"/><rect x="0" y="{H-22}" width="{W}" height="22" fill="url(#hz)"/>'
             f'<circle cx="{CX}" cy="{CY}" r="54" fill="#fff" stroke="{INK}" stroke-width="5"/>'
             f'<text x="{CX}" y="{CY+20}" font-family="{FONT}" font-size="58" font-weight="900" fill="{INK}" text-anchor="middle">?</text>'
             f'<text x="{CX}" y="{CY+90}" font-family="{FONT}" font-size="15" font-weight="900" fill="{INK}" text-anchor="middle">목적지</text>')
        return frame(s, bg="#ffe066")
    s = (f'<rect x="22" y="22" width="{W-44}" height="{H-44}" rx="12" fill="none" stroke="#2b8a3e" stroke-width="3"/>'
         f'<text x="{CX}" y="170" font-family="{FONT}" font-size="80" font-weight="900" fill="#2b8a3e" text-anchor="middle">$</text>')
    return frame(s, bg="#b2f2bb")


TOOLS = {"굴착기": "🚜", "조명": "💡", "덤프트럭": "🚚"}

SHEETS = [
    ("1. 도로 타일 — 연결로 (31장)", [
        ("road_cross", "╬ 십자", 5, road_tile("NESW", [("N", "S"), ("E", "W")])),
        ("road_t_v", "╠ 세로 T", 5, road_tile("NES", [("N", "S"), ("E",)])),
        ("road_t_h", "╦ 가로 T", 5, road_tile("EWS", [("E", "W"), ("S",)])),
        ("road_straight_h", "═ 가로 직선", 4, road_tile("EW", [("E", "W")])),
        ("road_straight_v", "║ 세로 직선", 3, road_tile("NS", [("N", "S")])),
        ("road_curve_es", "╔ 커브", 4, road_tile("ES", [("E", "S")])),
        ("road_curve_ws", "╗ 커브", 5, road_tile("WS", [("W", "S")])),
    ]),
    ("2. 도로 타일 — 막다른 길 (9장, 마피아용)", [
        ("dead_cross", "✖ 십자 막힘", 1, dead_end("NESW")),
        ("dead_t_v", "✖ 세로 T 막힘", 1, dead_end("NES")),
        ("dead_t_h", "✖ 가로 T 막힘", 1, dead_end("EWS")),
        ("dead_straight_h", "✖ 가로 막힘", 1, dead_end("EW")),
        ("dead_straight_v", "✖ 세로 막힘", 1, dead_end("NS")),
        ("dead_curve_es", "✖ 커브 막힘", 1, dead_end("ES")),
        ("dead_curve_ws", "✖ 커브 막힘 (반대)", 1, dead_end("WS")),
        ("dead_single_n", "✖ 단일 (N)", 1, dead_end("N")),
        ("dead_single_e", "✖ 단일 (E)", 1, dead_end("E")),
    ]),
    ("3. 행동 카드 (27장)", [
        *[(f"break_{i}", f"🔨 파손 · {k}", 3, action("파손", "#e5383b", [v], "다른 플레이어 도구 1개 고장", mark="x", sub=k))
          for i, (k, v) in enumerate(TOOLS.items())],
        *[(f"repair_{i}", f"🔧 수리 · {k}", 2, action("수리", "#2f9e44", [v], "고장 난 도구 1개 수리", mark="ok", sub=k))
          for i, (k, v) in enumerate(TOOLS.items())],
        *[(f"repair_dual_{i}", f"🔧 이중 수리 · {a}/{b}", 1,
           action("수리", "#2f9e44", [TOOLS[a], TOOLS[b]], "둘 중 하나를 수리", mark="ok", sub=f"{a} / {b}"))
          for i, (a, b) in enumerate([("굴착기", "조명"), ("조명", "덤프트럭"), ("굴착기", "덤프트럭")])],
        ("tipoff", "📞 제보", 6, action("제보", "#1c7ed6", ["📞"], "목적지 1장을 몰래 확인", sub="익명 제보")),
        ("sinkhole", "🕳️ 싱크홀", 3, action("싱크홀", "#6f4e37", ["🕳️"], "놓인 도로 타일 1장 제거", sub="도로 붕괴")),
    ]),
    ("4. 출발 · 목적지 카드 (4장)", [
        ("depot", "🏁 차고지", 1, special("차고지", GROUND, "#2f9e44", "🏁", "모든 도로는 여기서 시작", roads=True)),
        ("vault", "💰 금고", 1, special("금고", "#ffe8a3", "#c99700", "💰", "도로가 닿으면 시공단 승리")),
        ("empty_lot", "🏚️ 공터", 2, special("공터", "#e9ecef", "#868e96", "🏚️", "꽝! 도로망의 일부로 남는다")),
        ("goal_back", "❓ 목적지 뒷면", 3, back("goal")),
    ]),
    ("5. 역할 · 현금 · 카드 뒷면", [
        ("role_builder", "👷 시공단", 7, role("시공단", "BUILDER", "#ffd43b", INK, "👷", "차고지에서 금고까지 도로를 이어라")),
        ("role_mafia", "🕴️ 마피아", 4, role("마피아", "MAFIA", "#212529", "#f8f9fa", "🕴️", "들키지 말고 공사를 망쳐라")),
        ("cash_1", "💵 1", 16, cash(1)),
        ("cash_2", "💵 2", 8, cash(2)),
        ("cash_3", "💵 3", 4, cash(3)),
        ("back_play", "뒷면 · 도로/행동", 0, back("play")),
        ("back_role", "뒷면 · 역할", 0, back("role")),
        ("back_cash", "뒷면 · 현금", 0, back("cash")),
    ]),
]

COLS = 5
CARD_SCALE = 1.0
manifest = []
for si, (title, cards) in enumerate(SHEETS, 1):
    items = ""
    for key, label, n, svg in cards:
        with open(os.path.join(SVG_DIR, f"{key}.svg"), "w") as f:
            f.write(svg)
        cnt = f" ×{n}" if n else ""
        items += f'<figure>{svg}<figcaption>{label}<b>{cnt}</b></figcaption></figure>'
    rows = (len(cards) + COLS - 1) // COLS
    height = 90 + rows * 360 + 30
    html = (f'<!doctype html><meta charset="utf-8"><style>'
            f'body{{margin:0;background:#f4f1ea;font-family:{FONT};width:1180px}}'
            f'h1{{margin:0;padding:28px 36px 10px;font-size:26px;color:{INK}}}'
            f'.g{{display:grid;grid-template-columns:repeat({COLS},200px);gap:24px 28px;padding:16px 36px}}'
            f'figure{{margin:0}}svg{{display:block;filter:drop-shadow(0 4px 6px #0003)}}'
            f'figcaption{{margin-top:10px;font-size:15px;font-weight:700;color:#343a40;text-align:center}}'
            f'figcaption b{{color:#868e96;margin-left:4px}}</style>'
            f'<h1>Road Mafia 카드 v0.1 — {title}</h1><div class="g">{items}</div>')
    path = os.path.join(OUT, f"sheet{si}.html")
    with open(path, "w") as f:
        f.write(html)
    manifest.append({"html": path, "png": os.path.join(OUT, f"sheet{si}.png"), "height": height, "title": title})

with open(os.path.join(OUT, "manifest.json"), "w") as f:
    json.dump(manifest, f, ensure_ascii=False, indent=1)
print(len(manifest), "sheets,", sum(len(c) for _, c in SHEETS), "designs")
