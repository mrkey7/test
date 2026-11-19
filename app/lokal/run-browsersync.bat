@echo off

set "BukadiPC=TRUE"
set "_port=3000"
::set "_ip=192.168.100.4"
if not defined _ip call :_getip

cd /d "%~dp0..\.."

start "" npm --prefix "%~dp0browsersync" run dev -- --host %_ip% --port %_port% --no-open --no-notify --no-ui --no-ghost-mode
if "%BukadiPC%"=="TRUE" (
	timeout /t 2 /nobreak >nul
	start "" chrome http://localhost:%_port%
)
exit /b


:_getip
for /f "tokens=3 delims=: " %%i  in ('
netsh interface ip show config name^="Wi-Fi" ^| find.exe /i "IP Address:"
') do set "_ip=%%i"
exit /b
