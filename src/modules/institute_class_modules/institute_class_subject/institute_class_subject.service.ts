import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { CreateInstituteClassSubjectDto, BulkCreateInstituteClassSubjectDto, SubjectBulkItemDto } from './dto/create-institute_class_subject.dto';
import { UpdateInstituteClassSubjectDto, UpdateEnrollmentKeyDto } from './dto/update-institute_class_subject.dto';
import { QueryInstituteClassSubjectDto } from './dto/query-institute-class-subject.dto';
import { InstituteClassSubjectResponseDto, PaginatedInstituteClassSubjectResponseDto, BulkInstituteClassSubjectResponseDto, InstituteClassSubjectSuccessResponseDto } from './dto/institute-class-subject-response.dto';
import { SubjectResponseDto } from '../../subject/dto/subject-response.dto';
import { InstituteClassSubjectRepository } from './repositories/institute-class-subject.repository';
import { IInstituteClassSubjectStats } from './interfaces/institute-class-subject.interface';
import { INSTITUTE_CLASS_SUBJECT_CONSTANTS } from './constants/institute-class-subject.constants';
import { UserManagementService } from '../../../common/services/cache-user-management.service';
import { CloudStorageService } from '../../../common/services/cloud-storage.service';

@Injectable()
export class InstituteClassSubjectService {
  constructor(
    private readonly instituteClassSubjectRepository: InstituteClassSubjectRepository,
    private readonly userManagementService: UserManagementService,
    private readonly cloudStorageService: CloudStorageService,
  ) {}

  async create(createDto: CreateInstituteClassSubjectDto): Promise<InstituteClassSubjectSuccessResponseDto> {
    // Check if assignment already exists
    const exists = await this.instituteClassSubjectRepository.existsByInstituteClassAndSubject(
        createDto.instituteId,
        createDto.classId,
        createDto.subjectId,
      );

      if (exists) {
        throw new ConflictException(INSTITUTE_CLASS_SUBJECT_CONSTANTS.ERRORS.ALREADY_EXISTS);
      }

      // Generate enrollment key if enrollment is enabled but no key provided
      const enrollmentData = this.handleEnrollmentSettings(
        createDto.enrollmentEnabled,
        createDto.enrollmentKey
      );

      // Use optimized create method that doesn't return the entity
      await this.instituteClassSubjectRepository.createOptimized({
        ...createDto,
        isActive: createDto.isActive ?? true,
        enrollmentEnabled: enrollmentData.enrollmentEnabled,
        enrollmentKey: enrollmentData.enrollmentKey,
      });

      // Return simple success response
      return {
        success: true,
        message: 'Subject successfully assigned to class',
      };
  }

