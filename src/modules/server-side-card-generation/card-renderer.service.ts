/**
 * card-renderer.service.ts
 *
 * Node.js port of the frontend cardRenderer.ts.
 * Uses @resvg/resvg-js (native bindings) instead of resvg-wasm.
 * Same SVG pipeline — buildCardSvg → resvg → PNG bytes.
 */
import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';

export interface CardUser {
  id: string;
  name: string;
  firstName?: string;
  lastName?: string;
  nameWithInitials?: string;
  email?: string;
  imageUrl?: string;
  userIdByInstitute?: string | null;
  instituteCardId?: string | null;
  className?: string;
}

export interface CardGenCtx {
  cardName?: string;
  qrUuid?: string;
}

export interface RenderCardResult {
  png: Buffer;
  qrValues: Record<string, string>;
  qrUuid?: string;
}

// ─── Font cache ────────────────────────────────────────────────────────────────

interface LoadedFont {
  data: Buffer;
  weight: number;
  style: 'normal' | 'italic';
}

const fontCache = new Map<string, LoadedFont[]>();

const FONT_VARIANTS = [
  { weight: 400, style: 'normal' as const, file: 'latin-400-normal' },
  { weight: 700, style: 'normal' as const, file: 'latin-700-normal' },
  { weight: 400, style: 'italic' as const, file: 'latin-400-italic' },
  { weight: 700, style: 'italic' as const, file: 'latin-700-italic' },
];

async function fetchBuffer(url: string): Promise<Buffer | null> {
  return new Promise(resolve => {
    const get = url.startsWith('https') ? https.get : http.get;
    get(url, res => {
      if (res.statusCode !== 200) { res.resume(); resolve(null); return; }
      const chunks: Buffer[] = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', () => resolve(null));
    }).on('error', () => resolve(null));
  });
}

async function loadFontFamily(family: string): Promise<LoadedFont[]> {
  if (fontCache.has(family)) return fontCache.get(family)!;
  const slug = family.toLowerCase().replace(/\s+/g, '-');
  const base = `https://cdn.jsdelivr.net/fontsource/fonts/${slug}@latest`;
  const fonts: LoadedFont[] = [];
  await Promise.all(FONT_VARIANTS.map(async v => {
    const buf = await fetchBuffer(`${base}/${v.file}.ttf`);
    if (!buf || buf.length < 4) return;
    const sig = buf.slice(0, 4).toString('hex');
    const valid = ['00010000', '4f54544f', '74727565', '74746366'].includes(sig);
    if (valid) fonts.push({ data: buf, weight: v.weight, style: v.style });
  }));
  fontCache.set(family, fonts);
  return fonts;
}

async function collectFontBuffers(tpl: any): Promise<Buffer[]> {
  const families = new Set<string>(['Roboto']);
  for (const el of tpl.elements || []) {
    if (el.type === 'text' && el.fontFamily) families.add(el.fontFamily);
  }
  const results = await Promise.all([...families].map(loadFontFamily));
  const buffers: Buffer[] = [];
  for (const list of results) for (const f of list) buffers.push(f.data);
  return buffers;
}

// ─── Image fetch → data URL ────────────────────────────────────────────────────

const imgCache = new Map<string, string>();

async function urlToDataUrl(url: string): Promise<string> {
  if (!url) return '';
  if (url.startsWith('data:')) return url;
  if (imgCache.has(url)) return imgCache.get(url)!;
  const buf = await fetchBuffer(url);
  if (!buf) return '';
  // Detect mime from magic bytes
  let mime = 'image/jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50) mime = 'image/png';
  else if (buf[0] === 0x47 && buf[1] === 0x49) mime = 'image/gif';
  else if (buf[0] === 0x52 && buf[1] === 0x49) mime = 'image/webp';
  const dataUrl = `data:${mime};base64,${buf.toString('base64')}`;
  imgCache.set(url, dataUrl);
  return dataUrl;
}

// ─── Token resolver ────────────────────────────────────────────────────────────

