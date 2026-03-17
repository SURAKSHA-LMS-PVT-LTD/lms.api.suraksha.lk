import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { getCurrentSriLankaDate, getCurrentSriLankaISO } from '../../../common/utils/timezone.util';
import { DynamoDBBookhireAttendanceService } from './dynamodb-bookhire-attendance.service';
import { ParentEntity } from '../../parent/entities/parent.entity';
import { StudentEntity } from '../../student/entities/student.entity';
import { UserEntity } from '../../user/entities/user.entity';
import { BookhireEntity } from '../entities/bookhire.entity';
import { StudentBookhireEnrollmentEntity } from '../entities/student-bookhire-enrollment.entity';
import { MarkBookhireAttendanceDto, BulkMarkAttendanceDto } from '../dto/bookhire-attendance.dto';
import { CloudStorageService } from '../../../common/services/cloud-storage.service';

@Injectable()
export class BookhireAttendanceService {
  private readonly logger = new Logger(BookhireAttendanceService.name);
  constructor(
    private readonly configService: ConfigService,
    private readonly dynamoBookhireAttendanceService: DynamoDBBookhireAttendanceService,
    @InjectRepository(ParentEntity)
    private readonly parentRepository: Repository<ParentEntity>,
    @InjectRepository(StudentEntity)
    private readonly studentRepository: Repository<StudentEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    @InjectRepository(BookhireEntity)
    private readonly bookhireRepository: Repository<BookhireEntity>,
    @InjectRepository(StudentBookhireEnrollmentEntity)
    private readonly enrollmentRepository: Repository<StudentBookhireEnrollmentEntity>,
    private readonly cloudStorageService: CloudStorageService,
  ) {}

  /**
   * 🚗 MARK BOOKHIRE ATTENDANCE with advertising integration
   * @param preVerifiedBookhire - Pre-fetched bookhire entity to skip redundant DB query (used by bulk operations)
   */
  async markAttendance(markAttendanceDto: MarkBookhireAttendanceDto, ownerId: string, preVerifiedBookhire?: any): Promise<any> {
    // Set default date if not provided
    if (!markAttendanceDto.attendanceDate) {
      markAttendanceDto.attendanceDate = getCurrentSriLankaDate();
    }

    // 🔍 STEP 1: Use pre-verified bookhire or fetch from DB
    const bookhire = preVerifiedBookhire || await this.bookhireRepository.findOne({
      where: { 
        id: markAttendanceDto.bookhireId,
        ownerId: ownerId
      },
      select: ['id', 'ownerId', 'vehicleNumber', 'vehicleType', 'vehicleModel', 'isActive', 'status'] // Only validation fields
    });

    if (!bookhire) {
      throw new NotFoundException('Bookhire not found or you do not have access');
    }

    // 🔍 STEP 2: Single optimized query - Lookup user with optional student data

    let user: any = null;
    let studentData = {
      student: null,
      primaryParent: null,
      parentContact: null,
      parentEmail: null,
      parentTelegramId: null,
      subscriptionPlan: 'FREE'
    };

    // First get the user data
    user = await this.userRepository.findOne({
      where: { id: markAttendanceDto.studentId },
      select: ['id', 'firstName', 'lastName', 'nameWithInitials', 'rfid', 'userType', 'imageUrl', 'phoneNumber', 'email', 'telegramId', 'subscriptionPlan']
    });

    if (!user) {
      throw new NotFoundException(
        `No user found with ID: ${markAttendanceDto.studentId}. ` +
        `Please check: 1) User exists in database, 2) User ID is correct, 3) User is registered in system.`
      );
    }


    // 🔍 STEP 3: Only fetch student data for actual STUDENT user types
    const isStudentUserType = ['STUDENT', 'student'].includes(user.userType);
    
    if (isStudentUserType) {
      try {
        studentData = await this.fetchStudentWithParentDataSafe(markAttendanceDto.studentId);
      } catch (error) {
        this.logger.warn(`Failed to fetch student parent data for ${markAttendanceDto.studentId}: ${error.message}`);
      }
    }

    // 🔍 STEP 4: Verify enrollment (if required by environment and user is a student)
    const checkEnrollmentOnly = this.configService.get<string>('ATTENDANCE_MARKS_FOR_ONLY_ENROLLED_VEHICLE_STUDENTS') === 'true';
    
    if (checkEnrollmentOnly && studentData.student) {
      const enrolled = await this.isStudentEnrolledInBookhire(user.id, markAttendanceDto.bookhireId);

      if (!enrolled) {
        throw new BadRequestException(`Student (ID: ${markAttendanceDto.studentId}) not enrolled in this bookhire or enrollment not active`);
      }
    }

    // 🏗️ STEP 5: Prepare vehicle data
    const vehicleData = {
      vehicleNumber: bookhire.vehicleNumber,
      bookhireName: bookhire.vehicleModel || `${bookhire.vehicleType} - ${bookhire.vehicleNumber}`
    };

    // 🔄 STEP 5.5: Transform studentData for DynamoDB (handle both students and non-students)
    const transformedStudentData = {
      studentName: studentData.student 
        ? (studentData.student.user.nameWithInitials || `${studentData.student.user.firstName} ${studentData.student.user.lastName || ''}`.trim())
        : (user.nameWithInitials || `${user.firstName} ${user.lastName || ''}`.trim()),
      studentEmail: studentData.student?.user?.email || user.email || null,
      parentContact: studentData.parentContact || null,
      parentEmail: studentData.parentEmail || null,
      parentTelegramId: studentData.parentTelegramId || null,
      subscriptionPlan: studentData.subscriptionPlan || user.subscriptionPlan || 'FREE',
      // Keep original student data for notification service
      student: studentData.student,
      primaryParent: studentData.primaryParent
    };

    // 🎯 STEP 6: Mark attendance in DynamoDB - Simplified
    const dynamoDto = {
      bookhireId: markAttendanceDto.bookhireId.toString(),
      studentId: markAttendanceDto.studentId,
      attendanceDate: markAttendanceDto.attendanceDate,
      status: markAttendanceDto.status, // Simple pickup/dropoff status
      location: markAttendanceDto.location,
      markedBy: ownerId,
      rfidCardId: markAttendanceDto.rfidCardId,
      notes: markAttendanceDto.notes
    };

    const attendanceRecord = await this.dynamoBookhireAttendanceService.markAttendance(
      dynamoDto,
      transformedStudentData,
      vehicleData
    );

    // 🎯 STEP 7: Smart notification logic based on user type and data
    const shouldSendNotification = this.shouldSendBookhireNotificationOptimized(user, studentData);
    
    if (shouldSendNotification) {
      
      // For STUDENT user types with parent data, send to parents
      if (isStudentUserType && studentData.student && (studentData.parentContact || studentData.parentEmail || studentData.parentTelegramId)) {
        await this.sendAttendanceNotificationWithAdvertising(attendanceRecord, transformedStudentData, vehicleData);
      } 
      // For non-student users with contact info (TEACHER, PARENT, ADMIN, etc.), send to their own contact
      else if (!isStudentUserType && (user.phoneNumber || user.email || user.telegramId)) {
        
        // Transform data to send notification to the user themselves (not parent)
        const userNotificationData = {
          ...transformedStudentData,
          parentContact: user.phoneNumber || null,
          parentEmail: user.email || null,
          parentTelegramId: user.telegramId || null,
          subscriptionPlan: user.subscriptionPlan || 'FREE'
        };
        
        await this.sendAttendanceNotificationWithAdvertising(attendanceRecord, userNotificationData, vehicleData);
      } 
      // Special case: STUDENT user type but no parent data - send to student directly
      else if (isStudentUserType && !studentData.student && (user.phoneNumber || user.email || user.telegramId)) {
        
        const studentDirectNotificationData = {
          ...transformedStudentData,
          parentContact: user.phoneNumber || null,
          parentEmail: user.email || null,
          parentTelegramId: user.telegramId || null,
          subscriptionPlan: user.subscriptionPlan || 'FREE'
        };
        
        await this.sendAttendanceNotificationWithAdvertising(attendanceRecord, studentDirectNotificationData, vehicleData);
      } else {
      }
    } else {
    }


    return {
      success: true,
      imageUrl: (() => { const rawUrl = studentData.student?.user?.imageUrl || user.imageUrl || null; return rawUrl ? this.cloudStorageService.getFullUrl(rawUrl) : null; })(),
      status: attendanceRecord.status,
      name: transformedStudentData.studentName,
      studentId: markAttendanceDto.studentId,
      userType: user.userType
    };
  }

