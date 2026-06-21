import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository, In, Like, Brackets } from 'typeorm';
import { SmartCardEntity } from './entities/smart-card.entity';
import { SmartCardAssignmentEntity } from './entities/smart-card-assignment.entity';
import { SmartCardType, SmartCardScope, SmartCardStatus, SMART_CARDS_FEATURE_KEY } from './enums/smart-card.enums';
import {
  CreateSmartCardDto,
  BulkCreateSmartCardsDto,
  UpdateSmartCardDto,
  AssignCardsToInstituteDto,
  AssignCardsToClassDto,
  BulkAssignToClassByRangeDto,
  AssignCardToUserDto,
  ListSmartCardsQueryDto,
} from './dto/smart-card.dto';
import { UserEntity } from '../user/entities/user.entity';
import { InstituteUserEntity } from '../institute_mudules/institue_user/entities/institue_user.entity';
import { FeaturesService } from '../features/features.service';

@Injectable()
export class SmartCardsService {
  constructor(
    @InjectRepository(SmartCardEntity)
    private readonly cardRepo: Repository<SmartCardEntity>,
    @InjectRepository(SmartCardAssignmentEntity)
    private readonly assignmentRepo: Repository<SmartCardAssignmentEntity>,
    private readonly dataSource: DataSource,
    private readonly featuresService: FeaturesService,
  ) {}

  // ───────────────────────── Feature gate ──────────────────────────────────

  /** Throw if the institute does not have the smart-cards feature enabled. */
  async assertFeatureEnabled(instituteId: string): Promise<void> {
    const features = await this.featuresService.getFeaturesForInstitute(instituteId);
    if (!features?.[SMART_CARDS_FEATURE_KEY]?.enabled) {
      throw new ForbiddenException('Smart Cards feature is not enabled for this institute.');
    }
  }

  // ───────────────────────── Admin: inventory ──────────────────────────────

  async createCard(dto: CreateSmartCardDto): Promise<SmartCardEntity> {
    await this.ensureUniqueValue(dto.scope, dto.cardId);
    let status = SmartCardStatus.AVAILABLE;
    if (dto.instituteId && dto.scope === SmartCardScope.INSTITUTE) {
      status = dto.classId ? SmartCardStatus.ASSIGNED_CLASS : SmartCardStatus.ASSIGNED_INSTITUTE;
    }
    const card = this.cardRepo.create({
      cardName: dto.cardName,
      cardId: dto.cardId,
      cardType: dto.cardType,
      scope: dto.scope,
      status,
      instituteId: dto.instituteId || null,
      classId: dto.classId || null,
    });
    return this.cardRepo.save(card);
  }

  /**
   * Bulk-create. Resolves the input into a list of card ids (explicit list OR numeric
   * range), drops values that already exist for the scope, and inserts the rest.
   */
  async bulkCreate(dto: BulkCreateSmartCardsDto): Promise<{ created: number; skippedDuplicates: number; total: number }> {
    const ids = this.resolveBulkIds(dto);
    if (ids.length === 0) {
      throw new BadRequestException('No card ids resolved from input. Provide cardIds[] or a rangeStart/rangeEnd.');
    }

    // De-dup within the request itself.
    const uniqueIds = Array.from(new Set(ids));

    // Drop ids already present for this scope.
    const existing = await this.cardRepo.find({
      where: { scope: dto.scope, cardId: In(uniqueIds) },
      select: ['cardId'],
    });
    const existingSet = new Set(existing.map((c) => c.cardId));
    const toInsert = uniqueIds.filter((id) => !existingSet.has(id));

    if (toInsert.length > 0) {
      const prefix = dto.namePrefix?.trim() || 'Card';
      let autoStatus = SmartCardStatus.AVAILABLE;
      if (dto.instituteId && dto.scope === SmartCardScope.INSTITUTE) {
        autoStatus = dto.classId ? SmartCardStatus.ASSIGNED_CLASS : SmartCardStatus.ASSIGNED_INSTITUTE;
      }
      const rows = toInsert.map((cardId) =>
        this.cardRepo.create({
          cardName: `${prefix} ${cardId}`,
          cardId,
          cardType: dto.cardType,
          scope: dto.scope,
          status: autoStatus,
          instituteId: dto.instituteId || null,
          classId: dto.classId || null,
        }),
      );
      // chunked insert keeps the statement size sane for large ranges
      const CHUNK = 500;
      for (let i = 0; i < rows.length; i += CHUNK) {
        await this.cardRepo.insert(rows.slice(i, i + CHUNK));
      }
    }

    return {
      created: toInsert.length,
      skippedDuplicates: uniqueIds.length - toInsert.length,
      total: uniqueIds.length,
    };
  }

