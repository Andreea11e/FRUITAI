#!/bin/sh
cd "$(dirname "$0")"
URL="http://localhost:8000"
echo "FruitAI ruleaza la $URL  (Ctrl+C pentru oprire)"
( sleep 1; (command -v open >/dev/null && open "$URL") || (command -v xdg-open >/dev/null && xdg-open "$URL") ) &
python3 -m http.server 8000