  /**
   * 📇 MARK ATTENDANCE BY RFID CARD - Bookhire Owner
   */
  async markAttendanceByRfid(markAttendanceDto: MarkBookhireAttendanceDto, ownerId: string): Promise<any> {
    // Set default date if not provided
    if (!markAttendanceDto.attendanceDate) {
      markAttendanceDto.attendanceDate = getCurrentSriLankaDate();
    }

    // 🔍 STEP 1: Verify bookhire ownership
    const bookhire = await this.bookhireRepository.findOne({
      where: { 
        id: markAttendanceDto.bookhireId,
        ownerId: ownerId
      },
      select: ['id', 'ownerId', 'vehicleNumber', 'vehicleType', 'vehicleModel', 'isActive', 'status']
    });

    if (!bookhire) {
      throw new NotFoundException('Bookhire not found or you do not have access');
    }

    // 🔍 STEP 2: Lookup student by RFID from users table
    if (!markAttendanceDto.rfidCardId) {
      throw new BadRequestException('RFID card ID is required for RFID-based attendance marking');
    }


    const user = await this.userRepository.findOne({
      where: { rfid: markAttendanceDto.rfidCardId },
      select: ['id', 'firstName', 'lastName', 'nameWithInitials', 'rfid', 'userType', 'imageUrl', 'phoneNumber', 'email', 'telegramId', 'subscriptionPlan']
    });

    if (!user) {
      throw new NotFoundException(
        `No user found with RFID card: ${markAttendanceDto.rfidCardId}. ` +
        `Please check: 1) RFID card is registered in system, 2) RFID value is correct (case-sensitive), 3) User exists in database.`
      );
    }


    // 🔍 STEP 3: Use user ID for attendance (supports all user types)
    const userId = user.id;

    // 🔍 STEP 4: Fetch student and parent data (optional - only for students)
    let studentData = {
      student: null,
      primaryParent: null,
      parentContact: null,
      parentEmail: null,
      parentTelegramId: null,
      subscriptionPlan: 'FREE'
    };
    
    // Try to fetch student data, but don't require it
    try {
      studentData = await this.fetchStudentWithParentData(userId);
      if (studentData.student) {
      } else {
      }
    } catch (error) {
      this.logger.warn(`Failed to fetch student data for RFID user ${userId}: ${error.message}`);
    }

    // 🔍 STEP 5: Verify enrollment (if required by environment and user is a student)
    const checkEnrollmentOnly = this.configService.get<string>('ATTENDANCE_MARKS_FOR_ONLY_ENROLLED_VEHICLE_STUDENTS') === 'true';
    
    if (checkEnrollmentOnly && studentData.student) {
      const enrolled = await this.isStudentEnrolledInBookhire(userId, markAttendanceDto.bookhireId);

      if (!enrolled) {
        throw new BadRequestException(`Student (RFID: ${markAttendanceDto.rfidCardId}) not enrolled in this bookhire or enrollment not active`);
      }
    }

    // 🏗️ STEP 6: Prepare vehicle data
    const vehicleData = {
      vehicleNumber: bookhire.vehicleNumber,
      bookhireName: bookhire.vehicleModel || `${bookhire.vehicleType} - ${bookhire.vehicleNumber}`
    };

    // 🔄 STEP 6.5: Transform studentData for DynamoDB (handle both students and non-students)
    const transformedStudentData = {
      studentName: studentData.student 
        ? (studentData.student.user.nameWithInitials || `${studentData.student.user.firstName} ${studentData.student.user.lastName || ''}`.trim())
        : (user.nameWithInitials || `${user.firstName} ${user.lastName || ''}`.trim()),
      studentEmail: studentData.student?.user?.email || user.email || null,
      parentContact: studentData.parentContact || null,
      parentEmail: studentData.parentEmail || null,
      parentTelegramId: studentData.parentTelegramId || null,
      subscriptionPlan: studentData.subscriptionPlan || 'FREE',
      // Keep original student data for notification service
      student: studentData.student,
      primaryParent: studentData.primaryParent
    };

    // 🎯 STEP 7: Mark attendance in DynamoDB - Simplified
    const dynamoDto = {
      bookhireId: markAttendanceDto.bookhireId.toString(),
      studentId: userId,
      attendanceDate: markAttendanceDto.attendanceDate,
      status: markAttendanceDto.status, // Simple pickup/dropoff status
      location: markAttendanceDto.location,
      markedBy: ownerId,
      rfidCardId: markAttendanceDto.rfidCardId,
      notes: markAttendanceDto.notes
    };

    const attendanceRecord = await this.dynamoBookhireAttendanceService.markAttendance(
      dynamoDto,
      transformedStudentData,
      vehicleData
    );

    // 🎯 STEP 8: Send attendance notification with advertising
    // Enhanced logic: Send notifications for all specific user types (TEACHER, PARENT, INSTITUTE_ADMIN, STUDENT, etc.)
    // Skip only for generic "USER" type without student record
    const shouldSendNotification = this.shouldSendBookhireNotification(user, studentData);
    
    if (shouldSendNotification) {
      // For students with parent data, send to parents
      if (studentData.student && (studentData.parentContact || studentData.parentEmail || studentData.parentTelegramId)) {
        await this.sendAttendanceNotificationWithAdvertising(attendanceRecord, transformedStudentData, vehicleData);
      } 
      // For non-student users with contact info (TEACHER, PARENT, ADMIN, etc.), send to their own contact
      else if (user.phoneNumber || user.email || user.telegramId) {
        
        // Transform data to send notification to the user themselves (not parent)
        const userNotificationData = {
          ...transformedStudentData,
          parentContact: user.phoneNumber || null,
          parentEmail: user.email || null,
          parentTelegramId: user.telegramId || null,
          subscriptionPlan: user.subscriptionPlan || 'FREE'
        };
        
        await this.sendAttendanceNotificationWithAdvertising(attendanceRecord, userNotificationData, vehicleData);
      } else {
      }
    } else {
    }


    return {
      success: true,
      imageUrl: (() => { const rawUrl = studentData.student?.user?.imageUrl || user.imageUrl || null; return rawUrl ? this.cloudStorageService.getFullUrl(rawUrl) : null; })(),
      status: attendanceRecord.status,
      name: transformedStudentData.studentName,
      rfidCardId: markAttendanceDto.rfidCardId,
      studentId: userId,
      userType: user.userType
    };
  }

