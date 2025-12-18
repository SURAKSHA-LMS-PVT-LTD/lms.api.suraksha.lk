# AWS S3 IAM Permissions Required

## ❌ Current Status

**IAM User:** `dynamoDBAccess` (arn:aws:iam::645437362734:user/dynamoDBAccess)  
**Current Permissions:** DynamoDB only - **NO S3 ACCESS**  
**Bucket:** `suraksha-lms-main-bucket`  
**Region:** `us-east-1`

## 🔧 Required Actions

### Option 1: Create New IAM User for S3 (Recommended)

Create a dedicated IAM user specifically for S3 uploads:

**IAM User Name:** `suraksha-lms-s3-uploader`

**Required IAM Policy (JSON):**

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "S3BucketAccess",
      "Effect": "Allow",
      "Action": [
        "s3:ListBucket",
        "s3:GetBucketLocation",
        "s3:GetBucketCors"
      ],
      "Resource": "arn:aws:s3:::suraksha-lms-main-bucket"
    },
    {
      "Sid": "S3ObjectOperations",
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:HeadObject",
        "s3:PutObjectAcl",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::suraksha-lms-main-bucket/*"
    }
  ]
}
```

**Steps:**
1. Go to AWS IAM Console → Users → Create User
2. User name: `suraksha-lms-s3-uploader`
3. Attach policy → Create inline policy → Paste JSON above
4. Create access key → Store credentials securely
5. Update .env file with new credentials

### Option 2: Add S3 Permissions to Existing User

Add the above S3 policy to the existing `dynamoDBAccess` user:

**Steps:**
1. Go to AWS IAM Console → Users → dynamoDBAccess
2. Add permissions → Create inline policy
3. Policy name: `S3UploadAccess`
4. Paste the JSON policy above
5. Review and create

## 🪣 S3 Bucket Configuration

### 1. CORS Configuration (CRITICAL for Client Uploads)

Add this CORS configuration to `suraksha-lms-main-bucket`:

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "PUT", "POST"],
    "AllowedOrigins": [
      "https://lms.suraksha.lk",
      "https://org.suraksha.lk",
      "https://transport.suraksha.lk",
      "https://admin.suraksha.lk",
      "http://localhost:3000",
      "http://localhost:5173"
    ],
    "ExposeHeaders": ["ETag", "x-amz-request-id"],
    "MaxAgeSeconds": 3000
  }
]
```

**Steps:**
1. Go to S3 Console → suraksha-lms-main-bucket
2. Permissions tab → Cross-origin resource sharing (CORS)
3. Edit → Paste JSON above → Save

### 2. Block Public Access Settings

**Option A: Allow Public ACLs (Simplest)**
- ❌ Block all public access: **OFF**
- ❌ Block public access to buckets and objects granted through new ACLs: **OFF**

**Option B: Use Bucket Policy (More Secure)**
Keep Block Public Access ON, use bucket policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::suraksha-lms-main-bucket/*"
    }
  ]
}
```

### 3. Bucket Versioning (Optional but Recommended)

Enable versioning for backup and recovery:
- Go to Properties tab → Bucket Versioning → Enable

## 📝 Environment Variables

### Current Configuration (.env)

```bash
# Storage Provider
STORAGE_PROVIDER=aws

# AWS Credentials (needs S3 permissions)
AWS_ACCESS_KEY_ID=AKIAZMRYQSIXNC4HL5MK
AWS_SECRET_ACCESS_KEY=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
AWS_REGION=us-east-1

# AWS S3 Configuration
AWS_S3_BUCKET=suraksha-lms-main-bucket
AWS_S3_BASE_URL=https://suraksha-lms-main-bucket.s3.us-east-1.amazonaws.com
```

### If You Create New IAM User

Replace with new credentials:

```bash
AWS_ACCESS_KEY_ID=AKIA...NEW_KEY...
AWS_SECRET_ACCESS_KEY=...NEW_SECRET...
```

## 🧪 Testing After IAM Permissions Added

### 1. Run Test Script

```bash
node test-aws-s3.js
```

**Expected Output:**
```
✅ Successfully authenticated!
✅ Bucket accessible!
✅ Successfully generated signed URL!
✅ CORS configured
✅ ALL TESTS PASSED!
```

### 2. Test Upload Endpoint

```bash
# Start backend
npm run start:dev

# Test signed URL generation
curl -X POST http://localhost:8080/api/upload/generate-signed-url \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "fileName": "test.jpg",
    "folder": "profile-images",
    "contentType": "image/jpeg",
    "maxFileSize": 5242880
  }'
```

### 3. Test Actual Upload

```bash
# Use uploadUrl from previous response
curl -X PUT "SIGNED_UPLOAD_URL" \
  -H "Content-Type: image/jpeg" \
  --data-binary "@test-image.jpg"
```

### 4. Verify Upload

```bash
curl -X POST http://localhost:8080/api/upload/verify-upload \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"relativePath": "profile-images/..."}'
```

## 🚨 Current Error Explanation

```
Error: User: arn:aws:iam::645437362734:user/dynamoDBAccess is not authorized 
to perform: s3:ListBucket on resource: "arn:aws:s3:::suraksha-lms-main-bucket"
```

**What this means:**
- IAM user `dynamoDBAccess` only has DynamoDB permissions
- The user **cannot** access S3 at all
- Need to add S3 permissions (see Option 1 or 2 above)

## ✅ Next Steps Summary

1. **Add IAM S3 Permissions** (choose Option 1 or 2)
2. **Configure S3 Bucket CORS** (critical for uploads)
3. **Set Bucket Public Access** (Option A or B)
4. **Run test script** to verify: `node test-aws-s3.js`
5. **Restart backend** server
6. **Test upload flow** end-to-end

## 📧 Contact AWS Administrator

If you don't have AWS console access, send this to your AWS admin:

---

**Subject:** AWS IAM S3 Permissions Request for LMS

**Body:**

Hi,

We need S3 permissions added for the LMS upload system.

**IAM User:** dynamoDBAccess (or create new user: suraksha-lms-s3-uploader)  
**S3 Bucket:** suraksha-lms-main-bucket  
**Region:** us-east-1

**Required Permissions:**
- s3:ListBucket on bucket
- s3:PutObject, s3:GetObject, s3:HeadObject, s3:PutObjectAcl, s3:DeleteObject on objects

**Bucket Configuration Needed:**
- CORS policy (for client-side uploads from https://lms.suraksha.lk)
- Public read access for uploaded files

See attached IAM policy JSON.

Thanks!

---

## 📚 Reference

- AWS S3 Signed URL Implementation: `docs/AWS_S3_SIGNED_URL_IMPLEMENTATION.md`
- IAM Policy: See JSON above
- Test script: `test-aws-s3.js`
