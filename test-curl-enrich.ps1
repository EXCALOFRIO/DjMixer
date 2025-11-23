# Test Enrich Gemini - Versión PowerShell con FormData
# Uso: .\test-curl-enrich.ps1 "ruta/al/archivo.mp3"

param(
    [Parameter(Mandatory=$true)]
    [string]$ArchivoAudio
)

if (!(Test-Path $ArchivoAudio)) {
    Write-Host "❌ Archivo no encontrado: $ArchivoAudio" -ForegroundColor Red
    exit 1
}

Write-Host "🎵 Enviando archivo a Gemini: $ArchivoAudio" -ForegroundColor Cyan

# Curl con FormData (el -F envía multipart/form-data)
curl.exe "http://localhost:9002/api/enrich-gemini" `
  -X POST `
  -F "file=@$ArchivoAudio" `
  -H "Accept: application/json"

Write-Host "`n✅ Petición completada" -ForegroundColor Green
