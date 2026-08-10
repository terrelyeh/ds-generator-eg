"""
Build the datasheet type-spec reference page.

    python3 apps/spechub/scripts/design/build-type-spec.py

Emits two files from one template, because the two destinations disagree
about who owns the document shell:

  public/design/datasheet-type-spec.html  — served by the app, so it needs
                                            a full document (charset!)
  scripts/design/type-spec.artifact.html  — for publishing as an Artifact,
                                            which supplies its own shell

Everything is inlined: the Roboto Latin subset (Apache-2.0, checked in next
to this script so the build needs no network) and the three logo PNGs. The
page has to show real type at real sizes, so a fallback face would defeat
the point.
"""
import base64, html, pathlib

HERE = pathlib.Path(__file__).resolve().parent
SPECHUB = HERE.parent.parent
SP = HERE
PUB = SPECHUB / "public" / "logo"

def datauri(path, mime):
    return f"data:{mime};base64," + base64.b64encode(path.read_bytes()).decode()

def spec(text, size, weight=400, color="#16202B", bg=None, lh=1.25):
    style = f"font-size:{size}pt;font-weight:{weight};color:{color};line-height:{lh}"
    if bg:
        style += f";background:{bg};padding:2pt 6pt;display:inline-block"
    return f'<span class="spec-in" style="{style}">{html.escape(text)}</span>'

