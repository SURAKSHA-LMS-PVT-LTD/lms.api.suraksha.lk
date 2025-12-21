# Fix Cloud Run Configuration - Update Resources and Timeout
# This script updates the existing Cloud Run service without redeploying

$ErrorActionPreference = "Stop"

$PROJECT_ID = "focal-caster-475808-h1"
$REGION = "us-central1"
$SERVICE_NAME = "lms"

Write-Host "🔧 Fixing Cloud Run Configuration" -ForegroundColor Green
Write-Host "================================================"
Write-Host "Project: $PROJECT_ID"
Write-Host "Region: $REGION"
Write-Host "Service: $SERVICE_NAME"
Write-Host "================================================`n"

Write-Host "📋 Current Issues:" -ForegroundColor Yellow
Write-Host "  ❌ Timeout: 300s (too short)"
Write-Host "  ❌ Memory: 512Mi (too small)"
Write-Host "  ❌ CPU: 1 core (too slow)"
Write-Host ""

Write-Host "🚀 New Configuration:" -ForegroundColor Green
Write-Host "  ✅ Timeout: 600s (10 minutes)"
Write-Host "  ✅ Memory: 2Gi"
Write-Host "  ✅ CPU: 2 cores"
Write-Host "  ✅ Startup CPU Boost: Enabled"
Write-Host ""

Write-Host "⚡ Updating service configuration..." -ForegroundColor Yellow

# Update the Cloud Run service configuration
gcloud run services update $SERVICE_NAME `
    --region=$REGION `
    --project=$PROJECT_ID `
    --timeout=600 `
    --memory=2Gi `
    --cpu=2 `
    --startup-cpu-boost

if ($LASTEXITCODE -ne 0) {
    Write-Host "`n❌ Failed to update Cloud Run service!" -ForegroundColor Red
    Write-Host "`nTroubleshooting:" -ForegroundColor Yellow
    Write-Host "1. Ensure gcloud is installed: https://cloud.google.com/sdk/docs/install"
    Write-Host "2. Authenticate: gcloud auth login"
    Write-Host "3. Set project: gcloud config set project $PROJECT_ID"
    exit 1
}

Write-Host "`n✅ Configuration updated successfully!" -ForegroundColor Green
Write-Host "`n📊 Verifying new configuration..." -ForegroundColor Yellow

# Describe the service to verify
gcloud run services describe $SERVICE_NAME --region=$REGION --project=$PROJECT_ID --format="yaml(spec.template.spec.containers[0].resources,spec.template.spec.timeoutSeconds)"

Write-Host "`n🎉 Done! The service should now start within the timeout." -ForegroundColor Green
Write-Host "`n📋 Monitor the deployment:" -ForegroundColor Yellow
Write-Host "  gcloud run services describe $SERVICE_NAME --region=$REGION"
Write-Host ""
Write-Host "📜 View logs:"
Write-Host "  gcloud run services logs read $SERVICE_NAME --region=$REGION --limit=100"
Write-Host ""
Write-Host "🌐 Service URL:"
$SERVICE_URL = gcloud run services describe $SERVICE_NAME --region=$REGION --format='value(status.url)' 2>$null
if ($SERVICE_URL) {
    Write-Host "  $SERVICE_URL" -ForegroundColor Cyan
}
