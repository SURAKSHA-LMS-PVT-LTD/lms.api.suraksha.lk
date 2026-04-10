import { Injectable, Logger, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, DataSource } from 'typeorm';
import { DynamoDBAttendanceService } from './services/dynamodb-attendance.service';
import { AttendanceNotificationService } from './services/attendance-notification.service';
import { InstituteCalendarService } from '../institute/services/institute-calendar.service';
import { CalendarDayCacheService } from '../institute/services/calendar-day-cache.service';
import { NOTIFICATION_PACKAGES_CONFIG } from '../advertisement/services/notification-packages.config';
import { MarkAttendanceDto, BulkAttendanceDto, GetStudentAttendanceDto, StudentAttendanceResponseDto, AttendanceStatus, AttendanceUserType, MyAttendanceQueryDto, MyAttendanceResponseDto, MyAttendanceRecordDto } from './dto/attendance.dto';
import { InstituteEntity } from '../institute/entities/institute.entity';
import { InstituteClassEntity } from '../institute_mudules/institue_class/entities/institue_class.entity';
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
import { AttendanceDeviceService } from '../attendance-device/services/attendance-device.service';
import { AttendanceSyncConfigService } from './services/attendance-sync-config.service';
import { AttendanceSyncSchedulerService } from './services/attendance-sync-scheduler.service';
import { MysqlAttendanceService } from './services/mysql-attendance.service';
import { FcmNotificationService } from '../../common/services/fcm-notification.service';
import { AttendanceSyncMode } from './enums/attendance-sync-mode.enum';
import { InstituteClassStudentEntity } from '../institute_class_modules/institute_class_student/entities/institute_class_student.entity';
import { AttendanceRecordEntity } from './entities/attendance-record.entity';
import { BulkMarkClassFromInstituteDto } from './dto/class-attendance-from-institute.dto';
import { BulkMarkSubjectFromClassDto } from './dto/subject-attendance-from-class.dto';
import { InstituteClassSubjectStudent } from '../institute_class_subject_modules/institute_class_subject_students/entities/institute_class_subject_student.entity';

