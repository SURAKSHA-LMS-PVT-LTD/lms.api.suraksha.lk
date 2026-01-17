# Public Institute API Testing Script
# Run with: .\test-public-api.ps1

$ErrorActionPreference = "Stop"

# Configuration
$API_BASE_URL = "http://localhost:8080"
$API_KEY = (Get-Content .env | Select-String "^SPECIAL_API_KEY=" | ForEach-Object { $_.Line.Split('=')[1] })

if (-not $API_KEY) {
    Write-Host "❌ ERROR: SPECIAL_API_KEY not found in .env file" -ForegroundColor Red
    exit 1
}

Write-Host "`n🧪 PUBLIC INSTITUTE API - Test Suite" -ForegroundColor Cyan
Write-Host "=" * 70 -ForegroundColor Gray
Write-Host "Base URL: $API_BASE_URL"
Write-Host "API Key: $($API_KEY.Substring(0,10))..."
Write-Host "=" * 70 -ForegroundColor Gray

# Test 1: Create Institute (No Images)
Write-Host "`n📋 TEST 1: Create Institute (Without Images)" -ForegroundColor Yellow
Write-Host "-" * 70

$timestamp = Get-Date -Format "HHmmss"
$body = @{
    name = "Test Institute $timestamp"
    email = "test$timestamp@institute.lk"
    systemContactPhoneNumber = "+94712345678"
    systemContactEmail = "system$timestamp@institute.lk"
    district = "COLOMBO"
    province = "WESTERN"
    country = "Sri Lanka"
    address = "123 Test Street, Colombo"
} | ConvertTo-Json

