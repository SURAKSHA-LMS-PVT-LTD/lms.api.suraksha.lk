import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder, Not, IsNull } from 'typeorm';
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
  private readonly logger = new Logger(InstituteClassSubjectHomeworksSubmissionsService.name);

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
      const timestamp = new Date();
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

      return await InstituteClassSubjectHomeworksSubmissionResponseDto.fromEntity(savedSubmission, this.cloudStorageService);
    } catch (error) {
      throw new BadRequestException(`Failed to create homework submission: ${error.message}`);
    }
  }

  async findAll(queryDto: QueryInstituteClassSubjectHomeworksSubmissionDto, user?: any): Promise<PaginatedResponseDto<InstituteClassSubjectHomeworksSubmissionResponseDto>> {
    const { page = 1, limit = 10, ...filters } = queryDto;
    const skip = (page - 1) * limit;

    // SECURITY: Validate user has access to requested institute, class, and subject
    if (user && filters.instituteId) {
      // Extract targetUserId for parent access validation (studentId or userId)
      const targetUserId = filters.studentId || filters.userId;
      
      // Validate institute access first - pass targetUserId and isReadOnly=true to allow parent access
      InstituteAccessValidator.validateInstituteAccess(user, filters.instituteId, undefined, targetUserId, true);
      
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
            // Proper bitmask check: subject ID 1 = bit 0, subject ID 2 = bit 1, etc.
            const hasSubjectAccess = (subjectBitmask & (1 << (subjectIdNum - 1))) !== 0;
            
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

    const submissionDtos = await Promise.all(
      submissions.map(submission =>
        InstituteClassSubjectHomeworksSubmissionResponseDto.fromEntity(submission, this.cloudStorageService)
      )
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

    return await InstituteClassSubjectHomeworksSubmissionResponseDto.fromEntity(submission, this.cloudStorageService);
  }

  async update(id: string, updateDto: UpdateInstituteClassSubjectHomeworksSubmissionDto, user?: any): Promise<InstituteClassSubjectHomeworksSubmissionResponseDto> {
    const submission = await this.submissionRepository.findOne({ 
      where: { id },
      relations: ['homework']
    });
    
    if (!submission) {
      throw new NotFoundException(`Homework submission with ID ${id} not found`);
    }

    try {
      // Determine user role based on JWT token
      const userId = user?.sub || user?.s;
      const isStudent = submission.studentId === userId;
      const userInstituteAccess = Array.isArray(user?.i) ? user.i : [];
      const instituteEntry = userInstituteAccess.find((entry: any) => entry.i === submission.homework.instituteId);
      const userRole = instituteEntry?.r || 0;
      
      // Role bitmasks
      const TEACHER = 2;
      const INSTITUTE_ADMIN = 4;
      const isTeacherOrAdmin = (userRole & TEACHER) !== 0 || (userRole & INSTITUTE_ADMIN) !== 0;

      const updateData: any = {};
      
      // Students can only update their own submission file
      if (isStudent) {
        if (updateDto.fileUrl !== undefined) {
          updateData.fileUrl = updateDto.fileUrl || '';
        }
        // Students cannot update teacherCorrectionFileUrl or remarks
        if (updateDto.teacherCorrectionFileUrl !== undefined || updateDto.remarks !== undefined) {
          throw new ForbiddenException('Students can only update their submission file, not teacher corrections or remarks');
        }
      }
      
      // Teachers/Admins can update correction files and remarks
      if (isTeacherOrAdmin) {
        if (updateDto.teacherCorrectionFileUrl !== undefined) {
          updateData.teacherCorrectionFileUrl = updateDto.teacherCorrectionFileUrl || '';
        }
        if (updateDto.remarks !== undefined) {
          updateData.remarks = updateDto.remarks?.trim() || null;
        }
        // Teachers can also update student file if needed
        if (updateDto.fileUrl !== undefined) {
          updateData.fileUrl = updateDto.fileUrl || '';
        }
      }
      
      // Only allow if user is student (own submission) or teacher/admin
      if (!isStudent && !isTeacherOrAdmin) {
        throw new ForbiddenException('You do not have permission to update this submission');
      }
      
      if (updateDto.submissionDate !== undefined) updateData.submissionDate = updateDto.submissionDate ? new Date(updateDto.submissionDate) : null;
      if (updateDto.isActive !== undefined) updateData.isActive = updateDto.isActive;

      await this.submissionRepository.update(id, updateData);
      
      const updatedSubmission = await this.submissionRepository
        .createQueryBuilder('submission')
        .leftJoin('submission.homework', 'homework')
        .addSelect([
          'homework.id',
          'homework.instituteId',
          'homework.classId',
          'homework.subjectId',
          'homework.teacherId',
          'homework.title',
          'homework.description',
          'homework.startDate',
          'homework.endDate',
          'homework.referenceLink',
          'homework.isActive'
        ])
        .where('submission.id = :id', { id })
        .getOne();

      return await InstituteClassSubjectHomeworksSubmissionResponseDto.fromEntity(updatedSubmission!, this.cloudStorageService);
    } catch (error) {
      if (error instanceof ForbiddenException || error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException(`Failed to update homework submission: ${error.message}`);
    }
  }

  async remove(id: string, user?: any): Promise<void> {
    const submission = await this.submissionRepository.findOne({ 
      where: { id },
      relations: ['homework']
    });
    
    if (!submission) {
      throw new NotFoundException(`Homework submission with ID ${id} not found`);
    }

    // Determine user role
    const userId = user?.sub || user?.s;
    const isStudent = submission.studentId === userId;
    const userInstituteAccess = Array.isArray(user?.i) ? user.i : [];
    const instituteEntry = userInstituteAccess.find((entry: any) => entry.i === submission.homework.instituteId);
    const userRole = instituteEntry?.r || 0;
    
    // Role bitmasks
    const TEACHER = 2;
    const INSTITUTE_ADMIN = 4;
    const isTeacherOrAdmin = (userRole & TEACHER) !== 0 || (userRole & INSTITUTE_ADMIN) !== 0;

    // Students can only delete their own submissions
    // Teachers/Admins can delete any submission
    if (!isStudent && !isTeacherOrAdmin) {
      throw new ForbiddenException('You do not have permission to delete this submission');
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

    // ✅ Generate signed URLs before returning
    return await InstituteClassSubjectHomeworksSubmissionResponseDto.fromEntity(submission, this.cloudStorageService);
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
        return await InstituteClassSubjectHomeworksSubmissionResponseDto.fromEntity(updatedSubmission, this.cloudStorageService);
      } else {
        // Create new submission
        const timestamp = new Date();
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
        return await InstituteClassSubjectHomeworksSubmissionResponseDto.fromEntity(savedSubmission, this.cloudStorageService);
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

    const submissionDtos = await Promise.all(
      submissions.map(submission =>
        InstituteClassSubjectHomeworksSubmissionResponseDto.fromEntity(submission, this.cloudStorageService)
      )
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

    // ✅ Generate signed URLs before returning
    return await InstituteClassSubjectHomeworksSubmissionResponseDto.fromEntity(submission, this.cloudStorageService);
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

    // ✅ ALLOW MULTIPLE SUBMISSIONS: Students can submit multiple files per homework
    // Count existing active submissions
    const submissionCount = await this.submissionRepository.count({
      where: { 
        homeworkId, 
        studentId,
        isActive: true
      }
    });

    this.logger.log(`Student ${studentId} has ${submissionCount} active submission(s) for homework ${homeworkId}`);

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
    const timestamp = new Date();
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

    return await InstituteClassSubjectHomeworksSubmissionResponseDto.fromEntity(
      savedSubmission, 
      this.cloudStorageService
    );
  }

  /**
   * Submit teacher correction via Google Drive
   * Teachers/Admins can attach correction files from their Google Drive
   * IMPORTANT: Access token is used only for validation, NOT stored
   */
  async submitCorrectionViaGoogleDrive(
    submissionId: string,
    teacherId: string,
    driveFileId: string,
    accessToken: string,
    remarks?: string,
    fileName?: string,
    mimeType?: string
  ): Promise<InstituteClassSubjectHomeworksSubmissionResponseDto> {
    // Get submission
    const submission = await this.submissionRepository.findOne({
      where: { id: submissionId },
      relations: ['homework']
    });

    if (!submission) {
      throw new NotFoundException(`Homework submission with ID ${submissionId} not found`);
    }

    // Verify the Drive file exists using teacher's access token
    const fileExists = await this.googleAuthService.verifyFileExists(
      driveFileId,
      accessToken
    );

    if (!fileExists) {
      throw new BadRequestException(
        'Unable to verify file in Google Drive. Please ensure the file exists and you have granted access.'
      );
    }

    // Get file metadata from Drive if not provided
    let fileMetadata = null;
    if (!fileName || !mimeType) {
      fileMetadata = await this.googleAuthService.getFileMetadata(
        driveFileId,
        accessToken
      );
    }

    const timestamp = new Date();
    const correctionDriveViewUrl = `https://drive.google.com/file/d/${driveFileId}/view`;

    // Update submission with Drive correction fields
    await this.submissionRepository.update(submissionId, {
      correctionDriveFileId: driveFileId,
      correctionDriveFileName: fileName || fileMetadata?.name || 'Unknown',
      correctionDriveMimeType: mimeType || fileMetadata?.mimeType || 'application/octet-stream',
      correctionDriveFileSize: fileMetadata?.size ? parseInt(fileMetadata.size) : null,
      correctionType: 'GOOGLE_DRIVE',
      teacherCorrectionFileUrl: correctionDriveViewUrl,
      remarks: remarks !== undefined ? (remarks?.trim() || null) : submission.remarks,
      updatedAt: timestamp,
    });

    this.logger.log(`Teacher ${teacherId} added Drive correction for submission ${submissionId}: ${driveFileId}`);

    // Return updated submission
    const updatedSubmission = await this.submissionRepository.findOne({
      where: { id: submissionId },
      relations: ['homework']
    });

    return await InstituteClassSubjectHomeworksSubmissionResponseDto.fromEntity(
      updatedSubmission!,
      this.cloudStorageService
    );
  }

  /**
   * Submit teacher correction via Google Drive using UserDriveAccess (stored OAuth tokens)
   * Uses the teacher's connected Google Drive account
   */
  async submitCorrectionViaDriveAccess(
    submissionId: string,
    teacherId: string,
    driveFileId: string,
    driveAccessService: any,
    remarks?: string,
    shareWithStudentEmail?: string
  ): Promise<InstituteClassSubjectHomeworksSubmissionResponseDto> {
    const submission = await this.submissionRepository.findOne({
      where: { id: submissionId },
      relations: ['homework']
    });

    if (!submission) {
      throw new NotFoundException(`Homework submission with ID ${submissionId} not found`);
    }

    // Use teacher's stored Drive connection to verify + register file
    const fileMetadata = await driveAccessService.getFileMetadata(teacherId, driveFileId);

    if (!fileMetadata) {
      throw new BadRequestException(
        'Unable to find file in your Google Drive. Please ensure the file exists.'
      );
    }

    // Register the file in our system
    const registeredFile = await driveAccessService.registerUploadedFile(teacherId, driveFileId, {
      purpose: 'HOMEWORK_CORRECTION',
      referenceType: 'homework_submission',
      referenceId: submissionId,
      shareWithEmails: shareWithStudentEmail ? [shareWithStudentEmail] : undefined,
    });

    const timestamp = new Date();
    const correctionDriveViewUrl = registeredFile.driveWebViewLink || `https://drive.google.com/file/d/${driveFileId}/view`;

    await this.submissionRepository.update(submissionId, {
      correctionDriveFileId: driveFileId,
      correctionDriveFileName: registeredFile.fileName,
      correctionDriveMimeType: registeredFile.mimeType,
      correctionDriveFileSize: registeredFile.fileSize,
      correctionType: 'GOOGLE_DRIVE',
      teacherCorrectionFileUrl: correctionDriveViewUrl,
      remarks: remarks !== undefined ? (remarks?.trim() || null) : submission.remarks,
      updatedAt: timestamp,
    });

    this.logger.log(`Teacher ${teacherId} added Drive correction (via stored OAuth) for submission ${submissionId}`);

    const updatedSubmission = await this.submissionRepository.findOne({
      where: { id: submissionId },
      relations: ['homework']
    });

    return await InstituteClassSubjectHomeworksSubmissionResponseDto.fromEntity(
      updatedSubmission!,
      this.cloudStorageService
    );
  }
}
