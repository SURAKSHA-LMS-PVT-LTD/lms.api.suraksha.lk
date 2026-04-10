import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { now } from '../../../common/utils/timezone.util';
import { CreateInstituteClassLectureDto } from './dto/create-institute_class_lecture.dto';
import { UpdateInstituteClassLectureDto } from './dto/update-institute_class_lecture.dto';
import { UpdateClassLectureStatusDto, RescheduleClassLectureDto, ClassLectureFilterDto } from './dto/class-lecture-filter.dto';
import { InstituteClassLectureEntity } from './entities/institute_class_lecture.entity';
import { PaginatedResponseDto } from '../../../common/dto/paginated-response.dto';
import { InstituteAccessValidator, ROLE_BITMASKS } from '../../../common/helpers/institute-access-validator.helper';
import { CloudStorageService } from '../../../common/services/cloud-storage.service';

@Injectable()
export class InstituteClassLecturesService {
  constructor(
    @InjectRepository(InstituteClassLectureEntity)
    private readonly lectureRepository: Repository<InstituteClassLectureEntity>,
    private readonly cloudStorageService: CloudStorageService,
  ) {}

  private transformMaterialUrls(lecture: InstituteClassLectureEntity): void {
    if (Array.isArray(lecture.materials)) {
      lecture.materials = lecture.materials.map(m => ({
        ...m,
        documentUrl: m.source === 'S3' && m.documentUrl
          ? this.cloudStorageService.getFullUrl(m.documentUrl)
          : m.documentUrl,
      }));
    }
    if (lecture.recordingUrl) {
      lecture.recordingUrl = this.cloudStorageService.getFullUrl(lecture.recordingUrl);
    }
    if ((lecture as any).thumbnailUrl && !(lecture as any).thumbnailUrl.startsWith('http')) {
      (lecture as any).thumbnailUrl = this.cloudStorageService.getFullUrl((lecture as any).thumbnailUrl);
    }
  }

