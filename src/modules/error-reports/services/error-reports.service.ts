import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ErrorReportEntity, ErrorReportStatus } from '../entities/error-report.entity';
import { CreateErrorReportDto } from '../dto/create-error-report.dto';
import { UpdateErrorReportStatusDto } from '../dto/update-error-report-status.dto';
import { QueryErrorReportsDto } from '../dto/query-error-reports.dto';

@Injectable()
export class ErrorReportsService {
  constructor(
    @InjectRepository(ErrorReportEntity)
    private readonly repo: Repository<ErrorReportEntity>,
  ) {}

  async create(dto: CreateErrorReportDto, userId?: string): Promise<ErrorReportEntity> {
    const report = this.repo.create({
      ...dto,
      userId: userId ?? null,
    });
    return this.repo.save(report);
  }

  async findAll(query: QueryErrorReportsDto): Promise<{ data: ErrorReportEntity[]; total: number }> {
    const { page = 1, limit = 20, status, kind } = query;

    const qb = this.repo
      .createQueryBuilder('r')
      .orderBy('r.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (status) qb.andWhere('r.status = :status', { status });
    if (kind) qb.andWhere('r.kind = :kind', { kind });

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async findOne(id: string): Promise<ErrorReportEntity | null> {
    const report = await this.repo.findOne({ where: { id } });
    if (report && report.status === ErrorReportStatus.NEW) {
      report.status = ErrorReportStatus.VIEWED;
      await this.repo.save(report);
    }
    return report;
  }

  async updateStatus(
    id: string,
    dto: UpdateErrorReportStatusDto,
    resolvedByUserId: string,
  ): Promise<ErrorReportEntity | null> {
    const report = await this.repo.findOne({ where: { id } });
    if (!report) return null;

    report.status = dto.status;
    if (dto.adminNote !== undefined) report.adminNote = dto.adminNote;

    const resolvedStatuses = [ErrorReportStatus.FIXED, ErrorReportStatus.IGNORED];
    if (resolvedStatuses.includes(dto.status)) {
      report.resolvedByUserId = resolvedByUserId;
      report.resolvedAt = new Date();
    }

    return this.repo.save(report);
  }

  async getStatusCounts(): Promise<Record<ErrorReportStatus, number>> {
    const rows = await this.repo
      .createQueryBuilder('r')
      .select('r.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('r.status')
      .getRawMany<{ status: ErrorReportStatus; count: string }>();

    const counts = Object.values(ErrorReportStatus).reduce(
      (acc, s) => ({ ...acc, [s]: 0 }),
      {} as Record<ErrorReportStatus, number>,
    );
    rows.forEach(r => { counts[r.status] = Number(r.count); });
    return counts;
  }
}