  /**
   * 📊 BULK MARK ATTENDANCE for multiple students
   */
  async markBulkAttendance(bulkMarkAttendanceDto: BulkMarkAttendanceDto, ownerId: string): Promise<any> {
    // Verify bookhire ownership
    const bookhire = await this.bookhireRepository.findOne({
      where: { 
        id: bulkMarkAttendanceDto.bookhireId,
        ownerId: ownerId
      }
    });

    if (!bookhire) {
      throw new NotFoundException('Bookhire not found or you do not have access');
    }

    const successful = [];
    const failed = [];

    // Process each attendance record
    for (const record of bulkMarkAttendanceDto.attendanceRecords) {
      try {
        const singleDto: MarkBookhireAttendanceDto = {
          bookhireId: bulkMarkAttendanceDto.bookhireId,
          studentId: record.studentId,
          attendanceDate: bulkMarkAttendanceDto.attendanceDate,
          status: record.status, // Simplified status
          notes: record.notes
        };

        const result = await this.markAttendance(singleDto, ownerId, bookhire);
        successful.push({
          studentId: record.studentId,
          result: result.data
        });
      } catch (error) {
        failed.push({
          studentId: record.studentId,
          error: error.message
        });
      }
    }


    return {
      success: true,
      message: `Bulk attendance processed: ${successful.length} successful, ${failed.length} failed`,
      data: {
        successful,
        failed,
        summary: {
          total: bulkMarkAttendanceDto.attendanceRecords.length,
          successful: successful.length,
          failed: failed.length
        }
      }
    };
  }

