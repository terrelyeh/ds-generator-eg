"""
The CJK half of the type-spec page: what it claims, and where that comes from.

Every other number on that page is read out of the source at build time, so
it cannot disagree with the PDFs. These cannot be: ja and zh-TW metrics live
in `app_settings` and are edited through Settings ▸ Typography, by someone
who is not writing a commit and has no reason to think a static HTML file
needs regenerating. That makes this table the page's highest drift risk, not
its lowest.

Reading the database at build time would not fix it. The page is a static
file, so a build-time read is only a fresher snapshot — stale again the
moment somebody saves a setting — and it would cost the generator its
offline, repo-only reproducibility.

So: the numbers live in a checked-in snapshot next to this file, the page
prints the date it was captured, and `check-cjk-typography.py` compares the
snapshot against the live database and complains when they diverge. Detection
instead of coupling.
"""
import json
import pathlib

HERE = pathlib.Path(__file__).resolve().parent
SNAPSHOT = HERE / "cjk-typography-snapshot.json"

LOCALES = ["ja", "zh-TW"]


def load() -> dict:
    """The captured `app_settings` values, or fail with how to create them."""
    if not SNAPSHOT.exists():
        raise SystemExit(
            f"missing {SNAPSHOT.name} — run `python3 check-cjk-typography.py --update`"
        )
    return json.loads(SNAPSHOT.read_text())


def _pt(v):
    return f"{float(v):g}"


def rows(snap: dict) -> list[tuple]:
    """(label, ja cell, zh-TW cell, line-height, note) for the page.

    Cells are composed from the snapshot rather than written out, so a
    settings change that gets captured shows up here without anyone editing
    a string.
    """
    ja, zh = snap["locales"]["ja"], snap["locales"]["zh-TW"]

    def pair(field, weight_field=None):
        out = []
        for loc in (ja, zh):
            cell = _pt(loc[field]) + " pt"
            if weight_field:
                cell += f" / w{_pt(loc[weight_field])}"
            out.append(cell)
        return out

    def row(label, cells, lh, note):
        return (label, cells[0], cells[1], lh, note)

    return [
        ("字級來源", "app_settings", "app_settings", "—",
         "設定頁 ▸ Typography 可改，程式碼改不動"),
        row("封面主標", pair("headline_size", "headline_weight"), "1.25", "—"),
        row("封面副標", pair("subtitle_size"), "—", "與拉丁文同階"),
        row("區塊標題", pair("section_title_size"), "—", "拉丁為 14 pt"),
        row("Overview 內文", pair("overview_size", "overview_weight"), "1.5", "內文色 #444444"),
        row("Feature 項目", pair("features_size", "features_weight"), "1.4", "內文色 #444444"),
        row("規格標籤", pair("spec_label_size", "spec_label_weight"), "1.5", "拉丁為 w500"),
        row("規格數值", pair("spec_label_size", "spec_value_weight"), "1.5",
            "數值沿用標籤級數"),
        row("頁尾聲明", pair("footer_size"), "1.5", "w400 / #555555"),
        row("字距", pair("letter_spacing"), "—", "只作用在規格分類列"),
        ("字體", ja["font_family"], zh["font_family"], "—",
         "標題仍走 Manrope 作為西文 fallback"),
    ]


def captured_on(snap: dict) -> str:
    return snap.get("captured", "unknown")
