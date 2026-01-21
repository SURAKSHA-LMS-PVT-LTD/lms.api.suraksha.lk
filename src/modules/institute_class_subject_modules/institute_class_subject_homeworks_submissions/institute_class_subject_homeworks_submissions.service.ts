import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder, Not, IsNull } from 'typeorm';
import { now } from '../../../common/utils/timezone.util';
import { CreateInstituteClassSubjectHomeworksSubmissionDto } from './dto/create-institute_class_subject_homeworks_submission.dto';
import { UpdateInstituteClassSubjectHomeworksSubmissionDto } from './dto/update-institute_class_subject_homeworks_submission.dto';
import { QueryInstituteClassSubjectHomeworksSubmissionDto } from './dto/query-institute_class_subject_homeworks_submission.dto';
import { InstituteClassSubjectHomeworksSubmissionResponseDto } from './dto/institute_class_subject_homeworks_submission-response.dto';
import { InstituteClassSubjectHomeworksSubmission } from './entities/institute_class_subject_homeworks_submission.entity';
import { InstituteClassSubjectHomework } from '../institute_class_subject_homeworks/entities/institute_class_subject_homework.entity';
import { PaginatedResponseDto } from '../../../common/dto/paginated-response.dto';
import { InstituteAccessValidator, ROLE_BITMASKS } from '../../../common/helpers/institute-access-validator.helper';
import { CloudStorageService } from '../../../common/services/cloud-storage.service';
import { GoogleAuthService } from '../../google-auth/google-auth.service';

@Injectable()
export class InstituteClassSubjectHomeworksSubmissionsService {
  constructor(
    @InjectRepository(InstituteClassSubjectHomeworksSubmission)
    private readonly submissionRepository: Repository<InstituteClassSubjectHomeworksSubmission>,
    @InjectRepository(InstituteClassSubjectHomework)
    private readonly homeworkRepository: Repository<InstituteClassSubjectHomework>,
    private readonly cloudStorageService: CloudStorageService,
    private readonly googleAuthService: GoogleAuthService,
  ) {}