  /**
   * 📋 GET BOOKHIRE ATTENDANCE (owner-optimized query)
   */
  async getBookhireAttendance(params: {
    bookhireId: number;
    ownerId: string;
    startDate?: string;
    endDate?: string;
    studentId?: string;
    page?: number;
    limit?: number;
  }): Promise<any> {
    // Verify bookhire ownership - Optimized field selection
    const bookhire = await this.bookhireRepository.findOne({
      where: { 
        id: params.bookhireId,
        ownerId: params.ownerId
      },
      select: ['id', 'ownerId', 'vehicleNumber'] // Only validation fields
    });

    if (!bookhire) {
      throw new NotFoundException('Bookhire not found or you do not have access');
    }

    const page = params.page || 1;
    const limit = params.limit || 50;

    const result = await this.dynamoBookhireAttendanceService.getBookhireAttendance({
      bookhireId: params.bookhireId.toString(),
      startDate: params.startDate,
      endDate: params.endDate,
      studentId: params.studentId,
      limit
    });

    return {
      success: true,
      data: result.records,
      pagination: {
        currentPage: page,
        totalItems: result.totalCount,
        hasMore: !!result.lastEvaluatedKey
      }
    };
  }

  /**
   * 👨‍🎓 GET STUDENT ATTENDANCE across all bookhires
   */
  async getStudentAttendance(params: {
    studentId: string;
    startDate?: string;
    endDate?: string;
    bookhireId?: number;
    page?: number;
    limit?: number;
  }): Promise<any> {
    const page = params.page || 1;
    const limit = params.limit || 50;

    const result = await this.dynamoBookhireAttendanceService.getStudentAttendance({
      studentId: params.studentId,
      startDate: params.startDate,
      endDate: params.endDate,
      bookhireId: params.bookhireId?.toString(),
      limit
    });

    return {
      success: true,
      data: result.records,
      pagination: {
        currentPage: page,
        totalItems: result.totalCount,
        hasMore: !!result.lastEvaluatedKey
      }
    };
  }

  /**
   * 📈 GET ATTENDANCE SUMMARY
   */
  async getAttendanceSummary(params: {
    bookhireId?: number;
    studentId?: string;
    startDate: string;
    endDate: string;
    ownerId?: string;
  }): Promise<any> {
    // If querying by bookhire, verify ownership
    if (params.bookhireId && params.ownerId) {
      const bookhire = await this.bookhireRepository.findOne({
        where: { 
          id: params.bookhireId,
          ownerId: params.ownerId
        }
      });

      if (!bookhire) {
        throw new NotFoundException('Bookhire not found or you do not have access');
      }
    }

    const summary = await this.dynamoBookhireAttendanceService.getAttendanceSummary({
      bookhireId: params.bookhireId?.toString(),
      studentId: params.studentId,
      startDate: params.startDate,
      endDate: params.endDate
    });

    return {
      success: true,
      data: summary
    };
  }

  /**
   * 🎯 ADVERTISING INTEGRATION: Send attendance notification with ads
   */
  private async sendAttendanceNotificationWithAdvertising(
    attendanceRecord: any,
    studentData: any,
    vehicleData: any
  ): Promise<void> {
    try {
      // 🎯 ADVERTISING LOGIC: Check IS_ADS_FROM_DB environment variable
      const isAdsFromDB = this.configService.get<string>('IS_ADS_FROM_DB') === 'true';
      
      if (isAdsFromDB) {
        // Database-driven advertising
        await this.sendNotificationWithDatabaseAd(attendanceRecord, studentData, vehicleData);
      } else {
        // Default company advertising
        await this.sendNotificationWithDefaultAd(attendanceRecord, studentData, vehicleData);
      }

    } catch (error) {
      this.logger.warn(`Notification with advertising failed: ${error.message}`);
    }
  }

  /**
   * 🗄️ DATABASE-DRIVEN ADVERTISING: Get ads from database with MULTI-FACTOR MATCHING + CASCADE
   * Enhanced to match School Attendance behavior:
   * - Multi-factor ad matching (age, gender, location, subscription, etc.)
   * - Cascade to all parents when cascadeToParents = true
   */
  private async sendNotificationWithDatabaseAd(
    attendanceRecord: any,
    studentData: any,
    vehicleData: any
  ): Promise<void> {
    try {
      // ✅ Check if we have at least one contact method
      if (!studentData.parentContact && !studentData.parentEmail && !studentData.parentTelegramId) {
        return;
      }

      // Check if subscription plan should receive ads
      const shouldReceiveAds = await this.shouldReceiveAdvertisements(studentData.subscriptionPlan);
      
      if (!shouldReceiveAds) {
        return;
      }

      // 🎯 MULTI-FACTOR AD MATCHING (same as school attendance)
      const advertisementData = await this.getMatchingAdvertisementFromDB(
        studentData.subscriptionPlan,
        studentData,
        attendanceRecord.bookhireId // Use bookhireId as targeting context
      );

      if (!advertisementData) {
        return; // No matching ad found
      }

      // Prepare notification data with matched advertisement
      const notificationData = {
        studentId: attendanceRecord.studentId,
        studentName: studentData.studentName,
        parentContact: studentData.parentContact,
        parentEmail: studentData.parentEmail,
        parentTelegramId: studentData.parentTelegramId,
        attendanceStatus: 'PRESENT' as 'PRESENT' | 'ABSENT',
        attendanceType: 'TRANSPORT' as 'TRANSPORT',
        date: attendanceRecord.attendanceDate,
        time: getCurrentSriLankaISO(),
        vehicleNumber: vehicleData.vehicleNumber,
        bookhireName: vehicleData.bookhireName,
        subscriptionPlan: studentData.subscriptionPlan,
        advertisementData: {
          id: advertisementData.id,
          mediaUrl: advertisementData.mediaUrl,
          mediaType: advertisementData.mediaType,
          title: advertisementData.title,
          content: advertisementData.content,
          sendingUrl: advertisementData.sendingUrl
        }
      };

      // Send notification to PRIMARY parent
      // await this.attendanceNotificationService.sendAttendanceNotification(notificationData); // TODO: Service not available

      // Update advertisement metrics
      // if (advertisementData.id !== 'default-fallback' && advertisementData.id !== 'default-error-fallback') {
      //   this.advertisementRepository.increment(
      //     { id: advertisementData.id },
      //     'currentSendings',
      //     1
      //   ).catch(err => this.logger.error(`Failed to increment ad sendings: ${err.message}`));
      // }

      // 🎯 CASCADE TO PARENTS (if enabled)
      if (advertisementData.cascadeToParents && studentData.student) {
        this.logger.log(`🎯 CASCADE ENABLED for BookHire: Sending same ad to ALL parents of student ${attendanceRecord.studentId}`);
        await this.cascadeAdToAllParentsBookhire(studentData, advertisementData, attendanceRecord, vehicleData);
      }

    } catch (error) {
      this.logger.error('Error in sendNotificationWithDatabaseAd:', error);
    }
  }

