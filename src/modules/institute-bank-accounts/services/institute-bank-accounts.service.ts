import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InstituteBankAccountEntity } from '../entities/institute-bank-account.entity';

export interface CreateBankAccountDto {
  label: string;
  bankName: string;
  branch?: string;
  accountHolderName: string;
  accountNumber: string;
}

export interface UpdateBankAccountDto {
  label?: string;
  bankName?: string;
  branch?: string | null;
  accountHolderName?: string;
  accountNumber?: string;
  isActive?: boolean;
}

@Injectable()
export class InstituteBankAccountsService {
  constructor(
    @InjectRepository(InstituteBankAccountEntity)
    private readonly repo: Repository<InstituteBankAccountEntity>,
  ) {}

  async list(instituteId: string, includeInactive = false): Promise<InstituteBankAccountEntity[]> {
    const where: any = { instituteId };
    if (!includeInactive) where.isActive = true;
    return this.repo.find({ where, order: { createdAt: 'ASC' } });
  }

  async getOne(id: string, instituteId: string): Promise<InstituteBankAccountEntity> {
    const acc = await this.repo.findOne({ where: { id, instituteId } });
    if (!acc) throw new NotFoundException('Bank account not found');
    return acc;
  }

  async create(instituteId: string, dto: CreateBankAccountDto): Promise<InstituteBankAccountEntity> {
    const acc = this.repo.create({
      instituteId,
      label: dto.label.trim(),
      bankName: dto.bankName.trim(),
      branch: dto.branch?.trim() || null,
      accountHolderName: dto.accountHolderName.trim(),
      accountNumber: dto.accountNumber.trim(),
      isActive: true,
    });
    return this.repo.save(acc);
  }

  async update(id: string, instituteId: string, dto: UpdateBankAccountDto): Promise<InstituteBankAccountEntity> {
    const acc = await this.getOne(id, instituteId);
    if (dto.label !== undefined) acc.label = dto.label.trim();
    if (dto.bankName !== undefined) acc.bankName = dto.bankName.trim();
    if ('branch' in dto) acc.branch = dto.branch?.trim() || null;
    if (dto.accountHolderName !== undefined) acc.accountHolderName = dto.accountHolderName.trim();
    if (dto.accountNumber !== undefined) acc.accountNumber = dto.accountNumber.trim();
    if (dto.isActive !== undefined) acc.isActive = dto.isActive;
    return this.repo.save(acc);
  }

  async remove(id: string, instituteId: string): Promise<{ success: boolean }> {
    const acc = await this.getOne(id, instituteId);
    await this.repo.remove(acc);
    return { success: true };
  }
}