  async bulkCreate(bulkCreateDto: BulkCreateInstituteClassSubjectDto): Promise<BulkInstituteClassSubjectResponseDto> {
    let assignedCount = 0;
    let skippedCount = 0;
    const errors: string[] = [];

    // Normalise both input formats into a unified list of per-subject entries
    type SubjectEntry = { subjectId: string; isActive?: boolean; enrollmentEnabled?: boolean; enrollmentKey?: string };
    let subjectEntries: SubjectEntry[];

    if (bulkCreateDto.subjects && bulkCreateDto.subjects.length > 0) {
      // Rich format: [{ subjectId, isActive?, enrollmentEnabled?, enrollmentKey? }]
      subjectEntries = bulkCreateDto.subjects;
    } else if (bulkCreateDto.subjectIds && bulkCreateDto.subjectIds.length > 0) {
      // Simple format: ["41", "42", ...] — use shared enrollment settings
      subjectEntries = bulkCreateDto.subjectIds.map(id => ({
        subjectId: id,
        enrollmentEnabled: bulkCreateDto.enrollmentEnabled,
        enrollmentKey: bulkCreateDto.enrollmentKey,
      }));
    } else {
      throw new BadRequestException('Either subjects or subjectIds must be provided and non-empty');
    }

    for (const entry of subjectEntries) {
      try {
        const exists = await this.instituteClassSubjectRepository.existsByInstituteClassAndSubject(
          bulkCreateDto.instituteId,
          bulkCreateDto.classId,
          entry.subjectId,
        );

        if (!exists) {
          const enrollmentData = this.handleEnrollmentSettings(
            entry.enrollmentEnabled,
            entry.enrollmentKey,
          );
          await this.instituteClassSubjectRepository.createOptimized({
            instituteId: bulkCreateDto.instituteId,
            classId: bulkCreateDto.classId,
            subjectId: entry.subjectId,
            teacherId: bulkCreateDto.defaultTeacherId || null,
            isActive: entry.isActive ?? true,
            enrollmentEnabled: enrollmentData.enrollmentEnabled,
            enrollmentKey: enrollmentData.enrollmentKey,
          });
          assignedCount++;
        } else {
          skippedCount++;
        }
      } catch (error) {
        errors.push(`Failed to assign subject ${entry.subjectId}: ${error.message}`);
      }
    }

    return {
      success: true,
      message: `Successfully processed ${subjectEntries.length} subjects: ${assignedCount} assigned, ${skippedCount} skipped`,
      assignedCount,
      skippedCount,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  async findAll(queryDto: QueryInstituteClassSubjectDto): Promise<PaginatedInstituteClassSubjectResponseDto> {
    const { page = 1, limit = 10, ...filters } = queryDto;

    const { data, total } = await this.instituteClassSubjectRepository.findWithPagination(
      page,
      limit,
      filters,
    );

    return {
      data: data.map(item => this.mapToResponseDto(item)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(instituteId: string, classId: string, subjectId: string): Promise<InstituteClassSubjectResponseDto> {
    const entity = await this.instituteClassSubjectRepository.findOneWithRelations(
      instituteId,
      classId,
      subjectId,
    );

    if (!entity) {
      throw new NotFoundException(INSTITUTE_CLASS_SUBJECT_CONSTANTS.ERRORS.NOT_FOUND);
    }

    return this.mapToResponseDto(entity);
  }

  /**
   * Update enrollment key for a specific class subject
   */
  async updateEnrollmentKey(
    instituteId: string,
    classId: string,
    subjectId: string,
    dto: UpdateEnrollmentKeyDto,
  ) {
    const existing = await this.instituteClassSubjectRepository.findOneWithRelations(
      instituteId,
      classId,
      subjectId,
    );

    if (!existing) {
      throw new NotFoundException(INSTITUTE_CLASS_SUBJECT_CONSTANTS.ERRORS.NOT_FOUND);
    }

    const enrollmentData = this.handleEnrollmentSettings(dto.enrollmentEnabled, dto.enrollmentKey);

    await this.instituteClassSubjectRepository.update(instituteId, classId, subjectId, {
      enrollmentEnabled: enrollmentData.enrollmentEnabled,
      enrollmentKey: enrollmentData.enrollmentKey,
    });

    return {
      subjectId: existing.subjectId,
      enrollmentEnabled: enrollmentData.enrollmentEnabled,
      enrollmentKey: enrollmentData.enrollmentEnabled ? (enrollmentData.enrollmentKey || null) : null,
    };
  }

  /**
   * Get enrollment key for a specific class subject
   */
  async getEnrollmentKey(instituteId: string, classId: string, subjectId: string) {
    const entity = await this.instituteClassSubjectRepository.findOneWithRelations(
      instituteId,
      classId,
      subjectId,
    );

    if (!entity) {
      throw new NotFoundException(INSTITUTE_CLASS_SUBJECT_CONSTANTS.ERRORS.NOT_FOUND);
    }

    return {
      subjectId: entity.subjectId,
      enrollmentEnabled: entity.enrollmentEnabled,
      enrollmentKey: entity.enrollmentEnabled ? (entity.enrollmentKey || null) : null,
    };
  }

  /**
   * PERFORMANCE OPTIMIZED: Get subjects for a user using existing cache
   * This method leverages your existing user access cache for 5-8x performance improvement
   * NOTE: Access cache removed - returns empty array
   */
  async findByUserContext(userId: string, instituteId?: string, classId?: string): Promise<InstituteClassSubjectResponseDto[]> {
    // Access cache removed - use database query directly
    if (instituteId && userId) {
      return this.findByInstituteAndTeacher(instituteId, userId);
    } else if (userId) {
      return this.findByTeacher(userId);
    }
    return [];
  }

  async update(
    instituteId: string,
    classId: string,
    subjectId: string,
    updateDto: UpdateInstituteClassSubjectDto,
  ): Promise<InstituteClassSubjectResponseDto> {
    const existing = await this.instituteClassSubjectRepository.findOneWithRelations(
      instituteId,
      classId,
      subjectId,
    );

    if (!existing) {
      throw new NotFoundException(INSTITUTE_CLASS_SUBJECT_CONSTANTS.ERRORS.NOT_FOUND);
    }

    // Handle enrollment settings if provided
    const updateData = { ...updateDto };
    if (updateDto.enrollmentEnabled !== undefined) {
      const enrollmentData = this.handleEnrollmentSettings(
        updateDto.enrollmentEnabled,
        updateDto.enrollmentKey
      );
      updateData.enrollmentEnabled = enrollmentData.enrollmentEnabled;
      updateData.enrollmentKey = enrollmentData.enrollmentKey;
    }

    const updated = await this.instituteClassSubjectRepository.update(
      instituteId,
      classId,
      subjectId,
      updateData,
    );

    return this.mapToResponseDto(updated);
  }

  async remove(instituteId: string, classId: string, subjectId: string): Promise<void> {
    // Get existing subject assignment to refresh teacher cache before deletion
    const existing = await this.instituteClassSubjectRepository.findOneWithRelations(
      instituteId,
      classId,
      subjectId,
    );

    await this.instituteClassSubjectRepository.delete(instituteId, classId, subjectId);
  }

  async findByInstituteAndClass(instituteId: string, classId: string): Promise<InstituteClassSubjectResponseDto[]> {
    // This method typically used for student/admin views - cache can't help much without user context
    // Keep original implementation for now, but add logging to identify usage patterns
    
    const entities = await this.instituteClassSubjectRepository.findByInstituteAndClass(
      instituteId,
      classId,
    );

    return entities.map(entity => this.mapToResponseDto(entity));
  }

  async findByTeacher(teacherId: string): Promise<InstituteClassSubjectResponseDto[]> {
    // Access cache removed - use database query
    const entities = await this.instituteClassSubjectRepository.findByTeacher(teacherId);
    return entities.map(entity => this.mapToResponseDto(entity));
  }

  async findByInstitute(instituteId: string): Promise<InstituteClassSubjectResponseDto[]> {
    const entities = await this.instituteClassSubjectRepository.findByInstitute(instituteId);
    return entities.map(entity => this.mapToResponseDto(entity));
  }

  async findByInstituteAndTeacher(instituteId: string, teacherId: string): Promise<InstituteClassSubjectResponseDto[]> {
    // Access cache removed - use database query
    const entities = await this.instituteClassSubjectRepository.findByInstituteAndTeacher(
      instituteId,
      teacherId
    );
    return entities.map(entity => this.mapToResponseDto(entity));
  }

  async findByInstituteClassAndTeacher(
    instituteId: string, 
    classId: string, 
    teacherId: string
  ): Promise<InstituteClassSubjectResponseDto[]> {
    const entities = await this.instituteClassSubjectRepository.findByInstituteClassAndTeacher(
      instituteId, 
      classId, 
      teacherId
    );
    return entities.map(entity => this.mapToResponseDto(entity));
  }

  async getStats(instituteId?: string): Promise<IInstituteClassSubjectStats> {
    return this.instituteClassSubjectRepository.getStats(instituteId);
  }

  private mapToResponseDto(entity: any): InstituteClassSubjectResponseDto {
    return {
      instituteId: entity.instituteId,
      classId: entity.classId,
      subjectId: entity.subjectId,
      teacherId: entity.teacherId,
      subject: entity.subject ? new SubjectResponseDto({
        id: entity.subject.id,
        code: entity.subject.code,
        name: entity.subject.name,
        description: entity.subject.description,
        category: entity.subject.category,
        creditHours: entity.subject.creditHours,
        isActive: entity.subject.isActive,
        subjectType: entity.subject.subjectType,
        basketCategory: entity.subject.basketCategory,
        instituteId: entity.subject.instituteId,
        imgUrl: entity.subject.imgUrl,
        createdAt: entity.subject.createdAt,
        updatedAt: entity.subject.updatedAt
      }) : undefined,
      class: entity.class ? {
        id: entity.class.id,
        name: entity.class.name,
        code: entity.class.code,
        grade: entity.class.grade,
        specialty: entity.class.specialty,
        classTeacherId: entity.class.classTeacherId,
      } : undefined,
      teacher: entity.teacher ? {
        id: entity.teacher.id,
        firstName: entity.teacher.firstName,
        lastName: entity.teacher.lastName,
        nameWithInitials: entity.teacher.nameWithInitials || undefined,
        email: entity.teacher.email,
        imageUrl: entity.teacher.imageUrl ? this.cloudStorageService.getFullUrl(entity.teacher.imageUrl) : null
      } : undefined,
      isActive: entity.isActive,
      enrollmentEnabled: entity.enrollmentEnabled || false,
      enrollmentKey: entity.enrollmentKey,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }

  /**
   * Handle enrollment settings
   * - enrollmentEnabled: true + enrollmentKey: null = Open enrollment (no key required)
   * - enrollmentEnabled: true + enrollmentKey: "XXXX" = Key-required enrollment
   * - enrollmentEnabled: false = Enrollment disabled (key cleared)
   */
  private handleEnrollmentSettings(enrollmentEnabled?: boolean, enrollmentKey?: string): { enrollmentEnabled: boolean; enrollmentKey?: string } {
    // If enrollment not specified, default to disabled
    if (enrollmentEnabled === undefined) {
      return { enrollmentEnabled: false, enrollmentKey: null };
    }

    // If enrollment enabled
    if (enrollmentEnabled) {
      // Use provided key or null (open enrollment)
      return { enrollmentEnabled: true, enrollmentKey: enrollmentKey || null };
    }

    // If enrollment disabled, clear the key
    return { enrollmentEnabled: false, enrollmentKey: null };
  }

  /**
   * Assign a teacher to a subject in a class
   */
  async assignTeacher(instituteId: string, classId: string, subjectId: string, teacherId: string) {
    const entity = await this.instituteClassSubjectRepository.findOneWithRelations(instituteId, classId, subjectId);
    
    if (!entity) {
      throw new NotFoundException(INSTITUTE_CLASS_SUBJECT_CONSTANTS.ERRORS.NOT_FOUND);
    }

    // Use direct update for composite primary keys
    const result = await this.instituteClassSubjectRepository.update(
      instituteId,
      classId,
      subjectId,
      { teacherId }
    );

    // Refresh teacher cache so they get immediate access
    await this.userManagementService.refreshUserCache(teacherId);

    return {
      success: true,
      message: 'Teacher assigned to subject successfully',
      data: {
        instituteId,
        classId,
        subjectId,
        teacherId
      }
    };
  }

  /**
   * Teacher self-enrolls to teach a subject in a class
   * - Checks enrollment is enabled for the subject
   * - Validates enrollment key if one is set
   * - Checks no teacher is already assigned (or allows if no teacher yet)
   * - Assigns the requesting teacher to the subject
   */
  async selfEnrollTeacher(
    instituteId: string,
    classId: string,
    subjectId: string,
    teacherId: string,
    enrollmentKey?: string,
  ) {
    const entity = await this.instituteClassSubjectRepository.findOneWithRelations(instituteId, classId, subjectId);

    if (!entity) {
      throw new NotFoundException(INSTITUTE_CLASS_SUBJECT_CONSTANTS.ERRORS.NOT_FOUND);
    }

    // Check if enrollment is enabled for this subject
    if (!entity.enrollmentEnabled) {
      throw new BadRequestException('Self-enrollment is not enabled for this subject. Please contact an institute admin.');
    }

    // Validate enrollment key if one is set on the subject
    if (entity.enrollmentKey && entity.enrollmentKey !== enrollmentKey) {
      throw new BadRequestException('Invalid enrollment key');
    }

    // Check if the subject already has a teacher assigned
    if (entity.teacherId) {
      if (entity.teacherId === teacherId) {
        throw new ConflictException('You are already assigned as the teacher for this subject');
      }
      throw new ConflictException('This subject already has a teacher assigned. Please contact an institute admin to change the assignment.');
    }

    // Assign the teacher - immediate access, no verification needed
    await this.instituteClassSubjectRepository.update(
      instituteId,
      classId,
      subjectId,
      { teacherId }
    );

    // Refresh teacher cache so they get immediate access to the subject
    await this.userManagementService.refreshUserCache(teacherId);

    return {
      success: true,
      message: 'Successfully self-enrolled as teacher for this subject. You now have immediate access.',
      data: {
        instituteId,
        classId,
        subjectId,
        teacherId,
      }
    };
  }

  /**
   * Unassign teacher from a subject in a class
   */
  async unassignTeacher(instituteId: string, classId: string, subjectId: string) {
    const entity = await this.instituteClassSubjectRepository.findOneWithRelations(instituteId, classId, subjectId);
    
    if (!entity) {
      throw new NotFoundException(INSTITUTE_CLASS_SUBJECT_CONSTANTS.ERRORS.NOT_FOUND);
    }

    await this.instituteClassSubjectRepository.update(
      instituteId,
      classId,
      subjectId,
      { teacherId: null }
    );

    return {
      success: true,
      message: 'Teacher unassigned from subject successfully',
      data: {
        instituteId,
        classId,
        subjectId
      }
    };
  }
}
