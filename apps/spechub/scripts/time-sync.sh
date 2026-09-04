#!/bin/zsh
# Wall-clock a forced sync of one or more product lines against a deployment.
#
#   CRON_SECRET=… BASE=https://<spechub-host> apps/spechub/scripts/time-sync.sh "Cloud Camera" "Cloud AP"
#
# Takes the secret and the host from the environment on purpose: nothing here
# pulls or stores them. Each line is run twice so the second number is a warm
# instance. A forced sync is idempotent — same images re-uploaded, spec
# sections rewritten to the same rows — but it is real work on the real
# database, the same the daily 09:00 cron does plus image re-downloads.
#
# Companion to pagination-impact.ts: change the sync, run this before and
# after, and put the numbers in docs/datasheet-sync.md instead of guessing.
set -u
: "${CRON_SECRET:?set CRON_SECRET}"; : "${BASE:?set BASE, e.g. https://ds-generator-eg.vercel.app}"
[ $# -ge 1 ] || { echo "usage: CRON_SECRET=… BASE=… $0 \"<line name>\" [more lines]"; exit 2; }
for line in "$@"; do
  enc=$(python3 -c 'import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))' "$line")
  for i in 1 2; do
    s=$(date +%s.%N)
    body=$(curl -s --max-time 330 -X POST -H "Authorization: Bearer $CRON_SECRET" \
      -w '\n%{http_code}' "${BASE%/}/api/sync?force=true&line=$enc")
    e=$(date +%s.%N)
    code=${body##*$'\n'}; json=${body%$'\n'*}
    summary=$(python3 -c 'import json,sys
try:
    r=json.loads(sys.argv[1]).get("results",[{}])[0]
    print(f"synced={len(r.get(\"synced\",[]))} errors={len(r.get(\"errors\",[]))} skipped={r.get(\"skipped\",False)}")
except Exception as ex: print(f"(unparsed: {ex})")' "$json")
    printf '%-24s run%d  http=%s  %6.1fs  %s\n' "$line" "$i" "$code" "$(python3 -c "print($e-$s)")" "$summary"
    sleep 5
  done
done
