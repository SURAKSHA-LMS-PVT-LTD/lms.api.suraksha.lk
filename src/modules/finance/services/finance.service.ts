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
  LedgerQueryDto, AnalyticsQueryDto,
} from '../dto/finance.dto';

function add(a: string, b: string): string {
  return (parseFloat(a) + parseFloat(b)).toFixed(2);
}
function sub(a: string, b: string): string {
  return (parseFloat(a) - parseFloat(b)).toFixed(2);
}
function pct(amount: string, percent: string): string {
  return ((parseFloat(amount) * parseFloat(percent)) / 100).toFixed(2);
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
      .orderBy('l.created_at', 'DESC');

    if (query.startDate) qb.andWhere('l.created_at >= :start', { start: query.startDate });
    if (query.endDate)   qb.andWhere('l.created_at <= :end',   { end: query.endDate + ' 23:59:59' });
    if (query.createdByUserId) qb.andWhere('l.created_by_user_id = :uid', { uid: query.createdByUserId });
    if (query.teacherId)  qb.andWhere('l.teacher_id = :tid',   { tid: query.teacherId });
    if (query.accountId)  qb.andWhere('(l.to_account_id = :aid OR l.from_account_id = :aid)', { aid: query.accountId });
    if (query.categoryId) qb.andWhere('l.category_id = :cid',  { cid: query.categoryId });
    if (query.type)       qb.andWhere('l.type = :type',        { type: query.type });

    const page  = query.page  ?? 1;
    const limit = query.limit ?? 50;
    qb.skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();
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
    const fmt = formatMap[period];

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

    const totalIncome  = rows.reduce((s: number, r: any) => s + parseFloat(r.income  || 0), 0);
    const totalExpense = rows.reduce((s: number, r: any) => s + parseFloat(r.expense || 0), 0);
    return { period, data: rows, summary: { totalIncome: totalIncome.toFixed(2), totalExpense: totalExpense.toFixed(2), net: (totalIncome - totalExpense).toFixed(2) } };
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
