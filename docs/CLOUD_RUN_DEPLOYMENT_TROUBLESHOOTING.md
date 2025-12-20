# 🔧 Cloud Run Deployment Troubleshooting Guide

## Current Error: Cannot find module '/app/dist/main'

### Root Cause
The NestJS build is failing or the compiled files are not being copied correctly in the Docker image.

### Fixes Applied

1. **✅ Added assets folder copy** - The application needs the `assets/` folder for PDF templates
2. **✅ Added build verification** - Added debugging output to verify the build
3. **✅ Optimized node_modules** - Using production dependencies only
4. **✅ Added deployment scripts** - Created `deploy-cloud-run.ps1` for easy deployment

---

## Common Cloud Run Deployment Issues

### Issue 1: Container failed to start and listen on port

**Symptoms:**
```
The user-provided container failed to start and listen on the port defined provided by the PORT=8080 environment variable
```

**Causes & Solutions:**

1. **Missing Environment Variables**
   - Cloud Run requires all environment variables to be set
   - Solution: Use `set-env-vars.ps1` to set all variables from your .env file
   ```powershell
   .\set-env-vars.ps1
   ```

2. **Application Validation Failing**
   - Your app validates JWT_SECRET, BCRYPT_PEPPER, DB credentials on startup
   - If validation fails, the app exits before listening on the port
   - Solution: Ensure all required variables are set in Cloud Run

3. **Port Binding Issue**
   - App must listen on `0.0.0.0` and use the `PORT` environment variable
   - ✅ Already fixed in `src/main.ts` line 175-178

4. **Startup Timeout**
   - Default timeout may be too short for database connections
   - Solution: Increase timeout in deploy script (already set to 300s)

---

### Issue 2: Cannot find module '/app/dist/main'

**Causes & Solutions:**

1. **Build Failed Silently**
   - TypeScript compilation errors during Docker build
   - Solution: Check build logs in Cloud Build for errors
   - View logs: `gcloud builds list --limit=5`

2. **Missing Dependencies**
   - Some dev dependencies needed for build
   - ✅ Already fixed: Development stage includes all dependencies

3. **Assets Not Copied**
   - Templates or other runtime assets missing
   - ✅ Already fixed: Added `COPY --from=development /app/assets ./assets`

---

### Issue 3: Database Connection Failures

**Symptoms:**
```
Error: connect ETIMEDOUT
Error: Access denied for user
```

**Solutions:**

1. **Use Cloud SQL Proxy**
   ```powershell
   gcloud run services update lms --region asia-south1 `
     --add-cloudsql-instances=PROJECT:REGION:INSTANCE
   ```

2. **Use Private IP**
   - Set `DB_HOST` to Cloud SQL private IP
   - Ensure VPC connector is configured

3. **Check Credentials**
   - Verify DB_USERNAME and DB_PASSWORD are correct
   - Check database user has proper permissions

---

## Deployment Steps

### Step 1: Fix the Dockerfile (✅ Already Done)

The Dockerfile has been updated with:
- Build verification steps
- Assets folder copying
- Production optimizations
- Debugging output

### Step 2: Set Environment Variables

Option A: **Using the helper script (Recommended)**
```powershell
.\set-env-vars.ps1
```

Option B: **Manually set variables**
```powershell
gcloud run services update lms --region asia-south1 `
  --update-env-vars="JWT_SECRET=your-secret,BCRYPT_PEPPER=your-pepper,DB_HOST=your-host,DB_PORT=3306,DB_USERNAME=user,DB_PASSWORD=pass,DB_NAME=dbname,NODE_ENV=production,PORT=8080"
```

Option C: **Use Secret Manager (Most Secure)**
```powershell
# Create secrets
echo -n "your-jwt-secret" | gcloud secrets create jwt-secret --data-file=-
echo -n "your-bcrypt-pepper" | gcloud secrets create bcrypt-pepper --data-file=-
echo -n "your-db-password" | gcloud secrets create db-password --data-file=-

# Update service to use secrets
gcloud run services update lms --region asia-south1 `
  --update-secrets=JWT_SECRET=jwt-secret:latest `
  --update-secrets=BCRYPT_PEPPER=bcrypt-pepper:latest `
  --update-secrets=DB_PASSWORD=db-password:latest `
  --update-env-vars="DB_HOST=your-host,DB_PORT=3306,DB_USERNAME=user,DB_NAME=dbname,NODE_ENV=production,PORT=8080"
```

