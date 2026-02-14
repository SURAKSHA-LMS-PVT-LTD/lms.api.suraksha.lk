# ==============================================================================
# Complete Test: Get All Users, All Tokens, Send Notification
# ==============================================================================

param(
    [string]$Token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzIjoiMSIsInUiOjAsInQiOjE3NzEwOTY4NjYsImkiOjk5OTk5OSwiaWF0IjoxNzcxMDk2ODY2LCJleHAiOjE3NzExMDA0NjZ9.DOcCj4glRez7BrqQMCB6iiA_r6xsZleZD8FFpL2Oc-c",
    [string]$BaseUrl = "http://127.0.0.1:8080"
)

Write-Host ""
Write-Host ("=" * 90) -ForegroundColor Cyan
Write-Host "COMPLETE TEST: ALL USERS & TOKENS + NOTIFICATION DELIVERY" -ForegroundColor Cyan
Write-Host ("=" * 90) -ForegroundColor Cyan
Write-Host ""

# ==============================================================================
# STEP 1: Server Status
# ==============================================================================

Write-Host "STEP 1: Checking server status..." -ForegroundColor Yellow
Write-Host ""

try {
    $healthCheck = Invoke-RestMethod -Uri "$BaseUrl/health" -Method GET -ErrorAction SilentlyContinue
    Write-Host "  Server Status: ONLINE" -ForegroundColor Green
} catch {
    Write-Host "  Server Status: OFFLINE or port mismatch" -ForegroundColor Red
    Write-Host "  Make sure server is running: npm start" -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

Write-Host ""
Write-Host ("=" * 90)
Write-Host ""

# ==============================================================================
# STEP 2: Get Database Stats (via SQL)
# ==============================================================================

Write-Host "STEP 2: Database Statistics" -ForegroundColor Yellow
Write-Host ""
Write-Host "  To get complete user and token statistics, run these SQL queries:" -ForegroundColor Gray
Write-Host ""

Write-Host "  -- Total users and their status" -ForegroundColor Gray
Write-Host "  SELECT " -ForegroundColor Gray
Write-Host "    COUNT(*) as total_users," -ForegroundColor Gray
Write-Host "    SUM(CASE WHEN is_active = true THEN 1 ELSE 0 END) as active_users," -ForegroundColor Gray
Write-Host "    SUM(CASE WHEN is_active = false THEN 1 ELSE 0 END) as inactive_users" -ForegroundColor Gray
Write-Host "  FROM users;" -ForegroundColor Gray
Write-Host ""

Write-Host "  -- Total tokens" -ForegroundColor Gray
Write-Host "  SELECT" -ForegroundColor Gray
Write-Host "    COUNT(*) as total_tokens," -ForegroundColor Gray
Write-Host "    COUNT(DISTINCT user_id) as users_with_tokens" -ForegroundColor Gray
Write-Host "  FROM user_fcm_tokens" -ForegroundColor Gray
Write-Host "  WHERE is_active = true;" -ForegroundColor Gray
Write-Host ""

Write-Host "  -- Critical: Active users with tokens" -ForegroundColor Gray
Write-Host "  SELECT COUNT(DISTINCT u.id) as active_users_with_tokens" -ForegroundColor Gray
Write-Host "  FROM users u" -ForegroundColor Gray
Write-Host "  INNER JOIN user_fcm_tokens t ON t.user_id = u.id" -ForegroundColor Gray
Write-Host "  WHERE u.is_active = true AND t.is_active = true;" -ForegroundColor Gray
Write-Host ""

Write-Host ("=" * 90)
Write-Host ""

# ==============================================================================
# STEP 3: Send Test Notification
# ==============================================================================

Write-Host "STEP 3: Sending test notification to ALL users..." -ForegroundColor Yellow
Write-Host ""

$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
$body = @{
    title = "Test Notification"
    body = "Complete test - $timestamp"
    scope = "GLOBAL"
    targetUserTypes = @("ALL")
    priority = "HIGH"
    sendImmediately = $true
} | ConvertTo-Json

Write-Host "  Request:" -ForegroundColor Gray
Write-Host "    URL: POST $BaseUrl/push-notifications/admin"
Write-Host "    Target: ALL users"
Write-Host "    Title: Test Notification"
Write-Host ""

try {
    $response = Invoke-RestMethod `
        -Uri "$BaseUrl/push-notifications/admin" `
        -Method POST `
        -Headers @{
            "Authorization" = "Bearer $Token"
            "Content-Type" = "application/json"
        } `
        -Body $body `
        -ErrorAction Stop

    Write-Host "  Response:" -ForegroundColor Green
    Write-Host "    Total Recipients:     $($response.totalRecipients)" -ForegroundColor White
    Write-Host "    Sent Count:           $($response.sentCount)" -ForegroundColor $(if ($response.sentCount -gt 0) { "Green" } else { "Red" })
    Write-Host "    Failed Count:         $($response.failedCount)" -ForegroundColor $(if ($response.failedCount -gt 0) { "Red" } else { "White" })
    Write-Host "    Users With Tokens:    $($response.usersWithTokens)" -ForegroundColor White
    Write-Host "    Users Without Tokens: $($response.usersWithoutTokens)" -ForegroundColor White
    
    if ($response.details) {
        Write-Host "    Delivery Rate:        $($response.details.deliveryRate)" -ForegroundColor White
    }
    
    Write-Host ""

    # ==============================================================================
    # STEP 4: Analyze Results
    # ==============================================================================

    Write-Host ("=" * 90)
    Write-Host ""
    Write-Host "STEP 4: Result Analysis" -ForegroundColor Yellow
    Write-Host ""

    $recipients = $response.totalRecipients
    $sent = $response.sentCount
    $withTokens = if ($response.usersWithTokens) { $response.usersWithTokens } else { 0 }
    $withoutTokens = if ($response.usersWithoutTokens) { $response.usersWithoutTokens } else { 0 }

    if ($sent -eq 0 -and $recipients -gt 0) {
        Write-Host "  PROBLEM DETECTED:" -ForegroundColor Red
        Write-Host "    Found $recipients active users (is_active = true)" -ForegroundColor White
        Write-Host "    But $withoutTokens of them have NO FCM tokens" -ForegroundColor Red
        Write-Host "    Result: 0 notifications delivered" -ForegroundColor Red
        Write-Host ""
        
        if ($withoutTokens -eq $recipients) {
            Write-Host "  ROOT CAUSE:" -ForegroundColor Yellow
            Write-Host "    ALL targeted users have NO FCM tokens!" -ForegroundColor White
            Write-Host "    Users WITH tokens are probably INACTIVE (is_active = false)" -ForegroundColor White
            Write-Host ""
            Write-Host "  FIX:" -ForegroundColor Green
            Write-Host "    Run this SQL to activate users with tokens:" -ForegroundColor White
            Write-Host ""
            Write-Host "    UPDATE users SET is_active = true" -ForegroundColor Yellow
            Write-Host "    WHERE id IN (" -ForegroundColor Yellow
            Write-Host "      SELECT DISTINCT user_id FROM user_fcm_tokens WHERE is_active = true" -ForegroundColor Yellow
            Write-Host "    );" -ForegroundColor Yellow
            Write-Host ""
        }
    } elseif ($sent -gt 0) {
        Write-Host "  SUCCESS!" -ForegroundColor Green
        Write-Host "    Delivered $sent notification(s) to devices" -ForegroundColor White
        Write-Host ""
        
        if ($sent -lt $recipients) {
            Write-Host "  NOTE:" -ForegroundColor Yellow
            Write-Host "    $recipients users targeted, but only $sent received" -ForegroundColor White
            Write-Host "    $withoutTokens user(s) don't have FCM tokens registered" -ForegroundColor White
            Write-Host "    They need to open the mobile app and grant notification permissions" -ForegroundColor White
            Write-Host ""
        }
    } else {
        Write-Host "  NO ACTIVE USERS FOUND" -ForegroundColor Yellow
        Write-Host "    The database has no active users OR they're all inactive" -ForegroundColor White
        Write-Host ""
    }

} catch {
    Write-Host "  ERROR:" -ForegroundColor Red
    Write-Host "    $($_.Exception.Message)" -ForegroundColor White
    Write-Host ""
    Write-Host "  Possible causes:" -ForegroundColor Yellow
    Write-Host "    1. Token expired - Get a fresh token" -ForegroundColor Gray
    Write-Host "    2. Server not running - Run: npm start" -ForegroundColor Gray
    Write-Host "    3. Wrong port - Server on different port?" -ForegroundColor Gray
    Write-Host ""
    
    if ($_.ErrorDetails.Message) {
        Write-Host "  Server response:" -ForegroundColor Gray
        Write-Host "    $($_.ErrorDetails.Message)" -ForegroundColor White
        Write-Host ""
    }
}

# ==============================================================================
# STEP 5: SQL Queries for Manual Verification
# ==============================================================================

Write-Host ("=" * 90)
Write-Host ""
Write-Host "STEP 5: SQL Queries for Manual Verification" -ForegroundColor Yellow
Write-Host ""

Write-Host "  Run these queries in your MySQL client to see detailed data:" -ForegroundColor Gray
Write-Host ""

Write-Host "  1. Show all users with their token status:" -ForegroundColor Cyan
Write-Host ""
Write-Host "     SELECT " -ForegroundColor Gray
Write-Host "       u.id," -ForegroundColor Gray
Write-Host "       u.email," -ForegroundColor Gray
Write-Host "       u.user_type," -ForegroundColor Gray
Write-Host "       u.is_active," -ForegroundColor Gray
Write-Host "       COUNT(t.id) as token_count" -ForegroundColor Gray
Write-Host "     FROM users u" -ForegroundColor Gray
Write-Host "     LEFT JOIN user_fcm_tokens t ON t.user_id = u.id AND t.is_active = true" -ForegroundColor Gray
Write-Host "     GROUP BY u.id, u.email, u.user_type, u.is_active" -ForegroundColor Gray
Write-Host "     ORDER BY u.is_active DESC, token_count DESC;" -ForegroundColor Gray
Write-Host ""

Write-Host "  2. Find users with tokens but inactive:" -ForegroundColor Cyan
Write-Host ""
Write-Host "     SELECT " -ForegroundColor Gray
Write-Host "       u.id," -ForegroundColor Gray
Write-Host "       u.email," -ForegroundColor Gray
Write-Host "       u.user_type," -ForegroundColor Gray
Write-Host "       COUNT(t.id) as token_count" -ForegroundColor Gray
Write-Host "     FROM users u" -ForegroundColor Gray
Write-Host "     INNER JOIN user_fcm_tokens t ON t.user_id = u.id" -ForegroundColor Gray
Write-Host "     WHERE u.is_active = false AND t.is_active = true" -ForegroundColor Gray
Write-Host "     GROUP BY u.id, u.email, u.user_type;" -ForegroundColor Gray
Write-Host ""

Write-Host "  3. Check system admins specifically:" -ForegroundColor Cyan
Write-Host ""
Write-Host "     SELECT " -ForegroundColor Gray
Write-Host "       u.id," -ForegroundColor Gray
Write-Host "       u.email," -ForegroundColor Gray
Write-Host "       u.is_active," -ForegroundColor Gray
Write-Host "       COUNT(t.id) as token_count" -ForegroundColor Gray
Write-Host "     FROM users u" -ForegroundColor Gray
Write-Host "     LEFT JOIN user_fcm_tokens t ON t.user_id = u.id AND t.is_active = true" -ForegroundColor Gray
Write-Host "     WHERE u.user_type = 'SUPER_ADMIN'" -ForegroundColor Gray
Write-Host "     GROUP BY u.id, u.email, u.is_active;" -ForegroundColor Gray
Write-Host ""

Write-Host ("=" * 90)
Write-Host ""

Write-Host "Test complete! Review the results above." -ForegroundColor Cyan
Write-Host "For detailed explanation, see: WHY_ALL_DOESNT_DELIVER_EXPLANATION.md" -ForegroundColor Gray
Write-Host ""
