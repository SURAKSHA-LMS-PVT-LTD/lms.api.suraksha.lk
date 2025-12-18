/**
 * 🌐 Google Cloud Storage Upload Integration Test
 * Actually uploads test files to GCS and verifies the upload
 * Run with: node test/test-gcs-upload-integration.js
 */

const { Storage } = require('@google-cloud/storage');
const fs = require('fs');
const path = require('path');

// Configuration
const GCS_KEY_PATH = path.join(__dirname, '..', 'gcs-service-account.json');
const TEST_BUCKET_NAME = process.env.GCS_BUCKET_NAME || 'laas-uploads-test';

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m'
};

console.log(`${colors.cyan}╔════════════════════════════════════════════════════════════╗${colors.reset}`);
console.log(`${colors.cyan}║    🌐 GOOGLE CLOUD STORAGE INTEGRATION TEST               ║${colors.reset}`);
console.log(`${colors.cyan}╚════════════════════════════════════════════════════════════╝${colors.reset}`);
console.log();

let storage;
let bucket;
let testResults = {
  passed: 0,
  failed: 0,
  tests: []
};

// Helper function to create test files
function createTestFile(filename, content, mimeType) {
  const testDir = path.join(__dirname, 'test-files');
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
  }
  
  const filepath = path.join(testDir, filename);
  
  if (mimeType === 'application/pdf') {
    // Create a minimal valid PDF
    const pdfContent = Buffer.from([
      0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a,
      ...Buffer.from('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n'),
      ...Buffer.from('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n'),
      ...Buffer.from('3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>\nendobj\n'),
      ...Buffer.from('xref\n0 4\n0000000000 65535 f\n'),
      ...Buffer.from('trailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n190\n%%EOF')
    ]);
    fs.writeFileSync(filepath, pdfContent);
  } else if (mimeType.startsWith('image/')) {
    // Create a minimal valid PNG (1x1 transparent pixel)
    const pngContent = Buffer.from([
      0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
      0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
      0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4, 0x89,
      0x00, 0x00, 0x00, 0x0A, 0x49, 0x44, 0x41, 0x54,
      0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01,
      0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44,
      0xAE, 0x42, 0x60, 0x82
    ]);
    fs.writeFileSync(filepath, pngContent);
  } else {
    fs.writeFileSync(filepath, content || 'Test file content for upload verification');
  }
  
  return filepath;
}

// Initialize GCS
async function initializeGCS() {
  console.log(`${colors.blue}[INIT]${colors.reset} Initializing Google Cloud Storage...`);
  
  try {
    // Check if service account key exists
    if (!fs.existsSync(GCS_KEY_PATH)) {
      throw new Error(`GCS service account key not found at: ${GCS_KEY_PATH}`);
    }
    
    const keyData = JSON.parse(fs.readFileSync(GCS_KEY_PATH, 'utf8'));
    console.log(`  ✓ Service account key found`);
    console.log(`  ✓ Project ID: ${keyData.project_id}`);
    console.log(`  ✓ Client email: ${keyData.client_email}`);
    
    // Initialize storage client
    storage = new Storage({
      keyFilename: GCS_KEY_PATH,
      projectId: keyData.project_id
    });
    
    console.log(`  ✓ Storage client initialized`);
    
    // Get or create bucket
    try {
      bucket = storage.bucket(TEST_BUCKET_NAME);
      const [exists] = await bucket.exists();
      
      if (exists) {
        console.log(`  ✓ Using existing bucket: ${TEST_BUCKET_NAME}`);
      } else {
        console.log(`  ℹ Bucket doesn't exist, will use default bucket from environment`);
        // Use default bucket name from environment or config
        const defaultBucket = process.env.GCS_BUCKET_NAME || 'laas-uploads';
        bucket = storage.bucket(defaultBucket);
        console.log(`  ✓ Using default bucket: ${defaultBucket}`);
      }
    } catch (error) {
      console.log(`  ${colors.yellow}⚠ WARNING${colors.reset} - ${error.message}`);
      // Try to use default bucket
      bucket = storage.bucket('laas-uploads');
      console.log(`  ✓ Using fallback bucket: laas-uploads`);
    }
    
    console.log();
    return true;
  } catch (error) {
    console.error(`  ${colors.red}✗ FAILED${colors.reset} - ${error.message}\n`);
    return false;
  }
}

