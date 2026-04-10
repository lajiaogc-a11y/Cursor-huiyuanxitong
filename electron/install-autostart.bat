@echo off
:: Create a shortcut in Windows Startup folder for auto-start
set STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup
set SCRIPT_DIR=%~dp0
set SHORTCUT=%STARTUP%\WhatsApp-Companion.lnk

echo Creating auto-start shortcut...

powershell -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('%SHORTCUT%'); $s.TargetPath = '%SCRIPT_DIR%companion-start.bat'; $s.WorkingDirectory = '%SCRIPT_DIR%'; $s.WindowStyle = 7; $s.Description = 'WhatsApp Companion Auto-Start'; $s.Save()"

if exist "%SHORTCUT%" (
    echo [OK] Auto-start shortcut created.
    echo     Location: %SHORTCUT%
    echo     Companion will start automatically on Windows login.
) else (
    echo [ERROR] Failed to create shortcut.
)
echo.
pause
