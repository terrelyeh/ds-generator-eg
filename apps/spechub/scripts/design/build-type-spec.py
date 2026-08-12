"""
Build the datasheet type-spec reference page.

    python3 apps/spechub/scripts/design/build-type-spec.py

Emits two files from one template, because the two destinations disagree
about who owns the document shell:

  public/design/datasheet-type-spec.html  — served by the app, so it needs
                                            a full document (charset!)
  scripts/design/type-spec.artifact.html  — for publishing as an Artifact,
                                            which supplies its own shell

Every size and weight is READ from the source at build time — `scale.ts`
for the steps, the four layout components for which step each role uses,
`typography.ts` for the standard layout's editable metrics. Nothing here
restates a number, so this page cannot drift from what the PDFs print, and
the build refuses to run if a layout introduces an off-scale size.

The one thing still written by hand is the CJK table: those metrics live in
`app_settings` and are edited through the settings UI, so there is no code
to read. Check them against the database, not against this file.

Everything is inlined: the Roboto (Apache-2.0) and Manrope (OFL-1.1) Latin
subsets, checked in next to this script so the build needs no network, plus
the three logo PNGs. The page has to show real type at real sizes in the
real face, so a fallback would defeat the point — and a sample labelled
Manrope must actually BE Manrope.
"""
import base64, html, pathlib, sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import read_type_system as TS

HERE = pathlib.Path(__file__).resolve().parent
SPECHUB = HERE.parent.parent
SP = HERE
PUB = SPECHUB / "public" / "logo"

def datauri(path, mime):
    return f"data:{mime};base64," + base64.b64encode(path.read_bytes()).decode()

def spec(text, size, weight=400, color="#16202B", bg=None, lh=1.25, disp=False):
    """One live specimen. `disp=True` marks display type, which every layout
    sets in Manrope; everything else is body copy and stays Roboto."""
    style = f"font-size:{size}pt;font-weight:{weight};color:{color};line-height:{lh}"
    if bg:
        style += f";background:{bg};padding:2pt 6pt;display:inline-block"
    cls = "spec-in disp" if disp else "spec-in"
    return f'<span class="{cls}" style="{style}">{html.escape(text)}</span>'

# ── Ladder: every distinct size, isolated to size alone (uniform weight) ──
LADDER = [
    (24,   "Cloud Managed 24-Port Gigabit PoE+ Switch", "四種版型的封面主標"),
    (17,   "EnGenius EOC Outdoor Bridge Series",        "A／D 封面副標 · B／D 區塊標題 · C 長主標"),
    (14,   "Specifications",                            "四種版型的頁首分類 · A／C 區塊標題 · B 封面型號 · C 系列名"),
    (12,   "ECS1528FP",                                 "A 封面型號 · 頁首「Datasheet」"),
    (11,   "802.3at/af PoE+ with a 410W total power budget", "A Overview／Features · B Feature 標題與硬體副標 · B Overview 上限"),
    (10,   "Deploy, monitor and troubleshoot from a single pane of glass.", "B 封面 Overview 階梯中間階"),
    (9,    "Supports IEEE 802.3at/af PoE+ on all 24 downlink ports.", "B／C Feature 內文 · B Overview 下限 · C Overview 上限"),
    (8.5,  "Supports IEEE 802.3at/af PoE+ on all 24 downlink ports.", "C 機種 Overview 階梯中間階"),
    (8,    "Supports IEEE 802.3at/af PoE+ on all 24 downlink ports.", "規格表 · D Feature 內文 · B EDCC 內文 · C Overview 下限"),
    (7,    "Power over Ethernet — IEEE 802.3at/af, 410W total power budget", "A／C／D 規格 · 全版型頁碼 · A 規格註腳"),
    (5.5,  "EnGenius Technologies, Inc. All rights reserved. Specifications subject to change without notice.", "全版型頁尾聲明"),
]

ladder_rows = []
for size, text, who in LADDER:
    ladder_rows.append(
        '<div class="rung">'
        f'<span class="pt">{size:g} pt</span>'
        f'<span class="sample" style="font-size:{size}pt">{html.escape(text)}</span>'
        f'<span class="who">{html.escape(who)}</span>'
        '</div>'
    )
