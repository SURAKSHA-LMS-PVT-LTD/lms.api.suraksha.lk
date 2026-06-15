import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { WhatsAppMessageTemplateEntity } from './entities/whatsapp-message-template.entity';
import { WhatsAppCampaignEntity } from './entities/whatsapp-campaign.entity';

/**
 * Audience filter accepted by the broadcast portal.
 * All fields are optional; they AND together. Arrays mean "IN (...)".
 */
export interface AudienceFilter {
  // ── Institute / class / session ──
  instituteId?: string;
  classId?: string;            // enrolled in this class
  notInClassId?: string;       // NOT enrolled in this class (e.g. "not taking science")
  // ── Roles / status ──
  userTypes?: string[];        // users.user_type: USER, USER_WITHOUT_PARENT, USER_WITHOUT_STUDENT...
  instituteUserTypes?: string[]; // institute_user.institute_user_type: STUDENT, TEACHER, STAFF, ADMIN, PARENT
  instituteUserStatuses?: string[]; // institute_user.status: ACTIVE, PENDING...
  isActive?: boolean;          // users.is_active
  // ── Student-with/without-parent targeting ──
  hasParent?: boolean;         // student has at least one of father/mother/guardian set
  // ── Parent occupation (target students whose father/mother is X) ──
  parentOccupations?: string[]; // any linked parent's occupation IN (...)
  // ── Demographics ──
  bloodGroups?: string[];      // students.blood_group
  genders?: string[];          // users.gender
  districts?: string[];        // users.district
  provinces?: string[];        // users.province
  // ── Package / payment ──
  subscriptionPlans?: string[]; // users.subscription_plan
  packageExpired?: boolean;    // payment_expires_at < NOW()
  freePackage?: boolean;       // subscription_plan = 'FREE'
  // ── Cards ──
  cardStatuses?: string[];     // users.card_status
  rfidCardStatuses?: string[]; // users.rfid_card_status
  // ── Attendance ──
  attendanceStatus?: number;   // 0..5 (Absent/Present/Late/...)
  attendanceFrom?: string;     // YYYY-MM-DD
  attendanceTo?: string;       // YYYY-MM-DD
  attendanceInstituteId?: string; // institute for the attendance lookup (defaults to instituteId)
  // ── Always implicitly required for sending; selectable explicitly ──
  hasPhone?: boolean;          // users.phone_number IS NOT NULL
}

export interface AudienceRow {
  userId: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  instituteUserId: string | null;
  studentId: string | null;
}

// Whitelists — never interpolate caller strings into SQL; only validated enums.
const USER_TYPES = new Set(['SUPER_ADMIN', 'ORGANIZATION_MANAGER', 'USER', 'USER_WITHOUT_PARENT', 'USER_WITHOUT_STUDENT']);
const INSTITUTE_USER_TYPES = new Set(['STUDENT', 'TEACHER', 'STAFF', 'ADMIN', 'PARENT', 'ATTENDANCE_MARKER']);
const INSTITUTE_USER_STATUSES = new Set(['ACTIVE', 'INACTIVE', 'SUSPENDED', 'PENDING', 'FORMER', 'INVITED']);
const GENDERS = new Set(['MALE', 'FEMALE', 'OTHER']);
const CARD_STATUSES = new Set(['ACTIVE', 'INACTIVE', 'DEACTIVATED', 'EXPIRED', 'LOST', 'DAMAGED', 'REPLACED']);

@Injectable()
export class WhatsAppBroadcastService {
  private readonly logger = new Logger(WhatsAppBroadcastService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(WhatsAppMessageTemplateEntity)
    private readonly templateRepo: Repository<WhatsAppMessageTemplateEntity>,
    @InjectRepository(WhatsAppCampaignEntity)
    private readonly campaignRepo: Repository<WhatsAppCampaignEntity>,
  ) {}

