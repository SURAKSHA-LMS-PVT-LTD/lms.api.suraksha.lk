import {
  Injectable, Logger, NotFoundException, ForbiddenException,
  BadRequestException, ConflictException,
} from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';

import { DesignTemplateEntity, DesignTemplateStatus, DesignOutputType } from './entities/design-template.entity';
import { DesignGenerationRecordEntity, GenerationRecordStatus } from './entities/design-generation-record.entity';
import { InstituteCreditsService } from '../notification-credits/services/institute-credits.service';
import { FeaturesService } from '../features/features.service';
import { CreditTransactionType } from '../notification-credits/entities/institute-credit-transaction.entity';
import { now } from '../../common/utils/timezone.util';
import { InstituteAccessValidator } from '../../common/helpers/institute-access-validator.helper';

// ─── DTOs ─────────────────────────────────────────────────────────────────────

export interface UpsertDesignTemplateDto {
  id?: string;                  // omit to create; provide to update
  name: string;
  definition: Record<string, any>;
}

export interface ApproveDesignTemplateDto {
  costPng: number;
  costPdf: number;
  costWhatsapp: number;
  costPrint: number;
  allowPng: boolean;
  allowPdf: boolean;
  allowWhatsapp: boolean;
  allowPrint: boolean;
  whatsappTtlDays?: number;
  adminNotes?: string;
}

export interface RejectDesignTemplateDto {
  rejectionReason: string;
  adminNotes?: string;
}

export interface PreviewCostResult {
  userCount: number;
  unitCost: number;
  totalCost: number;
  balance: number;
  sufficient: boolean;
}

export interface CommitGenerationResult {
  recordId: string;
  definition: Record<string, any>;
  transactionId: string;
  unitCost: number;
  totalCost: number;
}

const FEATURE_KEY = 'institute-designs';

@Injectable()
export class InstituteDesignsService {
  private readonly logger = new Logger(InstituteDesignsService.name);

  constructor(
    @InjectRepository(DesignTemplateEntity)
    private readonly templateRepo: Repository<DesignTemplateEntity>,
    @InjectRepository(DesignGenerationRecordEntity)
    private readonly recordRepo: Repository<DesignGenerationRecordEntity>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly creditsService: InstituteCreditsService,
    private readonly featuresService: FeaturesService,
  ) {}

  // ═══════════════════════════════════════════════════════════════════════════
  // INSTITUTE ADMIN — template CRUD
  // ═══════════════════════════════════════════════════════════════════════════

  async listTemplates(instituteId: string, user: any): Promise<DesignTemplateEntity[]> {
    InstituteAccessValidator.validateInstituteAccess(user, instituteId);
    await this.assertFeatureEnabled(instituteId);
    return this.templateRepo.find({
      where: { instituteId },
      order: { createdAt: 'DESC' },
      take: 500,
    });
  }

  async upsertTemplate(
    instituteId: string,
    dto: UpsertDesignTemplateDto,
    user: any,
  ): Promise<DesignTemplateEntity> {
    InstituteAccessValidator.validateInstituteAccess(user, instituteId);
    await this.assertFeatureEnabled(instituteId);

    if (!dto.name?.trim()) throw new BadRequestException('Template name is required');
    if (!dto.definition || typeof dto.definition !== 'object') {
      throw new BadRequestException('Template definition is required');
    }

    if (dto.id) {
      // Update existing
      const existing = await this.templateRepo.findOne({
        where: { id: dto.id, instituteId },
      });
      if (!existing) throw new NotFoundException(`Template ${dto.id} not found`);

      // PENDING means it's actively in the admin's review queue — locked until they decide.
      if (existing.status === DesignTemplateStatus.PENDING) {
        throw new ConflictException('Template is pending review and cannot be edited until reviewed');
      }

      // Any edit drops a non-draft template back to DRAFT; the institute admin must
      // explicitly submit it for review again via submitForReview().
      existing.name = dto.name.trim().substring(0, 255);
      existing.definition = dto.definition;
      existing.status = DesignTemplateStatus.DRAFT;
      existing.rejectionReason = undefined;
      existing.adminNotes = undefined;
      existing.reviewedBy = undefined;
      existing.reviewedAt = undefined;
      // Keep cost/allow fields from last approval — admin will re-review and re-set
      return this.templateRepo.save(existing);
    }

    // Create new — starts as DRAFT, freely editable until submitted for review
    const tpl = this.templateRepo.create({
      id: uuidv4(),
      instituteId,
      name: dto.name.trim().substring(0, 255),
      definition: dto.definition,
      status: DesignTemplateStatus.DRAFT,
      costPng: 0, costPdf: 0, costWhatsapp: 0, costPrint: 0,
      allowPng: false, allowPdf: false, allowWhatsapp: false, allowPrint: false,
    });
    return this.templateRepo.save(tpl);
  }

