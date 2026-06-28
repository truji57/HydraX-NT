@echo off
echo ============================
echo    HydraX-NT - Instalacion
echo ============================
echo.

echo [1/4] Clonando repositorio...
where git >nul 2>&1
if %errorlevel% neq 0 (
    echo       ERROR: Git no esta instalado. Descargalo de https://git-scm.com
    pause
    exit /b 1
)
git clone https://github.com/truji57/HydraX-NT.git
if %errorlevel% neq 0 (
    echo       ERROR: No se pudo clonar. Verifica que el repositorio es publico.
    pause
    exit /b 1
)
cd /d "%~dp0HydraX-NT"
echo       Listo.
echo.

echo [2/4] Instalando dependencias Python...
where python >nul 2>&1
if %errorlevel% neq 0 (
    echo       ERROR: Python no encontrado. Instalalo de https://python.org
    pause
    exit /b 1
)
cd backend
python -m pip install -r requirements.txt --quiet
if %errorlevel% neq 0 (
    echo       ERROR: Fallo al instalar dependencias Python.
    pause
    exit /b 1
)
cd ..
echo       Listo.
echo.

echo [3/4] Instalando dependencias Node...
where npm >nul 2>&1
if %errorlevel% neq 0 (
    echo       ERROR: npm no encontrado. Instala Node.js de https://nodejs.org
    pause
    exit /b 1
)
cd frontend
call npm install --silent
if %errorlevel% neq 0 (
    echo       ERROR: Fallo al instalar dependencias Node.
    pause
    exit /b 1
)
cd ..
echo       Listo.
echo.

echo [4/4] Construyendo frontend...
cd frontend
call npx vite build --logLevel error
if %errorlevel% neq 0 (
    echo       ERROR: Fallo al construir el frontend.
    pause
    exit /b 1
)
cd ..
echo       Listo.
echo.

echo ============================
echo    Instalacion completada
echo ============================
echo.
if not exist "%USERPROFILE%\Documents\NinjaTrader 8\hydrax_config.json" (
    echo {"port": 5555}> "%USERPROFILE%\Documents\NinjaTrader 8\hydrax_config.json"
    echo Creado hydrax_config.json con puerto 5555
    echo.
)
echo Pasos siguientes:
echo   1. Copia bridge\NT8HydraX.cs a Documentos\NinjaTrader 8\bin\Custom\AddOns\
echo   2. En NT8: NinjaScript Editor - F5 (Compilar)
echo   3. Si quieres cambiar el puerto, edita:
echo      Documentos\NinjaTrader 8\hydrax_config.json
echo   4. En HydraX, pon el mismo puerto en cada cuenta
echo   5. Ejecuta start.bat para iniciar
echo   6. Abre http://localhost:5173
echo.
pause
