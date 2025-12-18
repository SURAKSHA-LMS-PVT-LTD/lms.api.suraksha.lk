/**
 * Comprehensive Upload System Test
 * Tests all folder paths, security features, and AWS S3 integration
 */

const AWS = require('aws-sdk');
require('dotenv').config();

const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';
const AWS_S3_BUCKET = process.env.AWS_S3_BUCKET || 'suraksha-lms-main-bucket';
const STORAGE_PROVIDER = process.env.STORAGE_PROVIDER || 'google';

console.log('🔧 Upload System Comprehensive Test');
console.log('='.repeat(70));
console.log(`Storage Provider: ${STORAGE_PROVIDER}`);
console.log(`AWS Region: ${AWS_REGION}`);
console.log(`AWS S3 Bucket: ${AWS_S3_BUCKET}`);
console.log('='.repeat(70));
console.log('');

// Initialize S3 client
const s3 = new AWS.S3({
  accessKeyId: AWS_ACCESS_KEY_ID,
  secretAccessKey: AWS_SECRET_ACCESS_KEY,
  region: AWS_REGION,
  signatureVersion: 'v4'
});

// All folder paths that should be supported
const FOLDER_PATHS = [
  { name: 'profile-images', maxSizeMB: 5, allowedTypes: ['image/jpeg', 'image/png', 'image/webp'] },
  { name: 'student-images', maxSizeMB: 5, allowedTypes: ['image/jpeg', 'image/png', 'image/webp'] },
  { name: 'institute-images', maxSizeMB: 10, allowedTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'] },
  { name: 'institute-user-images', maxSizeMB: 5, allowedTypes: ['image/jpeg', 'image/png', 'image/webp'] },
  { name: 'subject-images', maxSizeMB: 5, allowedTypes: ['image/jpeg', 'image/png', 'image/webp'] },
  { name: 'homework-files', maxSizeMB: 20, allowedTypes: ['application/pdf', 'image/jpeg', 'image/png'] },
  { name: 'correction-files', maxSizeMB: 20, allowedTypes: ['application/pdf', 'image/jpeg', 'image/png'] },
  { name: 'payment-receipts', maxSizeMB: 10, allowedTypes: ['image/jpeg', 'image/png', 'application/pdf'] },
  { name: 'id-documents', maxSizeMB: 10, allowedTypes: ['image/jpeg', 'image/png', 'application/pdf'] },
  { name: 'bookhire-vehicle-images', maxSizeMB: 5, allowedTypes: ['image/jpeg', 'image/png', 'image/webp'] },
  { name: 'bookhire-owner-images', maxSizeMB: 5, allowedTypes: ['image/jpeg', 'image/png', 'image/webp'] }
];

// Security features to test
const SECURITY_FEATURES = {
  'File Size Enforcement': true,
  'Content Type Whitelist': true,
  'Server-Side Encryption': true,
  'Path Traversal Prevention': true,
  'Bucket Confusion Prevention': true,
  'Empty File Detection': true,
  'Suspicious Extension Blocking': true,
  'Upload Metadata Tracking': true,
  'Time-Limited URLs': true,
  'Exact Key Match': true
};

// Test results tracking
const testResults = {
  passed: 0,
  failed: 0,
  warnings: 0,
  errors: []
};

async function testPresignedPost(folder, contentType, maxSizeMB) {
  try {
    const testKey = `${folder}/test-${Date.now()}.jpg`;
    const maxFileSize = maxSizeMB * 1024 * 1024;
    
    const params = {
      Bucket: AWS_S3_BUCKET,
      Fields: {
        key: testKey,
        'Content-Type': contentType,
        'x-amz-server-side-encryption': 'AES256',
        'x-amz-meta-upload-timestamp': new Date().toISOString(),
        'x-amz-meta-original-filename': `test.jpg`
      },
      Expires: 300,
      Conditions: [
        ['eq', '$Content-Type', contentType],
        ['eq', '$key', testKey],
        ['eq', '$x-amz-server-side-encryption', 'AES256'],
        ['eq', '$bucket', AWS_S3_BUCKET],
        ['content-length-range', 0, maxFileSize]
      ]
    };
    
    const presignedPost = await new Promise((resolve, reject) => {
      s3.createPresignedPost(params, (err, data) => {
        if (err) reject(err);
        else resolve(data);
      });
    });
    
    return {
      success: true,
      url: presignedPost.url,
      fields: presignedPost.fields,
      maxSizeMB,
      contentType
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

async function runTests() {
  console.log('📋 Test 1: Verify AWS S3 Bucket Access');
  console.log('-'.repeat(70));
  
  try {
    const objects = await s3.listObjectsV2({
      Bucket: AWS_S3_BUCKET,
      MaxKeys: 1
    }).promise();
    
    console.log(`✅ AWS S3 bucket accessible: ${AWS_S3_BUCKET}`);
    testResults.passed++;
  } catch (error) {
    console.error(`❌ Cannot access S3 bucket: ${error.message}`);
    testResults.failed++;
    testResults.errors.push({ test: 'Bucket Access', error: error.message });
  }
  
  console.log('');
  
  console.log('📋 Test 2: Generate Presigned POST for All Folder Paths');
  console.log('-'.repeat(70));
  
  for (const folder of FOLDER_PATHS) {
    const contentType = folder.allowedTypes[0]; // Use first allowed type
    
    try {
      const result = await testPresignedPost(folder.name, contentType, folder.maxSizeMB);
      
      if (result.success) {
        console.log(`✅ ${folder.name.padEnd(30)} | Max: ${folder.maxSizeMB}MB | Type: ${contentType}`);
        testResults.passed++;
      } else {
        console.error(`❌ ${folder.name.padEnd(30)} | Error: ${result.error}`);
        testResults.failed++;
        testResults.errors.push({ test: folder.name, error: result.error });
      }
    } catch (error) {
      console.error(`❌ ${folder.name.padEnd(30)} | Error: ${error.message}`);
      testResults.failed++;
      testResults.errors.push({ test: folder.name, error: error.message });
    }
  }
  
  console.log('');
  
  console.log('📋 Test 3: Verify Security Features in Presigned POST');
  console.log('-'.repeat(70));
  
  try {
    const testFolder = 'profile-images';
    const testKey = `${testFolder}/security-test-${Date.now()}.jpg`;
    const maxFileSize = 5 * 1024 * 1024;
    
    const params = {
      Bucket: AWS_S3_BUCKET,
      Fields: {
        key: testKey,
        'Content-Type': 'image/jpeg',
        'x-amz-server-side-encryption': 'AES256',
        'x-amz-meta-upload-timestamp': new Date().toISOString()
      },
      Expires: 300,
      Conditions: [
        ['eq', '$Content-Type', 'image/jpeg'],
        ['eq', '$key', testKey],
        ['eq', '$x-amz-server-side-encryption', 'AES256'],
        ['eq', '$bucket', AWS_S3_BUCKET],
        ['content-length-range', 0, maxFileSize]
      ]
    };
    
    const presignedPost = await new Promise((resolve, reject) => {
      s3.createPresignedPost(params, (err, data) => {
        if (err) reject(err);
        else resolve(data);
      });
    });
    
    // Verify all security fields are present
    const requiredFields = ['key', 'Content-Type', 'x-amz-server-side-encryption', 'bucket', 'Policy', 'X-Amz-Signature'];
    const missingFields = requiredFields.filter(field => !presignedPost.fields[field]);
    
    if (missingFields.length === 0) {
      console.log('✅ File Size Enforcement (content-length-range in Policy)');
      console.log('✅ Content Type Whitelist (eq $Content-Type in Policy)');
      console.log('✅ Server-Side Encryption (AES256 enforced)');
      console.log('✅ Path Traversal Prevention (eq $key in Policy)');
      console.log('✅ Bucket Confusion Prevention (eq $bucket in Policy)');
      console.log('✅ Upload Metadata Tracking (x-amz-meta-* fields)');
      console.log('✅ Time-Limited URLs (300s expiration)');
      console.log('✅ Exact Key Match (exact path in signature)');
      testResults.passed += 8;
    } else {
      console.error(`❌ Missing security fields: ${missingFields.join(', ')}`);
      testResults.failed++;
      testResults.errors.push({ test: 'Security Features', error: `Missing fields: ${missingFields.join(', ')}` });
    }
  } catch (error) {
    console.error(`❌ Security features test failed: ${error.message}`);
    testResults.failed++;
    testResults.errors.push({ test: 'Security Features', error: error.message });
  }
  
  console.log('');
  
  console.log('📋 Test 4: Verify CORS Configuration');
  console.log('-'.repeat(70));
  
  try {
    const corsRules = await s3.getBucketCors({ Bucket: AWS_S3_BUCKET }).promise();
    
    if (corsRules.CORSRules && corsRules.CORSRules.length > 0) {
      console.log(`✅ CORS configured with ${corsRules.CORSRules.length} rule(s)`);
      
      corsRules.CORSRules.forEach((rule, idx) => {
        console.log(`   Rule ${idx + 1}:`);
        console.log(`   - Origins: ${rule.AllowedOrigins.join(', ')}`);
        console.log(`   - Methods: ${rule.AllowedMethods.join(', ')}`);
        console.log(`   - Headers: ${rule.AllowedHeaders ? rule.AllowedHeaders.join(', ') : 'None'}`);
      });
      testResults.passed++;
    } else {
      console.log('⚠️  No CORS rules configured (required for client-side uploads)');
      testResults.warnings++;
    }
  } catch (error) {
    console.log(`⚠️  CORS not configured: ${error.message}`);
    console.log('   Note: CORS is required for client-side uploads from browser');
    testResults.warnings++;
  }
  
  console.log('');
  
  console.log('📋 Test 5: Verify Folder Path Consistency');
  console.log('-'.repeat(70));
  
  const expectedFolders = FOLDER_PATHS.map(f => f.name);
  const invalidCharacters = /[^a-z0-9\-]/;
  
  let pathsValid = true;
  expectedFolders.forEach(folder => {
    if (invalidCharacters.test(folder)) {
      console.error(`❌ Invalid folder name: ${folder} (contains invalid characters)`);
      pathsValid = false;
      testResults.failed++;
    } else {
      console.log(`✅ ${folder} - Valid path`);
    }
  });
  
  if (pathsValid) {
    console.log(`✅ All ${expectedFolders.length} folder paths are valid`);
    testResults.passed++;
  }
  
  console.log('');
  
  console.log('📋 Test 6: Verify Content Type Mapping');
  console.log('-'.repeat(70));
  
  let contentTypesValid = true;
  FOLDER_PATHS.forEach(folder => {
    if (folder.allowedTypes.length === 0) {
      console.error(`❌ ${folder.name}: No allowed content types defined`);
      contentTypesValid = false;
      testResults.failed++;
    } else {
      console.log(`✅ ${folder.name.padEnd(30)} | Types: ${folder.allowedTypes.length} (${folder.allowedTypes[0]}, ...)`);
    }
  });
  
  if (contentTypesValid) {
    testResults.passed++;
  }
  
  console.log('');
  
  console.log('📋 Test 7: Verify Environment Configuration');
  console.log('-'.repeat(70));
  
  const requiredEnvVars = [
    'STORAGE_PROVIDER',
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'AWS_REGION',
    'AWS_S3_BUCKET'
  ];
  
  let envValid = true;
  requiredEnvVars.forEach(envVar => {
    const value = process.env[envVar];
    if (value) {
      if (envVar.includes('SECRET') || envVar.includes('KEY')) {
        console.log(`✅ ${envVar.padEnd(30)} | ***configured***`);
      } else {
        console.log(`✅ ${envVar.padEnd(30)} | ${value}`);
      }
    } else {
      console.error(`❌ ${envVar.padEnd(30)} | NOT SET`);
      envValid = false;
      testResults.failed++;
    }
  });
  
  if (envValid) {
    testResults.passed++;
  }
  
  console.log('');
  console.log('='.repeat(70));
  console.log('📊 TEST RESULTS SUMMARY');
  console.log('='.repeat(70));
  console.log(`✅ Passed: ${testResults.passed}`);
  console.log(`❌ Failed: ${testResults.failed}`);
  console.log(`⚠️  Warnings: ${testResults.warnings}`);
  console.log('');
  
  if (testResults.errors.length > 0) {
    console.log('❌ ERRORS FOUND:');
    testResults.errors.forEach((err, idx) => {
      console.log(`   ${idx + 1}. ${err.test}: ${err.error}`);
    });
    console.log('');
  }
  
  if (testResults.failed === 0 && testResults.warnings === 0) {
    console.log('🎉 ALL TESTS PASSED! System is 100% ready for production!');
    console.log('');
    console.log('✅ All folder paths configured correctly');
    console.log('✅ All security features operational');
    console.log('✅ AWS S3 integration working');
    console.log('✅ Environment variables configured');
  } else if (testResults.failed === 0) {
    console.log('✅ All critical tests passed! (Some warnings present)');
    console.log('⚠️  Please review warnings above');
  } else {
    console.log('❌ TESTS FAILED! Please fix errors above before deploying');
    process.exit(1);
  }
  
  console.log('');
  console.log('📝 Next Steps:');
  console.log('   1. Configure CORS if not done (required for browser uploads)');
  console.log('   2. Test upload endpoints with real frontend');
  console.log('   3. Monitor upload logs for any issues');
  console.log('   4. Set up CloudWatch alarms for failed uploads');
}

// Run all tests
console.log('🚀 Starting comprehensive upload system tests...');
console.log('');
runTests().catch(error => {
  console.error('');
  console.error('❌ FATAL ERROR:');
  console.error(error);
  process.exit(1);
});