  async create(createDto: CreateInstituteClassLectureDto): Promise<InstituteClassLectureEntity> {
    const startTime = new Date(createDto.startTime);
    const endTime = new Date(createDto.endTime);

    if (endTime <= startTime) {
      throw new BadRequestException('End time must be after start time');
    }

    const timestamp = now();
    const lectureData = {
      instituteId: createDto.instituteId,
      classId: createDto.classId,
      instructorId: createDto.instructorId,
      title: createDto.title,
      description: createDto.description,
      lectureType: createDto.lectureType,
      venue: createDto.venue,
      subject: createDto.subject,
      startTime,
      endTime,
      status: createDto.status || 'scheduled' as any,
      meetingLink: createDto.meetingLink,
      meetingId: createDto.meetingId,
      meetingPassword: createDto.meetingPassword,
      recordingUrl: createDto.recordingUrl,
      isRecorded: createDto.isRecorded ?? false,
      maxParticipants: createDto.maxParticipants,
      isActive: createDto.isActive ?? true,
      materials: createDto.materials ?? undefined,
      thumbnailUrl: createDto.thumbnailUrl,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    const lecture = this.lectureRepository.create(lectureData);
    const savedLecture = await this.lectureRepository.save(lecture);
    savedLecture.startTime = startTime;
    savedLecture.endTime = endTime;
    return savedLecture;
  }

  async findAll(queryDto: ClassLectureFilterDto = {}, user?: any): Promise<PaginatedResponseDto<InstituteClassLectureEntity>> {
    const { page = 1, limit = 10, ...filters } = queryDto;
    const skip = (page - 1) * limit;

    // SECURITY: Validate user has access to requested institute and class
    if (user && filters.instituteId) {
      InstituteAccessValidator.validateInstituteAccess(user, filters.instituteId, undefined, undefined, true);

      if (filters.classId) {
        const userInstituteAccess = Array.isArray(user.i) ? user.i : [];
        const instituteEntry = userInstituteAccess.find((entry: any) => entry.i === filters.instituteId);

        if (instituteEntry && Array.isArray(instituteEntry.c)) {
          const classEntry = instituteEntry.c.find(
            ([classId]: [string, number]) => classId === filters.classId
          );
          if (!classEntry) {
            throw new ForbiddenException(`You do not have access to class ${filters.classId} in institute ${filters.instituteId}`);
          }
        }
      }
    }

    const queryBuilder = this.lectureRepository.createQueryBuilder('lecture');
    this.applyFilters(queryBuilder, filters);

    const [lectures, total] = await queryBuilder
      .skip(skip)
      .take(limit)
      .orderBy('lecture.startTime', 'ASC')
      .getManyAndCount();

    const transformedLectures = lectures.map(lecture => {
      this.transformMaterialUrls(lecture);
      return lecture;
    });

    return new PaginatedResponseDto(transformedLectures, page, limit, total);
  }

  async findOne(id: string, user?: any): Promise<InstituteClassLectureEntity> {
    const lecture = await this.lectureRepository
      .createQueryBuilder('lecture')
      .where('lecture.id = :id', { id })
      .getOne();

    if (!lecture) {
      throw new NotFoundException(`Class lecture with ID ${id} not found`);
    }

    // SECURITY: Validate user has access to this lecture's class
    if (user) {
      InstituteAccessValidator.validateResourceAccess(user, lecture);
    }

    this.transformMaterialUrls(lecture);
    return lecture;
  }

  async findOneWithDetails(id: string): Promise<InstituteClassLectureEntity> {
    const lecture = await this.lectureRepository
      .createQueryBuilder('lecture')
      .leftJoin('lecture.institute', 'institute')
      .addSelect(['institute.id', 'institute.name'])
      .leftJoin('lecture.class', 'class')
      .addSelect(['class.id', 'class.name', 'class.grade'])
      .leftJoin('lecture.instructor', 'instructor')
      .addSelect(['instructor.id', 'instructor.firstName', 'instructor.lastName', 'instructor.email'])
      .where('lecture.id = :id', { id })
      .getOne();

    if (!lecture) {
      throw new NotFoundException(`Class lecture with ID ${id} not found`);
    }

    this.transformMaterialUrls(lecture);
    return lecture;
  }

  async update(id: string, updateDto: UpdateInstituteClassLectureDto, user?: any): Promise<InstituteClassLectureEntity> {
    const lecture = await this.lectureRepository.findOne({ where: { id } });

    if (!lecture) {
      throw new NotFoundException(`Class lecture with ID ${id} not found`);
    }

    if (user) {
      InstituteAccessValidator.validateResourceAccess(user, lecture, [ROLE_BITMASKS.TEACHER, ROLE_BITMASKS.INSTITUTE_ADMIN]);
    }

    const updateData: any = {};
    if (updateDto.title !== undefined) updateData.title = updateDto.title;
    if (updateDto.description !== undefined) updateData.description = updateDto.description;
    if (updateDto.venue !== undefined) updateData.venue = updateDto.venue;
    if (updateDto.subject !== undefined) updateData.subject = updateDto.subject;
    if (updateDto.lectureType !== undefined) updateData.lectureType = updateDto.lectureType;
    if (updateDto.startTime !== undefined) updateData.startTime = new Date(updateDto.startTime);
    if (updateDto.endTime !== undefined) updateData.endTime = new Date(updateDto.endTime);
    if (updateDto.status !== undefined) updateData.status = updateDto.status;
    if (updateDto.meetingLink !== undefined) updateData.meetingLink = updateDto.meetingLink;
    if (updateDto.meetingId !== undefined) updateData.meetingId = updateDto.meetingId;
    if (updateDto.meetingPassword !== undefined) updateData.meetingPassword = updateDto.meetingPassword;
    if (updateDto.recordingUrl !== undefined) updateData.recordingUrl = updateDto.recordingUrl;
    if (updateDto.isRecorded !== undefined) updateData.isRecorded = updateDto.isRecorded;
    if (updateDto.maxParticipants !== undefined) updateData.maxParticipants = updateDto.maxParticipants;
    if (updateDto.isActive !== undefined) updateData.isActive = updateDto.isActive;
    if (updateDto.materials !== undefined) updateData.materials = updateDto.materials;
    if (updateDto.thumbnailUrl !== undefined) updateData.thumbnailUrl = updateDto.thumbnailUrl;

    if (updateData.startTime && updateData.endTime && updateData.endTime <= updateData.startTime) {
      throw new BadRequestException('End time must be after start time');
    }

    updateData.updatedAt = now();
    await this.lectureRepository.update(id, updateData);

    const updatedLecture = await this.lectureRepository.findOne({ where: { id } });
    if (updatedLecture) {
      this.transformMaterialUrls(updatedLecture);
    }
    return updatedLecture!;
  }

  async updateStatus(id: string, statusDto: UpdateClassLectureStatusDto, user?: any): Promise<any> {
    const lecture = await this.lectureRepository.findOne({ where: { id } });
    if (!lecture) {
      throw new NotFoundException(`Class lecture with ID ${id} not found`);
    }

    if (user) {
      InstituteAccessValidator.validateResourceAccess(user, lecture, [ROLE_BITMASKS.TEACHER, ROLE_BITMASKS.INSTITUTE_ADMIN]);
    }

    await this.lectureRepository.update(id, { status: statusDto.status, updatedAt: now() } as any);
    const updatedLecture = await this.lectureRepository.findOne({ where: { id } });
    this.transformMaterialUrls(updatedLecture!);

    let message: string;
    switch (statusDto.status) {
      case 'cancelled': message = 'Class lecture has been cancelled'; break;
      case 'completed': message = 'Class lecture has been completed'; break;
      case 'ongoing': message = 'Class lecture has started'; break;
      default: message = 'Class lecture status updated successfully';
    }

    return { lecture: updatedLecture, message };
  }

  async reschedule(id: string, rescheduleDto: RescheduleClassLectureDto, user?: any): Promise<any> {
    const lecture = await this.lectureRepository.findOne({ where: { id } });
    if (!lecture) {
      throw new NotFoundException(`Class lecture with ID ${id} not found`);
    }

    if (user) {
      InstituteAccessValidator.validateResourceAccess(user, lecture, [ROLE_BITMASKS.TEACHER, ROLE_BITMASKS.INSTITUTE_ADMIN]);
    }

    const startTime = new Date(rescheduleDto.startTime);
    const endTime = new Date(rescheduleDto.endTime);

    if (endTime <= startTime) {
      throw new BadRequestException('End time must be after start time');
    }

    await this.lectureRepository.update(id, { startTime, endTime, updatedAt: now() } as any);
    const updatedLecture = await this.lectureRepository.findOne({ where: { id } });
    this.transformMaterialUrls(updatedLecture!);

    return { lecture: updatedLecture, message: 'Class lecture has been rescheduled' };
  }

  async remove(id: string): Promise<void> {
    const lecture = await this.lectureRepository.findOne({ where: { id } });
    if (!lecture) {
      throw new NotFoundException(`Class lecture with ID ${id} not found`);
    }
    await this.lectureRepository.delete(id);
  }

  async removePermanent(id: string, user?: any): Promise<any> {
    const lecture = await this.lectureRepository.findOne({ where: { id } });
    if (!lecture) {
      throw new NotFoundException(`Class lecture with ID ${id} not found`);
    }

    if (user) {
      InstituteAccessValidator.validateInstituteAccess(user, lecture.instituteId);
    }

    await this.lectureRepository.delete(id);
    return {
      success: true,
      message: 'Class lecture permanently deleted successfully',
      lectureId: id,
      instituteId: lecture.instituteId,
      classId: lecture.classId,
    };
  }

  async findByClass(classId: string, instituteId?: string): Promise<InstituteClassLectureEntity[]> {
    const queryBuilder = this.lectureRepository
      .createQueryBuilder('lecture')
      .leftJoin('lecture.instructor', 'instructor')
      .addSelect(['instructor.id', 'instructor.firstName', 'instructor.lastName', 'instructor.email', 'instructor.imageUrl'])
      .where('lecture.classId = :classId', { classId });

    if (instituteId) {
      queryBuilder.andWhere('lecture.instituteId = :instituteId', { instituteId });
    }

    const lectures = await queryBuilder.orderBy('lecture.startTime', 'ASC').getMany();
    lectures.forEach(l => this.transformMaterialUrls(l));
    return lectures;
  }

  async findByInstitute(instituteId: string): Promise<InstituteClassLectureEntity[]> {
    const lectures = await this.lectureRepository
      .createQueryBuilder('lecture')
      .leftJoin('lecture.class', 'class')
      .addSelect(['class.id', 'class.name', 'class.grade'])
      .leftJoin('lecture.instructor', 'instructor')
      .addSelect(['instructor.id', 'instructor.firstName', 'instructor.lastName', 'instructor.email', 'instructor.imageUrl'])
      .where('lecture.instituteId = :instituteId', { instituteId })
      .orderBy('lecture.startTime', 'ASC')
      .getMany();

    lectures.forEach(l => this.transformMaterialUrls(l));
    return lectures;
  }

  async findUpcoming(classId: string, instituteId?: string, limit?: number): Promise<InstituteClassLectureEntity[]> {
    const queryBuilder = this.lectureRepository
      .createQueryBuilder('lecture')
      .leftJoin('lecture.instructor', 'instructor')
      .addSelect(['instructor.id', 'instructor.firstName', 'instructor.lastName', 'instructor.imageUrl'])
      .where('lecture.classId = :classId', { classId })
      .andWhere('lecture.startTime > :now', { now: now() })
      .andWhere('lecture.status IN (:...statuses)', { statuses: ['scheduled'] })
      .orderBy('lecture.startTime', 'ASC');

    if (instituteId) {
      queryBuilder.andWhere('lecture.instituteId = :instituteId', { instituteId });
    }
    if (limit) {
      queryBuilder.take(limit);
    }

    const lectures = await queryBuilder.getMany();
    lectures.forEach(l => this.transformMaterialUrls(l));
    return lectures;
  }

  async findOngoing(classId: string, instituteId?: string): Promise<InstituteClassLectureEntity[]> {
    const lectures = await this.lectureRepository
      .createQueryBuilder('lecture')
      .leftJoin('lecture.instructor', 'instructor')
      .addSelect(['instructor.id', 'instructor.firstName', 'instructor.lastName', 'instructor.imageUrl'])
      .where('lecture.classId = :classId', { classId })
      .andWhere('lecture.status = :status', { status: 'ongoing' })
      .andWhere(instituteId ? 'lecture.instituteId = :instituteId' : '1=1', { instituteId })
      .orderBy('lecture.startTime', 'ASC')
      .getMany();

    lectures.forEach(l => this.transformMaterialUrls(l));
    return lectures;
  }

  async findCompleted(classId: string, instituteId?: string, limit?: number): Promise<InstituteClassLectureEntity[]> {
    const queryBuilder = this.lectureRepository
      .createQueryBuilder('lecture')
      .leftJoin('lecture.instructor', 'instructor')
      .addSelect(['instructor.id', 'instructor.firstName', 'instructor.lastName', 'instructor.imageUrl'])
      .where('lecture.classId = :classId', { classId })
      .andWhere('lecture.status = :status', { status: 'completed' })
      .orderBy('lecture.startTime', 'DESC');

    if (instituteId) {
      queryBuilder.andWhere('lecture.instituteId = :instituteId', { instituteId });
    }
    if (limit) {
      queryBuilder.take(limit);
    }

    const lectures = await queryBuilder.getMany();
    lectures.forEach(l => this.transformMaterialUrls(l));
    return lectures;
  }

  async getSchedule(date: string, query: ClassLectureFilterDto = {}, user?: any): Promise<InstituteClassLectureEntity[]> {
    const startDate = new Date(date);
    const endDate = new Date(date);
    endDate.setHours(23, 59, 59, 999);

    if (user && query.instituteId) {
      InstituteAccessValidator.validateInstituteAccess(user, query.instituteId);
    }

    const queryBuilder = this.lectureRepository
      .createQueryBuilder('lecture')
      .where('lecture.startTime >= :startDate', { startDate })
      .andWhere('lecture.startTime <= :endDate', { endDate });

    this.applyFilters(queryBuilder, query);

    const lectures = await queryBuilder.orderBy('lecture.startTime', 'ASC').getMany();
    lectures.forEach(l => this.transformMaterialUrls(l));
    return lectures;
  }

  async createBulk(createDtos: CreateInstituteClassLectureDto[]): Promise<InstituteClassLectureEntity[]> {
    const timestamp = now();
    const lectures = createDtos.map(dto => {
      const startTime = new Date(dto.startTime);
      const endTime = new Date(dto.endTime);
      if (endTime <= startTime) {
        throw new BadRequestException(`End time must be after start time for lecture "${dto.title}"`);
      }
      return this.lectureRepository.create({
        instituteId: dto.instituteId,
        classId: dto.classId,
        instructorId: dto.instructorId,
        title: dto.title,
        description: dto.description,
        lectureType: dto.lectureType,
        venue: dto.venue,
        subject: dto.subject,
        startTime,
        endTime,
        status: dto.status || 'scheduled' as any,
        meetingLink: dto.meetingLink,
        meetingId: dto.meetingId,
        meetingPassword: dto.meetingPassword,
        recordingUrl: dto.recordingUrl,
        isRecorded: dto.isRecorded ?? false,
        maxParticipants: dto.maxParticipants,
        isActive: dto.isActive ?? true,
        materials: dto.materials ?? undefined,
        thumbnailUrl: dto.thumbnailUrl,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    });

    return await this.lectureRepository.save(lectures);
  }

  private applyFilters(queryBuilder: SelectQueryBuilder<InstituteClassLectureEntity>, filters: any): void {
    if (filters.instituteId) {
      queryBuilder.andWhere('lecture.instituteId = :instituteId', { instituteId: filters.instituteId });
    }
    if (filters.classId) {
      queryBuilder.andWhere('lecture.classId = :classId', { classId: filters.classId });
    }
    if (filters.instructorId) {
      queryBuilder.andWhere('lecture.instructorId = :instructorId', { instructorId: filters.instructorId });
    }
    if (filters.lectureType) {
      queryBuilder.andWhere('lecture.lectureType = :lectureType', { lectureType: filters.lectureType });
    }
    if (filters.status) {
      queryBuilder.andWhere('lecture.status = :status', { status: filters.status });
    }
    if (filters.dateFrom) {
      queryBuilder.andWhere('lecture.startTime >= :dateFrom', { dateFrom: filters.dateFrom });
    }
    if (filters.dateTo) {
      queryBuilder.andWhere('lecture.startTime <= :dateTo', { dateTo: filters.dateTo });
    }
    if (filters.isActive !== undefined) {
      queryBuilder.andWhere('lecture.isActive = :isActive', { isActive: filters.isActive });
    }
    if (filters.search) {
      queryBuilder.andWhere('(lecture.title LIKE :search OR lecture.description LIKE :search)', { search: `%${filters.search}%` });
    }
  }
}
