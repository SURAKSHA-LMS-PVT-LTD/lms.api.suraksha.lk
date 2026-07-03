/**
 * local-pdf-generation.service.ts
 *
 * DEV-ONLY: runs the full card generation pipeline on the backend.
 * Frontend sends layout config + user IDs → this service renders every card,
 * builds PDFs page-by-page, saves them to disk, opens the folder.
 *
 * No Drive, no credits, no job lifecycle — purely for local development.
 */
import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { CardRendererService, CardUser } from './card-renderer.service';

export interface LocalGenLayoutConfig {
  /** mm */
  pageW: number;
  pageH: number;
  cols: number;
  rows: number;
  mTop: number;
  mBottom: number;
  mLeft: number;
  mRight: number;
  headerH: number;
  footerH: number;
  gapHmm: number;
  gapVmm: number;
  cardScale: number;
  keepAspect: boolean;
  headerText: string;
  showPageNumbers: boolean;
  pageBgColor: string;
  dpi: number;
}

export interface LocalGenRequest {
  template: any;
  users: CardUser[];
  layout: LocalGenLayoutConfig;
  baseName: string;
}

@Injectable()
export class LocalPdfGenerationService {
  private readonly logger = new Logger(LocalPdfGenerationService.name);

  constructor(private readonly renderer: CardRendererService) {}

  async generate(req: LocalGenRequest): Promise<{ outputDir: string; files: string[] }> {
    const { template: tpl, users, layout, baseName } = req;
    const {
      pageW, pageH, cols, rows,
      mTop, mBottom, mLeft, mRight,
      headerH, footerH, gapHmm, gapVmm,
      cardScale, keepAspect,
      headerText, showPageNumbers, pageBgColor, dpi,
    } = layout;

    const gridTop   = mTop + headerH;
    const cardAreaW = pageW - mLeft - mRight;
    const cardAreaH = pageH - mTop - mBottom - headerH - footerH;
    const perPage   = cols * rows;
    const cellW     = (cardAreaW - gapHmm * (cols - 1)) / cols;
    const cellH     = (cardAreaH - gapVmm * (rows - 1)) / rows;
    const tplAspect = tpl.cardWidth / tpl.cardHeight;
    const scale     = Math.min(1, Math.max(0.2, cardScale / 100));
    const totalPages = Math.ceil(users.length / perPage);

    const { default: jsPDF } = await import('jspdf');

    const outputDir = path.resolve(process.cwd(), 'output', 'card-generations', `${baseName}_${Date.now()}`);
    fs.mkdirSync(outputDir, { recursive: true });

    // Parse page background color once
    const bgHex = pageBgColor.replace('#', '');
    const bgR = parseInt(bgHex.slice(0, 2), 16);
    const bgG = parseInt(bgHex.slice(2, 4), 16);
    const bgB = parseInt(bgHex.slice(4, 6), 16);

    const fillBg = (pdf: any) => {
      pdf.setFillColor(bgR, bgG, bgB);
      pdf.rect(mLeft, gridTop, cardAreaW, cardAreaH, 'F');
    };

    const drawChrome = (pdf: any, pageNo: number) => {
      if (headerText) {
        pdf.setFontSize(12); pdf.setTextColor(40);
        pdf.text(headerText, pageW / 2, mTop + 6, { align: 'center' });
      }
      if (showPageNumbers) {
        pdf.setFontSize(9); pdf.setTextColor(120);
        pdf.text(`Page ${pageNo} of ${totalPages}`, pageW / 2, pageH - 4, { align: 'center' });
      }
    };

    const savedFiles: string[] = [];
    const orientation = pageW > pageH ? 'l' : 'p';

    // Preload shared assets
    const bgDataUrl = tpl.backgroundImageUrl
      ? await this.fetchDataUrl(tpl.backgroundImageUrl)
      : null;
    const ovDataUrl = tpl.overlayImageUrl
      ? await this.fetchDataUrl(tpl.overlayImageUrl)
      : null;

    // Render all users into a single PDF (or multiple if memory is a concern)
    const pdf = new (jsPDF as any)({ orientation, unit: 'mm', format: [pageW, pageH] });
    fillBg(pdf);
    let pageCount = 0;
    let pageInDoc = 0;

    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      const slot = i % perPage;

      if (slot === 0) {
        if (pageInDoc > 0) {
          pdf.addPage();
          fillBg(pdf);
        }
        drawChrome(pdf, pageCount + 1);
        pageCount++;
        pageInDoc++;
      }

      let userImgUrl: string | null = null;
      if ((user as any).imageUrl) userImgUrl = (user as any).imageUrl;

      let png: Buffer;
      try {
        const result = await this.renderer.renderCardToPng(
          tpl, user, userImgUrl, bgDataUrl, ovDataUrl, { cardName: `${baseName}-${i + 1}` }, dpi,
        );
        png = result.png;
      } catch (err: any) {
        this.logger.warn(`Card render failed for user ${user.id}: ${err.message}`);
        continue;
      }

      const col = slot % cols;
      const row = Math.floor(slot / cols);
      const cellX = mLeft + col * (cellW + gapHmm);
      const cellY = gridTop + row * (cellH + gapVmm);

      let drawW = cellW * scale;
      let drawH = cellH * scale;
      if (keepAspect) {
        const cellAspect = drawW / drawH;
        if (tplAspect > cellAspect) drawH = drawW / tplAspect;
        else drawW = drawH * tplAspect;
      }
      const x = cellX + (cellW - drawW) / 2;
      const y = cellY + (cellH - drawH) / 2;

      const dataUrl = `data:image/png;base64,${png.toString('base64')}`;
      pdf.addImage(dataUrl, 'PNG', x, y, drawW, drawH);

      if (i % 10 === 0) {
        this.logger.log(`[DEV] Rendered ${i + 1}/${users.length} cards`);
      }
    }