// Test 1: Upload PNG image
async function testUploadPNG() {
  console.log(`${colors.blue}[TEST 1]${colors.reset} Uploading PNG image to GCS...`);
  
  try {
    const testFile = createTestFile('test-image.png', null, 'image/png');
    const fileBuffer = fs.readFileSync(testFile);
    const fileName = `test-uploads/test-image-${Date.now()}.png`;
    
    console.log(`  📤 Uploading: ${fileName}`);
    console.log(`  📊 File size: ${fileBuffer.length} bytes`);
    
    const file = bucket.file(fileName);
    await file.save(fileBuffer, {
      contentType: 'image/png',
      metadata: {
        metadata: {
          uploadedBy: 'integration-test',
          testRun: new Date().toISOString()
        }
      }
    });
    
    // Verify upload
    const [exists] = await file.exists();
    if (!exists) {
      throw new Error('File not found after upload');
    }
    
    // Get file metadata
    const [metadata] = await file.getMetadata();
    console.log(`  ✓ Upload successful`);
    console.log(`  ✓ Public URL: https://storage.googleapis.com/${bucket.name}/${fileName}`);
    console.log(`  ✓ Content type: ${metadata.contentType}`);
    console.log(`  ✓ Size: ${metadata.size} bytes`);
    
    // Clean up
    await file.delete();
    console.log(`  ✓ Test file cleaned up`);
    
    testResults.passed++;
    testResults.tests.push({ name: 'Upload PNG Image', status: 'passed' });
    console.log(`  ${colors.green}✓ PASSED${colors.reset}\n`);
    
  } catch (error) {
    testResults.failed++;
    testResults.tests.push({ name: 'Upload PNG Image', status: 'failed', error: error.message });
    console.log(`  ${colors.red}✗ FAILED${colors.reset} - ${error.message}\n`);
  }
}

// Test 2: Upload PDF document
async function testUploadPDF() {
  console.log(`${colors.blue}[TEST 2]${colors.reset} Uploading PDF document to GCS...`);
  
  try {
    const testFile = createTestFile('test-document.pdf', null, 'application/pdf');
    const fileBuffer = fs.readFileSync(testFile);
    const fileName = `test-uploads/test-document-${Date.now()}.pdf`;
    
    console.log(`  📤 Uploading: ${fileName}`);
    console.log(`  📊 File size: ${fileBuffer.length} bytes`);
    
    const file = bucket.file(fileName);
    await file.save(fileBuffer, {
      contentType: 'application/pdf',
      metadata: {
        metadata: {
          uploadedBy: 'integration-test',
          testRun: new Date().toISOString(),
          fileType: 'payment-receipt'
        }
      }
    });
    
    // Verify upload
    const [exists] = await file.exists();
    if (!exists) {
      throw new Error('File not found after upload');
    }
    
    const [metadata] = await file.getMetadata();
    console.log(`  ✓ Upload successful`);
    console.log(`  ✓ Public URL: https://storage.googleapis.com/${bucket.name}/${fileName}`);
    console.log(`  ✓ Content type: ${metadata.contentType}`);
    console.log(`  ✓ Size: ${metadata.size} bytes`);
    
    // Clean up
    await file.delete();
    console.log(`  ✓ Test file cleaned up`);
    
    testResults.passed++;
    testResults.tests.push({ name: 'Upload PDF Document', status: 'passed' });
    console.log(`  ${colors.green}✓ PASSED${colors.reset}\n`);
    
  } catch (error) {
    testResults.failed++;
    testResults.tests.push({ name: 'Upload PDF Document', status: 'failed', error: error.message });
    console.log(`  ${colors.red}✗ FAILED${colors.reset} - ${error.message}\n`);
  }
}

