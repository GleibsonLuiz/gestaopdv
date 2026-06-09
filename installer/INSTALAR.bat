@echo off
REM Launcher do instalador GestaoProMax. Da dois cliques aqui.
REM Chama o script PowerShell ao lado (que pede admin sozinho).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0instalar-gestaopromax.ps1"
