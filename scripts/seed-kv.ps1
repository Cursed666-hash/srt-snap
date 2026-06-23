# =============================================
# SRT Snap — Seed KV Namespace Script
# Run this after creating your KV namespace
# and before first login attempt
# =============================================

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  SRT Snap — Seed KV Namespace" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# ---- Configuration ----
# Replace these with your actual values:
$KV_BINDING = "SRT_SNAP_DATA"
$PROJECT_NAME = "srt-snap"

# Admin credentials (match secret-config.js)
$ADMIN_USERNAME = "admin"
$ADMIN_PASSWORD = "Teal-Lion-Tamer-Cup-184372"  # <-- CHANGE THIS
$ADMIN_EMAIL = "SpoiledAvocado.discord@gmail.com"
$ADMIN_IS_PRO = "true"

Write-Host "[1/4] Checking Wrangler installation..." -ForegroundColor Yellow
try {
    $wranglerVersion = & wrangler --version 2>&1 | Out-String
    Write-Host "  ✓ Wrangler installed: $($wranglerVersion.Trim())" -ForegroundColor Green
} catch {
    Write-Host "  ✗ Wrangler not found. Install with: npm install -g wrangler" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "[2/4] Computing password hash..." -ForegroundColor Yellow

# Generate the password hash using Node.js
$hashScript = @"
const str = process.argv[1];
let hash = 0;
for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
}
console.log(Math.abs(hash).toString(16).padStart(8, '0'));
"@

$hashInput = "$ADMIN_USERNAME`:$ADMIN_PASSWORD`:ADMIN_SALT_2024"
$passwordHash = & node -e $hashScript $hashInput 2>$null

if (-not $passwordHash) {
    Write-Host "  ⚠ Could not compute hash with Node.js. Using fallback." -ForegroundColor Yellow
    Write-Host "  Run this in browser console and update the command manually:"
    Write-Host "  simpleHash('$hashInput')" -ForegroundColor Gray
    $passwordHash = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
}
Write-Host "  ✓ Password hash computed: $passwordHash" -ForegroundColor Green

Write-Host ""
Write-Host "[3/4] Seeding admin config to KV..." -ForegroundColor Yellow

$adminJson = "{`"username`":`"$ADMIN_USERNAME`",`"passwordHash`":`"$passwordHash`",`"email`":`"$ADMIN_EMAIL`",`"isPro`":$ADMIN_IS_PRO}"

Write-Host "  Admin data: $adminJson" -ForegroundColor Gray

try {
    $result = & wrangler kv:key put --binding=$KV_BINDING "admin" $adminJson 2>&1 | Out-String
    Write-Host "  ✓ Admin config seeded successfully!" -ForegroundColor Green
    Write-Host "  $($result.Trim())" -ForegroundColor Gray
} catch {
    Write-Host "  ✗ Failed to seed KV. Error: $_" -ForegroundColor Red
    Write-Host ""
    Write-Host "  Try running this command manually:" -ForegroundColor Yellow
    Write-Host "  wrangler kv:key put --binding=$KV_BINDING admin '$adminJson'" -ForegroundColor Gray
}

Write-Host ""
Write-Host "[4/4] Verifying seed..." -ForegroundColor Yellow

try {
    $verify = & wrangler kv:key get --binding=$KV_BINDING "admin" 2>&1 | Out-String
    if ($verify -match "username") {
        Write-Host "  ✓ Admin config verified in KV!" -ForegroundColor Green
    } else {
        Write-Host "  ⚠ Could not verify. Response: $($verify.Trim())" -ForegroundColor Yellow
    }
} catch {
    Write-Host "  ⚠ Verification failed: $_" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Seeding complete!" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor White
Write-Host "  1. Deploy to Cloudflare Pages: wrangler pages publish . --project-name=$PROJECT_NAME" -ForegroundColor Gray
Write-Host "  2. Bind KV to your Pages project (see CLOUDFLARE_SETUP.md)" -ForegroundColor Gray
Write-Host "  3. Set CLOUDFLARE_API_URL in src/secret-config.js" -ForegroundColor Gray
Write-Host "  4. Test login with username: $ADMIN_USERNAME" -ForegroundColor Gray
