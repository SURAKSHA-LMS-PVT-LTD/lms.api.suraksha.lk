/**
 * Test script to generate a sample ID card for user 2
 * 
 * Run with: npx ts-node generate-sample-id.ts
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { StudentIdCardService } from './src/modules/id-card/services/student-id-card.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from './src/modules/user/entities/user.entity';
import * as path from 'path';
import * as fs from 'fs';
import axios from 'axios';

async function downloadLogoIfNeeded() {
  const assetsDir = path.join(process.cwd(), 'assets');
  const logoPath = path.join(assetsDir, 'suraksha-logo.png');
  
  // Check if logo already exists
  if (fs.existsSync(logoPath)) {
    console.log('✅ Using cached logo from assets/suraksha-logo.png');
    return logoPath;
  }
  
  // Create assets directory if it doesn't exist
  if (!fs.existsSync(assetsDir)) {
    fs.mkdirSync(assetsDir, { recursive: true });
  }
  
  // Download logo
  console.log('📥 Downloading logo for local cache...');
  try {
    const response = await axios.get('https://suraksha.lk/assets/logos/surakshalms-logo.png', {
      responseType: 'arraybuffer',
      timeout: 10000,
    });
    fs.writeFileSync(logoPath, Buffer.from(response.data));
    console.log('✅ Logo cached to assets/suraksha-logo.png');
    return logoPath;
  } catch (error) {
    console.log('⚠️  Failed to download logo, will use fallback');
    return null;
  }
}

async function bootstrap() {
  console.log('🚀 Starting ID Card Generation Script...\n');

  // Create NestJS application context
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    // Get services and repositories
    const studentIdCardService = app.get(StudentIdCardService);
    const userRepository = app.get<Repository<UserEntity>>(getRepositoryToken(UserEntity));

    // Download/cache logo if needed
    const logoPath = await downloadLogoIfNeeded();

    // Fetch user 2 from database
    console.log('📋 Fetching user with ID 2...');
    const user = await userRepository.findOne({ 
      where: { id: '2' },
    });

    if (!user) {
      console.error('❌ User with ID 2 not found in database');
      await app.close();
      return;
    }

    console.log(`✅ Found user: ${user.firstName} ${user.lastName || ''}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   User Type: ${user.userType}`);
    console.log(`   Image URL: ${user.imageUrl || 'Not set'}\n`);

    // Use user ID directly
    const studentId = user.id.toString();
    console.log(`📝 User ID: ${studentId}\n`);

    // Convert relative image URL to full URL if needed
    let photoUrl = user.imageUrl;
    if (photoUrl && !photoUrl.startsWith('http')) {
      // Remove leading slash if present
      const imagePath = photoUrl.startsWith('/') ? photoUrl.substring(1) : photoUrl;
      photoUrl = `${process.env.AWS_S3_BASE_URL}/${imagePath}`;
      console.log(`📸 Photo URL: ${photoUrl}`);
    }

    // Prepare ID card configuration
    const config = {
      userId: user.id.toString(),
      studentId: studentId,
      studentName: user.nameWithInitials || `${user.firstName} ${user.lastName || ''}`.trim(),
      issueDate: new Date().toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric' 
      }),
      barcodeNumber: `BAR${user.id}${Date.now()}`,
      
      // Logo - using local logo file (faster, no download)
      logoPath: logoPath || undefined,
      logoUrl: logoPath ? undefined : 'https://suraksha.lk/assets/logos/surakshalms-logo.png',  // Fallback if local doesn't exist
      
      // Photo - using user's profile image if available
      photoUrl: photoUrl || undefined,
      
      // Backside banner
      backsideUrl: 'https://storage.suraksha.lk/suraksha-lms-banner.jpg',
    };

    // Ensure temp directory exists
    const tempDir = path.join(process.cwd(), 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // Output path
    const outputPath = path.join(tempDir, `user_${user.id}_id_card.pdf`);

    // Generate ID card
    console.log('🎨 Generating ID card PDF...\n');
    const result = await studentIdCardService.generateIdCard(config, outputPath);

    console.log('\n✅ ID Card Generated Successfully!');
    console.log(`📄 PDF saved to: ${result}`);
    console.log('\n🖨️  Print instructions:');
    console.log('   1. Open the PDF file');
    console.log('   2. Print on A4 paper at 100% scale');
    console.log('   3. Do NOT use "Fit to Page"');
    console.log('\n📐 Card preparation:');
    console.log('   1. Cut rectangle shape');
    console.log('   2. Fold along the center line');
    console.log('   3. Paste both sides together');
    console.log('   4. Cut rounded corners');
    console.log('   5. Sign by authorized person');
    console.log('   6. Laminate the card\n');

  } catch (error) {
    console.error('❌ Error generating ID card:', error);
    console.error(error.stack);
  } finally {
    await app.close();
    console.log('👋 Script completed');
  }
}

bootstrap();
