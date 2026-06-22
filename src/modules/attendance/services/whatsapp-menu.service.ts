import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Language } from '../../user/enums/language.enum';
import {
  WhatsAppMenuMessageBuilder,
  MenuRow,
  AttendanceLine,
} from '../factories/whatsapp-menu.factory';

/**
 * Conversational WhatsApp menu for inbound replies.
 *
 * Flow:
 *   • User texts "hi" (any free text that is NOT a known action) → send the
 *     interactive list menu tailored to who they are:
 *       - student          → "My Attendance" row
 *       - parent/guardian   → one row per child
 *       - both              → self row + child rows
 *       - matched but neither student nor parent → just the user-id footer note
 *       - phone not matched to any user → "not registered" note
 *   • User taps a list row → we get a row id ("att_self" | "att_child:<userId>")
 *     → reply with that person's last 10 attendance records + their LMS user id.
 *
 * Every attendance reply ends with "Your Suraksha LMS user ID is <id>", so a
 * separate "My user ID" menu row is unnecessary.
 *
 * Single outbound concern lives here; the session tracker stays write-only.
 */
@Injectable()
export class WhatsAppMenuService {
  private readonly logger = new Logger(WhatsAppMenuService.name);

  private static readonly ROW_SELF = 'att_self';
  private static readonly ROW_CHILD_PREFIX = 'att_child:';
  private static readonly HISTORY_LIMIT = 10;

  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  /** True when a list-row id is one of OUR action ids (vs. a free-text "hi"). */
  static isMenuAction(id?: string | null): boolean {
    if (!id) return false;
    return (
      id === WhatsAppMenuService.ROW_SELF ||
      id.startsWith(WhatsAppMenuService.ROW_CHILD_PREFIX)
    );
  }

  /**
   * Handle any inbound message that is NOT the "Thanks" tap.
   *
   * @param rawPhone        sender phone (raw digits from Meta)
   * @param interactiveId   list-row id if the user tapped a menu row, else null
   */
  async handleConversation(rawPhone: string, interactiveId?: string | null): Promise<void> {
    const phone = (rawPhone ?? '').replace(/\D/g, '');
    if (!phone) return;

    // Resolve the contact once.
    const contact = await this.resolveContact(phone);
    if (!contact) {
      // Unknown number — short note in default language (Sinhala).
      await this.sendText(phone, WhatsAppMenuMessageBuilder.notRegisteredReply(Language.SINHALA));
      return;
    }

    const lang = WhatsAppMenuMessageBuilder.resolveLanguage(contact.language);

    // A tapped menu row → answer with attendance. Anything else → show the menu.
    if (WhatsAppMenuService.isMenuAction(interactiveId)) {
      await this.replyWithAttendance(phone, contact, interactiveId!, lang);
      return;
    }

    await this.sendMenu(phone, contact, lang);
  }

  // ─── Menu ──────────────────────────────────────────────────────────────────

  private async sendMenu(phone: string, contact: Contact, lang: Language): Promise<void> {
    const rows: MenuRow[] = [];

    if (contact.isStudent) {
      rows.push({ id: WhatsAppMenuService.ROW_SELF, title: WhatsAppMenuMessageBuilder.selfRowTitle(lang) });
    }

    for (const child of contact.children) {
      rows.push({
        id: `${WhatsAppMenuService.ROW_CHILD_PREFIX}${child.userId}`,
        title: WhatsAppMenuMessageBuilder.childRowTitle(child.name, lang),
      });
    }

    // Matched user but no student role and no children → nothing actionable.
    // Send their user-id line so the contact still gets something useful.
    if (rows.length === 0) {
      await this.sendText(phone, WhatsAppMenuMessageBuilder.userIdLine(contact.userId, lang));
      return;
    }

    const interactive = WhatsAppMenuMessageBuilder.buildListInteractive(rows, lang);
    await this.sendInteractive(phone, interactive);
  }

  // ─── Attendance reply ────────────────────────────────────────────────────────

  private async replyWithAttendance(
    phone: string,
    contact: Contact,
    actionId: string,
    lang: Language,
  ): Promise<void> {
    // Determine whose attendance, and authorize: self, or a child that actually
    // belongs to this contact (never trust the row id blindly).
    let targetUserId: string;
    let who: string;

    if (actionId === WhatsAppMenuService.ROW_SELF) {
      if (!contact.isStudent) {
        // Self row sent to a non-student — fall back to the menu.
        await this.sendMenu(phone, contact, lang);
        return;
      }
      targetUserId = contact.userId;
      who = contact.name;
    } else {
      const childId = actionId.slice(WhatsAppMenuService.ROW_CHILD_PREFIX.length);
      const child = contact.children.find((c) => c.userId === childId);
      if (!child) {
        // Not this contact's child — ignore the spoofed id, re-show the menu.
        await this.sendMenu(phone, contact, lang);
        return;
      }
      targetUserId = child.userId;
      who = child.name;
    }

    const lines = await this.fetchAttendance(targetUserId);
    const text = WhatsAppMenuMessageBuilder.buildAttendanceReply(who, lines, lang, contact.userId);
    await this.sendText(phone, text);
  }

