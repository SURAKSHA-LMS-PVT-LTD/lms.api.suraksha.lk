/**
 * WhatsApp Menu Message Builder
 *
 * Pattern: Static Factory Method + data-driven i18n table — same approach as
 * WhatsAppAttendanceMessageBuilder. All pure functions, no DB/HTTP/state.
 *
 * Responsibilities:
 *  - Greeting menu copy (header / body / button / section title / row labels)
 *  - Attendance history reply (last N records, per language)
 *  - The trailing "Your Suraksha LMS user ID is …" line appended to every reply
 *  - Status code → localized word
 *  - "Not registered" / "no attendance" fallbacks
 *
 * Names (student/institute/class/subject) stay in English as stored — only
 * structural phrasing is translated. Default language: Sinhala.
 */

import { Language } from '../../user/enums/language.enum';

// ─── Domain types ──────────────────────────────────────────────────────────

export interface MenuRow {
  /** Encoded action id, e.g. "att_self" or "att_child:<userId>" */
  id: string;
  /** Row title shown in the WhatsApp list (English name as stored) */
  title: string;
  /** Optional secondary line */
  description?: string;
}

export interface AttendanceLine {
  /** tinyint status: 0=Absent,1=Present,2=Late,3=Left,4=LeftEarly,5=LeftLately */
  status: number;
  date: string;            // YYYY-MM-DD
  instituteName?: string | null;
  className?: string | null;
  subjectName?: string | null;
}

// ─── i18n table ───────────────────────────────────────────────────────────

interface MenuStrings {
  menuHeader: string;
  menuBody: string;
  menuButton: string;                       // list "open" button label
  sectionTitle: string;
  rowSelfTitle: string;                     // "My Attendance"
  rowChildTitle: (name: string) => string;  // "<name>'s Attendance"
  historyHeader: (who: string) => string;   // title above the list of records
  noRecords: string;
  statusName: Record<number, string>;
  userIdLine: (id: string) => string;       // trailing footer on every reply
  notRegistered: string;
  whoSelf: string;                          // "your" / "ඔබගේ" used in historyHeader
}

const STATUS_FALLBACK = '—';

const STRINGS: Record<Language, MenuStrings> = {
  [Language.SINHALA]: {
    menuHeader: 'සුරක්ෂා LMS',
    menuBody: 'ආයුබෝවන්! 🙏\nඔබට අවශ්‍ය තොරතුරු පහතින් තෝරන්න.',
    menuButton: 'තෝරන්න',
    sectionTitle: 'පැමිණීම් තොරතුරු',
    rowSelfTitle: 'මගේ පැමිණීම',
    rowChildTitle: (n) => `${n} ගේ පැමිණීම`,
    historyHeader: (who) => `📋 ${who} පැමිණීම් (අවසන් වාර්තා):`,
    noRecords: 'මෙතෙක් පැමිණීම් වාර්තා නොමැත.',
    statusName: {
      0: 'නොපැමිණි',
      1: 'පැමිණි',
      2: 'ප්‍රමාද',
      3: 'පිටව ගිය',
      4: 'කලින් පිටව ගිය',
      5: 'ප්‍රමාදව පිටව ගිය',
    },
    userIdLine: (id) => `🆔 ඔබගේ සුරක්ෂා LMS පරිශීලක අංකය: *${id}*`,
    notRegistered:
      'සමාවන්න — මෙම දුරකථන අංකය සුරක්ෂා LMS පරිශීලකයෙකු සමඟ සම්බන්ධ වී නැත.',
    whoSelf: 'ඔබගේ',
  },
  [Language.ENGLISH]: {
    menuHeader: 'Suraksha LMS',
    menuBody: 'Hello! 🙏\nChoose what you would like to see below.',
    menuButton: 'Select',
    sectionTitle: 'Attendance',
    rowSelfTitle: 'My Attendance',
    rowChildTitle: (n) => `${n}'s Attendance`,
    historyHeader: (who) => `📋 ${who} attendance (latest records):`,
    noRecords: 'No attendance records yet.',
    statusName: {
      0: 'Absent',
      1: 'Present',
      2: 'Late',
      3: 'Left',
      4: 'Left early',
      5: 'Left late',
    },
    userIdLine: (id) => `🆔 Your Suraksha LMS user ID is *${id}*`,
    notRegistered:
      'Sorry — this phone number is not linked to a Suraksha LMS user.',
    whoSelf: 'Your',
  },
  [Language.TAMIL]: {
    menuHeader: 'சுரக்ஷா LMS',
    menuBody: 'வணக்கம்! 🙏\nகீழே தேவையானதைத் தேர்ந்தெடுக்கவும்.',
    menuButton: 'தேர்வு',
    sectionTitle: 'வருகை',
    rowSelfTitle: 'எனது வருகை',
    rowChildTitle: (n) => `${n} இன் வருகை`,
    historyHeader: (who) => `📋 ${who} வருகை (சமீபத்திய பதிவுகள்):`,
    noRecords: 'இதுவரை வருகைப் பதிவுகள் இல்லை.',
    statusName: {
      0: 'வரவில்லை',
      1: 'வந்தார்',
      2: 'தாமதம்',
      3: 'வெளியேறினார்',
      4: 'முன்னதாக வெளியேறினார்',
      5: 'தாமதமாக வெளியேறினார்',
    },
    userIdLine: (id) => `🆔 உங்கள் சுரக்ஷா LMS பயனர் ஐடி: *${id}*`,
    notRegistered:
      'மன்னிக்கவும் — இந்த தொலைபேசி எண் சுரக்ஷா LMS பயனருடன் இணைக்கப்படவில்லை.',
    whoSelf: 'உங்கள்',
  },
};

