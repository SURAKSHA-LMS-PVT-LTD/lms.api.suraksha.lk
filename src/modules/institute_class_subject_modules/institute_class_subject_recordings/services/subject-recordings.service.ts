import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindManyOptions, Like, ILike } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';

import { SubjectRecording } from '../entities/subject_recording.entity';
import {
  CreateSubjectRecordingDto,
  UpdateSubjectRecordingDto,
  QuerySubjectRecordingDto,
} from '../dto/subject-recording.dto';
import { PaginatedResponseDto } from '../../../../common/dto/paginated-response.dto';
import { CloudStorageService } from '../../../../common/services/cloud-storage.service';

@Injectable()
export class SubjectRecordingsService {
  constructor(
    @InjectRepository(SubjectRecording)
    private readonly repo: Repository<SubjectRecording>,
    private readonly cloudStorageService: CloudStorageService,
  ) {}

  private transformUrls(rec: SubjectRecording): void {
    if (Array.isArray(rec.materials)) {
      rec.materials = rec.materials.map(m => ({
        ...m,
        documentUrl:
          m.source === 'S3' && m.documentUrl
            ? this.cloudStorageService.getFullUrl(m.documentUrl)
            : m.documentUrl,
      }));
    }
    if (rec.thumbnailUrl && !rec.thumbnailUrl.startsWith('http')) {
      rec.thumbnailUrl = this.cloudStorageService.getFullUrl(rec.thumbnailUrl);
    }
  }

  async create(dto: CreateSubjectRecordingDto, requestUser: any): Promise<SubjectRecording> {
    const data: Partial<SubjectRecording> = {
      instituteId: dto.instituteId,
      classId: dto.classId,
      subjectId: dto.subjectId,
      uploadedById: dto.uploadedById ?? requestUser?.id,
      title: dto.title,
      description: dto.description,
      platform: dto.platform ?? 'SYSTEM' as any,
      recordingUrl: dto.recordingUrl,
      durationSeconds: dto.durationSeconds,
      thumbnailUrl: dto.thumbnailUrl,
      materials: dto.materials as any,
      status: dto.status ?? 'draft' as any,
      isActive: dto.isActive ?? true,

      // Recording tracking
      recAttendanceEnabled: dto.recAttendanceEnabled ?? false,
      recUrlId: dto.recAttendanceEnabled ? (uuidv4().replace(/-/g, '').substring(0, 12)) : undefined,
      recAccessLevel: dto.recAccessLevel ?? 'ENROLLED_ONLY' as any,
      recPaymentId: dto.recPaymentId,
      recPaymentStatuses: dto.recPaymentStatuses,
      recTrackingDays: dto.recTrackingDays ?? null,
      recEntryBgUrl: dto.recEntryBgUrl,
      recCardImageUrl: dto.recCardImageUrl,
      recCardImageTtl: dto.recCardImageTtl ? new Date(dto.recCardImageTtl) : undefined,
      recBgImageTtl: dto.recBgImageTtl ? new Date(dto.recBgImageTtl) : undefined,
      recUrlExpiresAt: dto.recUrlExpiresAt ? new Date(dto.recUrlExpiresAt) : undefined,

      // Welcome message
      welcomeMessageEnabled: dto.welcomeMessageEnabled ?? false,
      welcomeMessageText: dto.welcomeMessageText?.trim() || undefined,
      welcomeMessageVoiceEnabled: dto.welcomeMessageVoiceEnabled ?? false,
    };

    const entity = this.repo.create(data);
    const saved = await this.repo.save(entity);
    this.transformUrls(saved);
    return saved;
  }

  async findAll(
    query: QuerySubjectRecordingDto,
    requestUser: any,
  ): Promise<PaginatedResponseDto<SubjectRecording>> {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);
    const skip = (page - 1) * limit;

    const where: FindManyOptions<SubjectRecording>['where'] = {};
    if (query.instituteId) (where as any).instituteId = query.instituteId;
    if (query.classId) (where as any).classId = query.classId;
    if (query.subjectId) (where as any).subjectId = query.subjectId;
    if (query.uploadedById) (where as any).uploadedById = query.uploadedById;
    if (query.status) (where as any).status = query.status;
    if (query.platform) (where as any).platform = query.platform;
    if (query.isActive !== undefined) (where as any).isActive = query.isActive;
    if (query.recAttendanceEnabled !== undefined) (where as any).recAttendanceEnabled = query.recAttendanceEnabled;
    if (query.search) (where as any).title = ILike(`%${query.search}%`);

