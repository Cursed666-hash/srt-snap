$c = Get-Content "d:\Dev\file repair app\src\styles.css" -Raw
$ocs = @('#FF6B35','#FFB703','#2EC4B6','#0F172A','#1E293B','#334155','#F8FAFC','#E2E8F0','#94A3B8','#64748B')
$found = $false
foreach($o in $ocs) {
    $cnt = ([regex]::Matches($c, [regex]::Escape($o))).Count
    if($cnt -gt 0) {
        Write-Host "REMAINING: $o ($cnt)" -ForegroundColor Red
        $found = $true
    } else {
        Write-Host "OK: $o" -ForegroundColor Green
    }
}
if(!$found) {
    Write-Host "ALL REPLACED!" -ForegroundColor Green
}
