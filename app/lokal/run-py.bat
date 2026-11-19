@echo off
setlocal

cd /d "%~dp0..\.."
::echo [%cd%]&pause 

set "_port=8007"
start "Istighosah" python -m http.server %_port%
timeout /t 1 /nobreak >nul
start "" http://localhost:%_port%

endlocal