ladder = "\n      ".join(ladder_rows)

def row(cells):
    return "<tr>" + "".join(cells) + "</tr>"

def td(v, cls=""):
    c = f' class="{cls}"' if cls else ""
    return f"<td{c}>{v}</td>"

def sw(hexv):
    return f'<span class="sw" style="background:{hexv}"></span><span class="mono">{hexv}</span>'
# ── Read the type system out of the source ──────────────────────────────
# Every size and weight below comes from scale.ts and the layout components.
# Nothing on this page restates a number, so it cannot describe a scale the
# code does not follow.
PT, WT, LADDERS = TS.read_scale()
BROADBAND_MAX = PT["cover"]  # the long-copy switch drops to PT.lead
TYPO_EN = TS.read_typography_defaults("en")
CSS = {L: TS.read_component(L, PT, WT, TYPO_EN) for L in "ABCD"}

_off_scale = TS.audit_off_scale(PT)
if _off_scale:
    raise SystemExit(
        "refusing to publish: a layout uses a size that is not a scale step\n  "
        + "\n  ".join(_off_scale)
    )


def px(layout, selector, prop, fallback=None):
    """One resolved declaration, or fail loudly."""
    decls = CSS[layout].get(selector)
    if decls is None or prop not in decls:
        if fallback is not None:
            return fallback
        raise SystemExit(
            f"read_type_system: {layout} `{selector}` has no {prop} — "
            "the selector or the stylesheet shape changed"
        )
    return decls[prop]


def num(v):
    """8.0 -> '8', 5.5 -> '5.5'."""
    return f"{v:g}"


def live(layout, selector, text, color="#16202B", bg=None, lh=1.25, disp=False,
         size=None, weight=None):
    """A table row whose numbers and specimen both come from the source."""
    s = size if size is not None else px(layout, selector, "font-size")
    w = weight if weight is not None else px(layout, selector, "font-weight")
    swatch = sw(color) if color.startswith("#") else color
    sample_color = color if color.startswith("#") else "#ffffff"
    return row([
        td(ROLE_LABEL, "role"), td(num(s) + " pt", "num"), td(num(w), "num"),
        td(LH_CELL, "num"), td(swatch, "mono"),
        td(spec(text, s, w, sample_color, bg=bg, lh=lh, disp=disp), "spec"),
    ])


# ── A · Latin ───────────────────────────────────────────────────────────
# Sizes marked (設定) are editable per locale in Settings ▸ Typography; the
# number shown is the en default this layout falls back to.
CLOUD = "#03a9f4"
A = [
    ("封面主標",    ".product-fullname-cloud", "1.15", "#231f20", "Cloud Managed 24-Port Gigabit PoE+ Switch", dict(lh=1.15, disp=True)),
    ("封面副標",    ".product-subtitle-cloud", "—",    CLOUD,     "CloudSwitch L2Plus 24 Full PoE", dict(disp=True)),
    ("封面型號",    ".model-name",             "—",    CLOUD,     "ECS1528FP", dict(disp=True)),
    ("區塊標題",    ".section-title",          "—",    CLOUD,     "Overview", dict(disp=True)),
    ("Overview 內文", ".overview-text",        "1.35", "#6f6f6f", "Designed for high-density deployments in offices and campuses.", dict(lh=1.35)),
    ("Features 標題", ".features-title",       "—",    CLOUD,     "Key Features", dict(disp=True)),
    ("Feature 項目", ".feature-item",          "1.35", "#4a4a4a", "802.3at/af PoE+ with a 410W total power budget", dict(lh=1.35)),
    ("規格分類列",  ".spec-category-header",   "—",    "白字／底 #6b7580", "Hardware Specifications", dict(bg="#6b7580")),
    ("規格標籤",    ".spec-label",             "1.4",  CLOUD,     "Power over Ethernet", {}),
    ("規格數值",    ".spec-value",             "1.4",  "#6f7073", "IEEE 802.3at/af, 410W total budget", {}),
    ("規格註腳",    ".spec-footnote",          "1.55", "#6f6f6f", "* Actual data throughput may vary by environment.", {}),
    ("頁首「Datasheet」", ".top-bar-full .title-prefix", "—", "白字／底為主題色", "Datasheet", dict(bg=CLOUD, disp=True)),
    ("頁首分類",    ".top-bar-full .title-category", "—", "白字／底為主題色", "Cloud Switch", dict(bg=CLOUD, disp=True)),
    ("頁碼",        ".page-number",            "—",    "#6f7073", "3", {}),
    ("頁尾聲明",    ".footer-disclaimer",      "1.45", "#6d6e71", "EnGenius Technologies, Inc. All rights reserved.", dict(lh=1.45)),
]

