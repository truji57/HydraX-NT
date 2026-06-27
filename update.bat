@echo off
cd /d "%~dp0"

echo ============================
echo    HydraX-NT - Actualizacion
echo ============================
echo.

echo [1/5] Deteniendo servicios activos...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8005 ^| findstr LISTENING') do taskkill /F /PID %%a 2>nul
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5173 ^| findstr LISTENING') do taskkill /F /PID %%a 2>nul
timeout /t 1 /nobreak >nul
echo       Listo.
echo.

echo [2/5] Descargando cambios desde GitHub...
git fetch origin
git reset --hard origin/master
if %errorlevel% neq 0 (
    echo       ERROR: No se pudo conectar con GitHub. Verifica tu conexion.
    pause
    exit /b 1
)
echo       Listo.
echo.

echo [3/5] Actualizando dependencias Python...
cd /d "%~dp0backend"
where python >nul 2>&1
if %errorlevel% neq 0 (
    echo       ERROR: Python no encontrado en el PATH.
    pause
    exit /b 1
)
python -m pip install -r requirements.txt --quiet
if %errorlevel% neq 0 (
    echo       ERROR: Fallo al instalar dependencias Python.
    pause
    exit /b 1
)
echo       Listo.
echo.

echo [4/5] Actualizando dependencias Node...
cd /d "%~dp0frontend"
where npm >nul 2>&1
if %errorlevel% neq 0 (
    echo       ERROR: npm no encontrado en el PATH.
    pause
    exit /b 1
)
call npm install --silent
if %errorlevel% neq 0 (
    echo       ERROR: Fallo al instalar dependencias Node.
    pause
    exit /b 1
)
echo       Listo.
echo.

echo [5/5] Reconstruyendo frontend...
call npx vite build --logLevel error
if %errorlevel% neq 0 (
    echo       ERROR: Fallo al construir el frontend.
    pause
    exit /b 1
)
echo       Listo.
echo.

echo ============================
echo    Actualizacion completada
echo ============================
echo.
echo Ejecuta start.bat para iniciar los servicios.
echo.
set /p START="Deseas iniciar los servicios ahora? (s/n): "
if /i "%START%"=="s" (
    echo.
    call "%~dp0start.bat"
)
pause