  async create(createDto: CreateInstituteClassSubjectHomeworksSubmissionDto): Promise<InstituteClassSubjectHomeworksSubmissionResponseDto> {
    try {
      const timestamp = now();
      const submissionData = {
        homeworkId: createDto.homeworkId,
        studentId: createDto.studentId,
        submissionDate: createDto.submissionDate ? new Date(createDto.submissionDate) : new Date(),
        fileUrl: createDto.fileUrl || '',
        teacherCorrectionFileUrl: createDto.teacherCorrectionFileUrl || '',
        remarks: createDto.remarks || null,
        isActive: createDto.isActive ?? true,
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      const submission = this.submissionRepository.create(submissionData);
      const savedSubmission = await this.submissionRepository.save(submission);

      return InstituteClassSubjectHomeworksSubmissionResponseDto.fromEntity(savedSubmission, this.cloudStorageService);
    } catch (error) {
      throw new BadRequestException(`Failed to create homework submission: ${error.message}`);
    }
  }

  async findAll(queryDto: QueryInstituteClassSubjectHomeworksSubmissionDto, user?: any): Promise<PaginatedResponseDto<InstituteClassSubjectHomeworksSubmissionResponseDto>> {
    const { page = 1, limit = 10, ...filters } = queryDto;
    const skip = (page - 1) * limit;

    // SECURITY: Validate user has access to requested institute, class, and subject
    if (user && filters.instituteId) {
      // Validate institute access first
      InstituteAccessValidator.validateInstituteAccess(user, filters.instituteId);
      
      // Validate class access if classId is provided
      if (filters.classId) {
        const userInstituteAccess = Array.isArray(user.i) ? user.i : [];
        const instituteEntry = userInstituteAccess.find((entry: any) => entry.i === filters.instituteId);
        
        if (instituteEntry && Array.isArray(instituteEntry.c)) {
          const classSubjectEntry = instituteEntry.c.find(
            ([classId]: [string, number]) => classId === filters.classId
          );
          
          if (!classSubjectEntry) {
            throw new ForbiddenException(`You do not have access to class ${filters.classId} in institute ${filters.instituteId}`);
          }
          
          // If subjectId is also provided, validate subject access using bitmask
          if (filters.subjectId) {
            const [classId, subjectBitmask] = classSubjectEntry;
            const subjectIdNum = parseInt(filters.subjectId, 10);
            const hasSubjectAccess = (subjectBitmask & subjectIdNum) !== 0 || subjectBitmask === subjectIdNum;
            
            if (!hasSubjectAccess) {
              throw new ForbiddenException(`You do not have access to subject ${filters.subjectId} in class ${filters.classId}`);
            }
          }
        }
      }
    }

    const queryBuilder = this.submissionRepository
      .createQueryBuilder('submission')
      .leftJoin('submission.homework', 'homework')
      .addSelect([
        'homework.id',
        'homework.title',
        'homework.description',
        'homework.endDate',
        'homework.isActive'
      ])
      .leftJoinAndSelect('submission.student', 'student');

    this.applyFilters(queryBuilder, filters);

    const [submissions, total] = await queryBuilder
      .skip(skip)
      .take(limit)
      .orderBy('submission.submissionDate', 'DESC')
      .getManyAndCount();

    const submissionDtos = submissions.map(submission => 
      InstituteClassSubjectHomeworksSubmissionResponseDto.fromEntity(submission, this.cloudStorageService)
    );

    return new PaginatedResponseDto(submissionDtos, page, limit, total);
  }

  async findOne(id: string): Promise<InstituteClassSubjectHomeworksSubmissionResponseDto> {
    const submission = await this.submissionRepository
      .createQueryBuilder('submission')
      .leftJoin('submission.homework', 'homework')
      .addSelect([
        'homework.id',
        'homework.title',
        'homework.description',
        'homework.endDate',
        'homework.isActive'
      ])
      .leftJoinAndSelect('submission.student', 'student')
      .where('submission.id = :id', { id })
      .getOne();

    if (!submission) {
      throw new NotFoundException(`Homework submission with ID ${id} not found`);
    }

    return InstituteClassSubjectHomeworksSubmissionResponseDto.fromEntity(submission, this.cloudStorageService);
  }

  async update(id: string, updateDto: UpdateInstituteClassSubjectHomeworksSubmissionDto): Promise<InstituteClassSubjectHomeworksSubmissionResponseDto> {
    const submission = await this.submissionRepository.findOne({ where: { id } });
    
    if (!submission) {
      throw new NotFoundException(`Homework submission with ID ${id} not found`);
    }

    try {
      const updateData: any = {};
      
      if (updateDto.homeworkId !== undefined) updateData.homeworkId = updateDto.homeworkId;
      if (updateDto.studentId !== undefined) updateData.studentId = updateDto.studentId;
      if (updateDto.submissionDate !== undefined) updateData.submissionDate = updateDto.submissionDate ? new Date(updateDto.submissionDate) : null;
      
      // ✅ Handle file URL updates - ensure empty string instead of undefined/null
      if (updateDto.fileUrl !== undefined) {
        updateData.fileUrl = updateDto.fileUrl || '';
      }
      if (updateDto.teacherCorrectionFileUrl !== undefined) {
        updateData.teacherCorrectionFileUrl = updateDto.teacherCorrectionFileUrl || '';
      }
      
      // ✅ Handle remarks - ensure null instead of undefined for empty values
      if (updateDto.remarks !== undefined) {
        updateData.remarks = updateDto.remarks?.trim() || null;
      }
      
      if (updateDto.isActive !== undefined) updateData.isActive = updateDto.isActive;

      await this.submissionRepository.update(id, updateData);
      
      const updatedSubmission = await this.submissionRepository
        .createQueryBuilder('submission')
        .leftJoin('submission.homework', 'homework')
        .addSelect([
          'homework.id',
          'homework.title',
          'homework.description',
          'homework.endDate',
          'homework.isActive'
        ])
        .where('submission.id = :id', { id })
        .getOne();

      return InstituteClassSubjectHomeworksSubmissionResponseDto.fromEntity(updatedSubmission!, this.cloudStorageService);
    } catch (error) {
      throw new BadRequestException(`Failed to update homework submission: ${error.message}`);
    }
  }

  async remove(id: string): Promise<void> {
    const submission = await this.submissionRepository.findOne({ where: { id } });
    
    if (!submission) {
      throw new NotFoundException(`Homework submission with ID ${id} not found`);
    }

    await this.submissionRepository.delete(id);
  }

  async findOneWithDetails(id: string): Promise<any> {
    const submission = await this.submissionRepository
      .createQueryBuilder('submission')
      .leftJoin('submission.homework', 'homework')
      .leftJoin('submission.student', 'student')
      .addSelect([
        'homework.id',
        'homework.title',
        'homework.description',
        'homework.endDate',
        'homework.isActive'
      ])
      .addSelect([
        'student.id',
        'student.firstName',
        'student.lastName',
        'student.email',
        'student.isActive'
      ])
      .where('submission.id = :id', { id })
      .getOne();

    if (!submission) {
      throw new NotFoundException(`Homework submission with ID ${id} not found`);
    }

    // ✅ Transform URLs before returning
    return InstituteClassSubjectHomeworksSubmissionResponseDto.fromEntity(submission, this.cloudStorageService);
  }

  async findAllRaw(): Promise<any[]> {
    return await this.submissionRepository
      .createQueryBuilder('submission')
      .leftJoin('submission.homework', 'homework')
      .leftJoin('submission.student', 'student')
      .addSelect([
        'homework.id',
        'homework.title',
        'homework.description',
        'homework.endDate',
        'homework.isActive'
      ])
      .addSelect([
        'student.id',
        'student.firstName',
        'student.lastName',
        'student.email',
        'student.isActive'
      ])
      .getMany();
  }

  async getStats(): Promise<any> {
    const total = await this.submissionRepository.count();
    const active = await this.submissionRepository.count({ where: { isActive: true } });
    const withFiles = await this.submissionRepository.count({ where: { fileUrl: Not(IsNull()) } });
    const withCorrections = await this.submissionRepository.count({ where: { teacherCorrectionFileUrl: Not(IsNull()) } });

    return {
      total,
      active,
      inactive: total - active,
      withFiles,
      withCorrections,
    };
  }

  private applyFilters(queryBuilder: SelectQueryBuilder<InstituteClassSubjectHomeworksSubmission>, filters: any): void {
    if (filters.homeworkId) {
      queryBuilder.andWhere('submission.homeworkId = :homeworkId', { homeworkId: filters.homeworkId });
    }

    if (filters.studentId) {
      queryBuilder.andWhere('submission.studentId = :studentId', { studentId: filters.studentId });
    }

    if (filters.instituteId) {
      queryBuilder.andWhere('homework.instituteId = :instituteId', { instituteId: filters.instituteId });
    }

    if (filters.classId) {
      queryBuilder.andWhere('homework.classId = :classId', { classId: filters.classId });
    }

    if (filters.subjectId) {
      queryBuilder.andWhere('homework.subjectId = :subjectId', { subjectId: filters.subjectId });
    }

    if (filters.teacherId) {
      queryBuilder.andWhere('homework.teacherId = :teacherId', { teacherId: filters.teacherId });
    }

    if (filters.submissionDateFrom) {
      queryBuilder.andWhere('submission.submissionDate >= :submissionDateFrom', { submissionDateFrom: filters.submissionDateFrom });
    }

    if (filters.submissionDateTo) {
      queryBuilder.andWhere('submission.submissionDate <= :submissionDateTo', { submissionDateTo: filters.submissionDateTo });
    }

    if (filters.isActive !== undefined) {
      queryBuilder.andWhere('submission.isActive = :isActive', { isActive: filters.isActive });
    }

    if (filters.hasFile !== undefined) {
      if (filters.hasFile) {
        queryBuilder.andWhere('submission.fileUrl IS NOT NULL AND submission.fileUrl != \'\'');
      } else {
        queryBuilder.andWhere('(submission.fileUrl IS NULL OR submission.fileUrl = \'\')');
      }
    }

    if (filters.hasTeacherCorrection !== undefined) {
      if (filters.hasTeacherCorrection) {
        queryBuilder.andWhere('submission.teacherCorrectionFileUrl IS NOT NULL AND submission.teacherCorrectionFileUrl != \'\'');
      } else {
        queryBuilder.andWhere('(submission.teacherCorrectionFileUrl IS NULL OR submission.teacherCorrectionFileUrl = \'\')');
      }
    }

    if (filters.remarksSearch) {
      queryBuilder.andWhere('submission.remarks LIKE :remarksSearch', { remarksSearch: `%${filters.remarksSearch}%` });
    }
  }

  async getHomeworkDetails(homeworkId: string): Promise<{ 
    id: string;
    instituteId: string; 
    classId: string; 
    subjectId: string; 
    startDate?: Date; 
    endDate?: Date;
    title: string;
    description?: string;
  } | null> {
    try {
      // Query the homework table directly to get homework details
      const homework = await this.homeworkRepository.findOne({
        where: { id: homeworkId }
      });

      if (!homework) {
        return null;
      }

      // Return the homework details needed for validation
      return {
        id: homework.id,
        instituteId: homework.instituteId,
        classId: homework.classId,
        subjectId: homework.subjectId,
        startDate: homework.startDate,
        endDate: homework.endDate,
        title: homework.title,
        description: homework.description
      };
    } catch (error) {
      throw new BadRequestException(`Failed to get homework details: ${error.message}`);
    }
  }

  async createOrUpdateSubmission(submissionData: {
    homeworkId: string;
    studentId: string;
    fileUrl: string;
    submissionDate: Date;
    isActive: boolean;
  }): Promise<InstituteClassSubjectHomeworksSubmissionResponseDto> {
    try {
      // Check if submission already exists
      const existingSubmission = await this.submissionRepository.findOne({
        where: {
          homeworkId: submissionData.homeworkId,
          studentId: submissionData.studentId
        }
      });

      if (existingSubmission) {
        // Update existing submission
        existingSubmission.fileUrl = submissionData.fileUrl;
        existingSubmission.submissionDate = submissionData.submissionDate;
        existingSubmission.isActive = submissionData.isActive;
        existingSubmission.updatedAt = new Date();

        const updatedSubmission = await this.submissionRepository.save(existingSubmission);
        return InstituteClassSubjectHomeworksSubmissionResponseDto.fromEntity(updatedSubmission, this.cloudStorageService);
      } else {
        // Create new submission
        const timestamp = now();
        const newSubmission = this.submissionRepository.create({
          homeworkId: submissionData.homeworkId,
          studentId: submissionData.studentId,
          fileUrl: submissionData.fileUrl,
          submissionDate: submissionData.submissionDate,
          isActive: submissionData.isActive,
          createdAt: timestamp,
          updatedAt: timestamp,
        });

        const savedSubmission = await this.submissionRepository.save(newSubmission);
        return InstituteClassSubjectHomeworksSubmissionResponseDto.fromEntity(savedSubmission, this.cloudStorageService);
      }
    } catch (error) {
      throw new BadRequestException(`Failed to create or update homework submission: ${error.message}`);
    }
  }

  async getSubmissionsBySubject(
    instituteId: string,
    classId: string,
    subjectId: string,
    queryDto: QueryInstituteClassSubjectHomeworksSubmissionDto
  ): Promise<PaginatedResponseDto<InstituteClassSubjectHomeworksSubmissionResponseDto>> {
    const { page = 1, limit = 10, ...filters } = queryDto;
    const skip = (page - 1) * limit;

    const queryBuilder = this.submissionRepository
      .createQueryBuilder('submission')
      .leftJoin('submission.homework', 'homework')
      .leftJoin('submission.student', 'student')
      .addSelect([
        'homework.id',
        'homework.title',
        'homework.description',
        'homework.endDate',
        'homework.isActive'
      ])
      .addSelect([
        'student.id',
        'student.firstName',
        'student.lastName',
        'student.email',
        'student.isActive'
      ])
      .where('homework.instituteId = :instituteId', { instituteId })
      .andWhere('homework.classId = :classId', { classId })
      .andWhere('homework.subjectId = :subjectId', { subjectId });

    this.applyFilters(queryBuilder, filters);

    const [submissions, total] = await queryBuilder
      .skip(skip)
      .take(limit)
      .orderBy('submission.submissionDate', 'DESC')
      .getManyAndCount();

    const submissionDtos = submissions.map(submission => 
      InstituteClassSubjectHomeworksSubmissionResponseDto.fromEntity(submission, this.cloudStorageService)
    );

    return new PaginatedResponseDto(submissionDtos, page, limit, total);
  }

  async getSubmissionWithHomework(submissionId: string): Promise<any> {
    const submission = await this.submissionRepository
      .createQueryBuilder('submission')
      .leftJoin('submission.homework', 'homework')
      .leftJoin('submission.student', 'student')
      .addSelect([
        'homework.id',
        'homework.title',
        'homework.description',
        'homework.endDate',
        'homework.isActive'
      ])
      .addSelect([
        'student.id',
        'student.firstName',
        'student.lastName',
        'student.email',
        'student.isActive'
      ])
      .where('submission.id = :submissionId', { submissionId })
      .getOne();

    if (!submission) {
      throw new NotFoundException(`Homework submission with ID ${submissionId} not found`);
    }

    // ✅ Transform URLs before returning
    return InstituteClassSubjectHomeworksSubmissionResponseDto.fromEntity(submission, this.cloudStorageService);
  }

  async reviewSubmission(
    submissionId: string,
    reviewData: {
      remarks?: string;
      requestResubmission?: boolean;
      grade?: string;
      reviewerId: string;
      reviewDate: Date;
    }
  ): Promise<any> {
    const submission = await this.submissionRepository.findOne({ 
      where: { id: submissionId } 
    });

    if (!submission) {
      throw new NotFoundException(`Homework submission with ID ${submissionId} not found`);
    }

    try {
      const updateData: any = {
        updatedAt: new Date()
      };

      if (reviewData.remarks !== undefined) {
        updateData.remarks = reviewData.remarks;
      }

      // If requesting resubmission, mark as needing resubmission
      if (reviewData.requestResubmission) {
        updateData.remarks = `${updateData.remarks || ''}\n\n[RESUBMISSION REQUESTED]`.trim();
        // You might want to add a specific field for resubmission status
      }

      await this.submissionRepository.update(submissionId, updateData);

      return {
        success: true,
        message: 'Homework submission reviewed successfully',
        data: {
          submissionId: submissionId,
          remarks: updateData.remarks,
          requestResubmission: reviewData.requestResubmission || false,
          reviewDate: reviewData.reviewDate
        }
      };
    } catch (error) {
      throw new BadRequestException(`Failed to review homework submission: ${error.message}`);
    }
  }

  /**
   * Submit homework via Google Drive
   * IMPORTANT: Access token is used only for validation, NOT stored
   */
  async submitViaGoogleDrive(
    studentId: string,
    homeworkId: string,
    driveFileId: string,
    accessToken: string,
    fileName?: string,
    mimeType?: string
  ): Promise<InstituteClassSubjectHomeworksSubmissionResponseDto> {
    // Validate homework exists
    const homework = await this.homeworkRepository.findOne({ 
      where: { id: homeworkId } 
    });

    if (!homework) {
      throw new NotFoundException(`Homework with ID ${homeworkId} not found`);
    }

    // Check if student already submitted for this homework
    const existingSubmission = await this.submissionRepository.findOne({
      where: { 
        homeworkId, 
        studentId 
      }
    });

    if (existingSubmission) {
      throw new BadRequestException(
        'You have already submitted homework for this assignment. Delete the existing submission first to resubmit.'
      );
    }

    // Verify file exists in Google Drive
    const fileExists = await this.googleAuthService.verifyFileExists(
      driveFileId,
      accessToken
    );

    if (!fileExists) {
      throw new BadRequestException(
        'Unable to verify file in Google Drive. Please ensure the file exists and you have granted access.'
      );
    }

    // Get file metadata if not provided
    let fileMetadata = null;
    if (!fileName || !mimeType) {
      fileMetadata = await this.googleAuthService.getFileMetadata(
        driveFileId,
        accessToken
      );
    }

    // Create submission record
    const timestamp = now();
    const submission = this.submissionRepository.create({
      homeworkId,
      studentId,
      submissionDate: timestamp,
      submissionType: 'GOOGLE_DRIVE',
      driveFileId,
      driveFileName: fileName || fileMetadata?.name || 'Unknown',
      driveMimeType: mimeType || fileMetadata?.mimeType || 'application/octet-stream',
      driveFileSize: fileMetadata?.size ? parseInt(fileMetadata.size) : null,
      fileUrl: `https://drive.google.com/file/d/${driveFileId}/view`,
      isActive: true,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    const savedSubmission = await this.submissionRepository.save(submission);

    return InstituteClassSubjectHomeworksSubmissionResponseDto.fromEntity(
      savedSubmission, 
      this.cloudStorageService
    );
  }
}
