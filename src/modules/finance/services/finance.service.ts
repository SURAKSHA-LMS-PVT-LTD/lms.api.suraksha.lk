import {
  Injectable, NotFoundException, BadRequestException, Logger,
} from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager } from 'typeorm';
import { FinanceAccountEntity, FinanceAccountType } from '../entities/finance-account.entity';
import { FinanceCategoryEntity } from '../entities/finance-category.entity';
import { TeacherWalletEntity } from '../entities/teacher-wallet.entity';
import { FinanceLedgerEntity, LedgerEntryType, LedgerTxSource } from '../entities/finance-ledger.entity';
import {
  CreateFinanceAccountDto, UpdateFinanceAccountDto, SettleFundsDto,
  CreateFinanceCategoryDto, UpdateFinanceCategoryDto,
  CollectPhysicalPaymentDto, ApproveWithFinanceDto,
  TeacherPayoutDto, TeacherDeductionDto,
  TeacherAdvanceDto, ManualRecordDto,
  LedgerQueryDto, AnalyticsQueryDto,
} from '../dto/finance.dto';

// Integer-cents arithmetic avoids IEEE-754 float precision errors (e.g. 0.1+0.2≠0.3).
// All intermediate ops are done in integer cents; result is rounded to 2 dp.
function toCents(v: string): number {
  return Math.round(parseFloat(v) * 100);
}
function fromCents(c: number): string {
  return (c / 100).toFixed(2);
}
function add(a: string, b: string): string {
  return fromCents(toCents(a) + toCents(b));
}
function sub(a: string, b: string): string {
  return fromCents(toCents(a) - toCents(b));
}
function pct(amount: string, percent: string): string {
  // Multiply cents by percent then divide by 100 (integer division, rounded)
  return fromCents(Math.round((toCents(amount) * parseFloat(percent)) / 100));
}

@Injectable()
export class FinanceService {
  private readonly logger = new Logger(FinanceService.name);

  constructor(
    @InjectRepository(FinanceAccountEntity)   private accountRepo: Repository<FinanceAccountEntity>,
    @InjectRepository(FinanceCategoryEntity)  private categoryRepo: Repository<FinanceCategoryEntity>,
    @InjectRepository(TeacherWalletEntity)    private walletRepo: Repository<TeacherWalletEntity>,
    @InjectRepository(FinanceLedgerEntity)    private ledgerRepo: Repository<FinanceLedgerEntity>,
    @InjectDataSource()                        private dataSource: DataSource,
  ) {}

  // ─── Account helpers ─────────────────────────────────────────────

  private async creditAccount(manager: EntityManager, accountId: string, amount: string) {
    const account = await manager.findOne(FinanceAccountEntity, { where: { id: accountId } });
    if (!account) throw new NotFoundException(`Finance account ${accountId} not found`);
    account.currentBalance = add(account.currentBalance, amount);
    await manager.save(account);
    return account;
  }

  private async debitAccount(manager: EntityManager, accountId: string, amount: string) {
    const account = await manager.findOne(FinanceAccountEntity, { where: { id: accountId } });
    if (!account) throw new NotFoundException(`Finance account ${accountId} not found`);
    if (parseFloat(account.currentBalance) < parseFloat(amount)) {
      throw new BadRequestException(`Insufficient balance in account "${account.name}"`);
    }
    account.currentBalance = sub(account.currentBalance, amount);
    await manager.save(account);
    return account;
  }

  private async upsertTeacherWallet(
    manager: EntityManager,
    teacherId: string,
    instituteId: string,
    earned: string,
  ): Promise<TeacherWalletEntity> {
    let wallet = await manager.findOne(TeacherWalletEntity, { where: { teacherId, instituteId } });
    if (!wallet) {
      wallet = manager.create(TeacherWalletEntity, {
        teacherId, instituteId, balance: '0.00', totalEarned: '0.00', totalDeductions: '0.00', totalPaidOut: '0.00',
      });
    }
    wallet.balance      = add(wallet.balance, earned);
    wallet.totalEarned  = add(wallet.totalEarned, earned);
    await manager.save(wallet);
    return wallet;
  }

