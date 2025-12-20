# 🔐 Set Environment Variables for Cloud Run (PowerShell)
# This script helps you set all required environment variables for the LMS API

$ErrorActionPreference = "Stop"

# Configuration
$PROJECT_ID = "focal-caster-475808-h1"
$REGION = "asia-south1"
$SERVICE_NAME = "lms"

Write-Host "🔐 Setting Environment Variables for Cloud Run" -ForegroundColor Green
Write-Host "================================================"

# Check if .env file exists
if (Test-Path ".env") {
    Write-Host "✅ Found .env file" -ForegroundColor Green
    Write-Host "`n⚠️  WARNING: This will read sensitive data from your .env file" -ForegroundColor Yellow
    Write-Host "Press CTRL+C to cancel, or any key to continue..."
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    
    # Parse .env file
    $envVars = @{}
    Get-Content ".env" | ForEach-Object {
        $line = $_.Trim()
        if ($line -and !$line.StartsWith("#")) {
            if ($line -match "^([^=]+)=(.*)$") {
                $key = $matches[1].Trim()
                $value = $matches[2].Trim()
                # Remove quotes if present
                $value = $value -replace '^["'']|["'']$', ''
                $envVars[$key] = $value
            }
        }
    }
    
    Write-Host "`n📋 Found $($envVars.Count) environment variables" -ForegroundColor Cyan
    
    # Critical variables that must be set
    $criticalVars = @(
        "NODE_ENV",
        "PORT",
        "JWT_SECRET",
        "BCRYPT_PEPPER",
        "DB_HOST",
        "DB_PORT",
        "DB_USERNAME",
        "DB_PASSWORD",
        "DB_NAME"
    )
    
    # Check if critical vars exist
    $missingVars = @()
    foreach ($var in $criticalVars) {
        if (!$envVars.ContainsKey($var)) {
            $missingVars += $var
        }
    }
    
    if ($missingVars.Count -gt 0) {
        Write-Host "`n⚠️  Missing critical variables:" -ForegroundColor Red
        $missingVars | ForEach-Object { Write-Host "   - $_" -ForegroundColor Red }
        Write-Host "`nPlease add these to your .env file first!" -ForegroundColor Yellow
        exit 1
    }
    
    # Build env vars string for gcloud command
    $envVarsString = ($envVars.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" }) -join ","
    
    Write-Host "`n🚀 Updating Cloud Run service with environment variables..." -ForegroundColor Yellow
    Write-Host "Service: $SERVICE_NAME" -ForegroundColor Cyan
    Write-Host "Region: $REGION" -ForegroundColor Cyan
    
    # Update the service
    gcloud run services update $SERVICE_NAME `
        --region $REGION `
        --update-env-vars="$envVarsString"
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "`n❌ Failed to update environment variables!" -ForegroundColor Red
        exit 1
    }
    
    Write-Host "`n✅ Environment variables updated successfully!" -ForegroundColor Green
    Write-Host "`n📋 Next steps:" -ForegroundColor Yellow
    Write-Host "1. Verify the deployment:"
    Write-Host "   gcloud run services describe $SERVICE_NAME --region $REGION"
    Write-Host ""
    Write-Host "2. Check logs:"
    Write-Host "   gcloud run services logs read $SERVICE_NAME --region $REGION --limit 50"
    Write-Host ""
    Write-Host "3. Redeploy if needed:"
    Write-Host "   .\deploy-cloud-run.ps1"
    
} else {
    Write-Host "❌ .env file not found!" -ForegroundColor Red
    Write-Host "`nPlease create a .env file with the following required variables:" -ForegroundColor Yellow
    Write-Host "  - NODE_ENV=production"
    Write-Host "  - PORT=8080"
    Write-Host "  - JWT_SECRET=<your-secret>"
    Write-Host "  - BCRYPT_PEPPER=<your-pepper>"
    Write-Host "  - DB_HOST=<your-db-host>"
    Write-Host "  - DB_PORT=3306"
    Write-Host "  - DB_USERNAME=<your-username>"
    Write-Host "  - DB_PASSWORD=<your-password>"
    Write-Host "  - DB_NAME=<your-database>"
    exit 1
}
