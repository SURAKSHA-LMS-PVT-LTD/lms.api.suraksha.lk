import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import * as QRCode from 'qrcode';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import { UserEntity } from '../../user/entities/user.entity';
import { CloudStorageService } from '../../../common/services/cloud-storage.service';

@Injectable()
export class IdCardGeneratorService {
  private readonly logger = new Logger(IdCardGeneratorService.name);

  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    private readonly cloudStorageService: CloudStorageService
  ) {}

  async generateUserIdCard(userId: string): Promise<string> {
    try {

      // Get user details
      const user = await this.userRepository.findOne({ where: { id: userId } });
      if (!user) {
        throw new Error(`User with ID ${userId} not found`);
      }

      // Read the base PDF template
      const templatePath = path.join(process.cwd(), 'assets', 'templates', 'user_id_card', 'userIdCard.pdf');

      if (!fs.existsSync(templatePath)) {
        throw new Error(`Template PDF not found at: ${templatePath}`);
      }

      const existingPdfBytes = fs.readFileSync(templatePath);

      const pdfDoc = await PDFDocument.load(existingPdfBytes);

      // Get pages
      const pages = pdfDoc.getPages();
      if (pages.length < 2) {
        throw new Error('Template PDF must have at least 2 pages');
      }

      const firstPage = pages[0];
      const secondPage = pages[1];

      // Get page dimensions
      const { width: firstPageWidth, height: firstPageHeight } = firstPage.getSize();
      const { width: secondPageWidth, height: secondPageHeight } = secondPage.getSize();

      // Generate QR code
      const qrCodeDataUrl = await QRCode.toDataURL(userId, {
        width: 200,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF',
        },
      });

      // Convert QR code data URL to buffer
      const qrCodeBuffer = Buffer.from(qrCodeDataUrl.split(',')[1], 'base64');
      const qrCodeImage = await pdfDoc.embedPng(qrCodeBuffer);

      // Embed user image if available
      let userImage = null;
      if (user.imageUrl) {
        try {
          userImage = await this.embedImageFromUrl(pdfDoc, user.imageUrl);
          if (userImage) {
          } else {
            this.logger.warn(`⚠️  Failed to load user image from: ${user.imageUrl}`);
          }
        } catch (error) {
          this.logger.error(`❌ Error loading user image from ${user.imageUrl}:`, error);
        }
      } else {
      }

      // Embed font
      const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

      // First page - Add user info (overlaid on your template)
      const fullName = `${user.firstName} ${user.lastName || ''}`.trim();
      const userType = user.userType || 'USER';

      // Configure overlay positions (adjust these values to match your template design)
      const nameTextSize = 12;
      const typeTextSize = 12;
      const idTextSize = 12;

      // Position settings - modify these to match your template layout
      const nameY = firstPageHeight * 0.6; // 60% from bottom
      const typeY = firstPageHeight * 0.5; // 50% from bottom  
      const idY = firstPageHeight * 0.4;   // 40% from bottom

      // Calculate text positions for centering
      const nameWidth = font.widthOfTextAtSize(fullName, nameTextSize);
      const typeWidth = regularFont.widthOfTextAtSize(userType, typeTextSize);


      // Add user image if available (positioned on your template)
      if (userImage) {
        // User image should be passport size photo, but scaled to fit ID card template
        const imageSize = 80; // ID card display size (adjust for your template)
        const imageX = 142;   // X position on your template
        const imageY = 9;     // Y position on your template


        firstPage.drawImage(userImage, {
          x: firstPageWidth * 0.68,
          y: firstPageHeight * 0.26,
          width: 56.95,
          height: 74.01,
        });
      }

      // Add name (positioned on your template)
      firstPage.drawText(fullName, {
        x: firstPageWidth * 0.08,
        y: nameY,
        size: nameTextSize,
        font: font,
        color: rgb(1, 1, 1), // White color
      });

      // Add user type (positioned on your template)
      firstPage.drawText(userType, {
        x: firstPageWidth * 0.08,
        y: typeY,
        size: typeTextSize,
        font: regularFont,
        color: rgb(1, 1, 1), // White color
      });

      //   // Add user ID (centered horizontally on your template)
      //   const userIdText = `ID: ${userId}`;
      //   const userIdWidth = regularFont.widthOfTextAtSize(userIdText, idTextSize);
      //   firstPage.drawText(userIdText, {
      //     x: (firstPageWidth - userIdWidth) / 2,
      //     y: idY,
      //     size: idTextSize,
      //     font: regularFont,
      //     color: rgb(1, 1, 1), // White color
      //   });

      // Second page - Add QR code (overlaid on your template)
      const qrCodeSize = 75;

      // Position settings for QR code - modify these to match your template layout
      const qrX = (secondPageWidth - qrCodeSize) / 2;  // Centered horizontally
      const qrY = (secondPageHeight - qrCodeSize) / 2; // Centered vertically


      secondPage.drawImage(qrCodeImage, {
        x: qrX,
        y: qrY,
        width: qrCodeSize,
        height: qrCodeSize,
      });

      //   // Add text below QR code on your template
      //   const qrText = `Scan for User ID: ${userId}`;
      //   const qrTextWidth = regularFont.widthOfTextAtSize(qrText, 12);
      //   secondPage.drawText(qrText, {
      //     x: (secondPageWidth - qrTextWidth) / 2,
      //     y: qrY - 40, // Below the QR code
      //     size: 12,
      //     font: regularFont,
      //     color: rgb(1, 1, 1), // White color
      //   });

      // Save the PDF
      const pdfBytes = await pdfDoc.save();

      // Create temporary file
      const tempDir = path.join(process.cwd(), 'temp');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      const tempFilePath = path.join(tempDir, `${userId}_${userType}_id_card.pdf`);
      fs.writeFileSync(tempFilePath, pdfBytes);

      // Upload to Cloud Storage
      const relativePath = `id-documents/${userId}_id_card.pdf`;
      const gcsResult = await this.cloudStorageService.uploadFile(
        Buffer.from(pdfBytes),
        relativePath,
        'application/pdf'
      );

      // Update user with ID card URL
      await this.userRepository.update(userId, { idUrl: gcsResult.fullUrl });

      // Clean up temporary file
      fs.unlinkSync(tempFilePath);

      return gcsResult.fullUrl;

    } catch (error) {
      this.logger.error(`Error generating ID card for user ${userId}:`, error);
      throw error;
    }
  }

  async regenerateUserIdCard(userId: string): Promise<string> {
    return await this.generateUserIdCard(userId);
  }

  async generateIdCardsForAllUsers(): Promise<{ success: string[], failed: string[] }> {
    try {
      const success: string[] = [];
      const failed: string[] = [];
      const BATCH_SIZE = 50;
      let offset = 0;

      // Process in batches to avoid memory issues
      while (true) {
        const users = await this.userRepository.find({
          where: { isActive: true },
          select: ['id', 'firstName', 'lastName', 'userType'],
          take: BATCH_SIZE,
          skip: offset,
          order: { id: 'ASC' },
        });

        if (users.length === 0) break;

        for (const user of users) {
          try {
            await this.generateUserIdCard(user.id);
            success.push(user.id);
          } catch (error) {
            failed.push(user.id);
            this.logger.error(`Failed to generate ID card for user: ${user.id}`, error);
          }
        }

        offset += BATCH_SIZE;
        if (users.length < BATCH_SIZE) break;
      }

      return { success, failed };

    } catch (error) {
      this.logger.error('Error in bulk ID card generation:', error);
      throw error;
    }
  }

  /**
   * Get template information for overlay positioning
   * This method helps you understand your template dimensions for better positioning
   */
  async getTemplateInfo(): Promise<{
    pageCount: number;
    firstPageDimensions: { width: number; height: number };
    secondPageDimensions?: { width: number; height: number };
  }> {
    try {
      const templatePath = path.join(process.cwd(), 'assets', 'templates', 'user_id_card', 'userIdCard.pdf');
      if (!fs.existsSync(templatePath)) {
        throw new Error(`Template PDF not found at: ${templatePath}`);
      }

      const existingPdfBytes = fs.readFileSync(templatePath);
      const pdfDoc = await PDFDocument.load(existingPdfBytes);
      const pages = pdfDoc.getPages();

      const info = {
        pageCount: pages.length,
        firstPageDimensions: pages[0].getSize(),
        secondPageDimensions: pages.length > 1 ? pages[1].getSize() : undefined,
      };

      return info;

    } catch (error) {
      this.logger.error('Error getting template info:', error);
      throw error;
    }
  }

  /**
   * Convert various URL formats to direct download URLs
   * Note: Google Drive URL handling removed
   */
  private convertToDirectUrl(url: string): string[] {
    // For direct URLs, just use as-is
    return [url];
  }

  /**
   * Download image from URL and return buffer with multiple URL attempts
   */
  private async downloadImage(url: string): Promise<Buffer> {
    const possibleUrls = this.convertToDirectUrl(url);
    let lastError: Error | undefined;


    for (const directUrl of possibleUrls) {
      try {
        return await this.downloadImageOnce(directUrl);
      } catch (error) {
        lastError = error as Error;
        this.logger.warn(`Failed to download from ${directUrl}: ${error.message}`);
      }
    }

    // If all Google Drive URLs failed, suggest alternative
    if (url.includes('drive.google.com')) {
      this.logger.error(`All Google Drive download attempts failed. Consider:
        1. Making the Google Drive file publicly accessible with "Anyone with the link can view"
        2. Using a direct image hosting service like Imgur, GitHub, or cloud storage
        3. Uploading the image to your server and using a local URL`);
    }

    throw lastError || new Error('Failed to download image from any URL');
  }

  /**
   * Single attempt to download image
   */
  private async downloadImageOnce(url: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {

      const protocol = url.startsWith('https:') ? https : http;

      const request = protocol.get(url, (response) => {

        // Handle redirects (Google Drive sometimes redirects)
        if (response.statusCode === 301 || response.statusCode === 302 || response.statusCode === 307) {
          if (response.headers.location) {
            return this.downloadImageOnce(response.headers.location).then(resolve).catch(reject);
          }
        }

        if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
          return;
        }

        const chunks: Buffer[] = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => {
          const buffer = Buffer.concat(chunks);

          // Check if we got an HTML page instead of an image (Google Drive error page)
          const content = buffer.toString('utf8', 0, Math.min(100, buffer.length));
          if (content.includes('<!DOCTYPE html>') || content.includes('<html')) {
            reject(new Error('Received HTML page instead of image - possibly a Google Drive access issue'));
            return;
          }

          resolve(buffer);
        });

        response.on('error', reject);
      });

      request.on('error', (error) => {
        this.logger.error(`Request error for URL ${url}:`, error);
        reject(error);
      });

      // Set timeout
      request.setTimeout(30000, () => {
        request.destroy();
        reject(new Error('Download timeout'));
      });
    });
  }

  /**
   * Detect image format from buffer
   */
  private detectImageFormat(buffer: Buffer): 'jpeg' | 'png' | 'unknown' {
    // Check for JPEG signature (FF D8 FF)
    if (buffer.length >= 3 && buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
      return 'jpeg';
    }

    // Check for PNG signature (89 50 4E 47 0D 0A 1A 0A)
    if (buffer.length >= 8 &&
      buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47 &&
      buffer[4] === 0x0D && buffer[5] === 0x0A && buffer[6] === 0x1A && buffer[7] === 0x0A) {
      return 'png';
    }

    return 'unknown';
  }

  /**
   * Embed image from URL into PDF document
   */
  private async embedImageFromUrl(pdfDoc: PDFDocument, imageUrl: string): Promise<any> {
    try {

      // Special handling for different URL types
      if (imageUrl.includes('drive.google.com')) {
      }

      const imageBuffer = await this.downloadImage(imageUrl);

      // Detect image format from buffer content
      const format = this.detectImageFormat(imageBuffer);

      if (format === 'jpeg') {
        return await pdfDoc.embedJpg(imageBuffer);
      } else if (format === 'png') {
        return await pdfDoc.embedPng(imageBuffer);
      } else {
        // If we can't detect the format, try both and see which works
        try {
          return await pdfDoc.embedPng(imageBuffer);
        } catch (pngError) {
          return await pdfDoc.embedJpg(imageBuffer);
        }
      }
    } catch (error) {
      this.logger.error(`Error embedding image from URL ${imageUrl}:`, error);
      return null;
    }
  }
}