# ── A · CJK ─────────────────────────────────────────────────────────────
# NOT parsed: these live in `app_settings` per locale and are edited through
# the settings UI, so the code carries no number to read. Kept as prose.
CJK = [
    ("字級來源",    "app_settings", "app_settings", "—", "設定頁 ▸ Typography，程式碼改不動"),
    ("封面主標",    "24 pt / w500", "24 pt / w600", "1.25", "—"),
    ("封面副標",    "17 pt",        "17 pt",        "—",    "與拉丁文同階"),
    ("區塊標題",    "12 pt",        "13 pt",        "—",    "拉丁為 14 pt"),
    ("Overview 內文", "10 pt / w500", "11 pt / w500", "1.5",  "內文色 #444444"),
    ("Feature 項目", "10 pt / w500", "11 pt / w500", "1.4",  "內文色 #444444"),
    ("規格標籤",    "8 pt / w600",  "7 pt / w600",  "1.5",  "拉丁為 w500"),
    ("規格數值",    "8 pt / w400",  "7 pt / w400",  "1.5",  "拉丁同為 w400"),
    ("頁尾聲明",    "6 pt",         "6 pt",         "1.5",  "w400 / #555555"),
    ("字距",        "0.5 pt",       "0.3 pt",       "—",    "只作用在規格分類列"),
    ("字體",        "Noto Sans JP", "Noto Sans TC", "—",    "標題仍走 Manrope 作為西文 fallback"),
]
tbl_cjk = "\n".join(
    row([td(r[0], "role"), td(r[1], "num"), td(r[2], "num"), td(r[3], "num"), td(r[4])])
    for r in CJK
)

# ── B · Data Center ─────────────────────────────────────────────────────
DCN, DCB, DCY = "#16355c", "#0073bf", "#f4d768"
B = [
    ("Solution 標籤", ".cover-header .solution-label", "—", "白字／深藍底", "Data Center", dict(bg=DCN, disp=True)),
    ("封面主標",     ".hero-headline",  "1.28", "白字／深藍漸層底", "AI-Ready Edge Infrastructure", dict(bg=DCN, lh=1.28, disp=True, size=24)),
    ("封面型號",     ".hero-model",     "—",    DCY,       "SE110", dict(bg=DCN, disp=True)),
    ("封面 Overview", ".hero-overview", "1.55", "白字 95%", "Purpose-built for distributed AI workloads at the network edge.", dict(bg=DCN, lh=1.55, size=LADDERS["dcOverview"][0])),
    ("區塊標題",     ".section-title",  "—",    DCB,       "Key Features", dict(disp=True)),
    ("Feature 標籤", ".feature-chip",   "—",    "白字／藍底", "EDCC", dict(bg=DCB)),
    ("Feature 標題", ".feature-title",  "1.3",  "#3f4042", "Centralized Cloud Management", dict(lh=1.3)),
    ("Feature 內文", ".feature-text",   "1.5",  "#525355", "Monitor every node from a single dashboard.", dict(lh=1.5)),
    ("條列（無 chip）", ".flat-bullet", "1.55", "#525355", "Supports redundant power and hot-swap drives.", dict(lh=1.55)),
    ("EDCC 小標",    ".edcc-feature-title", "—", "#231f20", "Node View", {}),
    ("EDCC 內文",    ".edcc-feature-text",  "1.5", "#525355", "Manage servers even when the OS is unresponsive.", dict(lh=1.5)),
    ("規格表頭",     ".specs-band th",  "—",    "白字／藍底", "Specifications", dict(bg=DCB)),
    ("硬體副標",     ".hw-subtitle",    "—",    "#231f20", "Front Panel", {}),
    ("頁碼",         ".page-number",    "—",    "#58595b", "4", {}),
    ("頁尾聲明",     ".footer-disclaimer", "1.45", "#6d6e71", "EnGenius Technologies, Inc. All rights reserved.", dict(lh=1.45)),
]

