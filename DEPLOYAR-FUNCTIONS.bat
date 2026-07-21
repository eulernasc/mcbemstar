@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo ================================================
echo   MC BEM ESTAR - DEPLOY DAS CLOUD FUNCTIONS
echo ================================================
echo.
call npm --prefix functions install
if errorlevel 1 goto erro
call firebase deploy --only functions
if errorlevel 1 goto erro
echo.
echo Deploy concluido com sucesso.
pause
exit /b 0
:erro
echo.
echo O deploy encontrou um erro. Leia a mensagem acima.
pause
exit /b 1
