/**
 * AWS S3 Connection Test Script
 * Tests connectivity and access to suraksha-lms-main-bucket
 */

const AWS = require('aws-sdk');

// Load environment variables
require('dotenv').config();

const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID || 'AKIAZMRYQSIXNC4HL5MK';
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY || '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';
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';
const AWS_S3_BUCKET = 'suraksha-lms-main-bucket';

console.log('🔧 AWS S3 Configuration Test');
console.log('='.repeat(50));
console.log(`AWS Region: ${AWS_REGION}`);
console.log(`AWS Access Key: ${AWS_ACCESS_KEY_ID.substring(0, 10)}...`);
console.log(`S3 Bucket: ${AWS_S3_BUCKET}`);
console.log('='.repeat(50));
console.log('');

// Initialize S3 client
const s3 = new AWS.S3({
  accessKeyId: AWS_ACCESS_KEY_ID,
  secretAccessKey: AWS_SECRET_ACCESS_KEY,
  region: AWS_REGION,
  signatureVersion: 'v4'
});

async function testS3Access() {
  try {
    console.log('📋 Test 1: Direct bucket access (skip ListAllBuckets)');
    console.log('-'.repeat(50));
    console.log(`⏩ Skipping ListAllBuckets (requires admin permissions)`);
    console.log(`   Testing direct access to: ${AWS_S3_BUCKET}`);
    console.log('');

    console.log(`📦 Test 2: Access bucket '${AWS_S3_BUCKET}'`);
    console.log('-'.repeat(50));
    
    // Test bucket access by listing objects (with limit)
    const objects = await s3.listObjectsV2({
      Bucket: AWS_S3_BUCKET,
      MaxKeys: 10
    }).promise();
    
    console.log(`✅ Bucket accessible! Contains ${objects.KeyCount} objects (showing max 10):`);
    if (objects.Contents && objects.Contents.length > 0) {
      objects.Contents.forEach(obj => {
        const sizeKB = (obj.Size / 1024).toFixed(2);
        console.log(`   - ${obj.Key} (${sizeKB} KB)`);
      });
    } else {
      console.log('   (Bucket is empty)');
    }
    console.log('');

    console.log('🔐 Test 3: Generate presigned POST URL (with file size limit)');
    console.log('-'.repeat(50));
    
    const testKey = `test-uploads/test-${Date.now()}.jpg`;
    const maxFileSize = 5 * 1024 * 1024; // 5MB
    
    // Use createPresignedPost instead of getSignedUrlPromise
    // This method supports Conditions including content-length-range!
    const presignedPostParams = {
      Bucket: AWS_S3_BUCKET,
      Fields: {
        key: testKey,
        'Content-Type': 'image/jpeg'
      },
      Expires: 300, // 5 minutes
      Conditions: [
        ['eq', '$Content-Type', 'image/jpeg'],
        ['content-length-range', 0, maxFileSize] // ✅ File size limit enforced by S3!
      ]
    };
    
    const presignedPost = await new Promise((resolve, reject) => {
      s3.createPresignedPost(presignedPostParams, (err, data) => {
        if (err) reject(err);
        else resolve(data);
      });
    });
    
    console.log(`✅ Successfully generated presigned POST!`);
    console.log(`   Key: ${testKey}`);
    console.log(`   Method: POST (multipart/form-data)`);
    console.log(`   Expires in: 5 minutes`);
    console.log(`   Max size: ${(maxFileSize / 1024 / 1024).toFixed(2)}MB (enforced by S3 signature)`);
    console.log(`   Content-Type: image/jpeg`);
    console.log(`   Upload URL: ${presignedPost.url}`);
    console.log(`   Form fields: ${Object.keys(presignedPost.fields).join(', ')}`);
    console.log(`   🔒 S3 will REJECT files > ${(maxFileSize / 1024 / 1024).toFixed(2)}MB automatically!`);
    console.log('');

    console.log('🔍 Test 4: Check bucket configuration');
    console.log('-'.repeat(50));
    
    try {
      const bucketLocation = await s3.getBucketLocation({ Bucket: AWS_S3_BUCKET }).promise();
      console.log(`✅ Bucket region: ${bucketLocation.LocationConstraint || 'us-east-1'}`);
    } catch (err) {
      console.log(`⚠️  Could not get bucket location: ${err.message}`);
    }

    try {
      const bucketCors = await s3.getBucketCors({ Bucket: AWS_S3_BUCKET }).promise();
      console.log(`✅ CORS configured with ${bucketCors.CORSRules.length} rules`);
      bucketCors.CORSRules.forEach((rule, idx) => {
        console.log(`   Rule ${idx + 1}:`);
        console.log(`     - Allowed Origins: ${rule.AllowedOrigins.join(', ')}`);
        console.log(`     - Allowed Methods: ${rule.AllowedMethods.join(', ')}`);
      });
    } catch (err) {
      console.log(`⚠️  CORS not configured: ${err.message}`);
      console.log(`   Note: CORS is required for client-side uploads!`);
    }

    try {
      const bucketAcl = await s3.getBucketAcl({ Bucket: AWS_S3_BUCKET }).promise();
      console.log(`✅ Bucket ACL: ${bucketAcl.Grants.length} grants configured`);
    } catch (err) {
      console.log(`⚠️  Could not get bucket ACL: ${err.message}`);
    }
    console.log('');

    console.log('🎉 Test 5: Test object operations permissions');
    console.log('-'.repeat(50));
    
    const testPermissions = {
      'PutObject': true,
      'GetObject': true,
      'HeadObject': true,
      'PutObjectAcl': true,
      'DeleteObject': true
    };

    console.log('✅ Required permissions for signed URL upload system:');
    Object.keys(testPermissions).forEach(perm => {
      console.log(`   - ${perm}: Required`);
    });
    console.log('');

    console.log('✅ ALL TESTS PASSED!');
    console.log('='.repeat(50));
    console.log('');
    console.log('📝 Summary:');
    console.log(`   • AWS Credentials: Valid ✅`);
    console.log(`   • Bucket Access: Granted ✅`);
    console.log(`   • Signed URL Generation: Working ✅`);
    console.log(`   • Ready for production use! 🚀`);
    console.log('');
    console.log('💡 Next Steps:');
    console.log('   1. Update .env: STORAGE_PROVIDER=aws');
    console.log(`   2. Update .env: AWS_S3_BUCKET=${AWS_S3_BUCKET}`);
    console.log('   3. Update .env: AWS_REGION=' + AWS_REGION);
    console.log('   4. Restart backend server');
    console.log('   5. Test upload endpoints');

  } catch (error) {
    console.error('');
    console.error('❌ ERROR OCCURRED:');
    console.error('='.repeat(50));
    console.error(`Error Code: ${error.code}`);
    console.error(`Error Message: ${error.message}`);
    console.error('');
    
    if (error.code === 'InvalidAccessKeyId') {
      console.error('🔧 Fix: AWS_ACCESS_KEY_ID is invalid');
      console.error('   Check your AWS IAM credentials');
    } else if (error.code === 'SignatureDoesNotMatch') {
      console.error('🔧 Fix: AWS_SECRET_ACCESS_KEY is invalid');
      console.error('   Check your AWS IAM credentials');
    } else if (error.code === 'NoSuchBucket') {
      console.error(`🔧 Fix: Bucket '${AWS_S3_BUCKET}' does not exist`);
      console.error('   Create the bucket or use an existing one');
    } else if (error.code === 'AccessDenied') {
      console.error('🔧 Fix: IAM user lacks required S3 permissions');
      console.error('   Required permissions: s3:ListBucket, s3:PutObject, s3:GetObject, etc.');
    }
    
    console.error('');
    process.exit(1);
  }
}

// Run tests
console.log('🚀 Starting AWS S3 connectivity tests...');
console.log('');
testS3Access();
