/**
 * WhatsApp Attendance Message Builder
 *
 * Pattern: Static Factory Method + Data-driven i18n table
 *
 * Why this pattern:
 *  - All message logic is stateless (no side effects, no DB, no HTTP)
 *    → no need for DI-injected service or instantiated strategy objects
 *  - The only variation between languages is string literals (not behaviour)
 *    → a Strategy class per language would be over-engineering with identical logic
 *  - A static class with a STRINGS lookup table gives:
 *    • Single place to add a new language (add one row to STRINGS, done)
 *    • Zero duplication — every send path calls build() once
 *    • Pure functions — trivially testable with no mocks
 *    • No import cycles, no circular DI
 *
 * Rules:
 *  - Student name, institute name, class, subject, vehicle → English always (stored as-is, untranslatable)
 *  - Structural phrases (verbs, prepositions, warning) → translated per Language enum
 *  - Ad title/content → shown exactly as admin entered (admin's own language)
 *  - Default language → Sinhala
 */

import { Language } from '../../user/enums/language.enum';

// ─── Input / Output types ────────────────────────────────────────────────────

export interface AttendanceMessageInput {
  studentName: string;
  attendanceStatus: 'PRESENT' | 'ABSENT' | 'LATE' | 'LEFT' | 'LEFT_EARLY' | 'LEFT_LATELY';
  attendanceType: 'INSTITUTE' | 'CLASS' | 'SUBJECT' | 'TRANSPORT';
  date: string;
  time: string;
  instituteName?: string;
  className?: string;
  subjectName?: string;
  vehicleNumber?: string;
  bookhireName?: string;
}

export interface AdInput {
  title?: string;
  content?: string;
  sendingUrl?: string;
}

export interface WhatsAppMessagePayload {
  /** Attendance sentence only */
  attendanceBody: string;
  /** "━━━\n<ad text>" — empty string when no ad */
  adSection: string;
  /** Warning with leading \n\n */
  warningText: string;
  /** attendanceBody + adSection + warningText — ready to use as WhatsApp body */
  fullBody: string;
}

// ─── i18n string table ────────────────────────────────────────────────────────
// Add a new language: add one entry here. Everything else auto-picks it up.

interface LangStrings {
  yourChild:   (name: string) => string;
  arrived:     string;
  absentFrom:  string;
  boarded:     (transport: string, vehicle: string) => string;
  didNotBoard: (transport: string, vehicle: string) => string;
  atTime:      string;   // "at" before time
  onDate:      string;   // "on" before date
  warning:     string;
  /** Word order: true = SOV (Sinhala/Tamil), false = SVO (English) */
  sov:         boolean;
}

const STRINGS: Record<Language, LangStrings> = {
  [Language.SINHALA]: {
    yourChild:   (n) => `ඔබගේ දරුවා *${n}*`,
    arrived:     'පැමිණියා',
    absentFrom:  'නොපැමිණියා',
    boarded:     (t, v) => `${t}${v} රථයට නැඟ ගත්තා`,
    didNotBoard: (t, v) => `${t}${v} රථයට නොනැඟුණා`,
    atTime:      'ට',
    onDate:      'දින',
    warning:
      '⚠️ _ඔබ Thanks මත ටච් කිරීමෙන් නොමිලේ මෙවැනි ඉදිරි දැනුම් දීම් ලබා ගත හැක. ' +
      'එසේ නොකිරීමෙන් මෙවැනි පණිවිඩ ඔබ අංකයට දැනුම් දීම් ස්වංක්‍රීයව අත්හිටවෙනු ඇත._',
    sov: true,
  },
  [Language.ENGLISH]: {
    yourChild:   (n) => `Your child *${n}*`,
    arrived:     'arrived at',
    absentFrom:  'was absent from',
    boarded:     (t, v) => `boarded ${t}${v}`,
    didNotBoard: (t, v) => `did not board ${t}${v}`,
    atTime:      'at',
    onDate:      'on',
    warning:     '⚠️ _Tap Thanks to keep receiving free attendance updates._',
    sov: false,
  },
  [Language.TAMIL]: {
    yourChild:   (n) => `உங்கள் குழந்தை *${n}*`,
    arrived:     'வந்தார்',
    absentFrom:  'வரவில்லை',
    boarded:     (t, v) => `${t}${v} வாகனத்தில் ஏறினார்`,
    didNotBoard: (t, v) => `${t}${v} வாகனத்தில் ஏறவில்லை`,
    atTime:      'மணிக்கு',
    onDate:      'அன்று',
    warning:     '⚠️ _Thanks பொத்தானை தொட்டு இலவச வருகை அறிவிப்புகளை தொடர்ந்து பெறுங்கள்._',
    sov: true,
  },
};

