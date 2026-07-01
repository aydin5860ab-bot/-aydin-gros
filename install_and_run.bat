@echo off
title AYDIN GROS OS V1.0 STABLE - INSTALLER & PROVISIONER
echo ===================================================================
echo     AYDIN GROS OS — WINDOWS LANE PRODUCTION INSTALLATION WIZARD
echo ===================================================================
echo.

echo [Step 1/5] Checking Node.js runtime compatibility...
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ ERROR: Node.js runtime is not installed! Please install Node.js v18+ first.
    pause
    exit /b 1
)
echo ✅ Node.js is present.

echo.
echo [Step 2/5] Configuring environment variables...
if exist .env.production (
    copy /y .env.production .env.local >nul
    echo ✅ Environment initialized from .env.production
) else (
    echo ⚠️ WARNING: .env.production template not found. Creating default configuration...
    echo NODE_ENV=production>.env.local
    echo FORCE_JSON_DB=true>>.env.local
    echo DEFAULT_TENANT_ID=11111111-1111-1111-1111-111111111111>>.env.local
    echo JWT_SECRET=aydingros-offline-secret-key-12345>>.env.local
    echo ALLOW_DUMMY_SIGNATURE=true>>.env.local
    echo PORT=3000>>.env.local
    echo ✅ Default configuration initialized.
)

echo.
echo [Step 3/5] Instantiating offline SQLite engines & catalog seeders...
node scripts/bootstrap_store_node.js
if %errorlevel% neq 0 (
    echo ❌ ERROR: Local database diagnostics and provisioning failed!
    pause
    exit /b 1
)

echo.
echo [Step 4/5] Compiling production build and static assets...
call npx next build
if %errorlevel% neq 0 (
    echo ❌ ERROR: Next.js static asset compilation failed!
    pause
    exit /b 1
)
echo ✅ Build compiled successfully.

echo.
echo [Step 5/5] Creating Windows Startup Watchdog launcher...
echo @echo off > start_pos.bat
echo cd /d "%~dp0" >> start_pos.bat
echo :loop >> start_pos.bat
echo echo [Watchdog] Starting store node POS lane server on port 3000... >> start_pos.bat
echo call npx next start -p 3000 >> start_pos.bat
echo echo [Watchdog] POS server crashed. Restarting in 5 seconds... >> start_pos.bat
echo timeout /t 5 >nul >> start_pos.bat
echo goto loop >> start_pos.bat

echo ✅ Startup script 'start_pos.bat' generated successfully.
echo.
echo ===================================================================
echo     🎉 AYDIN GROS OS V1.0 STABLE PROVISIONED SUCCESSFULLY!
echo ===================================================================
echo.
echo Instructions:
echo 1. To start the cash register POS lane, run: start_pos.bat
echo 2. Place a shortcut to 'start_pos.bat' in the Windows Startup folder for auto-start.
echo.
pause
