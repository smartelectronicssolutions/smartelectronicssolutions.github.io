<#
.SYNOPSIS
  One-shot migration: flatten public/log/visits/{ip}/{visits:[]} into push-keyed
  records, then drop dead nodes (ips, pages, contacts, public/ses/visits).

.NOTES
  Default is -DryRun. Pass -Apply to perform writes/deletes.
  Backup of public/log is always written to .\public_log_backup_<utc>.json.
#>

param(
  [switch]$Apply
)

$BASE = 'https://persinfo-df93f-default-rtdb.firebaseio.com'
$tok  = (& gcloud auth print-access-token).Trim()
if (-not $tok) { throw "Could not get gcloud access token." }
$headers = @{ Authorization = "Bearer $tok" }

function NormalizePage($url) {
  if (-not $url) { return 'unknown' }
  try {
    $u = [uri]$url
    $p = $u.AbsolutePath.TrimStart('/')
    $p = $p -replace '^luissolutions\.github\.io/', ''
    $p = $p -replace '/index\.html$', '/'
    if (-not $p) { return 'index.html' }
    return $p
  } catch { return 'unknown' }
}

Write-Host "Backing up /public/log ..."
$backup = Invoke-RestMethod -Uri "$BASE/public/log.json" -Headers $headers -Method GET
$ts = (Get-Date).ToUniversalTime().ToString('yyyyMMdd-HHmmss')
$backupPath = Join-Path (Get-Location) "public_log_backup_$ts.json"
$backup | ConvertTo-Json -Depth 50 -Compress | Out-File -FilePath $backupPath -Encoding utf8
Write-Host "  Backup written: $backupPath" -ForegroundColor Green

Write-Host "Reading /public/log/visits ..."
$visits = Invoke-RestMethod -Uri "$BASE/public/log/visits.json" -Headers $headers -Method GET

$flatPayload = [ordered]@{}
$oldKeys     = New-Object System.Collections.Generic.List[string]
$newCount    = 0
$skipped     = 0

foreach ($prop in $visits.PSObject.Properties) {
  $key = $prop.Name
  $val = $prop.Value

  # Skip already-flattened entries (those have direct .url/.time/.page properties at the top)
  if ($val.PSObject.Properties.Name -contains 'url' -or $val.PSObject.Properties.Name -contains 'page') {
    continue
  }
  if (-not ($val.PSObject.Properties.Name -contains 'visits')) { continue }

  $ip = if ($val.ip) { $val.ip } else { $key -replace '-', '.' }

  foreach ($v in $val.visits) {
    $url  = [string]$v.url
    $time = [string]$v.time
    if (-not $time) { $skipped++; continue }

    $page = NormalizePage $url
    try {
      $epoch = [int64](([datetimeoffset]$time).ToUnixTimeMilliseconds())
    } catch {
      $skipped++; continue
    }
    $rand   = '{0:X4}' -f (Get-Random -Maximum 65535)
    $pushId = '-MIG' + ('{0:D13}' -f $epoch) + $rand

    $flatPayload[$pushId] = @{ ip = $ip; page = $page; url = $url; time = $time }
    $newCount++
  }
  $oldKeys.Add($key) | Out-Null
}

Write-Host ""
Write-Host "Summary:" -ForegroundColor Cyan
Write-Host "  Old per-IP buckets to migrate: $($oldKeys.Count)"
Write-Host "  Flat records to write:         $newCount"
Write-Host "  Skipped (bad time/url):        $skipped"
Write-Host "  Dead nodes to delete:          public/log/ips, public/log/pages, public/log/contacts, public/ses/visits"

if (-not $Apply) {
  Write-Host ""
  Write-Host "DRY RUN -- pass -Apply to perform writes." -ForegroundColor Yellow
  return
}

Write-Host ""
Write-Host "Applying migration ..." -ForegroundColor Yellow

# 1. PATCH new flat records (additive, no overwrite of siblings)
if ($newCount -gt 0) {
  $body = ($flatPayload | ConvertTo-Json -Depth 5 -Compress)
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($body)
  Invoke-RestMethod -Uri "$BASE/public/log/visits.json" -Headers $headers `
    -Method PATCH -Body $bytes -ContentType 'application/json; charset=utf-8' | Out-Null
  Write-Host "  PATCH inserted $newCount flat records"
}

# 2. Delete each old per-IP bucket
foreach ($k in $oldKeys) {
  Invoke-RestMethod -Uri "$BASE/public/log/visits/$k.json" -Headers $headers -Method DELETE | Out-Null
}
Write-Host "  Deleted $($oldKeys.Count) old per-IP buckets"

# 3. Delete dead aggregate/leak nodes
foreach ($path in @('public/log/ips', 'public/log/pages', 'public/log/contacts', 'public/ses/visits')) {
  try {
    Invoke-RestMethod -Uri "$BASE/$path.json" -Headers $headers -Method DELETE | Out-Null
    Write-Host "  Deleted /$path"
  } catch {
    Write-Host "  /$path delete failed (already null?): $_" -ForegroundColor DarkYellow
  }
}

Write-Host ""
Write-Host "Migration complete." -ForegroundColor Green
Write-Host "Backup retained at: $backupPath" -ForegroundColor Green
