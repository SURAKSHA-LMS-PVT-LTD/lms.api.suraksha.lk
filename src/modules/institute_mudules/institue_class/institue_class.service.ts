import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { getCurrentSriLankaISO } from '../../../common/utils/timezone.util';
import { CreateInstitueClassDto } from './dto/create-institue_class.dto';
import { UpdateInstitueClassDto } from './dto/update-institue_class.dto';
import { InstituteClassRepository } from './repositories/institute-class.repository';
import { ClassFilterDto } from './dto/class-filter.dto';
import { PaginatedResponseDto } from '../../../common/dto/paginated-response.dto';
import { IInstituteClass } from './interfaces/institute-class.interface';
import { 
  INSTITUTE_CLASS_NOT_FOUND, 
  INSTITUTE_CLASS_CREATED,
  INSTITUTE_CLASS_UPDATED,
  INSTITUTE_CLASS_DELETED,
  INSTITUTE_CLASS_ACTIVATED,
  INSTITUTE_CLASS_DEACTIVATED,
  INSTITUTE_CLASS_ALREADY_EXISTS
} from './constants/institute-class.constants';
import { CloudStorageService } from '../../../common/services/cloud-storage.service';


@Injectable()
export class InstitueClassService {
  private readonly logger = new Logger(InstitueClassService.name);

  constructor(
    private readonly classRepository: InstituteClassRepository,
    private readonly dataSource: DataSource,
    private readonly cloudStorageService: CloudStorageService,
  ) {}

  async create(createInstitueClassDto: CreateInstitueClassDto, imageUrl?: string | null) {
    const { imageUrl: dtoImageUrl, ...classData } = createInstitueClassDto;
    const newClass = await this.classRepository.create({
      ...classData,
      // ✅ Use imageUrl from DTO if provided, otherwise use parameter (for backward compatibility)
      imageUrl: dtoImageUrl || imageUrl || null,
    });
    return {
      class: newClass,
      message: INSTITUTE_CLASS_CREATED
    };
  }

  /**
   * Update class image URL (for use after creating class with real ID)
   */
  async updateImageUrl(classId: string, imageUrl: string): Promise<void> {
    await this.classRepository.update(classId, { imageUrl });
  }

  async findAll(filterDto?: Partial<ClassFilterDto>) {
    const classes = await this.classRepository.findAll(filterDto);
    
    // ✅ Transform imageUrl to full URL for all classes
    return classes.map(classEntity => {
      if (classEntity.imageUrl) {
        classEntity.imageUrl = this.cloudStorageService.getFullUrl(classEntity.imageUrl);
      }
      return classEntity;
    });
  }

  async findAllPaginated(filterDto: ClassFilterDto): Promise<PaginatedResponseDto<IInstituteClass>> {
    const result = await this.classRepository.findAllPaginated(filterDto);
    
    // ✅ Transform imageUrl to full URL for all classes
    result.data = result.data.map(classEntity => {
      if (classEntity.imageUrl) {
        classEntity.imageUrl = this.cloudStorageService.getFullUrl(classEntity.imageUrl);
      }
      return classEntity;
    });
    
    return result;
  }

  async findOne(id: string, instituteId?: string) {
    let classEntity;
    
    if (instituteId) {
      // Institute-scoped lookup for security
      classEntity = await this.classRepository.findOneByInstitute(id, instituteId);
    } else {
      // General lookup (only for super admins)
      classEntity = await this.classRepository.findOne(id);
    }
    
    if (!classEntity) {
      throw new NotFoundException(INSTITUTE_CLASS_NOT_FOUND);
    }
    
    // ✅ Transform imageUrl to full URL for response
    if (classEntity.imageUrl) {
      classEntity.imageUrl = this.cloudStorageService.getFullUrl(classEntity.imageUrl);
    }
    
    return classEntity;
  }

