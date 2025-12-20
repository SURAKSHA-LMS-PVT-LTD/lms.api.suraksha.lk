# 🚀 Google Cloud Run Deployment Script for NestJS LMS API (PowerShell)
# This script builds and deploys the application to Google Cloud Run

$ErrorActionPreference = "Stop"

# Configuration
$PROJECT_ID = "focal-caster-475808-h1"
$REGION = "asia-south1"  # Change to your preferred region
$SERVICE_NAME = "lms"
$IMAGE_NAME = "gcr.io/$PROJECT_ID/$SERVICE_NAME"

Write-Host "🚀 Starting deployment to Google Cloud Run" -ForegroundColor Green
Write-Host "================================================"
Write-Host "Project ID: $PROJECT_ID"
Write-Host "Region: $REGION"
Write-Host "Service: $SERVICE_NAME"
Write-Host "Image: $IMAGE_NAME"
Write-Host "================================================"

# Step 1: Verify gcloud is configured
Write-Host "`n📋 Step 1: Verifying gcloud configuration..." -ForegroundColor Yellow
gcloud config set project $PROJECT_ID
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to set project. Is gcloud installed and authenticated?" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Project set to $PROJECT_ID" -ForegroundColor Green

# Step 2: Build the Docker image using Cloud Build
Write-Host "`n🔨 Step 2: Building Docker image with Cloud Build..." -ForegroundColor Yellow
gcloud builds submit --tag $IMAGE_NAME

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Build failed! Check the logs above for errors." -ForegroundColor Red
    exit 1
}

Write-Host "✅ Docker image built successfully!" -ForegroundColor Green

# Step 3: Deploy to Cloud Run
Write-Host "`n🚀 Step 3: Deploying to Cloud Run..." -ForegroundColor Yellow
gcloud run deploy $SERVICE_NAME `
    --image $IMAGE_NAME `
    --region $REGION `
    --platform managed `
    --allow-unauthenticated `
    --port 8080 `
    --timeout 300 `
    --memory 512Mi `
    --cpu 1 `
    --min-instances 0 `
    --max-instances 10 `
    --startup-cpu-boost `
    --set-env-vars="NODE_ENV=production,PORT=8080"

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Deployment failed! Check the logs above for errors." -ForegroundColor Red
    Write-Host "`n💡 Common issues:" -ForegroundColor Yellow
    Write-Host "  1. Missing environment variables (JWT_SECRET, DB credentials)"
    Write-Host "  2. Container not listening on PORT environment variable"
    Write-Host "  3. Application crashing during startup"
    Write-Host ""
    Write-Host "📋 Check logs with:" -ForegroundColor Yellow
    Write-Host "  gcloud run services logs read $SERVICE_NAME --region $REGION --limit 100"
    exit 1
}

Write-Host "`n✅ Deployment completed successfully!" -ForegroundColor Green

# Get the service URL
$SERVICE_URL = gcloud run services describe $SERVICE_NAME --region $REGION --format='value(status.url)'
Write-Host "`n🌐 Service URL: $SERVICE_URL" -ForegroundColor Green

Write-Host "`n📋 Next Steps:" -ForegroundColor Yellow
Write-Host "1. Set environment variables (secrets):"
Write-Host "   gcloud run services update $SERVICE_NAME --region $REGION \"
Write-Host "     --update-env-vars=`"JWT_SECRET=your-secret,BCRYPT_PEPPER=your-pepper`""
Write-Host ""
Write-Host "2. View logs:"
Write-Host "   gcloud run services logs read $SERVICE_NAME --region $REGION --limit 50"
Write-Host ""
Write-Host "3. Test the API:"
Write-Host "   curl $SERVICE_URL/health"
Write-Host ""
Write-Host "4. View service details:"
Write-Host "   gcloud run services describe $SERVICE_NAME --region $REGION"