    const safeName = baseName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const pdfPath = path.join(outputDir, `${safeName}.pdf`);
    const pdfBuffer = Buffer.from(pdf.output('arraybuffer'));
    fs.writeFileSync(pdfPath, pdfBuffer);
    savedFiles.push(pdfPath);

    this.logger.log(`[DEV] PDF saved: ${pdfPath}`);

    // Open folder
    const openCmd = process.platform === 'win32'
      ? `explorer "${outputDir}"`
      : process.platform === 'darwin'
        ? `open "${outputDir}"`
        : `xdg-open "${outputDir}"`;
    exec(openCmd, err => { if (err) this.logger.warn(`Open folder failed: ${err.message}`); });

    return { outputDir, files: savedFiles };
  }

  /** Only our own storage domain may be fetched server-side — prevents SSRF via
   * attacker/institute-admin-controlled template or profile image URLs. */
  private static readonly ALLOWED_IMAGE_HOSTS = new Set<string>(['storage.suraksha.lk']);

  private isAllowedImageUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return (parsed.protocol === 'https:' || parsed.protocol === 'http:')
        && LocalPdfGenerationService.ALLOWED_IMAGE_HOSTS.has(parsed.hostname);
    } catch {
      return false;
    }
  }

  private async fetchDataUrl(url: string): Promise<string> {
    if (!url || url.startsWith('data:')) return url || '';
    if (!this.isAllowedImageUrl(url)) return '';
    try {
      const https = require('https');
      const http = require('http');
      return await new Promise<string>(resolve => {
        const get = url.startsWith('https') ? https.get : http.get;
        get(url, (res: any) => {
          if (res.statusCode !== 200) { res.resume(); resolve(''); return; }
          const chunks: Buffer[] = [];
          res.on('data', (c: Buffer) => chunks.push(c));
          res.on('end', () => {
            const buf = Buffer.concat(chunks);
            let mime = 'image/jpeg';
            if (buf[0] === 0x89 && buf[1] === 0x50) mime = 'image/png';
            else if (buf[0] === 0x47 && buf[1] === 0x49) mime = 'image/gif';
            resolve(`data:${mime};base64,${buf.toString('base64')}`);
          });
          res.on('error', () => resolve(''));
        }).on('error', () => resolve(''));
      });
    } catch {
      return '';
    }
  }
}
