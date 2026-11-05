param(
  [string]$OutDir = "backups"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $OutDir)) {
  New-Item -ItemType Directory -Path $OutDir | Out-Null
}

$ts = Get-Date -Format "yyyyMMdd-HHmmss"
$file = Join-Path $OutDir "cms-$ts.sql"

Write-Host "Backing up to $file..."

# docker exec pg_dump → stdout → file
docker compose exec -T db pg_dump -U cms -d cms | Out-File -FilePath $file -Encoding utf8

$size = (Get-Item $file).Length
Write-Host "Done. $([math]::Round($size / 1KB, 1)) KB written."