  async update(id: string, updateInstitueClassDto: UpdateInstitueClassDto, instituteId?: string) {
    // Always validate institute access first
    const classEntity = await this.findOne(id, instituteId);
    
    if (instituteId && classEntity.instituteId !== instituteId) {
      throw new NotFoundException(INSTITUTE_CLASS_NOT_FOUND);
    }

    // Check if code is being updated and if it's unique within the institute
    if (updateInstitueClassDto.code && updateInstitueClassDto.code !== classEntity.code) {
      const isCodeUnique = await this.classRepository.isCodeUniqueInInstitute(
        updateInstitueClassDto.code, 
        classEntity.instituteId, 
        id
      );
      if (!isCodeUnique) {
        throw new BadRequestException(INSTITUTE_CLASS_ALREADY_EXISTS);
      }
    }
    
    // ✅ Extract imageUrl from DTO if provided
    const { imageUrl: dtoImageUrl, ...updateData } = updateInstitueClassDto;

    // Delete old S3 image when a new one is supplied and it differs
    if (dtoImageUrl !== undefined && classEntity.imageUrl && classEntity.imageUrl !== dtoImageUrl) {
      this.cloudStorageService.deleteFile(classEntity.imageUrl).catch(err =>
        this.logger.warn(`Failed to delete old class image: ${err.message}`),
      );
    }

    const dataToUpdate = {
      ...updateData,
      ...(dtoImageUrl !== undefined && { imageUrl: dtoImageUrl })
    };

    const updatedClass = await this.classRepository.update(id, dataToUpdate);
    
    // ✅ Transform imageUrl to full URL for response
    if (updatedClass && updatedClass.imageUrl) {
      updatedClass.imageUrl = this.cloudStorageService.getFullUrl(updatedClass.imageUrl);
    }
    
    return {
      class: updatedClass,
      message: INSTITUTE_CLASS_UPDATED
    };
  }

  async remove(id: string, instituteId?: string) {
    // Always validate institute access first
    const classEntity = await this.findOne(id, instituteId);
    
    if (instituteId && classEntity.instituteId !== instituteId) {
      throw new NotFoundException(INSTITUTE_CLASS_NOT_FOUND);
    }
    
    await this.classRepository.remove(id);
    return { message: INSTITUTE_CLASS_DELETED };
  }

  async findByInstitute(instituteId: string) {
    return await this.classRepository.findByInstitute(instituteId);
  }

  async findByAcademicYear(instituteId: string, academicYear: string) {
    return await this.classRepository.findByAcademicYear(instituteId, academicYear);
  }

  async findByGrade(instituteId: string, grade: number) {
    return await this.classRepository.findByGrade(instituteId, grade);
  }

  async findBySpecialty(instituteId: string, specialty: string) {
    return await this.classRepository.findBySpecialty(instituteId, specialty);
  }

  async findByTeacher(classTeacherId: string) {
    return await this.classRepository.findByTeacher(classTeacherId);
  }

  async getTeacherClasses(teacherId: string, instituteId: string, page: number = 1, limit: number = 10) {
    // Calculate pagination with bounds checking
    const offset = Math.max(0, (page - 1) * limit);

    // Enhanced secure parameterized query with mandatory institute filtering
    // Priority: Subject teaching classes first, then class teacher classes
    const query = `
      SELECT DISTINCT
        ic.institute_id as "instituteId",
        ic.id as "classId",
        ic.is_active as "isActive",
        COALESCE(ics.created_at, ic.created_at) as "assignedAt",
        
        -- Class details with XSS protection and image URL
        TRIM(ic.name) as "className",
        TRIM(ic.code) as "classCode",
        ic.grade as "classGrade",
        TRIM(ic.specialty) as "classSpecialty",
        TRIM(ic.academic_year) as "classAcademicYear",
        TRIM(ic.class_type) as "classType",
        TRIM(ic.image_url) as "classImageUrl",
        
        -- Teacher role with priority (subject teacher has priority over class teacher)
        CASE 
          WHEN ics.teacher_id = ? THEN 'SUBJECT_TEACHER'
          WHEN ic.class_teacher_id = ? THEN 'CLASS_TEACHER'
          ELSE 'UNKNOWN'
        END as "teacherRole",
        
        -- Priority for ordering (subject teacher = 1, class teacher = 2)
        CASE 
          WHEN ics.teacher_id = ? THEN 1
          WHEN ic.class_teacher_id = ? THEN 2
          ELSE 3
        END as "priority"
        
      FROM institute_classes ic
      LEFT JOIN institute_class_subjects ics ON (
        ics.class_id = ic.id 
        AND ics.teacher_id = ? 
        AND ics.is_active = true
      )
      WHERE ic.institute_id = ?
      AND ic.is_active = true
      AND (
        ics.teacher_id = ?       -- Subject teacher (priority 1)
        OR ic.class_teacher_id = ?  -- Class teacher (priority 2)
      )
      ORDER BY 
        "priority" ASC,  -- Subject teaching classes first
        COALESCE(ics.created_at, ic.created_at) DESC
      LIMIT ? OFFSET ?
    `;

    // Enhanced secure parameterized count query with institute filtering
    const countQuery = `
      SELECT COUNT(DISTINCT ic.id) as total
      FROM institute_classes ic
      LEFT JOIN institute_class_subjects ics ON (
        ics.class_id = ic.id 
        AND ics.teacher_id = ? 
        AND ics.is_active = true
      )
      WHERE ic.institute_id = ?
      AND ic.is_active = true
      AND (
        ics.teacher_id = ?       -- Subject teacher
        OR ic.class_teacher_id = ?  -- Class teacher
      )
    `;

    // Execute secure parameterized queries with institute ID validation
    // Query parameters: teacherId (CASE 1), teacherId (CASE 2), teacherId (CASE 3), teacherId (CASE 4), teacherId (JOIN), instituteId, teacherId (WHERE subject), teacherId (WHERE class), limit, offset
    const [result, countResult] = await Promise.all([
      this.dataSource.query(query, [teacherId, teacherId, teacherId, teacherId, teacherId, instituteId, teacherId, teacherId, limit, offset]),
      this.dataSource.query(countQuery, [teacherId, instituteId, teacherId, teacherId])
    ]);

    const total = parseInt(countResult[0]?.total || '0');

    // Enhanced data sanitization with XSS prevention and institute validation
    const data = result.map((row: any) => ({
      instituteId: String(row.instituteId || ''),
      classId: String(row.classId || ''),
      isActive: Boolean(row.isActive),
      assignedAt: row.assignedAt || null,
      teacherRole: String(row.teacherRole || 'UNKNOWN'), // SUBJECT_TEACHER (priority) or CLASS_TEACHER
      priority: parseInt(row.priority || '3'), // 1 = Subject teacher, 2 = Class teacher, 3 = Unknown
      class: {
        id: String(row.classId || ''),
        name: this.sanitizeString(String(row.className || '').trim()),
        code: this.sanitizeString(String(row.classCode || '').trim()),
        grade: row.classGrade ? parseInt(row.classGrade) : null,
        specialty: this.sanitizeString(String(row.classSpecialty || '').trim()),
        academicYear: this.sanitizeString(String(row.classAcademicYear || '').trim()),
        classType: this.sanitizeString(String(row.classType || '').trim()),
        imageUrl: row.classImageUrl ? this.sanitizeImageUrl(String(row.classImageUrl).trim()) : null
      }
    })).filter(item => {
      // Validate institute ID matches request and filter out invalid entries
      return item.classId && item.instituteId === instituteId;
    });

    return {
      data,
      total,
      page,
      limit,
      instituteId,
      timestamp: getCurrentSriLankaISO(),
    };
  }