// Test 3: Upload to specific folder (simulating SMS payment slip)
async function testUploadToFolder() {
  console.log(`${colors.blue}[TEST 3]${colors.reset} Uploading to specific folder (SMS payments)...`);
  
  try {
    const testFile = createTestFile('payment-slip.jpg', null, 'image/jpeg');
    const fileBuffer = fs.readFileSync(testFile);
    const instituteId = '12345';
    const timestamp = Date.now();
    const fileName = `sms-payments/${instituteId}/payment_slip_${timestamp}_test.jpg`;
    
    console.log(`  📤 Uploading to folder: sms-payments/${instituteId}/`);
    console.log(`  📊 File size: ${fileBuffer.length} bytes`);
    
    const file = bucket.file(fileName);
    await file.save(fileBuffer, {
      contentType: 'image/jpeg',
      metadata: {
        metadata: {
          uploadedBy: 'integration-test',
          instituteId: instituteId,
          uploadType: 'sms-payment-slip'
        }
      }
    });
    
    // Verify upload
    const [exists] = await file.exists();
    if (!exists) {
      throw new Error('File not found after upload');
    }
    
    const [metadata] = await file.getMetadata();
    console.log(`  ✓ Upload successful`);
    console.log(`  ✓ Full path: ${fileName}`);
    console.log(`  ✓ Public URL: https://storage.googleapis.com/${bucket.name}/${fileName}`);
    console.log(`  ✓ Relative path (stored in DB): /${fileName}`);
    
    // Clean up
    await file.delete();
    console.log(`  ✓ Test file cleaned up`);
    
    testResults.passed++;
    testResults.tests.push({ name: 'Upload to Specific Folder', status: 'passed' });
    console.log(`  ${colors.green}✓ PASSED${colors.reset}\n`);
    
  } catch (error) {
    testResults.failed++;
    testResults.tests.push({ name: 'Upload to Specific Folder', status: 'failed', error: error.message });
    console.log(`  ${colors.red}✗ FAILED${colors.reset} - ${error.message}\n`);
  }
}

// Test 4: Upload profile image
async function testUploadProfileImage() {
  console.log(`${colors.blue}[TEST 4]${colors.reset} Uploading profile image...`);
  
  try {
    const testFile = createTestFile('profile.png', null, 'image/png');
    const fileBuffer = fs.readFileSync(testFile);
    const userId = '67890';
    const fileName = `profile-images/user-${userId}-${Date.now()}.png`;
    
    console.log(`  📤 Uploading profile image for user: ${userId}`);
    console.log(`  📊 File size: ${fileBuffer.length} bytes`);
    
    const file = bucket.file(fileName);
    await file.save(fileBuffer, {
      contentType: 'image/png',
      metadata: {
        metadata: {
          uploadedBy: 'integration-test',
          userId: userId,
          uploadType: 'profile-image'
        }
      }
    });
    
    // Verify upload
    const [exists] = await file.exists();
    if (!exists) {
      throw new Error('File not found after upload');
    }
    
    const [metadata] = await file.getMetadata();
    console.log(`  ✓ Upload successful`);
    console.log(`  ✓ Public URL: https://storage.googleapis.com/${bucket.name}/${fileName}`);
    console.log(`  ✓ Size: ${metadata.size} bytes`);
    
    // Clean up
    await file.delete();
    console.log(`  ✓ Test file cleaned up`);
    
    testResults.passed++;
    testResults.tests.push({ name: 'Upload Profile Image', status: 'passed' });
    console.log(`  ${colors.green}✓ PASSED${colors.reset}\n`);
    
  } catch (error) {
    testResults.failed++;
    testResults.tests.push({ name: 'Upload Profile Image', status: 'failed', error: error.message });
    console.log(`  ${colors.red}✗ FAILED${colors.reset} - ${error.message}\n`);
  }
}