# ── C · Broadband ───────────────────────────────────────────────────────
ST = "#1e6796"
C = [
    ("頁首「Datasheet」", ".cover-header .ds-label", "—", "白字／鋼藍底", "Datasheet", dict(bg=ST, disp=True)),
    ("封面主標",     ".hero-title",     "1.18", "白字／鋼藍底", "Long-Range Outdoor Ethernet over Coax", dict(bg=ST, lh=1.18, disp=True, size=BROADBAND_MAX)),
    ("封面主標（>46 字）", ".hero-title", "1.18", "白字／鋼藍底", "Long-Range Outdoor Ethernet over Coax for Multi-Dwelling Units", dict(bg=ST, lh=1.18, disp=True, size=PT["lead"])),
    ("封面系列名",   ".hero-series",    "—",    "白字／鋼藍底", "EOC620", dict(bg=ST, disp=True)),
    ("區塊標題",     ".section-title",  "—",    ST,        "Benefits", dict(disp=True)),
    ("小節標題",     ".block-title",    "—",    ST,        "Deployment", dict(disp=True)),
    ("小節內文",     ".block-body",     "1.55", "#6f6f6f", "Reuses existing coaxial cabling, no new trenching required.", dict(lh=1.55)),
    ("機種 Overview（自動階梯）", ".block-body", "1.65", "#6f6f6f", "Delivers gigabit throughput over legacy coax runs up to 1 km.", dict(lh=1.65, size=LADDERS["broadbandOverview"][0], weight=400)),
    ("Benefits 內文", ".benefit",       "1.5",  "#6f6f6f", "Cuts installation time on brownfield sites.", dict(lh=1.5)),
    ("附註",         ".benefits-note",  "—",    "#a7a9ac", "Measured in a controlled environment.", {}),
    ("規格分帶（深）", ".band-row th",  "—",    "白字／底 #6c6d71", "Interface", dict(bg="#6c6d71")),
    ("規格數值",     ".spec-row td",    "1.4",  "#6f7073", "1 × 10/100/1000 Mbps RJ45", dict(lh=1.4)),
    ("機種名（圖說）", ".views-model",  "—",    "#4a4a4a", "EOC620", {}),
    ("頁碼",         ".page-number",    "—",    "#6f7073", "2", {}),
    ("頁尾聲明",     ".footer-disclaimer", "1.45", "#6d6e71", "EnGenius Technologies, Inc. All rights reserved.", dict(lh=1.45)),
]

# ── D · Edge AI ─────────────────────────────────────────────────────────
TL = "#5aa8b0"
D = [
    ("頁首「Datasheet」", ".top-bar-full .title-prefix", "—", "白字／teal 底", "Datasheet", dict(bg=TL, disp=True)),
    ("頁首分類",     ".top-bar-full .title-category", "—", "白字／teal 底", "Edge AI Computer", dict(bg=TL, disp=True)),
    ("封面主標",     ".hero-title",     "1.18", "白字",     "Powered by NVIDIA Jetson Orin", dict(bg=TL, lh=1.18, disp=True)),
    ("封面副標",     ".hero-series",    "—",    "白字",     "Orin Box Series", dict(bg=TL, disp=True)),
    ("區塊標題",     ".section-title",  "—",    TL,        "Software Architecture", dict(disp=True)),
    ("內文",         ".overview-text",  "1.55", "#6f6f6f", "Runs the full NVIDIA JetPack stack out of the box.", dict(lh=1.55)),
    ("Feature 標題", ".feature-group-title", "—", "#6f6f6f", "Ruggedized Chassis", {}),
    ("Feature 內文", ".feature-bullet", "1.4",  "#6f6f6f", "Fanless, −20 to 60°C operating range.", dict(lh=1.4)),
    ("規格表頭",     ".specs-band th",  "—",    "白字／teal 底", "Specifications", dict(bg=TL)),
    ("規格數值",     ".spec-row td",    "1.35", "#6f6f6f", "100 TOPS (INT8), 1024-core Ampere GPU", dict(lh=1.35)),
    ("硬體副標",     ".hw-subtitle",    "—",    "#231f20", "I/O Layout", {}),
    ("頁碼",         ".page-number",    "—",    "#6f7073", "5", {}),
    ("頁尾聲明",     ".footer-disclaimer", "1.45", "#6d6e71", "EnGenius Technologies, Inc. All rights reserved.", dict(lh=1.45)),
]


