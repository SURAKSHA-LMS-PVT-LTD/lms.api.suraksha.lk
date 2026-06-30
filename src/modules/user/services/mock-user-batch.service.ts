/**
 * MockUserBatchCreationService
 *
 * Creates "hollow" student records (isMock=true) on behalf of an institute admin.
 * Each user has no name/email/phone — just a system ID, an institute enrollment,
 * and optionally a class assignment and a smart card.
 *
 * Students claim these records later via the public registration form by entering
 * their institute user ID — at that point isMock is set to false and their real
 * profile data fills in.
 */

import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  Logger,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { UserEntity } from '../entities/user.entity';
import { StudentEntity } from '../../student/entities/student.entity';
import { InstituteEntity } from '../../institute/entities/institute.entity';
import { InstituteUserEntity } from '../../institute_mudules/institue_user/entities/institue_user.entity';
import { InstituteClassStudentEntity } from '../../institute_class_modules/institute_class_student/entities/institute_class_student.entity';
import { InstituteClassEntity } from '../../institute_mudules/institue_class/entities/institue_class.entity';
import { UserType } from '../enums/user-type.enum';
import { InstituteUserType } from '../../institute_mudules/institue_user/enums/institute-user-type.enum';
import { InstituteUserStatus } from '../../institute_mudules/institue_user/enums/institute-user-status.enum';
import { CardStatus } from '../../user-card-management/enums/card-status.enum';
import { SmartCardsService } from '../../smart-cards/smart-cards.service';
import { SmartCardScope, SmartCardStatus } from '../../smart-cards/enums/smart-card.enums';
import { now } from '../../../common/utils/timezone.util';

export interface MockBatchClassDistribution {
  classId: string;
  count: number;
}

export interface MockBatchOptions {
  instituteId: string;
  adminUserId: string;
  classDistribution: MockBatchClassDistribution[];
  /** @deprecated use assignInstituteCard / assignSurakshaCard */
  assignCards?: boolean;
  assignInstituteCard?: boolean;
  assignSurakshaCard?: boolean;
}

export interface MockBatchResult {
  created: number;
  failed: number;
  userIds: string[];
  cardPendingScopes: string[];
  perClass: Array<{
    classId: string;
    className: string;
    requested: number;
    created: number;
  }>;
}