  private async recordLedger(manager: EntityManager, entry: Partial<FinanceLedgerEntity>): Promise<FinanceLedgerEntity> {
    const row = manager.create(FinanceLedgerEntity, entry);
    return manager.save(row);
  }

  // ─── Accounts CRUD ───────────────────────────────────────────────

  async createAccount(dto: CreateFinanceAccountDto, instituteId: string): Promise<FinanceAccountEntity> {
    const account = this.accountRepo.create({ ...dto, instituteId, currentBalance: '0.00' });
    return this.accountRepo.save(account);
  }

  async updateAccount(accountId: string, dto: UpdateFinanceAccountDto, instituteId: string): Promise<FinanceAccountEntity> {
    const account = await this.accountRepo.findOne({ where: { id: accountId, instituteId } });
    if (!account) throw new NotFoundException('Finance account not found');
    Object.assign(account, dto);
    return this.accountRepo.save(account);
  }

  async getAccounts(instituteId: string): Promise<FinanceAccountEntity[]> {
    return this.accountRepo.find({ where: { instituteId, isActive: true }, order: { createdAt: 'ASC' } });
  }

  async getAllAccounts(instituteId: string): Promise<FinanceAccountEntity[]> {
    return this.accountRepo.find({ where: { instituteId }, order: { createdAt: 'ASC' } });
  }

  // ─── Categories CRUD ─────────────────────────────────────────────

  async createCategory(dto: CreateFinanceCategoryDto, instituteId: string): Promise<FinanceCategoryEntity> {
    const cat = this.categoryRepo.create({ ...dto, instituteId });
    return this.categoryRepo.save(cat);
  }

  async updateCategory(categoryId: string, dto: UpdateFinanceCategoryDto, instituteId: string): Promise<FinanceCategoryEntity> {
    const cat = await this.categoryRepo.findOne({ where: { id: categoryId, instituteId } });
    if (!cat) throw new NotFoundException('Finance category not found');
    Object.assign(cat, dto);
    return this.categoryRepo.save(cat);
  }

  async getCategories(instituteId: string): Promise<FinanceCategoryEntity[]> {
    return this.categoryRepo.find({ where: { instituteId, isActive: true }, order: { name: 'ASC' } });
  }

  // ─── Physical collection ─────────────────────────────────────────

  async collectPhysical(dto: CollectPhysicalPaymentDto, userId: string, createdByName: string, instituteId: string) {
    const amount = dto.amount.toFixed(2);
    return this.dataSource.transaction(async manager => {
      await this.creditAccount(manager, dto.targetAccountId, amount);
      await this.recordLedger(manager, {
        instituteId,
        amount,
        type: LedgerEntryType.CREDIT,
        txSource: LedgerTxSource.PHYSICAL_COLLECT,
        toAccountId: dto.targetAccountId,
        categoryId: dto.categoryId,
        studentId: dto.studentId,
        studentName: dto.studentName,
        referenceId: dto.classId,
        description: dto.description,
        adminNote: dto.adminNote,
        createdByUserId: userId,
        createdByName,
      });
    });
  }

  // ─── Settle funds between accounts ───────────────────────────────

  async settleFunds(dto: SettleFundsDto, userId: string, createdByName: string, instituteId: string) {
    const amount = dto.amount.toFixed(2);
    return this.dataSource.transaction(async manager => {
      await this.debitAccount(manager, dto.fromAccountId, amount);
      await this.creditAccount(manager, dto.toAccountId, amount);
      await this.recordLedger(manager, {
        instituteId,
        amount,
        type: LedgerEntryType.DEBIT,
        txSource: LedgerTxSource.FUND_TRANSFER,
        fromAccountId: dto.fromAccountId,
        toAccountId: dto.toAccountId,
        description: dto.description,
        adminNote: dto.adminNote,
        createdByUserId: userId,
        createdByName,
      });
    });
  }

  // ─── Payment approval split ───────────────────────────────────────

