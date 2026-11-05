param(
  [Parameter(Mandatory=$true)]
  [string]$File
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $File)) {
  throw "File not found: $File"
}

Write-Host "This will OVERWRITE the current database. Type 'yes' to continue."
$confirm = Read-Host
if ($confirm -ne "yes") { Write-Host "Aborted."; exit }

Write-Host "Restoring from $File..."

Get-Content $File -Raw | docker compose exec -T db psql -U cms -d cms

Write-Host "Restore complete."