#!/bin/bash

# 🚀 Google Cloud Run Deployment Script for NestJS LMS API
# This script builds and deploys the application to Google Cloud Run

set -e  # Exit on any error

# Configuration
PROJECT_ID="focal-caster-475808-h1"
REGION="asia-south1"  # Change to your preferred region
SERVICE_NAME="lms"
IMAGE_NAME="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Starting deployment to Google Cloud Run${NC}"
echo "================================================"
echo "Project ID: ${PROJECT_ID}"
echo "Region: ${REGION}"
echo "Service: ${SERVICE_NAME}"
echo "Image: ${IMAGE_NAME}"
echo "================================================"

# Step 1: Verify gcloud is configured
echo -e "\n${YELLOW}📋 Step 1: Verifying gcloud configuration...${NC}"
gcloud config set project ${PROJECT_ID}
echo -e "${GREEN}✅ Project set to ${PROJECT_ID}${NC}"

# Step 2: Build the Docker image using Cloud Build
echo -e "\n${YELLOW}🔨 Step 2: Building Docker image with Cloud Build...${NC}"
gcloud builds submit --tag ${IMAGE_NAME}

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Build failed! Check the logs above for errors.${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Docker image built successfully!${NC}"

# Step 3: Deploy to Cloud Run
echo -e "\n${YELLOW}🚀 Step 3: Deploying to Cloud Run...${NC}"
gcloud run deploy ${SERVICE_NAME} \
    --image ${IMAGE_NAME} \
    --region ${REGION} \
    --platform managed \
    --allow-unauthenticated \
    --port 8080 \
    --timeout 300 \
    --memory 512Mi \
    --cpu 1 \
    --min-instances 0 \
    --max-instances 10 \
    --startup-cpu-boost \
    --set-env-vars="NODE_ENV=production,PORT=8080"

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Deployment failed! Check the logs above for errors.${NC}"
    echo -e "${YELLOW}💡 Common issues:${NC}"
    echo "  1. Missing environment variables (JWT_SECRET, DB credentials)"
    echo "  2. Container not listening on PORT environment variable"
    echo "  3. Application crashing during startup"
    echo ""
    echo -e "${YELLOW}📋 Check logs with:${NC}"
    echo "  gcloud run services logs read ${SERVICE_NAME} --region ${REGION} --limit 100"
    exit 1
fi

echo -e "\n${GREEN}✅ Deployment completed successfully!${NC}"

# Get the service URL
SERVICE_URL=$(gcloud run services describe ${SERVICE_NAME} --region ${REGION} --format='value(status.url)')
echo -e "\n${GREEN}🌐 Service URL: ${SERVICE_URL}${NC}"
echo -e "\n${YELLOW}📋 Next Steps:${NC}"
echo "1. Set environment variables (secrets):"
echo "   gcloud run services update ${SERVICE_NAME} --region ${REGION} \\"
echo "     --update-env-vars=\"JWT_SECRET=your-secret,BCRYPT_PEPPER=your-pepper\""
echo ""
echo "2. View logs:"
echo "   gcloud run services logs read ${SERVICE_NAME} --region ${REGION} --limit 50"
echo ""
echo "3. Test the API:"
echo "   curl ${SERVICE_URL}/health"
echo ""
echo "4. View service details:"
echo "   gcloud run services describe ${SERVICE_NAME} --region ${REGION}"