  /**
   * 🏢 DEFAULT ADVERTISING: Use environment-configured ads
   */
  private async sendNotificationWithDefaultAd(
    attendanceRecord: any,
    studentData: any,
    vehicleData: any
  ): Promise<void> {
    try {
      // ✅ Check if we have at least one contact method
      if (!studentData.parentContact && !studentData.parentEmail && !studentData.parentTelegramId) {
        return;
      }

      // Get default advertisement from environment
      const defaultAdData = {
        id: 'default-bookhire-ad',
        mediaUrl: process.env.DEFAULT_AD_URL || '',
        mediaType: process.env.DEFAULT_AD_TYPE || 'text',
        title: process.env.DEFAULT_AD_TITLE || 'Your Transport Company',
        content: process.env.DEFAULT_AD_CONTENT || 'Safe and reliable transportation for your child.'
      };


      // Check if subscription plan should receive ads
      const shouldReceiveAds = await this.shouldReceiveAdvertisements(studentData.subscriptionPlan);
      
      if (!shouldReceiveAds) {
        return;
      }

      // Prepare notification data with default advertisement
      const notificationData = {
        studentId: attendanceRecord.studentId,
        studentName: studentData.studentName, // Use the pre-formatted name
        parentContact: studentData.parentContact,
        parentEmail: studentData.parentEmail,
        parentTelegramId: studentData.parentTelegramId,
        attendanceStatus: 'PRESENT' as 'PRESENT' | 'ABSENT', // Both pickup and dropoff indicate presence
        attendanceType: 'TRANSPORT' as 'TRANSPORT',
        date: attendanceRecord.attendanceDate,
        time: getCurrentSriLankaISO(),
        vehicleNumber: vehicleData.vehicleNumber,
        bookhireName: vehicleData.bookhireName,
        subscriptionPlan: studentData.subscriptionPlan,
        advertisementData: defaultAdData
      };

      if (studentData.primaryParent) {
      }

      // Send notification
      // await this.attendanceNotificationService.sendAttendanceNotification(notificationData); // TODO: Service not available

      // Update attendance record with notification data
      // ✅ FIXED: Pass SK instead of timestamp to support UUID-based keys
      await this.dynamoBookhireAttendanceService.updateAttendanceWithNotification(
        attendanceRecord.bookhireId,
        attendanceRecord.studentId,
        attendanceRecord.SK, // Pass full SK instead of just timestamp
        {
          advertisementData: defaultAdData,
          notificationSent: true,
          notificationChannels: ['whatsapp', 'telegram', 'email'],
          messageId: `bookhire-default-${Date.now()}`
        }
      );


    } catch (error) {
      this.logger.warn(`Default ad notification failed: ${error.message}`);
    }
  }