### Step 3: Deploy

```powershell
.\deploy-cloud-run.ps1
```

Or manually:
```powershell
# Build
gcloud builds submit --tag gcr.io/focal-caster-475808-h1/lms

# Deploy
gcloud run deploy lms `
  --image gcr.io/focal-caster-475808-h1/lms `
  --region asia-south1 `
  --platform managed `
  --allow-unauthenticated `
  --port 8080 `
  --timeout 300 `
  --memory 512Mi `
  --cpu 1 `
  --startup-cpu-boost
```

### Step 4: Check Logs

```powershell
# Recent logs
gcloud run services logs read lms --region asia-south1 --limit 50

# Follow logs in real-time
gcloud run services logs tail lms --region asia-south1

# Filter for errors
gcloud run services logs read lms --region asia-south1 --limit 100 | Select-String "Error|Failed|❌"
```

---

## Verification Steps

### 1. Check Service Status
```powershell
gcloud run services describe lms --region asia-south1
```

### 2. Test Health Endpoint
```powershell
$SERVICE_URL = gcloud run services describe lms --region asia-south1 --format='value(status.url)'
curl "$SERVICE_URL/health"
```

### 3. Test API Documentation
```powershell
# Open Swagger docs
Start-Process "$SERVICE_URL/api/docs"
```

### 4. Check Environment Variables
```powershell
gcloud run services describe lms --region asia-south1 --format='value(spec.template.spec.containers[0].env)'
```

---

## Environment Variables Checklist

### ✅ Required for Startup
- [ ] `NODE_ENV=production`
- [ ] `PORT=8080`
- [ ] `JWT_SECRET` (128+ characters)
- [ ] `BCRYPT_PEPPER` (128+ characters)

### ✅ Required for Database
- [ ] `DB_HOST`
- [ ] `DB_PORT` (usually 3306)
- [ ] `DB_USERNAME`
- [ ] `DB_PASSWORD`
- [ ] `DB_NAME`

### Optional but Recommended
- [ ] `JWT_EXPIRES_IN` (default: 15m)
- [ ] `CORS_ORIGINS` (comma-separated URLs)
- [ ] `STORAGE_PROVIDER` (google/aws/local)
- [ ] `LOG_LEVEL` (error/warn/log)

---

## Quick Commands Reference

```powershell
# View all services
gcloud run services list

# Delete a revision
gcloud run revisions delete REVISION_NAME --region asia-south1

# Update memory/CPU
gcloud run services update lms --region asia-south1 --memory 1Gi --cpu 2

# Update timeout
gcloud run services update lms --region asia-south1 --timeout 600

# Enable/disable public access
gcloud run services add-iam-policy-binding lms --region asia-south1 --member="allUsers" --role="roles/run.invoker"

# View build history
gcloud builds list --limit 10

# View build logs
gcloud builds log BUILD_ID
```

---

## Getting Help

1. **Check application logs first**
   ```powershell
   gcloud run services logs read lms --region asia-south1 --limit 100
   ```

2. **Check build logs**
   ```powershell
   gcloud builds list --limit=1
   gcloud builds log <BUILD_ID>
   ```

3. **Verify environment variables**
   ```powershell
   gcloud run services describe lms --region asia-south1
   ```

4. **Test locally with Docker**
   ```powershell
   # Build locally
   docker build -t lms-test .
   
   # Run locally with env file
   docker run -p 8080:8080 --env-file .env lms-test
   
   # Test
   curl http://localhost:8080/health
   ```

---

## Next Steps After Successful Deployment

1. **Set up monitoring**
   - Enable Cloud Monitoring
   - Set up alerts for errors and latency

2. **Set up domain mapping**
   ```powershell
   gcloud run domain-mappings create --service=lms --domain=api.yourdomain.com --region=asia-south1
   ```

3. **Enable Cloud SQL connection**
   ```powershell
   gcloud run services update lms --region=asia-south1 `
     --add-cloudsql-instances=PROJECT:REGION:INSTANCE
   ```

4. **Configure custom VPC**
   - Create VPC connector
   - Enable private Google access

5. **Set up CI/CD**
   - Cloud Build triggers
   - GitHub Actions integration