# ── Ladder: every distinct size, isolated to size alone (uniform weight) ──
LADDER = [
    (24,   "Cloud Managed 24-Port Gigabit PoE+ Switch", "A 封面主標 · B 封面主標 · D 封面主標"),
    (21,   "EnGenius EOC Outdoor Bridge Series",        "C 封面主標（標題 ≤ 46 字元）"),
    (19,   "CloudSwitch L2Plus 24 Full PoE",            "A 封面副標"),
    (17.5, "Powered by NVIDIA Jetson Orin",             "D 封面副標"),
    (17,   "Key Features and Benefits",                 "B 區塊標題 · D 區塊標題 · A CJK 副標 · C 封面主標（> 46 字元）"),
    (15,   "SE110 Edge Network Appliance",              "B 封面型號 · C 封面系列名"),
    (14,   "Specifications",                            "A 區塊標題 · C 區塊標題 · B Solution 標籤 · 頁首分類"),
    (12,   "ECS1528FP",                                 "A 封面型號 · 頁首「Datasheet」"),
    (11.5, "クラウド管理型スイッチ",                       "A CJK（ja）Overview"),
    (11,   "802.3at/af PoE+ with a 410W total power budget",   "A Overview／Features · C 機種名 · D 硬體副標"),
    (10.5, "Centralized Cloud Management",              "B Feature 標題 · B 硬體副標 · A CJK（ja）Features"),
    (10,   "Deploy, monitor and troubleshoot from a single pane of glass.", "B 封面 Overview（上限）· D 內文 · C 區塊標題"),
    (9.5,  "Deploy, monitor and troubleshoot from a single pane of glass.", "B 封面 Overview（中）"),
    (9,    "Deploy, monitor and troubleshoot from a single pane of glass.", "B 封面 Overview（下限）"),
    (8.5,  "Supports IEEE 802.3at/af PoE+ on all 24 downlink ports.",       "B Flat bullet · B 規格表頭 · C 機種 Overview（上限）"),
    (8,    "Supports IEEE 802.3at/af PoE+ on all 24 downlink ports.",       "B／C／D 規格數值與表頭 · D Feature"),
    (7.5,  "Hardware Specifications · 24 × 10/100/1000 Mbps RJ45 ports",    "A 規格分類列 · B Feature 內文 · C 機種 Overview（下限）"),
    (7,    "Power over Ethernet — IEEE 802.3at/af, 410W total power budget", "A 規格標籤／數值 · C／D 規格 · 全版型頁碼"),
    (6,    "EnGenius Technologies, Inc. 記載內容は予告なく変更する場合があります。", "A CJK 頁尾"),
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

# ── A · Latin ───────────────────────────────────────────────────────────
CLOUD = "#03a9f4"
A = [
    ("封面主標",    "24",  "500", "1.15", "#231f20", spec("Cloud Managed 24-Port Gigabit PoE+ Switch", 24, 500, "#231f20", lh=1.15)),
    ("封面副標",    "19",  "500", "—",    CLOUD,     spec("CloudSwitch L2Plus 24 Full PoE", 19, 500, CLOUD)),
    ("封面型號",    "12",  "500", "—",    CLOUD,     spec("ECS1528FP", 12, 500, CLOUD)),
    ("區塊標題",    "14",  "500", "—",    CLOUD,     spec("Overview", 14, 500, CLOUD)),
    ("Overview 內文", "11", "400", "1.35", "#6f6f6f", spec("Designed for high-density deployments in offices and campuses.", 11, 400, "#6f6f6f", lh=1.35)),
    ("Features 標題", "14", "500", "—",   CLOUD,     spec("Key Features", 14, 500, CLOUD)),
    ("Feature 項目", "11",  "400", "1.35", "#4a4a4a", spec("802.3at/af PoE+ with a 410W total power budget", 11, 400, "#4a4a4a", lh=1.35)),
    ("規格分類列",  "7.5", "500", "—",    "白字／底 #6b7580", spec("Hardware Specifications", 7.5, 500, "#ffffff", bg="#6b7580")),
    ("規格標籤",    "7",   "500", "1.4",  CLOUD,     spec("Power over Ethernet", 7, 500, CLOUD)),
    ("規格數值",    "7",   "300", "1.4",  "#6f7073", spec("IEEE 802.3at/af, 410W total budget", 7, 300, "#6f7073")),
    ("規格註腳",    "7.5", "300", "1.55", "#6f6f6f", spec("* Actual data throughput may vary by environment.", 7.5, 300, "#6f6f6f")),
    ("頁首「Datasheet」", "12", "300", "—", "白字／底為主題色", spec("Datasheet", 12, 300, "#ffffff", bg=CLOUD)),
    ("頁首分類",    "14",  "500", "—",    "白字／底為主題色", spec("Cloud Switch", 14, 500, "#ffffff", bg=CLOUD)),
    ("頁碼",        "7",   "300", "—",    "#6f7073", spec("3", 7, 300, "#6f7073")),
    ("頁尾聲明",    "5.5", "300", "1.45", "#6d6e71", spec("EnGenius Technologies, Inc. All rights reserved.", 5.5, 300, "#6d6e71", lh=1.45)),
]
tbl_a = "\n".join(
    row([td(r[0], "role"), td(r[1] + " pt", "num"), td(r[2], "num"), td(r[3], "num"),
         td(sw(r[4]) if r[4].startswith("#") else r[4], "mono"), td(r[5], "spec")])
    for r in A
)

# ── A · CJK ─────────────────────────────────────────────────────────────
CJK = [
    ("封面主標",    "24 pt / w500", "24 pt / w600", "1.25", "—"),
    ("封面副標",    "17 pt",        "17 pt",        "—",    "拉丁為 19 pt"),
    ("區塊標題",    "13 pt",        "13 pt",        "—",    "拉丁為 14 pt"),
    ("Overview 內文", "11.5 pt / w500", "12 pt / w500", "1.5",  "內文色 #444444"),
    ("Feature 項目", "10.5 pt / w500", "11 pt / w500", "1.4",  "內文色 #444444"),
    ("規格標籤",    "7 pt / w600",  "7 pt / w600",  "1.5",  "拉丁為 w500"),
    ("規格數值",    "7 pt / w400",  "7 pt / w400",  "1.5",  "拉丁為 w300"),
    ("頁尾聲明",    "6 pt",         "6 pt",         "1.5",  "w400 / #555555"),
    ("字距",        "0.5 pt",       "0.3 pt",       "—",    "只作用在規格分類列"),
    ("字體",        "Zen Kaku Gothic New", "Noto Sans TC", "—", "設定頁可更換"),
]
tbl_cjk = "\n".join(
    row([td(r[0], "role"), td(r[1], "num"), td(r[2], "num"), td(r[3], "num"), td(r[4])])
    for r in CJK
)

# ── B · Data Center ─────────────────────────────────────────────────────
DCN, DCB, DCY = "#16355c", "#0073bf", "#f4d768"
B = [
    ("Solution 標籤", "Manrope", "14",   "200", "白字／深藍底", spec("Data Center", 14, 200, "#ffffff", bg=DCN)),
    ("封面主標",     "Manrope", "24",   "500", "白字／深藍漸層底", spec("AI-Ready Edge Infrastructure", 24, 500, "#ffffff", bg=DCN, lh=1.28)),
    ("封面型號",     "Manrope", "15",   "600", DCY,      spec("SE110", 15, 600, DCY, bg=DCN)),
    ("封面 Overview", "Manrope", "10 → 9.5 → 9", "300", "白字 95%", spec("Purpose-built for distributed AI workloads at the network edge.", 10, 300, "#ffffff", bg=DCN, lh=1.55)),
    ("區塊標題",     "Manrope", "17",   "600", DCB,      spec("Key Features", 17, 600, DCB)),
    ("Feature 標籤", "Roboto",  "8",    "500", "白字／藍底", spec("EDCC", 8, 500, "#ffffff", bg=DCB)),
    ("Feature 標題", "Roboto",  "10.5", "700", "#3f4042", spec("Centralized Cloud Management", 10.5, 700, "#3f4042", lh=1.3)),
    ("Feature 內文", "Roboto",  "7.5",  "400", "#525355", spec("Monitor every node from a single dashboard.", 7.5, 400, "#525355", lh=1.5)),
    ("條列（無 chip）", "Roboto", "8.5", "400", "#525355", spec("Supports redundant power and hot-swap drives.", 8.5, 400, "#525355", lh=1.55)),
    ("EDCC 小標",    "Roboto",  "10",   "400", "#231f20", spec("Node View", 10, 400, "#231f20")),
    ("規格表頭",     "Roboto",  "8.5",  "400", "白字／藍底", spec("Specifications", 8.5, 400, "#ffffff", bg=DCB)),
    ("機種名列",     "Roboto",  "8",    "400", "白字／底 #6d6e71", spec("SE110", 8, 400, "#ffffff", bg="#6d6e71")),
    ("料號列",       "Roboto",  "8",    "400", "白字／底 #939598", spec("SE110-01", 8, 400, "#ffffff", bg="#939598")),
    ("規格數值",     "Roboto",  "8",    "400", "#525355", spec("Intel Atom x6425E, 4 cores", 8, 400, "#525355", lh=1.4)),
    ("硬體副標",     "Roboto",  "10.5", "400", "#231f20", spec("Front Panel", 10.5, 400, "#231f20")),
    ("頁碼",         "Manrope", "7",    "200", "#58595b", spec("4", 7, 200, "#58595b")),
    ("頁尾聲明",     "Roboto",  "5.5",  "300", "#6d6e71", spec("EnGenius Technologies, Inc. All rights reserved.", 5.5, 300, "#6d6e71", lh=1.45)),
]
tbl_b = "\n".join(
    row([td(r[0], "role"), td(r[1], "mono"), td(r[2] + " pt", "num"), td(r[3], "num"),
         td(sw(r[4]) if r[4].startswith("#") else r[4], "mono"), td(r[5], "spec")])
    for r in B
)

# ── C · Broadband ───────────────────────────────────────────────────────
ST = "#1e6796"
C = [
    ("頁首「Datasheet」", "12",  "300", "—",   "白字／鋼藍底", spec("Datasheet", 12, 300, "#ffffff", bg=ST)),
    ("頁首分類",     "14",  "500", "—",    "白字／鋼藍底", spec("Broadband", 14, 500, "#ffffff", bg=ST)),
    ("封面主標",     "21 → 17", "700", "1.18", "白字／鋼藍底", spec("Long-Range Outdoor Ethernet over Coax", 21, 700, "#ffffff", bg=ST, lh=1.18)),
    ("封面系列名",   "15",  "400", "—",    "白字／鋼藍底", spec("EOC620", 15, 400, "#ffffff", bg=ST)),
    ("區塊標題",     "14",  "700", "—",    ST,        spec("Benefits", 14, 700, ST)),
    ("小節標題",     "10",  "500", "—",    ST,        spec("Deployment", 10, 500, ST)),
    ("小節內文",     "8",   "400", "1.55", "#6f6f6f", spec("Reuses existing coaxial cabling, no new trenching required.", 8, 400, "#6f6f6f", lh=1.55)),
    ("機種 Overview", "8.5 → 8 → 7.5", "400", "1.65", "#6f6f6f", spec("Delivers gigabit throughput over legacy coax runs up to 1 km.", 8.5, 400, "#6f6f6f", lh=1.65)),
    ("Benefits 內文", "7.5", "400", "1.5", "#6f6f6f", spec("Cuts installation time on brownfield sites.", 7.5, 400, "#6f6f6f", lh=1.5)),
    ("附註",         "7",   "300", "—",    "#a7a9ac", spec("Measured in a controlled environment.", 7, 300, "#a7a9ac")),
    ("規格表頭",     "8",   "500", "—",    "白字／鋼藍底", spec("Specifications", 8, 500, "#ffffff", bg=ST)),
    ("規格分帶（深）", "7.5", "500", "—",  "白字／底 #6c6d71", spec("Interface", 7.5, 500, "#ffffff", bg="#6c6d71")),
    ("規格分帶（淺）", "7",  "400", "—",   "白字／底 #888b8d", spec("EOC620", 7, 400, "#ffffff", bg="#888b8d")),
    ("規格數值",     "7",   "400", "1.4",  "#6f7073", spec("1 × 10/100/1000 Mbps RJ45", 7, 400, "#6f7073", lh=1.4)),
    ("機種名（圖說）", "11", "400", "—",   "#4a4a4a", spec("EOC620", 11, 400, "#4a4a4a")),
    ("頁碼",         "7",   "300", "—",    "#6f7073", spec("2", 7, 300, "#6f7073")),
    ("頁尾聲明",     "5.5", "300", "1.45", "#6d6e71", spec("EnGenius Technologies, Inc. All rights reserved.", 5.5, 300, "#6d6e71", lh=1.45)),
]
tbl_c = "\n".join(
    row([td(r[0], "role"), td(r[1] + " pt", "num"), td(r[2], "num"), td(r[3], "num"),
         td(sw(r[4]) if r[4].startswith("#") else r[4], "mono"), td(r[5], "spec")])
    for r in C
)

# ── D · Edge AI ─────────────────────────────────────────────────────────
TL = "#86c9cf"
D = [
    ("頁首「Datasheet」", "12", "300", "—",  "白字／teal 底", spec("Datasheet", 12, 300, "#ffffff", bg="#5aa8b0")),
    ("頁首分類",     "14",  "500", "—",    "白字／teal 底", spec("Edge AI Box", 14, 500, "#ffffff", bg="#5aa8b0")),
    ("封面主標",     "24",  "500", "1.18", "白字",     spec("Powered by NVIDIA Jetson Orin", 24, 500, "#ffffff", bg="#5aa8b0", lh=1.18)),
    ("封面副標",     "17.5", "400", "—",   "白字",     spec("Orin Box Series", 17.5, 400, "#ffffff", bg="#5aa8b0")),
    ("區塊標題",     "17",  "500", "—",    TL,        spec("Software Architecture", 17, 500, "#5aa8b0")),
    ("內文",         "10",  "400", "1.55", "#6f6f6f", spec("Runs the full NVIDIA JetPack stack out of the box.", 10, 400, "#6f6f6f", lh=1.55)),
    ("Feature 標題", "8",   "700", "—",    "#6f6f6f", spec("Ruggedized Chassis", 8, 700, "#6f6f6f")),
    ("Feature 內文", "8",   "400", "1.4",  "#6f6f6f", spec("Fanless, −20 to 60°C operating range.", 8, 400, "#6f6f6f", lh=1.4)),
    ("規格表頭",     "8",   "400", "—",    "白字／teal 底", spec("Specifications", 8, 400, "#ffffff", bg="#5aa8b0")),
    ("規格分帶（深）", "7",  "400", "—",   "白字／底 #6e6e6e", spec("Compute", 7, 400, "#ffffff", bg="#6e6e6e")),
    ("規格分帶（淺）", "7",  "400", "—",   "白字／底 #969696", spec("Orin NX 16GB", 7, 400, "#ffffff", bg="#969696")),
    ("規格數值",     "7",   "400", "1.35", "#6f6f6f", spec("100 TOPS (INT8), 1024-core Ampere GPU", 7, 400, "#6f6f6f", lh=1.35)),
    ("硬體副標",     "11",  "400", "—",    "#231f20", spec("I/O Layout", 11, 400, "#231f20")),
    ("頁碼",         "7",   "300", "—",    "#6f7073", spec("5", 7, 300, "#6f7073")),
    ("頁尾聲明",     "5.5", "300", "1.45", "#6d6e71", spec("EnGenius Technologies, Inc. All rights reserved.", 5.5, 300, "#6d6e71", lh=1.45)),
]
tbl_d = "\n".join(
    row([td(r[0], "role"), td(r[1] + " pt", "num"), td(r[2], "num"), td(r[3], "num"),
         td(sw(r[4]) if r[4].startswith("#") else r[4], "mono"), td(r[5], "spec")])
    for r in D
)

# ── Cross-layout comparisons ────────────────────────────────────────────
def cmp_table(rows):
    return "\n".join(
        row([td(r[0], "role")] + [td(c, "num") for c in r[1:]]) for r in rows
    )

cmp_title = cmp_table([
    ("主標題",   "24 pt / w500", "24 pt / w500", "21 pt / w700<br>（>46 字降 17）", "24 pt / w500"),
    ("主標行高", "1.15",         "1.28",         "1.18",                          "1.18"),
    ("主標顏色", "#231f20",      "白字／深藍",     "白字／鋼藍",                     "白字"),
    ("副標",     "19 pt / w500", "型號 15 pt / w600", "系列 15 pt / w400",         "17.5 pt / w400"),
    ("區塊標題", "14 pt / w500", "17 pt / w600",  "14 pt / w700",                 "17 pt / w500"),
    ("標題字體", "Roboto",       "Manrope",       "Roboto",                       "Roboto"),
])

cmp_body = cmp_table([
    ("body 基準", "7 pt",  "8 pt",  "8 pt",  "7 pt"),
    ("Overview",  "11 pt / w400", "10 → 9 pt 自動", "8.5 → 7.5 pt 自動", "10 pt / w400"),
    ("Overview 行高", "1.35（CJK 1.5）", "1.55", "1.65", "1.55"),
    ("Feature 標題", "14 pt / w500", "10.5 pt / w700", "10 pt / w500", "8 pt / w700"),
    ("Feature 內文", "11 pt / w400", "7.5 pt / w400",  "8 pt / w400",  "8 pt / w400"),
    ("內文色",    "#6f6f6f / #4a4a4a", "#525355", "#6f6f6f", "#6f6f6f"),
])

cmp_spec = cmp_table([
    ("版面",     "雙欄",          "全寬表格",      "全寬表格",      "全寬表格"),
    ("分類列",   "7.5 pt / w500", "8.5 pt / w400", "8 pt / w500",  "8 pt / w400"),
    ("分類列底", "#6b7580",       "#0073bf",       "#1e6796",      "#86c9cf"),
    ("標籤",     "7 pt / w500",   "8 pt / w400",   "7.5 pt / w500", "7 pt / w400"),
    ("數值",     "7 pt / w300",   "8 pt / w400",   "7 pt / w400",  "7 pt / w400"),
    ("數值行高", "1.4（CJK 1.5）", "1.4",          "1.4",          "1.35"),
    ("註腳",     "7.5 pt / w300", "5.5 pt / w300", "5.5 pt / w300", "5.5 pt / w300"),
])

# ── Assemble ────────────────────────────────────────────────────────────
src = (HERE / "type-spec.template.html").read_text()
out = (src
    .replace("__ROBOTO__",     datauri(SP / "roboto-latin.woff2", "font/woff2"))
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

leftover = [t for t in ["__ROBOTO__","__LOGO_WHITE__","__LOGO_GRAY__","__CLOUD_ICON__","__LADDER__",
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