// ─── Builder ─────────────────────────────────────────────────────────────────

export class WhatsAppAttendanceMessageBuilder {

  /** Build a full message payload for the given language. */
  static build(
    input: AttendanceMessageInput,
    lang: Language = Language.SINHALA,
    ad?: AdInput,
  ): WhatsAppMessagePayload {
    const s = STRINGS[lang] ?? STRINGS[Language.SINHALA];
    const attendanceBody = this.attendance(input, s);
    const adSection      = this.adSection(ad);
    const warningText    = `\n\n${s.warning}`;
    return {
      attendanceBody,
      adSection,
      warningText,
      fullBody: attendanceBody + adSection + warningText,
    };
  }

  /**
   * Build ad caption text only (language-independent — admin's own language).
   * Used for video/PDF bubble captions.
   */
  static adCaption(ad?: AdInput): string {
    if (!ad) return '';
    const parts: string[] = [];
    if (ad.title?.trim())      parts.push(`*${ad.title.trim()}*`);
    if (ad.content?.trim())    parts.push(ad.content.trim());
    if (ad.sendingUrl?.trim()) parts.push(`🔗 ${ad.sendingUrl.trim()}`);
    return parts.join('\n');
  }

  /**
   * Resolve Language enum from a raw string (DB value, env value, etc.).
   * Default: Sinhala.
   */
  static resolveLanguage(raw?: string | null): Language {
    if (!raw) return Language.SINHALA;
    const v = raw.trim().toUpperCase();
    if (v === 'E' || v === 'EN' || v === 'ENGLISH') return Language.ENGLISH;
    if (v === 'T' || v === 'TA' || v === 'TAMIL')   return Language.TAMIL;
    return Language.SINHALA;
  }

  // ─── Private ───────────────────────────────────────────────────────────────

  private static attendance(input: AttendanceMessageInput, s: LangStrings): string {
    const date    = this.fmtDate(input.date);
    const time    = this.fmtTime(input.time);
    const vehicle = input.vehicleNumber ? ` (${input.vehicleNumber})` : '';

    if (input.attendanceType === 'TRANSPORT') {
      const t    = input.bookhireName ?? '';
      const verb = input.attendanceStatus === 'PRESENT'
        ? s.boarded(t, vehicle)
        : s.didNotBoard(t, vehicle);

      return s.sov
        // SOV: "ඔබගේ දරුවා Kaveesha 2026 ජූනි 22 දින 8:05 ට [transport] රථයට..."
        ? `${s.yourChild(input.studentName)} ${date} ${s.onDate} ${time} ${s.atTime} ${verb}.`
        // SVO: "Your child Kaveesha boarded Sunrise at 8:05 on June 22, 2026."
        : `${s.yourChild(input.studentName)} ${verb} ${s.atTime} ${time} ${s.onDate} ${date}.`;
    }

    const ctx  = this.context(input);
    const verb = input.attendanceStatus === 'PRESENT' ? s.arrived : s.absentFrom;

    return s.sov
      ? `${s.yourChild(input.studentName)} ${date} ${s.onDate} ${time} ${s.atTime}${ctx ? ' ' + ctx : ''} ${verb}.`
      : `${s.yourChild(input.studentName)} ${verb}${ctx ? ' ' + ctx : ''} ${s.atTime} ${time} ${s.onDate} ${date}.`;
  }

  /** Build context phrase — names always in English as stored. */
  private static context(input: AttendanceMessageInput): string {
    const { subjectName: sub, className: cls, instituteName: inst } = input;
    if (sub && cls && inst) return `*${sub}* (${cls}) at ${inst}`;
    if (sub && cls)         return `*${sub}* (${cls})`;
    if (cls && inst)        return `*${cls}* at ${inst}`;
    if (cls)                return `*${cls}*`;
    if (inst)               return inst;
    return '';
  }

  private static adSection(ad?: AdInput): string {
    const cap = this.adCaption(ad);
    return cap ? `\n\n━━━━━━━━━━━━━━━━━━━━\n${cap}` : '';
  }

  private static fmtDate(d: string): string {
    try {
      const dt = new Date(d);
      if (isNaN(dt.getTime())) return d;
      return dt.toLocaleDateString('en-US', { timeZone: 'UTC', year: 'numeric', month: 'long', day: 'numeric' });
    } catch { return d; }
  }

  private static fmtTime(t: string): string {
    try {
      const dt = new Date(t);
      if (!isNaN(dt.getTime())) {
        return dt.toLocaleTimeString('en-US', { timeZone: 'UTC', hour: 'numeric', minute: '2-digit', hour12: true });
      }
      return t;
    } catch { return t; }
  }
}
