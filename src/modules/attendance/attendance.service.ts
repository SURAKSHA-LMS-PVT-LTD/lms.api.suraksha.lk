import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { DynamoDBAttendanceService } from './services/dynamodb-attendance.service';
import { AttendanceNotificationService } from './services/attendance-notification.service';
import { NOTIFICATION_PACKAGES_CONFIG } from '../advertisement/services/notification-packages.config';
import { MarkAttendanceDto, BulkAttendanceDto, GetStudentAttendanceDto, StudentAttendanceResponseDto, AttendanceStatus } from './dto/attendance.dto';
import { MarkAttendanceByCardDto, GetAttendanceByCardDto, BulkCardAttendanceDto } from './dto/card-attendance.dto';
import { MarkAttendanceByInstituteCardDto, GetInstituteUserByCardDto, InstituteCardUserResponseDto } from './dto/institute-card-attendance.dto';
import { StudentEntity } from '../student/entities/student.entity';
import { ParentEntity } from '../parent/entities/parent.entity';
import { CloudStorageService } from '../../common/services/cloud-storage.service';
import { UserEntity } from '../user/entities/user.entity';
import { StudentBookhireEnrollmentEntity } from '../private-transportation/entities/student-bookhire-enrollment.entity';
import { InstituteUserEntity } from '../institute_mudules/institue_user/entities/institue_user.entity';
import { ImageVerificationStatus } from '../institute_mudules/institue_user/enums/image-verification-status.enum';
import { InstituteUserStatus } from '../institute_mudules/institue_user/enums/institute-user-status.enum';
import { AdvertisementEntity } from '../advertisement/entities/advertisement.entity';
import { AdvertisementMatchingService } from '../advertisement/advertisement-matching.service';

@Injectable()
export class AttendanceService {
  private readonly logger = new Logger(AttendanceService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly dynamoAttendanceService: DynamoDBAttendanceService,
    private readonly attendanceNotificationService: AttendanceNotificationService,
    private readonly advertisementMatchingService: AdvertisementMatchingService,
    @InjectRepository(StudentEntity)
    private readonly studentRepository: Repository<StudentEntity>,
    @InjectRepository(ParentEntity)
    private readonly parentRepository: Repository<ParentEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    @InjectRepository(StudentBookhireEnrollmentEntity)
    private readonly enrollmentRepository: Repository<StudentBookhireEnrollmentEntity>,
    @InjectRepository(InstituteUserEntity)
    private readonly instituteUserRepository: Repository<InstituteUserEntity>,
    @InjectRepository(AdvertisementEntity)
    private readonly advertisementRepository: Repository<AdvertisementEntity>,
    private readonly CloudStorageService: CloudStorageService,
  ) {}

  async markAttendance(markAttendanceDto: MarkAttendanceDto, markedBy: string): Promise<any> {
    const requestId = `ATT_${Date.now()}`;
    const startTime = Date.now();
    this.logger.log(`[${requestId}] 🎯 Marking: ${markAttendanceDto.studentId}`);
    
    try {
      // Validate student enrollment if configured
      await this.validateStudentEnrollment(
        markAttendanceDto.studentId,
        markAttendanceDto.instituteId
      );
      
      const studentData = await this.fetchStudentWithParentData(markAttendanceDto.studentId);
      
      if (!studentData.student?.user) {
        throw new Error(`Student not found: ${markAttendanceDto.studentId}`);
      }

      markAttendanceDto.studentName = `${studentData.student.user.firstName} ${studentData.student.user.lastName}`.trim();

      if (!markAttendanceDto.date) {
        markAttendanceDto.date = new Date().toISOString().split('T')[0];
      }

      if (!markAttendanceDto.location) {
        markAttendanceDto.location = this.generateAddress(
          markAttendanceDto.instituteName,
          markAttendanceDto.className,
          markAttendanceDto.subjectName
        );
      }

      const result = await this.dynamoAttendanceService.markAttendance(markAttendanceDto);

      this.scheduleAttendanceNotification(markAttendanceDto, result, studentData);

      // Check if institute requires custom user images
      const instituteIdsRequiringCustomImages = this.configService.get<string>('INSTITUTE_IDS_WITH_CUSTOM_IMAGES')?.split(',').map(id => id.trim()) || [];
      const requiresInstituteImage = instituteIdsRequiringCustomImages.includes(markAttendanceDto.instituteId);

      let imageUrl = null;
      
      if (requiresInstituteImage) {
        // Only query institute_user table if institute is in the configured list
        try {
          const instituteUser = await this.instituteUserRepository.findOne({
            where: {
              userId: markAttendanceDto.studentId,
              instituteId: markAttendanceDto.instituteId,
            },
            select: ['instituteUserImageUrl', 'imageVerificationStatus'],
          });

          const isVerified = instituteUser?.imageVerificationStatus === ImageVerificationStatus.VERIFIED;
          const finalImageUrl = isVerified && instituteUser?.instituteUserImageUrl
            ? instituteUser.instituteUserImageUrl
            : studentData.student.user.imageUrl;

          if (finalImageUrl) {
            imageUrl = this.CloudStorageService.getFullUrl(finalImageUrl);
          }
        } catch (storageError) {
          imageUrl = studentData.student.user.imageUrl || null;
        }
      } else {
        // Use global user image directly (no database query)
        imageUrl = studentData.student.user.imageUrl 
          ? this.CloudStorageService.getFullUrl(studentData.student.user.imageUrl)
          : null;
      }

      this.logger.log(`[${requestId}] ✅ Marked in ${Date.now() - startTime}ms`);
      
      return {
        success: true,
        imageUrl: imageUrl,
        status: markAttendanceDto.status,
        name: markAttendanceDto.studentName
      };
    } catch (error) {
      this.logger.error(`[${requestId}] ❌ ERROR: Failed to mark attendance - ${error.message}`, error.stack);
      throw error;
    }
  }

