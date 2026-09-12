#!/bin/bash
PORT=8000
cd "$(dirname "$0")" || exit 1
if [ -f "index.html" ]; then
  PAGE="http://localhost:$PORT/"
else
  echo; echo "  Could not find the tool in this folder:"; echo "  $(pwd)"; echo
  read -r -p "  Press Return to close." _; exit 1
fi
if curl -s --max-time 2 "http://localhost:$PORT/" -o /tmp/dsc-probe.$$ 2>/dev/null; then
  if grep -q "Drive sharing check" /tmp/dsc-probe.$$ 2>/dev/null; then
    rm -f /tmp/dsc-probe.$$; echo "  Already running. Opening the page."; open "$PAGE"; exit 0
  fi
  rm -f /tmp/dsc-probe.$$
  echo; echo "  Port $PORT is used by something else. It has to be $PORT -"
  echo "  the only address Google accepts for sign-in. Quit that app and retry."
  echo; echo "  To find it:  lsof -nP -iTCP:$PORT -sTCP:LISTEN"; echo
  read -r -p "  Press Return to close." _; exit 1
fi
rm -f /tmp/dsc-probe.$$
if ! command -v python3 >/dev/null 2>&1; then
  echo; echo "  python3 missing. Run: xcode-select --install"; echo
  read -r -p "  Press Return to close." _; exit 1
fi
echo; echo "  Drive sharing check is running."; echo "  Page:   $PAGE"
echo "  Folder: $(pwd)"; echo; echo "  Leave this window open. Close it to stop."; echo
( sleep 1; open "$PAGE" ) &
python3 -m http.server "$PORT"