// Test 5: Upload homework file
async function testUploadHomework() {
  console.log(`${colors.blue}[TEST 5]${colors.reset} Uploading homework submission...`);
  
  try {
    const testFile = createTestFile('homework.pdf', null, 'application/pdf');
    const fileBuffer = fs.readFileSync(testFile);
    const studentId = '11111';
    const homeworkId = '22222';
    const fileName = `homework-files/${studentId}_${homeworkId}_submission.pdf`;
    
    console.log(`  📤 Uploading homework for student: ${studentId}`);
    console.log(`  📊 File size: ${fileBuffer.length} bytes`);
    
    const file = bucket.file(fileName);
    await file.save(fileBuffer, {
      contentType: 'application/pdf',
      metadata: {
        metadata: {
          uploadedBy: 'integration-test',
          studentId: studentId,
          homeworkId: homeworkId,
          uploadType: 'homework-submission'
        }
      }
    });
    
    // Verify upload
    const [exists] = await file.exists();
    if (!exists) {
      throw new Error('File not found after upload');
    }
    
    const [metadata] = await file.getMetadata();
    console.log(`  ✓ Upload successful`);
    console.log(`  ✓ Public URL: https://storage.googleapis.com/${bucket.name}/${fileName}`);
    
    // Clean up
    await file.delete();
    console.log(`  ✓ Test file cleaned up`);
    
    testResults.passed++;
    testResults.tests.push({ name: 'Upload Homework File', status: 'passed' });
    console.log(`  ${colors.green}✓ PASSED${colors.reset}\n`);
    
  } catch (error) {
    testResults.failed++;
    testResults.tests.push({ name: 'Upload Homework File', status: 'failed', error: error.message });
    console.log(`  ${colors.red}✗ FAILED${colors.reset} - ${error.message}\n`);
  }
}

// Test 6: List uploaded files
async function testListFiles() {
  console.log(`${colors.blue}[TEST 6]${colors.reset} Listing files in bucket...`);
  
  try {
    const [files] = await bucket.getFiles({
      prefix: 'test-uploads/',
      maxResults: 10
    });
    
    console.log(`  ✓ Found ${files.length} files in test-uploads/ folder`);
    
    if (files.length > 0) {
      console.log(`  ℹ Sample files:`);
      files.slice(0, 5).forEach(file => {
        console.log(`    - ${file.name}`);
      });
    }
    
    testResults.passed++;
    testResults.tests.push({ name: 'List Files', status: 'passed' });
    console.log(`  ${colors.green}✓ PASSED${colors.reset}\n`);
    
  } catch (error) {
    testResults.failed++;
    testResults.tests.push({ name: 'List Files', status: 'failed', error: error.message });
    console.log(`  ${colors.red}✗ FAILED${colors.reset} - ${error.message}\n`);
  }
}

// Main test runner
async function runTests() {
  console.log(`${colors.magenta}Starting Google Cloud Storage integration tests...${colors.reset}\n`);
  
  const initialized = await initializeGCS();
  
  if (!initialized) {
    console.log(`${colors.red}Cannot proceed without GCS initialization${colors.reset}`);
    process.exit(1);
  }
  
  await testUploadPNG();
  await testUploadPDF();
  await testUploadToFolder();
  await testUploadProfileImage();
  await testUploadHomework();
  await testListFiles();
  
  // Print summary
  console.log(`${colors.cyan}═════════════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.cyan}                    TEST SUMMARY                              ${colors.reset}`);
  console.log(`${colors.cyan}═════════════════════════════════════════════════════════════${colors.reset}`);
  console.log();
  console.log(`  Total Tests: ${testResults.passed + testResults.failed}`);
  console.log(`  ${colors.green}✓ Passed: ${testResults.passed}${colors.reset}`);
  console.log(`  ${colors.red}✗ Failed: ${testResults.failed}${colors.reset}`);
  console.log();
  
  if (testResults.failed === 0) {
    console.log(`${colors.green}  ✓✓✓ ALL TESTS PASSED ✓✓✓${colors.reset}`);
    console.log(`${colors.green}  GCS upload functionality is working!${colors.reset}`);
  } else {
    console.log(`${colors.red}  ✗✗✗ SOME TESTS FAILED ✗✗✗${colors.reset}`);
    console.log(`${colors.red}  Please review the failed tests above.${colors.reset}`);
  }
  
  console.log();
  console.log(`${colors.cyan}═════════════════════════════════════════════════════════════${colors.reset}`);
  
  process.exit(testResults.failed > 0 ? 1 : 0);
}

// Run the tests
runTests().catch(error => {
  console.error(`${colors.red}Test suite failed:${colors.reset}`, error);
  process.exit(1);
});
