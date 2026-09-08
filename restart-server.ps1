# Restart Server Script
# This will kill any process using port 3000 and restart the server

Write-Host "🔍 Mencari process di port 3000..." -ForegroundColor Yellow

# Find process using port 3000
$process = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess

if ($process) {
    Write-Host "✅ Ditemukan process ID: $process" -ForegroundColor Green
    Write-Host "🛑 Stopping process..." -ForegroundColor Yellow
    
    # Kill the process
    Stop-Process -Id $process -Force
    
    Write-Host "✅ Process berhasil di-stop!" -ForegroundColor Green
    Start-Sleep -Seconds 2
} else {
    Write-Host "ℹ️ Tidak ada process di port 3000" -ForegroundColor Cyan
}

Write-Host "🚀 Starting server..." -ForegroundColor Yellow
Write-Host ""

# Start the server
node server/server.js