  /** Move a DRAFT template into the admin review queue. Locks it from further edits. */
  async submitForReview(instituteId: string, templateId: string, user: any): Promise<DesignTemplateEntity> {
    InstituteAccessValidator.validateInstituteAccess(user, instituteId);
    await this.assertFeatureEnabled(instituteId);

    const tpl = await this.templateRepo.findOne({ where: { id: templateId, instituteId } });
    if (!tpl) throw new NotFoundException(`Template ${templateId} not found`);
    if (tpl.status !== DesignTemplateStatus.DRAFT) {
      throw new ConflictException(`Only DRAFT templates can be submitted for review (status: ${tpl.status})`);
    }

    tpl.status = DesignTemplateStatus.PENDING;
    return this.templateRepo.save(tpl);
  }

  async deleteTemplate(instituteId: string, templateId: string, user: any): Promise<void> {
    InstituteAccessValidator.validateInstituteAccess(user, instituteId);
    await this.assertFeatureEnabled(instituteId);

    const tpl = await this.templateRepo.findOne({ where: { id: templateId, instituteId } });
    if (!tpl) throw new NotFoundException(`Template ${templateId} not found`);
    await this.templateRepo.remove(tpl);
  }

  async getTemplate(instituteId: string, templateId: string, user: any): Promise<DesignTemplateEntity> {
    InstituteAccessValidator.validateInstituteAccess(user, instituteId);
    await this.assertFeatureEnabled(instituteId);
    const tpl = await this.templateRepo.findOne({ where: { id: templateId, instituteId } });
    if (!tpl) throw new NotFoundException(`Template ${templateId} not found`);
    return tpl;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRE-FLIGHT: cost preview (no billing)
  // ═══════════════════════════════════════════════════════════════════════════

  async previewCost(
    instituteId: string,
    templateId: string,
    outputType: DesignOutputType,
    userIds: string[],
    user: any,
  ): Promise<PreviewCostResult> {
    InstituteAccessValidator.validateInstituteAccess(user, instituteId);
    await this.assertFeatureEnabled(instituteId);
    this.validateUserIds(userIds);

    const tpl = await this.requireApprovedTemplate(instituteId, templateId, outputType);
    const unitCost = this.getUnitCost(tpl, outputType);
    const totalCost = unitCost * userIds.length;

    const balanceDto = await this.creditsService.getBalance(instituteId);
    const balance = Number(balanceDto.balance);

    return {
      userCount: userIds.length,
      unitCost,
      totalCost,
      balance,
      sufficient: balance >= totalCost,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // COMMIT: debit credits + create record (atomic), return template definition
  // ═══════════════════════════════════════════════════════════════════════════

  async commitGeneration(
    instituteId: string,
    templateId: string,
    outputType: DesignOutputType,
    userIds: string[],
    user: any,
  ): Promise<CommitGenerationResult> {
    InstituteAccessValidator.validateInstituteAccess(user, instituteId);
    await this.assertFeatureEnabled(instituteId);
    this.validateUserIds(userIds);

    const userId: string = user.id ?? user.sub ?? user.userId;
    const recordId = uuidv4();

    const result = await this.dataSource.transaction(async (manager) => {
      // Re-validate inside the transaction so a concurrent status change is caught
      const tpl = await manager.findOne(DesignTemplateEntity, {
        where: { id: templateId, instituteId },
        lock: { mode: 'pessimistic_read' },
      });
      if (!tpl) throw new NotFoundException(`Template ${templateId} not found`);
      if (tpl.status !== DesignTemplateStatus.APPROVED) {
        throw new ForbiddenException(`Template is not approved (status: ${tpl.status})`);
      }
      this.assertOutputAllowed(tpl, outputType);

      const unitCost = this.getUnitCost(tpl, outputType);
      const totalCost = unitCost * userIds.length;

      // Debit credits (audited, inside transaction)
      const deductResult = await this.creditsService.deductCreditsWithManager(
        manager,
        instituteId,
        {
          amount: totalCost,
          type: CreditTransactionType.DESIGN_GENERATION,
          referenceType: 'DESIGN_TEMPLATE',
          referenceId: templateId,
          description: `Design generation: ${outputType} × ${userIds.length} users — "${tpl.name}"`,
        },
        userId,
      );

      // Create generation record
      const record = manager.create(DesignGenerationRecordEntity, {
        id: recordId,
        instituteId,
        templateId,
        outputType,
        requestedBy: userId,
        userIds,
        userCount: userIds.length,
        unitCost,
        totalCost,
        status: GenerationRecordStatus.COMPLETED,
        successCount: userIds.length,
        failCount: 0,
        creditTransactionId: deductResult.transactionId,
        resultReported: false,
        createdAt: now(),
      });
      await manager.save(DesignGenerationRecordEntity, record);

      return {
        recordId,
        definition: tpl.definition,
        transactionId: deductResult.transactionId,
        unitCost,
        totalCost,
      };
    });

    this.logger.log(
      `Design generation committed: institute=${instituteId} template=${templateId} type=${outputType} users=${userIds.length} cost=${result.totalCost}`,
    );
    return result;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RESULT REPORT: refund failed renders
  // ═══════════════════════════════════════════════════════════════════════════

  async reportGenerationResult(
    instituteId: string,
    recordId: string,
    successCount: number,
    failCount: number,
    user: any,
  ): Promise<{ refunded: number }> {
    InstituteAccessValidator.validateInstituteAccess(user, instituteId);

    const record = await this.recordRepo.findOne({ where: { id: recordId, instituteId } });
    if (!record) throw new NotFoundException(`Generation record ${recordId} not found`);

    // Idempotency guard
    if (record.resultReported) {
      return { refunded: Number(record.refunded) };
    }

    const totalCount = successCount + failCount;
    if (totalCount !== record.userCount) {
      throw new BadRequestException(
        `Count mismatch: successCount(${successCount}) + failCount(${failCount}) must equal userCount(${record.userCount})`,
      );
    }

    let refundAmount = 0;
    const finalStatus = failCount === 0
      ? GenerationRecordStatus.COMPLETED
      : failCount === record.userCount
        ? GenerationRecordStatus.FAILED
        : GenerationRecordStatus.PARTIAL;

    if (failCount > 0) {
      refundAmount = Number(record.unitCost) * failCount;
      try {
        await this.creditsService.grantCredits(
          instituteId,
          {
            amount: refundAmount,
            type: CreditTransactionType.REFUND,
            referenceType: 'DESIGN_GENERATION_RECORD',
            referenceId: recordId,
            description: `Refund for ${failCount} failed renders — record ${recordId}`,
          },
          user.id ?? user.sub,
        );
      } catch (err: any) {
        this.logger.error(`Failed to process refund for record ${recordId}: ${err.message}`);
        throw err;
      }
    }

    record.successCount = successCount;
    record.failCount = failCount;
    record.status = finalStatus;
    record.refunded = refundAmount;
    record.resultReported = true;
    await this.recordRepo.save(record);

    return { refunded: refundAmount };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SYSTEM ADMIN — approval/rejection/suspend
  // ═══════════════════════════════════════════════════════════════════════════

  async listPendingTemplates(page = 1, limit = 20): Promise<{ data: DesignTemplateEntity[]; total: number }> {
    const [data, total] = await this.templateRepo.findAndCount({
      where: { status: DesignTemplateStatus.PENDING },
      order: { createdAt: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, total };
  }

  async listAllTemplates(
    filters: { status?: DesignTemplateStatus; instituteId?: string; page?: number; limit?: number },
  ): Promise<{ data: DesignTemplateEntity[]; total: number }> {
    const { status, instituteId, page = 1, limit = 20 } = filters;
    const where: any = {};
    if (status) where.status = status;
    if (instituteId) where.instituteId = instituteId;

    const [data, total] = await this.templateRepo.findAndCount({
      where,
      order: { updatedAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, total };
  }

  async approveTemplate(
    templateId: string,
    adminId: string,
    dto: ApproveDesignTemplateDto,
  ): Promise<DesignTemplateEntity> {
    const tpl = await this.requireTemplateForAdmin(templateId);
    if (tpl.status === DesignTemplateStatus.APPROVED) {
      throw new ConflictException('Template is already approved');
    }

    tpl.status = DesignTemplateStatus.APPROVED;
    tpl.costPng = dto.costPng ?? 0;
    tpl.costPdf = dto.costPdf ?? 0;
    tpl.costWhatsapp = dto.costWhatsapp ?? 0;
    tpl.costPrint = dto.costPrint ?? 0;
    tpl.allowPng = dto.allowPng ?? false;
    tpl.allowPdf = dto.allowPdf ?? false;
    tpl.allowWhatsapp = dto.allowWhatsapp ?? false;
    tpl.allowPrint = dto.allowPrint ?? false;
    tpl.whatsappTtlDays = dto.whatsappTtlDays ?? undefined;
    tpl.adminNotes = dto.adminNotes ?? undefined;
    tpl.rejectionReason = undefined;
    tpl.reviewedBy = adminId;
    tpl.reviewedAt = now();
    return this.templateRepo.save(tpl);
  }

  async rejectTemplate(
    templateId: string,
    adminId: string,
    dto: RejectDesignTemplateDto,
  ): Promise<DesignTemplateEntity> {
    if (!dto.rejectionReason?.trim()) {
      throw new BadRequestException('rejectionReason is required for rejection');
    }
    const tpl = await this.requireTemplateForAdmin(templateId);
    tpl.status = DesignTemplateStatus.REJECTED;
    tpl.rejectionReason = dto.rejectionReason.trim();
    tpl.adminNotes = dto.adminNotes ?? undefined;
    tpl.reviewedBy = adminId;
    tpl.reviewedAt = now();
    return this.templateRepo.save(tpl);
  }

  async suspendTemplate(templateId: string, adminId: string, adminNotes?: string): Promise<DesignTemplateEntity> {
    const tpl = await this.requireTemplateForAdmin(templateId);
    if (tpl.status !== DesignTemplateStatus.APPROVED) {
      throw new ConflictException('Only APPROVED templates can be suspended');
    }
    tpl.status = DesignTemplateStatus.SUSPENDED;
    tpl.adminNotes = adminNotes ?? tpl.adminNotes;
    tpl.reviewedBy = adminId;
    tpl.reviewedAt = now();
    return this.templateRepo.save(tpl);
  }

  async unsuspendTemplate(templateId: string, adminId: string): Promise<DesignTemplateEntity> {
    const tpl = await this.requireTemplateForAdmin(templateId);
    if (tpl.status !== DesignTemplateStatus.SUSPENDED) {
      throw new ConflictException('Template is not suspended');
    }
    tpl.status = DesignTemplateStatus.APPROVED;
    tpl.reviewedBy = adminId;
    tpl.reviewedAt = now();
    return this.templateRepo.save(tpl);
  }

  async adminUpdateTemplate(
    templateId: string,
    adminId: string,
    dto: { name?: string; definition?: Record<string, any> },
  ): Promise<DesignTemplateEntity> {
    const tpl = await this.requireTemplateForAdmin(templateId);
    if (dto.name?.trim()) tpl.name = dto.name.trim().substring(0, 255);
    if (dto.definition && typeof dto.definition === 'object') tpl.definition = dto.definition;
    // Admin edit does NOT reset status — admin edits are trusted
    tpl.reviewedBy = adminId;
    tpl.reviewedAt = now();
    return this.templateRepo.save(tpl);
  }

  async adminGetTemplate(templateId: string): Promise<DesignTemplateEntity> {
    return this.requireTemplateForAdmin(templateId);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GENERATION RECORDS — admin view
  // ═══════════════════════════════════════════════════════════════════════════

  async listGenerationRecords(filters: {
    instituteId?: string;
    templateId?: string;
    outputType?: DesignOutputType;
    page?: number;
    limit?: number;
  }): Promise<{ data: DesignGenerationRecordEntity[]; total: number }> {
    const { instituteId, templateId, outputType, page = 1, limit = 20 } = filters;
    const where: any = {};
    if (instituteId) where.instituteId = instituteId;
    if (templateId) where.templateId = templateId;
    if (outputType) where.outputType = outputType;

    const [data, total] = await this.recordRepo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, total };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  private async assertFeatureEnabled(instituteId: string): Promise<void> {
    const features = await this.featuresService.getFeaturesForInstitute(instituteId);
    if (features[FEATURE_KEY]?.enabled === false) {
      throw new ForbiddenException('The designs feature is not enabled for this institute');
    }
  }

  private validateUserIds(userIds: string[]): void {
    if (!userIds || userIds.length === 0) {
      throw new BadRequestException('At least one user ID is required for generation');
    }
  }

  private async requireApprovedTemplate(
    instituteId: string,
    templateId: string,
    outputType: DesignOutputType,
  ): Promise<DesignTemplateEntity> {
    const tpl = await this.templateRepo.findOne({ where: { id: templateId, instituteId } });
    if (!tpl) throw new NotFoundException(`Template ${templateId} not found`);
    if (tpl.status !== DesignTemplateStatus.APPROVED) {
      throw new ForbiddenException(`Template is not approved (status: ${tpl.status})`);
    }
    this.assertOutputAllowed(tpl, outputType);
    return tpl;
  }

  private assertOutputAllowed(tpl: DesignTemplateEntity, outputType: DesignOutputType): void {
    const allowed: Record<DesignOutputType, boolean> = {
      [DesignOutputType.PNG]:      tpl.allowPng,
      [DesignOutputType.PDF]:      tpl.allowPdf,
      [DesignOutputType.WHATSAPP]: tpl.allowWhatsapp,
      [DesignOutputType.PRINT]:    tpl.allowPrint,
    };
    if (!allowed[outputType]) {
      throw new ForbiddenException(`Output type ${outputType} is not enabled for this template`);
    }
  }

  private getUnitCost(tpl: DesignTemplateEntity, outputType: DesignOutputType): number {
    const costs: Record<DesignOutputType, number> = {
      [DesignOutputType.PNG]:      Number(tpl.costPng),
      [DesignOutputType.PDF]:      Number(tpl.costPdf),
      [DesignOutputType.WHATSAPP]: Number(tpl.costWhatsapp),
      [DesignOutputType.PRINT]:    Number(tpl.costPrint),
    };
    return costs[outputType] ?? 0;
  }

  private async requireTemplateForAdmin(templateId: string): Promise<DesignTemplateEntity> {
    const tpl = await this.templateRepo.findOne({ where: { id: templateId } });
    if (!tpl) throw new NotFoundException(`Template ${templateId} not found`);
    return tpl;
  }
}