// ─── Builder ─────────────────────────────────────────────────────────────────

export class WhatsAppMenuMessageBuilder {
  /** WhatsApp interactive list "list" message payload (the action.sections etc.). */
  static buildListInteractive(rows: MenuRow[], lang: Language) {
    const s = STRINGS[lang] ?? STRINGS[Language.SINHALA];
    return {
      type: 'list',
      header: { type: 'text', text: this.truncate(s.menuHeader, 60) },
      body: { text: this.truncate(s.menuBody, 1024) },
      action: {
        button: this.truncate(s.menuButton, 20),
        sections: [
          {
            title: this.truncate(s.sectionTitle, 24),
            // WhatsApp caps each row title at 24 chars and 10 rows per section.
            rows: rows.slice(0, 10).map((r) => ({
              id: r.id,
              title: this.truncate(r.title, 24),
              ...(r.description ? { description: this.truncate(r.description, 72) } : {}),
            })),
          },
        ],
      },
    };
  }

  /** Localized row label for "My Attendance". */
  static selfRowTitle(lang: Language): string {
    return (STRINGS[lang] ?? STRINGS[Language.SINHALA]).rowSelfTitle;
  }

  /** Localized row label for a child's attendance. */
  static childRowTitle(name: string, lang: Language): string {
    return (STRINGS[lang] ?? STRINGS[Language.SINHALA]).rowChildTitle(name);
  }

  /**
   * Full attendance-history reply text for one subject (self or a child),
   * always ending with the trailing user-ID line.
   *
   * @param who         display name of the person whose attendance this is
   * @param lines       up to 10 records, newest first
   * @param recipientId Suraksha LMS user id of the WhatsApp contact (footer)
   */
  static buildAttendanceReply(
    who: string,
    lines: AttendanceLine[],
    lang: Language,
    recipientId: string,
  ): string {
    const s = STRINGS[lang] ?? STRINGS[Language.SINHALA];
    const header = s.historyHeader(`*${who}*`);

    const body = lines.length
      ? lines.map((l) => this.formatLine(l, s)).join('\n')
      : s.noRecords;

    return `${header}\n${body}\n\n${s.userIdLine(recipientId)}`;
  }

  /** "Not registered" reply (still ends without a user-id line — there is none). */
  static notRegisteredReply(lang: Language): string {
    return (STRINGS[lang] ?? STRINGS[Language.SINHALA]).notRegistered;
  }

  /** Just the trailing user-ID line — used when the only thing to send is the ID. */
  static userIdLine(recipientId: string, lang: Language): string {
    return (STRINGS[lang] ?? STRINGS[Language.SINHALA]).userIdLine(recipientId);
  }

  static resolveLanguage(raw?: string | null): Language {
    if (!raw) return Language.SINHALA;
    const v = raw.trim().toUpperCase();
    if (v === 'E' || v === 'EN' || v === 'ENGLISH') return Language.ENGLISH;
    if (v === 'T' || v === 'TA' || v === 'TAMIL') return Language.TAMIL;
    return Language.SINHALA;
  }

  // ─── Private ───────────────────────────────────────────────────────────────

  private static formatLine(l: AttendanceLine, s: MenuStrings): string {
    const status = s.statusName[l.status] ?? STATUS_FALLBACK;
    const date = this.fmtDate(l.date);
    // Context: subject (class) at institute — names kept in English as stored.
    const ctx = this.context(l);
    const emoji = l.status === 1 ? '✅' : l.status === 0 ? '❌' : '⏱️';
    return ctx
      ? `${emoji} ${date} — ${status} · ${ctx}`
      : `${emoji} ${date} — ${status}`;
  }

  private static context(l: AttendanceLine): string {
    const sub = l.subjectName?.trim();
    const cls = l.className?.trim();
    const inst = l.instituteName?.trim();
    if (sub && cls) return `${sub} (${cls})`;
    if (cls) return inst ? `${cls} @ ${inst}` : cls;
    if (inst) return inst;
    return '';
  }

  private static fmtDate(d: string): string {
    try {
      const dt = new Date(d);
      if (isNaN(dt.getTime())) return d;
      return dt.toLocaleDateString('en-US', {
        timeZone: 'UTC',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return d;
    }
  }

  private static truncate(text: string, max: number): string {
    if (text.length <= max) return text;
    // Slice by grapheme (Array.from splits on code points, not UTF-16 units) so
    // we never cut a Sinhala/Tamil combining sequence or an emoji surrogate pair
    // mid-character before appending the ellipsis.
    const chars = Array.from(text);
    if (chars.length <= max) return text;
    return `${chars.slice(0, max - 1).join('')}…`;
  }
}