  private resolveBulkIds(dto: BulkCreateSmartCardsDto): string[] {
    if (dto.cardIds && dto.cardIds.length > 0) {
      return dto.cardIds.map((s) => s.trim()).filter((s) => s.length > 0 && s.length <= 30);
    }
    if (dto.rangeStart !== undefined && dto.rangeStart !== null && dto.rangeEnd !== undefined && dto.rangeEnd !== null) {
      if (dto.rangeEnd < dto.rangeStart) {
        throw new BadRequestException('rangeEnd must be ≥ rangeStart.');
      }
      if (dto.rangeEnd - dto.rangeStart > 100000) {
        throw new BadRequestException('Range too large (max 100,000 cards per request).');
      }
      const prefix = dto.rangePrefix ?? '';
      const pad = dto.pad ?? 0;
      const out: string[] = [];
      for (let n = dto.rangeStart; n <= dto.rangeEnd; n++) {
        const num = pad > 0 ? String(n).padStart(pad, '0') : String(n);
        const value = `${prefix}${num}`;
        if (value.length <= 30) out.push(value);
      }
      return out;
    }
    return [];
  }

  private async ensureUniqueValue(scope: SmartCardScope, cardId: string, manager?: EntityManager): Promise<void> {
    const repo = manager ? manager.getRepository(SmartCardEntity) : this.cardRepo;
    const exists = await repo.exist({ where: { scope, cardId } });
    if (exists) {
      throw new ConflictException(`A ${scope} card with id '${cardId}' already exists.`);
    }
  }

  async updateCard(id: string, dto: UpdateSmartCardDto): Promise<SmartCardEntity> {
    const card = await this.cardRepo.findOne({ where: { id } });
    if (!card) throw new NotFoundException('Card not found.');

    if (dto.cardName !== undefined) card.cardName = dto.cardName;
    if (dto.cardType !== undefined) card.cardType = dto.cardType;
    if (dto.status !== undefined) {
      // Don't let an admin flip a currently-held card to AVAILABLE behind a user's back.
      if (card.status === SmartCardStatus.ASSIGNED_USER && dto.status === SmartCardStatus.AVAILABLE) {
        throw new BadRequestException('Card is held by a user. Revoke the assignment first.');
      }
      card.status = dto.status;
    }
    return this.cardRepo.save(card);
  }

  async deleteCard(id: string): Promise<void> {
    const card = await this.cardRepo.findOne({ where: { id } });
    if (!card) throw new NotFoundException('Card not found.');
    if (card.status === SmartCardStatus.ASSIGNED_USER) {
      throw new BadRequestException('Cannot delete a card currently held by a user.');
    }
    await this.cardRepo.delete({ id });
  }

