import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { UserEntity } from '../../user/entities/user.entity';
import { StudentEntity } from '../../student/entities/student.entity';
import { InstituteUserEntity } from '../../institute_mudules/institue_user/entities/institue_user.entity';
import { InstituteClassEntity } from '../../institute_mudules/institue_class/entities/institue_class.entity';
import { InstituteClassStudentEntity } from '../../institute_class_modules/institute_class_student/entities/institute_class_student.entity';
import { UserType } from '../../user/enums/user-type.enum';
import { InstituteUserType } from '../../institute_mudules/institue_user/enums/institute-user-type.enum';
import { InstituteUserStatus } from '../../institute_mudules/institue_user/enums/institute-user-status.enum';
import { now } from '../../../common/utils/timezone.util';
import {
  BulkExternalStudentDto,
  ExternalStudentRecordDto,
  BulkExternalStudentResult,
  ExternalStudentResult,
  ExternalStudentFailure,
} from '../dto/external-student.dto';

/**
 * Creates / links students via institute API key.
 *
 * Touches ONLY the users, students and institute_user tables — never parents.
 * Designed as a migration entry point: tolerant of duplicates (links instead of erroring),
 * and idempotent on the institute membership (re-running updates extraData rather than failing).
 */
@Injectable()
export class ExternalStudentService {
  private readonly logger = new Logger(ExternalStudentService.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
  ) {}

  /** Hash an institute (tenant) login password the same way the in-app institute-user create does. */
  private async hashInstitutePassword(raw: string): Promise<string> {
    const pepper = this.configService.get<string>('BCRYPT_PEPPER') || '';
    const saltRounds = parseInt(this.configService.get<string>('BCRYPT_SALT_ROUNDS') || '12', 10);
    return bcrypt.hash(raw + pepper, saltRounds);
  }

  async bulkCreateStudents(
    instituteId: string,
    dto: BulkExternalStudentDto,
  ): Promise<BulkExternalStudentResult> {
    const results: ExternalStudentResult[] = [];
    const failures: ExternalStudentFailure[] = [];

    for (let i = 0; i < dto.students.length; i++) {
      const record = dto.students[i];
      try {
        const res = await this.processOne(instituteId, record);
        results.push({ index: i, ...res });
      } catch (err: any) {
        this.logger.warn(`External student create failed at index ${i}: ${err.message}`);
        failures.push({ index: i, reason: err.message ?? 'Unknown error' });
      }
    }

    return {
      instituteId,
      successCount: results.length,
      failedCount: failures.length,
      results,
      failures,
    };
  }

  /**
   * Resolve-or-create the user, ensure a student row, then upsert the institute membership.
   * Wrapped in a transaction so a partial failure (e.g. student row) never leaves a half-created user.
   */
  private async processOne(
    instituteId: string,
    record: ExternalStudentRecordDto,
  ): Promise<Omit<ExternalStudentResult, 'index'>> {
    return this.dataSource.transaction(async (manager) => {
      const { user, created } = await this.resolveOrCreateUser(manager, record);

      // Ensure a students row exists (student-capable users always have one).
      await this.ensureStudentRecord(manager, user.id);

      // Upsert the institute membership with the incoming extra columns.
      const assignmentCreated = await this.upsertInstituteMembership(
        manager,
        instituteId,
        user.id,
        record,
      );

      // Optional: also enroll into a class when classId is supplied.
      const classEnrollment = await this.ensureClassEnrollment(
        manager,
        instituteId,
        user.id,
        record,
      );

      return {
        userId: String(user.id),
        action: created ? 'created' : 'linked',
        assignmentCreated,
        classEnrollment,
      };
    });
  }

  /**
   * When the record carries a classId, enroll the student into that class
   * (active + verified) so it's immediately usable for attendance. Idempotent:
   * an existing enrollment is left as-is. The class must belong to this institute.
   */
  private async ensureClassEnrollment(
    manager: EntityManager,
    instituteId: string,
    userId: string,
    record: ExternalStudentRecordDto,
  ): Promise<'created' | 'existing' | 'none'> {
    const classId = this.clean(record.classId);
    if (!classId) return 'none';

    // Class must belong to this institute — guard against cross-institute enrollment.
    const cls = await manager.findOne(InstituteClassEntity, { where: { id: classId, instituteId } });
    if (!cls) {
      throw new Error(`Class '${classId}' not found for this institute`);
    }

    const existing = await manager.findOne(InstituteClassStudentEntity, {
      where: { instituteId, classId, studentUserId: userId },
    });
    if (existing) {
      // Re-activate a former enrollment rather than creating a duplicate / failing.
      if (!existing.isActive) {
        existing.isActive = true;
        existing.updatedAt = now();
        await manager.save(existing);
      }
      return 'existing';
    }

    const enrollment = manager.create(InstituteClassStudentEntity, {
      instituteId,
      classId,
      studentUserId: userId,
      isActive: true,
      isVerified: true,
      enrollmentMethod: 'manual',
      createdAt: now(),
      updatedAt: now(),
    } as any);
    await manager.save(enrollment);
    return 'created';
  }

