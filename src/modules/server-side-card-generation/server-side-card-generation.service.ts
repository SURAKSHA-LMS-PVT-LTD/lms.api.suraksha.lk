import {
  Injectable, Logger, NotFoundException, ForbiddenException,
  BadRequestException, GoneException,
} from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource, LessThan } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { Cron, CronExpression } from '@nestjs/schedule';

import { CardGenerationJobEntity, CardGenerationJobStatus } from './entities/card-generation-job.entity';
import { InstituteDesignsService } from '../institute-designs/institute-designs.service';
import { DesignOutputType } from '../institute-designs/entities/design-template.entity';
import { InstituteCreditsService } from '../notification-credits/services/institute-credits.service';
import { CreditTransactionType } from '../notification-credits/entities/institute-credit-transaction.entity';
import { InstituteAccessValidator } from '../../common/helpers/institute-access-validator.helper';
import { now } from '../../common/utils/timezone.util';

export interface RequestServerSideJobDto {
  templateId: string;
  outputType: DesignOutputType;
  userIds: string[];
}

export interface CompleteServerSideJobDto {
  driveFileId: string;
  driveFileName: string;
  driveShareLink: string;
  successCount: number;
  failCount: number;
}

export interface ServerSideJobResult {
  jobId: string;
  generationRecordId: string;
  definition: Record<string, any>;
  unitCost: number;
  totalCost: number;
  expiresAt: string;
}

@Injectable()
export class ServerSideCardGenerationService {
  private readonly logger = new Logger(ServerSideCardGenerationService.name);

  /** Jobs must be completed within this many hours or they expire */
  private readonly JOB_TTL_HOURS = 2;

  constructor(
    @InjectRepository(CardGenerationJobEntity)
    private readonly jobRepo: Repository<CardGenerationJobEntity>,
    private readonly designsService: InstituteDesignsService,
    private readonly creditsService: InstituteCreditsService,
  ) {}

  // ═══════════════════════════════════════════════════════════════════════════
  // REQUEST JOB — debits credits (SSR rate), creates job record
  // ═══════════════════════════════════════════════════════════════════════════