export function resolveTokens(template: string, user: CardUser, ctx?: CardGenCtx): string {
  const parts = (user.name || '').trim().split(/\s+/);
  const firstName = user.firstName || parts[0] || '';
  const lastName = user.lastName || (parts.length > 1 ? parts[parts.length - 1] : '');
  return (template || '')
    .replace(/\{id\}/g, user.id || '')
    .replace(/\{firstName\}/g, firstName)
    .replace(/\{lastName\}/g, lastName)
    .replace(/\{fullName\}/g, user.name || [firstName, lastName].filter(Boolean).join(' '))
    .replace(/\{nameWithInitials\}/g, user.nameWithInitials || user.name || '')
    .replace(/\{userIdByInstitute\}/g, user.userIdByInstitute || '')
    .replace(/\{instituteCardId\}/g, user.instituteCardId || user.userIdByInstitute || '')
    .replace(/\{email\}/g, user.email || '')
    .replace(/\{className\}/g, user.className || '')
    .replace(/\{generatingQrName\}/g, ctx?.cardName || '')
    .replace(/\{generatingQrUuid\}/g, ctx?.qrUuid || '');
}

function makeTruncatedUuid(length: number): string {
  const { v4 } = require('uuid');
  return v4().replace(/-/g, '').slice(0, Math.min(23, Math.max(15, length || 18)));
}

function resolveQrValue(el: any, user: CardUser, ctx?: CardGenCtx): { value: string; uuid?: string } {
  if (el.valueMode === 'token') return { value: resolveTokens(el.token, user, ctx) };
  if (el.valueMode === 'uuid') { const uuid = makeTruncatedUuid(el.uuidLength); return { value: uuid, uuid }; }
  let uuid: string | undefined;
  let pattern = el.pattern || '';
  if (pattern.includes('{uuid}')) { uuid = makeTruncatedUuid(el.uuidLength); pattern = pattern.replace(/\{uuid\}/g, uuid); }
  return { value: resolveTokens(pattern, user, ctx), uuid };
}

// ─── Auto font-size shrink (mirrors frontend autoFitFontSize) ─────────────────

function autoFitFontSize(base: number, textLen: number, maxLen?: number): number {
  if (!maxLen || textLen <= maxLen) return base;
  return Math.max(6, Math.floor(base * (maxLen / textLen)));
}

// ─── Word wrap ────────────────────────────────────────────────────────────────

function wrapText(text: string, fontPx: number, maxWidthPx: number): string[] {
  const approxCharW = fontPx * 0.55;
  const maxChars = Math.max(1, Math.floor(maxWidthPx / approxCharW));
  const out: string[] = [];
  for (const rawLine of text.split('\n')) {
    if (rawLine.length <= maxChars) { out.push(rawLine); continue; }
    let remaining = rawLine;
    while (remaining.length > maxChars) {
      let cut = remaining.lastIndexOf(' ', maxChars);
      if (cut <= 0) cut = maxChars;
      out.push(remaining.slice(0, cut).trimEnd());
      remaining = remaining.slice(cut).trimStart();
    }
    if (remaining) out.push(remaining);
  }
  return out.length ? out : [''];
}

// ─── SVG helpers ──────────────────────────────────────────────────────────────

