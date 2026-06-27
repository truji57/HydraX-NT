@echo off
cd /d "%~dp0"

echo ============================
echo    HydraX-NT - NinjaTrader Copier
echo ============================
echo.
echo Arrancando...

start "HydraX-NT Bridge" cmd /c "cd bridge && dotnet run"
timeout /t 2 /nobreak >nul
start "HydraX-NT Backend" cmd /c "cd backend && python -m uvicorn app.main:app --host 0.0.0.0 --port 8001"
timeout /t 3 /nobreak >nul
start "HydraX-NT Frontend" cmd /c "cd frontend && npx vite --host 0.0.0.0 --port 5173"
timeout /t 2 /nobreak >nul
start http://localhost:5173

echo.
echo Bridge:   localhost:5555
echo Backend:  http://localhost:8001
echo Frontend: http://localhost:5173
echo API Docs: http://localhost:8001/docs
echo.
pause