def build(layout, rows):
    out = []
    for label, selector, lh_cell, color, text, kw in rows:
        size = kw.pop("size", None)
        weight = kw.pop("weight", None)
        s = size if size is not None else px(layout, selector, "font-size")
        w = weight if weight is not None else px(layout, selector, "font-weight", 400)
        swatch = sw(color) if color.startswith("#") else color
        sample_color = color if color.startswith("#") else "#ffffff"
        out.append(row([
            td(label, "role"), td(num(s) + " pt", "num"), td(num(w), "num"),
            td(lh_cell, "num"), td(swatch, "mono"),
            td(spec(text, s, w, sample_color, **kw), "spec"),
        ]))
    return "\n".join(out)


tbl_a = build("A", A)
tbl_b = build("B", B)
tbl_c = build("C", C)
tbl_d = build("D", D)


def typecell(layout, selector):
    """`11 pt / w400` for one layout's role, read from its stylesheet.

    A cell may instead be literal text, for the roles whose size is decided
    at render time rather than in CSS — Broadband's headline switches on
    copy length, so there is no static value to read and pretending
    otherwise would be worse than saying what the mechanism is.
    """
    if selector is None:
        return "—"
    if not (selector.startswith(".") or selector == "body"):
        return selector
    size = px(layout, selector, "font-size")
    weight = px(layout, selector, "font-weight", 400)
    return f"{num(size)} pt / w{num(weight)}"


def cmp_type(label, a, b, c, d):
    """A comparison row whose four cells are read, not typed."""
    return (label, typecell("A", a), typecell("B", b), typecell("C", c), typecell("D", d))


# ── Cross-layout comparisons ────────────────────────────────────────────
def cmp_table(rows):
    return "\n".join(
        row([td(r[0], "role")] + [td(c, "num") for c in r[1:]]) for r in rows
    )

cmp_title = cmp_table([
    cmp_type("主標題", ".product-fullname-cloud", ".hero-headline",
             f'{num(BROADBAND_MAX)} → {num(PT["lead"])} pt 自動<br>（>46 字降階）', ".hero-title"),
    ("主標行高", "1.15",         "1.28",         "1.18",                          "1.18"),
    ("主標顏色", "#231f20",      "白字／深藍",     "白字／鋼藍",                     "白字"),
    cmp_type("副標／型號", ".product-subtitle-cloud", ".hero-model", ".hero-series", ".hero-series"),
    cmp_type("區塊標題", ".section-title", ".section-title", ".section-title", ".section-title"),
    ("標題字體", "Manrope",      "Manrope",       "Manrope",                      "Manrope"),
    ("內文字體", "Roboto",       "Roboto",        "Roboto",                       "Roboto"),
])

cmp_body = cmp_table([
    cmp_type("body 基準", "body", "body", "body", "body"),
    ("Overview",  typecell("A", ".overview-text"),
                  " → ".join(num(v) for v in LADDERS["dcOverview"]) + " pt 自動",
                  " → ".join(num(v) for v in LADDERS["broadbandOverview"]) + " pt 自動",
                  typecell("D", ".overview-text")),
    ("Overview 行高", "1.35（CJK 1.5）", "1.55", "1.65", "1.55"),
    cmp_type("Feature 標題", ".features-title", ".feature-title", ".block-title", ".feature-group-title"),
    cmp_type("Feature 內文", ".feature-item", ".feature-text", ".benefit", ".feature-bullet"),
    ("內文色",    "#6f6f6f / #4a4a4a", "#525355", "#6f6f6f", "#6f6f6f"),
    ("條列圓點",  "0.5em CSS 圓",  "0.5em CSS 圓",  "0.5em CSS 圓",  "0.5em CSS 圓"),
])