  /**
   * 1. Explicit userId  → load that user (link directly).
   * 2. phoneNumber match → link that existing active user.
   * 3. otherwise         → create a new USER_WITHOUT_PARENT (student-capable, never a parent).
   */
  private async resolveOrCreateUser(
    manager: EntityManager,
    record: ExternalStudentRecordDto,
  ): Promise<{ user: UserEntity; created: boolean }> {
    // 1. Explicit user ID
    if (record.userId) {
      const existing = await manager.findOne(UserEntity, { where: { id: record.userId } });
      if (existing) return { user: existing, created: false };
      // userId given but not found — fall through to phone match / creation rather than erroring.
    }

    // 2. Phone-number match (primary dedupe signal for migration)
    const phone = this.clean(record.phoneNumber);
    if (phone) {
      const byPhone = await manager.findOne(UserEntity, {
        where: { phoneNumber: phone, isActive: true },
      });
      if (byPhone) return { user: byPhone, created: false };
    }

    // 3. Create a new student-capable user
    const nameWithInitials = this.clean(record.nameWithInitials) ?? this.buildNameWithInitials(record);

    const userEntity = manager.create(UserEntity, {
      firstName: this.clean(record.firstName),
      lastName: this.clean(record.lastName),
      nameWithInitials,
      email: record.email ? this.clean(record.email.toLowerCase()) : null,
      phoneNumber: phone,
      nic: this.clean(record.nic),
      dateOfBirth: record.dateOfBirth ? new Date(record.dateOfBirth) : null,
      gender: this.clean(record.gender),
      city: this.clean(record.city),
      userType: UserType.USER_WITHOUT_PARENT, // student-capable, can never be assigned as a parent
      password: null,
      imageUrl: null,
      isActive: true,
      firstLoginCompleted: false,
      isPhoneVerified: false,
      isEmailVerified: false,
      createdAt: now(),
      updatedAt: now(),
    } as any);

    const savedUser = await manager.save(userEntity);
    return { user: savedUser, created: true };
  }

  /** Create a students row for this user if one doesn't already exist. No parent linkage. */
  private async ensureStudentRecord(manager: EntityManager, userId: string): Promise<void> {
    const exists = await manager.exists(StudentEntity, { where: { userId } });
    if (exists) return;

    const student = manager.create(StudentEntity, {
      userId,
      isActive: true,
      createdAt: now(),
      updatedAt: now(),
    } as any);
    await manager.save(student);
  }

  /**
   * Create the institute_user membership, or update extraData/userIdByInstitute if it already exists.
   * Returns true when a new membership row was created.
   */
  private async upsertInstituteMembership(
    manager: EntityManager,
    instituteId: string,
    userId: string,
    record: ExternalStudentRecordDto,
  ): Promise<boolean> {
    const timestamp = now();
    const institutePassword = this.clean(record.institutePassword);
    const hashedPassword = institutePassword ? await this.hashInstitutePassword(institutePassword) : null;

    const existing = await manager.findOne(InstituteUserEntity, {
      where: { instituteId, userId },
    });

    if (existing) {
      // Merge incoming extra columns into whatever is already stored.
      if (record.extraData && Object.keys(record.extraData).length > 0) {
        existing.extraData = { ...(existing.extraData ?? {}), ...record.extraData };
      }
      if (this.clean(record.userIdByInstitute)) {
        existing.userIdByInstitute = this.clean(record.userIdByInstitute);
      }
      // Only (re)set the institute password when one is supplied — never wipe an existing one.
      if (hashedPassword) {
        existing.institutePassword = hashedPassword;
        existing.institutePasswordSetAt = timestamp;
      }
      existing.updatedAt = timestamp;
      await manager.save(existing);
      return false;
    }

    const membership = manager.create(InstituteUserEntity, {
      instituteId,
      userId,
      instituteUserType: InstituteUserType.STUDENT,
      status: InstituteUserStatus.ACTIVE,
      userIdByInstitute: this.clean(record.userIdByInstitute),
      extraData: record.extraData && Object.keys(record.extraData).length > 0 ? record.extraData : null,
      ...(hashedPassword && {
        institutePassword: hashedPassword,
        institutePasswordSetAt: timestamp,
      }),
      createdAt: timestamp,
      updatedAt: timestamp,
    } as any);
    await manager.save(membership);
    return true;
  }

  /** Empty/whitespace → null (mirrors comprehensive-create cleaning so unique indexes don't choke on ''). */
  private clean(value?: string | null): string | null {
    if (value === null || value === undefined) return null;
    const trimmed = String(value).trim();
    return trimmed === '' ? null : trimmed;
  }

  private buildNameWithInitials(record: ExternalStudentRecordDto): string {
    const first = this.clean(record.firstName);
    const last = this.clean(record.lastName);
    if (first && last) {
      const initials = first.split(/\s+/).map(w => w.charAt(0).toUpperCase() + '.').join('');
      const finalWord = last.split(/\s+/).pop()!;
      return `${initials} ${finalWord.charAt(0).toUpperCase()}${finalWord.slice(1).toLowerCase()}`;
    }
    return first ?? 'Student';
  }
}