  async requestJob(
    instituteId: string,
    dto: RequestServerSideJobDto,
    user: any,
  ): Promise<ServerSideJobResult> {
    InstituteAccessValidator.validateInstituteAccess(user, instituteId);

    // Commit billing at SSR rate (serverSide=true).  commitGeneration already
    // validates that the template allows SSR.
    const committed = await this.designsService.commitGeneration(
      instituteId,
      dto.templateId,
      dto.outputType,
      dto.userIds,
      user,
      true,
    );

    const expiresAt = new Date(Date.now() + this.JOB_TTL_HOURS * 60 * 60 * 1000);

    const job = this.jobRepo.create({
      id: uuidv4(),
      instituteId,
      generationRecordId: committed.recordId,
      requestedBy: user.id ?? user.sub,
      templateId: dto.templateId,
      templateName: (committed.definition as any)?.name ?? dto.templateId,
      userCount: dto.userIds.length,
      unitCost: committed.unitCost,
      totalCost: committed.totalCost,
      status: CardGenerationJobStatus.PENDING,
      successCount: 0,
      failCount: 0,
      refunded: 0,
      expiresAt,
      createdAt: now(),
    });
    await this.jobRepo.save(job);

    this.logger.log(
      `SSR job created: ${job.id} institute=${instituteId} users=${dto.userIds.length} cost=${committed.totalCost}`,
    );

    return {
      jobId: job.id,
      generationRecordId: committed.recordId,
      definition: committed.definition,
      unitCost: committed.unitCost,
      totalCost: committed.totalCost,
      expiresAt: expiresAt.toISOString(),
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // COMPLETE JOB — frontend finished uploading ZIP to Drive, registers result
  // ═══════════════════════════════════════════════════════════════════════════

  async completeJob(
    instituteId: string,
    jobId: string,
    dto: CompleteServerSideJobDto,
    user: any,
  ): Promise<{ driveShareLink: string; refunded: number }> {
    InstituteAccessValidator.validateInstituteAccess(user, instituteId);

    const job = await this.requireJob(instituteId, jobId);

    if (job.status === CardGenerationJobStatus.COMPLETED) {
      return { driveShareLink: job.driveShareLink!, refunded: Number(job.refunded) };
    }
    if (job.status === CardGenerationJobStatus.EXPIRED) {
      throw new GoneException('This generation job has expired');
    }
    if (new Date() > job.expiresAt) {
      await this.jobRepo.update(job.id, { status: CardGenerationJobStatus.EXPIRED });
      throw new GoneException('This generation job has expired');
    }

    const totalCount = dto.successCount + dto.failCount;
    if (totalCount !== job.userCount) {
      throw new BadRequestException(
        `Count mismatch: successCount(${dto.successCount}) + failCount(${dto.failCount}) must equal userCount(${job.userCount})`,
      );
    }

    // Issue refund for failed cards
    let refunded = 0;
    if (dto.failCount > 0 && Number(job.unitCost) > 0) {
      refunded = Math.round(Number(job.unitCost) * dto.failCount * 100) / 100;
      try {
        await this.creditsService.grantCredits(
          instituteId,
          {
            amount: refunded,
            type: CreditTransactionType.REFUND,
            referenceType: 'CARD_GENERATION_JOB',
            referenceId: jobId,
            description: `Refund for ${dto.failCount} failed SSR renders — job ${jobId}`,
          },
          user.id ?? user.sub,
        );
      } catch (err: any) {
        this.logger.error(`Refund failed for job ${jobId}: ${err.message}`);
        throw err;
      }
    }

    // Also report to the underlying generation record
    try {
      await this.designsService.reportGenerationResult(
        instituteId,
        job.generationRecordId,
        dto.successCount,
        dto.failCount,
        user,
      );
    } catch (err: any) {
      this.logger.warn(`reportGenerationResult failed for record ${job.generationRecordId}: ${err.message}`);
    }

    job.status = CardGenerationJobStatus.COMPLETED;
    job.driveFileId = dto.driveFileId;
    job.driveFileName = dto.driveFileName;
    job.driveShareLink = dto.driveShareLink;
    job.successCount = dto.successCount;
    job.failCount = dto.failCount;
    job.refunded = refunded;
    await this.jobRepo.save(job);

    this.logger.log(`SSR job completed: ${jobId} success=${dto.successCount} fail=${dto.failCount} refunded=${refunded}`);
    return { driveShareLink: dto.driveShareLink, refunded };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GET JOB STATUS
  // ═══════════════════════════════════════════════════════════════════════════

  async getJob(instituteId: string, jobId: string, user: any): Promise<CardGenerationJobEntity> {
    InstituteAccessValidator.validateInstituteAccess(user, instituteId);
    return this.requireJob(instituteId, jobId);
  }

  async listJobs(
    instituteId: string,
    user: any,
    page = 1,
    limit = 20,
  ): Promise<{ data: CardGenerationJobEntity[]; total: number }> {
    InstituteAccessValidator.validateInstituteAccess(user, instituteId);
    const [data, total] = await this.jobRepo.findAndCount({
      where: { instituteId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * Math.min(limit, 100),
      take: Math.min(limit, 100),
    });
    return { data, total };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // EXPIRE STALE JOBS — runs every 30 minutes
  // ═══════════════════════════════════════════════════════════════════════════

  @Cron(CronExpression.EVERY_30_MINUTES)
  async expireStaleJobs(): Promise<void> {
    const result = await this.jobRepo.update(
      { status: CardGenerationJobStatus.PENDING, expiresAt: LessThan(new Date()) },
      { status: CardGenerationJobStatus.EXPIRED },
    );
    if ((result.affected ?? 0) > 0) {
      this.logger.warn(`Expired ${result.affected} stale SSR generation jobs`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE
  // ═══════════════════════════════════════════════════════════════════════════

  private async requireJob(instituteId: string, jobId: string): Promise<CardGenerationJobEntity> {
    const job = await this.jobRepo.findOne({ where: { id: jobId, instituteId } });
    if (!job) throw new NotFoundException(`Generation job ${jobId} not found`);
    return job;
  }
}