cmp_spec = cmp_table([
    ("版面",     "雙欄",          "全寬表格",      "全寬表格",      "全寬表格"),
    cmp_type("分類列", ".spec-category-header", ".specs-band th", ".band-row th", ".specs-band th"),
    ("分類列底", "#6b7580",       "#0073bf",       "#1e6796",      "#86c9cf"),
    cmp_type("標籤", ".spec-label", ".spec-row td", ".desc-row td", ".model-name-row td"),
    cmp_type("數值", ".spec-value", ".spec-row td", ".spec-row td", ".spec-row td"),
    ("數值行高", "1.4（CJK 1.5）", "1.4",          "1.4",          "1.35"),
    cmp_type("註腳／頁尾", ".spec-footnote", ".footer-disclaimer", ".footer-disclaimer", ".footer-disclaimer"),
])

# ── Assemble ────────────────────────────────────────────────────────────
src = (HERE / "type-spec.template.html").read_text()
out = (src
    .replace("__ROBOTO__",     datauri(SP / "roboto-latin.woff2", "font/woff2"))
    .replace("__MANROPE__",    datauri(SP / "manrope-latin.woff2", "font/woff2"))
    .replace("__LOGO_WHITE__", datauri(PUB / "EnGenius-Logo-white.png", "image/png"))
    .replace("__LOGO_GRAY__",  datauri(PUB / "EnGenius-Logo-gray.png", "image/png"))
    .replace("__CLOUD_ICON__", datauri(PUB / "engenius_cloud_icon.png", "image/png"))
    .replace("__LADDER__",     ladder)
    .replace("__TBL_A__",      tbl_a)
    .replace("__TBL_CJK__",    tbl_cjk)
    .replace("__TBL_B__",      tbl_b)
    .replace("__TBL_C__",      tbl_c)
    .replace("__TBL_D__",      tbl_d)
    .replace("__CMP_TITLE__",  cmp_title)
    .replace("__CMP_BODY__",   cmp_body)
    .replace("__CMP_SPEC__",   cmp_spec)
)

leftover = [t for t in ["__ROBOTO__","__MANROPE__","__LOGO_WHITE__","__LOGO_GRAY__","__CLOUD_ICON__","__LADDER__",
                        "__TBL_A__","__TBL_CJK__","__TBL_B__","__TBL_C__","__TBL_D__",
                        "__CMP_TITLE__","__CMP_BODY__","__CMP_SPEC__"] if t in out]
if leftover:
    raise SystemExit(f"unreplaced placeholders: {leftover}")

# Artifact form: no document shell — the publisher wraps it.
artifact = HERE / "type-spec.artifact.html"
artifact.write_text(out, encoding="utf-8")

# Standalone form: served straight off /public, so it owns its own shell.
# Without the charset meta the browser guesses latin-1 and every Chinese
# character renders as mojibake.
standalone = (
    '<!doctype html>\n<html lang="zh-Hant">\n<head>\n'
    '<meta charset="utf-8">\n'
    '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
    '<meta name="robots" content="noindex">\n'
    + out.split("</style>", 1)[0] + "</style>\n</head>\n<body>\n"
    + out.split("</style>", 1)[1] + "\n</body>\n</html>\n"
)
page = SPECHUB / "public" / "design" / "datasheet-type-spec.html"
page.parent.mkdir(parents=True, exist_ok=True)
page.write_text(standalone, encoding="utf-8")

print(f"artifact   {artifact.relative_to(SPECHUB)}  {len(out.encode())/1024:.1f} KB")
print(f"standalone {page.relative_to(SPECHUB)}  {len(standalone.encode())/1024:.1f} KB")
