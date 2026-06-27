@echo off
cd /d "%~dp0backend"

echo Starting HydraX-NT Backend on http://localhost:8001...
echo.

python -m uvicorn app.main:app --host 0.0.0.0 --port 8001 --log-level info

echo.
echo BACKEND STOPPED - Check error above
pause
