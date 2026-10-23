# Restart Server Script
# This will kill any process using port 3000 and restart the server

$currentDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $currentDir

Write-Host "[*] Mencari process di port 3000..." -ForegroundColor Yellow

# Find process using port 3000
$process = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess

if ($process) {
    Write-Host "[+] Ditemukan process ID: $process" -ForegroundColor Green
    Write-Host "[*] Stopping process..." -ForegroundColor Yellow
    
    # Kill the process
    Stop-Process -Id $process -Force -ErrorAction SilentlyContinue
    
    Write-Host "[+] Process berhasil di-stop!" -ForegroundColor Green
    Start-Sleep -Seconds 2
} else {
    Write-Host "[i] Tidak ada process di port 3000" -ForegroundColor Cyan
}

Write-Host "[*] Starting server in background..." -ForegroundColor Yellow
Start-Process node -ArgumentList "server/server.js" -WorkingDirectory $currentDir -WindowStyle Hidden
Start-Sleep -Seconds 3
Write-Host "[+] Server restarted successfully on port 3000!" -ForegroundColor Green
