import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager } from 'typeorm';
import { InstituteCreditsEntity } from '../entities/institute-credits.entity';
import {
  InstituteCreditTransactionEntity,
  CreditTransactionType,
} from '../entities/institute-credit-transaction.entity';
import {
  DeductCreditsDto,
  GrantCreditsDto,
  AdminAdjustCreditsDto,
  CreditTransactionFilterDto,
  CreditBalanceResponseDto,
  CreditTransactionListResponseDto,
  DeductCreditsResultDto,
  GrantCreditsResultDto,
} from '../dto/institute-credits.dto';
import { now, getCurrentSriLankaDate } from '../../../common/utils/timezone.util';

@Injectable()
export class InstituteCreditsService {
  private readonly logger = new Logger(InstituteCreditsService.name);

  constructor(
    @InjectRepository(InstituteCreditsEntity)
    private readonly creditsRepository: Repository<InstituteCreditsEntity>,
    @InjectRepository(InstituteCreditTransactionEntity)
    private readonly transactionRepository: Repository<InstituteCreditTransactionEntity>,
    private readonly dataSource: DataSource,
  ) {}

  // ═══════════════════════════════════════════════════════════════════
  // CREDIT BALANCE
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Get credit balance for an institute. Creates a zero-balance record if none exists.
   */
  async getBalance(instituteId: string): Promise<CreditBalanceResponseDto> {
    if (!instituteId) throw new BadRequestException('instituteId is required');

    const credits = await this.getOrCreateCredits(instituteId);
    return {
      instituteId: credits.instituteId,
      balance: Number(credits.balance),
      totalPurchased: Number(credits.totalPurchased),
      totalUsed: Number(credits.totalUsed),
      dailyUsed: Number(credits.dailyUsed),
      monthlyUsed: Number(credits.monthlyUsed),
      dailyLimit: credits.dailyLimit ? Number(credits.dailyLimit) : undefined,
      monthlyLimit: credits.monthlyLimit ? Number(credits.monthlyLimit) : undefined,
      isActive: credits.isActive,
    };
  }

  /**
   * Check if an institute has sufficient credits. Returns true/false without throwing.
   */
  async hasSufficientCredits(instituteId: string, required: number): Promise<boolean> {
    const credits = await this.creditsRepository.findOne({
      where: { instituteId, isActive: true },
      select: ['balance'],
    });
    return credits ? Number(credits.balance) >= required : false;
  }

