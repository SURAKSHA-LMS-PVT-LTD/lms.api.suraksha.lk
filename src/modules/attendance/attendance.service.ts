import { Injectable, Logger, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { DynamoDBAttendanceService } from './services/dynamodb-attendance.service';
import { AttendanceNotificationService } from './services/attendance-notification.service';
import { InstituteCalendarService } from '../institute/services/institute-calendar.service';
import { CalendarDayCacheService } from '../institute/services/calendar-day-cache.service';
import { NOTIFICATION_PACKAGES_CONFIG } from '../advertisement/services/notification-packages.config';
import { MarkAttendanceDto, BulkAttendanceDto, GetStudentAttendanceDto, StudentAttendanceResponseDto, AttendanceStatus, AttendanceUserType } from './dto/attendance.dto';
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
import { InstituteUserType } from '../institute_mudules/institue_user/enums/institute-user-type.enum';
import { AdvertisementEntity } from '../advertisement/entities/advertisement.entity';
import { AdvertisementMatchingService } from '../advertisement/advertisement-matching.service';
import { CardStatus } from '../user-card-management/enums/card-status.enum';
import { MarkingMethod } from './dto/attendance.dto';
import { getCurrentSriLankaDate, getCurrentSriLankaISO, nowTimestamp, formatSriLankaTime, now } from '../../common/utils/timezone.util';

@Injectable()
export class AttendanceService {
  private readonly logger = new Logger(AttendanceService.name);
  private readonly instituteIdsRequiringCustomImages: Set<string>;
  private readonly notificationsEnabled: boolean;

  constructor(
    private readonly configService: ConfigService,
    private readonly dynamoAttendanceService: DynamoDBAttendanceService,
    private readonly attendanceNotificationService: AttendanceNotificationService,
    private readonly advertisementMatchingService: AdvertisementMatchingService,
    private readonly instituteCalendarService: InstituteCalendarService,
    private readonly calendarDayCacheService: CalendarDayCacheService,
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
  ) {
    // ⚡ OPTIMIZATION: Cache config parsing to avoid repeated string operations
    const instituteIds = this.configService.get<string>('INSTITUTE_IDS_WITH_CUSTOM_IMAGES')?.split(',').map(id => id.trim()) || [];
    this.instituteIdsRequiringCustomImages = new Set(instituteIds);
    this.notificationsEnabled = this.configService.get('ENABLE_ATTENDANCE_NOTIFICATIONS', 'true') === 'true';
  }

  /**
   * 🔍 AUTO-DETECT USER TYPE: Look up institute_user to determine the user's role in this institute
   * Returns the InstituteUserType or NOT_ENROLLED if not found
   */
  private async detectInstituteUserType(
    userId: string,
    instituteId: string
  ): Promise<{ 
    userType: AttendanceUserType; 
    instituteUser: InstituteUserEntity | null;
  }> {
    try {
      const instituteUser = await this.instituteUserRepository.findOne({
        where: {
          userId: userId,
          instituteId: instituteId,
        },
        select: ['userId', 'instituteId', 'instituteUserType', 'status', 'instituteUserImageUrl', 'imageVerificationStatus'],
      });

      if (!instituteUser) {
        return { userType: AttendanceUserType.NOT_ENROLLED, instituteUser: null };
      }

      // Map InstituteUserType enum to AttendanceUserType enum
      const typeMap: Record<string, AttendanceUserType> = {
        [InstituteUserType.STUDENT]: AttendanceUserType.STUDENT,
        [InstituteUserType.TEACHER]: AttendanceUserType.TEACHER,
        [InstituteUserType.INSTITUTE_ADMIN]: AttendanceUserType.INSTITUTE_ADMIN,
        [InstituteUserType.ATTENDANCE_MARKER]: AttendanceUserType.ATTENDANCE_MARKER,
        [InstituteUserType.PARENT]: AttendanceUserType.PARENT,
      };

      return { 
        userType: typeMap[instituteUser.instituteUserType] || AttendanceUserType.STUDENT, 
        instituteUser 
      };
    } catch (error) {
      this.logger.warn(`Failed to detect user type for ${userId} in institute ${instituteId}: ${error.message}`);
      return { userType: AttendanceUserType.NOT_ENROLLED, instituteUser: null };
    }
  }

  /**
   * 🖼️ RESOLVE IMAGE URL: Get the correct image for any user type
   * Uses institute-specific image if verified, falls back to global user image
   */
  private resolveImageUrl(
    instituteUser: InstituteUserEntity | null,
    globalImageUrl: string | null,
    instituteId: string
  ): string | null {
    try {
      const requiresInstituteImage = this.instituteIdsRequiringCustomImages.has(instituteId);

      if (requiresInstituteImage && instituteUser) {
        const isVerified = instituteUser.imageVerificationStatus === ImageVerificationStatus.VERIFIED;
        const finalImageUrl = isVerified && instituteUser.instituteUserImageUrl
          ? instituteUser.instituteUserImageUrl
          : globalImageUrl;

        return finalImageUrl ? this.CloudStorageService.getFullUrl(finalImageUrl) : null;
      }

      return globalImageUrl ? this.CloudStorageService.getFullUrl(globalImageUrl) : null;
    } catch (error) {
      return globalImageUrl || null;
    }
  }

  async markAttendance(markAttendanceDto: MarkAttendanceDto, markedBy: string): Promise<any> {
    const requestId = `ATT_${nowTimestamp()}`;
    const startTime = nowTimestamp();
    
    try {
      // ✅ STEP 1: Auto-detect user type from institute_user table
      const { userType, instituteUser } = await this.detectInstituteUserType(
        markAttendanceDto.studentId,
        markAttendanceDto.instituteId
      );

      // ✅ STEP 2: Validate enrollment if configured (applies to all user types)
      await this.validateUserEnrollment(
        markAttendanceDto.studentId,
        markAttendanceDto.instituteId,
        userType
      );

      // ✅ STEP 3: Fetch user data based on user type
      let userName: string;
      let globalImageUrl: string | null = null;
      let studentData: any = null;

      if (userType === AttendanceUserType.STUDENT) {
        // STUDENT path: Use existing student + parent data fetch (for notifications)
        studentData = await this.fetchStudentWithParentData(markAttendanceDto.studentId);
        
        if (!studentData.student?.user) {
          throw new Error(`Student not found: ${markAttendanceDto.studentId}`);
        }

        userName = `${studentData.student.user.firstName} ${studentData.student.user.lastName}`.trim();
        globalImageUrl = studentData.student.user.imageUrl || null;
      } else {
        // NON-STUDENT path: Query UserEntity directly (TEACHER, INSTITUTE_ADMIN, etc.)
        const user = await this.userRepository.findOne({
          where: { id: markAttendanceDto.studentId },
          select: ['id', 'firstName', 'lastName', 'imageUrl', 'email', 'phoneNumber', 'subscriptionPlan'],
        });

        if (!user) {
          throw new Error(`User not found: ${markAttendanceDto.studentId}`);
        }

        userName = `${user.firstName} ${user.lastName || ''}`.trim();
        globalImageUrl = user.imageUrl || null;
      }

      markAttendanceDto.studentName = userName;
      // Attach auto-detected userType to the DTO for DynamoDB storage
      markAttendanceDto.userType = userType;

      if (!markAttendanceDto.date) {
        markAttendanceDto.date = getCurrentSriLankaDate();
      }

      if (!markAttendanceDto.location) {
        markAttendanceDto.location = this.generateAddress(
          markAttendanceDto.instituteName,
          markAttendanceDto.className,
          markAttendanceDto.subjectName
        );
      }

      // ✅ STEP 3.5: Lookup calendar day (with caching ~0.01ms hit, ~3ms miss)
      try {
        const { day: calendarDay, defaultEventId } = await this.calendarDayCacheService.getTodayCalendarDay(
          markAttendanceDto.instituteId
        );

        if (calendarDay) {
          (markAttendanceDto as any).calendarDayId = calendarDay.id;

          // ✅ PERFORMANCE: Use cached default event ID instead of querying MySQL every time
          if (!markAttendanceDto.eventId && defaultEventId) {
            (markAttendanceDto as any).eventId = defaultEventId;
          }
        } else {
          this.logger.warn(
            `[${requestId}] ⚠️  No calendar day found for institute ${markAttendanceDto.instituteId} on ${markAttendanceDto.date}. ` +
            `Lazy creation will occur in calendar service if needed.`
          );
        }
      } catch (calendarError) {
        // Don't block attendance marking if calendar lookup fails
        this.logger.warn(
          `[${requestId}] ⚠️  Calendar day lookup failed: ${calendarError.message}. ` +
          `Attendance will be marked without calendar linkage.`
        );
      }

      // ✅ STEP 4: Mark attendance in DynamoDB (same for all user types)
      const result = await this.dynamoAttendanceService.markAttendance(markAttendanceDto);

      // ✅ STEP 5: Send notifications ONLY for students (teachers/admins don't need parent notifications)
      if (userType === AttendanceUserType.STUDENT && studentData) {
        this.scheduleAttendanceNotification(markAttendanceDto, result, studentData);
      }

      // ✅ STEP 6: Resolve image URL (works for ALL user types)
      const imageUrl = this.resolveImageUrl(instituteUser, globalImageUrl, markAttendanceDto.instituteId);
      
      return {
        success: true,
        imageUrl: imageUrl,
        status: markAttendanceDto.status,
        name: userName,
        userType: userType,  // ✅ NEW: Return the auto-detected user type
      };
    } catch (error) {
      this.logger.error(`[${requestId}] ❌ ERROR: Failed to mark attendance - ${error.message}`, error.stack);
      throw error;
    }
  }

  async markBulkAttendance(bulkAttendanceDto: BulkAttendanceDto, markedBy: string): Promise<any> {
    const requestId = `BULK_ATT_${nowTimestamp()}`;
    const startTime = nowTimestamp();
    
    try {
      const userIds = bulkAttendanceDto.students.map(s => s.studentId);
      
      // ✅ STEP 1: Batch detect user types from institute_user table
      const instituteUsers = await this.instituteUserRepository.find({
        where: {
          userId: In(userIds),
          instituteId: bulkAttendanceDto.instituteId,
        },
        select: ['userId', 'instituteUserType', 'status'],
      });
      const instituteUserMap = new Map(
        instituteUsers.map(iu => [iu.userId, iu])
      );

      // ✅ STEP 2: Validate enrollment (if configured) - batch operation
      await Promise.all(
        userIds.map(userId => {
          const iu = instituteUserMap.get(userId);
          const detectedType = iu 
            ? (AttendanceUserType[iu.instituteUserType as keyof typeof AttendanceUserType] || AttendanceUserType.STUDENT) 
            : AttendanceUserType.NOT_ENROLLED;
          return this.validateUserEnrollment(userId, bulkAttendanceDto.instituteId, detectedType);
        })
      );
      
      // ✅ STEP 3: Separate students from non-students for different data fetch strategies
      const studentUserIds = userIds.filter(id => {
        const iu = instituteUserMap.get(id);
        return !iu || iu.instituteUserType === InstituteUserType.STUDENT;
      });
      const nonStudentUserIds = userIds.filter(id => {
        const iu = instituteUserMap.get(id);
        return iu && iu.instituteUserType !== InstituteUserType.STUDENT;
      });

      // ✅ STEP 4A: Fetch students from students table (with parent data for notifications)
      const studentEntities = studentUserIds.length > 0 
        ? await this.studentRepository.find({
            where: { userId: In(studentUserIds) },
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
          })
        : [];

      // ✅ STEP 4B: Fetch non-student users directly from users table
      const nonStudentEntities = nonStudentUserIds.length > 0
        ? await this.userRepository.find({
            where: { id: In(nonStudentUserIds) },
            select: ['id', 'firstName', 'lastName', 'imageUrl'],
          })
        : [];

      // ✅ STEP 5: Build unified user map (userId -> { name, userType })
      const userDataMap = new Map<string, { name: string; userType: AttendanceUserType }>();
      
      for (const student of studentEntities) {
        if (student.user) {
          userDataMap.set(student.userId, {
            name: `${student.user.firstName} ${student.user.lastName}`.trim(),
            userType: AttendanceUserType.STUDENT,
          });
        }
      }
      
      for (const user of nonStudentEntities) {
        const iu = instituteUserMap.get(user.id.toString());
        const typeMap: Record<string, AttendanceUserType> = {
          [InstituteUserType.TEACHER]: AttendanceUserType.TEACHER,
          [InstituteUserType.INSTITUTE_ADMIN]: AttendanceUserType.INSTITUTE_ADMIN,
          [InstituteUserType.ATTENDANCE_MARKER]: AttendanceUserType.ATTENDANCE_MARKER,
          [InstituteUserType.PARENT]: AttendanceUserType.PARENT,
        };
        userDataMap.set(user.id.toString(), {
          name: `${user.firstName} ${user.lastName || ''}`.trim(),
          userType: iu ? (typeMap[iu.instituteUserType] || AttendanceUserType.STUDENT) : AttendanceUserType.NOT_ENROLLED,
        });
      }

      // ✅ STEP 6: Validate all users exist and update names
      const validatedStudents = [];
      const invalidUsers = [];
      
      for (const studentItem of bulkAttendanceDto.students) {
        const userData = userDataMap.get(studentItem.studentId);
        
        if (!userData) {
          invalidUsers.push({
            studentId: studentItem.studentId,
            error: `User not found: ${studentItem.studentId}`
          });
          this.logger.warn(`[${requestId}] ⚠️  User not found: ${studentItem.studentId}`);
          continue;
        }
        
        // Override with database name
        studentItem.studentName = userData.name;
        validatedStudents.push(studentItem);
      }
      
      // ✅ STEP 7: Check if any users were invalid
      if (invalidUsers.length > 0) {
        this.logger.error(`[${requestId}] ❌ ${invalidUsers.length} invalid users found`);
        throw new NotFoundException(
          `${invalidUsers.length} user(s) not found: ${invalidUsers.map(s => s.studentId).join(', ')}`
        );
      }
      
      // ✅ STEP 8: Update the DTO with only validated users
      bulkAttendanceDto.students = validatedStudents;
      
      // ✅ STEP 8.5: Lookup calendar day for calendar linkage (BUG-001 FIX)
      try {
        const { day: calendarDay, defaultEventId } = await this.calendarDayCacheService.getTodayCalendarDay(
          bulkAttendanceDto.instituteId
        );
        if (calendarDay) {
          (bulkAttendanceDto as any).calendarDayId = calendarDay.id;
          (bulkAttendanceDto as any).defaultEventId = defaultEventId;
        }
      } catch (calendarError) {
        this.logger.warn(
          `[${requestId}] ⚠️  Calendar day lookup failed for bulk: ${calendarError.message}. ` +
          `Bulk attendance will be marked without calendar linkage.`
        );
      }

      // ✅ STEP 9: Mark attendance in DynamoDB
      const results = await this.dynamoAttendanceService.markBulkAttendance(bulkAttendanceDto);
      
      // ✅ STEP 10: Send notifications ONLY for students (teachers/admins skip parent notifications)
      if (this.notificationsEnabled) {
        results.forEach(result => {
          const userData = userDataMap.get(result.studentId);
          // Only send parent notifications for STUDENT type
          if (userData?.userType === AttendanceUserType.STUDENT) {
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
              markingMethod: bulkAttendanceDto.markingMethod,
              userType: AttendanceUserType.STUDENT,
            };

            this.scheduleAttendanceNotification(markAttendanceDto, result);
          }
        });
      }

      return {
        success: true,
        message: `Bulk attendance marked successfully for ${results.length} users`,
        totalProcessed: results.length,
        action: 'bulk_created',
        records: results
      };
    } catch (error) {
      this.logger.error(`[${requestId}] ❌ ERROR: Bulk attendance failed - ${error.message}`, error.stack);
      throw error;
    }
  }

  async getStudentAttendance(getStudentAttendanceDto: GetStudentAttendanceDto, user?: any): Promise<StudentAttendanceResponseDto> {
    const { studentId, startDate, endDate, page = 1, limit = 20, status } = getStudentAttendanceDto;
    
    // SECURITY: Validate access - student themselves OR parent with child in JWT
    if (user) {
      const isOwnData = user.s === studentId;
      const children = Array.isArray(user.c) ? user.c : [];
      const isParentOfStudent = children.includes(studentId);
      
      if (!isOwnData && !isParentOfStudent) {
        this.logger.warn(`Access denied: User ${user.s} attempted to access attendance for student ${studentId}`);
        throw new ForbiddenException('You can only access your own attendance data or your children\'s attendance data.');
      }
      
      this.logger.debug(`✅ Attendance access granted: ${isOwnData ? 'Own data' : 'Parent accessing child data'}`);
    }
    
    // ✅ Get all attendance records for the student in the date range
    // ✅ FIXED BUG-003: Now passes instituteId from DTO instead of empty string
    const allRecords = await this.dynamoAttendanceService.getStudentAttendance(
      studentId,
      getStudentAttendanceDto.instituteId,
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
    const totalLeft = allRecords.filter(r => r.status === AttendanceStatus.LEFT).length;
    const totalLeftEarly = allRecords.filter(r => r.status === AttendanceStatus.LEFT_EARLY).length;
    const totalLeftLately = allRecords.filter(r => r.status === AttendanceStatus.LEFT_LATELY).length;
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
      status: record.status,
      userType: (record as any).userType || AttendanceUserType.STUDENT
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
        totalLeft,
        totalLeftEarly,
        totalLeftLately,
        attendanceRate: parseFloat(attendanceRate.toFixed(2))
      }
    };
  }

  /**
   * ✅ CARD VALIDATION HELPER
   * Validates card status and expiry for both RFID and normal cards
   */
  private validateCardForAttendance(
    user: UserEntity,
    cardType: 'rfid' | 'normal',
    cardIdValue: string
  ): { valid: boolean; cardStatus?: CardStatus; cardExpiryDate?: Date; error?: string } {
    const status = cardType === 'rfid' ? user.rfidCardStatus : user.cardStatus;
    const expiryDate = cardType === 'rfid' ? user.rfidExpiryDate : user.cardExpiryDate;

    // Check card status
    if (status && status !== CardStatus.ACTIVE) {
      return {
        valid: false,
        cardStatus: status,
        cardExpiryDate: expiryDate,
        error: `Card ${cardIdValue} is ${status}. Only ACTIVE cards can mark attendance.`
      };
    }

    // Check expiry date
    if (expiryDate && new Date(expiryDate) < new Date()) {
      return {
        valid: false,
        cardStatus: CardStatus.EXPIRED,
        cardExpiryDate: expiryDate,
        error: `Card ${cardIdValue} has expired on ${new Date(expiryDate).toISOString().split('T')[0]}. Please renew your card.`
      };
    }

    return { valid: true, cardStatus: status, cardExpiryDate: expiryDate };
  }

  async markAttendanceByCard(markAttendanceByCardDto: MarkAttendanceByCardDto, markedBy: string): Promise<any> {
    const { studentCardId, markingMethod } = markAttendanceByCardDto;
    const isNfc = markingMethod === MarkingMethod.RFID_NFC;

    // ✅ DUAL LOOKUP: NFC → rfid column, QR/Barcode → cardId column
    let user: UserEntity | null = null;
    let cardType: 'rfid' | 'normal';

    if (isNfc) {
      // NFC/RFID scan → look up by rfid column
      user = await this.userRepository.findOne({
        where: { rfid: studentCardId },
        select: ['id', 'firstName', 'lastName', 'imageUrl', 'rfid', 'rfidCardStatus', 'rfidExpiryDate', 'cardId', 'cardStatus', 'cardExpiryDate']
      });
      cardType = 'rfid';
    } else {
      // QR/Barcode scan → look up by cardId column first, fallback to rfid
      user = await this.userRepository.findOne({
        where: { cardId: studentCardId },
        select: ['id', 'firstName', 'lastName', 'imageUrl', 'rfid', 'rfidCardStatus', 'rfidExpiryDate', 'cardId', 'cardStatus', 'cardExpiryDate']
      });
      cardType = 'normal';

      // Fallback: try rfid if not found by cardId (backward compatibility)
      if (!user) {
        user = await this.userRepository.findOne({
          where: { rfid: studentCardId },
          select: ['id', 'firstName', 'lastName', 'imageUrl', 'rfid', 'rfidCardStatus', 'rfidExpiryDate', 'cardId', 'cardStatus', 'cardExpiryDate']
        });
        if (user) cardType = 'rfid';
      }
    }

    if (!user) {
      const errorDetails = {
        message: `Student not found with card ID: ${studentCardId}`,
        cardId: studentCardId,
        scanType: isNfc ? 'NFC/RFID' : 'QR/Barcode',
        hint: isNfc 
          ? 'Ensure RFID is registered in users.rfid column'
          : 'Ensure card ID is registered in users.card_id column',
        timestamp: getCurrentSriLankaISO()
      };
      this.logger.error(`Card Not Found: ${JSON.stringify(errorDetails)}`);
      throw new Error(errorDetails.message);
    }

    // ✅ VALIDATE CARD STATUS & EXPIRY
    const validation = this.validateCardForAttendance(user, cardType, studentCardId);
    if (!validation.valid) {
      return {
        success: false,
        message: validation.error,
        cardInfo: {
          cardId: studentCardId,
          cardType,
          cardStatus: validation.cardStatus,
          cardExpiryDate: validation.cardExpiryDate,
          isExpired: validation.cardStatus === CardStatus.EXPIRED
        }
      };
    }

    const markAttendanceDto: MarkAttendanceDto = {
      studentId: user.id.toString(),
      studentName: `${user.firstName} ${user.lastName || ''}`.trim(),
      instituteId: markAttendanceByCardDto.instituteId,
      instituteName: markAttendanceByCardDto.instituteName,
      classId: markAttendanceByCardDto.classId || 'default',
      className: markAttendanceByCardDto.className || 'Default Class',
      subjectId: markAttendanceByCardDto.subjectId || 'default',
      subjectName: markAttendanceByCardDto.subjectName || 'General',
      date: getCurrentSriLankaDate(),
      location: markAttendanceByCardDto.address,
      status: markAttendanceByCardDto.status,
      markingMethod: markAttendanceByCardDto.markingMethod
    };

    const result = await this.markAttendance(markAttendanceDto, markedBy);

    // ✅ Enrich response with card info
    return {
      ...result,
      cardInfo: {
        cardId: studentCardId,
        cardType,
        cardStatus: validation.cardStatus || CardStatus.ACTIVE,
        cardExpiryDate: validation.cardExpiryDate,
        isExpired: false
      }
    };
  }

  async markBulkAttendanceByCard(bulkCardAttendanceDto: BulkCardAttendanceDto, markedBy: string): Promise<any> {
    const cardIds = bulkCardAttendanceDto.students.map(s => s.studentCardId);
    const isNfc = bulkCardAttendanceDto.markingMethod === MarkingMethod.RFID_NFC;

    // ✅ DUAL LOOKUP: NFC → rfid, QR/Barcode → cardId
    let users: UserEntity[];
    let cardType: 'rfid' | 'normal';

    if (isNfc) {
      users = await this.userRepository.find({
        where: cardIds.map(cardId => ({ rfid: cardId })),
        select: ['id', 'firstName', 'lastName', 'rfid', 'rfidCardStatus', 'rfidExpiryDate', 'imageUrl', 'cardId', 'cardStatus', 'cardExpiryDate']
      });
      cardType = 'rfid';
    } else {
      users = await this.userRepository.find({
        where: cardIds.map(cardId => ({ cardId: cardId })),
        select: ['id', 'firstName', 'lastName', 'rfid', 'rfidCardStatus', 'rfidExpiryDate', 'imageUrl', 'cardId', 'cardStatus', 'cardExpiryDate']
      });
      cardType = 'normal';

      // Fallback: if nothing found by cardId, try rfid (backward compat)
      if (users.length === 0) {
        users = await this.userRepository.find({
          where: cardIds.map(cardId => ({ rfid: cardId })),
          select: ['id', 'firstName', 'lastName', 'rfid', 'rfidCardStatus', 'rfidExpiryDate', 'imageUrl', 'cardId', 'cardStatus', 'cardExpiryDate']
        });
        if (users.length > 0) cardType = 'rfid';
      }
    }

    // Create map: scan value → user
    const userMap = isNfc || cardType === 'rfid'
      ? new Map(users.map(u => [u.rfid, u]))
      : new Map(users.map(u => [u.cardId, u]));

    // ✅ VALIDATE CARD STATUS for each student
    const invalidCards: any[] = [];
    for (const student of bulkCardAttendanceDto.students) {
      const user = userMap.get(student.studentCardId);
      if (user) {
        const validation = this.validateCardForAttendance(user, cardType, student.studentCardId);
        if (!validation.valid) {
          invalidCards.push({
            cardId: student.studentCardId,
            userName: `${user.firstName} ${user.lastName || ''}`.trim(),
            reason: validation.error,
            cardStatus: validation.cardStatus,
            cardExpiryDate: validation.cardExpiryDate
          });
        }
      }
    }

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

    // Map students, skip invalid cards & not-found
    const invalidCardIds = new Set(invalidCards.map(ic => ic.cardId));
    const notFound: string[] = [];
    const students = bulkCardAttendanceDto.students
      .filter(student => {
        if (invalidCardIds.has(student.studentCardId)) return false;
        const user = userMap.get(student.studentCardId);
        if (!user) {
          notFound.push(student.studentCardId);
          return false;
        }
        return true;
      })
      .map(student => {
        const user = userMap.get(student.studentCardId)!;
        return {
          studentId: user.id.toString(),
          studentName: `${user.firstName} ${user.lastName || ''}`.trim(),
          status: student.status,
          remarks: undefined
        };
      });

    let result: any = { results: [] };
    if (students.length > 0) {
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

      result = await this.markBulkAttendance(bulkAttendanceDto, markedBy);
    }
    
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
    
    // ✅ Include card validation info in response
    return {
      ...result,
      cardValidation: {
        totalScanned: bulkCardAttendanceDto.students.length,
        validCards: students.length,
        invalidCards: invalidCards.length > 0 ? invalidCards : undefined,
        notFoundCards: notFound.length > 0 ? notFound : undefined
      }
    };
  }

  async getAttendanceByCard(getAttendanceByCardDto: GetAttendanceByCardDto): Promise<any> {
    const { studentCardId, startDate, endDate, page = 1, limit = 10 } = getAttendanceByCardDto;

    if (studentCardId) {
      // ✅ DUAL LOOKUP: try cardId first, then rfid (backward compat)
      let user = await this.userRepository.findOne({
        where: { cardId: studentCardId },
        select: ['id', 'firstName', 'lastName', 'imageUrl', 'rfid', 'rfidCardStatus', 'rfidExpiryDate', 'cardId', 'cardStatus', 'cardExpiryDate']
      });
      let cardType: 'rfid' | 'normal' = 'normal';

      if (!user) {
        user = await this.userRepository.findOne({
          where: { rfid: studentCardId },
          select: ['id', 'firstName', 'lastName', 'imageUrl', 'rfid', 'rfidCardStatus', 'rfidExpiryDate', 'cardId', 'cardStatus', 'cardExpiryDate']
        });
        cardType = 'rfid';
      }

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

      const currentCardStatus = cardType === 'rfid' ? user.rfidCardStatus : user.cardStatus;
      const currentCardExpiry = cardType === 'rfid' ? user.rfidExpiryDate : user.cardExpiryDate;

      return {
        success: true,
        message: 'Card attendance retrieved successfully',
        studentInfo: {
          studentId: user.id.toString(),
          studentCardId: studentCardId,
          studentName: `${user.firstName} ${user.lastName || ''}`.trim()
        },
        cardInfo: {
          cardType,
          cardStatus: currentCardStatus || CardStatus.ACTIVE,
          cardExpiryDate: currentCardExpiry,
          rfid: user.rfid,
          cardId: user.cardId,
          isExpired: currentCardExpiry ? new Date(currentCardExpiry) < new Date() : false
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
          status: record.status,
          userType: (record as any).userType || AttendanceUserType.STUDENT
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

  /**
   * Get all attendance records for a specific calendar event
   * Use case: Who attended a Parents Meeting, Field Trip, Sports Day, etc.
   */
  async getAttendanceByEvent(
    instituteId: string,
    eventId: string,
    date?: string
  ): Promise<any> {
    const records = await this.dynamoAttendanceService.getAttendanceByEvent(instituteId, eventId, date);
    return {
      success: true,
      message: 'Event attendance retrieved successfully',
      eventId,
      date: date || null,
      totalRecords: records.length,
      data: records,
    };
  }

  /**
   * Get all attendance for a calendar day (all user types: students, teachers, parents)
   * Optionally filter by userType
   */
  async getAttendanceByCalendarDay(
    instituteId: string,
    calendarDayId: string,
    userType?: string
  ): Promise<any> {
    const records = await this.dynamoAttendanceService.getAttendanceByCalendarDay(instituteId, calendarDayId, userType);
    return {
      success: true,
      message: 'Calendar day attendance retrieved successfully',
      calendarDayId,
      userType: userType || 'ALL',
      totalRecords: records.length,
      data: records,
    };
  }

  /**
   * Get attendance filtered by user type (STUDENT, TEACHER, PARENT, etc.)
   * Use case: All teacher attendance for a date, all parent attendance at an event
   * Supports optional classId and subjectId for scoped queries
   */
  async getAttendanceByUserType(
    instituteId: string,
    userType: string,
    date?: string,
    eventId?: string,
    classId?: string,
    subjectId?: string
  ): Promise<any> {
    const records = await this.dynamoAttendanceService.getAttendanceByUserType(instituteId, userType, date, eventId, classId, subjectId);
    return {
      success: true,
      message: 'User type attendance retrieved successfully',
      userType,
      date: date || null,
      eventId: eventId || null,
      classId: classId || null,
      subjectId: subjectId || null,
      totalRecords: records.length,
      data: records,
    };
  }

  /**
   * Get a specific student's attendance at a specific event (or across all events of same ID)
   * Use case: Did this student attend the exam / parents meeting?
   */
  async getStudentAttendanceByEvent(
    studentId: string,
    instituteId: string,
    eventId: string,
    startDate?: string,
    endDate?: string
  ): Promise<any> {
    const records = await this.dynamoAttendanceService.getStudentAttendanceByEvent(
      studentId, instituteId, eventId, startDate, endDate
    );
    return {
      success: true,
      message: 'Student event attendance retrieved successfully',
      studentId,
      eventId,
      totalRecords: records.length,
      data: records,
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
        totalLate: summary.lateCount || 0,
        totalLeft: summary.leftCount || 0,
        totalLeftEarly: summary.leftEarlyCount || 0,
        totalLeftLately: summary.leftLatelyCount || 0,
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
        totalLate: summary.lateCount || 0,
        totalLeft: summary.leftCount || 0,
        totalLeftEarly: summary.leftEarlyCount || 0,
        totalLeftLately: summary.leftLatelyCount || 0,
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
    
    // Filter by status and studentId if provided
    let filteredRecords = summary.records;
    if (status) {
      filteredRecords = filteredRecords.filter(record => 
        record.status.toLowerCase() === status.toLowerCase()
      );
    }
    if (studentId) {
      filteredRecords = filteredRecords.filter(record => {
        return record.studentId === studentId || record.studentId == studentId;
      });
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
        totalLate: summary.lateCount || 0,
        totalLeft: summary.leftCount || 0,
        totalLeftEarly: summary.leftEarlyCount || 0,
        totalLeftLately: summary.leftLatelyCount || 0,
        attendanceRate: summary.attendanceRate
      }
    };
  }

  private scheduleAttendanceNotification(markAttendanceDto: MarkAttendanceDto, attendanceResult: any, studentData?: any): void {
    // Fire-and-forget notification - no blocking, no waiting
    this.sendAttendanceNotificationWithAdvertising(markAttendanceDto, attendanceResult, studentData).catch((err) => this.logger.warn(`Attendance notification failed: ${err.message}`));
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
            supportivePlatforms: [],  // Default ads support all platforms
            modeOfSending: []  // Default ads use all available channels
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
        parentUserId: data.parentUserId,
        attendanceStatus: (markAttendanceDto.status === AttendanceStatus.PRESENT ? 'PRESENT' : 'ABSENT') as 'PRESENT' | 'ABSENT',
        date: markAttendanceDto.date,
        time: getCurrentSriLankaISO(),
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
      this.logger.warn(`Attendance notification failed (non-blocking): ${error.message}`);
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
    parentUserId: string | null;
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
        parentUserId,
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
            modeOfSending: [],  // Default ads use all available channels
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
        parentUserId,
        attendanceStatus: (attendanceDto.status === AttendanceStatus.PRESENT ? 'PRESENT' : 'ABSENT') as 'PRESENT' | 'ABSENT',
        date: attendanceDto.date,
        time: formatSriLankaTime(now()),
        vehicleNumber: null,
        bookhireName: null,
        subscriptionPlan,
        advertisementData
      };

      // 🚀 Send notification immediately (fire-and-forget)
      await this.attendanceNotificationService.sendAttendanceNotification(notificationData);
      
      // CASCADE TO PARENTS FEATURE
      // If ad has cascadeToParents=true, send SAME ad to ALL parents (not just primary)
      if (advertisementData?.cascadeToParents && studentData) {
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

      // Send notification to EACH parent with the SAME ad
      const cascadePromises = allParents.map(async (parent) => {
        try {
          const parentUser = parent.user;
          
          // Check if parent has contact info
          if (!parentUser.phoneNumber && !parentUser.email && !parentUser.telegramId) {
            return;
          }

          // Check if parent's subscription should receive ads
          const parentSubscriptionPlan = parentUser.subscriptionPlan || 'FREE';
          const parentPackageConfig = NOTIFICATION_PACKAGES_CONFIG.packages[parentSubscriptionPlan.toUpperCase()];
          const shouldReceiveAds = parentPackageConfig?.isAds === true;

          if (!shouldReceiveAds) {
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
            time: formatSriLankaTime(now()),
            vehicleNumber: null,
            bookhireName: null,
            subscriptionPlan: parentSubscriptionPlan,
            advertisementData: advertisementData  // 🎯 SAME ad for ALL parents
          };

          // Send notification (fire-and-forget)
          await this.attendanceNotificationService.sendAttendanceNotification(notificationData);
          
        } catch (error) {
          this.logger.error(`❌ Failed to cascade ad to ${parent.type}: ${error.message}`);
          // Continue with other parents
        }
      });

      // Wait for all cascade notifications (but don't block main response)
      await Promise.allSettled(cascadePromises);

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

      // Use sophisticated multi-factor matching service
      const matches = await this.advertisementMatchingService.findMostMatchingAdvertisements(
        userProfile,
        1  // Get only the BEST match
      );

      if (matches.length > 0) {
        const bestMatch = matches[0];
        const advertisement = bestMatch.advertisement;

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
          modeOfSending: advertisement.modeOfSending || [],
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
        modeOfSending: [],  // Default ads use all available channels
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
        modeOfSending: [],  // Default ads use all available channels
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
    parentUserId: string | null;
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
              id: true,
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
              id: true,
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
              id: true,
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
          parentUserId: null,
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
        parentUserId: primaryParent?.id || null,
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
        parentUserId: null,
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
        timestamp: getCurrentSriLankaISO()
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
   * - ✅ ENHANCED: Works for ALL user types (STUDENT, TEACHER, INSTITUTE_ADMIN, etc.)
   * - Only fetches parent data & sends notifications for STUDENT type
   */
  async markAttendanceByInstituteCard(
    markAttendanceDto: MarkAttendanceByInstituteCardDto, 
    markedBy: string
  ): Promise<any> {
    const { instituteCardId, instituteId } = markAttendanceDto;

    // ✅ STEP 1: Query institute_user with user data (works for ALL user types)
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
        'institute_user.instituteUserType',
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

    // ✅ STEP 2: Determine institute user type
    const typeMap: Record<string, AttendanceUserType> = {
      [InstituteUserType.STUDENT]: AttendanceUserType.STUDENT,
      [InstituteUserType.TEACHER]: AttendanceUserType.TEACHER,
      [InstituteUserType.INSTITUTE_ADMIN]: AttendanceUserType.INSTITUTE_ADMIN,
      [InstituteUserType.ATTENDANCE_MARKER]: AttendanceUserType.ATTENDANCE_MARKER,
      [InstituteUserType.PARENT]: AttendanceUserType.PARENT,
    };
    const detectedUserType = typeMap[instituteUser.instituteUserType] || AttendanceUserType.STUDENT;
    const isStudent = detectedUserType === AttendanceUserType.STUDENT;

    // ✅ STEP 3: Fetch data based on user type
    let userName: string;
    let globalImageUrl: string | null = null;
    let subscriptionPlan = 'FREE';
    let parentContact: string | null = null;
    let parentEmail: string | null = null;
    let parentTelegramId: string | null = null;
    let parentUserId: string | null = null;
    let studentData: any = null;

    if (isStudent) {
      // STUDENT path: Mega-query for parent contact data (for notifications)
      studentData = await this.studentRepository
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
          'student.userId', 'student.fatherId', 'student.motherId', 'student.guardianId',
          'student.studentId', 'student.isActive',
          'user.id', 'user.firstName', 'user.lastName', 'user.email', 'user.phoneNumber',
          'user.subscriptionPlan', 'user.telegramId', 'user.imageUrl',
          'father.userId', 'fatherUser.firstName', 'fatherUser.lastName',
          'fatherUser.email', 'fatherUser.phoneNumber', 'fatherUser.telegramId',
          'mother.userId', 'motherUser.firstName', 'motherUser.lastName',
          'motherUser.email', 'motherUser.phoneNumber', 'motherUser.telegramId',
          'guardian.userId', 'guardianUser.firstName', 'guardianUser.lastName',
          'guardianUser.email', 'guardianUser.phoneNumber', 'guardianUser.telegramId'
        ])
        .getOne();

      if (!studentData?.user) {
        throw new Error(`Student not found with ID: ${instituteUser.userId}`);
      }

      userName = `${studentData.user.firstName} ${studentData.user.lastName}`.trim();
      globalImageUrl = studentData.user.imageUrl || null;
      subscriptionPlan = studentData.user.subscriptionPlan || 'FREE';

      // Extract parent info (Priority: Father → Mother → Guardian)
      if (studentData.father?.user) {
        parentContact = studentData.father.user.phoneNumber || null;
        parentEmail = studentData.father.user.email || null;
        parentTelegramId = studentData.father.user.telegramId || null;
        parentUserId = studentData.father.userId || null;
      } else if (studentData.mother?.user) {
        parentContact = studentData.mother.user.phoneNumber || null;
        parentEmail = studentData.mother.user.email || null;
        parentTelegramId = studentData.mother.user.telegramId || null;
        parentUserId = studentData.mother.userId || null;
      } else if (studentData.guardian?.user) {
        parentContact = studentData.guardian.user.phoneNumber || null;
        parentEmail = studentData.guardian.user.email || null;
        parentTelegramId = studentData.guardian.user.telegramId || null;
        parentUserId = studentData.guardian.userId || null;
      }
    } else {
      // NON-STUDENT path: Use user data already loaded from institute_user query
      if (!instituteUser.user) {
        throw new Error(`User not found with ID: ${instituteUser.userId}`);
      }
      userName = `${instituteUser.user.firstName} ${instituteUser.user.lastName || ''}`.trim();
      globalImageUrl = instituteUser.user.imageUrl || null;
    }

    const studentId = instituteUser.userId;

    // ✅ STEP 4: Image URL logic (works for all user types)
    const isVerified = instituteUser.imageVerificationStatus === ImageVerificationStatus.VERIFIED;
    const finalImageUrl = isVerified && instituteUser.instituteUserImageUrl 
      ? instituteUser.instituteUserImageUrl 
      : globalImageUrl;

    // ✅ STEP 5: Build attendance DTO with auto-detected userType
    const attendanceDto: MarkAttendanceDto = {
      studentId: studentId,
      studentName: userName,
      instituteId: markAttendanceDto.instituteId,
      instituteName: markAttendanceDto.instituteName,
      classId: markAttendanceDto.classId || 'default',
      className: markAttendanceDto.className || '',
      subjectId: markAttendanceDto.subjectId || '',
      subjectName: markAttendanceDto.subjectName || '',
      status: markAttendanceDto.status,
      markingMethod: markAttendanceDto.markingMethod,
      userType: detectedUserType,  // ✅ Auto-detected user type
      date: markAttendanceDto.date || getCurrentSriLankaDate(),
      location: markAttendanceDto.location || this.generateAddress(
        markAttendanceDto.instituteName,
        markAttendanceDto.className,
        markAttendanceDto.subjectName
      )
    };

    // ✅ STEP 6: Mark attendance in DynamoDB
    const result = await this.dynamoAttendanceService.markAttendance(attendanceDto);

    // ✅ STEP 7: Send notifications ONLY for students (non-blocking)
    if (isStudent && (parentContact || parentEmail || parentTelegramId)) {
      const isAdsFromDB = this.configService.get<string>('IS_ADS_FROM_DB') === 'true';
      
      this.sendImmediateNotification({
        studentId,
        studentName: userName,
        parentContact,
        parentEmail,
        parentTelegramId,
        parentUserId,
        subscriptionPlan,
        attendanceDto,
        isAdsFromDB,
        studentData,
        instituteId: markAttendanceDto.instituteId
      }).catch(error => {
        this.logger.error(`Notification failed for user ${studentId}: ${error.message}`);
      });
    }

    // ✅ STEP 8: Return response with user type info
    return {
      success: true,
      message: 'Attendance marked successfully using institute card',
      imageUrl: finalImageUrl,
      isInstituteImage: isVerified && !!instituteUser.instituteUserImageUrl,
      imageVerificationStatus: instituteUser.imageVerificationStatus,
      status: markAttendanceDto.status,
      name: userName,
      userType: detectedUserType,  // ✅ NEW: Return user type
      instituteCardId: instituteCardId,
      userIdByInstitute: instituteUser.userIdByInstitute,
      data: {
        studentId: studentId,
        studentName: userName,
        instituteId: markAttendanceDto.instituteId,
        instituteName: markAttendanceDto.instituteName,
        className: markAttendanceDto.className,
        subjectName: markAttendanceDto.subjectName,
        status: markAttendanceDto.status,
        date: attendanceDto.date,
        location: attendanceDto.location,
        markingMethod: markAttendanceDto.markingMethod,
        userType: detectedUserType,  // ✅ NEW: Include in data too
        markedAt: getCurrentSriLankaISO()
      }
    };
  }

  /**
   * Validates that a user is enrolled in the given institute (works for ALL user types)
   * @throws BadRequestException if validation is enabled and user is not enrolled or inactive
   */
  private async validateUserEnrollment(
    userId: string,
    instituteId: string,
    detectedUserType: AttendanceUserType
  ): Promise<void> {
    // Check if enrollment validation is enabled via environment variable
    const envValue = this.configService.get<string>('ATTENDANCE_MARKS_FOR_ONLY_ENROLLED_INSTITUTE_STUDENTS');
    const shouldValidate = envValue === 'true';
    
    if (!shouldValidate) {
      return;
    }

    // If user type is NOT_ENROLLED, we already know they aren't enrolled
    if (detectedUserType === AttendanceUserType.NOT_ENROLLED) {
      this.logger.warn(`User ${userId} is not enrolled in institute ${instituteId}`);
      throw new BadRequestException(
        `User is currently not enrolled in this institute. Please contact the institute administrator.`
      );
    }

    try {
      // Check if user is enrolled in the institute
      const enrollment = await this.instituteUserRepository.findOne({
        where: {
          userId: userId,
          instituteId: instituteId
        },
        select: ['userId', 'status'],
      });

      if (!enrollment) {
        this.logger.warn(`User ${userId} is not enrolled in institute ${instituteId}`);
        throw new BadRequestException(
          `User is currently not enrolled in this institute. Please contact the institute administrator.`
        );
      }

      // Check if enrollment is active
      if (enrollment.status !== InstituteUserStatus.ACTIVE) {
        this.logger.warn(`User ${userId} enrollment status is ${enrollment.status} (not ACTIVE)`);
        throw new BadRequestException(
          `User enrollment is not active (status: ${enrollment.status}). Please contact the institute administrator.`
        );
      }
    } catch (error) {
      // If it's already a BadRequestException, rethrow it
      if (error instanceof BadRequestException) {
        throw error;
      }
      // For any other database/system errors, log but don't expose internal details
      this.logger.error(`Error validating enrollment for user ${userId}: ${error.message}`);
      throw new BadRequestException(
        `Unable to verify user enrollment. Please try again.`
      );
    }
  }

  /**
   * @deprecated Use validateUserEnrollment instead. Kept for backward compatibility.
   */
  private async validateStudentEnrollment(
    studentId: string,
    instituteId: string
  ): Promise<void> {
    return this.validateUserEnrollment(studentId, instituteId, AttendanceUserType.STUDENT);
  }
}