  async listCards(query: ListSmartCardsQueryDto): Promise<{ items: SmartCardEntity[]; total: number; page: number; limit: number }> {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(query.limit) || 50));

    const qb = this.cardRepo.createQueryBuilder('c');
    if (query.scope) qb.andWhere('c.scope = :scope', { scope: query.scope });
    if (query.cardType) qb.andWhere('c.cardType = :cardType', { cardType: query.cardType });
    if (query.status) qb.andWhere('c.status = :status', { status: query.status });
    if (query.instituteId) qb.andWhere('c.instituteId = :iid', { iid: query.instituteId });
    if (query.classId) qb.andWhere('c.classId = :cid', { cid: query.classId });
    if (query.search) {
      qb.andWhere(
        new Brackets((b) => {
          b.where('c.cardName LIKE :s', { s: `%${query.search}%` }).orWhere('c.cardId LIKE :s', { s: `%${query.search}%` });
        }),
      );
    }
    qb.orderBy('c.id', 'DESC').skip((page - 1) * limit).take(limit);

    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, limit };
  }

  // ───────────────────────── Admin: allocation ─────────────────────────────

  /** Allocate AVAILABLE cards to an institute. Only free, unassigned cards move. */
  async assignCardsToInstitute(dto: AssignCardsToInstituteDto): Promise<{ moved: number; skipped: number }> {
    const cards = await this.cardRepo.find({ where: { id: In(dto.cardRowIds) } });
    let moved = 0;
    let skipped = 0;
    for (const card of cards) {
      if (card.status !== SmartCardStatus.AVAILABLE || card.assignedUserId) {
        skipped++;
        continue;
      }
      card.instituteId = dto.instituteId;
      card.classId = null;
      card.status = SmartCardStatus.ASSIGNED_INSTITUTE;
      moved++;
    }
    await this.cardRepo.save(cards.filter((c) => c.status === SmartCardStatus.ASSIGNED_INSTITUTE && c.instituteId === dto.instituteId));
    skipped += dto.cardRowIds.length - cards.length;
    return { moved, skipped };
  }

  /** Allocate an institute's cards to a class. Cards must already belong to an institute and be free. */
  async assignCardsToClass(instituteId: string, dto: AssignCardsToClassDto): Promise<{ moved: number; skipped: number }> {
    const cards = await this.cardRepo.find({ where: { id: In(dto.cardRowIds), instituteId } });
    const toSave: SmartCardEntity[] = [];
    let skipped = dto.cardRowIds.length - cards.length;
    for (const card of cards) {
      if (
        (card.status === SmartCardStatus.ASSIGNED_INSTITUTE || card.status === SmartCardStatus.ASSIGNED_CLASS) &&
        !card.assignedUserId
      ) {
        card.classId = dto.classId;
        card.status = SmartCardStatus.ASSIGNED_CLASS;
        toSave.push(card);
      } else {
        skipped++;
      }
    }
    await this.cardRepo.save(toSave);
    return { moved: toSave.length, skipped };
  }

  /**
   * Admin shortcut: assign all of an institute's cards whose cardId falls within
   * [cardIdMin, cardIdMax] (string ≤ comparison) to the given class.
   */
  async bulkAssignToClassByRange(
    instituteId: string,
    dto: BulkAssignToClassByRangeDto,
  ): Promise<{ moved: number; skipped: number }> {
    const cards = await this.cardRepo
      .createQueryBuilder('c')
      .where('c.instituteId = :iid', { iid: instituteId })
      .andWhere('c.cardId >= :min', { min: dto.cardIdMin })
      .andWhere('c.cardId <= :max', { max: dto.cardIdMax })
      .andWhere('c.status IN (:...free)', { free: [SmartCardStatus.ASSIGNED_INSTITUTE, SmartCardStatus.ASSIGNED_CLASS] })
      .getMany();

    const toSave: SmartCardEntity[] = [];
    for (const card of cards) {
      if (!card.assignedUserId) {
        card.classId = dto.classId;
        card.status = SmartCardStatus.ASSIGNED_CLASS;
        toSave.push(card);
      }
    }
    await this.cardRepo.save(toSave);
    return { moved: toSave.length, skipped: cards.length - toSave.length };
  }

  // ───────────────────────── Counts (institute admin) ──────────────────────

  /**
   * Admin-level: per-institute card stats across all institutes.
   * Returns an array of { instituteId, total, available, assignedToUser, byStatus }
   */
  async getAdminInstituteStats(): Promise<any[]> {
    const rows = await this.cardRepo
      .createQueryBuilder('c')
      .select('c.instituteId', 'instituteId')
      .addSelect('c.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .where('c.instituteId IS NOT NULL')
      .groupBy('c.instituteId')
      .addGroupBy('c.status')
      .getRawMany();

    const map = new Map<string, { instituteId: string; total: number; available: number; assignedToUser: number; onHand: number; byStatus: Record<string, number> }>();
    for (const r of rows) {
      if (!map.has(r.instituteId)) {
        map.set(r.instituteId, { instituteId: r.instituteId, total: 0, available: 0, assignedToUser: 0, onHand: 0, byStatus: {} });
      }
      const bucket = map.get(r.instituteId)!;
      const count = Number(r.count);
      bucket.total += count;
      bucket.byStatus[r.status] = (bucket.byStatus[r.status] || 0) + count;
      if (r.status === 'ASSIGNED_INSTITUTE' || r.status === 'ASSIGNED_CLASS') {
        bucket.onHand += count;
      }
      if (r.status === 'ASSIGNED_USER') {
        bucket.assignedToUser += count;
      }
      if (r.status === 'AVAILABLE') {
        bucket.available += count;
      }
    }
    return Array.from(map.values());
  }

  /** Institute admins only see counts — never the raw id list. */
  async getInstituteCounts(instituteId: string): Promise<Record<string, any>> {
    const rows = await this.cardRepo
      .createQueryBuilder('c')
      .select('c.scope', 'scope')
      .addSelect('c.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .where('c.instituteId = :iid', { iid: instituteId })
      .groupBy('c.scope')
      .addGroupBy('c.status')
      .getRawMany();

    const summary: Record<string, { total: number; available: number; assignedToUser: number; byStatus: Record<string, number> }> = {
      [SmartCardScope.GLOBAL]: { total: 0, available: 0, assignedToUser: 0, byStatus: {} },
      [SmartCardScope.INSTITUTE]: { total: 0, available: 0, assignedToUser: 0, byStatus: {} },
    };
    for (const r of rows) {
      const scope = r.scope as SmartCardScope;
      const count = Number(r.count);
      const bucket = summary[scope];
      if (!bucket) continue;
      bucket.total += count;
      bucket.byStatus[r.status] = count;
      // "Available to assign to a user" = sitting in the institute/class pool, not yet held.
      if (r.status === SmartCardStatus.ASSIGNED_INSTITUTE || r.status === SmartCardStatus.ASSIGNED_CLASS) {
        bucket.available += count;
      }
      if (r.status === SmartCardStatus.ASSIGNED_USER) bucket.assignedToUser += count;
    }
    return summary;
  }

  /** Institute admin search of THEIR pool (only cards belonging to the institute). */
  async searchInstitutePool(instituteId: string, query: ListSmartCardsQueryDto) {
    return this.listCards({ ...query, instituteId });
  }

  // ───────────────────────── Assign card → user ────────────────────────────

  /**
   * Assign one card to a user (institute admin or registration flow).
   *
   * Transactional reassignment:
   *   1. resolve the card — manual (validate cardValue ∈ institute pool & free) or auto (next available)
   *   2. deactivate the user's current active card OF THE SAME SCOPE and free it back to the pool
   *   3. mark the chosen card ASSIGNED_USER + record the active assignment row
   *   4. write the value to its destination (user.rfid for GLOBAL, institute_card_id for INSTITUTE)
   *
   * Returns the card that was assigned.
   */
  async assignCardToUser(
    instituteId: string,
    dto: AssignCardToUserDto,
    assignedBy?: string,
    manager?: EntityManager,
  ): Promise<SmartCardEntity> {
    const run = async (em: EntityManager): Promise<SmartCardEntity> => {
      const cardRepo = em.getRepository(SmartCardEntity);
      const assignRepo = em.getRepository(SmartCardAssignmentEntity);

      // 1. Resolve the card.
      let card: SmartCardEntity | null;
      if (dto.cardValue) {
        // MANUAL: must belong to this institute's pool for the scope and be free.
        card = await cardRepo
          .createQueryBuilder('c')
          .setLock('pessimistic_write')
          .where('c.instituteId = :iid', { iid: instituteId })
          .andWhere('c.scope = :scope', { scope: dto.scope })
          .andWhere('c.cardId = :val', { val: dto.cardValue })
          .getOne();
        if (!card) {
          throw new BadRequestException(`Card id '${dto.cardValue}' does not belong to your institute.`);
        }
        if (card.status === SmartCardStatus.ASSIGNED_USER && card.assignedUserId !== dto.userId) {
          throw new ConflictException(`Card '${dto.cardValue}' is already assigned to another user.`);
        }
        if (card.status === SmartCardStatus.INACTIVE) {
          throw new BadRequestException(`Card '${dto.cardValue}' is inactive.`);
        }
      } else {
        // AUTO: next available card in the institute (prefer the class pool when given).
        const qb = cardRepo
          .createQueryBuilder('c')
          .setLock('pessimistic_write')
          .where('c.instituteId = :iid', { iid: instituteId })
          .andWhere('c.scope = :scope', { scope: dto.scope })
          .andWhere('c.status IN (:...free)', { free: [SmartCardStatus.ASSIGNED_INSTITUTE, SmartCardStatus.ASSIGNED_CLASS] })
          .andWhere('c.assignedUserId IS NULL');
        if (dto.classId) qb.andWhere('c.classId = :cid', { cid: dto.classId });
        qb.orderBy('c.id', 'ASC');
        card = await qb.getOne();
        if (!card) {
          throw new BadRequestException(`No available ${dto.scope} smart card in your institute to auto-assign.`);
        }
      }

      // 2. Deactivate the user's current active card OF THE SAME SCOPE.
      const current = await assignRepo
        .createQueryBuilder('a')
        .innerJoin(SmartCardEntity, 'sc', 'sc.id = a.smartCardId')
        .where('a.userId = :uid', { uid: dto.userId })
        .andWhere('a.instituteId = :iid', { iid: instituteId })
        .andWhere('a.isActive = 1')
        .andWhere('sc.scope = :scope', { scope: dto.scope })
        .select('a')
        .getOne();

      if (current && current.smartCardId !== card.id) {
        current.isActive = false;
        current.revokedAt = new Date();
        current.revokeReason = 'Replaced by new card assignment';
        await assignRepo.save(current);
        // Free the old card back to the institute pool so it can be reused.
        await cardRepo.update(
          { id: current.smartCardId },
          { status: SmartCardStatus.ASSIGNED_INSTITUTE, assignedUserId: null, assignedAt: null, classId: card.classId ?? null },
        );
      }

      // If the same card was already active for this user, nothing else to do.
      if (current && current.smartCardId === card.id) {
        return card;
      }

      // 3. Mark chosen card held + record assignment.
      card.status = SmartCardStatus.ASSIGNED_USER;
      card.assignedUserId = dto.userId;
      card.assignedAt = new Date();
      await cardRepo.save(card);

      await assignRepo.save(
        assignRepo.create({
          smartCardId: card.id,
          cardValue: card.cardId,
          userId: dto.userId,
          instituteId,
          classId: card.classId ?? null,
          isActive: true,
          assignedBy: assignedBy ?? null,
        }),
      );

      // 4. Write the value to its destination.
      await this.writeCardValueToDestination(em, dto.scope, dto.userId, instituteId, card.cardId);

      return card;
    };

    return manager ? run(manager) : this.dataSource.transaction(run);
  }

  /** GLOBAL → user.rfid (unique). INSTITUTE → institute_user.institute_card_id (unique per institute). */
  private async writeCardValueToDestination(
    em: EntityManager,
    scope: SmartCardScope,
    userId: string,
    instituteId: string,
    value: string,
  ): Promise<void> {
    if (scope === SmartCardScope.GLOBAL) {
      // Enforce the global-unique rfid constraint with a friendly error.
      const clash = await em.getRepository(UserEntity).findOne({ where: { rfid: value }, select: ['id'] });
      if (clash && String(clash.id) !== String(userId)) {
        throw new ConflictException(`Suraksha card '${value}' is already linked to another user.`);
      }
      await em.getRepository(UserEntity).update({ id: userId as any }, { rfid: value });
    } else {
      const clash = await em
        .getRepository(InstituteUserEntity)
        .findOne({ where: { instituteId, instituteCardId: value } });
      if (clash && String(clash.userId) !== String(userId)) {
        throw new ConflictException(`Institute card '${value}' is already in use in this institute.`);
      }
      await em.getRepository(InstituteUserEntity).update({ instituteId, userId }, { instituteCardId: value });
    }
  }

  /** Revoke a user's active card of a scope, returning it to the institute pool. */
  async revokeUserCard(instituteId: string, userId: string, scope: SmartCardScope): Promise<{ revoked: boolean }> {
    return this.dataSource.transaction(async (em) => {
      const assignRepo = em.getRepository(SmartCardAssignmentEntity);
      const current = await assignRepo
        .createQueryBuilder('a')
        .innerJoin(SmartCardEntity, 'sc', 'sc.id = a.smartCardId')
        .where('a.userId = :uid', { uid: userId })
        .andWhere('a.instituteId = :iid', { iid: instituteId })
        .andWhere('a.isActive = 1')
        .andWhere('sc.scope = :scope', { scope })
        .select('a')
        .getOne();
      if (!current) return { revoked: false };

      current.isActive = false;
      current.revokedAt = new Date();
      current.revokeReason = 'Revoked by admin';
      await assignRepo.save(current);

      await em.getRepository(SmartCardEntity).update(
        { id: current.smartCardId },
        { status: SmartCardStatus.ASSIGNED_INSTITUTE, assignedUserId: null, assignedAt: null },
      );

      // Clear the destination value.
      if (scope === SmartCardScope.GLOBAL) {
        await em.getRepository(UserEntity).update({ id: userId as any }, { rfid: null as any });
      } else {
        await em.getRepository(InstituteUserEntity).update({ instituteId, userId }, { instituteCardId: null as any });
      }
      return { revoked: true };
    });
  }
}