  async processSplit(params: {
    paymentAmount: number;
    targetAccountId: string;
    teacherId?: string;
    classCommissionPct?: number;
    commissionPctOverride?: number;
    referenceId?: string;
    studentId?: string;
    studentName?: string;
    description?: string;
    notes?: string;
    userId: string;
    createdByName: string;
    instituteId: string;
  }) {
    const { paymentAmount, targetAccountId, teacherId, userId, createdByName, instituteId } = params;
    const totalAmount = paymentAmount.toFixed(2);
    const effectivePct = (params.commissionPctOverride ?? params.classCommissionPct ?? 0).toFixed(2);
    const teacherCut = teacherId ? pct(totalAmount, effectivePct) : '0.00';
    const instituteCut = sub(totalAmount, teacherCut);

    await this.dataSource.transaction(async manager => {
      await this.creditAccount(manager, targetAccountId, totalAmount);

      if (teacherId && parseFloat(teacherCut) > 0) {
        await this.upsertTeacherWallet(manager, teacherId, instituteId, teacherCut);
      }

      await this.recordLedger(manager, {
        instituteId,
        amount: totalAmount,
        type: LedgerEntryType.CREDIT,
        txSource: LedgerTxSource.PAYMENT_APPROVAL,
        toAccountId: targetAccountId,
        teacherId,
        teacherAmount: teacherCut,
        instituteAmount: instituteCut,
        commissionPct: effectivePct,
        referenceId: params.referenceId,
        studentId: params.studentId,
        studentName: params.studentName,
        description: params.description || params.notes,
        createdByUserId: userId,
        createdByName,
      });
    });
  }

  // ─── Teacher payout ───────────────────────────────────────────────

  async payoutTeacher(dto: TeacherPayoutDto, userId: string, createdByName: string, instituteId: string) {
    const amount = dto.amount.toFixed(2);
    return this.dataSource.transaction(async manager => {
      const wallet = await manager.findOne(TeacherWalletEntity, { where: { teacherId: dto.teacherId, instituteId } });
      if (!wallet) throw new NotFoundException('Teacher wallet not found');
      if (parseFloat(wallet.balance) < parseFloat(amount)) {
        throw new BadRequestException('Teacher wallet balance insufficient for this payout');
      }

      wallet.balance     = sub(wallet.balance, amount);
      wallet.totalPaidOut = add(wallet.totalPaidOut, amount);
      await manager.save(wallet);

      await this.debitAccount(manager, dto.fromAccountId, amount);

      await this.recordLedger(manager, {
        instituteId,
        amount,
        type: LedgerEntryType.DEBIT,
        txSource: LedgerTxSource.TEACHER_PAYOUT,
        fromAccountId: dto.fromAccountId,
        teacherId: dto.teacherId,
        teacherAmount: amount,
        description: dto.description,
        adminNote: dto.adminNote,
        createdByUserId: userId,
        createdByName,
      });
    });
  }

  // ─── Teacher deduction ────────────────────────────────────────────

  async deductTeacher(dto: TeacherDeductionDto, userId: string, createdByName: string, instituteId: string) {
    const amount = dto.amount.toFixed(2);
    return this.dataSource.transaction(async manager => {
      const wallet = await manager.findOne(TeacherWalletEntity, { where: { teacherId: dto.teacherId, instituteId } });
      if (!wallet) throw new NotFoundException('Teacher wallet not found');
      if (parseFloat(wallet.balance) < parseFloat(amount)) {
        throw new BadRequestException('Teacher wallet balance insufficient for deduction');
      }

      wallet.balance        = sub(wallet.balance, amount);
      wallet.totalDeductions = add(wallet.totalDeductions, amount);
      await manager.save(wallet);

      if (dto.toAccountId) {
        await this.creditAccount(manager, dto.toAccountId, amount);
      }

      await this.recordLedger(manager, {
        instituteId,
        amount,
        type: LedgerEntryType.DEBIT,
        txSource: LedgerTxSource.TEACHER_DEDUCTION,
        toAccountId: dto.toAccountId,
        categoryId: dto.categoryId,
        teacherId: dto.teacherId,
        teacherAmount: amount,
        adminNote: dto.adminNote,
        createdByUserId: userId,
        createdByName,
      });
    });
  }

  // ─── Ledger query ─────────────────────────────────────────────────

