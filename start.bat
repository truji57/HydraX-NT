@echo off
cd /d "%~dp0"

echo ============================
echo    HydraX-NT - NinjaTrader Copier
echo ============================
echo.
echo Arrancando...

start "HydraX-NT Backend" cmd /c "cd /d %~dp0backend && C:\Users\danit\AppData\Local\Programs\Python\Python311\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8002"
timeout /t 3 /nobreak >nul
start "HydraX-NT Frontend" cmd /c "cd /d %~dp0frontend && npx vite --host 0.0.0.0 --port 5173"
timeout /t 2 /nobreak >nul
start http://localhost:5173

echo.
echo Backend:  http://localhost:8002
echo Frontend: http://localhost:5173
echo API Docs: http://localhost:8001/docs
echo.
pause