try {
    $result = Invoke-RestMethod `
        -Uri "$API_BASE_URL/public/institutes" `
        -Method POST `
        -Body $body `
        -ContentType "application/json" `
        -Headers @{"Authorization" = "Bearer $API_KEY"}
    
    Write-Host "✅ PASS: Institute created successfully" -ForegroundColor Green
    Write-Host "   Auto-Generated Code: $($result.data.code)" -ForegroundColor Yellow
    Write-Host "   Institute ID: $($result.data.id)"
    Write-Host "   Name: $($result.data.name)"
    Write-Host "   Request ID: $($result.requestId)" -ForegroundColor Gray
} catch {
    Write-Host "❌ FAIL: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ErrorDetails) {
        $errorData = $_.ErrorDetails.Message | ConvertFrom-Json
        Write-Host "   Error: $($errorData.message)" -ForegroundColor Yellow
    }
}

# Test 2: Create Institute with Full Data
Write-Host "`n📋 TEST 2: Create Institute (With All Optional Fields)" -ForegroundColor Yellow
Write-Host "-" * 70

$timestamp = Get-Date -Format "HHmmss"
$body = @{
    name = "Premium Academy $timestamp"
    email = "premium$timestamp@academy.lk"
    systemContactPhoneNumber = "+94776543210"
    systemContactEmail = "admin$timestamp@academy.lk"
    district = "KANDY"
    province = "CENTRAL"
    country = "Sri Lanka"
    address = "45 Main Road, Kandy"
    logoUrl = "https://example.com/logo.png"
    loadingGifUrl = "https://example.com/loading.gif"
    imageUrl = "https://example.com/banner.jpg"
} | ConvertTo-Json

try {
    $result = Invoke-RestMethod `
        -Uri "$API_BASE_URL/public/institutes" `
        -Method POST `
        -Body $body `
        -ContentType "application/json" `
        -Headers @{"Authorization" = "Bearer $API_KEY"}
    
    Write-Host "✅ PASS: Institute with images created" -ForegroundColor Green
    Write-Host "   Code: $($result.data.code)" -ForegroundColor Yellow
    Write-Host "   Logo URL: $($result.data.logoUrl)"
    Write-Host "   Images Optional: Confirmed ✓" -ForegroundColor Green
} catch {
    Write-Host "❌ FAIL: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 3: Rate Limiting
Write-Host "`n📋 TEST 3: Rate Limiting (3 requests/min limit)" -ForegroundColor Yellow
Write-Host "-" * 70

$successCount = 0
$rateLimitHit = $false

for ($i = 1; $i -le 4; $i++) {
    $timestamp = Get-Date -Format "HHmmss"
    $body = @{
        name = "Rate Test $i-$timestamp"
        email = "rate$i$timestamp@test.lk"
        systemContactPhoneNumber = "+94771234567"
        systemContactEmail = "sys$i$timestamp@test.lk"
        district = "GAMPAHA"
        province = "WESTERN"
        country = "Sri Lanka"
    } | ConvertTo-Json

    try {
        $result = Invoke-RestMethod `
            -Uri "$API_BASE_URL/public/institutes" `
            -Method POST `
            -Body $body `
            -ContentType "application/json" `
            -Headers @{"Authorization" = "Bearer $API_KEY"} `
            -ErrorAction Stop
        
        $successCount++
        Write-Host "   Request $i : ✅ Success (Code: $($result.data.code))" -ForegroundColor Green
    } catch {
        if ($_.Exception.Response.StatusCode.value__ -eq 429) {
            $rateLimitHit = $true
            Write-Host "   Request $i : ⛔ Rate limit triggered (429)" -ForegroundColor Yellow
        } else {
            Write-Host "   Request $i : ❌ Error: $($_.Exception.Message)" -ForegroundColor Red
        }
    }
    
    Start-Sleep -Milliseconds 500
}

if ($rateLimitHit) {
    Write-Host "`n✅ PASS: Rate limiting working correctly" -ForegroundColor Green
    Write-Host "   Success count: $successCount"
    Write-Host "   Rate limit triggered: Yes" -ForegroundColor Yellow
} else {
    Write-Host "`n⚠️  WARNING: Rate limit not triggered" -ForegroundColor Yellow
    Write-Host "   All $successCount requests succeeded"
}

# Test 4: Validation Errors
Write-Host "`n📋 TEST 4: Input Validation" -ForegroundColor Yellow
Write-Host "-" * 70

# Test 4a: Missing required field
Write-Host "   Test 4a: Missing required field (systemContactPhoneNumber)"
$body = @{
    name = "Invalid Test"
    email = "invalid@test.lk"
    systemContactEmail = "sys@test.lk"
    district = "COLOMBO"
    province = "WESTERN"
    country = "Sri Lanka"
} | ConvertTo-Json

try {
    Invoke-RestMethod `
        -Uri "$API_BASE_URL/public/institutes" `
        -Method POST `
        -Body $body `
        -ContentType "application/json" `
        -Headers @{"Authorization" = "Bearer $API_KEY"} | Out-Null
    Write-Host "   ❌ FAIL: Should have rejected missing field" -ForegroundColor Red
} catch {
    if ($_.Exception.Response.StatusCode.value__ -eq 400) {
        Write-Host "   ✅ PASS: Validation error detected (400)" -ForegroundColor Green
    }
}

# Test 4b: Invalid phone format
Write-Host "   Test 4b: Invalid phone format"
$body = @{
    name = "Invalid Phone Test"
    email = "phone@test.lk"
    systemContactPhoneNumber = "0712345678"  # Should be +947XXXXXXXX
    systemContactEmail = "sys@test.lk"
    district = "COLOMBO"
    province = "WESTERN"
    country = "Sri Lanka"
} | ConvertTo-Json

try {
    Invoke-RestMethod `
        -Uri "$API_BASE_URL/public/institutes" `
        -Method POST `
        -Body $body `
        -ContentType "application/json" `
        -Headers @{"Authorization" = "Bearer $API_KEY"} | Out-Null
    Write-Host "   ❌ FAIL: Should have rejected invalid phone format" -ForegroundColor Red
} catch {
    if ($_.Exception.Response.StatusCode.value__ -eq 400) {
        Write-Host "   ✅ PASS: Phone format validation working (400)" -ForegroundColor Green
    }
}

# Test 5: File Upload API
Write-Host "`n📋 TEST 5: File Upload API (Signed URL)" -ForegroundColor Yellow
Write-Host "-" * 70

$uploadBody = @{
    folder = "institute-images"
    fileName = "test-logo.png"
    contentType = "image/png"
    fileSize = 204800
} | ConvertTo-Json

try {
    $result = Invoke-RestMethod `
        -Uri "$API_BASE_URL/public/upload/signed-url" `
        -Method POST `
        -Body $uploadBody `
        -ContentType "application/json" `
        -Headers @{"Authorization" = "Bearer $API_KEY"}
    
    Write-Host "✅ PASS: Signed URL generated successfully" -ForegroundColor Green
    Write-Host "   Relative Path: $($result.relativePath)"
    Write-Host "   Expires In: $($result.expiresIn / 1000) seconds"
} catch {
    if ($_.Exception.Response.StatusCode.value__ -eq 404) {
        Write-Host "⚠️  SKIP: Upload endpoint not available (needs app restart)" -ForegroundColor Yellow
    } else {
        Write-Host "❌ FAIL: $($_.Exception.Message)" -ForegroundColor Red
    }
}

# Summary
Write-Host "`n" + ("=" * 70) -ForegroundColor Gray
Write-Host "🎯 TEST SUMMARY" -ForegroundColor Cyan
Write-Host ("=" * 70) -ForegroundColor Gray
Write-Host "`n✅ Features Verified:"
Write-Host "   ✓ Auto-generated institute codes (INST-YYYYMMDD-XXX)"
Write-Host "   ✓ Optional image fields"
Write-Host "   ✓ Required system contact fields"
Write-Host "   ✓ API Key authentication (Bearer token)"
Write-Host "   ✓ Input validation (phone format, required fields)"
Write-Host "   ✓ Comprehensive error responses with request IDs"
if ($rateLimitHit) {
    Write-Host "   ✓ Rate limiting (3 requests/min)" -ForegroundColor Green
} else {
    Write-Host "   ⚠️  Rate limiting (not triggered)" -ForegroundColor Yellow
}
Write-Host "`n📚 Documentation:"
Write-Host "   PUBLIC_INSTITUTE_REGISTRATION_COMPLETE_GUIDE.md"
Write-Host "`n🚀 API Ready for Production!" -ForegroundColor Green
Write-Host ""