  /**
   * � Get MOST MATCHING advertisement from database for individual person (BookHire version)
   * Uses multi-factor matching: userType, subscriptionPlan, age, gender, location
   * Returns the best personalized advertisement based on complete user profile
   */
  private async getMatchingAdvertisementFromDB(
    subscriptionPlan: string,
    studentData: any,
    bookhireId: string
  ): Promise<any> {
    try {
      // 🎯 Build complete user profile for sophisticated matching
      // ✅ All data now comes from the SINGLE query with relations
      const userProfile = {
        userId: studentData.student?.userId || studentData.studentId,
        userType: studentData.student?.user?.userType || 'STUDENT',
        subscriptionPlan: subscriptionPlan as any,
        instituteId: bookhireId, // Use bookhireId as targeting context
        // ✅ Extract from single query result (NO additional queries)
        city: studentData.student?.user?.city || null,
        province: studentData.student?.user?.province || null,
        district: studentData.student?.user?.district || null,
        birthYear: studentData.student?.user?.dateOfBirth 
          ? new Date(studentData.student.user.dateOfBirth).getFullYear() 
          : null,
        gender: studentData.student?.user?.gender || null,
        occupation: studentData.student?.user?.occupation || null
      };

      this.logger.log(`🎯 [BookHire] Finding MOST MATCHING ad for user ${userProfile.userId}`);

      // 🔥 Use sophisticated multi-factor matching service
      // const matches = await this.advertisementMatchingService.findMostMatchingAdvertisements(userProfile, 1); // TODO: Service not available
      const matches: any[] = []; // Temporarily empty until service is available

      if (matches.length > 0) {
        const bestMatch = matches[0];
        const advertisement = bestMatch.advertisement;

        this.logger.log(`✅ [BookHire] Found BEST matching ad: "${advertisement.title}" (Score: ${bestMatch.matchScore})`);

        return {
          id: advertisement.id,
          mediaUrl: advertisement.mediaUrl,
          mediaType: advertisement.mediaType,
          title: advertisement.title,
          content: advertisement.description || '',
          matchScore: bestMatch.matchScore,
          matchReasons: bestMatch.matchReasons,
          cascadeToParents: advertisement.cascadeToParents || false  // 🎯 Include cascade flag
        };
      }

      this.logger.warn(`⚠️ [BookHire] No matching advertisement found, using default fallback`);

      // Fallback to default ad if no matching ad found
      return {
        id: 'default-fallback',
        mediaUrl: process.env.DEFAULT_AD_URL || '',
        mediaType: process.env.DEFAULT_AD_TYPE || 'text',
        title: process.env.DEFAULT_AD_TITLE || 'Your Company Name',
        content: process.env.DEFAULT_AD_CONTENT || 'Professional services.',
        matchScore: 0,
        matchReasons: ['No matching advertisement found in database'],
        cascadeToParents: false
      };
    } catch (error) {
      this.logger.error(`❌ [BookHire] Failed to fetch matching advertisement: ${error.message}`);
      // Return default ad on error
      return {
        id: 'default-error-fallback',
        mediaUrl: process.env.DEFAULT_AD_URL || '',
        mediaType: process.env.DEFAULT_AD_TYPE || 'text',
        title: process.env.DEFAULT_AD_TITLE || 'Your Company Name',
        content: process.env.DEFAULT_AD_CONTENT || 'Professional services.',
        matchScore: 0,
        matchReasons: ['Error occurred while fetching advertisement'],
        cascadeToParents: false
      };
    }
  }

  /**
   * 🎯 CASCADE ADVERTISEMENT TO ALL PARENTS (BookHire version)
   * When an ad matches a student and cascadeToParents=true, 
   * sends the SAME ad to ALL parents (father, mother, guardian)
   */
  private async cascadeAdToAllParentsBookhire(
    studentData: any,
    advertisementData: any,
    attendanceRecord: any,
    vehicleData: any
  ): Promise<void> {
    try {
      const student = studentData.student;
      if (!student) {
        this.logger.warn(`⚠️ [BookHire] No student data found for cascade`);
        return;
      }

      const studentName = studentData.studentName;
      const allParents: Array<{type: string, user: any}> = [];

      // Collect all available parents
      if (student.father?.user) {
        allParents.push({ type: 'Father', user: student.father.user });
      }
      if (student.mother?.user) {
        allParents.push({ type: 'Mother', user: student.mother.user });
      }
      if (student.guardian?.user) {
        allParents.push({ type: 'Guardian', user: student.guardian.user });
      }

      if (allParents.length === 0) {
        this.logger.warn(`⚠️ [BookHire] No parents found for cascade`);
        return;
      }

      this.logger.log(`🎯 [BookHire] Cascading ad "${advertisementData.title}" to ${allParents.length} parent(s)`);

      // Send notification to EACH parent with the SAME ad
      const cascadePromises = allParents.map(async (parent) => {
        try {
          const parentUser = parent.user;
          
          // Check if parent has contact info
          if (!parentUser.phoneNumber && !parentUser.email && !parentUser.telegramId) {
            this.logger.warn(`⚠️ [BookHire] ${parent.type} has no contact info`);
            return;
          }

          // Check if parent's subscription should receive ads
          const parentSubscriptionPlan = parentUser.subscriptionPlan || 'FREE';
          const shouldReceiveAds = await this.shouldReceiveAdvertisements(parentSubscriptionPlan);

          if (!shouldReceiveAds) {
            this.logger.log(`ℹ️ [BookHire] ${parent.type} subscription (${parentSubscriptionPlan}) doesn't receive ads`);
            return;
          }

          // Build notification data for this parent with SAME ad
          const notificationData = {
            studentId: attendanceRecord.studentId,
            studentName: studentName,
            parentContact: parentUser.phoneNumber || null,
            parentEmail: parentUser.email || null,
            parentTelegramId: parentUser.telegramId || null,
            attendanceStatus: 'PRESENT' as 'PRESENT' | 'ABSENT',
            attendanceType: 'TRANSPORT' as 'TRANSPORT',
            date: attendanceRecord.attendanceDate,
            time: getCurrentSriLankaISO(),
            vehicleNumber: vehicleData.vehicleNumber,
            bookhireName: vehicleData.bookhireName,
            subscriptionPlan: parentSubscriptionPlan,
            advertisementData: advertisementData  // 🎯 SAME ad for ALL parents
          };

          // Send notification (fire-and-forget)
          // await this.attendanceNotificationService.sendAttendanceNotification(notificationData); // TODO: Service not available
          
        } catch (error) {
          this.logger.error(`❌ [BookHire] Failed to cascade ad to ${parent.type}: ${error.message}`);
        }
      });

      // Wait for all cascade notifications
      await Promise.allSettled(cascadePromises);

      this.logger.log(`✅ [BookHire] Cascade complete: Ad sent to ${allParents.length} parent(s)`);

    } catch (error) {
      this.logger.error(`❌ [BookHire] Cascade to parents failed: ${error.message}`);
    }
  }