  async getLedger(query: LedgerQueryDto, instituteId: string) {
    const qb = this.ledgerRepo.createQueryBuilder('l')
      .where('l.institute_id = :instituteId', { instituteId })
      .leftJoinAndSelect('l.toAccount', 'toAcc')
      .leftJoinAndSelect('l.fromAccount', 'fromAcc')
      .leftJoinAndSelect('l.category', 'cat')
      .orderBy('l.createdAt', 'DESC');

    if (query.startDate) qb.andWhere('l.created_at >= :start', { start: query.startDate });
    if (query.endDate)   qb.andWhere('l.created_at <= :end',   { end: query.endDate + ' 23:59:59' });
    if (query.createdByUserId) qb.andWhere('l.created_by_user_id = :uid', { uid: query.createdByUserId });
    if (query.teacherId)  qb.andWhere('l.teacher_id = :tid',   { tid: query.teacherId });
    if (query.accountId)  qb.andWhere('(l.to_account_id = :aid OR l.from_account_id = :aid)', { aid: query.accountId });
    if (query.categoryId) qb.andWhere('l.category_id = :cid',  { cid: query.categoryId });
    if (query.type)       qb.andWhere('l.type = :type',        { type: query.type });
    if (query.txSource)   qb.andWhere('l.tx_source = :txSource', { txSource: query.txSource });

    const page  = query.page  ?? 1;
    const limit = query.limit ?? 50;
    qb.skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();

    // Resolve createdByName for any rows where it was not stored (legacy entries)
    const missingNameIds = [...new Set(
      data.filter(r => !r.createdByName && r.createdByUserId).map(r => r.createdByUserId)
    )];
    if (missingNameIds.length > 0) {
      const rows: { id: string; name_with_initials: string }[] = await this.dataSource.query(
        `SELECT id, name_with_initials FROM users WHERE id IN (${missingNameIds.map(() => '?').join(',')})`,
        missingNameIds,
      );
      const nameMap = new Map(rows.map(r => [String(r.id), r.name_with_initials]));
      data.forEach(r => {
        if (!r.createdByName && r.createdByUserId) {
          r.createdByName = nameMap.get(String(r.createdByUserId)) || r.createdByUserId;
        }
      });
    }

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  // ─── Analytics ───────────────────────────────────────────────────

  async getAnalytics(query: AnalyticsQueryDto, instituteId: string) {
    const period = query.period ?? 'monthly';
    const formatMap: Record<string, string> = {
      daily:   '%Y-%m-%d',
      weekly:  '%Y-%u',
      monthly: '%Y-%m',
      yearly:  '%Y',
    };
    const fmt = formatMap[period] ?? formatMap['monthly'];

    let sql = `
      SELECT DATE_FORMAT(created_at, '${fmt}') AS period,
             SUM(CASE WHEN type = 'CREDIT' THEN amount ELSE 0 END) AS income,
             SUM(CASE WHEN type = 'DEBIT'  THEN amount ELSE 0 END) AS expense
      FROM finance_ledger
      WHERE institute_id = ?
    `;
    const params: any[] = [instituteId];
    if (query.startDate) { sql += ' AND created_at >= ?'; params.push(query.startDate); }
    if (query.endDate)   { sql += ' AND created_at <= ?'; params.push(query.endDate + ' 23:59:59'); }
    sql += ` GROUP BY period ORDER BY period`;

    const rows = await this.dataSource.query(sql, params);

    let srcSql = `
      SELECT tx_source AS source,
             SUM(CASE WHEN type = 'CREDIT' THEN amount ELSE 0 END) AS income,
             SUM(CASE WHEN type = 'DEBIT'  THEN amount ELSE 0 END) AS expense
      FROM finance_ledger WHERE institute_id = ?
    `;
    const srcParams: any[] = [instituteId];
    if (query.startDate) { srcSql += ' AND created_at >= ?'; srcParams.push(query.startDate); }
    if (query.endDate)   { srcSql += ' AND created_at <= ?'; srcParams.push(query.endDate + ' 23:59:59'); }
    srcSql += ' GROUP BY tx_source';
    const bySource = await this.dataSource.query(srcSql, srcParams);

    const totalIncome  = rows.reduce((s: number, r: any) => s + parseFloat(r.income  || 0), 0);
    const totalExpense = rows.reduce((s: number, r: any) => s + parseFloat(r.expense || 0), 0);
    return { period, data: rows, bySource, summary: { totalIncome: totalIncome.toFixed(2), totalExpense: totalExpense.toFixed(2), net: (totalIncome - totalExpense).toFixed(2) } };
  }

  // ─── Analytics by Category ────────────────────────────────────────

  async getAnalyticsByCategory(query: AnalyticsQueryDto, instituteId: string) {
    let sql = `
      SELECT c.name AS category, c.type AS categoryType,
             SUM(l.amount) AS total
      FROM finance_ledger l
      LEFT JOIN finance_categories c ON l.category_id = c.id
      WHERE l.institute_id = ?
    `;
    const params: any[] = [instituteId];
    if (query.startDate) { sql += ' AND l.created_at >= ?'; params.push(query.startDate); }
    if (query.endDate)   { sql += ' AND l.created_at <= ?'; params.push(query.endDate + ' 23:59:59'); }
    sql += ' GROUP BY l.category_id, c.name, c.type ORDER BY total DESC';
    const rows = await this.dataSource.query(sql, params);
    return { data: rows };
  }

  // ─── Institute payment physical collect (no commission split) ────────

  async recordInstitutePaymentCollect(params: {
    paymentAmount: number;
    targetAccountId: string;
    referenceId?: string;
    studentId?: string;
    studentName?: string;
    description?: string;
    notes?: string;
    userId: string;
    createdByName: string;
    instituteId: string;
  }) {
    const amount = params.paymentAmount.toFixed(2);
    await this.dataSource.transaction(async manager => {
      await this.creditAccount(manager, params.targetAccountId, amount);
      await this.recordLedger(manager, {
        instituteId: params.instituteId,
        amount,
        type: LedgerEntryType.CREDIT,
        txSource: LedgerTxSource.PHYSICAL_COLLECT,
        toAccountId: params.targetAccountId,
        referenceId: params.referenceId,
        studentId: params.studentId,
        studentName: params.studentName,
        description: params.description || params.notes,
        createdByUserId: params.userId,
        createdByName: params.createdByName,
      });
    });
  }

  // ─── Teacher wallet top-up ───────────────────────────────────────

  async topupTeacherWallet(dto: { teacherId: string; amount: number; fromAccountId: string; description: string; adminNote?: string }, userId: string, createdByName: string, instituteId: string) {
    const amount = dto.amount.toFixed(2);
    return this.dataSource.transaction(async manager => {
      await this.debitAccount(manager, dto.fromAccountId, amount);

      let wallet = await manager.findOne(TeacherWalletEntity, { where: { teacherId: dto.teacherId, instituteId } });
      if (!wallet) throw new NotFoundException('Teacher wallet not found. Initialize the wallet first.');

      wallet.balance     = add(wallet.balance, amount);
      wallet.totalEarned = add(wallet.totalEarned, amount);
      await manager.save(wallet);

      await this.recordLedger(manager, {
        instituteId,
        amount,
        type: LedgerEntryType.CREDIT,
        txSource: LedgerTxSource.TEACHER_TOPUP,
        fromAccountId: dto.fromAccountId,
        teacherId: dto.teacherId,
        teacherAmount: amount,
        description: dto.description,
        adminNote: dto.adminNote,
        createdByUserId: userId,
        createdByName,
      });
    });
  }

  // ─── Teacher advance ──────────────────────────────────────────────

  async giveTeacherAdvance(dto: TeacherAdvanceDto, userId: string, createdByName: string, instituteId: string) {
    const amount = dto.amount.toFixed(2);
    return this.dataSource.transaction(async manager => {
      await this.debitAccount(manager, dto.fromAccountId, amount);

      let wallet = await manager.findOne(TeacherWalletEntity, { where: { teacherId: dto.teacherId, instituteId } });
      if (!wallet) {
        wallet = manager.create(TeacherWalletEntity, {
          teacherId: dto.teacherId, instituteId,
          balance: '0.00', totalEarned: '0.00', totalDeductions: '0.00', totalPaidOut: '0.00',
        });
      }
      wallet.balance = add(wallet.balance, amount);
      await manager.save(wallet);

      await this.recordLedger(manager, {
        instituteId,
        amount,
        type: LedgerEntryType.DEBIT,
        txSource: LedgerTxSource.TEACHER_ADVANCE,
        fromAccountId: dto.fromAccountId,
        teacherId: dto.teacherId,
        teacherAmount: amount,
        description: dto.description,
        adminNote: dto.adminNote,
        createdByUserId: userId,
        createdByName,
      });
    });
  }

  // ─── Manual record ────────────────────────────────────────────────

  async addManualRecord(dto: ManualRecordDto, userId: string, createdByName: string, instituteId: string) {
    const amount = dto.amount.toFixed(2);
    const isIncome = dto.recordType === 'INCOME';
    return this.dataSource.transaction(async manager => {
      if (isIncome) {
        await this.creditAccount(manager, dto.accountId, amount);
      } else {
        await this.debitAccount(manager, dto.accountId, amount);
      }

      const row = manager.create(FinanceLedgerEntity, {
        instituteId,
        amount,
        type: isIncome ? LedgerEntryType.CREDIT : LedgerEntryType.DEBIT,
        txSource: LedgerTxSource.MANUAL,
        toAccountId:   isIncome ? dto.accountId : undefined,
        fromAccountId: isIncome ? undefined : dto.accountId,
        categoryId: dto.categoryId,
        description: dto.description,
        adminNote: dto.adminNote,
        createdByUserId: userId,
        createdByName,
      });
      const saved = await manager.save(row);

      if (dto.recordDate) {
        await manager.query(
          'UPDATE finance_ledger SET created_at = ? WHERE id = ?',
          [dto.recordDate + ' 12:00:00', saved.id],
        );
      }
    });
  }

  // ─── Teachers summary ─────────────────────────────────────────────

  async getTeachersSummary(instituteId: string) {
    // Return ALL active teachers in the institute, with wallet data if it exists
    const rows = await this.dataSource.query(`
      SELECT
        u.id                                                                      AS teacherId,
        COALESCE(u.name_with_initials, CONCAT_WS(' ', u.first_name, u.last_name)) AS teacherName,
        u.email                                                                   AS teacherEmail,
        COALESCE(iu.institute_user_image_url, u.image_url)                        AS teacherImageUrl,
        iu.user_id_institue                                                       AS instituteUserId,
        w.id                                                                      AS walletId,
        w.balance,
        w.total_earned      AS totalEarned,
        w.total_deductions  AS totalDeductions,
        w.total_paid_out    AS totalPaidOut
      FROM institute_user iu
      JOIN users u         ON u.id = iu.user_id
      LEFT JOIN teacher_wallets w
             ON w.teacher_id = iu.user_id AND w.institute_id = iu.institute_id
      WHERE iu.institute_id = ?
        AND iu.institute_user_type = 'TEACHER'
        AND iu.status = 'ACTIVE'
        AND u.is_active = 1
      ORDER BY teacherName ASC
    `, [instituteId]);
    return { data: rows, total: rows.length };
  }

  async initTeacherWallet(teacherId: string, instituteId: string) {
    const existing = await this.walletRepo.findOne({ where: { teacherId, instituteId } });
    if (existing) return existing;
    const wallet = this.walletRepo.create({
      teacherId, instituteId,
      balance: '0.00', totalEarned: '0.00', totalDeductions: '0.00', totalPaidOut: '0.00',
    });
    return this.walletRepo.save(wallet);
  }

  // ─── Teacher wallet ───────────────────────────────────────────────

  async getTeacherWallet(teacherId: string, instituteId: string) {
    return this.walletRepo.findOne({ where: { teacherId, instituteId } });
  }

  async getTeacherLedger(teacherId: string, instituteId: string, query: LedgerQueryDto) {
    return this.getLedger({ ...query, teacherId }, instituteId);
  }

  // ─── Summary ─────────────────────────────────────────────────────

  async getSummary(instituteId: string) {
    const accounts = await this.getAccounts(instituteId);
    const totalBalance = accounts.reduce((s, a) => s + parseFloat(a.currentBalance), 0).toFixed(2);
    const cashBalance  = accounts.filter(a => a.type === FinanceAccountType.CASH).reduce((s, a) => s + parseFloat(a.currentBalance), 0).toFixed(2);
    const bankBalance  = accounts.filter(a => a.type === FinanceAccountType.BANK).reduce((s, a) => s + parseFloat(a.currentBalance), 0).toFixed(2);
    return { totalBalance, cashBalance, bankBalance, accounts };
  }
}
