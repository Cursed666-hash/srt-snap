$c = Get-Content "d:\Dev\file repair app\src\styles.css" -Raw
$rgbaChecks = @(
    @{pattern='rgba\(255, 107, 53,'; name='Orange Primary rgba'}
    @{pattern='rgba\(255, 183, 3,'; name='Yellow Primary rgba'}
    @{pattern='rgba\(46, 196, 182,'; name='Teal Primary rgba'}
)
$found = $false
foreach($check in $rgbaChecks) {
    $cnt = ([regex]::Matches($c, $check.pattern)).Count
    if($cnt -gt 0) {
        Write-Host "REMAINING: $($check.name) ($cnt)" -ForegroundColor Red
        $found = $true
    } else {
        Write-Host "OK: $($check.name)" -ForegroundColor Green
    }
}
if(!$found) { Write-Host "ALL RGBA REPLACED!" -ForegroundColor Green }
Write-Host "File size: $($c.Length) bytes" -ForegroundColor Cyan