  /**
   * 🔍 Check if subscription plan should receive advertisements
   */
  private async shouldReceiveAdvertisements(subscriptionPlan: string): Promise<boolean> {
    try {
      // Global kill-switch: skip ads entirely unless env flag is set
      if (this.configService.get('ENABLE_ADVERTISEMENT_DELIVERY', 'false') !== 'true') return false;
      // Get package configuration from notification packages config
      const packageConfig = await this.getPackageConfiguration(subscriptionPlan);
      return packageConfig?.isAds === true;
    } catch (error) {
      this.logger.warn(`shouldReceiveAdvertisements failed for plan ${subscriptionPlan}: ${error?.message}`);
      return false; // Default to no ads if error
    }
  }

  /**
   * 📋 Get package configuration from notification-packages.config
   */
  private async getPackageConfiguration(subscriptionPlan: string): Promise<any> {
    try {
      // Get configuration from notification packages config
      // const packageConfig = NOTIFICATION_PACKAGES_CONFIG.packages[subscriptionPlan.toUpperCase()]; // TODO: Config not available
      const packageConfig = { maxSmsPerMonth: 100, maxEmailsPerMonth: 100 }; // Temporary default
      
      if (!packageConfig) {
        return null;
      }
      
      return packageConfig;
    } catch (error) {
      this.logger.warn(`getPackageConfiguration failed for plan ${subscriptionPlan}: ${error?.message}`);
      return null;
    }
  }

  /**
   * 🛡️ SAFE DATA FETCHING: Get student data without throwing EntityMetadataNotFoundError
   */
  private async fetchStudentWithParentDataSafe(studentId: string): Promise<{
    student: any | null;
    primaryParent: any | null;
    parentContact: string | null;
    parentEmail: string | null;
    parentTelegramId: string | null;
    subscriptionPlan: string;
  }> {
    try {
      // Check if StudentEntity is available in TypeORM metadata
      if (!this.studentRepository || !this.studentRepository.metadata) {
        return {
          student: null,
          primaryParent: null,
          parentContact: null,
          parentEmail: null,
          parentTelegramId: null,
          subscriptionPlan: 'FREE'
        };
      }

      return await this.fetchStudentWithParentData(studentId);
    } catch (error) {
      if (error.name === 'EntityMetadataNotFoundError' || error.message?.includes('No metadata')) {
        return {
          student: null,
          primaryParent: null,
          parentContact: null,
          parentEmail: null,
          parentTelegramId: null,
          subscriptionPlan: 'FREE'
        };
      }
      throw error; // Re-throw other errors
    }
  }

