@echo off
cd /d "%~dp0"
echo FruitAI ruleaza la http://localhost:8000  (inchide fereastra pentru oprire)
start "" http://localhost:8000
python -m http.server 8000