  private sanitizeString(input: string): string {
    if (!input || typeof input !== 'string') {
      return '';
    }
    // Basic XSS prevention - escape HTML entities
    return input
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;');
  }

  private sanitizeImageUrl(input: string): string {
    if (!input || typeof input !== 'string') {
      return '';
    }
    
    // For image URLs, we need to preserve forward slashes and other URL characters
    // Only escape the most dangerous characters for XSS prevention
    const trimmed = input.trim();
    
    // Accept both full URLs and relative paths
    // Full URLs: https://storage.googleapis.com/bucket/image.jpg
    // Relative paths: institute-images/image-uuid.jpg
    const isFullUrl = trimmed.match(/^https?:\/\//);
    const isRelativePath = trimmed.match(/^[a-zA-Z0-9\-_]+\/[a-zA-Z0-9\-_.\/]+$/);
    
    if (!isFullUrl && !isRelativePath) {
      return ''; // Return empty string for invalid formats
    }
    
    // Minimal sanitization - only escape script-dangerous characters
    return trimmed
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;');
  }

  async findActive(instituteId: string) {
    return await this.classRepository.findActive(instituteId);
  }

  async activate(id: string) {
    const classEntity = await this.classRepository.findOne(id);
    if (!classEntity) {
      throw new NotFoundException(INSTITUTE_CLASS_NOT_FOUND);
    }
    
    if (classEntity.isActive) {
      return {
        class: classEntity,
        message: 'Class is already active'
      };
    }
    
    const activatedClass = await this.classRepository.activate(id);

    // ✅ Transform imageUrl to full URL for response
    if (activatedClass && activatedClass.imageUrl) {
      activatedClass.imageUrl = this.cloudStorageService.getFullUrl(activatedClass.imageUrl);
    }

    return {
      class: activatedClass,
      message: INSTITUTE_CLASS_ACTIVATED
    };
  }

  async deactivate(id: string) {
    const classEntity = await this.classRepository.findOne(id);
    if (!classEntity) {
      throw new NotFoundException(INSTITUTE_CLASS_NOT_FOUND);
    }
    
    if (!classEntity.isActive) {
      return {
        class: classEntity,
        message: 'Class is already inactive'
      };
    }
    
    const deactivatedClass = await this.classRepository.deactivate(id);

    // ✅ Transform imageUrl to full URL for response
    if (deactivatedClass && deactivatedClass.imageUrl) {
      deactivatedClass.imageUrl = this.cloudStorageService.getFullUrl(deactivatedClass.imageUrl);
    }

    return {
      class: deactivatedClass,
      message: INSTITUTE_CLASS_DEACTIVATED
    };
  }

  // Self-enrollment methods - Updated to use enrollmentCode
  async isEnrollmentActive(classId: string): Promise<boolean> {
    const classEntity = await this.classRepository.findOne(classId);
    if (!classEntity) {
      return false;
    }

    return !!(classEntity.enrollmentCode && classEntity.enrollmentEnabled);
  }

  async getEnrollmentSettings(classId: string) {
    const classEntity = await this.classRepository.findOne(classId);
    if (!classEntity) {
      throw new NotFoundException(INSTITUTE_CLASS_NOT_FOUND);
    }

    return {
      enrollmentCode: classEntity.enrollmentCode,
      enrollmentEnabled: classEntity.enrollmentEnabled,
      requireTeacherVerification: classEntity.requireTeacherVerification,
      isActive: !!(classEntity.enrollmentCode && classEntity.enrollmentEnabled)
    };
  }

  // Self-enrollment management methods
  async enableSelfEnrollment(
    classId: string,
    enrollmentCode: string,
    requireTeacherVerification: boolean = true
  ) {
    const classEntity = await this.classRepository.findOne(classId);
    if (!classEntity) {
      throw new NotFoundException(INSTITUTE_CLASS_NOT_FOUND);
    }

    const updated = await this.classRepository.update(classId, {
      enrollmentCode,
      enrollmentEnabled: true,
      requireTeacherVerification
    });

    if (!updated) {
      throw new BadRequestException('Failed to enable self-enrollment');
    }

    return {
      message: 'Self-enrollment enabled successfully',
      enrollmentCode,
      enrollmentEnabled: true,
      requireTeacherVerification
    };
  }

  async disableSelfEnrollment(classId: string) {
    const classEntity = await this.classRepository.findOne(classId);
    if (!classEntity) {
      throw new NotFoundException(INSTITUTE_CLASS_NOT_FOUND);
    }

    const updated = await this.classRepository.update(classId, {
      enrollmentEnabled: false,
      enrollmentCode: null
    });

    if (!updated) {
      throw new BadRequestException('Failed to disable self-enrollment');
    }

    return {
      message: 'Self-enrollment disabled successfully',
      enrollmentEnabled: false
    };
  }

  // Add method for finding by enrollment code
  async findByEnrollmentCode(enrollmentCode: string): Promise<IInstituteClass | null> {
    return this.classRepository.findByEnrollmentCode(enrollmentCode);
  }

  /**
   * Update class image
   * @param classId - Class ID
   * @param imageUrl - Image URL from signed URL upload
   * @returns Success response with new image URL
   */
  async updateClassImage(
    classId: string,
    imageUrl: string,
  ): Promise<{ success: boolean; message: string; imageUrl: string }> {
    try {
      // Find the class
      const classEntity = await this.classRepository.findOne(classId);
      if (!classEntity) {
        throw new NotFoundException(INSTITUTE_CLASS_NOT_FOUND);
      }

      if (!imageUrl || typeof imageUrl !== 'string') {
        throw new BadRequestException('imageUrl is required');
      }

      // Delete old image if exists
      if (classEntity.imageUrl) {
        try {
          await this.cloudStorageService.deleteFile(classEntity.imageUrl);
        } catch (error) {
          this.logger.warn(`Failed to delete old class image: ${error.message}`);
          // Continue even if old image deletion fails
        }
      }

      // Update class with new image URL
      await this.classRepository.update(classId, {
        imageUrl
      });

      return {
        success: true,
        message: 'Class image updated successfully',
        imageUrl
      };
    } catch (error) {
      this.logger.error(`Failed to update class image: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Assign a teacher to a class
   */
  async assignTeacher(classId: string, teacherId: string) {
    const classEntity = await this.classRepository.findOne(classId);
    if (!classEntity) {
      throw new NotFoundException(INSTITUTE_CLASS_NOT_FOUND);
    }

    await this.classRepository.update(classId, { classTeacherId: teacherId });

    return {
      success: true,
      message: 'Teacher assigned to class successfully',
      data: {
        classId,
        teacherId
      }
    };
  }

  /**
   * Unassign teacher from a class
   */
  async unassignTeacher(classId: string) {
    const classEntity = await this.classRepository.findOne(classId);
    if (!classEntity) {
      throw new NotFoundException(INSTITUTE_CLASS_NOT_FOUND);
    }

    await this.classRepository.update(classId, { classTeacherId: null });

    return {
      success: true,
      message: 'Teacher unassigned from class successfully',
      data: {
        classId
      }
    };
  }
}