  /**
   * Validate that an institute has enough credits. Throws ForbiddenException if not.
   * Always reads fresh from DB (no cache).
   */
  async validateSufficientCredits(instituteId: string, required: number): Promise<void> {
    const credits = await this.creditsRepository.findOne({
      where: { instituteId, isActive: true },
      select: ['balance'],
    });

    const available = credits ? Number(credits.balance) : 0;
    if (available < required) {
      throw new ForbiddenException(
        `Insufficient credits. Required: ${required}, Available: ${available}. Please top up your credits.`,
      );
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // DEDUCT CREDITS (atomic, race-condition safe)
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Deduct credits atomically using a DB transaction with pessimistic lock.
   * This is the ONLY way credits should be deducted.
   *
   * @returns DeductCreditsResultDto with new balance and transaction ID
   * @throws ForbiddenException if insufficient credits
   */
  async deductCredits(
    instituteId: string,
    dto: DeductCreditsDto,
    userId?: string,
  ): Promise<DeductCreditsResultDto> {
    if (!instituteId) throw new BadRequestException('instituteId is required');
    if (dto.amount <= 0) throw new BadRequestException('Deduction amount must be positive');

    return this.dataSource.transaction(async (manager) => {
      return this.deductCreditsWithManager(manager, instituteId, dto, userId);
    });
  }

  /**
   * Deduct credits within an existing transaction/entity manager.
   * Use this when you need to deduct credits as part of a larger transaction.
   */
  async deductCreditsWithManager(
    manager: EntityManager,
    instituteId: string,
    dto: DeductCreditsDto,
    userId?: string,
  ): Promise<DeductCreditsResultDto> {
    // Lock the credit record
    const credits = await manager.findOne(InstituteCreditsEntity, {
      where: { instituteId, isActive: true },
      lock: { mode: 'pessimistic_write' },
    });

    if (!credits) {
      throw new ForbiddenException(`No credit account found for institute ${instituteId}. Please contact support.`);
    }

    const balanceBefore = Number(credits.balance);
    if (balanceBefore < dto.amount) {
      throw new ForbiddenException(
        `Insufficient credits. Required: ${dto.amount}, Available: ${balanceBefore}. Please top up your credits.`,
      );
    }

    // Check daily/monthly limits
    this.checkUsageLimits(credits, dto.amount);

    // Deduct
    const timestamp = now();
    credits.balance = Number(credits.balance) - dto.amount;
    credits.totalUsed = Number(credits.totalUsed) + dto.amount;
    credits.dailyUsed = Number(credits.dailyUsed) + dto.amount;
    credits.monthlyUsed = Number(credits.monthlyUsed) + dto.amount;
    credits.updatedAt = timestamp;
    await manager.save(InstituteCreditsEntity, credits);

    // Record transaction
    const txn = manager.create(InstituteCreditTransactionEntity, {
      instituteId,
      type: dto.type,
      amount: -dto.amount, // negative for deductions
      balanceBefore,
      balanceAfter: Number(credits.balance),
      referenceType: dto.referenceType,
      referenceId: dto.referenceId,
      description: dto.description,
      createdBy: userId,
      createdAt: timestamp,
    });
    const savedTxn = await manager.save(InstituteCreditTransactionEntity, txn);

    this.logger.log(
      `💳 Credits deducted: institute=${instituteId} amount=${dto.amount} type=${dto.type} balance=${credits.balance}`,
    );

    return {
      success: true,
      creditsDeducted: dto.amount,
      balanceAfter: Number(credits.balance),
      transactionId: savedTxn.id,
    };
  }

  /**
   * Deduct credits using atomic SQL UPDATE (fire-and-forget, no transaction needed).
   * Use for high-throughput deductions (e.g., after SMS delivery confirmation).
   * Does NOT record a detailed ledger entry for performance — use deductCredits() for audited deductions.
   */
  async deductCreditsAtomic(instituteId: string, amount: number): Promise<void> {
    if (!amount || amount <= 0) {
      this.logger.error(`❌ Invalid atomic deduction amount: ${amount} for institute=${instituteId}`);
      return;
    }
    const safeAmount = Math.abs(Number(amount));
    const result = await this.creditsRepository
      .createQueryBuilder()
      .update(InstituteCreditsEntity)
      .set({
        balance: () => `GREATEST(balance - :amt, 0)`,
        totalUsed: () => `total_used + :amt`,
        dailyUsed: () => `daily_used + :amt`,
        monthlyUsed: () => `monthly_used + :amt`,
        updatedAt: now(),
      })
      .where('institute_id = :instituteId AND is_active = true', { instituteId })
      .setParameter('amt', safeAmount)
      .execute();

    if (result.affected === 0) {
      this.logger.error(`❌ Atomic credit deduction failed: institute=${instituteId} amount=${amount}`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // GRANT CREDITS (for payment verification, admin adjustments)
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Grant credits to an institute. Creates the credit account if it doesn't exist.
   * Used by payment verification flow and admin adjustments.
   */
  async grantCredits(
    instituteId: string,
    dto: GrantCreditsDto,
    userId?: string,
  ): Promise<GrantCreditsResultDto> {
    if (!instituteId) throw new BadRequestException('instituteId is required');
    if (dto.amount <= 0) throw new BadRequestException('Grant amount must be positive');

    return this.dataSource.transaction(async (manager) => {
      return this.grantCreditsWithManager(manager, instituteId, dto, userId);
    });
  }

  /**
   * Grant credits within an existing transaction/entity manager.
   * Use this when granting credits as part of a larger transaction (e.g., payment verification).
   */
  async grantCreditsWithManager(
    manager: EntityManager,
    instituteId: string,
    dto: GrantCreditsDto,
    userId?: string,
  ): Promise<GrantCreditsResultDto> {
    // Lock or create
    let credits = await manager.findOne(InstituteCreditsEntity, {
      where: { instituteId },
      lock: { mode: 'pessimistic_write' },
    });

    const timestamp = now();
    const balanceBefore = credits ? Number(credits.balance) : 0;

    if (!credits) {
      credits = manager.create(InstituteCreditsEntity, {
        instituteId,
        balance: dto.amount,
        totalPurchased: dto.amount,
        totalUsed: 0,
        dailyUsed: 0,
        monthlyUsed: 0,
        isActive: true,
        lastTopupAmount: dto.amount,
        lastTopupAt: timestamp,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    } else {
      credits.balance = Number(credits.balance) + dto.amount;
      credits.totalPurchased = Number(credits.totalPurchased) + dto.amount;
      credits.lastTopupAmount = dto.amount;
      credits.lastTopupAt = timestamp;
      credits.updatedAt = timestamp;
    }

    await manager.save(InstituteCreditsEntity, credits);

    // Record transaction
    const txn = manager.create(InstituteCreditTransactionEntity, {
      instituteId,
      type: dto.type,
      amount: dto.amount, // positive for additions
      balanceBefore,
      balanceAfter: Number(credits.balance),
      referenceType: dto.referenceType,
      referenceId: dto.referenceId,
      description: dto.description,
      createdBy: userId,
      createdAt: timestamp,
    });
    const savedTxn = await manager.save(InstituteCreditTransactionEntity, txn);

    this.logger.log(
      `✅ Credits granted: institute=${instituteId} amount=${dto.amount} type=${dto.type} balance=${credits.balance}`,
    );

    return {
      success: true,
      creditsGranted: dto.amount,
      balanceAfter: Number(credits.balance),
      transactionId: savedTxn.id,
    };
  }

  /**
   * Admin manual credit adjustment (can be positive or negative).
   */
  async adminAdjustCredits(
    instituteId: string,
    dto: AdminAdjustCreditsDto,
    adminUserId: string,
  ): Promise<GrantCreditsResultDto | DeductCreditsResultDto> {
    if (dto.amount === 0) throw new BadRequestException('Adjustment amount cannot be zero');

    if (dto.amount > 0) {
      return this.grantCredits(instituteId, {
        amount: dto.amount,
        type: CreditTransactionType.ADMIN_ADJUSTMENT,
        referenceType: 'ADMIN',
        referenceId: adminUserId,
        description: dto.description || `Admin adjustment: +${dto.amount} credits`,
      }, adminUserId);
    } else {
      return this.deductCredits(instituteId, {
        amount: Math.abs(dto.amount),
        type: CreditTransactionType.ADMIN_ADJUSTMENT,
        referenceType: 'ADMIN',
        referenceId: adminUserId,
        description: dto.description || `Admin adjustment: ${dto.amount} credits`,
      }, adminUserId);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // TRANSACTION HISTORY
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Get paginated credit transaction history for an institute.
   */
  async getTransactions(
    instituteId: string,
    filters: CreditTransactionFilterDto,
  ): Promise<CreditTransactionListResponseDto> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const skip = (page - 1) * limit;

    const qb = this.transactionRepository
      .createQueryBuilder('t')
      .where('t.institute_id = :instituteId', { instituteId })
      .orderBy('t.created_at', 'DESC')
      .skip(skip)
      .take(limit);

    if (filters.type) {
      qb.andWhere('t.type = :type', { type: filters.type });
    }
    if (filters.startDate) {
      qb.andWhere('t.created_at >= :startDate', { startDate: filters.startDate });
    }
    if (filters.endDate) {
      qb.andWhere('t.created_at <= :endDate', { endDate: filters.endDate });
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }

  // ═══════════════════════════════════════════════════════════════════
  // INTERNAL HELPERS
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Get or create a credit record for an institute.
   */
  private async getOrCreateCredits(instituteId: string): Promise<InstituteCreditsEntity> {
    let credits = await this.creditsRepository.findOne({ where: { instituteId } });
    if (!credits) {
      const timestamp = now();
      try {
        credits = this.creditsRepository.create({
          instituteId,
          balance: 0,
          totalPurchased: 0,
          totalUsed: 0,
          dailyUsed: 0,
          monthlyUsed: 0,
          isActive: true,
          createdAt: timestamp,
          updatedAt: timestamp,
        });
        credits = await this.creditsRepository.save(credits);
      } catch (error: any) {
        // Handle race condition: another request may have inserted concurrently
        if (error?.code === 'ER_DUP_ENTRY' || error?.message?.includes('Duplicate')) {
          credits = await this.creditsRepository.findOne({ where: { instituteId } });
          if (!credits) throw error; // Re-throw if still not found
        } else {
          throw error;
        }
      }
    }
    return credits;
  }

  /**
   * Check daily and monthly usage limits.
   */
  private checkUsageLimits(credits: InstituteCreditsEntity, amount: number): void {
    if (credits.dailyLimit && (Number(credits.dailyUsed) + amount) > Number(credits.dailyLimit)) {
      throw new ForbiddenException(
        `Daily credit limit exceeded. Limit: ${credits.dailyLimit}, Used: ${credits.dailyUsed}, Requested: ${amount}`,
      );
    }
    if (credits.monthlyLimit && (Number(credits.monthlyUsed) + amount) > Number(credits.monthlyLimit)) {
      throw new ForbiddenException(
        `Monthly credit limit exceeded. Limit: ${credits.monthlyLimit}, Used: ${credits.monthlyUsed}, Requested: ${amount}`,
      );
    }
  }

  /**
   * Reset daily usage counters.
   * Should be called by a daily cron job.
   */
  async resetDailyCounters(): Promise<number> {
    const today = getCurrentSriLankaDate();
    const result = await this.creditsRepository
      .createQueryBuilder()
      .update(InstituteCreditsEntity)
      .set({ dailyUsed: 0, lastDailyReset: today, updatedAt: now() })
      .where('last_daily_reset IS NULL OR last_daily_reset < :today', { today })
      .execute();
    return result.affected ?? 0;
  }

  /**
   * Reset monthly usage counters.
   * Should be called by a monthly cron job (1st of each month).
   */
  async resetMonthlyCounters(): Promise<number> {
    const todayStr = getCurrentSriLankaDate();
    const firstOfMonth = todayStr.slice(0, 7) + '-01';
    const result = await this.creditsRepository
      .createQueryBuilder()
      .update(InstituteCreditsEntity)
      .set({ monthlyUsed: 0, lastMonthlyReset: firstOfMonth, updatedAt: now() })
      .where('last_monthly_reset IS NULL OR last_monthly_reset < :firstOfMonth', { firstOfMonth })
      .execute();
    return result.affected ?? 0;
  }
}