  // ─── Data access ─────────────────────────────────────────────────────────────

  /** Resolve the contact (user + role + children) from a phone number. */
  private async resolveContact(phone: string): Promise<Contact | null> {
    const userRows: any[] = await this.ds.query(
      `SELECT u.id            AS userId,
              u.first_name     AS firstName,
              u.last_name      AS lastName,
              u.name_with_initials AS nameWithInitials,
              u.language       AS language,
              (s.user_id IS NOT NULL) AS isStudent
       FROM users u
       LEFT JOIN students s ON s.user_id = u.id AND s.is_active = 1
       WHERE u.phone_number = ?
       LIMIT 1`,
      [phone],
    );
    const u = userRows[0];
    if (!u) return null;

    // Children: students whose father/mother/guardian is THIS user (parents.user_id).
    //
    // A single `OR` across father_id/mother_id/guardian_id can't reliably use
    // the three separate (col, is_active) indexes — the optimizer may fall back
    // to a scan. A UNION of three lookups lets each branch hit its own index
    // (idx_students_father_active / _mother_active / _guardian_active), then we
    // de-dup user ids (a parent who is both father and guardian) and sort/limit
    // in the outer query.
    const childRows: any[] = await this.ds.query(
      `SELECT cu.id AS userId,
              cu.first_name AS firstName,
              cu.last_name  AS lastName,
              cu.name_with_initials AS nameWithInitials
       FROM (
         SELECT user_id FROM students WHERE is_active = 1 AND father_id   = ?
         UNION
         SELECT user_id FROM students WHERE is_active = 1 AND mother_id   = ?
         UNION
         SELECT user_id FROM students WHERE is_active = 1 AND guardian_id = ?
       ) kids
       JOIN users cu ON cu.id = kids.user_id
       ORDER BY cu.first_name
       LIMIT 10`,
      [u.userId, u.userId, u.userId],
    );

    return {
      userId: String(u.userId),
      name: this.displayName(u),
      language: u.language ?? null,
      isStudent: Number(u.isStudent) === 1,
      children: childRows.map((c) => ({ userId: String(c.userId), name: this.displayName(c) })),
    };
  }

  /** Last 10 attendance records for a student (by their user id), newest first. */
  private async fetchAttendance(studentUserId: string): Promise<AttendanceLine[]> {
    const rows: any[] = await this.ds.query(
      // Format the DATE in SQL so the result is a plain 'YYYY-MM-DD' string
      // regardless of the mysql2 driver's dateStrings/timezone settings.
      // (With dateStrings:false + timezone:'+05:30', a raw Date + toISOString()
      //  would shift the day backward by the offset — so we never build a Date.)
      `SELECT ar.status                          AS status,
              DATE_FORMAT(ar.date, '%Y-%m-%d')   AS date,
              i.name                             AS instituteName,
              c.name                             AS className,
              sub.name                           AS subjectName
       FROM attendance_records ar
       LEFT JOIN institutes        i   ON i.id   = ar.institute_id
       LEFT JOIN institute_classes c   ON c.id   = ar.class_id
       LEFT JOIN subjects          sub ON sub.id = ar.subject_id
       WHERE ar.student_id = ?
       ORDER BY ar.date DESC, ar.timestamp DESC
       LIMIT ?`,
      [studentUserId, WhatsAppMenuService.HISTORY_LIMIT],
    );
    return rows.map((r) => ({
      status: Number(r.status),
      date: String(r.date),
      instituteName: r.instituteName,
      className: r.className,
      subjectName: r.subjectName,
    }));
  }

  private displayName(u: any): string {
    return (
      (u.nameWithInitials && String(u.nameWithInitials).trim()) ||
      `${u.firstName || ''} ${u.lastName || ''}`.trim() ||
      'User'
    );
  }

  // ─── Outbound (Meta Cloud API) ───────────────────────────────────────────────

  private async sendText(phone: string, body: string): Promise<void> {
    await this.send(phone, { type: 'text', text: { body } });
  }

  private async sendInteractive(phone: string, interactive: Record<string, any>): Promise<void> {
    await this.send(phone, { type: 'interactive', interactive });
  }

  private async send(phone: string, payload: Record<string, any>): Promise<void> {
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    if (!phoneNumberId || !accessToken) {
      this.logger.warn('[WA Menu] WhatsApp credentials not configured — skipping reply');
      return;
    }

    try {
      const res = await fetch(
        `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ messaging_product: 'whatsapp', to: phone, ...payload }),
        },
      );
      if (!res.ok) {
        const errBody = await res.text();
        this.logger.warn(`[WA Menu] Send failed (${res.status}): ${errBody}`);
      }
    } catch (err: any) {
      this.logger.error(`[WA Menu] Send error: ${err.message}`);
    }
  }
}

// ─── Internal types ────────────────────────────────────────────────────────

interface Contact {
  userId: string;
  name: string;
  language: string | null;
  isStudent: boolean;
  children: Array<{ userId: string; name: string }>;
}
