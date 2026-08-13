"""
Does the type-spec page still agree with Settings ▸ Typography?

    python3 apps/spechub/scripts/design/check-cjk-typography.py
    python3 apps/spechub/scripts/design/check-cjk-typography.py --update

The ja and zh-TW metrics on that page come from a checked-in snapshot, so
the page build stays offline. This is the other half of that bargain: it
compares the snapshot against the live `app_settings` rows and exits
non-zero when they have diverged, which happens silently whenever someone
saves a change in the settings UI.

The same comparison also runs (non-fatally) inside build-type-spec.py, so a
regenerate already warns you. This CLI is the standalone form — for a cron,
a pre-release check, or `--update` to recapture the snapshot after a real
settings change (re-run build-type-spec.py afterwards or the page still
shows the old numbers).

The logic lives in cjk_typography.py; this is just argparse and exit codes.
Exit codes: 0 in sync, 1 drifted, 2 could not check (no credentials, etc).
"""
import argparse
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import cjk_typography as CJK


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--update", action="store_true",
                    help="recapture the snapshot from the live settings")
    args = ap.parse_args()

    if args.update:
        CJK.capture(CJK.fetch_live())
        print(f"captured {CJK.SNAPSHOT.name} — now re-run build-type-spec.py")
        return 0

    status, details = CJK.check_drift()
    if status == "skipped":
        print(f"cannot check: {details[0]}", file=sys.stderr)
        return 2
    if status == "in_sync":
        snap = CJK.load()
        print(f"in sync — snapshot captured {CJK.captured_on(snap)}, "
              f"{len(CJK.LOCALES)} locales, {len(CJK.CHECKED)} fields each")
        return 0

    print(f"DRIFT: the type-spec page disagrees with Settings ▸ Typography "
          f"({len(details)} field(s))\n")
    print("\n".join(details))
    print("\nFix: python3 check-cjk-typography.py --update && python3 build-type-spec.py")
    return 1


if __name__ == "__main__":
    sys.exit(main())