function escText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escAttr(s: string): string {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function sanitizeId(id: string): string {
  return (id || 'x').replace(/[^a-zA-Z0-9_-]/g, '_');
}

// ─── SVG builder (direct port of frontend buildCardSvg) ───────────────────────

function buildCardSvg(
  tpl: any,
  user: CardUser,
  userImgDataUrl: string | null,
  bgDataUrl: string | null,
  ovDataUrl: string | null,
  qrDataUrls: Record<string, string>,
  ctx: CardGenCtx,
  scale: number,
): string {
  const W = tpl.cardWidth * scale;
  const H = tpl.cardHeight * scale;
  const radius = (tpl.cardBorderRadius ?? 0) * scale;

  const defs: string[] = [];
  const body: string[] = [];

  if (radius > 0) {
    defs.push(`<clipPath id="card-clip"><rect width="${W}" height="${H}" rx="${radius}" ry="${radius}"/></clipPath>`);
  }
  const clipAttr = radius > 0 ? ' clip-path="url(#card-clip)"' : '';

  if (!tpl.isBackgroundTransparent) {
    if (bgDataUrl) {
      body.push(`<image href="${bgDataUrl}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice"${clipAttr}/>`);
    } else {
      body.push(`<rect width="${W}" height="${H}" fill="${escAttr(tpl.backgroundColor || '#1a237e')}"${clipAttr}/>`);
    }
  }

  for (const el of (tpl.elements || [])) {
    const rot = el.rotation ?? 0;
    const x = (el.x / 100) * W;
    const y = (el.y / 100) * H;

    if (el.type === 'image') {
      const elW = (el.width / 100) * W;
      const elH = (el.height / 100) * W;
      const bw = (el.borderWidth ?? 0) * scale;
      const isCircle = el.shape === 'circle';
      const innerW = Math.max(0, elW - bw * 2);
      const innerH = Math.max(0, elH - bw * 2);
      const clipId = `imgclip-${sanitizeId(el.id)}`;
      const ecx = x + elW / 2, ecy = y + elH / 2;
      const transform = rot ? ` transform="rotate(${rot} ${ecx} ${ecy})"` : '';

      if (isCircle) {
        defs.push(`<clipPath id="${clipId}"><ellipse cx="${x + bw + innerW / 2}" cy="${y + bw + innerH / 2}" rx="${innerW / 2}" ry="${innerH / 2}"/></clipPath>`);
      } else {
        const br = (el.borderRadius ?? 6) * scale;
        defs.push(`<clipPath id="${clipId}"><rect x="${x + bw}" y="${y + bw}" width="${innerW}" height="${innerH}" rx="${br}" ry="${br}"/></clipPath>`);
      }

      if (bw > 0) {
        if (isCircle) {
          body.push(`<ellipse cx="${ecx}" cy="${ecy}" rx="${elW / 2}" ry="${elH / 2}" fill="${escAttr(el.borderColor || '#ffffff')}"${transform}/>`);
        } else {
          const obr = ((el.borderRadius ?? 6) * scale) + bw;
          body.push(`<rect x="${x}" y="${y}" width="${elW}" height="${elH}" rx="${obr}" ry="${obr}" fill="${escAttr(el.borderColor || '#ffffff')}"${transform}/>`);
        }
      }

      if (userImgDataUrl) {
        body.push(`<image href="${userImgDataUrl}" x="${x + bw}" y="${y + bw}" width="${innerW}" height="${innerH}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${clipId})"${transform}/>`);
      } else {
        if (isCircle) {
          body.push(`<ellipse cx="${x + bw + innerW / 2}" cy="${y + bw + innerH / 2}" rx="${innerW / 2}" ry="${innerH / 2}" fill="#cccccc"${transform}/>`);
        } else {
          const br = (el.borderRadius ?? 6) * scale;
          body.push(`<rect x="${x + bw}" y="${y + bw}" width="${innerW}" height="${innerH}" rx="${br}" ry="${br}" fill="#cccccc"${transform}/>`);
        }
      }

    } else if (el.type === 'qr') {
      const elS = (el.size / 100) * W;
      const qrData = qrDataUrls[el.id];
      const ecx = x + elS / 2, ecy = y + elS / 2;
      const transform = rot ? ` transform="rotate(${rot} ${ecx} ${ecy})"` : '';
      if (qrData) {
        body.push(`<image href="${qrData}" x="${x}" y="${y}" width="${elS}" height="${elS}" preserveAspectRatio="xMidYMid meet"${transform}/>`);
      }

    } else {
      const resolved = resolveTokens(el.content, user, ctx);
      const fontPx = autoFitFontSize(el.fontSize, resolved.length, el.maxLength) * scale;
      const boxW = (el.width / 100) * W;
      const lineH = fontPx * 1.3;
      const lines = wrapText(resolved, fontPx, boxW);

      let textAnchor = 'start';
      let anchorX = x;
      if (el.align === 'center') { textAnchor = 'middle'; anchorX = x + boxW / 2; }
      else if (el.align === 'right') { textAnchor = 'end'; anchorX = x + boxW; }

      const fw = el.bold ? '700' : '400';
      const fs = el.italic ? 'italic' : 'normal';
      const totalH = lines.length * lineH;
      const ecx = x + boxW / 2, ecy = y + totalH / 2;
      const transform = rot ? ` transform="rotate(${rot} ${ecx} ${ecy})"` : '';
      const openG = transform ? `<g${transform}>` : '';
      const closeG = transform ? `</g>` : '';
      const fontFamilyAttr = `${escAttr(el.fontFamily || 'Roboto')}, sans-serif`;

      const parts: string[] = [];
      for (let i = 0; i < lines.length; i++) {
        const baseline = y + i * lineH + (lineH + fontPx * 0.72) / 2;
        parts.push(
          `<text x="${anchorX}" y="${baseline}" font-family="${fontFamilyAttr}" font-size="${fontPx}" ` +
          `fill="${escAttr(el.color)}" font-weight="${fw}" font-style="${fs}" ` +
          `text-anchor="${textAnchor}">${escText(lines[i])}</text>`,
        );
      }
      body.push(openG + parts.join('') + closeG);
    }
  }

  if (ovDataUrl) {
    body.push(`<image href="${ovDataUrl}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice"${clipAttr}/>`);
  }

  const defsBlock = defs.length ? `<defs>${defs.join('')}</defs>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${defsBlock}${body.join('')}</svg>`;
}

// ─── Main render ──────────────────────────────────────────────────────────────

@Injectable()
export class CardRendererService {
  private readonly logger = new Logger(CardRendererService.name);

  async renderCardToPng(
    tpl: any,
    user: CardUser,
    userImgUrl: string | null,
    bgUrl: string | null,
    ovUrl: string | null,
    ctx: CardGenCtx = {},
    dpi = 300,
  ): Promise<RenderCardResult> {
    const scale = dpi / 96;

    const [userImgDataUrl, bgDataUrl, ovDataUrl, fontBuffers] = await Promise.all([
      userImgUrl ? urlToDataUrl(userImgUrl) : Promise.resolve(null as string | null),
      bgUrl      ? urlToDataUrl(bgUrl)      : Promise.resolve(null as string | null),
      ovUrl      ? urlToDataUrl(ovUrl)      : Promise.resolve(null as string | null),
      collectFontBuffers(tpl),
    ]);

    // Generate QR data URLs
    const QR = require('qrcode');
    const qrDataUrls: Record<string, string> = {};
    const qrValues: Record<string, string> = {};
    let firstQrUuid: string | undefined;

    for (const el of (tpl.elements || []) as any[]) {
      if (el.type === 'qr') {
        const { value, uuid } = resolveQrValue(el, user, ctx);
        if (uuid) { qrValues[el.id] = uuid; if (!firstQrUuid) firstQrUuid = uuid; }
        try {
          qrDataUrls[el.id] = await QR.toDataURL(value || ' ', {
            margin: el.margin ?? 1,
            color: { dark: el.fgColor || '#000000', light: el.bgColor || '#ffffff' },
            width: Math.min(2000, Math.round(((el.size / 100) * tpl.cardWidth) * scale * 1.2)) || 600,
            errorCorrectionLevel: 'M',
          });
        } catch { qrDataUrls[el.id] = ''; }
      }
    }

    const resolvedCtx: CardGenCtx = { ...ctx, qrUuid: ctx.qrUuid ?? firstQrUuid };
    const svg = buildCardSvg(tpl, user, userImgDataUrl, bgDataUrl, ovDataUrl, qrDataUrls, resolvedCtx, scale);

    const { Resvg } = require('@resvg/resvg-js');
    const resvg = new Resvg(svg, {
      fitTo: { mode: 'original' },
      font: {
        loadSystemFonts: false,
        fontBuffers: fontBuffers.map(b => new Uint8Array(b)),
        defaultFontFamily: 'Roboto',
      },
      shapeRendering: 2,
      textRendering: 2,
      imageRendering: 0,
    });
    const rendered = resvg.render();
    const png = Buffer.from(rendered.asPng());
    rendered.free();
    resvg.free();

    return { png, qrValues, qrUuid: firstQrUuid };
  }
}
