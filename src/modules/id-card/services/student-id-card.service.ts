/**
 * User ID Card Generator Service for NestJS
 * Generates professional user ID cards with QR code
 * 
 * Install dependencies:
 * npm install pdfkit @napi-rs/canvas axios qrcode
 * npm install --save-dev @types/pdfkit
 */

import { Injectable } from '@nestjs/common';
import * as PDFDocument from 'pdfkit';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import * as QRCode from 'qrcode';

// Constants for card dimensions (in points, 72 points = 1 inch)
const INCH = 72;
const A4_WIDTH = 8.27 * INCH;
const A4_HEIGHT = 11.69 * INCH;
const CARD_WIDTH = 3.37 * INCH;
const CARD_HEIGHT = 2.125 * INCH;

// Colors (Suraksha Blue Theme)
const COLORS = {
  headerColor: '#1E6FBF',      // Suraksha Blue
  borderColor: '#2C3E50',      // Dark Blue-Gray
  textPrimary: '#2C3E50',      // Dark text
  textSecondary: '#7F8C8D',    // Gray text
  accentColor: '#1E6FBF',      // Blue accent
  white: '#FFFFFF',
  lightGray: '#F5F5F5',
};

export interface StudentIDConfig {
  // User Information
  userId: string;
  studentId: string;
  studentName: string;
  issueDate: string;
  barcodeNumber: string;
  
  // Image URLs or paths
  logoUrl?: string;
  photoUrl?: string;
  
  // Optional: Local file paths
  logoPath?: string;
  photoPath?: string;
}

@Injectable()
export class StudentIdCardService {
  
