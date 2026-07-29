<#
.SYNOPSIS
  Re-bucket flat public/log/visits/{pushId} records into per-IP nodes:
    public/log/visits/{sanitizedIp}/
      ip, firstSeen, lastSeen, lastPage, count
      hits/{pushId}: { time, url, page }

.NOTES
  Default is -DryRun. Pass -Apply to perform writes/deletes.
  A backup is always written to .\public_log_backup_<utc>.json first.
#>

param(
  [switch]$Apply
)

$BASE = 'https://persinfo-df93f-default-rtdb.firebaseio.com'
$tok  = (& gcloud auth print-access-token).Trim()
if (-not $tok) { throw "Could not get gcloud access token." }
$headers = @{ Authorization = "Bearer $tok" }

function SanitizeIp($ip) {
  if (-not $ip) { return 'unknown' }
  return ($ip -replace '[.:]', '-' -replace '[#$\[\]/]', '_')
}

Write-Host "Backing up /public/log ..."
$backup = Invoke-RestMethod -Uri "$BASE/public/log.json" -Headers $headers -Method GET
$ts = (Get-Date).ToUniversalTime().ToString('yyyyMMdd-HHmmss')
$backupPath = Join-Path (Get-Location) "public_log_backup_$ts.json"
$backup | ConvertTo-Json -Depth 50 -Compress | Out-File -FilePath $backupPath -Encoding utf8
Write-Host "  Backup written: $backupPath" -ForegroundColor Green

Write-Host "Reading /public/log/visits ..."
$visits = Invoke-RestMethod -Uri "$BASE/public/log/visits.json" -Headers $headers -Method GET

# Aggregate into per-IP buckets
$buckets    = @{}   # sanitizedIp -> @{ ip, firstSeen, lastSeen, lastPage, count, hits = @{ pushId -> {time,url,page} } }
$flatKeys   = New-Object System.Collections.Generic.List[string]
$skippedKeys = 0

foreach ($prop in $visits.PSObject.Properties) {
  $key = $prop.Name
  $val = $prop.Value
  if (-not $val -or -not ($val.PSObject.Properties.Name -contains 'ip')) { continue }

  # Flat shape: top-level has url/time/page directly
  $isFlat = ($val.PSObject.Properties.Name -contains 'time' -and $val.PSObject.Properties.Name -contains 'url')
  if (-not $isFlat) {
    # Already in per-IP shape — skip
    $skippedKeys++
    continue
  }

  $ip   = [string]$val.ip
  $sip  = SanitizeIp $ip
  $time = [string]$val.time
  $url  = [string]$val.url
  $page = if ($val.PSObject.Properties.Name -contains 'page') { [string]$val.page } else { '' }

  if (-not $buckets.ContainsKey($sip)) {
    $buckets[$sip] = @{
      ip        = $ip
      firstSeen = $time
      lastSeen  = $time
      lastPage  = $page
      count     = 0
      hits      = [ordered]@{}
    }
  }
  $b = $buckets[$sip]
  $b.hits[$key] = @{ time = $time; url = $url; page = $page }
  $b.count++
  if ($time -lt $b.firstSeen) { $b.firstSeen = $time }
  if ($time -gt $b.lastSeen)  { $b.lastSeen  = $time; $b.lastPage = $page }
  $flatKeys.Add($key) | Out-Null
}

Write-Host ""
Write-Host "Summary:" -ForegroundColor Cyan
Write-Host "  Flat records to re-bucket: $($flatKeys.Count)"
Write-Host "  Distinct IPs after bucket: $($buckets.Count)"
Write-Host "  Already-per-IP keys kept:  $skippedKeys"

if (-not $Apply) {
  Write-Host ""
  Write-Host "DRY RUN -- pass -Apply to perform writes." -ForegroundColor Yellow
  return
}

Write-Host ""
Write-Host "Applying ..." -ForegroundColor Yellow

# 1. PATCH per-IP nodes additively. (PATCH at /public/log/visits with sanitized-ip keys.)
#    We chunk by IP to keep request bodies small.
$applied = 0
foreach ($sip in $buckets.Keys) {
  $b = $buckets[$sip]
  $patch = @{ $sip = $b }
  $body = $patch | ConvertTo-Json -Depth 10 -Compress
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($body)
  Invoke-RestMethod -Uri "$BASE/public/log/visits.json" -Headers $headers `
    -Method PATCH -Body $bytes -ContentType 'application/json; charset=utf-8' | Out-Null
  $applied++
}
Write-Host "  PATCH wrote $applied per-IP buckets"

# 2. Delete each flat top-level key
foreach ($k in $flatKeys) {
  Invoke-RestMethod -Uri "$BASE/public/log/visits/$k.json" -Headers $headers -Method DELETE | Out-Null
}
Write-Host "  Deleted $($flatKeys.Count) flat top-level keys"

Write-Host ""
Write-Host "Re-bucket complete." -ForegroundColor Green
Write-Host "Backup retained at: $backupPath" -ForegroundColor Green