  /**
   * Build the parameterized WHERE clause + JOINs for an audience filter.
   * Returns { joins, where, params }. Everything is bound; enum values are
   * validated against whitelists before being placed in IN(...) lists.
   */
  private buildQuery(filter: AudienceFilter): { joins: string; where: string; params: any[] } {
    const joins: string[] = [];
    const where: string[] = ['1=1'];
    const params: any[] = [];

    const inList = (values: string[] | undefined, whitelist: Set<string> | null, column: string) => {
      if (!values || values.length === 0) return;
      const clean = whitelist ? values.filter(v => whitelist.has(v)) : values;
      if (clean.length === 0) return;
      where.push(`${column} IN (${clean.map(() => '?').join(',')})`);
      params.push(...clean);
    };

    // Institute membership
    if (filter.instituteId) {
      joins.push('JOIN institute_user iu ON iu.user_id = u.id AND iu.institute_id = ?');
      params.push(filter.instituteId);
      // NOTE: iu params must precede other joins/where — handled by ordering below.
    }

    // Class enrollment (enrolled)
    if (filter.classId) {
      joins.push(
        'JOIN institute_class_students ics ON ics.student_user_id = u.id AND ics.institute_class_id = ? AND ics.is_active = 1',
      );
      params.push(filter.classId);
    }

    // Student / parent joins when needed
    const needStudent =
      filter.hasParent !== undefined ||
      (filter.bloodGroups && filter.bloodGroups.length > 0) ||
      (filter.parentOccupations && filter.parentOccupations.length > 0);
    if (needStudent) {
      joins.push('LEFT JOIN students s ON s.user_id = u.id');
    }

    // Build WHERE
    inList(filter.userTypes, USER_TYPES, 'u.user_type');
    inList(filter.genders, GENDERS, 'u.gender');
    inList(filter.districts, null, 'u.district');
    inList(filter.provinces, null, 'u.province');
    inList(filter.subscriptionPlans, null, 'u.subscription_plan');
    inList(filter.cardStatuses, CARD_STATUSES, 'u.card_status');
    inList(filter.rfidCardStatuses, CARD_STATUSES, 'u.rfid_card_status');

    if (filter.instituteId) {
      inList(filter.instituteUserTypes, INSTITUTE_USER_TYPES, 'iu.institute_user_type');
      inList(filter.instituteUserStatuses, INSTITUTE_USER_STATUSES, 'iu.status');
    }

    if (filter.isActive !== undefined) {
      where.push('u.is_active = ?');
      params.push(filter.isActive ? 1 : 0);
    }

    if (filter.hasPhone) {
      where.push("u.phone_number IS NOT NULL AND u.phone_number <> ''");
    }

    if (filter.freePackage) {
      where.push("u.subscription_plan = 'FREE'");
    }
    if (filter.packageExpired) {
      where.push('u.payment_expires_at IS NOT NULL AND u.payment_expires_at < NOW()');
    }

    if (needStudent) {
      inList(filter.bloodGroups, null, 's.blood_group');
      if (filter.hasParent === true) {
        where.push('(s.father_id IS NOT NULL OR s.mother_id IS NOT NULL OR s.guardian_id IS NOT NULL)');
      } else if (filter.hasParent === false) {
        where.push('(s.father_id IS NULL AND s.mother_id IS NULL AND s.guardian_id IS NULL)');
      }
      // Parent occupation: student whose linked father/mother/guardian has occupation IN (...)
      if (filter.parentOccupations && filter.parentOccupations.length > 0) {
        const ph = filter.parentOccupations.map(() => '?').join(',');
        where.push(`EXISTS (
          SELECT 1 FROM parents p
          WHERE p.user_id IN (s.father_id, s.mother_id, s.guardian_id)
            AND p.is_active = 1
            AND p.occupation IN (${ph})
        )`);
        params.push(...filter.parentOccupations);
      }
    }

    // NOT enrolled in a class
    if (filter.notInClassId) {
      where.push(`NOT EXISTS (
        SELECT 1 FROM institute_class_students ncs
        WHERE ncs.student_user_id = u.id
          AND ncs.institute_class_id = ?
          AND ncs.is_active = 1
      )`);
      params.push(filter.notInClassId);
    }

    // Attendance-based
    if (filter.attendanceStatus !== undefined || filter.attendanceFrom || filter.attendanceTo) {
      const aInst = filter.attendanceInstituteId || filter.instituteId;
      const cond: string[] = ['ar.student_id = u.id'];
      const aParams: any[] = [];
      if (aInst) { cond.push('ar.institute_id = ?'); aParams.push(aInst); }
      if (filter.attendanceStatus !== undefined) { cond.push('ar.status = ?'); aParams.push(filter.attendanceStatus); }
      if (filter.attendanceFrom) { cond.push('ar.date >= ?'); aParams.push(filter.attendanceFrom); }
      if (filter.attendanceTo) { cond.push('ar.date <= ?'); aParams.push(filter.attendanceTo); }
      where.push(`EXISTS (SELECT 1 FROM attendance_records ar WHERE ${cond.join(' AND ')})`);
      params.push(...aParams);
    }

    return { joins: joins.join('\n'), where: where.join('\n  AND '), params };
  }