@Injectable()
export class MockUserBatchCreationService {
  private readonly logger = new Logger(MockUserBatchCreationService.name);

  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(InstituteEntity)
    private readonly instituteRepo: Repository<InstituteEntity>,
    @InjectRepository(InstituteUserEntity)
    private readonly instituteUserRepo: Repository<InstituteUserEntity>,
    @InjectRepository(InstituteClassEntity)
    private readonly classRepo: Repository<InstituteClassEntity>,
    private readonly dataSource: DataSource,
    @Optional()
    private readonly smartCardsService?: SmartCardsService,
  ) {}

  async createMockBatch(opts: MockBatchOptions): Promise<MockBatchResult> {
    const batchStart = Date.now();
    const { instituteId, adminUserId, classDistribution } = opts;
    const assignInstituteCard = opts.assignInstituteCard ?? opts.assignCards ?? false;
    const assignSurakshaCard  = opts.assignSurakshaCard ?? false;

    this.logger.log(
      `Mock batch START institute=${instituteId} admin=${adminUserId} classes=${classDistribution.length} ` +
      `instituteCard=${assignInstituteCard} surakshaCard=${assignSurakshaCard}`,
    );

    const institute = await this.instituteRepo.findOne({ where: { id: instituteId } });
    if (!institute) throw new NotFoundException(`Institute not found: ${instituteId}`);

    await this.assertInstituteAdmin(adminUserId, instituteId);

    const totalRequested = classDistribution.reduce((s, c) => s + c.count, 0);
    if (totalRequested === 0) {
      throw new BadRequestException('Total student count must be greater than zero.');
    }
    if (totalRequested > 3000) {
      throw new BadRequestException('Cannot create more than 3000 mock users per batch.');
    }
    this.logger.log(`Mock batch totalRequested=${totalRequested}`);

    if ((assignInstituteCard || assignSurakshaCard) && this.smartCardsService) {
      const t0 = Date.now();
      await this.smartCardsService.assertFeatureEnabled(instituteId);
      // Fail fast, before any IDs/rows are generated, if the institute's card pool
      // can't cover the whole batch. One grouped count covers both scopes.
      await this.assertCardPoolCapacity(instituteId, totalRequested, assignInstituteCard, assignSurakshaCard);
      this.logger.log(`Mock batch card-pool capacity OK in ${Date.now() - t0}ms`);
    }

    // Validate all classes in one query
    const classCheckStart = Date.now();
    const neededClassIds = classDistribution.filter(c => c.count > 0).map(c => c.classId);
    const classEntities = new Map<string, InstituteClassEntity>();
    if (neededClassIds.length > 0) {
      const found = await this.classRepo.find({
        where: neededClassIds.map(id => ({ id, instituteId, isActive: true })),
      });
      for (const c of found) classEntities.set(c.id, c);
      const missing = neededClassIds.find(id => !classEntities.has(id));
      if (missing) throw new BadRequestException(`Class ${missing} not found or inactive in this institute.`);
    }
    this.logger.log(`Mock batch class validation (${neededClassIds.length} classes) in ${Date.now() - classCheckStart}ms`);

    const result: MockBatchResult = {
      created: 0,
      failed: 0,
      userIds: [],
      cardPendingScopes: [],
      perClass: [],
    };

    // Single transaction for the whole batch — connection drop rolls back everything.
    // Retried up to 3 times on duplicate-key collisions (two concurrent batches
    // racing between the uniqueness check and the INSERT).
    const MAX_RETRIES = 3;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const attemptStart = Date.now();
    if (attempt > 1) {
      this.logger.warn(`Mock batch attempt ${attempt}/${MAX_RETRIES} starting (previous attempt failed on duplicate key)`);
    }
    // Reset result on each attempt so retries don't accumulate duplicate perClass entries
    result.created = 0;
    result.userIds = [];
    result.cardPendingScopes = [];
    result.perClass = [];

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      // One timestamp for the whole batch — avoids ~48k now() calls and keeps
      // createdAt/updatedAt consistent across all rows in the same batch.
      const ts = now();
      const cardExpiry = now();
      cardExpiry.setFullYear(cardExpiry.getFullYear() + 2);

      // ── Phase 1: generate all IDs, zero per-user work ──
      // All three are random + one bulk IN-check per type (one round-trip each):
      // user.id matches the system's intentional random 9-digit scheme; card_id must
      // be unguessable (printed QR); studentId has no global sequence. No table locks.
      const idGenStart = Date.now();
      const allUserIds    = await this.nextUserIds(totalRequested, qr.manager);
      const allCardIds    = await this.nextCardIds(totalRequested, qr.manager);
      const allStudentIds = await this.nextStudentIds(totalRequested, qr.manager);
      this.logger.log(
        `Mock batch[${attempt}] Phase1 ID generation done in ${Date.now() - idGenStart}ms ` +
        `(userIds=${allUserIds.length} cardIds=${allCardIds.length} studentIds=${allStudentIds.length})`,
      );

      // Reserve institute user IDs atomically for the entire batch in one lock
      let instituteUserIdCounter = 0;
      let instituteUserIdBase    = 0;
      if (institute.userIdAutoGenerate) {
        const reserveStart = Date.now();
        instituteUserIdBase = await this.reserveInstituteUserIdBlock(institute, totalRequested, qr.manager);
        this.logger.log(
          `Mock batch[${attempt}] institute-user-id block reserved base=${instituteUserIdBase} ` +
          `count=${totalRequested} in ${Date.now() - reserveStart}ms`,
        );
      }

      // ── Phase 2: build all entity rows in memory ────────────────────────
      const rowBuildStart = Date.now();
      const userRows:          Partial<UserEntity>[]                  = [];
      const studentRows:       Partial<StudentEntity>[]               = [];
      const enrollmentRows:    Partial<InstituteUserEntity>[]         = [];
      const classStudentRows:  Partial<InstituteClassStudentEntity>[] = [];

      let idx = 0;
      for (const { classId, count } of classDistribution) {
        if (count <= 0) continue;
        const classEntity = classEntities.get(classId)!;
        const classResult = { classId, className: classEntity.name, requested: count, created: 0 };

        for (let i = 0; i < count; i++) {
          const cardId = allCardIds[idx];
          const studentId = allStudentIds[idx];
          const userIdByInstitute = institute.userIdAutoGenerate
            ? this.formatInstituteUserId(institute, instituteUserIdBase + (++instituteUserIdCounter))
            : null;

          const userId = allUserIds[idx];

          userRows.push({
            id: userId,          // pre-assigned — bypasses @BeforeInsert for bulk save
            userType: UserType.USER,
            isActive: true,
            isMock: true,
            isPhoneVerified: false,
            isEmailVerified: false,
            profileCompletionPercentage: 0,
            firstLoginCompleted: false,
            createdByAdminId: adminUserId,
            cardId,
            cardStatus: CardStatus.ACTIVE,
            cardExpiryDate: cardExpiry,
            createdAt: ts,
            updatedAt: ts,
          } as any);

          studentRows.push({
            userId,
            studentId,
            isActive: true,
            createdAt: ts,
            updatedAt: ts,
          } as any);

          enrollmentRows.push({
            instituteId: institute.id,
            userId,
            instituteUserType: InstituteUserType.STUDENT,
            userIdByInstitute,
            status: InstituteUserStatus.ACTIVE,
            verifiedBy: adminUserId,
            verifiedAt: ts,
            createdAt: ts,
            updatedAt: ts,
          } as any);

          classStudentRows.push({
            instituteId: institute.id,
            classId,
            studentUserId: userId,
            isActive: true,
            isVerified: true,
            enrollmentMethod: 'manual',
            verifiedBy: adminUserId,
            verifiedAt: ts,
            createdAt: ts,
            updatedAt: ts,
          } as any);

          classResult.created++;
          idx++;
        }

        result.perClass.push(classResult);
      }
      this.logger.log(`Mock batch[${attempt}] Phase2 row build done in ${Date.now() - rowBuildStart}ms`);

      // ── Phase 3: bulk INSERTs, chunked ──────────────────────────────────
      // manager.save(array) runs SELECT+INSERT per entity (EntityPersistExecutor);
      // manager.insert() emits a single INSERT ... VALUES (...),(...),... but does
      // NOT auto-chunk — a 3000-row × multi-column statement risks max_allowed_packet
      // and the 65,535 placeholder limit. Chunk to stay well under both.
      const insertStart = Date.now();
      await this.bulkInsert(qr.manager, UserEntity, userRows);
      const tAfterUsers = Date.now();
      await this.bulkInsert(qr.manager, StudentEntity, studentRows);
      const tAfterStudents = Date.now();
      await this.bulkInsert(qr.manager, InstituteUserEntity, enrollmentRows);
      const tAfterEnrollments = Date.now();
      await this.bulkInsert(qr.manager, InstituteClassStudentEntity, classStudentRows);
      const tAfterClassStudents = Date.now();
      this.logger.log(
        `Mock batch[${attempt}] Phase3 bulk inserts done in ${tAfterClassStudents - insertStart}ms ` +
        `(users=${tAfterUsers - insertStart}ms students=${tAfterStudents - tAfterUsers}ms ` +
        `enrollments=${tAfterEnrollments - tAfterStudents}ms classStudents=${tAfterClassStudents - tAfterEnrollments}ms)`,
      );

      result.userIds = allUserIds.slice(0, totalRequested);
      result.created = totalRequested;

      // ── Phase 4: smart card assignment (sequential — pessimistic row lock) ─
      // Cards were pre-validated as sufficient (assertCardPoolCapacity). If the pool
      // is drained mid-batch by a concurrent assignment, that's a hard failure: the
      // whole batch rolls back rather than creating users without their cards.
      if (this.smartCardsService && (assignInstituteCard || assignSurakshaCard)) {
        const cardStart = Date.now();
        let cardsAssigned = 0;
        for (const userId of result.userIds) {
          for (const [shouldAssign, scope] of [
            [assignInstituteCard, SmartCardScope.INSTITUTE],
            [assignSurakshaCard,  SmartCardScope.GLOBAL],
          ] as Array<[boolean, SmartCardScope]>) {
            if (!shouldAssign) continue;
            await this.smartCardsService.assignCardToUser(
              institute.id,
              { userId, scope },
              adminUserId,
              qr.manager,
            );
            cardsAssigned++;
          }
        }
        this.logger.log(
          `Mock batch[${attempt}] Phase4 card assignment done: ${cardsAssigned} cards in ` +
          `${Date.now() - cardStart}ms (${((Date.now() - cardStart) / Math.max(cardsAssigned, 1)).toFixed(1)}ms/card — ` +
          `sequential due to pessimistic_write row lock in SmartCardsService)`,
        );
      }

      await qr.commitTransaction();
      await qr.release();
      this.logger.log(
        `Mock batch[${attempt}] COMMIT OK — created=${result.created} totalElapsed=${Date.now() - batchStart}ms ` +
        `attemptElapsed=${Date.now() - attemptStart}ms`,
      );
      return result;
    } catch (err: any) {
      await qr.rollbackTransaction();
      await qr.release();
      this.logger.error(
        `Mock batch[${attempt}] ROLLBACK after ${Date.now() - attemptStart}ms — ` +
        `code=${err?.code ?? 'n/a'} message=${err?.message ?? err}`,
      );
      // ER_DUP_ENTRY — regenerate all IDs and retry
      if (err?.code === 'ER_DUP_ENTRY' && attempt < MAX_RETRIES) {
        this.logger.warn(`Mock batch: duplicate key on attempt ${attempt}, retrying with new IDs…`);
        continue;
      }
      throw err;
    }
    } // end retry loop
    // TypeScript unreachable — loop always returns or throws
    throw new Error('Mock batch: exceeded retry limit on duplicate key.');
  }

  /**
   * One grouped COUNT query checks both scopes' free pools against the whole batch
   * before any work starts — combined institute-wide check, not per-class.
   *
   * Per-class card partitioning isn't a real constraint here: assignCardToUser's
   * free pool is institute+scope wide (ASSIGNED_INSTITUTE ∪ ASSIGNED_CLASS, classId
   * is only a same-scope preference, not a hard split), so summing the whole batch
   * against the institute total is both correct and cheaper than N per-class queries.
   */
  private async assertCardPoolCapacity(
    instituteId: string,
    totalRequested: number,
    assignInstituteCard: boolean,
    assignSurakshaCard: boolean,
  ): Promise<void> {
    const scopes = [
      ...(assignInstituteCard ? [SmartCardScope.INSTITUTE] : []),
      ...(assignSurakshaCard ? [SmartCardScope.GLOBAL] : []),
    ];
    if (scopes.length === 0) return;

    const rows: Array<{ scope: SmartCardScope; available: string }> = await this.dataSource.query(
      `SELECT scope, COUNT(*) AS available
       FROM smart_cards
       WHERE institute_id = ?
         AND scope IN (${scopes.map(() => '?').join(',')})
         AND status IN (?, ?)
         AND assigned_user_id IS NULL
       GROUP BY scope`,
      [instituteId, ...scopes, SmartCardStatus.ASSIGNED_INSTITUTE, SmartCardStatus.ASSIGNED_CLASS],
    );

    const availableByScope = new Map(rows.map(r => [r.scope, Number(r.available)]));
    const shortages: string[] = [];
    for (const scope of scopes) {
      const available = availableByScope.get(scope) ?? 0;
      this.logger.log(`Mock batch card pool: scope=${scope} available=${available} required=${totalRequested}`);
      if (available < totalRequested) {
        shortages.push(`${scope} (${available} available, ${totalRequested} required)`);
      }
    }
    if (shortages.length > 0) {
      this.logger.warn(`Mock batch card pool INSUFFICIENT — rejecting before any work starts: ${shortages.join('; ')}`);
      throw new BadRequestException(
        `Not enough smart cards in the institute pool to cover this batch: ${shortages.join('; ')}.`,
      );
    }
  }

  /**
   * Reserve a contiguous block of N institute user ID counters in one pessimistic-locked UPDATE.
   * Returns the counter value BEFORE the block (i.e. first ID in block = base + 1).
   */
  private async reserveInstituteUserIdBlock(
    institute: InstituteEntity,
    count: number,
    manager: EntityManager,
  ): Promise<number> {
    const locked = await manager
      .createQueryBuilder(InstituteEntity, 'i')
      .setLock('pessimistic_write')
      .where('i.id = :id', { id: institute.id })
      .getOne();

    const base = Number((locked as any)?.userIdLastCounter ?? 0);
    await manager.update(InstituteEntity, { id: institute.id }, { userIdLastCounter: (base + count) as any });
    return base;
  }

  private formatInstituteUserId(institute: InstituteEntity, counter: number): string {
    const prefix = institute.userIdPrefix?.trim() ?? '';
    const padded = String(counter).padStart(Math.max(3, String(counter).length), '0');
    return `${prefix}${padded}`;
  }

  /**
   * N random 9-digit user IDs, verified unique in one bulk IN-check.
   *
   * user.id is intentionally random (see UserEntity.assignRandomId): non-sequential
   * but human-readable, shown on receipts/SMS. We must match that — a sequential
   * MAX()+1 would collide with the random pool constantly, climb toward the 9-digit
   * ceiling, and overflow into 10 digits on large batches. Random + IN-check is the
   * same strategy used for card_id, so a single round-trip verifies the whole batch.
   */
  private async nextUserIds(count: number, manager: EntityManager): Promise<string[]> {
    return this.generateUniqueIds(
      count,
      // 100_000_000 – 999_999_999 (9 digits, never starts with 0) — matches assignRandomId
      () => String(100000000 + Math.floor(Math.random() * 900000000)),
      (vals) => manager.query(
        `SELECT id AS v FROM users WHERE id IN (${vals.map(() => '?').join(',')})`,
        vals,
      ),
    );
  }

  /**
   * N random card IDs, verified unique in one bulk IN-check (not sequential).
   * card_id is the printed/scanned QR value handed to students — sequential,
   * guessable codes would let one student's QR enumerate everyone else's.
   */
  private async nextCardIds(count: number, manager: EntityManager): Promise<string[]> {
    return this.generateUniqueIds(
      count,
      () => `SC${1000000000 + Math.floor(Math.random() * 9000000000)}`,
      (vals) => manager.query(
        `SELECT card_id AS v FROM users WHERE card_id IN (${vals.map(() => '?').join(',')})`,
        vals,
      ),
    );
  }

  /**
   * N random student IDs, verified unique in one bulk IN-check.
   * student_id format: "STU" + 6-digit number (random — no system-wide sequence exists).
   */
  private async nextStudentIds(count: number, manager: EntityManager): Promise<string[]> {
    return this.generateUniqueIds(
      count,
      () => `STU${100000 + Math.floor(Math.random() * 900000)}`,
      (vals) => manager.query(
        `SELECT student_id AS v FROM students WHERE student_id IN (${vals.map(() => '?').join(',')})`,
        vals,
      ),
    );
  }

  /**
   * Chunked bulk insert. TypeORM's manager.insert() builds one INSERT VALUES (...)
   * statement and does not chunk; large batches would blow max_allowed_packet and
   * the 65,535 placeholder limit. CHUNK keeps each statement small and safe.
   */
  private async bulkInsert<T extends import('typeorm').ObjectLiteral>(
    manager: EntityManager,
    entity: { new (): T } | Function,
    rows: any[],
  ): Promise<void> {
    if (rows.length === 0) return;
    const CHUNK = 500;
    for (let i = 0; i < rows.length; i += CHUNK) {
      await manager.insert(entity as any, rows.slice(i, i + CHUNK));
    }
  }

  /**
   * Generate `count` unique IDs in one DB round-trip: build random candidates,
   * dedup intra-batch, then a single bulk IN-check finds any colliding with
   * existing rows; only the colliding slots are regenerated and re-checked.
   * No per-row queries, no full-table FOR UPDATE locks.
   */
  private async generateUniqueIds(
    count: number,
    gen: () => string,
    findExisting: (vals: string[]) => Promise<Array<{ v: string }>>,
  ): Promise<string[]> {
    if (count <= 0) return [];
    const accepted: string[] = [];
    const seen = new Set<string>();
    let round = 0;
    let totalCollisions = 0;

    for (let attempt = 0; attempt < 8 && accepted.length < count; attempt++) {
      round++;
      const need = count - accepted.length;
      // Build `need` fresh candidates not already accepted/queued this round.
      const candidates: string[] = [];
      const candidateSet = new Set<string>();
      let guard = 0;
      while (candidates.length < need && guard++ < need * 20) {
        const c = gen();
        if (seen.has(c) || candidateSet.has(c)) continue;
        candidateSet.add(c);
        candidates.push(c);
      }
      if (candidates.length === 0) {
        this.logger.warn(`generateUniqueIds: candidate-space exhausted after ${round} rounds (guard hit), need=${need}`);
        break;
      }

      const existing = await findExisting(candidates);
      const taken = new Set(existing.map(r => String(r.v)));
      for (const c of candidates) {
        seen.add(c);
        if (!taken.has(c)) accepted.push(c);
      }
      if (existing.length > 0) {
        totalCollisions += existing.length;
        this.logger.warn(
          `generateUniqueIds: round ${round} found ${existing.length}/${candidates.length} ` +
          `pre-existing collisions, regenerating that slice`,
        );
      }
    }

    if (accepted.length < count) {
      this.logger.error(`generateUniqueIds: FAILED — got ${accepted.length}/${count} after ${round} rounds, ${totalCollisions} total collisions`);
      throw new Error(`Mock batch: failed to generate ${count} unique IDs after retries.`);
    }
    if (round > 1) {
      this.logger.log(`generateUniqueIds: resolved ${count} IDs in ${round} rounds (${totalCollisions} collisions)`);
    }
    return accepted.slice(0, count);
  }

  private async assertInstituteAdmin(adminUserId: string, instituteId: string): Promise<void> {
    const link = await this.instituteUserRepo.findOne({
      where: {
        userId: adminUserId,
        instituteId,
        instituteUserType: InstituteUserType.INSTITUTE_ADMIN,
        status: InstituteUserStatus.ACTIVE,
      },
    });
    if (!link) {
      throw new ForbiddenException('You must be an active INSTITUTE_ADMIN to create mock users.');
    }
  }


  async lookupMockUser(
    instituteId: string,
    userIdByInstitute: string,
  ): Promise<{ found: boolean; isMock?: boolean; userId?: string; cardId?: string }> {
    if (!userIdByInstitute?.trim()) {
      throw new BadRequestException('userIdByInstitute is required.');
    }
    const link = await this.instituteUserRepo.findOne({
      where: { instituteId, userIdByInstitute: userIdByInstitute.trim() },
    });
    if (!link) return { found: false };

    const user = await this.userRepo.findOne({ where: { id: link.userId } });
    if (!user) return { found: false };

    return {
      found: true,
      isMock: (user as any).isMock ?? false,
      userId: user.id,
      cardId: user.cardId ?? undefined,
    };
  }
}
