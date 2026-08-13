"""
The CJK half of the type-spec page: what it claims, where that comes from,
and whether it still agrees with the live settings.

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

So the numbers live in a checked-in snapshot next to this file, the page
prints the date it was captured, and drift is DETECTED rather than coupled:
`check_drift()` compares the snapshot against the live rows and reports. The
generator calls it as a non-fatal reminder (it never blocks a build on the
database being reachable — that is the whole point of the snapshot), and
`check-cjk-typography.py` is the standalone CLI with exit codes.

Only `fetch_live()` / `capture()` / `check_drift()` touch the network, and
only when called. Importing this module, `load()` and `rows()` stay offline.
"""
import datetime
import json
import pathlib
import urllib.error
import urllib.request

HERE = pathlib.Path(__file__).resolve().parent
SNAPSHOT = HERE / "cjk-typography-snapshot.json"
ENV = HERE.parents[1] / ".env.local"

LOCALES = ["ja", "zh-TW"]

# Everything the page states. A field the page does not show is not checked —
# drift there is invisible to readers and not worth reporting.
CHECKED = [
    "font_family", "headline_size", "headline_weight", "subtitle_size",
    "section_title_size", "overview_size", "overview_weight",
    "features_size", "features_weight", "spec_label_size",
    "spec_label_weight", "spec_value_weight", "footer_size", "letter_spacing",
]


class CheckUnavailable(Exception):
    """The live settings could not be read (no creds, offline, missing row).

    Distinct from "read them and found drift": this means the comparison
    could not run at all, which for a build is a skip, not a failure.
    """


# ── snapshot (offline) ───────────────────────────────────────────────────
def load() -> dict:
    """The captured `app_settings` values, or fail with how to create them."""
    if not SNAPSHOT.exists():
        raise SystemExit(
            f"missing {SNAPSHOT.name} — run `python3 check-cjk-typography.py --update`"
        )
    return json.loads(SNAPSHOT.read_text())


def captured_on(snap: dict) -> str:
    return snap.get("captured", "unknown")


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


# ── live settings (network) ──────────────────────────────────────────────
def _env(name: str) -> str | None:
    if not ENV.exists():
        return None
    for line in ENV.read_text().splitlines():
        if line.startswith(f"{name}="):
            return line.split("=", 1)[1].strip().strip("\"'")
    return None


def fetch_live() -> dict:
    """The `typography_<locale>` rows from PostgREST, keyed by locale.

    Raises CheckUnavailable when the settings simply cannot be reached —
    callers decide whether that is a hard error (CLI) or a skip (build).
    """
    url, key = _env("NEXT_PUBLIC_SUPABASE_URL"), _env("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise CheckUnavailable(
            "NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not found "
            f"in {ENV}"
        )
    keys = ",".join(f"typography_{loc}" for loc in LOCALES)
    query = f"{url}/rest/v1/app_settings?key=in.({keys})&select=key,value"
    req = urllib.request.Request(query, headers={"apikey": key, "Authorization": f"Bearer {key}"})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            payload = json.loads(resp.read())
    except (urllib.error.URLError, TimeoutError) as exc:
        raise CheckUnavailable(str(exc)) from exc

    out = {}
    for entry in payload:
        locale = entry["key"].removeprefix("typography_")
        value = entry["value"]
        out[locale] = json.loads(value) if isinstance(value, str) else value
    missing = [loc for loc in LOCALES if loc not in out]
    if missing:
        raise CheckUnavailable(f"no app_settings row for {', '.join(missing)}")
    return out


def capture(live: dict) -> None:
    """Write the snapshot from a live read (used by the CLI's --update)."""
    SNAPSHOT.write_text(json.dumps({
        "captured": datetime.date.today().isoformat(),
        "source": "app_settings.typography_<locale> (Settings ▸ Typography)",
        "locales": {loc: live[loc] for loc in LOCALES},
    }, ensure_ascii=False, indent=2, sort_keys=True) + "\n")


def compare(snapshot: dict, live: dict) -> list[str]:
    """Human-readable diffs between the snapshot and the live rows; [] if none."""
    drift = []
    for locale in LOCALES:
        captured = snapshot["locales"].get(locale, {})
        current = live[locale]
        for field in CHECKED:
            was, now = captured.get(field), current.get(field)
            if was is None and now is None:
                continue
            # 8 and 8.0 are the same setting; compare numerically when we can.
            same = str(was) == str(now)
            if not same:
                try:
                    same = float(was) == float(now)
                except (TypeError, ValueError):
                    same = False
            if not same:
                drift.append(f"  {locale:6} {field:22} page says {was!r}, settings say {now!r}")
    return drift


def check_drift() -> tuple[str, list[str]]:
    """Compare the checked-in snapshot against the live database, safely.

    Returns (status, details):
      "in_sync" — matches; details is empty
      "drift"   — details is a list of field-level diffs
      "skipped" — details is a one-line reason the check could not run

    Never raises. A build must not depend on the database being reachable —
    that is the whole reason the page is composed from a snapshot — so this
    is a reminder, not a gate.
    """
    try:
        live = fetch_live()
    except CheckUnavailable as exc:
        return "skipped", [str(exc)]
    drift = compare(load(), live)
    return ("drift", drift) if drift else ("in_sync", [])