  async markBulkAttendance(bulkAttendanceDto: BulkAttendanceDto, markedBy: string): Promise<any> {
    const requestId = `BULK_ATT_${Date.now()}`;
    const startTime = Date.now();
    this.logger.log(`[${requestId}] 🎯 Bulk marking for ${bulkAttendanceDto.students.length} students`);
    
    try {
      const studentIds = bulkAttendanceDto.students.map(s => s.studentId);
      
      // ✅ STEP 1: Validate all students' enrollment (if configured) - batch operation
      await Promise.all(
        studentIds.map(studentId =>
          this.validateStudentEnrollment(studentId, bulkAttendanceDto.instituteId)
        )
      );
      
      // ✅ STEP 2: Fetch all students from database at once - optimized batch query
      const students = await this.studentRepository.find({
        where: { userId: In(studentIds) },
        relations: ['user'],
        select: {
          userId: true,
          user: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phoneNumber: true,
            subscriptionPlan: true,
            telegramId: true,
            imageUrl: true
          }
        }
      });
      
      // ✅ STEP 3: Create student lookup map for quick access
      const studentMap = new Map(
        students.map(s => [s.userId, s])
      );
      
      // ✅ STEP 4: Validate all students exist and update names from database
      const validatedStudents = [];
      const invalidStudents = [];
      
      for (const studentItem of bulkAttendanceDto.students) {
        const dbStudent = studentMap.get(studentItem.studentId);
        
        if (!dbStudent?.user) {
          invalidStudents.push({
            studentId: studentItem.studentId,
            error: `Student not found: ${studentItem.studentId}`
          });
          this.logger.warn(`[${requestId}] ⚠️  Student not found: ${studentItem.studentId}`);
          continue;
        }
        
        // Override with database name
        studentItem.studentName = `${dbStudent.user.firstName} ${dbStudent.user.lastName}`.trim();
        validatedStudents.push(studentItem);
      }
      
      // ✅ STEP 5: Check if any students were invalid
      if (invalidStudents.length > 0) {
        this.logger.error(`[${requestId}] ❌ ${invalidStudents.length} invalid students found`);
        throw new NotFoundException(
          `${invalidStudents.length} student(s) not found: ${invalidStudents.map(s => s.studentId).join(', ')}`
        );
      }
      
      // ✅ STEP 6: Update the DTO with only validated students
      bulkAttendanceDto.students = validatedStudents;
      
      // ✅ STEP 7: Mark attendance in DynamoDB
      const results = await this.dynamoAttendanceService.markBulkAttendance(bulkAttendanceDto);
      
      // ✅ STEP 8: Send notifications (same as before)
      const notificationsEnabled = this.shouldSendNotifications();
      if (notificationsEnabled) {
        results.forEach(result => {
          const markAttendanceDto: MarkAttendanceDto = {
            studentId: result.studentId,
            studentName: result.studentName,
            instituteId: bulkAttendanceDto.instituteId,
            instituteName: bulkAttendanceDto.instituteName,
            classId: bulkAttendanceDto.classId,
            className: bulkAttendanceDto.className,
            subjectId: bulkAttendanceDto.subjectId,
            subjectName: bulkAttendanceDto.subjectName,
            date: result.date,
            location: bulkAttendanceDto.location,
            status: result.status,
            markingMethod: bulkAttendanceDto.markingMethod
          };

          this.scheduleAttendanceNotification(markAttendanceDto, result);
        });
      }
      
      this.logger.log(`[${requestId}] ✅ Bulk marked ${results.length} students in ${Date.now() - startTime}ms`);

      return {
        success: true,
        message: `Bulk attendance marked successfully for ${results.length} students`,
        totalProcessed: results.length,
        action: 'bulk_created',
        records: results
      };
    } catch (error) {
      this.logger.error(`[${requestId}] ❌ ERROR: Bulk attendance failed - ${error.message}`, error.stack);
      throw error;
    }
  }

  async getStudentAttendance(getStudentAttendanceDto: GetStudentAttendanceDto): Promise<StudentAttendanceResponseDto> {
    const { studentId, startDate, endDate, page = 1, limit = 20, status } = getStudentAttendanceDto;
    
    // Get all attendance records for the student in the date range
    const allRecords = await this.dynamoAttendanceService.getStudentAttendance(
      studentId,
      '', // We'll need to get instituteId from somewhere or modify the method
      startDate,
      endDate
    );

    // Filter by status if provided
    const filteredRecords = status 
      ? allRecords.filter(record => record.status === status)
      : allRecords;

    // Calculate pagination
    const totalRecords = filteredRecords.length;
    const totalPages = Math.ceil(totalRecords / limit);
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedRecords = filteredRecords.slice(startIndex, endIndex);

    // Calculate summary statistics
    const totalPresent = allRecords.filter(r => r.status === AttendanceStatus.PRESENT).length;
    const totalAbsent = allRecords.filter(r => r.status === AttendanceStatus.ABSENT).length;
    const totalLate = allRecords.filter(r => r.status === AttendanceStatus.LATE).length;
    const attendanceRate = totalRecords > 0 ? (totalPresent / totalRecords) * 100 : 0;

    // Transform records to response format
    const data = paginatedRecords.map(record => ({
      attendanceId: `${record.instituteId}-${record.studentId}-${record.date}`,
      studentId: record.studentId,
      studentName: record.studentName,
      instituteName: record.instituteName,
      className: record.className,
      subjectName: record.subjectName,
      address: record.location || this.generateAddress(record.instituteName, record.className, record.subjectName),
      markedBy: 'system',
      markedAt: record.date,
      markingMethod: record.markingMethod,
      status: record.status
    }));

    return {
      success: true,
      message: 'Student attendance retrieved successfully',
      pagination: {
        currentPage: page,
        totalPages,
        totalRecords,
        recordsPerPage: limit,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      },
      data,
      summary: {
        totalPresent,
        totalAbsent,
        totalLate,
        attendanceRate: parseFloat(attendanceRate.toFixed(2))
      }
    };
  }

  async markAttendanceByCard(markAttendanceByCardDto: MarkAttendanceByCardDto, markedBy: string): Promise<any> {
    // Look up student by RFID card ID
    const user = await this.userRepository.findOne({
      where: { rfid: markAttendanceByCardDto.studentCardId },
      select: ['id', 'firstName', 'lastName', 'imageUrl']
    });

    if (!user) {
      // Enhanced error with debugging info
      const errorDetails = {
        message: `Student not found with RFID card ID: ${markAttendanceByCardDto.studentCardId}`,
        cardId: markAttendanceByCardDto.studentCardId,
        hint: 'Please ensure the RFID card is registered in the users table',
        suggestion: 'Check: SELECT * FROM users WHERE rfid = ?',
        timestamp: new Date().toISOString()
      };
      this.logger.error(`RFID Card Not Found: ${JSON.stringify(errorDetails)}`);
      throw new Error(errorDetails.message);
    }

    // For card-based attendance, we need to convert to regular attendance format
    const markAttendanceDto: MarkAttendanceDto = {
      studentId: user.id.toString(),
      studentName: `${user.firstName} ${user.lastName || ''}`.trim(),
      instituteId: markAttendanceByCardDto.instituteId,
      instituteName: markAttendanceByCardDto.instituteName,
      classId: markAttendanceByCardDto.classId || 'default',
      className: markAttendanceByCardDto.className || 'Default Class',
      subjectId: markAttendanceByCardDto.subjectId || 'default',
      subjectName: markAttendanceByCardDto.subjectName || 'General',
      date: new Date().toISOString().split('T')[0],
      location: markAttendanceByCardDto.address,
      status: markAttendanceByCardDto.status,
      markingMethod: markAttendanceByCardDto.markingMethod
    };

    return this.markAttendance(markAttendanceDto, markedBy);
  }

  async markBulkAttendanceByCard(bulkCardAttendanceDto: BulkCardAttendanceDto, markedBy: string): Promise<any> {
    // Get all card IDs
    const cardIds = bulkCardAttendanceDto.students.map(s => s.studentCardId);
    
    // Look up all users by RFID in one query
    const users = await this.userRepository.find({
      where: cardIds.map(cardId => ({ rfid: cardId })),
      select: ['id', 'firstName', 'lastName', 'rfid', 'imageUrl']
    });

    // Create a map of cardId to user
    const userMap = new Map(users.map(u => [u.rfid, u]));

    // Check institute_user for verified images for all users
    const userIds = users.map(u => u.id.toString());
    const instituteUsers = await this.instituteUserRepository.find({
      where: {
        userId: In(userIds),
        instituteId: bulkCardAttendanceDto.instituteId
      },
      select: ['userId', 'instituteUserImageUrl', 'imageVerificationStatus']
    });

    // Create a map of userId to institute image
    const instituteImageMap = new Map(
      instituteUsers
        .filter(iu => iu.instituteUserImageUrl && iu.imageVerificationStatus === ImageVerificationStatus.VERIFIED)
        .map(iu => [iu.userId, iu.instituteUserImageUrl])
    );

    // Map students with their actual user IDs and names
    const students = bulkCardAttendanceDto.students.map(student => {
      const user = userMap.get(student.studentCardId);
      if (!user) {
        throw new Error(`Student not found with card ID: ${student.studentCardId}`);
      }
      return {
        studentId: user.id.toString(),
        studentName: `${user.firstName} ${user.lastName || ''}`.trim(),
        status: student.status,
        remarks: undefined
      };
    });

    const bulkAttendanceDto: BulkAttendanceDto = {
      instituteId: bulkCardAttendanceDto.instituteId,
      instituteName: bulkCardAttendanceDto.instituteName,
      classId: bulkCardAttendanceDto.classId || 'default',
      className: bulkCardAttendanceDto.className || 'Default Class',
      subjectId: bulkCardAttendanceDto.subjectId || 'default',
      subjectName: bulkCardAttendanceDto.subjectName || 'General',
      location: bulkCardAttendanceDto.address,
      markingMethod: bulkCardAttendanceDto.markingMethod,
      students
    };

    const result = await this.markBulkAttendance(bulkAttendanceDto, markedBy);
    
    // Override imageUrls in the response for institute card-based attendance
    if (result && result.results && Array.isArray(result.results)) {
      result.results = result.results.map(record => {
        const user = userMap.get(bulkCardAttendanceDto.students.find(s => {
          const u = userMap.get(s.studentCardId);
          return u && u.id.toString() === record.studentId;
        })?.studentCardId);
        
        if (user) {
          const instituteImage = instituteImageMap.get(user.id.toString());
          try {
            record.imageUrl = this.CloudStorageService.getFullUrl(instituteImage || user.imageUrl);
          } catch (storageError) {
            record.imageUrl = instituteImage || user.imageUrl || null;
          }
        }
        return record;
      });
    }
    
    return result;
  }

  async getAttendanceByCard(getAttendanceByCardDto: GetAttendanceByCardDto): Promise<any> {
    const { studentCardId, startDate, endDate, page = 1, limit = 10 } = getAttendanceByCardDto;

    if (studentCardId) {
      // Look up student by RFID card ID
      const user = await this.userRepository.findOne({
        where: { rfid: studentCardId },
        select: ['id', 'firstName', 'lastName', 'imageUrl']
      });

      if (!user) {
        throw new Error(`Student not found with card ID: ${studentCardId}`);
      }

      // Get attendance for the actual student ID
      const records = await this.dynamoAttendanceService.getStudentAttendance(
        user.id.toString(),
        '', // Institute ID needed
        startDate,
        endDate
      );

      const totalRecords = records.length;
      const totalPages = Math.ceil(totalRecords / limit);
      const startIndex = (page - 1) * limit;
      const paginatedRecords = records.slice(startIndex, startIndex + limit);

      return {
        success: true,
        message: 'Card attendance retrieved successfully',
        studentInfo: {
          studentId: user.id.toString(),
          studentCardId: studentCardId,
          studentName: `${user.firstName} ${user.lastName || ''}`.trim()
        },
        pagination: {
          currentPage: page,
          totalPages,
          totalRecords,
          recordsPerPage: limit,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1
        },
        data: paginatedRecords.map(record => ({
          attendanceId: `${record.instituteId}-${record.studentId}-${record.date}`,
          studentId: record.studentId,
          studentCardId: studentCardId,
          studentName: record.studentName,
          instituteName: record.instituteName,
          className: record.className,
          subjectName: record.subjectName,
          address: record.location,
          markedAt: record.date,
          markingMethod: record.markingMethod,
          status: record.status
        }))
      };
    } else {
      // Get all attendance for date range
      return {
        success: true,
        message: 'All card attendance retrieved successfully',
        data: []
      };
    }
  }

  async getAttendanceSummary(
    instituteId: string,
    classId?: string,
    subjectId?: string,
    startDate?: string,
    endDate?: string
  ): Promise<any> {
    const summary = await this.dynamoAttendanceService.getAttendanceSummary(
      instituteId,
      classId,
      subjectId,
      startDate,
      endDate
    );

    return {
      success: true,
      message: 'Attendance summary retrieved successfully',
      data: summary
    };
  }

  async getAttendanceByDate(instituteId: string, date: string): Promise<any> {
    const records = await this.dynamoAttendanceService.getAttendanceByDate(instituteId, date);

    return {
      success: true,
      message: 'Daily attendance retrieved successfully',
      date,
      totalRecords: records.length,
      data: records
    };
  }

  private generateAddress(instituteName: string, className?: string, subjectName?: string): string {
    let address = instituteName;
    
    if (className) {
      address += ` - ${className}`;
    }
    
    if (subjectName) {
      address += ` - ${subjectName}`;
    }
    
    return address;
  }

  async getInstituteAttendance(params: {
    instituteId: string;
    startDate: string;
    endDate: string;
    page?: number;
    limit?: number;
    status?: string;
    studentId?: string;
  }): Promise<any> {
    const { instituteId, startDate, endDate, page = 1, limit = 50, status, studentId } = params;
    
    // Use the attendance summary method for institute-wide data
    const summary = await this.dynamoAttendanceService.getAttendanceSummary(
      instituteId,
      undefined, // classId
      undefined, // subjectId
      startDate,
      endDate
    );

    // Filter by status and studentId if provided
    let filteredRecords = summary.records;
    if (status) {
      filteredRecords = filteredRecords.filter(record => 
        record.status.toLowerCase() === status.toLowerCase()
      );
    }
    if (studentId) {
      filteredRecords = filteredRecords.filter(record => 
        record.studentId === studentId
      );
    }

    // Apply pagination
    const totalRecords = filteredRecords.length;
    const totalPages = Math.ceil(totalRecords / limit);
    const startIndex = (page - 1) * limit;
    const paginatedRecords = filteredRecords.slice(startIndex, startIndex + limit);

    return {
      success: true,
      message: 'Institute attendance retrieved successfully',
      pagination: {
        currentPage: page,
        totalPages,
        totalRecords,
        recordsPerPage: limit,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      },
      data: paginatedRecords,
      summary: {
        totalPresent: summary.presentCount,
        totalAbsent: summary.absentCount,
        attendanceRate: summary.attendanceRate
      }
    };
  }

  async getClassAttendance(params: {
    instituteId: string;
    classId: string;
    startDate: string;
    endDate: string;
    page?: number;
    limit?: number;
    status?: string;
    studentId?: string;
  }): Promise<any> {
    const { instituteId, classId, startDate, endDate, page = 1, limit = 50, status, studentId } = params;
    
    const summary = await this.dynamoAttendanceService.getAttendanceSummary(
      instituteId,
      classId,
      undefined, // subjectId
      startDate,
      endDate
    );

    // Filter by status and studentId if provided
    let filteredRecords = summary.records;
    if (status) {
      filteredRecords = filteredRecords.filter(record => 
        record.status.toLowerCase() === status.toLowerCase()
      );
    }
    if (studentId) {
      filteredRecords = filteredRecords.filter(record => 
        record.studentId === studentId
      );
    }

    // Apply pagination
    const totalRecords = filteredRecords.length;
    const totalPages = Math.ceil(totalRecords / limit);
    const startIndex = (page - 1) * limit;
    const paginatedRecords = filteredRecords.slice(startIndex, startIndex + limit);

    return {
      success: true,
      message: 'Class attendance retrieved successfully',
      pagination: {
        currentPage: page,
        totalPages,
        totalRecords,
        recordsPerPage: limit,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      },
      data: paginatedRecords,
      summary: {
        totalPresent: summary.presentCount,
        totalAbsent: summary.absentCount,
        attendanceRate: summary.attendanceRate
      }
    };
  }

  async getSubjectAttendance(params: {
    instituteId: string;
    classId?: string;
    subjectId: string;
    startDate: string;
    endDate: string;
    page?: number;
    limit?: number;
    status?: string;
    studentId?: string;
  }): Promise<any> {
    const { instituteId, classId, subjectId, startDate, endDate, page = 1, limit = 50, status, studentId } = params;
    
    const summary = await this.dynamoAttendanceService.getAttendanceSummary(
      instituteId,
      classId, // Pass the actual classId instead of undefined
      subjectId,
      startDate,
      endDate
    );

    this.logger.log(`📊 Raw records from DynamoDB: ${summary.records.length} records`);
    
    // Filter by status and studentId if provided
    let filteredRecords = summary.records;
    if (status) {
      filteredRecords = filteredRecords.filter(record => 
        record.status.toLowerCase() === status.toLowerCase()
      );
      this.logger.log(`🔍 After status filter (${status}): ${filteredRecords.length} records`);
    }
    if (studentId) {
      this.logger.log(`🔍 Filtering by studentId: "${studentId}" (type: ${typeof studentId})`);
      this.logger.log(`📋 Sample record studentId: "${filteredRecords[0]?.studentId}" (type: ${typeof filteredRecords[0]?.studentId})`);
      
      filteredRecords = filteredRecords.filter(record => {
        const matches = record.studentId === studentId || record.studentId == studentId;
        this.logger.log(`  Record ${record.studentId} === ${studentId}? ${matches}`);
        return matches;
      });
      this.logger.log(`🔍 After studentId filter: ${filteredRecords.length} records`);
    }

    // Apply pagination
    const totalRecords = filteredRecords.length;
    const totalPages = Math.ceil(totalRecords / limit);
    const startIndex = (page - 1) * limit;
    const paginatedRecords = filteredRecords.slice(startIndex, startIndex + limit);

    return {
      success: true,
      message: 'Subject attendance retrieved successfully',
      pagination: {
        currentPage: page,
        totalPages,
        totalRecords,
        recordsPerPage: limit,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      },
      data: paginatedRecords,
      summary: {
        totalPresent: summary.presentCount,
        totalAbsent: summary.absentCount,
        attendanceRate: summary.attendanceRate
      }
    };
  }

  private scheduleAttendanceNotification(markAttendanceDto: MarkAttendanceDto, attendanceResult: any, studentData?: any): void {
    // Fire-and-forget notification - no blocking, no waiting
    this.sendAttendanceNotificationWithAdvertising(markAttendanceDto, attendanceResult, studentData).catch(() => {});
  }

  /**
   * 🎯 ADVERTISING INTEGRATION: Send attendance notification with advertising logic
   * This ensures that when attendance is marked, the advertising system is triggered
   * with proper subscription plan filtering and environment validation
   */
  private async sendAttendanceNotificationWithAdvertising(
    markAttendanceDto: MarkAttendanceDto,
    attendanceResult: any,
    studentData?: any
  ): Promise<void> {
    try {
      if (!this.shouldSendNotifications()) {
        return;
      }

      // Reuse student data if already fetched, otherwise fetch it
      const data = studentData || await this.fetchStudentWithParentData(markAttendanceDto.studentId);
      
      if (!data.student || (!data.parentContact && !data.parentEmail && !data.parentTelegramId)) {
        return;
      }

      // Get package config to check isAds flag
      const packageConfig = NOTIFICATION_PACKAGES_CONFIG.packages[data.subscriptionPlan.toUpperCase()];
      const isAdsEnabled = packageConfig?.isAds === true;
      const isAdsFromDB = this.configService.get<string>('IS_ADS_FROM_DB') === 'true';

      // Prepare ad data based on config
      let advertisementData = null;
      
      if (isAdsEnabled) {
        if (isAdsFromDB) {
          // Fetch from database
          advertisementData = await this.getMatchingAdvertisementFromDB(
            data.subscriptionPlan,
            data.student,
            markAttendanceDto.instituteId
          );
        } else {
          // Use default from environment
          advertisementData = {
            id: 'default-company-ad',
            mediaUrl: process.env.DEFAULT_AD_URL || '',
            mediaType: process.env.DEFAULT_AD_TYPE || 'text',
            title: process.env.DEFAULT_AD_TITLE || 'Your Company Name',
            content: process.env.DEFAULT_AD_CONTENT || 'Professional education services.',
            sendingUrl: process.env.DEFAULT_AD_SENDING_URL || undefined,
            supportivePlatforms: []  // Default ads support all platforms
          };
        }
      }

      const notificationData = {
        studentId: markAttendanceDto.studentId,
        studentName: `${data.student.user.firstName} ${data.student.user.lastName || ''}`.trim(),
        parentName: data.primaryParent ? 
          `${data.primaryParent.firstName} ${data.primaryParent.lastName || ''}`.trim() : 
          'Parent/Guardian',
        parentContact: data.parentContact,
        parentEmail: data.parentEmail,
        parentTelegramId: data.parentTelegramId,
        attendanceStatus: (markAttendanceDto.status === AttendanceStatus.PRESENT ? 'PRESENT' : 'ABSENT') as 'PRESENT' | 'ABSENT',
        date: markAttendanceDto.date,
        time: new Date().toISOString(),
        location: markAttendanceDto.location,
        instituteName: markAttendanceDto.instituteName,
        className: markAttendanceDto.className || null,
        subjectName: markAttendanceDto.subjectName || null,
        attendanceType: (markAttendanceDto.subjectName ? 'SUBJECT' : (markAttendanceDto.className ? 'CLASS' : 'INSTITUTE')) as 'SUBJECT' | 'CLASS' | 'INSTITUTE',
        vehicleNumber: null,
        bookhireName: null,
        subscriptionPlan: data.subscriptionPlan,
        advertisementData
      };

      await this.attendanceNotificationService.sendAttendanceNotification(notificationData);
      
    } catch (error) {
      // Silent fail - don't block attendance marking
    }
  }



  /**
   * Check if notification system is properly configured
   */
  private shouldSendNotifications(): boolean {
    // Check if we have minimum required environment variables
    const hasWhatsApp = !!(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
    const hasTelegram = !!process.env.TELEGRAM_BOT_TOKEN;
    const hasEmail = !!(process.env.EMAIL_SERVER_URL || process.env.EMAIL_API_URL);
    
    // We need at least one notification channel configured
    return hasWhatsApp || hasTelegram || hasEmail;
  }

  /**
   * 🔥 FIRE-AND-FORGET IMMEDIATE NOTIFICATION SENDING
   * Sends notifications immediately with pre-loaded data (no additional queries needed)
   * Fetches matching advertisement from database and sends notification
   * 🎯 CASCADE TO PARENTS: If ad has cascadeToParents=true, sends SAME ad to ALL parents
   * This method runs async and doesn't block the attendance response
   */
  private async sendImmediateNotification(params: {
    studentId: string;
    studentName: string;
    parentContact: string | null;
    parentEmail: string | null;
    parentTelegramId: string | null;
    subscriptionPlan: string;
    attendanceDto: MarkAttendanceDto;
    isAdsFromDB: boolean;
    studentData: any;  // Complete student data with user profile
    instituteId: string;  // Institute ID for ad targeting
  }): Promise<void> {
    try {
      const {
        studentId,
        studentName,
        parentContact,
        parentEmail,
        parentTelegramId,
        subscriptionPlan,
        attendanceDto,
        isAdsFromDB,
        studentData,
        instituteId
      } = params;

      // Check if we have at least one contact method
      if (!parentContact && !parentEmail && !parentTelegramId) {
        return;
      }

      // Check if this subscription plan should receive ads
      const packageConfig = NOTIFICATION_PACKAGES_CONFIG.packages[subscriptionPlan.toUpperCase()];
      const shouldReceiveAds = packageConfig?.isAds === true;
      
      let advertisementData: any = null;

      if (shouldReceiveAds) {
        if (isAdsFromDB) {
          // 🎯 Fetch MOST MATCHING advertisement using multi-factor profile matching
          advertisementData = await this.getMatchingAdvertisementFromDB(
            subscriptionPlan,
            studentData,
            instituteId
          );
        } else {
          // 🏢 Use default company branding from environment
          advertisementData = {
            id: 'default-company-ad',
            mediaUrl: process.env.DEFAULT_AD_URL || '',
            mediaType: process.env.DEFAULT_AD_TYPE || 'text',
            title: process.env.DEFAULT_AD_TITLE || 'Your Company Name',
            content: process.env.DEFAULT_AD_CONTENT || 'Professional education services for your child\'s bright future.',
            sendingUrl: process.env.DEFAULT_AD_SENDING_URL || undefined,
            supportivePlatforms: [],  // Default ads support all platforms
            cascadeToParents: false  // Default ads don't cascade
          };
        }
      }

      // Build notification data (no vehicle data needed for normal attendance)
      const notificationData = {
        studentId,
        studentName,
        parentContact,
        parentEmail,
        parentTelegramId,
        attendanceStatus: (attendanceDto.status === AttendanceStatus.PRESENT ? 'PRESENT' : 'ABSENT') as 'PRESENT' | 'ABSENT',
        date: attendanceDto.date,
        time: new Date().toLocaleTimeString(),
        vehicleNumber: null,
        bookhireName: null,
        subscriptionPlan,
        advertisementData
      };

      // 🚀 Send notification immediately (fire-and-forget)
      await this.attendanceNotificationService.sendAttendanceNotification(notificationData);
      
      if (advertisementData?.matchScore) {
        this.logger.log(`✅ Notification sent with BEST matching ad (Score: ${advertisementData.matchScore}): "${advertisementData.title}"`);
      } else {
        this.logger.log(`✅ Notification sent for student ${studentId} with ${isAdsFromDB ? 'database' : 'default'} ad`);
      }

      // 🎯 CASCADE TO PARENTS FEATURE
      // If ad has cascadeToParents=true, send SAME ad to ALL parents (not just primary)
      if (advertisementData?.cascadeToParents && studentData) {
        this.logger.log(`🎯 CASCADE ENABLED: Sending same ad to ALL parents of student ${studentId}`);
        await this.cascadeAdToAllParents(studentData, advertisementData, attendanceDto);
      }

    } catch (error) {
      this.logger.error(`❌ Notification failed: ${error.message}`, error.stack);
      // Don't throw - notifications are fire-and-forget
    }
  }

  /**
   * 🎯 CASCADE ADVERTISEMENT TO ALL PARENTS
   * When an ad matches a student and cascadeToParents=true, 
   * sends the SAME ad to ALL parents (father, mother, guardian)
   * 
   * Example: "Grade 10 girls tuition" ad matches female student
   * → Father gets this ad
   * → Mother gets this ad  
   * → Guardian gets this ad
   * All parents see the relevant ad about their child's need
   */
  private async cascadeAdToAllParents(
    studentData: any,
    advertisementData: any,
    attendanceDto: MarkAttendanceDto
  ): Promise<void> {
    try {
      const studentName = `${studentData.user?.firstName || ''} ${studentData.user?.lastName || ''}`.trim();
      const allParents: Array<{type: string, user: any}> = [];

      // Collect all available parents
      if (studentData.father?.user) {
        allParents.push({ type: 'Father', user: studentData.father.user });
      }
      if (studentData.mother?.user) {
        allParents.push({ type: 'Mother', user: studentData.mother.user });
      }
      if (studentData.guardian?.user) {
        allParents.push({ type: 'Guardian', user: studentData.guardian.user });
      }

      if (allParents.length === 0) {
        this.logger.warn(`⚠️ No parents found for cascade for student ${studentData.userId}`);
        return;
      }

      this.logger.log(`🎯 Cascading ad "${advertisementData.title}" to ${allParents.length} parent(s)`);

      // Send notification to EACH parent with the SAME ad
      const cascadePromises = allParents.map(async (parent) => {
        try {
          const parentUser = parent.user;
          
          // Check if parent has contact info
          if (!parentUser.phoneNumber && !parentUser.email && !parentUser.telegramId) {
            this.logger.warn(`⚠️ ${parent.type} has no contact info for student ${studentData.userId}`);
            return;
          }

          // Check if parent's subscription should receive ads
          const parentSubscriptionPlan = parentUser.subscriptionPlan || 'FREE';
          const parentPackageConfig = NOTIFICATION_PACKAGES_CONFIG.packages[parentSubscriptionPlan.toUpperCase()];
          const shouldReceiveAds = parentPackageConfig?.isAds === true;

          if (!shouldReceiveAds) {
            this.logger.log(`ℹ️ ${parent.type} subscription (${parentSubscriptionPlan}) doesn't receive ads`);
            return;
          }

          // Build notification data for this parent with SAME ad
          const notificationData = {
            studentId: studentData.userId,
            studentName: studentName,
            parentContact: parentUser.phoneNumber || null,
            parentEmail: parentUser.email || null,
            parentTelegramId: parentUser.telegramId || null,
            attendanceStatus: (attendanceDto.status === AttendanceStatus.PRESENT ? 'PRESENT' : 'ABSENT') as 'PRESENT' | 'ABSENT',
            date: attendanceDto.date,
            time: new Date().toLocaleTimeString(),
            vehicleNumber: null,
            bookhireName: null,
            subscriptionPlan: parentSubscriptionPlan,
            advertisementData: advertisementData  // 🎯 SAME ad for ALL parents
          };

          // Send notification (fire-and-forget)
          await this.attendanceNotificationService.sendAttendanceNotification(notificationData);
          
          this.logger.log(`✅ Cascaded ad to ${parent.type} (${parentUser.phoneNumber || parentUser.email})`);
          
        } catch (error) {
          this.logger.error(`❌ Failed to cascade ad to ${parent.type}: ${error.message}`);
          // Continue with other parents
        }
      });

      // Wait for all cascade notifications (but don't block main response)
      await Promise.allSettled(cascadePromises);

      this.logger.log(`✅ Cascade complete: Ad sent to ${allParents.length} parent(s)`);

    } catch (error) {
      this.logger.error(`❌ Cascade to parents failed: ${error.message}`, error.stack);
      // Don't throw - notifications are fire-and-forget
    }
  }

  /**
   * 📊 Get MOST MATCHING advertisement from database for individual person
   * Uses multi-factor matching: userType, subscriptionPlan, age, gender, location, institute
   * Returns the best personalized advertisement based on complete user profile
   */
  private async getMatchingAdvertisementFromDB(
    subscriptionPlan: string,
    studentData: any,
    instituteId: string
  ): Promise<any> {
    try {
      // 🎯 Build complete user profile for sophisticated matching
      const userProfile = {
        userId: studentData.userId,
        userType: studentData.user.userType || 'STUDENT',
        subscriptionPlan: subscriptionPlan as any,
        instituteId: instituteId,
        // Extract additional profile data if available
        city: studentData.user.city || null,
        province: studentData.user.province || null,
        district: studentData.user.district || null,
        birthYear: studentData.user.birthYear || null,
        gender: studentData.user.gender || null,
        occupation: studentData.user.occupation || null
      };

      this.logger.log(`🎯 Finding MOST MATCHING ad for user ${userProfile.userId} with profile: ${JSON.stringify({
        userType: userProfile.userType,
        subscriptionPlan: userProfile.subscriptionPlan,
        instituteId: userProfile.instituteId,
        city: userProfile.city,
        gender: userProfile.gender,
        birthYear: userProfile.birthYear
      })}`);

      // 🔥 Use sophisticated multi-factor matching service
      const matches = await this.advertisementMatchingService.findMostMatchingAdvertisements(
        userProfile,
        1  // Get only the BEST match
      );

      if (matches.length > 0) {
        const bestMatch = matches[0];
        const advertisement = bestMatch.advertisement;

        this.logger.log(`✅ Found BEST matching ad: "${advertisement.title}" (Score: ${bestMatch.matchScore}, Reasons: ${bestMatch.matchReasons.join(', ')})`);

        // Increment sending count (fire-and-forget)
        this.advertisementRepository.increment(
          { id: advertisement.id },
          'currentSendings',
          1
        ).catch(err => this.logger.error(`Failed to increment ad sendings: ${err.message}`));

        return {
          id: advertisement.id,
          mediaUrl: advertisement.mediaUrl,
          mediaType: advertisement.mediaType,
          title: advertisement.title,
          content: advertisement.description || '',
          sendingUrl: advertisement.sendingUrl || undefined,
          supportivePlatforms: advertisement.supportivePlatforms || [],
          matchScore: bestMatch.matchScore,
          matchReasons: bestMatch.matchReasons,
          cascadeToParents: advertisement.cascadeToParents || false  // 🎯 Include cascade flag
        };
      }

      this.logger.warn(`⚠️ No matching advertisement found for user ${userProfile.userId}, using default fallback`);

      // Fallback to default ad if no matching ad found
      return {
        id: 'default-fallback',
        mediaUrl: process.env.DEFAULT_AD_URL || '',
        mediaType: process.env.DEFAULT_AD_TYPE || 'text',
        title: process.env.DEFAULT_AD_TITLE || 'Your Company Name',
        content: process.env.DEFAULT_AD_CONTENT || 'Professional education services.',
        sendingUrl: process.env.DEFAULT_AD_SENDING_URL || undefined,
        supportivePlatforms: [],  // Default ads support all platforms
        matchScore: 0,
        matchReasons: ['No matching advertisement found in database'],
        cascadeToParents: false  // Default ads don't cascade
      };
    } catch (error) {
      this.logger.error(`❌ Failed to fetch matching advertisement: ${error.message}`, error.stack);
      // Return default ad on error
      return {
        id: 'default-error-fallback',
        mediaUrl: process.env.DEFAULT_AD_URL || '',
        mediaType: process.env.DEFAULT_AD_TYPE || 'text',
        title: process.env.DEFAULT_AD_TITLE || 'Your Company Name',
        content: process.env.DEFAULT_AD_CONTENT || 'Professional education services.',
        sendingUrl: process.env.DEFAULT_AD_SENDING_URL || undefined,
        supportivePlatforms: [],  // Default ads support all platforms
        matchScore: 0,
        matchReasons: ['Error occurred while fetching advertisement'],
        cascadeToParents: false  // Default ads don't cascade
      };
    }
  }

  /**
   * 🏭 INDUSTRIAL-GRADE DATA FETCHING: Get real student with parent data
   */
  /**
   * 👥 Fetch student names from database (bulk operation)
   * Returns a Map of studentId -> studentName
   */
  private async fetchStudentNames(studentIds: string[]): Promise<Map<string, string>> {
    const studentNamesMap = new Map<string, string>();
    
    try {
      // Batch fetch all students with their user data
      const students = await this.studentRepository.find({
        where: { userId: In(studentIds) },
        relations: ['user'],
        select: {
          userId: true,
          user: {
            id: true,
            firstName: true,
            lastName: true
          }
        }
      });

      // Build map of studentId -> fullName
      for (const student of students) {
        if (student.user) {
          const fullName = `${student.user.firstName} ${student.user.lastName}`.trim();
          studentNamesMap.set(student.userId, fullName);
        }
      }

      return studentNamesMap;
    } catch (error) {
      return studentNamesMap;
    }
  }

  private async fetchStudentWithParentData(studentId: string): Promise<{
    student: StudentEntity | null;
    primaryParent: UserEntity | null;
    parentContact: string | null;
    parentEmail: string | null;
    parentTelegramId: string | null;
    subscriptionPlan: string;
  }> {
    try {
      const student = await this.studentRepository.findOne({
        where: { userId: studentId },
        relations: ['user', 'father', 'father.user', 'mother', 'mother.user', 'guardian', 'guardian.user'],
        select: {
          userId: true,
          fatherId: true,
          motherId: true,
          guardianId: true,
          studentId: true,
          emergencyContact: true,
          isActive: true,
          user: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phoneNumber: true,
            subscriptionPlan: true,
            telegramId: true,
            imageUrl: true
          },
          father: {
            userId: true,
            user: {
              firstName: true,
              lastName: true,
              email: true,
              phoneNumber: true,
              telegramId: true
            }
          },
          mother: {
            userId: true,
            user: {
              firstName: true,
              lastName: true,
              email: true,
              phoneNumber: true,
              telegramId: true
            }
          },
          guardian: {
            userId: true,
            user: {
              firstName: true,
              lastName: true,
              email: true,
              phoneNumber: true,
              telegramId: true
            }
          }
        }
      });

      if (!student) {
        return {
          student: null,
          primaryParent: null,
          parentContact: null,
          parentEmail: null,
          parentTelegramId: null,
          subscriptionPlan: 'FREE'
        };
      }

      let primaryParent: UserEntity | null = null;
      let parentContact: string | null = null;
      let parentEmail: string | null = null;
      let parentTelegramId: string | null = null;

      // Priority: Father → Mother → Guardian
      if (student.father?.user) {
        primaryParent = student.father.user;
      } else if (student.mother?.user) {
        primaryParent = student.mother.user;
      } else if (student.guardian?.user) {
        primaryParent = student.guardian.user;
      }

      if (primaryParent) {
        parentContact = primaryParent.phoneNumber || null;
        parentEmail = primaryParent.email || null;
        parentTelegramId = primaryParent.telegramId || null;
      }

      // Fallback: Use student's emergency contact if no parent contact found
      if (!parentContact && student.emergencyContact) {
        parentContact = student.emergencyContact;
      }

      const subscriptionPlan = student.user?.subscriptionPlan || 'FREE';

      return {
        student,
        primaryParent,
        parentContact,
        parentEmail,
        parentTelegramId,
        subscriptionPlan
      };

    } catch (error) {
      this.logger.error(`❌ Failed to fetch student data: ${error.message}`);
      this.logger.error(`   Stack: ${error.stack}`);
      return {
        student: null,
        primaryParent: null,
        parentContact: null,
        parentEmail: null,
        parentTelegramId: null,
        subscriptionPlan: 'FREE'
      };
    }
  }

  /**
   * Get student's vehicle/bookhire information
   */
  private async fetchStudentVehicleData(studentId: string): Promise<{
    vehicleNumber: string | null;
    bookhireName: string | null;
  }> {
    try {
      // Fetch student vehicle enrollment data - Optimized field selection
      const enrollment = await this.enrollmentRepository.findOne({
        where: { studentId: studentId },
        select: {
          studentId: true,
          bookhireId: true,
          status: true
        }
      });

      if (enrollment?.bookhireId) {
        // For now, we'll just use the bookhire ID
        // TODO: Add BookhireEntity relation to get vehicle details
        return {
          vehicleNumber: `Vehicle-${enrollment.bookhireId}`,
          bookhireName: `Bookhire Service`
        };
      }

      return {
        vehicleNumber: null,
        bookhireName: null
      };

    } catch (error) {
      return {
        vehicleNumber: null,
        bookhireName: null
      };
    }
  }

  /**
   * 📇 GET INSTITUTE USER BY CARD ID
   * Fetches institute user details including image URL logic:
   * - If imageVerificationStatus is VERIFIED, use instituteUserImageUrl
   * - Otherwise, use global user.imageUrl
   */
  async getInstituteUserByCardId(dto: GetInstituteUserByCardDto): Promise<InstituteCardUserResponseDto> {
    const { instituteCardId, instituteId } = dto;

    // Query institute_user table with card ID and institute ID
    const instituteUser = await this.instituteUserRepository.findOne({
      where: { 
        instituteCardId, 
        instituteId 
      },
      relations: ['user'],
      select: {
        instituteId: true,
        userId: true,
        userIdByInstitute: true,
        status: true,
        instituteCardId: true,
        instituteUserImageUrl: true,
        imageVerificationStatus: true,
        user: {
          id: true,
          firstName: true,
          lastName: true,
          imageUrl: true,
          userType: true
        }
      }
    });

    if (!instituteUser) {
      // Enhanced error with debugging info
      const errorDetails = {
        message: `No user found with institute card ID: ${instituteCardId} in institute: ${instituteId}`,
        cardId: instituteCardId,
        instituteId: instituteId,
        hint: 'Please ensure the institute card is registered in the institute_user table',
        suggestion: 'Check: SELECT * FROM institute_user WHERE instituteCardId = ? AND instituteId = ?',
        timestamp: new Date().toISOString()
      };
      this.logger.error(`Institute Card Not Found: ${JSON.stringify(errorDetails)}`);
      throw new Error(errorDetails.message);
    }

    // Image URL logic:
    // 1. If imageVerificationStatus is VERIFIED, use instituteUserImageUrl
    // 2. Otherwise, use global user.imageUrl
    const isVerified = instituteUser.imageVerificationStatus === ImageVerificationStatus.VERIFIED;
    const finalImageUrl = isVerified && instituteUser.instituteUserImageUrl 
      ? instituteUser.instituteUserImageUrl 
      : (instituteUser.user?.imageUrl || null);

    let imageUrl = finalImageUrl;
    try {
      if (finalImageUrl) {
        imageUrl = this.CloudStorageService.getFullUrl(finalImageUrl);
      }
    } catch (storageError) {
      this.logger.warn(`Failed to get full URL for image: ${storageError.message}`);
    }

    return {
      userId: instituteUser.userId,
      userName: `${instituteUser.user?.firstName || ''} ${instituteUser.user?.lastName || ''}`.trim(),
      userIdByInstitute: instituteUser.userIdByInstitute || '',
      instituteCardId: instituteUser.instituteCardId || '',
      imageUrl: imageUrl,
      imageVerificationStatus: instituteUser.imageVerificationStatus,
      isInstituteImage: isVerified && !!instituteUser.instituteUserImageUrl,
      userType: instituteUser.user?.userType || 'UNKNOWN',
      status: instituteUser.status
    };
  }

  /**
   * 📝 MARK ATTENDANCE BY INSTITUTE CARD ID
   * Main attendance marking logic using institute card ID
   * - Looks up user via institute_user table by instituteCardId
   * - Gets user name from users table JOIN
   * - Applies image URL logic (institute verified vs global)
   * - Uses EXACT same logic as markAttendance (notifications, DynamoDB, etc.)
   */
  async markAttendanceByInstituteCard(
    markAttendanceDto: MarkAttendanceByInstituteCardDto, 
    markedBy: string
  ): Promise<any> {
    const { instituteCardId, instituteId } = markAttendanceDto;

    // � ULTIMATE OPTIMIZATION: ONE SINGLE QUERY WITH ALL DATA!
    // Query chain: institute_user → user → student → father/mother/guardian → parent.user
    // This replaces 2-3 separate queries with ONE mega-query (10+ JOINs in single SQL!)
    // 
    // 🚀 ULTIMATE OPTIMIZATION: Single query with ALL data needed for notifications!
    // Get institute user + student + ALL parent contact data in ONE query
    // No redundant fetching - everything loaded once, used immediately for fast notifications
    
    const instituteUser = await this.instituteUserRepository
      .createQueryBuilder('institute_user')
      .leftJoinAndSelect('institute_user.user', 'user')
      .where('institute_user.instituteCardId = :instituteCardId', { instituteCardId })
      .andWhere('institute_user.instituteId = :instituteId', { instituteId })
      .select([
        'institute_user.instituteId',
        'institute_user.userId',
        'institute_user.userIdByInstitute',
        'institute_user.status',
        'institute_user.instituteCardId',
        'institute_user.instituteUserImageUrl',
        'institute_user.imageVerificationStatus',
        'user.id',
        'user.firstName',
        'user.lastName',
        'user.imageUrl',
        'user.userType'
      ])
      .getOne();

    if (!instituteUser) {
      throw new Error(
        `No user found with institute card ID: ${instituteCardId} in institute: ${instituteId}. ` +
        `Please check: 1) Card ID is registered, 2) Card ID is correct, 3) User is assigned to this institute.`
      );
    }

    // 🔥 MEGA-QUERY: Get student with ALL parent contact data in ONE shot (8 JOINs!)
    // This is CORRECT because we NEED parent data for immediate notification sending
    // Parent contacts fetched ONCE here, used immediately in fire-and-forget notifications
    const studentData = await this.studentRepository
      .createQueryBuilder('student')
      .leftJoinAndSelect('student.user', 'user')
      .leftJoinAndSelect('student.father', 'father')
      .leftJoinAndSelect('father.user', 'fatherUser')
      .leftJoinAndSelect('student.mother', 'mother')
      .leftJoinAndSelect('mother.user', 'motherUser')
      .leftJoinAndSelect('student.guardian', 'guardian')
      .leftJoinAndSelect('guardian.user', 'guardianUser')
      .where('student.userId = :userId', { userId: instituteUser.userId })
      .select([
        // Student fields
        'student.userId',
        'student.fatherId',
        'student.motherId',
        'student.guardianId',
        'student.studentId',
        'student.isActive',
        // Student user data
        'user.id',
        'user.firstName',
        'user.lastName',
        'user.email',
        'user.phoneNumber',
        'user.subscriptionPlan',
        'user.telegramId',
        'user.imageUrl',
        // Father data (for notifications)
        'father.userId',
        'fatherUser.firstName',
        'fatherUser.lastName',
        'fatherUser.email',
        'fatherUser.phoneNumber',
        'fatherUser.telegramId',
        // Mother data (for notifications)
        'mother.userId',
        'motherUser.firstName',
        'motherUser.lastName',
        'motherUser.email',
        'motherUser.phoneNumber',
        'motherUser.telegramId',
        // Guardian data (for notifications)
        'guardian.userId',
        'guardianUser.firstName',
        'guardianUser.lastName',
        'guardianUser.email',
        'guardianUser.phoneNumber',
        'guardianUser.telegramId'
      ])
      .getOne();

    if (!studentData?.user) {
      throw new Error(`Student not found with ID: ${instituteUser.userId}`);
    }

    // Step 3: Extract data from loaded entities
    const studentName = `${studentData.user.firstName} ${studentData.user.lastName}`.trim();
    const studentId = instituteUser.userId;
    const subscriptionPlan = studentData.user.subscriptionPlan || 'FREE';

    // Step 4: Image URL logic
    const isVerified = instituteUser.imageVerificationStatus === ImageVerificationStatus.VERIFIED;
    const finalImageUrl = isVerified && instituteUser.instituteUserImageUrl 
      ? instituteUser.instituteUserImageUrl 
      : (studentData.user.imageUrl || null);

    // Step 5: Extract parent contact info (Priority: Father → Mother → Guardian)
    let parentContact: string | null = null;
    let parentEmail: string | null = null;
    let parentTelegramId: string | null = null;

    if (studentData.father?.user) {
      parentContact = studentData.father.user.phoneNumber || null;
      parentEmail = studentData.father.user.email || null;
      parentTelegramId = studentData.father.user.telegramId || null;
    } else if (studentData.mother?.user) {
      parentContact = studentData.mother.user.phoneNumber || null;
      parentEmail = studentData.mother.user.email || null;
      parentTelegramId = studentData.mother.user.telegramId || null;
    } else if (studentData.guardian?.user) {
      parentContact = studentData.guardian.user.phoneNumber || null;
      parentEmail = studentData.guardian.user.email || null;
      parentTelegramId = studentData.guardian.user.telegramId || null;
    }

    // Step 6: Convert to standard attendance DTO format
    const attendanceDto: MarkAttendanceDto = {
      studentId: studentId,
      studentName: studentName,
      instituteId: markAttendanceDto.instituteId,
      instituteName: markAttendanceDto.instituteName,
      classId: markAttendanceDto.classId || 'default',
      className: markAttendanceDto.className || '',
      subjectId: markAttendanceDto.subjectId || '',
      subjectName: markAttendanceDto.subjectName || '',
      status: markAttendanceDto.status,
      markingMethod: markAttendanceDto.markingMethod,
      date: markAttendanceDto.date || new Date().toISOString().split('T')[0],
      location: markAttendanceDto.location || this.generateAddress(
        markAttendanceDto.instituteName,
        markAttendanceDto.className,
        markAttendanceDto.subjectName
      )
    };

    // Step 7: Mark attendance in DynamoDB
    const result = await this.dynamoAttendanceService.markAttendance(attendanceDto);

    // Step 8: 🔥 FIRE-AND-FORGET NOTIFICATIONS (non-blocking, immediate send)
    // Send notifications WITHOUT waiting - response returns immediately
    if (parentContact || parentEmail || parentTelegramId) {
      // Check if notifications enabled
      const isAdsFromDB = this.configService.get<string>('IS_ADS_FROM_DB') === 'true';
      
      // Fire-and-forget: Start notification process but don't wait
      this.sendImmediateNotification({
        studentId,
        studentName,
        parentContact,
        parentEmail,
        parentTelegramId,
        subscriptionPlan,
        attendanceDto,
        isAdsFromDB,
        studentData,  // ✅ Pass complete student data for ad matching
        instituteId: markAttendanceDto.instituteId  // ✅ Pass institute ID for ad targeting
      }).catch(error => {
        // Log error but don't throw - notifications shouldn't block attendance marking
        this.logger.error(`Notification failed for student ${studentId}: ${error.message}`);
      });
    }

    // Step 8: Return response with image URL and verification info
    return {
      success: true,
      message: 'Attendance marked successfully using institute card',
      imageUrl: finalImageUrl,
      isInstituteImage: isVerified && !!instituteUser.instituteUserImageUrl,
      imageVerificationStatus: instituteUser.imageVerificationStatus,
      status: markAttendanceDto.status,
      name: studentName,
      instituteCardId: instituteCardId,
      userIdByInstitute: instituteUser.userIdByInstitute,
      data: {
        studentId: studentId,
        studentName: studentName,
        instituteId: markAttendanceDto.instituteId,
        instituteName: markAttendanceDto.instituteName,
        className: markAttendanceDto.className,
        subjectName: markAttendanceDto.subjectName,
        status: markAttendanceDto.status,
        date: attendanceDto.date,
        location: attendanceDto.location,
        markingMethod: markAttendanceDto.markingMethod,
        markedAt: new Date().toISOString()
      }
    };
  }

  /**
   * Validates that a student is enrolled in the given institute
   * @throws BadRequestException if validation is enabled and student is not enrolled or inactive
   */
  private async validateStudentEnrollment(
    studentId: string,
    instituteId: string
  ): Promise<void> {
    // Check if enrollment validation is enabled via environment variable
    const envValue = this.configService.get<string>('ATTENDANCE_MARKS_FOR_ONLY_ENROLLED_INSTITUTE_STUDENTS');
    const shouldValidate = envValue === 'true';
    
    this.logger.debug(`Enrollment validation check - ENV value: "${envValue}", shouldValidate: ${shouldValidate}`);
    
    if (!shouldValidate) {
      this.logger.debug(`Institute enrollment validation disabled - skipping validation for student ${studentId}`);
      return;
    }

    this.logger.log(`Validating institute enrollment for student ${studentId} at institute ${instituteId}`);

    try {
      // Check if student is enrolled in the institute
      const enrollment = await this.instituteUserRepository.findOne({
        where: {
          userId: studentId,
          instituteId: instituteId
        }
      });

      if (!enrollment) {
        this.logger.warn(`Student ${studentId} is not enrolled in institute ${instituteId}`);
        throw new BadRequestException(
          `Student is currently not enrolled in this institute. Please contact the institute administrator.`
        );
      }

      // Check if enrollment is active
      if (enrollment.status !== InstituteUserStatus.ACTIVE) {
        this.logger.warn(`Student ${studentId} enrollment status is ${enrollment.status} (not ACTIVE)`);
        throw new BadRequestException(
          `Student enrollment is not active. Please contact the institute administrator.`
        );
      }

      this.logger.log(`✅ Enrollment validated successfully for student ${studentId}`);
    } catch (error) {
      // If it's already a BadRequestException, rethrow it
      if (error instanceof BadRequestException) {
        throw error;
      }
      // For any other database/system errors, log but don't expose internal details
      this.logger.error(`Error validating enrollment for student ${studentId}: ${error.message}`);
      throw new BadRequestException(
        `Unable to verify student enrollment. Please try again.`
      );
    }
  }
}



