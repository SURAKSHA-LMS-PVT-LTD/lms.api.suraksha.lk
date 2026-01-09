import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { CreateInstituteClassSubjectDto, BulkCreateInstituteClassSubjectDto } from './dto/create-institute_class_subject.dto';
import { UpdateInstituteClassSubjectDto } from './dto/update-institute_class_subject.dto';
import { QueryInstituteClassSubjectDto } from './dto/query-institute-class-subject.dto';
import { InstituteClassSubjectResponseDto, PaginatedInstituteClassSubjectResponseDto, BulkInstituteClassSubjectResponseDto, InstituteClassSubjectSuccessResponseDto } from './dto/institute-class-subject-response.dto';
import { SubjectResponseDto } from '../../subject/dto/subject-response.dto';
import { InstituteClassSubjectRepository } from './repositories/institute-class-subject.repository';
import { IInstituteClassSubjectStats } from './interfaces/institute-class-subject.interface';
import { INSTITUTE_CLASS_SUBJECT_CONSTANTS } from './constants/institute-class-subject.constants';

@Injectable()
export class InstituteClassSubjectService {
  constructor(
    private readonly instituteClassSubjectRepository: InstituteClassSubjectRepository,
  ) {}

  async create(createDto: CreateInstituteClassSubjectDto): Promise<InstituteClassSubjectSuccessResponseDto> {
    try {
      // Check if assignment already exists
      const exists = await this.instituteClassSubjectRepository.existsByInstituteClassAndSubject(
        createDto.instituteId,
        createDto.classId,
        createDto.subjectId,
      );

      if (exists) {
        throw new ConflictException(INSTITUTE_CLASS_SUBJECT_CONSTANTS.ERRORS.ALREADY_EXISTS);
      }

      // Use optimized create method that doesn't return the entity
      await this.instituteClassSubjectRepository.createOptimized({
        ...createDto,
        isActive: createDto.isActive ?? true,
      });

      // Return simple success response
      return {
        success: true,
        message: 'Subject successfully assigned to class',
      };
    } catch (error) {
      throw error;
    }
  }

  async bulkCreate(bulkCreateDto: BulkCreateInstituteClassSubjectDto): Promise<BulkInstituteClassSubjectResponseDto> {
    let assignedCount = 0;
    let skippedCount = 0;
    const errors: string[] = [];

    for (const subjectId of bulkCreateDto.subjectIds) {
      try {
        const exists = await this.instituteClassSubjectRepository.existsByInstituteClassAndSubject(
          bulkCreateDto.instituteId,
          bulkCreateDto.classId,
          subjectId,
        );

        if (!exists) {
          // Use optimized create method - no unnecessary SELECT queries
          await this.instituteClassSubjectRepository.createOptimized({
            instituteId: bulkCreateDto.instituteId,
            classId: bulkCreateDto.classId,
            subjectId,
            teacherId: bulkCreateDto.defaultTeacherId || null,
            isActive: true,
          });
          assignedCount++;
        } else {
          skippedCount++;
        }
      } catch (error) {
        errors.push(`Failed to assign subject ${subjectId}: ${error.message}`);
      }
    }

    // Return optimized response
    return {
      success: true,
      message: `Successfully processed ${bulkCreateDto.subjectIds.length} subjects: ${assignedCount} assigned, ${skippedCount} skipped`,
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

    const updated = await this.instituteClassSubjectRepository.update(
      instituteId,
      classId,
      subjectId,
      updateDto,
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
        email: entity.teacher.email,
        imageUrl: entity.teacher.imageUrl
      } : undefined,
      isActive: entity.isActive,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
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