  /** Count the audience for a filter (cheap COUNT(DISTINCT u.id)). */
  async countAudience(filter: AudienceFilter): Promise<{ total: number; withPhone: number }> {
    const { joins, where, params } = this.buildQuery(filter);

    const totalRow: any[] = await this.dataSource.query(
      `SELECT COUNT(DISTINCT u.id) AS total FROM users u ${joins} WHERE ${where}`,
      params,
    );
    const phoneRow: any[] = await this.dataSource.query(
      `SELECT COUNT(DISTINCT u.id) AS total FROM users u ${joins}
       WHERE ${where} AND u.phone_number IS NOT NULL AND u.phone_number <> ''`,
      params,
    );

    return {
      total: Number(totalRow[0]?.total || 0),
      withPhone: Number(phoneRow[0]?.total || 0),
    };
  }

  /**
   * Resolve the audience to concrete recipient rows (capped). Only users with
   * a phone are returned — they're the only ones that can be messaged.
   */
  async resolveAudience(filter: AudienceFilter, cap = 5000): Promise<AudienceRow[]> {
    const { joins, where, params } = this.buildQuery(filter);

    const rows: any[] = await this.dataSource.query(
      `SELECT DISTINCT
         u.id            AS userId,
         u.first_name    AS firstName,
         u.last_name     AS lastName,
         u.phone_number  AS phone,
         su.student_id   AS studentId,
         ${filter.instituteId ? 'iu.user_id_institue' : 'NULL'} AS instituteUserId
       FROM users u
       ${joins}
       LEFT JOIN students su ON su.user_id = u.id
       WHERE ${where}
         AND u.phone_number IS NOT NULL AND u.phone_number <> ''
       ORDER BY u.first_name
       LIMIT ?`,
      [...params, cap],
    );

    return rows.map(r => ({
      userId: String(r.userId),
      firstName: r.firstName || '',
      lastName: r.lastName || '',
      phone: r.phone,
      instituteUserId: r.instituteUserId || null,
      studentId: r.studentId || null,
    }));
  }

  /**
   * Substitute {placeholder} tokens in a message body for one recipient.
   * Supported: {firstname} {lastname} {fullname} {studentid} {instituteid} {phone}
   * Unknown tokens are left intact.
   */
  renderBody(body: string, row: AudienceRow): string {
    const map: Record<string, string> = {
      firstname: row.firstName,
      lastname: row.lastName,
      fullname: `${row.firstName} ${row.lastName}`.trim(),
      studentid: row.studentId || row.instituteUserId || '',
      instituteid: row.instituteUserId || '',
      phone: row.phone || '',
    };
    return body.replace(/\{(\w+)\}/g, (full, key: string) => {
      const k = key.toLowerCase();
      return k in map ? map[k] : full;
    });
  }

  // ── Template CRUD ──
  listTemplates() {
    return this.templateRepo.find({ where: { isActive: true }, order: { updatedAt: 'DESC' } });
  }

  async saveTemplate(dto: Partial<WhatsAppMessageTemplateEntity>, userId?: string) {
    if (!dto.name?.trim() || !dto.body?.trim()) {
      throw new BadRequestException('name and body are required');
    }
    if (dto.id) {
      await this.templateRepo.update({ id: dto.id }, {
        name: dto.name, description: dto.description, body: dto.body,
        flowJson: dto.flowJson, placeholders: dto.placeholders,
      });
      return this.templateRepo.findOne({ where: { id: dto.id } });
    }
    const entity = this.templateRepo.create({ ...dto, createdBy: userId });
    return this.templateRepo.save(entity);
  }

  async deleteTemplate(id: string) {
    await this.templateRepo.update({ id }, { isActive: false });
    return { success: true };
  }

  // ── Campaign history ──
  recordCampaign(data: Partial<WhatsAppCampaignEntity>) {
    return this.campaignRepo.save(this.campaignRepo.create(data));
  }

  listCampaigns(limit = 50) {
    return this.campaignRepo.find({ order: { createdAt: 'DESC' }, take: Math.min(200, limit) });
  }
}
