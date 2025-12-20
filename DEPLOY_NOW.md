# 🚀 Deploy to Cloud Run - QUICK START

## Problem Identified

Your container is failing because:
1. ❌ **NODE_ENV=development** in .env (needs production)
2. ❌ **PORT=8081** in .env (Cloud Run needs 8080)
3. ❌ Environment variables not set in Cloud Run

The app validates all environment variables on startup and exits if validation fails, preventing it from listening on port 8080.

---

## ✅ SOLUTION: Deploy with cloudbuild.yaml

The easiest way to deploy with all environment variables is to use the `cloudbuild.yaml` file I just created.

### Step 1: Deploy Using Cloud Build

```bash
gcloud builds submit --config cloudbuild.yaml
```

This single command will:
- ✅ Build your Docker image
- ✅ Push to Google Container Registry
- ✅ Deploy to Cloud Run with ALL environment variables
- ✅ Set NODE_ENV=production and PORT=8080

### Step 2: Check Deployment

```bash
# View logs
gcloud run services logs read lms --region asia-south1 --limit 100

# Get service URL
gcloud run services describe lms --region asia-south1 --format='value(status.url)'

# Test health endpoint
SERVICE_URL=$(gcloud run services describe lms --region asia-south1 --format='value(status.url)')
curl $SERVICE_URL/health
```

---

## Alternative: Manual Environment Variable Setup

If you prefer to set environment variables separately:

### Option A: Use the Shell Script (Linux/Mac/Cloud Shell)

```bash
chmod +x setup-cloud-run-env.sh
./setup-cloud-run-env.sh
```

Then deploy:
```bash
gcloud builds submit --tag gcr.io/focal-caster-475808-h1/lms
gcloud run deploy lms \
  --image gcr.io/focal-caster-475808-h1/lms \
  --region asia-south1 \
  --platform managed \
  --allow-unauthenticated \
  --port 8080 \
  --timeout 300 \
  --memory 1Gi \
  --cpu 1 \
  --startup-cpu-boost
```

### Option B: Use Google Cloud Console

1. Go to: https://console.cloud.google.com/run/detail/asia-south1/lms/variables
2. Click "EDIT & DEPLOY NEW REVISION"
3. Go to "VARIABLES & SECRETS" tab
4. Click "ADD VARIABLE" and add these critical ones:

**Critical Variables:**
```
NODE_ENV = production
PORT = 8080
JWT_SECRET = v9Jz3Xq7Lk2p8Yt5Wm1r4Bv6Qe9Tn0HsXc3Zg7Ua5Md2Rf8KjLq6Np1YwVb4Ez7C
BCRYPT_PEPPER = 4f8a7b2c9e1d6f3a8b5c9e2d7f1a4b8c5e9d2f6a3b7c0e4d8f1a5b9c2e6d9f3a
DB_HOST = 136.114.215.145
DB_PORT = 3306
DB_USERNAME = root
DB_PASSWORD = Skaveesha1355660@
DB_DATABASE = suraksha-lms-db
```

5. Click "DEPLOY"

---

## 🔍 Troubleshooting

### Check Current Environment Variables

```bash
gcloud run services describe lms --region asia-south1 --format=yaml
```

### View Real-Time Logs

```bash
gcloud run services logs tail lms --region asia-south1
```

### Check Build Logs

```bash
gcloud builds list --limit 5
gcloud builds log <BUILD_ID>
```

### Test Database Connection

The most common issue is database connectivity. Ensure:
- ✅ Cloud Run can reach your database (136.114.215.145)
- ✅ Database firewall allows Cloud Run IPs
- ✅ Database credentials are correct

---

## 📋 What's in cloudbuild.yaml?

The `cloudbuild.yaml` file I created includes:
- ✅ All critical environment variables from your .env
- ✅ Production settings (NODE_ENV=production, PORT=8080)
- ✅ Optimized memory (1Gi) and CPU settings
- ✅ Startup CPU boost for faster cold starts
- ✅ 300s timeout for database initialization

**Sensitive data is included** in cloudbuild.yaml, so:
- ⚠️ Do NOT commit this file to public repositories
- ✅ Add to .gitignore
- ✅ Use Secret Manager for production (next step)

---

## 🔐 Next Steps: Use Secret Manager (Recommended for Production)

For better security, move secrets to Google Secret Manager:

### 1. Create Secrets

```bash
echo -n "v9Jz3Xq7Lk2p8Yt5Wm1r4Bv6Qe9Tn0HsXc3Zg7Ua5Md2Rf8KjLq6Np1YwVb4Ez7C" | \
  gcloud secrets create jwt-secret --data-file=-

echo -n "4f8a7b2c9e1d6f3a8b5c9e2d7f1a4b8c5e9d2f6a3b7c0e4d8f1a5b9c2e6d9f3a" | \
  gcloud secrets create bcrypt-pepper --data-file=-

echo -n "Skaveesha1355660@" | \
  gcloud secrets create db-password --data-file=-

echo -n "Skaveesha1355660@" | \
  gcloud secrets create redis-password --data-file=-

echo -n "og5zwLApIeptxnaTNSfwfYH2omxZK80NT1d1/aOP" | \
  gcloud secrets create aws-secret-access-key --data-file=-
```

### 2. Update Service to Use Secrets

```bash
gcloud run services update lms --region asia-south1 \
  --update-secrets=JWT_SECRET=jwt-secret:latest \
  --update-secrets=BCRYPT_PEPPER=bcrypt-pepper:latest \
  --update-secrets=DB_PASSWORD=db-password:latest \
  --update-secrets=REDIS_PASSWORD=redis-password:latest \
  --update-secrets=AWS_SECRET_ACCESS_KEY=aws-secret-access-key:latest
```

---

## 🎯 RECOMMENDED ACTION NOW

**Run this command to deploy everything at once:**

```bash
gcloud builds submit --config cloudbuild.yaml
```

This is the fastest way to get your app running with all the correct environment variables!

---

## 📞 Need Help?

Check the full troubleshooting guide:
- [docs/CLOUD_RUN_DEPLOYMENT_TROUBLESHOOTING.md](docs/CLOUD_RUN_DEPLOYMENT_TROUBLESHOOTING.md)

Check logs URL from your error message:
- https://console.cloud.google.com/logs/viewer?project=focal-caster-475808-h1