@Injectable()
export class AttendanceService {
  private readonly logger = new Logger(AttendanceService.name);
  private readonly instituteIdsRequiringCustomImages: Set<string>;
  private readonly notificationsEnabled: boolean;
  private readonly adsDeliveryEnabled: boolean;

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
    @InjectRepository(InstituteEntity)
    private readonly instituteRepository: Repository<InstituteEntity>,
    @InjectRepository(InstituteClassEntity)
    private readonly classRepository: Repository<InstituteClassEntity>,
    private readonly CloudStorageService: CloudStorageService,
    private readonly attendanceDeviceService: AttendanceDeviceService,
    private readonly syncConfigService: AttendanceSyncConfigService,
    private readonly syncSchedulerService: AttendanceSyncSchedulerService,
    private readonly mysqlAttendanceService: MysqlAttendanceService,
    private readonly fcmNotificationService: FcmNotificationService,
    private readonly dataSource: DataSource,
    @InjectRepository(InstituteClassStudentEntity)
    private readonly classStudentRepository: Repository<InstituteClassStudentEntity>,
    @InjectRepository(AttendanceRecordEntity)
    private readonly attendanceRecordRepository: Repository<AttendanceRecordEntity>,
    @InjectRepository(InstituteClassSubjectStudent)
    private readonly subjectStudentRepository: Repository<InstituteClassSubjectStudent>,
  ) {
    // ⚡ OPTIMIZATION: Cache config parsing to avoid repeated string operations
    const instituteIds = this.configService.get<string>('INSTITUTE_IDS_WITH_CUSTOM_IMAGES')?.split(',').map(id => id.trim()) || [];
    this.instituteIdsRequiringCustomImages = new Set(instituteIds);
    this.notificationsEnabled = this.configService.get('ENABLE_ATTENDANCE_NOTIFICATIONS', 'true') === 'true';
    this.adsDeliveryEnabled = this.configService.get('ENABLE_ADVERTISEMENT_DELIVERY', 'false') === 'true';
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
   * Always prefers institute-specific image (if verified), falls back to global user image
   */
  private resolveImageUrl(
    instituteUser: InstituteUserEntity | null,
    globalImageUrl: string | null,
    instituteId: string
  ): string | null {
    try {
      if (instituteUser) {
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

  private async enrichAttendanceRecordsWithImages(records: any[], instituteId: string): Promise<any[]> {
    if (!Array.isArray(records) || records.length === 0) {
      return records;
    }

    const normalizedRecords = records.map((record) => {
      const existingImage = (record as any).studentImageUrl || (record as any).imageUrl || null;
      if (!existingImage) return record;

      let fullImageUrl = existingImage;
      if (!/^https?:\/\//i.test(existingImage)) {
        try {
          fullImageUrl = this.CloudStorageService.getFullUrl(existingImage);
        } catch {
          fullImageUrl = existingImage;
        }
      }

      return {
        ...record,
        imageUrl: fullImageUrl,
        studentImageUrl: fullImageUrl,
      };
    });

    const userIds = [...new Set(
      normalizedRecords
        .filter(r => !((r as any).studentImageUrl || (r as any).imageUrl))
        .map(r => String((r as any).studentId || (r as any).userId || '').trim())
        .filter(Boolean)
    )];

    if (userIds.length === 0) {
      return normalizedRecords;
    }

    const [instituteUsers, users] = await Promise.all([
      this.instituteUserRepository.find({
        where: { instituteId, userId: In(userIds) },
        select: ['userId', 'instituteUserImageUrl', 'imageVerificationStatus'],
      }),
      this.userRepository.find({
        where: { id: In(userIds) as any },
        select: ['id', 'imageUrl'],
      }),
    ]);

    const instituteImageByUserId = new Map(
      instituteUsers.map(iu => [String(iu.userId), {
        image: iu.instituteUserImageUrl || null,
        verified: iu.imageVerificationStatus === ImageVerificationStatus.VERIFIED,
      }])
    );

    const globalImageByUserId = new Map(
      users.map(u => [String(u.id), u.imageUrl || null])
    );

    return normalizedRecords.map((record) => {
      const rawUserId = String((record as any).studentId || (record as any).userId || '').trim();
      if (!rawUserId) return record;

      const existingImage = (record as any).studentImageUrl || (record as any).imageUrl || null;
      const instituteMeta = instituteImageByUserId.get(rawUserId);
      const preferredImage = instituteMeta?.verified && instituteMeta.image
        ? instituteMeta.image
        : (globalImageByUserId.get(rawUserId) || existingImage);

      if (!preferredImage) return record;

      let fullImageUrl = preferredImage;
      if (!/^https?:\/\//i.test(preferredImage)) {
        try {
          fullImageUrl = this.CloudStorageService.getFullUrl(preferredImage);
        } catch {
          fullImageUrl = preferredImage;
        }
      }

      return {
        ...record,
        imageUrl: fullImageUrl,
        studentImageUrl: fullImageUrl,
      };
    });
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
      let nameWithInitialsValue: string | null = null;
      let globalImageUrl: string | null = null;
      let studentData: any = null;

      if (userType === AttendanceUserType.STUDENT) {
        // STUDENT path: Use existing student + parent data fetch (for notifications)
        studentData = await this.fetchStudentWithParentData(markAttendanceDto.studentId);
        
        if (!studentData.student?.user) {
          throw new Error(`Student not found: ${markAttendanceDto.studentId}`);
        }

        nameWithInitialsValue = studentData.student.user.nameWithInitials || null;
        userName = nameWithInitialsValue || `${studentData.student.user.firstName} ${studentData.student.user.lastName}`.trim();
        globalImageUrl = studentData.student.user.imageUrl || null;
      } else {
        // NON-STUDENT path: Query UserEntity directly (TEACHER, INSTITUTE_ADMIN, etc.)
        const user = await this.userRepository.findOne({
          where: { id: markAttendanceDto.studentId },
          select: ['id', 'firstName', 'lastName', 'nameWithInitials', 'imageUrl', 'email', 'phoneNumber', 'subscriptionPlan'],
        });

        if (!user) {
          throw new Error(`User not found: ${markAttendanceDto.studentId}`);
        }

        nameWithInitialsValue = user.nameWithInitials || null;
        userName = nameWithInitialsValue || `${user.firstName} ${user.lastName || ''}`.trim();
        globalImageUrl = user.imageUrl || null;
      }

      markAttendanceDto.studentName = userName;
      // Attach auto-detected userType to the DTO for DynamoDB storage
      markAttendanceDto.userType = userType;

      markAttendanceDto.date = getCurrentSriLankaDate();

      if (!markAttendanceDto.location) {
        markAttendanceDto.location = this.generateAddress(
          markAttendanceDto.instituteName,
          markAttendanceDto.className,
          markAttendanceDto.subjectName
        );
      }

      const hasClassOrSubjectScope = Boolean(
        (markAttendanceDto.classId && markAttendanceDto.classId !== 'default')
        || (markAttendanceDto.subjectId && markAttendanceDto.subjectId !== 'default')
      );

      // ============================================
      // STEP 3.5: MANDATORY Calendar Day + Event Linkage
      // ============================================
      // calendarDayId: Resolved from the DTO's date (which defaults to today if not provided).
      // eventId (institute-level only): If frontend sends one (special event) → use it.
      // For class/subject scoped attendance, eventId is always ignored.
      // For institute-level attendance without explicit eventId → auto-link to default REGULAR_CLASS event.
      // This ensures ALL attendance records are visible in the institute calendar section.
      if (hasClassOrSubjectScope && markAttendanceDto.eventId) {
        this.logger.warn(
          `[${requestId}] Ignoring eventId=${markAttendanceDto.eventId} for class/subject scoped attendance`
        );
      }
      const originalFrontendEventId = hasClassOrSubjectScope
        ? null
        : (markAttendanceDto.eventId || null); // Save before any modification
      {
        let calendarResolved = false;

        try {
          const { day: calendarDay, defaultEventId } = await this.calendarDayCacheService.getCalendarDayForDate(
            markAttendanceDto.instituteId,
            markAttendanceDto.date,
          );

          if (calendarDay) {
            // ✅ calendarDayId is ALWAYS system-set (today → today's day record)
            (markAttendanceDto as any).calendarDayId = calendarDay.id;

            // ✅ eventId for class/subject scope is always disabled.
            if (hasClassOrSubjectScope) {
              (markAttendanceDto as any).eventId = null;
            } else if (originalFrontendEventId) {
              (markAttendanceDto as any).eventId = originalFrontendEventId;
              this.logger.log(`[${requestId}] 🎯 Special event attendance: eventId=${originalFrontendEventId}, dayId=${calendarDay.id}`);
            } else if (defaultEventId) {
              (markAttendanceDto as any).eventId = defaultEventId;
              this.logger.debug(`[${requestId}] ✅ Auto-linked to default event: eventId=${defaultEventId}, dayId=${calendarDay.id}`);
            } else {
              this.logger.warn(`[${requestId}] ⚠️  Calendar day ${calendarDay.id} has no default event. Attendance will have dayId but no eventId.`);
            }
            calendarResolved = true;
          }
        } catch (calendarError) {
          // Retry once after invalidating cache — handles race conditions on lazy calendar day creation
          this.logger.warn(
            `[${requestId}] ⚠️  Calendar day lookup failed: ${calendarError.message}. Retrying after cache invalidation...`
          );
          try {
            this.calendarDayCacheService.invalidate(markAttendanceDto.instituteId, markAttendanceDto.date);
            const { day: calendarDay, defaultEventId } = await this.calendarDayCacheService.getCalendarDayForDate(
              markAttendanceDto.instituteId,
              markAttendanceDto.date,
            );
            if (calendarDay) {
              (markAttendanceDto as any).calendarDayId = calendarDay.id;
              if (hasClassOrSubjectScope) {
                (markAttendanceDto as any).eventId = null;
              } else if (originalFrontendEventId) {
                (markAttendanceDto as any).eventId = originalFrontendEventId;
              } else if (defaultEventId) {
                (markAttendanceDto as any).eventId = defaultEventId;
              }
              calendarResolved = true;
              this.logger.log(`[${requestId}] ✅ Calendar day recovered after retry: dayId=${calendarDay.id}`);
            }
          } catch (retryError) {
            this.logger.error(
              `[${requestId}] ❌ Calendar day resolution failed after retry: ${retryError.message}`
            );
          }
        }

        if (!calendarResolved) {
          this.logger.error(
            `[${requestId}] ❌ CRITICAL: Could not resolve calendar day for institute ${markAttendanceDto.instituteId} on ${markAttendanceDto.date}. ` +
            `Attendance will still be saved but will NOT appear in calendar views.`
          );
        }
      }

      // ✅ STEP 3.6: Device validation (if marking from a registered device)
      if (markAttendanceDto.deviceUid) {
        const deviceValidation = await this.attendanceDeviceService.validateDeviceForMarking(markAttendanceDto.deviceUid);
        if (!deviceValidation.allowed) {
          throw new ForbiddenException(`Device rejected: ${deviceValidation.error}`);
        }
        // Apply event override from device binding (if device is bound to a special event)
        // Priority: frontend special eventId > device binding eventId > system default (REGULAR_CLASS)
        // Device binding overrides the auto-assigned default REGULAR_CLASS event, but NOT a
        // frontend-supplied special event (the user explicitly chose that event).
        if (deviceValidation.eventId) {
          if (!hasClassOrSubjectScope && !originalFrontendEventId) {
            // No explicit frontend event → device binding overrides the auto-linked default event
            (markAttendanceDto as any).eventId = deviceValidation.eventId;
            this.logger.log(`[${requestId}] 🔧 Device binding overrides default event: eventId=${deviceValidation.eventId}`);
          }
        }
        // Apply status override from device config/binding
        if (deviceValidation.statusOverride && !markAttendanceDto.status) {
          markAttendanceDto.status = deviceValidation.statusOverride as AttendanceStatus;
        }
        // Validate status is allowed by device config
        const statusAllowed = await this.attendanceDeviceService.isStatusAllowed(
          deviceValidation.deviceId, markAttendanceDto.status,
        );
        if (!statusAllowed) {
          throw new ForbiddenException(`Status "${markAttendanceDto.status}" is not allowed on this device`);
        }
      }

      // ✅ STEP 4: Resolve image once and persist it in DynamoDB for faster later reads
      const imageUrl = this.resolveImageUrl(instituteUser, globalImageUrl, markAttendanceDto.instituteId);
      markAttendanceDto.studentImageUrl = imageUrl || undefined;

      // ✅ STEP 4.1: Mark attendance based on database mode
      const isMysqlOnly = this.syncConfigService.isMysqlOnly();
      let result: any;

      if (isMysqlOnly) {
        // MySQL-only mode: write directly to MySQL, no DynamoDB
        result = await this.mysqlAttendanceService.markAttendance(markAttendanceDto);
      } else {
        // Both mode: write to DynamoDB first, then sync to MySQL
        result = await this.dynamoAttendanceService.markAttendance(markAttendanceDto);

        // ✅ STEP 4.5: Sync to MySQL based on system-wide sync mode
        // Use the actual DynamoDB result (real pk/sk/timestamp) to avoid duplicate rows
        try {
          const syncMode = this.syncConfigService.getSyncModeSync();
          if (syncMode === AttendanceSyncMode.IMMEDIATE) {
            await this.syncSchedulerService.syncSingleRecord(result as any);
          } else if (syncMode === AttendanceSyncMode.DYNAMO_FIRST) {
            this.syncSchedulerService.syncSingleRecordAsync(result as any);
          }
          // BACKEND_SCHEDULE: no-op here — cron handles it
        } catch (syncErr) {
          this.logger.warn(`[${requestId}] MySQL sync skipped: ${syncErr.message}`);
        }
      }

      // ✅ STEP 5: Send notifications ONLY for students (teachers/admins don't need parent notifications)
      if (userType === AttendanceUserType.STUDENT && studentData) {
        this.scheduleAttendanceNotification(markAttendanceDto, result, studentData);
      }

      // ✅ STEP 6: Fetch available events for this date so frontend can show event picker
      let availableEvents = [];
      try {
        const calendarDayId = (markAttendanceDto as any).calendarDayId;
        if (calendarDayId) {
          const events = await this.instituteCalendarService.getEventsForDay(String(calendarDayId));
          availableEvents = events.map(e => ({
            id: String(e.id),
            eventType: e.eventType,
            title: e.title,
            isDefault: e.isDefault,
            isAttendanceTracked: e.isAttendanceTracked,
            startTime: e.startTime,
            endTime: e.endTime,
          }));
        }
      } catch (evErr) {
        this.logger.warn(`[${requestId}] Could not fetch events for response: ${evErr.message}`);
      }

      return {
        success: true,
        imageUrl: imageUrl,
        status: markAttendanceDto.status,
        name: userName,
        nameWithInitials: nameWithInitialsValue,
        userType: userType,
        date: markAttendanceDto.date,
        eventId: (markAttendanceDto as any).eventId || null,
        calendarDayId: (markAttendanceDto as any).calendarDayId || null,
        availableEvents,  // ✅ All events for this date — frontend can use for event picker
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
      bulkAttendanceDto.date = getCurrentSriLankaDate();

      const userIds = bulkAttendanceDto.students.map(s => s.studentId);
      
      // ✅ STEP 1: Batch detect user types from institute_user table
      const instituteUsers = await this.instituteUserRepository.find({
        where: {
          userId: In(userIds),
          instituteId: bulkAttendanceDto.instituteId,
        },
        select: ['userId', 'instituteUserType', 'status', 'instituteUserImageUrl', 'imageVerificationStatus'],
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
                nameWithInitials: true,
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
            select: ['id', 'firstName', 'lastName', 'nameWithInitials', 'imageUrl'],
          })
        : [];

      // ✅ STEP 5: Build unified user map (userId -> { name, userType, imageUrl })
      const userDataMap = new Map<string, { name: string; userType: AttendanceUserType; imageUrl?: string }>();
      
      for (const student of studentEntities) {
        if (student.user) {
          const instituteUser = instituteUserMap.get(student.userId);
          const resolvedImage = this.resolveImageUrl(
            instituteUser as any,
            student.user.imageUrl || null,
            bulkAttendanceDto.instituteId
          );
          userDataMap.set(student.userId, {
            name: student.user.nameWithInitials || `${student.user.firstName} ${student.user.lastName}`.trim(),
            userType: AttendanceUserType.STUDENT,
            imageUrl: resolvedImage || undefined,
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
        const resolvedImage = this.resolveImageUrl(
          iu as any,
          user.imageUrl || null,
          bulkAttendanceDto.instituteId
        );
        userDataMap.set(user.id.toString(), {
          name: user.nameWithInitials || `${user.firstName} ${user.lastName || ''}`.trim(),
          userType: iu ? (typeMap[iu.instituteUserType] || AttendanceUserType.STUDENT) : AttendanceUserType.NOT_ENROLLED,
          imageUrl: resolvedImage || undefined,
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
        (studentItem as any).studentImageUrl = userData.imageUrl;
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
      
      // ============================================
      // STEP 8.5: MANDATORY Calendar Day + Event Linkage (Bulk)
      // ============================================
      // calendarDayId: Resolved from the DTO's date (defaults to today if not provided).
      // eventId: if bulk DTO has a special eventId → use it. Otherwise → default REGULAR_CLASS event.
      {
        const hasClassOrSubjectScope = Boolean(
          (bulkAttendanceDto.classId && bulkAttendanceDto.classId !== 'default')
          || (bulkAttendanceDto.subjectId && bulkAttendanceDto.subjectId !== 'default')
        );
        if (hasClassOrSubjectScope && bulkAttendanceDto.eventId) {
          this.logger.warn(
            `[${requestId}] Ignoring bulk eventId=${bulkAttendanceDto.eventId} for class/subject scoped attendance`
          );
        }
        const frontendEventId = hasClassOrSubjectScope ? null : (bulkAttendanceDto.eventId || null); // Special event from frontend (if any)
        let calendarResolved = false;

        try {
          const { day: calendarDay, defaultEventId } = await this.calendarDayCacheService.getCalendarDayForDate(
            bulkAttendanceDto.instituteId,
            bulkAttendanceDto.date,
          );
          if (calendarDay) {
            (bulkAttendanceDto as any).calendarDayId = calendarDay.id;
            if (hasClassOrSubjectScope) {
              (bulkAttendanceDto as any).defaultEventId = null;
              (bulkAttendanceDto as any).eventId = null;
            } else if (frontendEventId) {
              (bulkAttendanceDto as any).defaultEventId = frontendEventId;
              this.logger.log(`[${requestId}] 🎯 Bulk special event attendance: eventId=${frontendEventId}, dayId=${calendarDay.id}`);
            } else if (defaultEventId) {
              (bulkAttendanceDto as any).defaultEventId = defaultEventId;
              this.logger.debug(`[${requestId}] ✅ Bulk auto-linked to default event: eventId=${defaultEventId}, dayId=${calendarDay.id}`);
            } else {
              this.logger.warn(`[${requestId}] ⚠️  Bulk: calendar day ${calendarDay.id} has no default event.`);
            }
            calendarResolved = true;
          }
        } catch (calendarError) {
          this.logger.warn(
            `[${requestId}] ⚠️  Bulk calendar day lookup failed: ${calendarError.message}. Retrying after cache invalidation...`
          );
          try {
            this.calendarDayCacheService.invalidate(bulkAttendanceDto.instituteId, bulkAttendanceDto.date);
            const { day: calendarDay, defaultEventId } = await this.calendarDayCacheService.getCalendarDayForDate(
              bulkAttendanceDto.instituteId,
              bulkAttendanceDto.date,
            );
            if (calendarDay) {
              (bulkAttendanceDto as any).calendarDayId = calendarDay.id;
              if (hasClassOrSubjectScope) {
                (bulkAttendanceDto as any).defaultEventId = null;
                (bulkAttendanceDto as any).eventId = null;
              } else {
                (bulkAttendanceDto as any).defaultEventId = frontendEventId || defaultEventId;
              }
              calendarResolved = true;
              this.logger.log(`[${requestId}] ✅ Bulk calendar day recovered after retry: dayId=${calendarDay.id}`);
            }
          } catch (retryError) {
            this.logger.error(
              `[${requestId}] ❌ Bulk calendar day resolution failed after retry: ${retryError.message}`
            );
          }
        }

        if (!calendarResolved) {
          this.logger.error(
            `[${requestId}] ❌ CRITICAL: Could not resolve calendar day for bulk at institute ${bulkAttendanceDto.instituteId}. ` +
            `Bulk attendance will still be saved but will NOT appear in calendar views.`
          );
        }
      }

      // ✅ STEP 9: Mark attendance based on database mode
      const isMysqlOnly = this.syncConfigService.isMysqlOnly();
      let results: MarkAttendanceDto[];

      if (isMysqlOnly) {
        // MySQL-only mode: write directly to MySQL, no DynamoDB
        results = await this.mysqlAttendanceService.markBulkAttendance(bulkAttendanceDto);
      } else {
        // Both mode: write to DynamoDB first, then sync to MySQL
        results = await this.dynamoAttendanceService.markBulkAttendance(bulkAttendanceDto);

        // ✅ STEP 9.5: Sync bulk results to MySQL based on system-wide sync mode
        try {
          const syncMode = this.syncConfigService.getSyncModeSync();
          if (syncMode === AttendanceSyncMode.IMMEDIATE || syncMode === AttendanceSyncMode.DYNAMO_FIRST) {
            for (const record of results) {
              if (syncMode === AttendanceSyncMode.IMMEDIATE) {
                await this.syncSchedulerService.syncFromDto(record);
              } else {
                this.syncSchedulerService.syncFromDtoAsync(record);
              }
            }
          }
        } catch (syncErr) {
          this.logger.warn(`[${requestId}] Bulk MySQL sync error: ${syncErr.message}`);
        }
      }
      
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

      // ✅ Fetch available events for this date so frontend can show event picker
      let availableEvents = [];
      try {
        const calendarDayId = (bulkAttendanceDto as any).calendarDayId;
        if (calendarDayId) {
          const events = await this.instituteCalendarService.getEventsForDay(String(calendarDayId));
          availableEvents = events.map(e => ({
            id: String(e.id),
            eventType: e.eventType,
            title: e.title,
            isDefault: e.isDefault,
            isAttendanceTracked: e.isAttendanceTracked,
            startTime: e.startTime,
            endTime: e.endTime,
          }));
        }
      } catch (evErr) {
        this.logger.warn(`[${requestId}] Could not fetch events for bulk response: ${evErr.message}`);
      }

      return {
        success: true,
        message: `Bulk attendance marked successfully for ${results.length} users`,
        totalProcessed: results.length,
        action: 'bulk_created',
        date: bulkAttendanceDto.date,
        eventId: (bulkAttendanceDto as any).defaultEventId || (bulkAttendanceDto as any).eventId || null,
        calendarDayId: (bulkAttendanceDto as any).calendarDayId || null,
        availableEvents,  // ✅ All events for this date — frontend can use for event picker
        records: results
      };
    } catch (error) {
      this.logger.error(`[${requestId}] ❌ ERROR: Bulk attendance failed - ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Retrieve full details of a single attendance record by its encoded ID.
   * The ID is passed via notification deep-link: attendance/view?id=<id>
   * Returns DynamoDB record data + student profile image (no cross-joins).
   */
  async getAttendanceDetail(id: string): Promise<any> {
    const record = this.syncConfigService.isMysqlOnly()
      ? await this.mysqlAttendanceService.getAttendanceById(id)
      : await this.dynamoAttendanceService.getAttendanceById(id);
    if (!record) {
      return null;
    }

    // ✅ Use DynamoDB stored image URL first (snapshot at time of marking)
    // Falls back to current users table image if missing (for legacy records)
    let studentImageUrl: string | null = null;
    
    if (record.studentImageUrl) {
      // Image was already stored in DynamoDB when attendance was marked
      studentImageUrl = this.CloudStorageService.getFullUrl(record.studentImageUrl);
    } else {
      // ✅ Optional: Enrich with current image from users table (handles legacy records)
      try {
        const user = await this.userRepository.findOne({
          where: { id: record.studentId },
          select: ['id', 'imageUrl'],
        });
        if (user?.imageUrl) {
          studentImageUrl = this.CloudStorageService.getFullUrl(user.imageUrl);
        }
      } catch (_) {
        // Image fetch is best-effort — do not fail the whole response
      }
    }

    return {
      id: record.id,
      studentId: record.studentId,
      studentName: record.studentName,
      studentImageUrl,
      instituteId: record.instituteId,
      instituteName: record.instituteName,
      classId: record.classId || null,
      className: record.className || null,
      subjectId: record.subjectId || null,
      subjectName: record.subjectName || null,
      date: record.date,
      status: record.status,
      timestamp: record.timestamp,
      location: record.location || null,
      remarks: record.remarks || null,
      markingMethod: record.markingMethod || null,
      userType: record.userType || null,
      calendarDayId: record.calendarDayId || null,
      eventId: record.eventId || null,
    };
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
    const allRecords = this.syncConfigService.isMysqlOnly()
      ? await this.mysqlAttendanceService.getStudentAttendance(
          studentId,
          getStudentAttendanceDto.instituteId,
          startDate,
          endDate
        )
      : await this.dynamoAttendanceService.getStudentAttendance(
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
    const presentAbsent = totalPresent + totalAbsent;
    const attendanceRate = presentAbsent > 0 ? parseFloat(((totalPresent / presentAbsent) * 100).toFixed(2)) : 0;

    // Transform records to response format
    const data = paginatedRecords.map(record => ({
      attendanceId: `${record.instituteId}-${record.studentId}-${record.date}`,
      studentId: record.studentId,
      studentName: record.studentName,
      studentImageUrl: record.studentImageUrl
        ? this.CloudStorageService.getFullUrl(record.studentImageUrl)
        : null,
      instituteName: record.instituteName,
      className: record.className,
      subjectName: record.subjectName,
      address: (record as any).address,  // ✅ CONSOLIDATED: Include address object with lat/lng
      location: record.location || this.generateAddress(record.instituteName, record.className, record.subjectName),
      latitude: (record as any).address?.latitude,  // ✅ CONSOLIDATED: Extract from address for backward compatibility
      longitude: (record as any).address?.longitude,  // ✅ CONSOLIDATED: Extract from address for backward compatibility
      markedBy: 'system',
      markedAt: (record as any).timestamp ? new Date((record as any).timestamp).toISOString() : record.date,
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
        select: ['id', 'firstName', 'lastName', 'nameWithInitials', 'imageUrl', 'rfid', 'rfidCardStatus', 'rfidExpiryDate', 'cardId', 'cardStatus', 'cardExpiryDate']
      });
      cardType = 'rfid';
    } else {
      // QR/Barcode scan → look up by cardId column first, fallback to rfid
      user = await this.userRepository.findOne({
        where: { cardId: studentCardId },
        select: ['id', 'firstName', 'lastName', 'nameWithInitials', 'imageUrl', 'rfid', 'rfidCardStatus', 'rfidExpiryDate', 'cardId', 'cardStatus', 'cardExpiryDate']
      });
      cardType = 'normal';

      // Fallback: try rfid if not found by cardId (backward compatibility)
      if (!user) {
        user = await this.userRepository.findOne({
          where: { rfid: studentCardId },
          select: ['id', 'firstName', 'lastName', 'nameWithInitials', 'imageUrl', 'rfid', 'rfidCardStatus', 'rfidExpiryDate', 'cardId', 'cardStatus', 'cardExpiryDate']
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
      studentName: user.nameWithInitials || `${user.firstName} ${user.lastName || ''}`.trim(),
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
        select: ['id', 'firstName', 'lastName', 'nameWithInitials', 'rfid', 'rfidCardStatus', 'rfidExpiryDate', 'imageUrl', 'cardId', 'cardStatus', 'cardExpiryDate']
      });
      cardType = 'rfid';
    } else {
      users = await this.userRepository.find({
        where: cardIds.map(cardId => ({ cardId: cardId })),
        select: ['id', 'firstName', 'lastName', 'nameWithInitials', 'rfid', 'rfidCardStatus', 'rfidExpiryDate', 'imageUrl', 'cardId', 'cardStatus', 'cardExpiryDate']
      });
      cardType = 'normal';

      // Fallback: if nothing found by cardId, try rfid (backward compat)
      if (users.length === 0) {
        users = await this.userRepository.find({
          where: cardIds.map(cardId => ({ rfid: cardId })),
          select: ['id', 'firstName', 'lastName', 'nameWithInitials', 'rfid', 'rfidCardStatus', 'rfidExpiryDate', 'imageUrl', 'cardId', 'cardStatus', 'cardExpiryDate']
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
            userName: user.nameWithInitials || `${user.firstName} ${user.lastName || ''}`.trim(),
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
          studentName: user.nameWithInitials || `${user.firstName} ${user.lastName || ''}`.trim(),
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
        select: ['id', 'firstName', 'lastName', 'nameWithInitials', 'imageUrl', 'rfid', 'rfidCardStatus', 'rfidExpiryDate', 'cardId', 'cardStatus', 'cardExpiryDate']
      });
      let cardType: 'rfid' | 'normal' = 'normal';

      if (!user) {
        user = await this.userRepository.findOne({
          where: { rfid: studentCardId },
          select: ['id', 'firstName', 'lastName', 'nameWithInitials', 'imageUrl', 'rfid', 'rfidCardStatus', 'rfidExpiryDate', 'cardId', 'cardStatus', 'cardExpiryDate']
        });
        cardType = 'rfid';
      }

      if (!user) {
        throw new Error(`Student not found with card ID: ${studentCardId}`);
      }

      // Get attendance for the actual student ID
      const records = this.syncConfigService.isMysqlOnly()
        ? await this.mysqlAttendanceService.getStudentAttendance(
            user.id.toString(),
            '', // Institute ID needed
            startDate,
            endDate
          )
        : await this.dynamoAttendanceService.getStudentAttendance(
            user.id.toString(),
            '', // Institute ID needed
            startDate,
            endDate
          );

      const totalRecords = records.length;
      const totalPages = Math.ceil(totalRecords / limit);
      const startIndex = (page - 1) * limit;
      const paginatedRecords = records.slice(startIndex, startIndex + limit);

      // ✅ Enrich records with images (uses DynamoDB image first, then institute/global images)
      const enrichedRecords = await this.enrichAttendanceRecordsWithImages(paginatedRecords, '');

      const currentCardStatus = cardType === 'rfid' ? user.rfidCardStatus : user.cardStatus;
      const currentCardExpiry = cardType === 'rfid' ? user.rfidExpiryDate : user.cardExpiryDate;

      return {
        success: true,
        message: 'Card attendance retrieved successfully',
        studentInfo: {
          studentId: user.id.toString(),
          studentCardId: studentCardId,
          studentName: user.nameWithInitials || `${user.firstName} ${user.lastName || ''}`.trim(),
          nameWithInitials: user.nameWithInitials || undefined
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
        data: enrichedRecords.map(record => ({
          attendanceId: `${record.instituteId}-${record.studentId}-${record.date}`,
          studentId: record.studentId,
          studentCardId: studentCardId,
          studentName: record.studentName,
          studentImageUrl: record.studentImageUrl || record.imageUrl || null,
          instituteName: record.instituteName,
          className: record.className,
          subjectName: record.subjectName,
          address: record.location,
          markedAt: (record as any).timestamp ? new Date((record as any).timestamp).toISOString() : record.date,
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
    const dbService = this.syncConfigService.isMysqlOnly()
      ? this.mysqlAttendanceService
      : this.dynamoAttendanceService;
    const summary = await dbService.getAttendanceSummary(
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
    const records = this.syncConfigService.isMysqlOnly()
      ? await this.mysqlAttendanceService.getAttendanceByDate(instituteId, date)
      : await this.dynamoAttendanceService.getAttendanceByDate(instituteId, date);

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
    const records = this.syncConfigService.isMysqlOnly()
      ? await this.mysqlAttendanceService.getAttendanceByEvent(instituteId, eventId, date)
      : await this.dynamoAttendanceService.getAttendanceByEvent(instituteId, eventId, date);
    const enriched = await this.enrichAttendanceRecordsWithImages(records, instituteId);
    return {
      success: true,
      message: 'Event attendance retrieved successfully',
      eventId,
      date: date || null,
      totalRecords: enriched.length,
      data: enriched,
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
    const records = this.syncConfigService.isMysqlOnly()
      ? await this.mysqlAttendanceService.getAttendanceByCalendarDay(instituteId, calendarDayId, userType)
      : await this.dynamoAttendanceService.getAttendanceByCalendarDay(instituteId, calendarDayId, userType);
    const enrichedRecords = await this.enrichAttendanceRecordsWithImages(records, instituteId);
    return {
      success: true,
      message: 'Calendar day attendance retrieved successfully',
      calendarDayId,
      userType: userType || 'ALL',
      totalRecords: enrichedRecords.length,
      data: enrichedRecords,
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
    const records = this.syncConfigService.isMysqlOnly()
      ? await this.mysqlAttendanceService.getAttendanceByUserType(instituteId, userType, date, eventId, classId, subjectId)
      : await this.dynamoAttendanceService.getAttendanceByUserType(instituteId, userType, date, eventId, classId, subjectId);
    const enrichedRecords = await this.enrichAttendanceRecordsWithImages(records, instituteId);
    return {
      success: true,
      message: 'User type attendance retrieved successfully',
      userType,
      date: date || null,
      eventId: eventId || null,
      classId: classId || null,
      subjectId: subjectId || null,
      totalRecords: enrichedRecords.length,
      data: enrichedRecords,
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
    const records = this.syncConfigService.isMysqlOnly()
      ? await this.mysqlAttendanceService.getStudentAttendanceByEvent(studentId, instituteId, eventId, startDate, endDate)
      : await this.dynamoAttendanceService.getStudentAttendanceByEvent(
          studentId, instituteId, eventId, startDate, endDate
        );
    const enriched = await this.enrichAttendanceRecordsWithImages(records, instituteId);
    return {
      success: true,
      message: 'Student event attendance retrieved successfully',
      studentId,
      eventId,
      totalRecords: enriched.length,
      data: enriched,
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
    const dbService = this.syncConfigService.isMysqlOnly()
      ? this.mysqlAttendanceService
      : this.dynamoAttendanceService;
    const summary = await dbService.getAttendanceSummary(
      instituteId,
      undefined, // classId
      undefined, // subjectId
      startDate,
      endDate,
      undefined, // limit
      true       // includeRecords
    );

    // Filter by status and studentId if provided
    let filteredRecords = summary.records || [];
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
    const enrichedRecords = await this.enrichAttendanceRecordsWithImages(paginatedRecords, instituteId);

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
      data: enrichedRecords,
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
    
    const dbService = this.syncConfigService.isMysqlOnly()
      ? this.mysqlAttendanceService
      : this.dynamoAttendanceService;
    const summary = await dbService.getAttendanceSummary(
      instituteId,
      classId,
      undefined, // subjectId
      startDate,
      endDate,
      undefined, // limit
      true       // includeRecords
    );

    // Filter by status and studentId if provided
    let filteredRecords = summary.records || [];
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
    const enrichedRecords = await this.enrichAttendanceRecordsWithImages(paginatedRecords, instituteId);

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
      data: enrichedRecords,
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
    
    const dbService = this.syncConfigService.isMysqlOnly()
      ? this.mysqlAttendanceService
      : this.dynamoAttendanceService;
    const summary = await dbService.getAttendanceSummary(
      instituteId,
      classId, // Pass the actual classId instead of undefined
      subjectId,
      startDate,
      endDate,
      undefined, // limit
      true       // includeRecords
    );
    
    // Filter by status and studentId if provided
    let filteredRecords = summary.records || [];
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
    const enrichedRecords = await this.enrichAttendanceRecordsWithImages(paginatedRecords, instituteId);

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
      data: enrichedRecords,
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

  // ─────────────────────────────────────────────────────────────────────────
  // MONTHLY ATTENDANCE COUNT APIs
  // ─────────────────────────────────────────────────────────────────────────

  async getInstituteMonthlyCount(instituteId: string, year: number, month: number): Promise<any> {
    const dbService = this.syncConfigService.isMysqlOnly()
      ? this.mysqlAttendanceService
      : this.dynamoAttendanceService;
    const counts = await dbService.getMonthlyAttendanceCount(instituteId, year, month);
    return {
      success: true,
      message: 'Institute monthly attendance count retrieved successfully',
      instituteId,
      year,
      month,
      ...counts,
    };
  }

  async getClassMonthlyCount(instituteId: string, classId: string, year: number, month: number): Promise<any> {
    const dbService = this.syncConfigService.isMysqlOnly()
      ? this.mysqlAttendanceService
      : this.dynamoAttendanceService;
    const counts = await dbService.getMonthlyAttendanceCount(instituteId, year, month, classId);
    return {
      success: true,
      message: 'Class monthly attendance count retrieved successfully',
      instituteId,
      classId,
      year,
      month,
      ...counts,
    };
  }

  async getSubjectMonthlyCount(instituteId: string, classId: string, subjectId: string, year: number, month: number): Promise<any> {
    const dbService = this.syncConfigService.isMysqlOnly()
      ? this.mysqlAttendanceService
      : this.dynamoAttendanceService;
    const counts = await dbService.getMonthlyAttendanceCount(instituteId, year, month, classId, subjectId);
    return {
      success: true,
      message: 'Subject monthly attendance count retrieved successfully',
      instituteId,
      classId,
      subjectId,
      year,
      month,
      ...counts,
    };
  }

  async getInstituteDailyCount(instituteId: string, year: number, month: number): Promise<any> {
    const dbService = this.syncConfigService.isMysqlOnly()
      ? this.mysqlAttendanceService
      : this.dynamoAttendanceService;
    const days = await dbService.getDailyAttendanceCount(instituteId, year, month);
    return {
      success: true,
      message: 'Institute daily attendance count retrieved successfully',
      instituteId,
      year,
      month,
      days,
    };
  }

  async getClassDailyCount(instituteId: string, classId: string, year: number, month: number): Promise<any> {
    const dbService = this.syncConfigService.isMysqlOnly()
      ? this.mysqlAttendanceService
      : this.dynamoAttendanceService;
    const days = await dbService.getDailyAttendanceCount(instituteId, year, month, classId);
    return {
      success: true,
      message: 'Class daily attendance count retrieved successfully',
      instituteId,
      classId,
      year,
      month,
      days,
    };
  }

  async getSubjectDailyCount(instituteId: string, classId: string, subjectId: string, year: number, month: number): Promise<any> {
    const dbService = this.syncConfigService.isMysqlOnly()
      ? this.mysqlAttendanceService
      : this.dynamoAttendanceService;
    const days = await dbService.getDailyAttendanceCount(instituteId, year, month, classId, subjectId);
    return {
      success: true,
      message: 'Subject daily attendance count retrieved successfully',
      instituteId,
      classId,
      subjectId,
      year,
      month,
      days,
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
      const normalizedPlan = String(data.subscriptionPlan || 'FREE').toUpperCase();
      const packageConfig = NOTIFICATION_PACKAGES_CONFIG.packages[normalizedPlan] || NOTIFICATION_PACKAGES_CONFIG.packages.FREE;
      const isAdsEnabled = this.adsDeliveryEnabled && packageConfig?.isAds === true;
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
        studentName: data.student.user.nameWithInitials || `${data.student.user.firstName} ${data.student.user.lastName || ''}`.trim(),
        parentName: data.primaryParent ? 
          (data.primaryParent.nameWithInitials || `${data.primaryParent.firstName} ${data.primaryParent.lastName || ''}`.trim()) : 
          'Parent/Guardian',
        parentContact: data.parentContact,
        parentEmail: data.parentEmail,
        parentTelegramId: data.parentTelegramId,
        parentUserId: data.parentUserId,
        instituteId: markAttendanceDto.instituteId,
        attendanceId: attendanceResult?.id || undefined,
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
        firstLoginCompleted: data.primaryParent?.firstLoginCompleted ?? false,
        advertisementData
      };

      const notificationResult = await this.attendanceNotificationService.sendAttendanceNotification(notificationData);

      // ✅ BUG-B FIX: Only increment currentSendings AFTER successful delivery
      if (this.shouldTrackAdvertisementSending(advertisementData) && notificationResult.successfulChannels > 0) {
        this.advertisementRepository.increment(
          { id: advertisementData.id },
          'currentSendings',
          1
        ).catch(err => this.logger.error(`Failed to increment ad sendings: ${err.message}`));
      }

      // ✅ Store matched advertisement ID on the attendance record for delivery tracking
      if (advertisementData?.id && advertisementData.id !== 'default-company-ad' && advertisementData.id !== 'default-fallback' && attendanceResult?.id) {
        this.dynamoAttendanceService.patchAdvertisementId(attendanceResult.id, advertisementData.id)
          .catch(err => this.logger.warn(`Failed to patch advertisementId: ${err.message}`));
      }

      // ✅ SELF-NOTIFICATION: Send notification to the student themselves
      await this.sendSelfAttendanceNotification(markAttendanceDto, data.student?.user);
      
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
    // Also allow when only FCM push is configured (Firebase Admin SDK initialised)
    const hasFcm = this.attendanceNotificationService.isPushReady();

    // We need at least one notification channel configured
    return hasWhatsApp || hasTelegram || hasEmail || hasFcm;
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
    firstLoginCompleted?: boolean;
    subscriptionPlan: string;
    attendanceDto: MarkAttendanceDto;
    isAdsFromDB: boolean;
    studentData: any;  // Complete student data with user profile
    instituteId: string;  // Institute ID for ad targeting
    attendanceId?: string; // Encoded DynamoDB record ID for deep-link
  }): Promise<void> {
    try {
      const {
        studentId,
        studentName,
        parentContact,
        parentEmail,
        parentTelegramId,
        parentUserId,
        firstLoginCompleted,
        subscriptionPlan,
        attendanceDto,
        isAdsFromDB,
        studentData,
        instituteId,
        attendanceId,
      } = params;

      // Check if we have at least one contact method
      if (!parentContact && !parentEmail && !parentTelegramId) {
        return;
      }

      // Check if this subscription plan should receive ads
      const normalizedPlan = String(subscriptionPlan || 'FREE').toUpperCase();
      const packageConfig = NOTIFICATION_PACKAGES_CONFIG.packages[normalizedPlan] || NOTIFICATION_PACKAGES_CONFIG.packages.FREE;
      const shouldReceiveAds = this.adsDeliveryEnabled && packageConfig?.isAds === true;
      
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
        instituteId,
        attendanceId: attendanceId || undefined,
        attendanceStatus: (attendanceDto.status === AttendanceStatus.PRESENT ? 'PRESENT' : 'ABSENT') as 'PRESENT' | 'ABSENT',
        date: attendanceDto.date,
        time: formatSriLankaTime(now()),
        location: attendanceDto.location || null,
        instituteName: attendanceDto.instituteName || null,
        className: attendanceDto.className || null,
        subjectName: attendanceDto.subjectName || null,
        attendanceType: (attendanceDto.subjectName ? 'SUBJECT' : (attendanceDto.className ? 'CLASS' : 'INSTITUTE')) as 'SUBJECT' | 'CLASS' | 'INSTITUTE',
        vehicleNumber: null,
        bookhireName: null,
        subscriptionPlan,
        firstLoginCompleted: firstLoginCompleted ?? false,
        advertisementData
      };

      // 🚀 Send notification immediately (fire-and-forget)
      const notificationResult = await this.attendanceNotificationService.sendAttendanceNotification(notificationData);

      // ✅ BUG-B FIX: Only increment currentSendings AFTER successful delivery
      if (this.shouldTrackAdvertisementSending(advertisementData) && notificationResult.successfulChannels > 0) {
        this.advertisementRepository.increment(
          { id: advertisementData.id },
          'currentSendings',
          1
        ).catch(err => this.logger.error(`Failed to increment ad sendings: ${err.message}`));
      }

      // ✅ Store matched advertisement ID on the attendance record for delivery tracking
      if (advertisementData?.id && advertisementData.id !== 'default-company-ad' && advertisementData.id !== 'default-fallback' && attendanceId) {
        this.dynamoAttendanceService.patchAdvertisementId(attendanceId, advertisementData.id)
          .catch(err => this.logger.warn(`Failed to patch advertisementId: ${err.message}`));
      }

      // ✅ SELF-NOTIFICATION: Send notification to the student themselves
      await this.sendSelfAttendanceNotification(attendanceDto, studentData?.user);
      
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
      const studentName = studentData.user?.nameWithInitials || `${studentData.user?.firstName || ''} ${studentData.user?.lastName || ''}`.trim();
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
      const cascadeResults = await Promise.allSettled(allParents.map(async (parent) => {
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
            parentUserId: parentUser.id || null,
            instituteId: attendanceDto.instituteId,
            attendanceStatus: (attendanceDto.status === AttendanceStatus.PRESENT ? 'PRESENT' : 'ABSENT') as 'PRESENT' | 'ABSENT',
            date: attendanceDto.date,
            time: formatSriLankaTime(now()),
            vehicleNumber: null,
            bookhireName: null,
            subscriptionPlan: parentSubscriptionPlan,
            advertisementData: advertisementData  // 🎯 SAME ad for ALL parents
          };

          // Send notification (fire-and-forget)
          const result = await this.attendanceNotificationService.sendAttendanceNotification(notificationData);

          if (result.successfulChannels > 0) {
            return true;
          }

          return false;
          
        } catch (error) {
          this.logger.error(`❌ Failed to cascade ad to ${parent.type}: ${error.message}`);
          // Continue with other parents
          return false;
        }
      }));

      // Track successful cascade deliveries so campaign caps remain accurate.
      const successfulCascadeDeliveries = cascadeResults.reduce((count, item) => {
        if (item.status === 'fulfilled' && item.value === true) {
          return count + 1;
        }
        return count;
      }, 0);

      if (this.shouldTrackAdvertisementSending(advertisementData) && successfulCascadeDeliveries > 0) {
        this.advertisementRepository.increment(
          { id: advertisementData.id },
          'currentSendings',
          successfulCascadeDeliveries
        ).catch(err => this.logger.error(`Failed to increment cascade ad sendings: ${err.message}`));
      }

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
        birthYear: studentData.user.dateOfBirth
          ? new Date(studentData.user.dateOfBirth).getFullYear()
          : null,
        gender: studentData.user.gender || null,
        occupation: null  // No occupation column on user entity
      };

      // Use sophisticated multi-factor matching service
      const matches = await this.advertisementMatchingService.findMostMatchingAdvertisements(
        userProfile,
        1  // Get only the BEST match
      );

      if (matches.length > 0) {
        const bestMatch = matches[0];
        const advertisement = bestMatch.advertisement;

        // ✅ BUG-B FIX: currentSendings increment moved to AFTER successful notification delivery
        // (see sendImmediateNotification and sendAttendanceNotificationWithAdvertising)

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
   * 🔔 SELF-NOTIFICATION: Send a push notification to the person whose attendance was marked.
   * If "I" mark attendance and I am the student, I should also receive "Your attendance marked" notification.
   * Fire-and-forget — never blocks the response.
   */
  private async sendSelfAttendanceNotification(
    attendanceDto: MarkAttendanceDto,
    userData?: any,
  ): Promise<void> {
    try {
      if (!this.attendanceNotificationService.isPushReady()) return;
      if (!userData?.id) return;

      const userId = String(userData.id);
      const statusLabel = attendanceDto.status === AttendanceStatus.PRESENT ? 'Present'
        : attendanceDto.status === AttendanceStatus.ABSENT ? 'Absent'
        : attendanceDto.status === AttendanceStatus.LATE ? 'Late'
        : String(attendanceDto.status);

      const locationParts = [
        attendanceDto.instituteName,
        attendanceDto.className,
        attendanceDto.subjectName,
      ].filter(Boolean);
      const locationStr = locationParts.length > 0 ? ` at ${locationParts.join(' / ')}` : '';
      const timeStr = formatSriLankaTime(now());

      const title = `✅ Attendance Marked`;
      const body = `Your attendance was marked as ${statusLabel}${locationStr} at ${timeStr} on ${attendanceDto.date}.`;

      // Use FCM service directly for a lightweight push to the user's own device tokens
      const tokens = await this.getUserFcmTokens(userId);
      if (tokens.length === 0) return;

      await this.fcmNotificationService.sendToMultipleDevices(
        tokens,
        { title, body },
        {
          type: 'SELF_ATTENDANCE',
          studentId: attendanceDto.studentId,
          instituteId: attendanceDto.instituteId,
          status: attendanceDto.status,
          date: attendanceDto.date,
        },
      );
    } catch (error) {
      this.logger.warn(`Self-notification failed (non-blocking): ${error.message}`);
    }
  }

  /**
   * Helper: Get FCM tokens for a user (lightweight query)
   */
  private async getUserFcmTokens(userId: string): Promise<string[]> {
    try {
      const result = await this.dataSource.query(
        `SELECT token FROM user_fcm_tokens WHERE user_id = ? AND is_active = 1 LIMIT 10`,
        [userId],
      );
      return (result || []).map((r: any) => r.token).filter(Boolean);
    } catch {
      return [];
    }
  }

  private shouldTrackAdvertisementSending(advertisementData: any): boolean {
    const adId = advertisementData?.id;
    if (!adId || typeof adId !== 'string') {
      return false;
    }

    // Fallback/default IDs are not persisted campaign rows, so they must not be counted.
    return !adId.startsWith('default-');
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
            lastName: true,
            nameWithInitials: true
          }
        }
      });

      // Build map of studentId -> nameWithInitials (fallback to full name)
      for (const student of students) {
        if (student.user) {
          const name = student.user.nameWithInitials || `${student.user.firstName} ${student.user.lastName}`.trim();
          studentNamesMap.set(student.userId, name);
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
            nameWithInitials: true,
            email: true,
            phoneNumber: true,
            subscriptionPlan: true,
            telegramId: true,
            imageUrl: true,
            // Required for advertisement targeting
            userType: true,
            dateOfBirth: true,
            gender: true,
            city: true,
            district: true,
            province: true,
          },
          father: {
            userId: true,
            user: {
              id: true,
              firstName: true,
              lastName: true,
              nameWithInitials: true,
              email: true,
              phoneNumber: true,
              telegramId: true,
              firstLoginCompleted: true
            }
          },
          mother: {
            userId: true,
            user: {
              id: true,
              firstName: true,
              lastName: true,
              nameWithInitials: true,
              email: true,
              phoneNumber: true,
              telegramId: true,
              firstLoginCompleted: true
            }
          },
          guardian: {
            userId: true,
            user: {
              id: true,
              firstName: true,
              lastName: true,
              nameWithInitials: true,
              email: true,
              phoneNumber: true,
              telegramId: true,
              firstLoginCompleted: true
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
          nameWithInitials: true,
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
      nameWithInitials: instituteUser.user?.nameWithInitials || undefined,
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
        'user.nameWithInitials',
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
    let notificationName: string = '';
    let globalImageUrl: string | null = null;
    let subscriptionPlan = 'FREE';
    let parentContact: string | null = null;
    let parentEmail: string | null = null;
    let parentTelegramId: string | null = null;
    let parentUserId: string | null = null;
    let parentFirstLoginCompleted: boolean = false;
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
          'user.id', 'user.firstName', 'user.lastName', 'user.nameWithInitials', 'user.email', 'user.phoneNumber',
          'user.subscriptionPlan', 'user.telegramId', 'user.imageUrl',
          'father.userId', 'fatherUser.firstName', 'fatherUser.lastName',
          'fatherUser.email', 'fatherUser.phoneNumber', 'fatherUser.telegramId', 'fatherUser.firstLoginCompleted',
          'mother.userId', 'motherUser.firstName', 'motherUser.lastName',
          'motherUser.email', 'motherUser.phoneNumber', 'motherUser.telegramId', 'motherUser.firstLoginCompleted',
          'guardian.userId', 'guardianUser.firstName', 'guardianUser.lastName',
          'guardianUser.email', 'guardianUser.phoneNumber', 'guardianUser.telegramId', 'guardianUser.firstLoginCompleted'
        ])
        .getOne();

      if (!studentData?.user) {
        throw new Error(`Student not found with ID: ${instituteUser.userId}`);
      }

      userName = studentData.user.nameWithInitials || `${studentData.user.firstName} ${studentData.user.lastName}`.trim();
      // Use nameWithInitials for notification display name
      notificationName = userName;
      globalImageUrl = studentData.user.imageUrl || null;
      subscriptionPlan = studentData.user.subscriptionPlan || 'FREE';

      // Extract parent info (Priority: Father → Mother → Guardian)
      if (studentData.father?.user) {
        parentContact = studentData.father.user.phoneNumber || null;
        parentEmail = studentData.father.user.email || null;
        parentTelegramId = studentData.father.user.telegramId || null;
        parentUserId = studentData.father.userId || null;
        parentFirstLoginCompleted = studentData.father.user.firstLoginCompleted ?? false;
      } else if (studentData.mother?.user) {
        parentContact = studentData.mother.user.phoneNumber || null;
        parentEmail = studentData.mother.user.email || null;
        parentTelegramId = studentData.mother.user.telegramId || null;
        parentUserId = studentData.mother.userId || null;
        parentFirstLoginCompleted = studentData.mother.user.firstLoginCompleted ?? false;
      } else if (studentData.guardian?.user) {
        parentContact = studentData.guardian.user.phoneNumber || null;
        parentEmail = studentData.guardian.user.email || null;
        parentTelegramId = studentData.guardian.user.telegramId || null;
        parentUserId = studentData.guardian.userId || null;
        parentFirstLoginCompleted = studentData.guardian.user.firstLoginCompleted ?? false;
      }
    } else {
      // NON-STUDENT path: Use user data already loaded from institute_user query
      if (!instituteUser.user) {
        throw new Error(`User not found with ID: ${instituteUser.userId}`);
      }
      userName = instituteUser.user.nameWithInitials || `${instituteUser.user.firstName} ${instituteUser.user.lastName || ''}`.trim();
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
      studentImageUrl: finalImageUrl ? this.CloudStorageService.getFullUrl(finalImageUrl) : undefined,
      instituteId: markAttendanceDto.instituteId,
      instituteName: markAttendanceDto.instituteName,
      classId: markAttendanceDto.classId || 'default',
      className: markAttendanceDto.className || '',
      subjectId: markAttendanceDto.subjectId || '',
      subjectName: markAttendanceDto.subjectName || '',
      status: markAttendanceDto.status,
      markingMethod: markAttendanceDto.markingMethod,
      userType: detectedUserType,  // ✅ Auto-detected user type
      date: getCurrentSriLankaDate(),
      location: markAttendanceDto.location || this.generateAddress(
        markAttendanceDto.instituteName,
        markAttendanceDto.className,
        markAttendanceDto.subjectName
      )
    };

    // ✅ STEP 6: Mark attendance based on database mode
    const isMysqlOnlyMode = this.syncConfigService.isMysqlOnly();
    let result: any;

    if (isMysqlOnlyMode) {
      // MySQL-only mode: write directly to MySQL, no DynamoDB
      result = await this.mysqlAttendanceService.markAttendance(attendanceDto);
    } else {
      // Both mode: write to DynamoDB first, then sync to MySQL
      result = await this.dynamoAttendanceService.markAttendance(attendanceDto);

      // ✅ STEP 6.5: Sync to MySQL based on system-wide sync mode
      try {
        const syncMode = this.syncConfigService.getSyncModeSync();
        if (syncMode === AttendanceSyncMode.IMMEDIATE) {
          await this.syncSchedulerService.syncFromDto(attendanceDto);
        } else if (syncMode === AttendanceSyncMode.DYNAMO_FIRST) {
          this.syncSchedulerService.syncFromDtoAsync(attendanceDto);
        }
      } catch (syncErr) {
        this.logger.warn(`Card attendance MySQL sync skipped: ${syncErr.message}`);
      }
    }

    // ✅ STEP 7: Send notifications ONLY for students (non-blocking)
    if (isStudent && (parentContact || parentEmail || parentTelegramId)) {
      const isAdsFromDB = this.configService.get<string>('IS_ADS_FROM_DB') === 'true';
      
      this.sendImmediateNotification({
        studentId,
        studentName: notificationName,
        parentContact,
        parentEmail,
        parentTelegramId,
        parentUserId,
        firstLoginCompleted: parentFirstLoginCompleted,
        subscriptionPlan,
        attendanceDto,
        isAdsFromDB,
        studentData,
        instituteId: markAttendanceDto.instituteId,
        attendanceId: result?.id || undefined,
      }).catch(error => {
        this.logger.error(`Notification failed for user ${studentId}: ${error.message}`);
      });
    }

    // ✅ STEP 8: Return response with user type info
    return {
      success: true,
      message: 'Attendance marked successfully using institute card',
      imageUrl: finalImageUrl ? this.CloudStorageService.getFullUrl(finalImageUrl) : null,
      isInstituteImage: isVerified && !!instituteUser.instituteUserImageUrl,
      imageVerificationStatus: instituteUser.imageVerificationStatus,
      status: markAttendanceDto.status,
      name: userName,
      nameWithInitials: (isStudent ? studentData?.user?.nameWithInitials : instituteUser.user?.nameWithInitials) || null,
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

  // ─────────────────────────────────────────────────────────────────────────────
  // MY ATTENDANCE HISTORY — self-service, enriched with institute + class details
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Returns the calling user's own attendance history from DynamoDB.
   * Enriches each record with up-to-date institute name/logo and class name
   * fetched from MySQL (with an in-request in-memory cache to avoid N+1 queries).
   *
   * Strategy:
   *  1. Fetch all DynamoDB records for this student via GSI (across all institutes).
   *  2. Collect unique instituteId + classId pairs from the records.
   *  3. Bulk-fetch those from MySQL in two queries (institutes + classes).
   *  4. Overwrite the DynamoDB-stored names with the live DB values.
   *  5. Paginate and return with summary + per-institute breakdown.
   */
  async getMyAttendance(userId: string, query: MyAttendanceQueryDto, childrenIds: string[] = []): Promise<MyAttendanceResponseDto> {
    const { page = 1, limit = 30, status, instituteId: filterInstituteId, child = false } = query;

    // Determine which user IDs to fetch (self + optional children)
    const userIdsToFetch = [userId];
    if (child && childrenIds && childrenIds.length > 0) {
      userIdsToFetch.push(...childrenIds);
    }

    // Default date range: last 30 days → today
    const today = getCurrentSriLankaDate();
    const defaultStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const startDate = query.startDate || defaultStart;
    const endDate = query.endDate || today;

    // 1. Fetch attendance for all user IDs (self + children) in parallel
    const isMysqlOnly = this.syncConfigService.isMysqlOnly();
    const allRecordsByUserId = await Promise.all(
      userIdsToFetch.map(uid =>
        isMysqlOnly
          ? this.mysqlAttendanceService.getStudentAttendanceAllInstitutes(uid, startDate, endDate)
          : this.dynamoAttendanceService.getStudentAttendanceAllInstitutes(uid, startDate, endDate)
      )
    );

    // Flatten all records
    let rawRecords = allRecordsByUserId.flat();

    // Optional: filter by a specific institute
    if (filterInstituteId) {
      rawRecords = rawRecords.filter(r => String(r.instituteId) === String(filterInstituteId));
    }

    // Optional: filter by status
    if (status) {
      rawRecords = rawRecords.filter(r => r.status === status);
    }

    // Sort newest first (DynamoDB GSI returns newest first already, but re-sort after filter)
    rawRecords.sort((a, b) => ((b as any).timestamp || 0) - ((a as any).timestamp || 0));

    // 2. Collect unique IDs for enrichment
    const uniqueClassIds = [...new Set(rawRecords.map(r => r.classId && String(r.classId)).filter(Boolean) as string[])];
    const uniqueStudentIds = [...new Set(rawRecords.map(r => String(r.studentId)))];
    const uniqueInstituteIds = [...new Set(rawRecords.map(r => String(r.instituteId)))];

    // 3. Bulk-fetch from DB: classes, user profiles (for images), institutes (for logos)
    const [classes, users, institutes] = await Promise.all([
      uniqueClassIds.length
        ? this.classRepository.find({
            where: { id: In(uniqueClassIds) as any },
            select: ['id', 'name'],
          })
        : Promise.resolve([]),
      uniqueStudentIds.length
        ? this.userRepository.find({
            where: { id: In(uniqueStudentIds) as any },
            select: ['id', 'imageUrl'],
          })
        : Promise.resolve([]),
      uniqueInstituteIds.length
        ? this.instituteRepository.find({
            where: { id: In(uniqueInstituteIds) as any },
            select: ['id', 'logoUrl'],
          })
        : Promise.resolve([]),
    ]);

    // 4. Build lookup maps
    const classMap = new Map(classes.map(c => [String(c.id), c]));
    const userImageMap = new Map(users.map(u => [String(u.id), u.imageUrl]));
    const instituteLogoMap = new Map(institutes.map(i => [String(i.id), i.logoUrl]));

    // 5. Enrich and build summary + per-institute breakdown
    const byInstitute: Record<string, { instituteName: string; instituteLogoUrl?: string; totalPresent: number; totalAbsent: number; totalLate: number; totalLeft: number; totalLeftEarly: number; totalLeftLately: number; attendanceRate: number }> = {};
    const byStudent: Record<string, { studentName: string; studentImageUrl?: string; totalRecords: number; totalPresent: number; totalAbsent: number; totalLate: number; totalLeft: number; totalLeftEarly: number; totalLeftLately: number; attendanceRate: number }> = {};
    let totalPresent = 0, totalAbsent = 0, totalLate = 0, totalLeft = 0, totalLeftEarly = 0, totalLeftLately = 0;

    const statusLabels: Record<string, string> = {
      [AttendanceStatus.PRESENT]: 'Present',
      [AttendanceStatus.ABSENT]:  'Absent',
      [AttendanceStatus.LATE]:    'Late',
      [AttendanceStatus.LEFT]:    'Left',
      [AttendanceStatus.LEFT_EARLY]:   'Left Early',
      [AttendanceStatus.LEFT_LATELY]:  'Left Lately',
    };

    const enriched: MyAttendanceRecordDto[] = rawRecords.map(r => {
      const iid = String(r.instituteId);
      const cid = r.classId ? String(r.classId) : undefined;
      const sid = String(r.studentId);
      const dbClass = cid ? classMap.get(cid) : undefined;

      const instituteName = r.instituteName || iid;
      const className     = dbClass?.name   || r.className || undefined;
      const studentName   = r.studentName;

      // Resolve student image: prefer record-level (stored at marking), fall back to user profile
      const rawStudentImg = (r as any).studentImageUrl || (r as any).imageUrl;
      const studentImageRaw = rawStudentImg || userImageMap.get(sid);
      const studentImageUrl = studentImageRaw ? this.CloudStorageService.getFullUrl(studentImageRaw) : undefined;

      // Resolve institute logo from MySQL institute table
      const rawLogo = instituteLogoMap.get(iid);
      const instituteLogoUrl = rawLogo ? this.CloudStorageService.getFullUrl(rawLogo) : undefined;

      // Summary counters - by institute
      if (!byInstitute[iid]) {
        byInstitute[iid] = { instituteName, instituteLogoUrl, totalPresent: 0, totalAbsent: 0, totalLate: 0, totalLeft: 0, totalLeftEarly: 0, totalLeftLately: 0, attendanceRate: 0 };
      }
      
      // Summary counters - by student (when children included)
      if (child && childrenIds.includes(sid)) {
        if (!byStudent[sid]) {
          byStudent[sid] = { studentName, studentImageUrl, totalRecords: 0, totalPresent: 0, totalAbsent: 0, totalLate: 0, totalLeft: 0, totalLeftEarly: 0, totalLeftLately: 0, attendanceRate: 0 };
        }
        byStudent[sid].totalRecords++;
      }

      // Status counters
      if (r.status === AttendanceStatus.PRESENT)       { totalPresent++;    byInstitute[iid].totalPresent++; if (byStudent[sid]) byStudent[sid].totalPresent++; }
      else if (r.status === AttendanceStatus.ABSENT)   { totalAbsent++;     byInstitute[iid].totalAbsent++; if (byStudent[sid]) byStudent[sid].totalAbsent++; }
      else if (r.status === AttendanceStatus.LATE)     { totalLate++;       byInstitute[iid].totalLate++; if (byStudent[sid]) byStudent[sid].totalLate++; }
      else if (r.status === AttendanceStatus.LEFT)     { totalLeft++;       byInstitute[iid].totalLeft++; if (byStudent[sid]) byStudent[sid].totalLeft++; }
      else if (r.status === AttendanceStatus.LEFT_EARLY)   { totalLeftEarly++;  byInstitute[iid].totalLeftEarly++; if (byStudent[sid]) byStudent[sid].totalLeftEarly++; }
      else if (r.status === AttendanceStatus.LEFT_LATELY)  { totalLeftLately++; byInstitute[iid].totalLeftLately++; if (byStudent[sid]) byStudent[sid].totalLeftLately++; }

      return {
        date: r.date,
        status: r.status,
        statusLabel: statusLabels[r.status as string] || String(r.status),
        studentId: sid,
        studentName,
        studentImageUrl,
        instituteId: iid,
        instituteName,
        instituteLogoUrl,
        classId: cid,
        className,
        subjectId: r.subjectId,
        subjectName: r.subjectName,
        markingMethod: r.markingMethod as any,
        remarks: r.remarks,
        userType: (r as any).userType,
        location: r.location,
        address: (r as any).address,
        latitude: (r as any).address?.latitude,
        longitude: (r as any).address?.longitude,
        timestamp: (r as any).timestamp || 0,
        markedAt: (r as any).timestamp ? new Date((r as any).timestamp).toISOString() : r.date,
      } as MyAttendanceRecordDto;
    });

    // Compute per-institute attendance rate
    for (const id of Object.keys(byInstitute)) {
      const s = byInstitute[id];
      const denom = s.totalPresent + s.totalAbsent;
      s.attendanceRate = denom > 0 ? parseFloat(((s.totalPresent / denom) * 100).toFixed(2)) : 0;
    }

    // Compute per-student attendance rate (when children included)
    for (const id of Object.keys(byStudent)) {
      const s = byStudent[id];
      const denom = s.totalPresent + s.totalAbsent;
      s.attendanceRate = denom > 0 ? parseFloat(((s.totalPresent / denom) * 100).toFixed(2)) : 0;
    }

    // 6. Paginate
    const totalRecords = enriched.length;
    const totalPages   = Math.ceil(totalRecords / limit);
    const paginated    = enriched.slice((page - 1) * limit, page * limit);
    const presentAbsent = totalPresent + totalAbsent;
    const attendanceRate = presentAbsent > 0
      ? parseFloat(((totalPresent / presentAbsent) * 100).toFixed(2))
      : 0;

    return {
      success: true,
      message: child && childrenIds.length > 0 
        ? `Attendance history retrieved successfully for you and ${childrenIds.length} child(ren)`
        : 'Attendance history retrieved successfully',
      pagination: {
        currentPage: page,
        totalPages,
        totalRecords,
        recordsPerPage: limit,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
      data: paginated,
      summary: { totalPresent, totalAbsent, totalLate, totalLeft, totalLeftEarly, totalLeftLately, attendanceRate },
      byInstitute,
      ...(child && childrenIds.length > 0 && { byStudent }),  // ✅ Include per-student breakdown when children data included
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // CLASS ATTENDANCE FROM INSTITUTE — new features
  // ─────────────────────────────────────────────────────────────────────────────

  private static readonly ATTENDANCE_STATUS_MAP: Record<number, string> = {
    0: 'absent',
    1: 'present',
    2: 'late',
    3: 'left',
    4: 'left_early',
    5: 'left_lately',
  };

  /**
   * Get all students enrolled in a class together with their institute-level
   * and class-level attendance for a given date.
   *
   * GET /api/attendance/institute/:instituteId/class/:classId/students-with-institute-status
   */
  async getClassStudentsWithInstituteAttendance(
    instituteId: string,
    classId: string,
    date?: string,
  ): Promise<any> {
    if (!instituteId || !classId) throw new BadRequestException('instituteId and classId are required');

    const queryDate = date || getCurrentSriLankaDate();

    // ── 1. All active+verified students in this class ──────────────────────
    const enrolled = await this.classStudentRepository.find({
      where: { instituteId, classId, isActive: true, isVerified: true },
      select: { instituteId: true, classId: true, studentUserId: true },
    });

    if (enrolled.length === 0) {
      return {
        success: true,
        date: queryDate,
        data: [],
        summary: { total: 0, presentInInstitute: 0, absentInInstitute: 0, notMarkedInInstitute: 0, alreadyMarkedInClass: 0 },
      };
    }

    const studentIds = enrolled.map(e => e.studentUserId);

    // ── 2. Fetch user names + global images ────────────────────────────────
    const [users, instituteUsers] = await Promise.all([
      this.userRepository.find({
        where: { id: In(studentIds) as any },
        select: ['id', 'firstName', 'lastName', 'nameWithInitials', 'imageUrl'],
      }),
      this.instituteUserRepository.find({
        where: { instituteId, userId: In(studentIds) },
        select: ['userId', 'instituteUserImageUrl', 'imageVerificationStatus'],
      }),
    ]);

    const userMap = new Map(users.map(u => [String(u.id), u]));
    const instituteUserMap = new Map(instituteUsers.map(iu => [String(iu.userId), iu]));

    // ── 3. Institute-level attendance (classId IS NULL) for these students ─
    const instituteAttendanceRecords = await this.attendanceRecordRepository
      .createQueryBuilder('ar')
      .where('ar.institute_id = :instituteId', { instituteId })
      .andWhere('ar.student_id IN (:...studentIds)', { studentIds })
      .andWhere('ar.date = :date', { date: queryDate })
      .andWhere('ar.class_id IS NULL')
      .andWhere('ar.subject_id IS NULL')
      .orderBy('ar.timestamp', 'DESC')
      .getMany();

    // Keep only the latest record per student (in case of duplicates)
    const instituteAttMap = new Map<string, AttendanceRecordEntity>();
    for (const rec of instituteAttendanceRecords) {
      if (!instituteAttMap.has(rec.studentId)) {
        instituteAttMap.set(rec.studentId, rec);
      }
    }

    // ── 4. Class-level attendance (classId = classId) for these students ──
    const classAttendanceRecords = await this.attendanceRecordRepository
      .createQueryBuilder('ar')
      .where('ar.institute_id = :instituteId', { instituteId })
      .andWhere('ar.student_id IN (:...studentIds)', { studentIds })
      .andWhere('ar.date = :date', { date: queryDate })
      .andWhere('ar.class_id = :classId', { classId })
      .orderBy('ar.timestamp', 'DESC')
      .getMany();

    const classAttMap = new Map<string, AttendanceRecordEntity>();
    for (const rec of classAttendanceRecords) {
      if (!classAttMap.has(rec.studentId)) {
        classAttMap.set(rec.studentId, rec);
      }
    }

    // ── 5. Build response items ────────────────────────────────────────────
    const data = studentIds.map(studentId => {
      const user = userMap.get(studentId);
      const iu = instituteUserMap.get(studentId);
      const name = user
        ? (user.nameWithInitials || `${user.firstName} ${user.lastName || ''}`.trim())
        : studentId;

      const resolvedImage = this.resolveImageUrl(
        iu as any,
        user?.imageUrl || null,
        instituteId,
      );

      const instRec = instituteAttMap.get(studentId);
      const clsRec = classAttMap.get(studentId);

      const instituteAttendance = instRec
        ? {
            statusCode: instRec.status,
            status: AttendanceService.ATTENDANCE_STATUS_MAP[instRec.status] ?? 'unknown',
            date: instRec.date,
            time: formatSriLankaTime(new Date(parseInt(instRec.timestamp))),
            timestamp: instRec.timestamp,
            remarks: instRec.remarks,
          }
        : null;

      const classAttendance = clsRec
        ? {
            statusCode: clsRec.status,
            status: AttendanceService.ATTENDANCE_STATUS_MAP[clsRec.status] ?? 'unknown',
            date: clsRec.date,
            time: formatSriLankaTime(new Date(parseInt(clsRec.timestamp))),
            timestamp: clsRec.timestamp,
          }
        : null;

      return { studentId, studentName: name, studentImageUrl: resolvedImage, instituteAttendance, classAttendance };
    });

    // ── 6. Summary stats ──────────────────────────────────────────────────
    const presentInInstitute = data.filter(
      d => d.instituteAttendance !== null && d.instituteAttendance.statusCode !== 0,
    ).length;
    const absentInInstitute = data.filter(
      d => d.instituteAttendance !== null && d.instituteAttendance.statusCode === 0,
    ).length;
    const notMarkedInInstitute = data.filter(d => d.instituteAttendance === null).length;
    const alreadyMarkedInClass = data.filter(d => d.classAttendance !== null).length;

    return {
      success: true,
      date: queryDate,
      data,
      summary: {
        total: data.length,
        presentInInstitute,
        absentInInstitute,
        notMarkedInInstitute,
        alreadyMarkedInClass,
      },
    };
  }

  /**
   * Bulk-mark class-level attendance derived from institute-level attendance.
   *
   * Strategy:
   *   - Student has institute attendance with status != ABSENT (codes 1-5)
   *     → mark PRESENT at class level  (if markPresentFromInstitute: true, default)
   *   - Student has NO institute attendance, OR institute status is ABSENT (0)
   *     → mark ABSENT at class level   (if markAbsentForUnmarked: true, default)
   *   - Student already has class-level attendance → always skipped (idempotent)
   *
   * POST /api/attendance/institute/:instituteId/class/:classId/bulk-mark-from-institute
   */
  async bulkMarkClassAttendanceFromInstituteAttendance(
    instituteId: string,
    classId: string,
    dto: BulkMarkClassFromInstituteDto,
    markedBy: string,
  ): Promise<any> {
    if (!instituteId || !classId) throw new BadRequestException('instituteId and classId are required');
    if (!dto.instituteName) throw new BadRequestException('instituteName is required');
    if (!dto.className) throw new BadRequestException('className is required');

    const markPresentFromInstitute = dto.markPresentFromInstitute !== false; // default true
    const markAbsentForUnmarked = dto.markAbsentForUnmarked !== false;       // default true
    const queryDate = dto.date || getCurrentSriLankaDate();

    // ── 1. All active+verified students in this class ──────────────────────
    const enrolled = await this.classStudentRepository.find({
      where: { instituteId, classId, isActive: true, isVerified: true },
      select: { instituteId: true, classId: true, studentUserId: true },
    });

    if (enrolled.length === 0) {
      return {
        success: true,
        message: 'No enrolled students found in this class',
        summary: { total: 0, markedPresent: 0, markedAbsent: 0, skipped: 0 },
        results: [],
      };
    }

    const studentIds = enrolled.map(e => e.studentUserId);

    // ── 2. Institute-level attendance ─────────────────────────────────────
    const instituteAttendanceRecords = await this.attendanceRecordRepository
      .createQueryBuilder('ar')
      .where('ar.institute_id = :instituteId', { instituteId })
      .andWhere('ar.student_id IN (:...studentIds)', { studentIds })
      .andWhere('ar.date = :date', { date: queryDate })
      .andWhere('ar.class_id IS NULL')
      .andWhere('ar.subject_id IS NULL')
      .orderBy('ar.timestamp', 'DESC')
      .getMany();

    const instituteAttMap = new Map<string, AttendanceRecordEntity>();
    for (const rec of instituteAttendanceRecords) {
      if (!instituteAttMap.has(rec.studentId)) {
        instituteAttMap.set(rec.studentId, rec);
      }
    }

    // ── 3. Existing class-level attendance (skip already-marked) ──────────
    const existingClassRecords = await this.attendanceRecordRepository
      .createQueryBuilder('ar')
      .where('ar.institute_id = :instituteId', { instituteId })
      .andWhere('ar.student_id IN (:...studentIds)', { studentIds })
      .andWhere('ar.date = :date', { date: queryDate })
      .andWhere('ar.class_id = :classId', { classId })
      .getMany();

    const alreadyMarkedSet = new Set(existingClassRecords.map(r => r.studentId));

    // ── 4. Classify each student ──────────────────────────────────────────
    const toMarkPresent: string[] = [];
    const toMarkAbsent: string[] = [];
    const skippedResults: any[] = [];

    for (const studentId of studentIds) {
      if (alreadyMarkedSet.has(studentId)) {
        skippedResults.push({
          studentId,
          action: 'skipped_already_marked',
          classStatus: null,
          success: true,
        });
        continue;
      }

      const instRec = instituteAttMap.get(studentId);
      const isPresentAtInstitute = instRec !== undefined && instRec.status !== 0;

      if (isPresentAtInstitute && markPresentFromInstitute) {
        toMarkPresent.push(studentId);
      } else if (!isPresentAtInstitute && markAbsentForUnmarked) {
        toMarkAbsent.push(studentId);
      } else {
        skippedResults.push({
          studentId,
          action: 'skipped_no_action',
          classStatus: null,
          success: true,
        });
      }
    }

    // ── 5. Build and execute bulk mark ────────────────────────────────────
    const allResults: any[] = [...skippedResults];

    const buildAndMark = async (ids: string[], status: AttendanceStatus): Promise<void> => {
      if (ids.length === 0) return;

      const bulkDto: BulkAttendanceDto = {
        instituteId,
        instituteName: dto.instituteName,
        classId,
        className: dto.className,
        date: queryDate,
        markingMethod: dto.markingMethod ?? MarkingMethod.SYSTEM,
        eventId: dto.eventId,
        students: ids.map(studentId => ({
          studentId,
          status,
        })),
      };

      try {
        const bulkResult = await this.markBulkAttendance(bulkDto, markedBy);
        const action = status === AttendanceStatus.PRESENT ? 'marked_present' : 'marked_absent';
        const bulkResultsMap = new Map(
          (bulkResult?.results ?? []).map((r: any) => [String(r.studentId ?? r.userId), r]),
        );

        for (const studentId of ids) {
          const r = bulkResultsMap.get(studentId) as any;
          allResults.push({
            studentId,
            studentName: r?.name ?? studentId,
            action,
            classStatus: status,
            success: r?.success !== false,
            ...(r?.error ? { error: r.error } : {}),
          });
        }
      } catch (err) {
        this.logger.error(`bulkMarkClassAttendanceFromInstituteAttendance: bulk ${status} failed — ${err.message}`);
        for (const studentId of ids) {
          allResults.push({
            studentId,
            action: status === AttendanceStatus.PRESENT ? 'marked_present' : 'marked_absent',
            classStatus: status,
            success: false,
            error: err.message,
          });
        }
      }
    };

    await buildAndMark(toMarkPresent, AttendanceStatus.PRESENT);
    await buildAndMark(toMarkAbsent, AttendanceStatus.ABSENT);

    const markedPresent = allResults.filter(r => r.action === 'marked_present' && r.success).length;
    const markedAbsent = allResults.filter(r => r.action === 'marked_absent' && r.success).length;
    const failed = allResults.filter(r => !r.success).length;
    const skipped = allResults.filter(r => r.action?.startsWith('skipped')).length;

    return {
      success: failed === 0,
      message: `Class attendance bulk-marked: ${markedPresent} present, ${markedAbsent} absent, ${skipped} skipped`,
      date: queryDate,
      summary: {
        total: studentIds.length,
        markedPresent,
        markedAbsent,
        skipped,
        failed,
      },
      results: allResults,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // SUBJECT ATTENDANCE FROM CLASS — new features
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Get all students enrolled in a subject (under a class) together with their
   * class-level and subject-level attendance for a given date.
   *
   * GET /api/attendance/institute/:instituteId/class/:classId/subject/:subjectId/students-with-class-status
   */
  async getSubjectStudentsWithClassAttendance(
    instituteId: string,
    classId: string,
    subjectId: string,
    date?: string,
  ): Promise<any> {
    if (!instituteId || !classId || !subjectId) {
      throw new BadRequestException('instituteId, classId and subjectId are required');
    }

    const queryDate = date || getCurrentSriLankaDate();

    // ── 1. All active+verified students enrolled in this subject ──────────
    const enrolled = await this.subjectStudentRepository.find({
      where: {
        instituteId,
        classId,
        subjectId,
        isActive: true,
        verificationStatus: 'verified' as any,
      },
      select: { instituteId: true, classId: true, subjectId: true, studentId: true },
    });

    if (enrolled.length === 0) {
      return {
        success: true,
        date: queryDate,
        data: [],
        summary: { total: 0, presentInClass: 0, absentInClass: 0, notMarkedInClass: 0, alreadyMarkedInSubject: 0 },
      };
    }

    const studentIds = enrolled.map(e => e.studentId);

    // ── 2. Fetch user names + images ──────────────────────────────────────
    const [users, instituteUsers] = await Promise.all([
      this.userRepository.find({
        where: { id: In(studentIds) as any },
        select: ['id', 'firstName', 'lastName', 'nameWithInitials', 'imageUrl'],
      }),
      this.instituteUserRepository.find({
        where: { instituteId, userId: In(studentIds) },
        select: ['userId', 'instituteUserImageUrl', 'imageVerificationStatus'],
      }),
    ]);

    const userMap = new Map(users.map(u => [String(u.id), u]));
    const instituteUserMap = new Map(instituteUsers.map(iu => [String(iu.userId), iu]));

    // ── 3. Class-level attendance (classId set, subjectId IS NULL) for date ──
    const classAttendanceRecords = await this.attendanceRecordRepository
      .createQueryBuilder('ar')
      .where('ar.institute_id = :instituteId', { instituteId })
      .andWhere('ar.student_id IN (:...studentIds)', { studentIds })
      .andWhere('ar.date = :date', { date: queryDate })
      .andWhere('ar.class_id = :classId', { classId })
      .andWhere('ar.subject_id IS NULL')
      .orderBy('ar.timestamp', 'DESC')
      .getMany();

    const classAttMap = new Map<string, AttendanceRecordEntity>();
    for (const rec of classAttendanceRecords) {
      if (!classAttMap.has(rec.studentId)) {
        classAttMap.set(rec.studentId, rec);
      }
    }

    // ── 4. Subject-level attendance for these students ──────────────────
    const subjectAttendanceRecords = await this.attendanceRecordRepository
      .createQueryBuilder('ar')
      .where('ar.institute_id = :instituteId', { instituteId })
      .andWhere('ar.student_id IN (:...studentIds)', { studentIds })
      .andWhere('ar.date = :date', { date: queryDate })
      .andWhere('ar.class_id = :classId', { classId })
      .andWhere('ar.subject_id = :subjectId', { subjectId })
      .orderBy('ar.timestamp', 'DESC')
      .getMany();

    const subjectAttMap = new Map<string, AttendanceRecordEntity>();
    for (const rec of subjectAttendanceRecords) {
      if (!subjectAttMap.has(rec.studentId)) {
        subjectAttMap.set(rec.studentId, rec);
      }
    }

    // ── 5. Build response items ────────────────────────────────────────
    const data = studentIds.map(studentId => {
      const user = userMap.get(studentId);
      const iu = instituteUserMap.get(studentId);
      const name = user
        ? (user.nameWithInitials || `${user.firstName} ${user.lastName || ''}`.trim())
        : studentId;

      const resolvedImage = this.resolveImageUrl(
        iu as any,
        user?.imageUrl || null,
        instituteId,
      );

      const clsRec = classAttMap.get(studentId);
      const subRec = subjectAttMap.get(studentId);

      const classAttendance = clsRec
        ? {
            statusCode: clsRec.status,
            status: AttendanceService.ATTENDANCE_STATUS_MAP[clsRec.status] ?? 'unknown',
            date: clsRec.date,
            time: formatSriLankaTime(new Date(parseInt(clsRec.timestamp))),
            timestamp: clsRec.timestamp,
            remarks: clsRec.remarks,
          }
        : null;

      const subjectAttendance = subRec
        ? {
            statusCode: subRec.status,
            status: AttendanceService.ATTENDANCE_STATUS_MAP[subRec.status] ?? 'unknown',
            date: subRec.date,
            time: formatSriLankaTime(new Date(parseInt(subRec.timestamp))),
            timestamp: subRec.timestamp,
          }
        : null;

      return { studentId, studentName: name, studentImageUrl: resolvedImage, classAttendance, subjectAttendance };
    });

    // ── 6. Summary stats ──────────────────────────────────────────────
    const presentInClass = data.filter(
      d => d.classAttendance !== null && d.classAttendance.statusCode !== 0,
    ).length;
    const absentInClass = data.filter(
      d => d.classAttendance !== null && d.classAttendance.statusCode === 0,
    ).length;
    const notMarkedInClass = data.filter(d => d.classAttendance === null).length;
    const alreadyMarkedInSubject = data.filter(d => d.subjectAttendance !== null).length;

    return {
      success: true,
      date: queryDate,
      data,
      summary: {
        total: data.length,
        presentInClass,
        absentInClass,
        notMarkedInClass,
        alreadyMarkedInSubject,
      },
    };
  }

  /**
   * Bulk-mark subject-level attendance derived from class-level attendance.
   *
   * Strategy:
   *   - Student has class attendance with status != ABSENT (codes 1-5)
   *     → mark PRESENT at subject level  (if markPresentFromClass: true, default)
   *   - Student has NO class attendance, OR class status is ABSENT (0)
   *     → mark ABSENT at subject level   (if markAbsentForUnmarked: true, default)
   *   - Student already has subject-level attendance → always skipped (idempotent)
   *
   * POST /api/attendance/institute/:instituteId/class/:classId/subject/:subjectId/bulk-mark-from-class
   */
  async bulkMarkSubjectAttendanceFromClassAttendance(
    instituteId: string,
    classId: string,
    subjectId: string,
    dto: BulkMarkSubjectFromClassDto,
    markedBy: string,
  ): Promise<any> {
    if (!instituteId || !classId || !subjectId) {
      throw new BadRequestException('instituteId, classId and subjectId are required');
    }
    if (!dto.instituteName) throw new BadRequestException('instituteName is required');
    if (!dto.className) throw new BadRequestException('className is required');
    if (!dto.subjectName) throw new BadRequestException('subjectName is required');

    const markPresentFromClass = dto.markPresentFromClass !== false; // default true
    const markAbsentForUnmarked = dto.markAbsentForUnmarked !== false; // default true
    const queryDate = dto.date || getCurrentSriLankaDate();

    // ── 1. All active+verified students in this subject ──────────────────
    const enrolled = await this.subjectStudentRepository.find({
      where: {
        instituteId,
        classId,
        subjectId,
        isActive: true,
        verificationStatus: 'verified' as any,
      },
      select: { instituteId: true, classId: true, subjectId: true, studentId: true },
    });

    if (enrolled.length === 0) {
      return {
        success: true,
        message: 'No enrolled students found in this subject',
        summary: { total: 0, markedPresent: 0, markedAbsent: 0, skipped: 0 },
        results: [],
      };
    }

    const studentIds = enrolled.map(e => e.studentId);

    // ── 2. Class-level attendance (classId set, subjectId IS NULL) ────────
    const classAttendanceRecords = await this.attendanceRecordRepository
      .createQueryBuilder('ar')
      .where('ar.institute_id = :instituteId', { instituteId })
      .andWhere('ar.student_id IN (:...studentIds)', { studentIds })
      .andWhere('ar.date = :date', { date: queryDate })
      .andWhere('ar.class_id = :classId', { classId })
      .andWhere('ar.subject_id IS NULL')
      .orderBy('ar.timestamp', 'DESC')
      .getMany();

    const classAttMap = new Map<string, AttendanceRecordEntity>();
    for (const rec of classAttendanceRecords) {
      if (!classAttMap.has(rec.studentId)) {
        classAttMap.set(rec.studentId, rec);
      }
    }

    // ── 3. Existing subject-level attendance (skip already-marked) ────────
    const existingSubjectRecords = await this.attendanceRecordRepository
      .createQueryBuilder('ar')
      .where('ar.institute_id = :instituteId', { instituteId })
      .andWhere('ar.student_id IN (:...studentIds)', { studentIds })
      .andWhere('ar.date = :date', { date: queryDate })
      .andWhere('ar.class_id = :classId', { classId })
      .andWhere('ar.subject_id = :subjectId', { subjectId })
      .getMany();

    const alreadyMarkedSet = new Set(existingSubjectRecords.map(r => r.studentId));

    // ── 4. Classify each student ─────────────────────────────────────────
    const toMarkPresent: string[] = [];
    const toMarkAbsent: string[] = [];
    const skippedResults: any[] = [];

    for (const studentId of studentIds) {
      if (alreadyMarkedSet.has(studentId)) {
        skippedResults.push({
          studentId,
          action: 'skipped_already_marked',
          subjectStatus: null,
          success: true,
        });
        continue;
      }

      const clsRec = classAttMap.get(studentId);
      const isPresentInClass = clsRec !== undefined && clsRec.status !== 0;

      if (isPresentInClass && markPresentFromClass) {
        toMarkPresent.push(studentId);
      } else if (!isPresentInClass && markAbsentForUnmarked) {
        toMarkAbsent.push(studentId);
      } else {
        skippedResults.push({
          studentId,
          action: 'skipped_no_action',
          subjectStatus: null,
          success: true,
        });
      }
    }

    // ── 5. Build and execute bulk mark ────────────────────────────────────
    const allResults: any[] = [...skippedResults];

    const buildAndMark = async (ids: string[], status: AttendanceStatus): Promise<void> => {
      if (ids.length === 0) return;

      const bulkDto: BulkAttendanceDto = {
        instituteId,
        instituteName: dto.instituteName,
        classId,
        className: dto.className,
        subjectId,
        subjectName: dto.subjectName,
        date: queryDate,
        markingMethod: dto.markingMethod ?? MarkingMethod.SYSTEM,
        eventId: dto.eventId,
        students: ids.map(studentId => ({
          studentId,
          status,
        })),
      };

      try {
        const bulkResult = await this.markBulkAttendance(bulkDto, markedBy);
        const action = status === AttendanceStatus.PRESENT ? 'marked_present' : 'marked_absent';
        const bulkResultsMap = new Map(
          (bulkResult?.results ?? []).map((r: any) => [String(r.studentId ?? r.userId), r]),
        );

        for (const studentId of ids) {
          const r = bulkResultsMap.get(studentId) as any;
          allResults.push({
            studentId,
            studentName: r?.name ?? studentId,
            action,
            subjectStatus: status,
            success: r?.success !== false,
            ...(r?.error ? { error: r.error } : {}),
          });
        }
      } catch (err) {
        this.logger.error(`bulkMarkSubjectAttendanceFromClassAttendance: bulk ${status} failed — ${err.message}`);
        for (const studentId of ids) {
          allResults.push({
            studentId,
            action: status === AttendanceStatus.PRESENT ? 'marked_present' : 'marked_absent',
            subjectStatus: status,
            success: false,
            error: err.message,
          });
        }
      }
    };

    await buildAndMark(toMarkPresent, AttendanceStatus.PRESENT);
    await buildAndMark(toMarkAbsent, AttendanceStatus.ABSENT);

    const markedPresent = allResults.filter(r => r.action === 'marked_present' && r.success).length;
    const markedAbsent = allResults.filter(r => r.action === 'marked_absent' && r.success).length;
    const failed = allResults.filter(r => !r.success).length;
    const skipped = allResults.filter(r => r.action?.startsWith('skipped')).length;

    return {
      success: failed === 0,
      message: `Subject attendance bulk-marked: ${markedPresent} present, ${markedAbsent} absent, ${skipped} skipped`,
      date: queryDate,
      summary: {
        total: studentIds.length,
        markedPresent,
        markedAbsent,
        skipped,
        failed,
      },
      results: allResults,
    };
  }
}