    const [data, total] = await this.repo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
      relations: ['uploadedBy'],
    });

    data.forEach(r => this.transformUrls(r));

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    } as any;
  }

  async findOne(id: string, requestUser: any): Promise<SubjectRecording> {
    const rec = await this.repo.findOne({
      where: { id },
      relations: ['uploadedBy', 'institute', 'class', 'subject'],
    });
    if (!rec) throw new NotFoundException(`Recording ${id} not found`);
    this.transformUrls(rec);
    return rec;
  }

  async update(
    id: string,
    dto: UpdateSubjectRecordingDto,
    requestUser: any,
  ): Promise<SubjectRecording> {
    const rec = await this.repo.findOne({ where: { id } });
    if (!rec) throw new NotFoundException(`Recording ${id} not found`);

    const updates: Partial<SubjectRecording> = {};

    if (dto.title !== undefined) updates.title = dto.title;
    if (dto.description !== undefined) updates.description = dto.description;
    if (dto.platform !== undefined) updates.platform = dto.platform as any;
    if (dto.recordingUrl !== undefined) updates.recordingUrl = dto.recordingUrl;
    if (dto.durationSeconds !== undefined) updates.durationSeconds = dto.durationSeconds;
    if (dto.thumbnailUrl !== undefined) updates.thumbnailUrl = dto.thumbnailUrl;
    if (dto.materials !== undefined) updates.materials = dto.materials as any;
    if (dto.status !== undefined) updates.status = dto.status as any;
    if (dto.isActive !== undefined) updates.isActive = dto.isActive;

    // rec tracking toggles
    if (dto.recAttendanceEnabled !== undefined) {
      updates.recAttendanceEnabled = dto.recAttendanceEnabled;
      if (dto.recAttendanceEnabled && !rec.recUrlId) {
        updates.recUrlId = uuidv4().replace(/-/g, '').substring(0, 12);
      }
    }
    if (dto.recAccessLevel !== undefined) updates.recAccessLevel = dto.recAccessLevel as any;
    if (dto.recPaymentId !== undefined) updates.recPaymentId = dto.recPaymentId;
    if (dto.recPaymentStatuses !== undefined) updates.recPaymentStatuses = dto.recPaymentStatuses;
    if (dto.recTrackingDays !== undefined) updates.recTrackingDays = dto.recTrackingDays;
    if (dto.recEntryBgUrl !== undefined) updates.recEntryBgUrl = dto.recEntryBgUrl;
    if (dto.recCardImageUrl !== undefined) updates.recCardImageUrl = dto.recCardImageUrl;
    if (dto.recCardImageTtl !== undefined) updates.recCardImageTtl = new Date(dto.recCardImageTtl);
    if (dto.recBgImageTtl !== undefined) updates.recBgImageTtl = new Date(dto.recBgImageTtl);
    if (dto.recUrlExpiresAt !== undefined) updates.recUrlExpiresAt = new Date(dto.recUrlExpiresAt);

    if (dto.welcomeMessageEnabled !== undefined) updates.welcomeMessageEnabled = dto.welcomeMessageEnabled;
    if (dto.welcomeMessageText !== undefined) updates.welcomeMessageText = dto.welcomeMessageText?.trim() || undefined;
    if (dto.welcomeMessageVoiceEnabled !== undefined) updates.welcomeMessageVoiceEnabled = dto.welcomeMessageVoiceEnabled;

    await this.repo.update(id, updates);
    return this.findOne(id, requestUser);
  }

  async remove(id: string): Promise<void> {
    const rec = await this.repo.findOne({ where: { id } });
    if (!rec) throw new NotFoundException(`Recording ${id} not found`);
    await this.repo.update(id, { isActive: false });
  }

  async removePermanent(id: string, requestUser: any): Promise<any> {
    const rec = await this.repo.findOne({ where: { id } });
    if (!rec) throw new NotFoundException(`Recording ${id} not found`);
    await this.repo.delete(id);
    return { success: true, message: 'Recording permanently deleted', recordingId: id };
  }
}
