@echo off
REM Script di setup per Windows
REM Uso: setup.bat

echo 🏕️ Setup Ordini Scout - Gestione Materiale
echo ===========================================
echo.

REM Check Node.js
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ❌ Node.js non trovato. Installare da https://nodejs.org
    exit /b 1
)

for /f "tokens=*" %%i in ('node --version') do set NODE_VERSION=%%i
echo ✅ Node.js version: %NODE_VERSION%
echo.

REM Setup Backend
echo 📦 Setup Backend...
cd server

if not exist .env (
    echo 📝 Creando .env dal template...
    copy .env.example .env
    echo ⚠️  Editare server\.env con i dati SMTP prima di avviare!
)

echo 📥 Installando dipendenze backend...
call npm install

cd ..
echo ✅ Backend setup completato
echo.

REM Setup Frontend
echo 🎨 Setup Frontend...
cd client

echo 📥 Installando dipendenze frontend...
call npm install

cd ..
echo ✅ Frontend setup completato
echo.

REM Create database directory
if not exist server\database mkdir server\database

echo ===========================================
echo ✅ Setup completato con successo!
echo.
echo 📝 Prossimi step:
echo 1. Editare server\.env con le credenziali SMTP
echo 2. Eseguire in due terminali:
echo    Terminal 1: cd server ^&^& npm run dev
echo    Terminal 2: cd client ^&^& npm run dev
echo.
echo 🌐 Accedere a: http://localhost:5173
echo 📧 Credenziali Admin (default): admin@ordini-scout.it / admin123
