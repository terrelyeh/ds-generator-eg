"""
Does the type-spec page still agree with Settings ▸ Typography?

    python3 apps/spechub/scripts/design/check-cjk-typography.py
    python3 apps/spechub/scripts/design/check-cjk-typography.py --update

The ja and zh-TW metrics on that page come from a checked-in snapshot, so
the page build stays offline. This is the other half of that bargain: it
compares the snapshot against the live `app_settings` rows and exits
non-zero when they have diverged, which happens silently whenever someone
saves a change in the settings UI.

`--update` recaptures the snapshot. Re-run `build-type-spec.py` afterwards
or the page still shows the old numbers.

Exit codes: 0 in sync, 1 drifted, 2 could not check (no credentials, etc).
"""
import argparse
import datetime
import json
import pathlib
import sys
import urllib.error
import urllib.parse
import urllib.request

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import cjk_typography as CJK

ENV = pathlib.Path(__file__).resolve().parents[2] / ".env.local"
# Everything the page states. A field the page does not show is not checked —
# drift there is invisible to readers and not worth failing over.
CHECKED = [
    "font_family", "headline_size", "headline_weight", "subtitle_size",
    "section_title_size", "overview_size", "overview_weight",
    "features_size", "features_weight", "spec_label_size",
    "spec_label_weight", "spec_value_weight", "footer_size", "letter_spacing",
]


def env(name: str) -> str | None:
    if not ENV.exists():
        return None
    for line in ENV.read_text().splitlines():
        if line.startswith(f"{name}="):
            return line.split("=", 1)[1].strip().strip("\"'")
    return None


def fetch_live() -> dict:
    """The `typography_<locale>` rows, straight from PostgREST."""
    url, key = env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise SystemExit(
            "cannot check: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY "
            f"not found in {ENV}"
        )
    keys = ",".join(f"typography_{loc}" for loc in CJK.LOCALES)
    query = f"{url}/rest/v1/app_settings?key=in.({keys})&select=key,value"
    req = urllib.request.Request(query, headers={"apikey": key, "Authorization": f"Bearer {key}"})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            payload = json.loads(resp.read())
    except urllib.error.URLError as exc:
        raise SystemExit(f"cannot check: {exc}") from exc

    out = {}
    for entry in payload:
        locale = entry["key"].removeprefix("typography_")
        value = entry["value"]
        out[locale] = json.loads(value) if isinstance(value, str) else value
    missing = [loc for loc in CJK.LOCALES if loc not in out]
    if missing:
        raise SystemExit(f"cannot check: no app_settings row for {', '.join(missing)}")
    return out


def compare(snapshot: dict, live: dict) -> list[str]:
    drift = []
    for locale in CJK.LOCALES:
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


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--update", action="store_true",
                    help="recapture the snapshot from the live settings")
    args = ap.parse_args()

    live = fetch_live()

    if args.update:
        CJK.SNAPSHOT.write_text(json.dumps({
            "captured": datetime.date.today().isoformat(),
            "source": "app_settings.typography_<locale> (Settings ▸ Typography)",
            "locales": {loc: live[loc] for loc in CJK.LOCALES},
        }, ensure_ascii=False, indent=2, sort_keys=True) + "\n")
        print(f"captured {CJK.SNAPSHOT.name} — now re-run build-type-spec.py")
        return 0

    snapshot = CJK.load()
    drift = compare(snapshot, live)
    if not drift:
        print(f"in sync — snapshot captured {CJK.captured_on(snapshot)}, "
              f"{len(CJK.LOCALES)} locales, {len(CHECKED)} fields each")
        return 0

    print(f"DRIFT: the type-spec page disagrees with Settings ▸ Typography "
          f"({len(drift)} field(s))\n")
    print("\n".join(drift))
    print("\nFix: python3 check-cjk-typography.py --update && python3 build-type-spec.py")
    return 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except SystemExit as exc:
        if isinstance(exc.code, str):
            print(exc.code, file=sys.stderr)
            sys.exit(2)
        raise
