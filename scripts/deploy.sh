#!/bin/sh
# Deploy the tool to production, and check what landed.
#
#   sh scripts/deploy.sh
#
# WHY THIS EXISTS, rather than just running `vercel deploy --prod` here.
#
# The CLI reads the working directory's git remote and tries to associate the
# deployment with that repository. This repo's remote is a private GitHub repo
# that the Vercel account cannot read, so the call hangs and the deploy dies at
# "Building…" with "fetch failed" — an error that says nothing about git.
#
# Established by bisection, not by guessing. Three earlier explanations were
# wrong and were each disproved by deploying a directory that isolated them:
#   index.html alone                      deployed fine
#   + package.json + .vercelignore        deployed fine
#   + node_modules (1,517 files)          deployed fine
#   a full copy of this repo, .git kept, remote removed   deployed fine
#   this directory, remote present        failed, every time
# The timeline agrees: every deploy before the GitHub remote existed succeeded,
# and every one after it failed.
#
# Nothing is lost by staging. `vercel deploy --dry` reports fileCount 1 — only
# index.html is ever uploaded, because .vercelignore is an allowlist. This
# script uploads that same single file from a directory with no git remote.
set -e

cd "$(dirname "$0")/.."
ROOT=$(pwd)

if [ ! -f .vercel/project.json ]; then
  echo "No .vercel/project.json — run 'vercel link' first." >&2
  exit 1
fi

STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT
mkdir -p "$STAGE/.vercel"
cp index.html "$STAGE/"
cp .vercel/project.json "$STAGE/.vercel/"

echo "Deploying $(grep -o 'id="buildStamp"[^<]*' index.html | sed 's/.*>//')"
cd "$STAGE"
vercel deploy --prod --yes

# The build stamp exists because a stale cache cost two rounds of debugging a
# bug that was already fixed. Confirm the live page is the file we just sent.
URL=https://drive-sharing-check.vercel.app
WANT=$(grep -o 'id="buildStamp"[^<]*' "$ROOT/index.html" | sed 's/.*>//')
GOT=$(curl -s --max-time 30 "$URL/" | grep -o 'id="buildStamp"[^<]*' | sed 's/.*>//')

echo
if [ "$WANT" = "$GOT" ]; then
  echo "live: $GOT"
else
  echo "MISMATCH — the alias is not serving what was just deployed." >&2
  echo "  sent: $WANT" >&2
  echo "  live: $GOT" >&2
  exit 1
fi

# The repo carries internal notes. They must never be reachable from the site.
for path in /CLAUDE.md /README.md /docs/change-map.md /package.json; do
  CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$URL$path")
  if [ "$CODE" != "404" ]; then
    echo "LEAK — $path returned $CODE, expected 404." >&2
    exit 1
  fi
done
echo "internal files: all 404"