  /**
   * Generate User ID Card PDF
   */
  async generateIdCard(
    config: StudentIDConfig,
    outputPath: string,
  ): Promise<string> {
    return new Promise(async (resolve, reject) => {
      try {
        // Create PDF document
        const doc = new (PDFDocument as any)({
          size: [A4_WIDTH, A4_HEIGHT],
          margins: { top: 0, bottom: 0, left: 0, right: 0 },
        });

        // Pipe to file
        const stream = fs.createWriteStream(outputPath);
        doc.pipe(stream);

        // Calculate positions
        const marginX = (A4_WIDTH - CARD_WIDTH) / 2;
        const titleY = 0.4 * INCH;  // Title at top
        const verticalSpacing = 0.12 * INCH;  // ~3mm between cards

        // Title at top
        doc.fontSize(16)
          .fillColor(COLORS.borderColor)
          .font('Helvetica-Bold')
          .text('USER ID CARD', 0, titleY, {
            width: A4_WIDTH,
            align: 'center',
          });

        doc.fontSize(9)
          .fillColor(COLORS.textSecondary)
          .font('Helvetica')
          .text('Print on A4 Paper at 100% Scale', 0, titleY + 0.25 * INCH, {
            width: A4_WIDTH,
            align: 'center',
          });

        // Calculate total cards height and center vertically
        const cardsHeight = CARD_HEIGHT + verticalSpacing + CARD_HEIGHT;
        const cardsStartY = titleY + 0.8 * INCH + (A4_HEIGHT - titleY - 0.8 * INCH - cardsHeight - 1.2 * INCH) / 2;
        
        // Front card position - vertically centered in available space
        const frontY = cardsStartY;

        // Draw front side
        await this.drawFrontSide(doc, marginX, frontY, config);

        // Back card position - below front card
        const backY = frontY + CARD_HEIGHT + verticalSpacing;

        // Draw back side
        await this.drawBackSide(doc, marginX, backY, config);

        // FRONT SIDE label - centered at top of front card
        doc.fontSize(10)
          .fillColor(COLORS.borderColor)
          .font('Helvetica-Bold')
          .text('FRONT SIDE', 0, frontY - 0.25 * INCH, {
            width: A4_WIDTH,
            align: 'center',
          });

        // BACK SIDE label - centered below back card
        doc.fontSize(10)
          .fillColor(COLORS.borderColor)
          .font('Helvetica-Bold')
          .text('BACK SIDE', 0, backY + CARD_HEIGHT + 0.15 * INCH, {
            width: A4_WIDTH,
            align: 'center',
          });

        // Draw fold line between cards (extended length)
        const foldLineY = frontY + CARD_HEIGHT + verticalSpacing / 2;
        const foldLineStartX = marginX - 1.0 * INCH;  // Extend 1" to left
        const foldLineEndX = marginX + CARD_WIDTH + 1.0 * INCH;  // Extend 1" to right
        doc
          .save()
          .strokeColor(COLORS.borderColor)
          .lineWidth(1)
          .dash(5, 5)
          .moveTo(foldLineStartX, foldLineY)
          .lineTo(foldLineEndX, foldLineY)
          .stroke()
          .restore();

        // Fold line label at start position (above the line)
        doc
          .fontSize(8)
          .fillColor(COLORS.borderColor)
          .font('Helvetica-Bold')
          .text('FOLD LINE', foldLineStartX, foldLineY - 0.25 * INCH, {
            width: 1.0 * INCH,
            align: 'left',
          });

        // Draw starting section marker (arrow pointing to line start)
        const arrowSize = 0.12 * INCH;
        doc
          .save()
          .fillColor(COLORS.borderColor)
          .moveTo(foldLineStartX, foldLineY)
          .lineTo(foldLineStartX - arrowSize, foldLineY - arrowSize / 2)
          .lineTo(foldLineStartX - arrowSize, foldLineY + arrowSize / 2)
          .fill()
          .restore();

        // Draw fold instruction icon at end of line (right side)
        const iconX = foldLineEndX + 0.1 * INCH;
        const iconY = foldLineY - 0.5 * INCH;
        const iconSize = 0.8 * INCH;

        // Draw paper rectangle (top part - dashed outline)
        doc
          .save()
          .strokeColor(COLORS.borderColor)
          .lineWidth(1.5)
          .dash(3, 3)
          .rect(iconX, iconY, iconSize * 0.8, iconSize * 0.4)
          .stroke()
          .restore();

        // Draw paper rectangle (bottom part - solid)
        doc
          .save()
          .strokeColor(COLORS.borderColor)
          .lineWidth(1.5)
          .fillColor('#E8E8F0')
          .rect(iconX, iconY + iconSize * 0.4, iconSize * 0.8, iconSize * 0.6)
          .fillAndStroke()
          .restore();

        // Draw curved arrow
        const arrowStartX = iconX + iconSize * 0.8 + 0.1 * INCH;
        const arrowStartY = iconY + iconSize * 0.25;
        const arrowEndX = iconX + iconSize * 0.4;
        const arrowEndY = iconY + iconSize * 0.7;

        doc
          .save()
          .strokeColor(COLORS.borderColor)
          .lineWidth(2)
          .moveTo(arrowStartX, arrowStartY)
          .bezierCurveTo(
            arrowStartX, arrowStartY + 0.2 * INCH,
            arrowEndX + 0.15 * INCH, arrowEndY - 0.15 * INCH,
            arrowEndX, arrowEndY
          )
          .stroke()
          .restore();

        // Draw arrowhead
        doc
          .save()
          .fillColor(COLORS.borderColor)
          .moveTo(arrowEndX, arrowEndY)
          .lineTo(arrowEndX + 0.08 * INCH, arrowEndY - 0.08 * INCH)
          .lineTo(arrowEndX + 0.05 * INCH, arrowEndY + 0.02 * INCH)
          .fill()
          .restore();

        // "FOLD" text under icon
        doc
          .fontSize(7)
          .fillColor(COLORS.borderColor)
          .font('Helvetica-Bold')
          .text('FOLD', iconX, iconY + iconSize + 0.05 * INCH, {
            width: iconSize * 0.8,
            align: 'center',
          });

        // Draw cutting lines with scissors icons (1mm padding from card)
        const cutPadding = 0.04 * INCH; // 1mm ≈ 0.04"
        const cutLeft = marginX - cutPadding;
        const cutRight = marginX + CARD_WIDTH + cutPadding;
        const cutTop = frontY - cutPadding;
        const cutBottom = backY + CARD_HEIGHT + cutPadding;

        // Top cutting line
        this.drawCuttingLine(doc, cutLeft, cutTop, cutRight, cutTop, 'horizontal');

        // Bottom cutting line
        this.drawCuttingLine(doc, cutLeft, cutBottom, cutRight, cutBottom, 'horizontal');

        // Left cutting line
        this.drawCuttingLine(doc, cutLeft, cutTop, cutLeft, cutBottom, 'vertical');

        // Right cutting line
        this.drawCuttingLine(doc, cutRight, cutTop, cutRight, cutBottom, 'vertical');

        // Footer instructions at bottom
        doc.fontSize(7)
          .fillColor(COLORS.textSecondary)
          .font('Helvetica')
          .text(
            `Card Size: ${(CARD_WIDTH / INCH).toFixed(2)}" × ${(CARD_HEIGHT / INCH).toFixed(2)}" (3.37" × 2.125")`,
            0,
            A4_HEIGHT - 1.0 * INCH,
            { width: A4_WIDTH, align: 'center' },
          )
          .text(
            'Instructions: 1) Cut rectangle 2) Fold and paste 3) Cut rounded corners 4) Sign by authorized person 5) Laminate',
            0,
            A4_HEIGHT - 0.88 * INCH,
            { width: A4_WIDTH, align: 'center' },
          )
          .text(
            'Print at 100% scale • Do not use "Fit to Page"',
            0,
            A4_HEIGHT - 0.76 * INCH,
            { width: A4_WIDTH, align: 'center' },
          )
          .text(
            `Generated: ${new Date().toLocaleString()}`,
            0,
            A4_HEIGHT - 0.64 * INCH,
            { width: A4_WIDTH, align: 'center' },
          );

        // Finalize PDF
        doc.end();

        stream.on('finish', () => {
          console.log(`✓ User ID card PDF created: ${outputPath}`);
          console.log(`✓ User: ${config.studentName} (${config.studentId})`);
          resolve(outputPath);
        });

        stream.on('error', reject);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Draw Cutting Line
   */
  private drawCuttingLine(
    doc: any,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    orientation: 'horizontal' | 'vertical',
  ): void {
    // Draw dashed cutting line
    doc
      .save()
      .strokeColor(COLORS.textSecondary)
      .lineWidth(0.5)
      .dash(3, 3)
      .moveTo(x1, y1)
      .lineTo(x2, y2)
      .stroke()
      .restore();
  }

  /**
   * Draw front side of ID card
   */
  private async drawFrontSide(
    doc: PDFKit.PDFDocument,
    x: number,
    y: number,
    config: StudentIDConfig,
  ): Promise<void> {
    const cornerRadius = 8;

    // Card background with border
    doc
      .roundedRect(x, y, CARD_WIDTH, CARD_HEIGHT, cornerRadius)
      .fillAndStroke(COLORS.white, COLORS.borderColor);

    // Header section at TOP
    const headerHeight = 0.5 * INCH;
    doc
      .roundedRect(x, y, CARD_WIDTH, headerHeight, cornerRadius)
      .fill(COLORS.headerColor);

    // Organization name at top
    doc
      .fontSize(14)
      .fillColor(COLORS.white)
      .font('Helvetica-Bold')
      .text(
        'SURAKSHA LMS',
        x,
        y + 0.2 * INCH,
        {
          width: CARD_WIDTH,
          align: 'center',
        },
      );

    // Logo circle at top
    await this.drawLogo(doc, x, y, CARD_HEIGHT, headerHeight, config);

    // Photo section
    await this.drawPhoto(doc, x, y, CARD_HEIGHT, headerHeight, config);

    // User information
    this.drawStudentInfo(doc, x, y, CARD_HEIGHT, headerHeight, config);

    // Signature section
    this.drawSignature(doc, x, y);
  }

  /**
   * Draw logo in white circle
   */
  private async drawLogo(
    doc: PDFKit.PDFDocument,
    x: number,
    y: number,
    cardHeight: number,
    headerHeight: number,
    config: StudentIDConfig,
  ): Promise<void> {
    const logoSize = 0.38 * INCH;
    const logoX = x + 0.15 * INCH;
    const logoY = y + 0.06 * INCH;

    // White circle background
    doc
      .circle(logoX + logoSize / 2, logoY + logoSize / 2, logoSize / 2)
      .fillAndStroke(COLORS.white, COLORS.headerColor);

    // Try to load and draw logo
    try {
      let logoBuffer: Buffer | null = null;

      // Try local path first
      if (config.logoPath && fs.existsSync(config.logoPath)) {
        console.log(`Loading logo from path: ${config.logoPath}`);
        logoBuffer = fs.readFileSync(config.logoPath);
      }
      // Try URL if local not available
      else if (config.logoUrl) {
        console.log(`Attempting to load logo from: ${config.logoUrl}`);
        try {
          const response = await axios.get(config.logoUrl, {
            responseType: 'arraybuffer',
            timeout: 10000,
            headers: {
              'User-Agent': 'Mozilla/5.0'
            },
            validateStatus: (status) => status === 200
          });
          logoBuffer = Buffer.from(response.data);
          console.log(`✓ Logo loaded successfully (${logoBuffer.length} bytes)`);
        } catch (logoError) {
          console.log(`⚠️  Logo URL failed: ${logoError.message}`);
          logoBuffer = null;
        }
      }
      
      // Try alternative logo URLs (PNG format)
      if (!logoBuffer) {
        const logoUrls = [
          'https://suraksha.lk/assets/logos/surakshalms-logo.png',
          'https://suraksha.lk/favicon.ico',
        ];
        
        for (const url of logoUrls) {
          if (logoBuffer) break;
          
          try {
            console.log(`Attempting to load logo from: ${url}`);
            const response = await axios.get(url, {
              responseType: 'arraybuffer',
              timeout: 10000,
              headers: {
                'User-Agent': 'Mozilla/5.0'
              },
              validateStatus: (status) => status === 200
            });
            const downloadedBuffer = Buffer.from(response.data);
            console.log(`✓ Logo downloaded from ${url} (${downloadedBuffer.length} bytes)`);
            
            // Convert to PNG using canvas to ensure compatibility
            try {
              const img = await loadImage(downloadedBuffer);
              const canvas = createCanvas(img.width, img.height);
              const ctx = canvas.getContext('2d');
              ctx.drawImage(img, 0, 0);
              logoBuffer = canvas.toBuffer('image/png');
              console.log(`✓ Converted to compatible PNG (${logoBuffer.length} bytes)`);
              break;
            } catch (convErr) {
              console.log(`⚠️  Conversion failed: ${convErr.message}`);
            }
          } catch (err) {
            console.log(`⚠️  Failed to load from ${url}: ${err.message}`);
          }
        }
      }
      
      if (logoBuffer && logoBuffer.length > 0) {
        try {
          const logoInnerSize = logoSize * 0.65;  // 65% for more white space
          const logoOffset = (logoSize - logoInnerSize) / 2;
          doc.image(
            logoBuffer,
            logoX + logoOffset,
            logoY + logoOffset,
            {
              fit: [logoInnerSize, logoInnerSize],
              align: 'center',
              valign: 'center',
            },
          );
        } catch (imgErr) {
          console.log(`⚠️  Image render failed: ${imgErr.message}`);
        }
      }
    } catch (error) {
      console.log(`⚠️  Logo not loaded: ${error.message}`);
    }
  }

  /**
   * Draw photo section (passport size)
   */
  private async drawPhoto(
    doc: PDFKit.PDFDocument,
    x: number,
    y: number,
    cardHeight: number,
    headerHeight: number,
    config: StudentIDConfig,
  ): Promise<void> {
    const photoWidth = 0.9 * INCH;
    const photoHeight = 1.15 * INCH; // 2:3 ratio (passport size)
    const photoX = x + 0.2 * INCH;
    const photoY = y + headerHeight + 0.1 * INCH;

    // Photo background (white, no shadow)
    doc
      .rect(photoX, photoY, photoWidth, photoHeight)
      .fillAndStroke(COLORS.white, COLORS.borderColor);

    // Try to load photo
    try {
      let photoBuffer: Buffer | null = null;

      if (config.photoPath && fs.existsSync(config.photoPath)) {
        console.log(`Loading photo from path: ${config.photoPath}`);
        photoBuffer = fs.readFileSync(config.photoPath);
      } else if (config.photoUrl) {
        console.log(`Loading photo from URL: ${config.photoUrl}`);
        const response = await axios.get(config.photoUrl, {
          responseType: 'arraybuffer',
          timeout: 10000,
          headers: {
            'User-Agent': 'Mozilla/5.0'
          }
        });
        photoBuffer = Buffer.from(response.data);
        console.log(`✓ Photo loaded successfully (${photoBuffer.length} bytes)`);
      }

      if (photoBuffer && photoBuffer.length > 0) {
        doc.image(photoBuffer, photoX + 2, photoY + 2, {
          fit: [photoWidth - 4, photoHeight - 4],
          align: 'center',
          valign: 'center',
        });
      }
    } catch (error) {
      console.log(`⚠️  Photo not loaded: ${error.message}`);
    }
  }

  /**
   * Draw user information
   */
  private drawStudentInfo(
    doc: PDFKit.PDFDocument,
    x: number,
    y: number,
    cardHeight: number,
    headerHeight: number,
    config: StudentIDConfig,
  ): void {
    const photoWidth = 0.9 * INCH;
    const infoX = x + 0.2 * INCH + photoWidth + 0.2 * INCH;
    const infoY = y + headerHeight + 0.1 * INCH;
    const lineSpacing = 0.18 * INCH;
    const fieldWidth = 1.5 * INCH;

    // User ID Section
    doc
      .fontSize(6)
      .fillColor(COLORS.textSecondary)
      .font('Helvetica')
      .text('USER ID', infoX, infoY);

    doc
      .fontSize(10)
      .fillColor(COLORS.textPrimary)
      .font('Helvetica-Bold')
      .text(config.studentId, infoX, infoY + 0.08 * INCH);

    // Decorative line
    doc
      .moveTo(infoX, infoY + 0.22 * INCH)
      .lineTo(infoX + fieldWidth, infoY + 0.22 * INCH)
      .lineWidth(1)
      .strokeColor(COLORS.accentColor)
      .stroke();

    // Name Section
    doc
      .fontSize(6)
      .fillColor(COLORS.textSecondary)
      .font('Helvetica')
      .text('NAME', infoX, infoY + lineSpacing + 0.12 * INCH);

    // Split long names into multiple lines
    const maxNameLength = 25;
    let studentName = config.studentName;
    if (studentName.length > maxNameLength) {
      // Try to split at space
      const words = studentName.split(' ');
      let line1 = '';
      let line2 = '';
      let currentLine = '';
      
      for (const word of words) {
        if ((currentLine + word).length <= maxNameLength) {
          currentLine += (currentLine ? ' ' : '') + word;
        } else {
          if (!line1) {
            line1 = currentLine;
            currentLine = word;
          } else {
            line2 = currentLine;
            break;
          }
        }
      }
      if (!line1) line1 = currentLine;
      if (!line2 && currentLine !== line1) line2 = currentLine;

      doc
        .fontSize(8)
        .fillColor(COLORS.textPrimary)
        .font('Helvetica-Bold')
        .text(line1, infoX, infoY + lineSpacing + 0.2 * INCH, {
          width: fieldWidth,
          lineBreak: false,
        });
      
      if (line2) {
        doc.text(line2, infoX, infoY + lineSpacing + 0.3 * INCH, {
          width: fieldWidth,
          lineBreak: false,
        });
      }
    } else {
      doc
        .fontSize(8)
        .fillColor(COLORS.textPrimary)
        .font('Helvetica-Bold')
        .text(studentName, infoX, infoY + lineSpacing + 0.2 * INCH, {
          width: fieldWidth,
        });
    }

    // Decorative line
    doc
      .moveTo(infoX, infoY + lineSpacing + 0.52 * INCH)
      .lineTo(infoX + fieldWidth, infoY + lineSpacing + 0.52 * INCH)
      .lineWidth(1)
      .strokeColor(COLORS.accentColor)
      .stroke();

    // Issue Date Section
    doc
      .fontSize(6)
      .fillColor(COLORS.textSecondary)
      .font('Helvetica')
      .text('ISSUE DATE', infoX, infoY + 2 * lineSpacing + 0.42 * INCH);

    doc
      .fontSize(8)
      .fillColor(COLORS.textPrimary)
      .font('Helvetica-Bold')
      .text(config.issueDate, infoX, infoY + 2 * lineSpacing + 0.5 * INCH);

    // Decorative line
    doc
      .moveTo(infoX, infoY + 2 * lineSpacing + 0.64 * INCH)
      .lineTo(infoX + fieldWidth, infoY + 2 * lineSpacing + 0.64 * INCH)
      .lineWidth(1)
      .strokeColor(COLORS.accentColor)
      .stroke();
  }

  /**
   * Draw signature section
   */
  private drawSignature(
    doc: PDFKit.PDFDocument,
    x: number,
    y: number,
  ): void {
    const sigWidth = 1.5 * INCH;
    const sigX = x + CARD_WIDTH - sigWidth - 0.25 * INCH;
    const sigY = y + CARD_HEIGHT - 0.16 * INCH;

    // Signature line
    doc
      .moveTo(sigX, sigY)
      .lineTo(sigX + sigWidth, sigY)
      .stroke(COLORS.textSecondary);

    // Label below line
    doc
      .fontSize(6)
      .fillColor(COLORS.textSecondary)
      .font('Helvetica')
      .text('Authorized Signature', sigX, sigY + 0.03 * INCH, {
        width: sigWidth,
        align: 'center',
      });
  }

  /**
   * Draw back side of ID card
   */
  private async drawBackSide(
    doc: PDFKit.PDFDocument,
    x: number,
    y: number,
    config: StudentIDConfig,
  ): Promise<void> {
    const cornerRadius = 8;

    // Save graphics state
    doc.save();
    
    // Calculate center of the card
    const centerX = x + CARD_WIDTH / 2;
    const centerY = y + CARD_HEIGHT / 2;
    
    // Rotate 180 degrees around center
    doc.translate(centerX, centerY)
       .rotate(180)
       .translate(-centerX, -centerY);

    // Card background with border
    doc
      .roundedRect(x, y, CARD_WIDTH, CARD_HEIGHT, cornerRadius)
      .fillAndStroke(COLORS.white, COLORS.borderColor);

    // QR code section (centered)
    await this.drawBarcode(doc, x, y, config);
    
    // Contact information at bottom
    this.drawContactInfo(doc, x, y);
    
    // Restore graphics state
    doc.restore();
  }

  /**
   * Draw QR code (scannable)
   */
  private async drawBarcode(
    doc: PDFKit.PDFDocument,
    x: number,
    y: number,
    config: StudentIDConfig,
  ): Promise<void> {
    const qrSize = 1.2 * INCH;
    const qrX = x + (CARD_WIDTH - qrSize) / 2;
    const qrY = y + (CARD_HEIGHT - qrSize) / 2 - 0.15 * INCH;

    try {
      // Generate QR code data with user information
      const qrData = JSON.stringify({
        userId: config.userId,
        studentId: config.studentId,
        name: config.studentName,
        barcodeNumber: config.barcodeNumber,
        issued: config.issueDate,
      });

      // Generate QR code as data URL
      const qrDataUrl = await QRCode.toDataURL(qrData, {
        width: qrSize * 2,
        margin: 1,
        errorCorrectionLevel: 'M',
      });

      // Convert data URL to buffer
      const qrBuffer = Buffer.from(qrDataUrl.split(',')[1], 'base64');

      // Draw QR code
      doc.image(qrBuffer, qrX, qrY, {
        width: qrSize,
        height: qrSize,
      });
    } catch (error) {
      console.warn('⚠️  Failed to generate QR code:', error.message);
    }
  }

  /**
   * Draw contact information on back side
   */
  private drawContactInfo(
    doc: PDFKit.PDFDocument,
    x: number,
    y: number,
  ): void {
    const footerY = y + CARD_HEIGHT - 0.35 * INCH;
    
    // Single line contact information
    doc
      .fontSize(7)
      .fillColor(COLORS.textSecondary)
      .font('Helvetica')
      .text('https://suraksha.lk       surakshalms@gmail.com       0703300524', x, footerY, {
        width: CARD_WIDTH,
        align: 'center',
      });
  }

}