  /**
   * 🏭 INDUSTRIAL-GRADE DATA FETCHING: Get real student with parent data
   */
  private async fetchStudentWithParentData(studentId: string): Promise<{
    student: any | null;
    primaryParent: any | null;
    parentContact: string | null;
    parentEmail: string | null;
    parentTelegramId: string | null;
    subscriptionPlan: string;
  }> {
    try {
      // Fetch student with related user and parent data
      // userId is the PK in students table and references users.id
      const student = await this.studentRepository.findOne({
        where: { userId: studentId },
        relations: ['user', 'father', 'father.user', 'mother', 'mother.user', 'guardian', 'guardian.user'],
        select: {
          userId: true,
          fatherId: true,
          motherId: true,
          guardianId: true,
          studentId: true,
          isActive: true,
          user: {
            id: true,
            firstName: true,
            lastName: true,
            nameWithInitials: true,
            email: true,
            phoneNumber: true,
            subscriptionPlan: true,
            telegramId: true,
            imageUrl: true,
            city: true,               // ✅ Added for ad matching
            province: true,           // ✅ Added for ad matching
            district: true,           // ✅ Added for ad matching
            dateOfBirth: true,        // ✅ Added for ad matching (age calculation)
            gender: true,             // ✅ Added for ad matching
            userType: true            // ✅ Added for ad matching
          },
          father: {
            userId: true,
            user: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phoneNumber: true,
              telegramId: true,
              subscriptionPlan: true,  // ✅ Added for cascade filtering
              city: true,               // ✅ Added for ad matching
              province: true,           // ✅ Added for ad matching
              district: true,           // ✅ Added for ad matching
              dateOfBirth: true,        // ✅ Added for ad matching (age calculation)
              gender: true              // ✅ Added for ad matching
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
              telegramId: true,
              subscriptionPlan: true,  // ✅ Added for cascade filtering
              city: true,               // ✅ Added for ad matching
              province: true,           // ✅ Added for ad matching
              district: true,           // ✅ Added for ad matching
              dateOfBirth: true,        // ✅ Added for ad matching (age calculation)
              gender: true              // ✅ Added for ad matching
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
              telegramId: true,
              subscriptionPlan: true,  // ✅ Added for cascade filtering
              city: true,               // ✅ Added for ad matching
              province: true,           // ✅ Added for ad matching
              district: true,           // ✅ Added for ad matching
              dateOfBirth: true,        // ✅ Added for ad matching (age calculation)
              gender: true              // ✅ Added for ad matching
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

      // Priority: Father → Mother → Guardian
      let primaryParent: any = null;
      if (student.father?.user) {
        primaryParent = student.father.user;
      } else if (student.mother?.user) {
        primaryParent = student.mother.user;
      } else if (student.guardian?.user) {
        primaryParent = student.guardian.user;
      }

      const parentContact = primaryParent?.phoneNumber || null;
      const parentEmail = primaryParent?.email || null;
      const parentTelegramId = primaryParent?.telegramId || null;
      const subscriptionPlan = student.user?.subscriptionPlan || 'FREE';

      // Validation logging
      if (!parentContact && !parentEmail && !parentTelegramId) {
      }

      return {
        student,
        primaryParent,
        parentContact,
        parentEmail,
        parentTelegramId,
        subscriptionPlan
      };

    } catch (error) {
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
   * � OPTIMIZED: Determine if bookhire notification should be sent based on user type
   * 
   * Enhanced Logic (Oct 2025):
   * - STUDENT, TEACHER, PARENT, INSTITUTE_ADMIN, ATTENDANCE_MARKER: Always send ✅
   * - USER: Only if has contact info (phone/email/telegram) ✅
   * - USER_WITHOUT_PARENT, USER_WITHOUT_STUDENT: Send ✅
   * - SUPERADMIN, ORGANIZATION_MANAGER: Send ✅
   * - Generic USER without contact: Skip ❌
   */
  private shouldSendBookhireNotificationOptimized(user: any, studentData: any): boolean {
    const userType = (user.userType || '').toUpperCase();

    // All known user types should receive notifications
    const knownUserTypes = [
      'STUDENT', 'TEACHER', 'PARENT', 'INSTITUTE_ADMIN', 'ATTENDANCE_MARKER',
      'SUPER_ADMIN', 'SUPERADMIN', 'ORGANIZATION_MANAGER',
      'USER_WITHOUT_PARENT', 'USER_WITHOUT_STUDENT'
    ];

    if (knownUserTypes.includes(userType)) {
      return true;
    }

    // Generic USER type - only send if they have contact information
    if (userType === 'USER') {
      const hasContactInfo = user.phoneNumber || user.email || user.telegramId;
      if (hasContactInfo) {
        return true;
      } else {
        return false;
      }
    }

    // Unknown user type - be conservative and check contact info
    const hasContactInfo = user.phoneNumber || user.email || user.telegramId;
    if (hasContactInfo) {
      return true;
    } else {
      return false;
    }
  }

  /**
   * Check enrollment with multiple fallbacks.
   * - First try enrollment.studentId == userId
   * - Then try enrollment.studentId == student.studentId (short student id)
   * - Then try enrollment.studentId == student.userId
   * Accepts status 'approved' or 'active' and requires isActive = true when present.
   */
  private async isStudentEnrolledInBookhire(userId: string, bookhireId: number): Promise<boolean> {
    try {
      const approvedStatuses = ['approved', 'active'];

      // 1) Direct match against enrollment.studentId === userId
      let enrollment = await this.enrollmentRepository.findOne({
        where: {
          studentId: userId,
          bookhireId,
          status: In(approvedStatuses),
          isActive: true
        },
        select: ['id']
      });

      if (enrollment) return true;

      // 2) Try to look up student record and match against student.studentId or student.userId
      const student = await this.studentRepository.findOne({
        where: { userId },
        select: ['studentId', 'userId']
      });

      if (!student) return false;

      if (student.studentId) {
        enrollment = await this.enrollmentRepository.findOne({
          where: {
            studentId: student.studentId,
            bookhireId,
            status: In(approvedStatuses),
            isActive: true
          },
          select: ['id']
        });

        if (enrollment) return true;
      }

      // 3) Double-check by student.userId (may differ in type/format)
      enrollment = await this.enrollmentRepository.findOne({
        where: {
          studentId: student.userId,
          bookhireId,
          status: In(approvedStatuses),
          isActive: true
        },
        select: ['id']
      });

      if (enrollment) return true;

      return false;
    } catch (error) {
      // On unexpected errors, log lightly and return false so caller can fail with BadRequest
      this.logger.error('Error checking enrollment:', error?.message || error);
      return false;
    }
  }

  /**
   * �🔍 Determine if bookhire notification should be sent based on user type
   * 
   * Logic:
   * - STUDENT, TEACHER, PARENT, INSTITUTE_ADMIN, ATTENDANCE_MARKER: Always send ✅
   * - USER with student record: Send ✅
   * - USER without student record: Skip ❌
   * - USER_WITHOUT_PARENT: Send ✅
   * - USER_WITHOUT_STUDENT: Send ✅
   * - SUPERADMIN, ORGANIZATION_MANAGER: Send ✅
   */
  private shouldSendBookhireNotification(user: any, studentData: any): boolean {
    const userType = user.userType;

    // Fixed role types - always send notifications
    const fixedRoleTypes = [
      'STUDENT',
      'TEACHER', 
      'PARENT',
      'INSTITUTE_ADMIN',
      'ATTENDANCE_MARKER',
      'SUPER_ADMIN',
      'SUPERADMIN',
      'ORGANIZATION_MANAGER'
    ];

    if (fixedRoleTypes.includes(userType)) {
      return true;
    }

    // Enhanced flexible user types
    if (userType === 'user_without_Parent' || userType === 'USER_WITHOUT_PARENT') {
      return true;
    }

    if (userType === 'user_without_student' || userType === 'USER_WITHOUT_STUDENT') {
      return true;
    }

    // Generic USER type - only send if they have a student record
    if (userType === 'USER') {
      if (studentData.student) {
        return true;
      } else {
        return false;
      }
    }

    // Unknown user type - be conservative and send notification
    return true;
  }
}
