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
import { DailyAdAssignmentService } from '../advertisement/services/daily-ad-assignment.service';
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

/** Student + resolved primary-parent contact data used by the notification path. */
interface StudentParentData {
  student: StudentEntity | null;
  primaryParent: UserEntity | null;
  parentContact: string | null;
  parentEmail: string | null;
  parentTelegramId: string | null;
  parentUserId: string | null;
  subscriptionPlan: string;
}

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
    private readonly dailyAdAssignmentService: DailyAdAssignmentService,
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
    // âš¡ OPTIMIZATION: Cache config parsing to avoid repeated string operations
    const instituteIds = this.configService.get<string>('INSTITUTE_IDS_WITH_CUSTOM_IMAGES')?.split(',').map(id => id.trim()) || [];
    this.instituteIdsRequiringCustomImages = new Set(instituteIds);
    this.notificationsEnabled = this.configService.get('ENABLE_ATTENDANCE_NOTIFICATIONS', 'true') === 'true';
    this.adsDeliveryEnabled = this.configService.get('ENABLE_ADVERTISEMENT_DELIVERY', 'false') === 'true';
  }

  /**
   * ðŸ” AUTO-DETECT USER TYPE: Look up institute_user to determine the user's role in this institute
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
   * ðŸ–¼ï¸ RESOLVE IMAGE URL: Get the correct image for any user type
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
      // âœ… STEP 1: Auto-detect user type from institute_user table
      const { userType, instituteUser } = await this.detectInstituteUserType(
        markAttendanceDto.studentId,
        markAttendanceDto.instituteId
      );

      // âœ… STEP 2: Validate enrollment if configured (applies to all user types)
      await this.validateUserEnrollment(
        markAttendanceDto.studentId,
        markAttendanceDto.instituteId,
        userType
      );

      // âœ… STEP 3: Fetch user data based on user type
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
      // eventId (institute-level only): If frontend sends one (special event) â†’ use it.
      // For class/subject scoped attendance, eventId is always ignored.
      // For institute-level attendance without explicit eventId â†’ auto-link to default REGULAR_CLASS event.
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
            // âœ… calendarDayId is ALWAYS system-set (today â†’ today's day record)
            (markAttendanceDto as any).calendarDayId = calendarDay.id;

            // âœ… eventId for class/subject scope is always disabled.
            if (hasClassOrSubjectScope) {
              (markAttendanceDto as any).eventId = null;
            } else if (originalFrontendEventId) {
              (markAttendanceDto as any).eventId = originalFrontendEventId;
              this.logger.log(`[${requestId}] ðŸŽ¯ Special event attendance: eventId=${originalFrontendEventId}, dayId=${calendarDay.id}`);
            } else if (defaultEventId) {
              (markAttendanceDto as any).eventId = defaultEventId;
              this.logger.debug(`[${requestId}] âœ… Auto-linked to default event: eventId=${defaultEventId}, dayId=${calendarDay.id}`);
            } else {
              this.logger.warn(`[${requestId}] âš ï¸  Calendar day ${calendarDay.id} has no default event. Attendance will have dayId but no eventId.`);
            }
            calendarResolved = true;
          }
        } catch (calendarError) {
          // Retry once after invalidating cache â€” handles race conditions on lazy calendar day creation
          this.logger.warn(
            `[${requestId}] âš ï¸  Calendar day lookup failed: ${calendarError.message}. Retrying after cache invalidation...`
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
              this.logger.log(`[${requestId}] âœ… Calendar day recovered after retry: dayId=${calendarDay.id}`);
            }
          } catch (retryError) {
            this.logger.error(
              `[${requestId}] âŒ Calendar day resolution failed after retry: ${retryError.message}`
            );
          }
        }

        if (!calendarResolved) {
          this.logger.error(
            `[${requestId}] âŒ CRITICAL: Could not resolve calendar day for institute ${markAttendanceDto.instituteId} on ${markAttendanceDto.date}. ` +
            `Attendance will still be saved but will NOT appear in calendar views.`
          );
        }
      }

      // âœ… STEP 3.6: Device validation (if marking from a registered device)
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
            // No explicit frontend event â†’ device binding overrides the auto-linked default event
            (markAttendanceDto as any).eventId = deviceValidation.eventId;
            this.logger.log(`[${requestId}] ðŸ”§ Device binding overrides default event: eventId=${deviceValidation.eventId}`);
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

      // âœ… STEP 4: Resolve image once and persist it in DynamoDB for faster later reads
      const imageUrl = this.resolveImageUrl(instituteUser, globalImageUrl, markAttendanceDto.instituteId);
      markAttendanceDto.studentImageUrl = imageUrl || undefined;

      // âœ… STEP 4.1: Mark attendance based on database mode
      const isMysqlOnly = this.syncConfigService.isMysqlOnly();
      let result: any;

      if (isMysqlOnly) {
        // MySQL-only mode: write directly to MySQL, no DynamoDB
        result = await this.mysqlAttendanceService.markAttendance(markAttendanceDto);
      } else {
        // Both mode: write to DynamoDB first, then sync to MySQL
        result = await this.dynamoAttendanceService.markAttendance(markAttendanceDto);

        // âœ… STEP 4.5: Sync to MySQL based on system-wide sync mode
        // Use the actual DynamoDB result (real pk/sk/timestamp) to avoid duplicate rows
        try {
          const syncMode = this.syncConfigService.getSyncModeSync();
          if (syncMode === AttendanceSyncMode.IMMEDIATE) {
            await this.syncSchedulerService.syncSingleRecord(result as any);
          } else if (syncMode === AttendanceSyncMode.DYNAMO_FIRST) {
            this.syncSchedulerService.syncSingleRecordAsync(result as any);
          }
          // BACKEND_SCHEDULE: no-op here â€” cron handles it
        } catch (syncErr) {
          this.logger.warn(`[${requestId}] MySQL sync skipped: ${syncErr.message}`);
        }
      }

      // âœ… STEP 5: Send notifications ONLY for students (teachers/admins don't need parent notifications)
      if (userType === AttendanceUserType.STUDENT && studentData) {
        this.scheduleAttendanceNotification(markAttendanceDto, result, studentData);
      }

      // âœ… STEP 6: Fetch available events for this date so frontend can show event picker
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
        availableEvents,  // âœ… All events for this date â€” frontend can use for event picker
      };
    } catch (error) {
      this.logger.error(`[${requestId}] âŒ ERROR: Failed to mark attendance - ${error.message}`, error.stack);
      throw error;
    }
  }

  async markBulkAttendance(bulkAttendanceDto: BulkAttendanceDto, markedBy: string): Promise<any> {
    const requestId = `BULK_ATT_${nowTimestamp()}`;
    const startTime = nowTimestamp();

    try {
      bulkAttendanceDto.date = getCurrentSriLankaDate();

      const userIds = bulkAttendanceDto.students.map(s => s.studentId);

      // âœ… STEP 1: Batch detect user types from institute_user table
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

      // âœ… STEP 2: Validate enrollment (if configured) - batch operation
      await Promise.all(
        userIds.map(userId => {
          const iu = instituteUserMap.get(userId);
          const detectedType = iu
            ? (AttendanceUserType[iu.instituteUserType as keyof typeof AttendanceUserType] || AttendanceUserType.STUDENT)
            : AttendanceUserType.NOT_ENROLLED;
          return this.validateUserEnrollment(userId, bulkAttendanceDto.instituteId, detectedType);
        })
      );

      // âœ… STEP 3: Separate students from non-students for different data fetch strategies
      const studentUserIds = userIds.filter(id => {
        const iu = instituteUserMap.get(id);
        return !iu || iu.instituteUserType === InstituteUserType.STUDENT;
      });
      const nonStudentUserIds = userIds.filter(id => {
        const iu = instituteUserMap.get(id);
        return iu && iu.instituteUserType !== InstituteUserType.STUDENT;
      });

      // âœ… STEP 4A: Fetch students from students table (with parent data for notifications)
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

      // âœ… STEP 4B: Fetch non-student users directly from users table
      const nonStudentEntities = nonStudentUserIds.length > 0
        ? await this.userRepository.find({
          where: { id: In(nonStudentUserIds) },
          select: ['id', 'firstName', 'lastName', 'nameWithInitials', 'imageUrl'],
        })
        : [];

      // âœ… STEP 5: Build unified user map (userId -> { name, userType, imageUrl })
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

      // âœ… STEP 6: Validate all users exist and update names
      const validatedStudents = [];
      const invalidUsers = [];

      for (const studentItem of bulkAttendanceDto.students) {
        const userData = userDataMap.get(studentItem.studentId);

        if (!userData) {
          invalidUsers.push({
            studentId: studentItem.studentId,
            error: `User not found: ${studentItem.studentId}`
          });
          this.logger.warn(`[${requestId}] âš ï¸  User not found: ${studentItem.studentId}`);
          continue;
        }

        // Override with database name
        studentItem.studentName = userData.name;
        (studentItem as any).studentImageUrl = userData.imageUrl;
        validatedStudents.push(studentItem);
      }

      // âœ… STEP 7: Check if any users were invalid
      if (invalidUsers.length > 0) {
        this.logger.error(`[${requestId}] âŒ ${invalidUsers.length} invalid users found`);
        throw new NotFoundException(
          `${invalidUsers.length} user(s) not found: ${invalidUsers.map(s => s.studentId).join(', ')}`
        );
      }

      // âœ… STEP 8: Update the DTO with only validated users
      bulkAttendanceDto.students = validatedStudents;

      // ============================================
      // STEP 8.5: MANDATORY Calendar Day + Event Linkage (Bulk)
      // ============================================
      // calendarDayId: Resolved from the DTO's date (defaults to today if not provided).
      // eventId: if bulk DTO has a special eventId â†’ use it. Otherwise â†’ default REGULAR_CLASS event.
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
              this.logger.log(`[${requestId}] ðŸŽ¯ Bulk special event attendance: eventId=${frontendEventId}, dayId=${calendarDay.id}`);
            } else if (defaultEventId) {
              (bulkAttendanceDto as any).defaultEventId = defaultEventId;
              this.logger.debug(`[${requestId}] âœ… Bulk auto-linked to default event: eventId=${defaultEventId}, dayId=${calendarDay.id}`);
            } else {
              this.logger.warn(`[${requestId}] âš ï¸  Bulk: calendar day ${calendarDay.id} has no default event.`);
            }
            calendarResolved = true;
          }
        } catch (calendarError) {
          this.logger.warn(
            `[${requestId}] âš ï¸  Bulk calendar day lookup failed: ${calendarError.message}. Retrying after cache invalidation...`
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
              this.logger.log(`[${requestId}] âœ… Bulk calendar day recovered after retry: dayId=${calendarDay.id}`);
            }
          } catch (retryError) {
            this.logger.error(
              `[${requestId}] âŒ Bulk calendar day resolution failed after retry: ${retryError.message}`
            );
          }
        }

        if (!calendarResolved) {
          this.logger.error(
            `[${requestId}] âŒ CRITICAL: Could not resolve calendar day for bulk at institute ${bulkAttendanceDto.instituteId}. ` +
            `Bulk attendance will still be saved but will NOT appear in calendar views.`
          );
        }
      }

      // âœ… STEP 9: Mark attendance based on database mode
      const isMysqlOnly = this.syncConfigService.isMysqlOnly();
      let results: MarkAttendanceDto[];

      if (isMysqlOnly) {
        // MySQL-only mode: write directly to MySQL, no DynamoDB
        results = await this.mysqlAttendanceService.markBulkAttendance(bulkAttendanceDto);
      } else {
        // Both mode: write to DynamoDB first, then sync to MySQL
        results = await this.dynamoAttendanceService.markBulkAttendance(bulkAttendanceDto);

        // âœ… STEP 9.5: Sync bulk results to MySQL based on system-wide sync mode
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

      // âœ… STEP 10: Send notifications ONLY for students (teachers/admins skip parent notifications)
      // BULK N+1 FIX: batch-fetch parent data for ALL student results in one query, then pass
      // each student's data into the notification path so it never re-queries per student.
      if (this.notificationsEnabled) {
        const studentResults = results.filter(
          r => userDataMap.get(r.studentId)?.userType === AttendanceUserType.STUDENT,
        );

        if (studentResults.length > 0) {
          const parentDataMap = await this.fetchStudentsWithParentDataBatch(
            studentResults.map(r => r.studentId),
          );

          for (const result of studentResults) {
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

            // Pass pre-fetched parent data (may be undefined if the student row was missing;
            // scheduleAttendanceNotification handles a null and skips cleanly).
            this.scheduleAttendanceNotification(
              markAttendanceDto,
              result,
              parentDataMap.get(result.studentId),
            );
          }
        }
      }

      // âœ… Fetch available events for this date so frontend can show event picker
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
        availableEvents,  // âœ… All events for this date â€” frontend can use for event picker
        records: results
      };
    } catch (error) {
      this.logger.error(`[${requestId}] âŒ ERROR: Bulk attendance failed - ${error.message}`, error.stack);
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

    // âœ… Use DynamoDB stored image URL first (snapshot at time of marking)
    // Falls back to current users table image if missing (for legacy records)
    let studentImageUrl: string | null = null;

    if (record.studentImageUrl) {
      // Image was already stored in DynamoDB when attendance was marked
      studentImageUrl = this.CloudStorageService.getFullUrl(record.studentImageUrl);
    } else {
      // âœ… Optional: Enrich with current image from users table (handles legacy records)
      try {
        const user = await this.userRepository.findOne({
          where: { id: record.studentId },
          select: ['id', 'imageUrl'],
        });
        if (user?.imageUrl) {
          studentImageUrl = this.CloudStorageService.getFullUrl(user.imageUrl);
        }
      } catch (_) {
        // Image fetch is best-effort â€” do not fail the whole response
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
    // Privileged roles (SUPERADMIN, Institute Admin, Teacher, Attendance Marker) bypass this check
    // because they have already been authorized by FlexibleAccessGuard at the controller level.
    if (user) {
      const isSuperAdmin = user.u === 0; // user type 0 = SUPERADMIN
      const isGlobalAccess = user.i === 999999; // global institute access flag
      const instituteAccess = Array.isArray(user.i) ? user.i : [];
      // IA=8, TE=4, AM=1 â€” any of these bitmask flags means a privileged role
      const isPrivilegedInstituteRole = instituteAccess.some(
        (entry: any) => (entry.r & (8 | 4 | 1)) !== 0
      );
      const isPrivileged = isSuperAdmin || isGlobalAccess || isPrivilegedInstituteRole;

      if (!isPrivileged) {
        // Only students and parents reach this block â€” enforce ownership restriction
        const isOwnData = String(user.s) === String(studentId);
        const children = Array.isArray(user.c) ? user.c.map(String) : [];
        const isParentOfStudent = children.includes(String(studentId));

        if (!isOwnData && !isParentOfStudent) {
          this.logger.warn(`Access denied: User ${user.s} attempted to access attendance for student ${studentId}`);
          throw new ForbiddenException('You can only access your own attendance data or your children\'s attendance data.');
        }

        this.logger.debug(`âœ… Attendance access granted: ${isOwnData ? 'Own data' : 'Parent accessing child data'}`);
      } else {
        this.logger.debug(`âœ… Attendance access granted: Privileged role (superAdmin=${isSuperAdmin}, globalAccess=${isGlobalAccess}, instituteRole=${isPrivilegedInstituteRole})`);
      }
    }

    // âœ… Get all attendance records for the student in the date range
    // âœ… FIXED BUG-003: Now passes instituteId from DTO instead of empty string
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
      address: (record as any).address,  // âœ… CONSOLIDATED: Include address object with lat/lng
      location: record.location || this.generateAddress(record.instituteName, record.className, record.subjectName),
      latitude: (record as any).address?.latitude,  // âœ… CONSOLIDATED: Extract from address for backward compatibility
      longitude: (record as any).address?.longitude,  // âœ… CONSOLIDATED: Extract from address for backward compatibility
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

  async markAttendanceByCard(markAttendanceByCardDto: MarkAttendanceByCardDto, markedBy: string): Promise<any> {
    const { studentCardId, markingMethod } = markAttendanceByCardDto;
    const isNfc = markingMethod === MarkingMethod.RFID_NFC;

    // âœ… DUAL LOOKUP: NFC â†’ rfid column, QR/Barcode â†’ cardId column
    let user: UserEntity | null = null;
    let cardType: 'rfid' | 'normal';

    if (isNfc) {
      // NFC/RFID scan â†’ look up by rfid column
      user = await this.userRepository.findOne({
        where: { rfid: studentCardId },
        select: ['id', 'firstName', 'lastName', 'nameWithInitials', 'imageUrl', 'rfid', 'rfidCardStatus', 'rfidExpiryDate', 'cardId', 'cardStatus', 'cardExpiryDate']
      });
      cardType = 'rfid';
    } else {
      // QR/Barcode scan â†’ look up by cardId column first, fallback to rfid
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

    return {
      ...result,
      cardInfo: {
        cardId: studentCardId,
        cardType,
      }
    };
  }

  async markBulkAttendanceByCard(bulkCardAttendanceDto: BulkCardAttendanceDto, markedBy: string): Promise<any> {
    const cardIds = bulkCardAttendanceDto.students.map(s => s.studentCardId);
    const isNfc = bulkCardAttendanceDto.markingMethod === MarkingMethod.RFID_NFC;

    // âœ… DUAL LOOKUP: NFC â†’ rfid, QR/Barcode â†’ cardId
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

    // Create map: scan value â†’ user
    const userMap = isNfc || cardType === 'rfid'
      ? new Map(users.map(u => [u.rfid, u]))
      : new Map(users.map(u => [u.cardId, u]));

    const invalidCards: any[] = [];

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
    const notFound: string[] = [];
    const students = bulkCardAttendanceDto.students
      .filter(student => {
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

    // âœ… Include card validation info in response
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
      // âœ… DUAL LOOKUP: try cardId first, then rfid (backward compat)
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

      // âœ… Enrich records with images (uses DynamoDB image first, then institute/global images)
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

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // MONTHLY ATTENDANCE COUNT APIs
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
    if (!this.notificationsEnabled) {
      this.logger.debug(`[Notification] Skipped — ENABLE_ATTENDANCE_NOTIFICATIONS is false`);
      return;
    }
    // Fire-and-forget — never log per-student on the hot path (5000/sec would flood logs).
    this.sendAttendanceNotificationWithAdvertising(markAttendanceDto, attendanceResult, studentData).catch((err) => this.logger.warn(`Attendance notification failed: ${err.message}`));
  }

  /**
   * ðŸŽ¯ ADVERTISING INTEGRATION: Send attendance notification with advertising logic
   * This ensures that when attendance is marked, the advertising system is triggered
   * with proper subscription plan filtering and environment validation
   */
  private async sendAttendanceNotificationWithAdvertising(
    markAttendanceDto: MarkAttendanceDto,
    attendanceResult: any,
    studentData?: any
  ): Promise<void> {
    const sid = markAttendanceDto.studentId;
    try {
      if (!this.shouldSendNotifications()) {
        this.logger.warn(`[Notification] No channels configured — notification skipped for student=${sid}`);
        return;
      }

      const data = studentData || await this.fetchStudentWithParentData(sid);

      if (!data.student) {
        this.logger.warn(`[Notification] Student not found in DB: ${sid}`);
        return;
      }

      if (!data.parentContact && !data.parentEmail && !data.parentTelegramId) {
        this.logger.warn(`[Notification] No parent contact for student=${sid} (phone/email/telegram all null)`);
        return;
      }

      const normalizedPlan = String(data.subscriptionPlan || 'FREE').toUpperCase();
      const packageConfig = NOTIFICATION_PACKAGES_CONFIG.packages[normalizedPlan] || NOTIFICATION_PACKAGES_CONFIG.packages.FREE;
      const channels = packageConfig?.channels || ['sms'];
      const isAdsEnabled = this.adsDeliveryEnabled && packageConfig?.isAds === true;
      const isAdsFromDB = this.configService.get<string>('IS_ADS_FROM_DB') === 'true';

      this.logger.debug(
        `[Notification] student=${sid} plan=${normalizedPlan} channels=${channels.join(',')} ` +
        `contact=${!!data.parentContact} email=${!!data.parentEmail} telegram=${!!data.parentTelegramId} ads=${isAdsEnabled}`,
      );

      let advertisementData = null;
      if (isAdsEnabled) {
        if (isAdsFromDB) {
          advertisementData = await this.getMatchingAdvertisementFromDB(
            data.subscriptionPlan,
            data.student,
            markAttendanceDto.instituteId
          );
          this.logger.debug(`[Notification] Ad from DB: ${advertisementData?.id ?? 'none'}`);
        } else {
          advertisementData = {
            id: 'default-company-ad',
            mediaUrl: process.env.DEFAULT_AD_URL || '',
            mediaType: process.env.DEFAULT_AD_TYPE || 'text',
            title: process.env.DEFAULT_AD_TITLE || 'Your Company Name',
            content: process.env.DEFAULT_AD_CONTENT || 'Professional education services.',
            sendingUrl: process.env.DEFAULT_AD_SENDING_URL || undefined,
            supportivePlatforms: [],
            modeOfSending: []
          };
          this.logger.debug(`[Notification] Using default ad`);
        }
      }

      const notificationData = {
        studentId: sid,
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
        attendanceStatus: (markAttendanceDto.status?.toUpperCase() as any) || 'ABSENT',
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
      this.logger.debug(
        `[Notification] Result for student=${sid}: total=${notificationResult.totalChannels} ` +
        `success=${notificationResult.successfulChannels} failed=${notificationResult.failedChannels} ` +
        `channels=${notificationResult.results.map(r => `${r.channel}:${r.success ? 'ok' : r.errorMessage}`).join(', ')}`,
      );

      if (this.shouldTrackAdvertisementSending(advertisementData) && notificationResult.successfulChannels > 0) {
        this.advertisementRepository.increment(
          { id: advertisementData.id },
          'currentSendings',
          1
        ).catch(err => this.logger.error(`Failed to increment ad sendings: ${err.message}`));
      }

      if (advertisementData?.id && advertisementData.id !== 'default-company-ad' && advertisementData.id !== 'default-fallback' && attendanceResult?.id) {
        this.dynamoAttendanceService.patchAdvertisementId(attendanceResult.id, advertisementData.id)
          .catch(err => this.logger.warn(`Failed to patch advertisementId: ${err.message}`));
      }

      await this.sendSelfAttendanceNotification(markAttendanceDto, data.student?.user);

    } catch (error) {
      this.logger.warn(`[Notification] Failed (non-blocking) for student=${sid}: ${error.message}`, error.stack);
    }
  }



  /**
   * Check if notification system is properly configured
   */
  private shouldSendNotifications(): boolean {
    const hasWhatsApp = !!(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
    const hasTelegram = !!process.env.TELEGRAM_BOT_TOKEN;
    const hasEmail = !!(process.env.EMAIL_SERVER_URL || process.env.EMAIL_API_URL);
    const hasFcm = this.attendanceNotificationService.isPushReady();
    // SMS (SMSlenz) requires user ID + API key
    const hasSms = !!(process.env.SMSLENZ_USER_ID && process.env.SMSLENZ_API_KEY);

    const result = hasWhatsApp || hasTelegram || hasEmail || hasFcm || hasSms;
    this.logger.debug(
      `[Notification Gate] whatsapp=${hasWhatsApp} telegram=${hasTelegram} email=${hasEmail} fcm=${hasFcm} sms=${hasSms} → enabled=${result}`,
    );
    return result;
  }

  /**
   * ðŸ”¥ FIRE-AND-FORGET IMMEDIATE NOTIFICATION SENDING
   * Sends notifications immediately with pre-loaded data (no additional queries needed)
   * Fetches matching advertisement from database and sends notification
   * ðŸŽ¯ CASCADE TO PARENTS: If ad has cascadeToParents=true, sends SAME ad to ALL parents
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
          // ðŸŽ¯ Fetch MOST MATCHING advertisement using multi-factor profile matching
          advertisementData = await this.getMatchingAdvertisementFromDB(
            subscriptionPlan,
            studentData,
            instituteId
          );
        } else {
          // ðŸ¢ Use default company branding from environment
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
        attendanceStatus: (attendanceDto.status?.toUpperCase() as any) || 'ABSENT',
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

      // ðŸš€ Send notification immediately (fire-and-forget)
      const notificationResult = await this.attendanceNotificationService.sendAttendanceNotification(notificationData);

      // âœ… BUG-B FIX: Only increment currentSendings AFTER successful delivery
      if (this.shouldTrackAdvertisementSending(advertisementData) && notificationResult.successfulChannels > 0) {
        this.advertisementRepository.increment(
          { id: advertisementData.id },
          'currentSendings',
          1
        ).catch(err => this.logger.error(`Failed to increment ad sendings: ${err.message}`));
      }

      // âœ… Store matched advertisement ID on the attendance record for delivery tracking
      if (advertisementData?.id && advertisementData.id !== 'default-company-ad' && advertisementData.id !== 'default-fallback' && attendanceId) {
        this.dynamoAttendanceService.patchAdvertisementId(attendanceId, advertisementData.id)
          .catch(err => this.logger.warn(`Failed to patch advertisementId: ${err.message}`));
      }

      // âœ… SELF-NOTIFICATION: Send notification to the student themselves
      await this.sendSelfAttendanceNotification(attendanceDto, studentData?.user);

      // CASCADE TO PARENTS FEATURE
      // If ad has cascadeToParents=true, send SAME ad to ALL parents (not just primary)
      if (advertisementData?.cascadeToParents && studentData) {
        await this.cascadeAdToAllParents(studentData, advertisementData, attendanceDto);
      }

    } catch (error) {
      this.logger.error(`âŒ Notification failed: ${error.message}`, error.stack);
      // Don't throw - notifications are fire-and-forget
    }
  }

  /**
   * ðŸŽ¯ CASCADE ADVERTISEMENT TO ALL PARENTS
   * When an ad matches a student and cascadeToParents=true, 
   * sends the SAME ad to ALL parents (father, mother, guardian)
   * 
   * Example: "Grade 10 girls tuition" ad matches female student
   * â†’ Father gets this ad
   * â†’ Mother gets this ad  
   * â†’ Guardian gets this ad
   * All parents see the relevant ad about their child's need
   */
  private async cascadeAdToAllParents(
    studentData: any,
    advertisementData: any,
    attendanceDto: MarkAttendanceDto
  ): Promise<void> {
    try {
      const studentName = studentData.user?.nameWithInitials || `${studentData.user?.firstName || ''} ${studentData.user?.lastName || ''}`.trim();
      const allParents: Array<{ type: string, user: any }> = [];

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
        this.logger.warn(`âš ï¸ No parents found for cascade for student ${studentData.userId}`);
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
            attendanceStatus: (attendanceDto.status?.toUpperCase() as any) || 'ABSENT',
            date: attendanceDto.date,
            time: formatSriLankaTime(now()),
            vehicleNumber: null,
            bookhireName: null,
            subscriptionPlan: parentSubscriptionPlan,
            advertisementData: advertisementData  // ðŸŽ¯ SAME ad for ALL parents
          };

          // Send notification (fire-and-forget)
          const result = await this.attendanceNotificationService.sendAttendanceNotification(notificationData);

          if (result.successfulChannels > 0) {
            return true;
          }

          return false;

        } catch (error) {
          this.logger.error(`âŒ Failed to cascade ad to ${parent.type}: ${error.message}`);
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
      this.logger.error(`âŒ Cascade to parents failed: ${error.message}`, error.stack);
      // Don't throw - notifications are fire-and-forget
    }
  }

  /**
   * ðŸ“Š Get MOST MATCHING advertisement from database for individual person
   * Uses multi-factor matching: userType, subscriptionPlan, age, gender, location, institute
   * Returns the best personalized advertisement based on complete user profile
   */
  /**
   * Get the advertisement pre-assigned to this user for today (HOT PATH).
   *
   * The expensive multi-factor matching no longer runs here — it runs once daily in
   * DailyAdAssignmentService. This method does:
   *   1) one indexed lookup of the user's assigned ad, then
   *   2) a single atomic conditional increment of currentSendings that enforces the
   *      maxSendings cap. If the increment affects 0 rows (cap reached or ad deleted),
   *      we return null so the notification simply goes out with no ad.
   *
   * Returns null when there is no ad to send (no assignment / over cap / inactive).
   * The subscriptionPlan/instituteId params are kept for the call sites but are no
   * longer used for matching (the daily assignment already accounted for them).
   */
  private async getMatchingAdvertisementFromDB(
    _subscriptionPlan: string,
    studentData: any,
    _instituteId: string
  ): Promise<any> {
    try {
      const userId = studentData?.userId;
      if (!userId) return null;

      const assigned = await this.dailyAdAssignmentService.getAssignedAd(String(userId));
      if (!assigned) return null;

      // Send-time cap enforcement: atomically bump currentSendings only while under cap.
      // 0 affected rows => the ad hit its cap (or was removed) => don't send it.
      const updateResult = await this.advertisementRepository
        .createQueryBuilder()
        .update(AdvertisementEntity)
        .set({ currentSendings: () => 'currentSendings + 1' })
        .where('id = :id', { id: assigned.id })
        .andWhere('isActive = true')
        .andWhere('currentSendings < maxSendings')
        .execute();

      if (!updateResult.affected || updateResult.affected === 0) {
        return null; // capped or inactive — no ad this time
      }

      return {
        id: assigned.id,
        mediaUrl: assigned.mediaUrl,
        mediaType: assigned.mediaType,
        title: assigned.title,
        content: assigned.content || '',
        sendingUrl: assigned.sendingUrl || undefined,
        supportivePlatforms: assigned.supportivePlatforms || [],
        modeOfSending: assigned.modeOfSending || [],
        cascadeToParents: assigned.cascadeToParents || false,
        // Counter already incremented above, so downstream must NOT increment again.
        sendingAlreadyCounted: true,
      };
    } catch (error) {
      this.logger.error(`Failed to fetch assigned advertisement: ${error.message}`);
      return null; // hot path degrades to "no ad"
    }
  }

  /**
   * ðŸ”” SELF-NOTIFICATION: Send a push notification to the person whose attendance was marked.
   * If "I" mark attendance and I am the student, I should also receive "Your attendance marked" notification.
   * Fire-and-forget â€” never blocks the response.
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

      const title = `âœ… Attendance Marked`;
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

    // Pre-assigned ads already incremented currentSendings atomically at fetch time
    // (send-time cap check). Counting again here would double-count.
    if (advertisementData?.sendingAlreadyCounted === true) {
      return false;
    }

    // Fallback/default IDs are not persisted campaign rows, so they must not be counted.
    return !adId.startsWith('default-');
  }

  /**
   * ðŸ­ INDUSTRIAL-GRADE DATA FETCHING: Get real student with parent data
   */
  /**
   * ðŸ‘¥ Fetch student names from database (bulk operation)
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

  /**
   * The same student+parent select used by both the single and batch fetch. Defined once
   * so the two paths stay in sync.
   */
  private readonly STUDENT_PARENT_SELECT = {
    userId: true,
    fatherId: true,
    motherId: true,
    guardianId: true,
    studentId: true,
    emergencyContact: true,
    isActive: true,
    user: {
      id: true, firstName: true, lastName: true, nameWithInitials: true,
      email: true, phoneNumber: true, subscriptionPlan: true, telegramId: true,
      imageUrl: true, userType: true, dateOfBirth: true, gender: true,
      city: true, district: true, province: true,
    },
    father: {
      userId: true,
      user: { id: true, firstName: true, lastName: true, nameWithInitials: true, email: true, phoneNumber: true, telegramId: true, firstLoginCompleted: true },
    },
    mother: {
      userId: true,
      user: { id: true, firstName: true, lastName: true, nameWithInitials: true, email: true, phoneNumber: true, telegramId: true, firstLoginCompleted: true },
    },
    guardian: {
      userId: true,
      user: { id: true, firstName: true, lastName: true, nameWithInitials: true, email: true, phoneNumber: true, telegramId: true, firstLoginCompleted: true },
    },
  } as const;

  private readonly STUDENT_PARENT_RELATIONS = ['user', 'father', 'father.user', 'mother', 'mother.user', 'guardian', 'guardian.user'];

  /** Shape returned by both single and batch parent-data fetch. */
  private mapStudentToParentData(student: StudentEntity): StudentParentData {
    let primaryParent: UserEntity | null = null;
    if (student.father?.user) primaryParent = student.father.user;
    else if (student.mother?.user) primaryParent = student.mother.user;
    else if (student.guardian?.user) primaryParent = student.guardian.user;

    let parentContact: string | null = null;
    let parentEmail: string | null = null;
    let parentTelegramId: string | null = null;

    if (primaryParent) {
      const rawPhone = primaryParent.phoneNumber || '';
      const digits = rawPhone.replace(/\D/g, '');
      parentContact = digits.length >= 7 ? rawPhone : null;
      parentEmail = primaryParent.email || null;
      parentTelegramId = primaryParent.telegramId || null;
    }

    if (!parentContact && student.emergencyContact) {
      const ecDigits = (student.emergencyContact || '').replace(/\D/g, '');
      parentContact = ecDigits.length >= 7 ? student.emergencyContact : null;
    }

    return {
      student,
      primaryParent,
      parentContact,
      parentEmail,
      parentTelegramId,
      parentUserId: primaryParent?.id || null,
      subscriptionPlan: student.user?.subscriptionPlan || 'FREE',
    };
  }

  /**
   * BULK N+1 FIX: fetch student+parent data for many students in ONE query and return a
   * Map keyed by studentId (userId). The bulk notification loop uses this so each student's
   * notification path no longer re-queries the 6-relation join individually.
   */
  private async fetchStudentsWithParentDataBatch(studentIds: string[]): Promise<Map<string, StudentParentData>> {
    const result = new Map<string, StudentParentData>();
    if (studentIds.length === 0) return result;

    try {
      const students = await this.studentRepository.find({
        where: { userId: In(studentIds) },
        relations: this.STUDENT_PARENT_RELATIONS,
        select: this.STUDENT_PARENT_SELECT as any,
      });

      for (const student of students) {
        result.set(student.userId, this.mapStudentToParentData(student));
      }
    } catch (error) {
      this.logger.error(`Batch student+parent fetch failed: ${error.message}`);
    }

    return result;
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
        relations: this.STUDENT_PARENT_RELATIONS,
        select: this.STUDENT_PARENT_SELECT as any,
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

      return this.mapStudentToParentData(student);
    } catch (error) {
      this.logger.error(`Failed to fetch student data: ${error.message}`);
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
   * ðŸ“‡ GET INSTITUTE USER BY CARD ID
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
   * ðŸ“ MARK ATTENDANCE BY INSTITUTE CARD ID
   * Main attendance marking logic using institute card ID
   * - Looks up user via institute_user table by instituteCardId
   * - Gets user name from users table JOIN
   * - Applies image URL logic (institute verified vs global)
   * - âœ… ENHANCED: Works for ALL user types (STUDENT, TEACHER, INSTITUTE_ADMIN, etc.)
   * - Only fetches parent data & sends notifications for STUDENT type
   */
  async markAttendanceByInstituteCard(
    markAttendanceDto: MarkAttendanceByInstituteCardDto,
    markedBy: string
  ): Promise<any> {
    const { instituteCardId, instituteId } = markAttendanceDto;

    // âœ… STEP 1: Query institute_user with user data (works for ALL user types)
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

    // âœ… STEP 2: Determine institute user type
    const typeMap: Record<string, AttendanceUserType> = {
      [InstituteUserType.STUDENT]: AttendanceUserType.STUDENT,
      [InstituteUserType.TEACHER]: AttendanceUserType.TEACHER,
      [InstituteUserType.INSTITUTE_ADMIN]: AttendanceUserType.INSTITUTE_ADMIN,
      [InstituteUserType.ATTENDANCE_MARKER]: AttendanceUserType.ATTENDANCE_MARKER,
      [InstituteUserType.PARENT]: AttendanceUserType.PARENT,
    };
    const detectedUserType = typeMap[instituteUser.instituteUserType] || AttendanceUserType.STUDENT;
    const isStudent = detectedUserType === AttendanceUserType.STUDENT;

    // âœ… STEP 3: Fetch data based on user type
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

      // Extract parent info (Priority: Father â†’ Mother â†’ Guardian)
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

    // âœ… STEP 4: Image URL logic (works for all user types)
    const isVerified = instituteUser.imageVerificationStatus === ImageVerificationStatus.VERIFIED;
    const finalImageUrl = isVerified && instituteUser.instituteUserImageUrl
      ? instituteUser.instituteUserImageUrl
      : globalImageUrl;

    // âœ… STEP 5: Build attendance DTO with auto-detected userType
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
      userType: detectedUserType,  // âœ… Auto-detected user type
      date: getCurrentSriLankaDate(),
      location: markAttendanceDto.location || this.generateAddress(
        markAttendanceDto.instituteName,
        markAttendanceDto.className,
        markAttendanceDto.subjectName
      )
    };

    // âœ… STEP 6: Mark attendance based on database mode
    const isMysqlOnlyMode = this.syncConfigService.isMysqlOnly();
    let result: any;

    if (isMysqlOnlyMode) {
      // MySQL-only mode: write directly to MySQL, no DynamoDB
      result = await this.mysqlAttendanceService.markAttendance(attendanceDto);
    } else {
      // Both mode: write to DynamoDB first, then sync to MySQL
      result = await this.dynamoAttendanceService.markAttendance(attendanceDto);

      // âœ… STEP 6.5: Sync to MySQL based on system-wide sync mode
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

    // âœ… STEP 7: Send notifications ONLY for students (non-blocking)
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

    // âœ… STEP 8: Return response with user type info
    return {
      success: true,
      message: 'Attendance marked successfully using institute card',
      imageUrl: finalImageUrl ? this.CloudStorageService.getFullUrl(finalImageUrl) : null,
      isInstituteImage: isVerified && !!instituteUser.instituteUserImageUrl,
      imageVerificationStatus: instituteUser.imageVerificationStatus,
      status: markAttendanceDto.status,
      name: userName,
      nameWithInitials: (isStudent ? studentData?.user?.nameWithInitials : instituteUser.user?.nameWithInitials) || null,
      userType: detectedUserType,  // âœ… NEW: Return user type
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
        userType: detectedUserType,  // âœ… NEW: Include in data too
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

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // MY ATTENDANCE HISTORY â€” self-service, enriched with institute + class details
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

    // Default date range: last 30 days â†’ today
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
      [AttendanceStatus.ABSENT]: 'Absent',
      [AttendanceStatus.LATE]: 'Late',
      [AttendanceStatus.LEFT]: 'Left',
      [AttendanceStatus.LEFT_EARLY]: 'Left Early',
      [AttendanceStatus.LEFT_LATELY]: 'Left Lately',
    };

    const enriched: MyAttendanceRecordDto[] = rawRecords.map(r => {
      const iid = String(r.instituteId);
      const cid = r.classId ? String(r.classId) : undefined;
      const sid = String(r.studentId);
      const dbClass = cid ? classMap.get(cid) : undefined;

      const instituteName = r.instituteName || iid;
      const className = dbClass?.name || r.className || undefined;
      const studentName = r.studentName;

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
      if (r.status === AttendanceStatus.PRESENT) { totalPresent++; byInstitute[iid].totalPresent++; if (byStudent[sid]) byStudent[sid].totalPresent++; }
      else if (r.status === AttendanceStatus.ABSENT) { totalAbsent++; byInstitute[iid].totalAbsent++; if (byStudent[sid]) byStudent[sid].totalAbsent++; }
      else if (r.status === AttendanceStatus.LATE) { totalLate++; byInstitute[iid].totalLate++; if (byStudent[sid]) byStudent[sid].totalLate++; }
      else if (r.status === AttendanceStatus.LEFT) { totalLeft++; byInstitute[iid].totalLeft++; if (byStudent[sid]) byStudent[sid].totalLeft++; }
      else if (r.status === AttendanceStatus.LEFT_EARLY) { totalLeftEarly++; byInstitute[iid].totalLeftEarly++; if (byStudent[sid]) byStudent[sid].totalLeftEarly++; }
      else if (r.status === AttendanceStatus.LEFT_LATELY) { totalLeftLately++; byInstitute[iid].totalLeftLately++; if (byStudent[sid]) byStudent[sid].totalLeftLately++; }

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
    const totalPages = Math.ceil(totalRecords / limit);
    const paginated = enriched.slice((page - 1) * limit, page * limit);
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
      ...(child && childrenIds.length > 0 && { byStudent }),  // âœ… Include per-student breakdown when children data included
    };
  }

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // CLASS ATTENDANCE FROM INSTITUTE â€” new features
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

    // â”€â”€ 1. All active+verified students in this class â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

    // â”€â”€ 2. Fetch user names + global images â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

    // â”€â”€ 3. Institute-level attendance (classId IS NULL) for these students â”€
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

    // â”€â”€ 4. Class-level attendance (classId = classId) for these students â”€â”€
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

    // â”€â”€ 5. Build response items â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

    // â”€â”€ 6. Summary stats â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
   *     â†’ mark PRESENT at class level  (if markPresentFromInstitute: true, default)
   *   - Student has NO institute attendance, OR institute status is ABSENT (0)
   *     â†’ mark ABSENT at class level   (if markAbsentForUnmarked: true, default)
   *   - Student already has class-level attendance â†’ always skipped (idempotent)
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
    const todayDate = getCurrentSriLankaDate();
    const queryDate = dto.date || todayDate;

    // â”€â”€ 0. Date validation: only today's date is allowed â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if (queryDate !== todayDate) {
      throw new BadRequestException(
        `Attendance can only be marked for today (${todayDate}). Received date: ${queryDate}`,
      );
    }

    // â”€â”€ 1. All active+verified students in this class â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

    // â”€â”€ 2. Institute-level attendance â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

    // â”€â”€ 3. Existing class-level attendance (skip already-marked) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const existingClassRecords = await this.attendanceRecordRepository
      .createQueryBuilder('ar')
      .where('ar.institute_id = :instituteId', { instituteId })
      .andWhere('ar.student_id IN (:...studentIds)', { studentIds })
      .andWhere('ar.date = :date', { date: queryDate })
      .andWhere('ar.class_id = :classId', { classId })
      .andWhere('ar.subject_id IS NULL')
      .getMany();

    const alreadyMarkedSet = new Set(existingClassRecords.map(r => r.studentId));
    const existingClassMap = new Map<string, AttendanceRecordEntity>();
    for (const rec of existingClassRecords) {
      if (!existingClassMap.has(rec.studentId)) {
        existingClassMap.set(rec.studentId, rec);
      }
    }

    // â”€â”€ 4. Build student overrides map â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const overridesMap = new Map<string, AttendanceStatus>();
    if (dto.studentOverrides && dto.studentOverrides.length > 0) {
      for (const override of dto.studentOverrides) {
        overridesMap.set(override.studentId, override.status);
      }
    }

    // Status string â†’ numeric code helper
    const statusToCode = (s: AttendanceStatus): number => {
      const map: Record<string, number> = { present: 1, absent: 0, late: 2, left: 3, left_early: 4, left_lately: 5 };
      return map[s] ?? 1;
    };

    // â”€â”€ 5. Classify each student â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const toMarkPresent: string[] = [];
    const toMarkAbsent: string[] = [];
    const toMarkOther: { studentId: string; status: AttendanceStatus }[] = [];
    const skippedResults: any[] = [];

    // Already-marked students that need a status UPDATE (not re-mark)
    const toUpdateStatus: { studentId: string; status: AttendanceStatus; record: AttendanceRecordEntity }[] = [];

    for (const studentId of studentIds) {
      const overrideStatus = overridesMap.get(studentId);

      if (alreadyMarkedSet.has(studentId)) {
        if (overrideStatus) {
          // Student is already marked but has an override â†’ UPDATE existing record's status
          const existingRecord = existingClassMap.get(studentId);
          if (existingRecord) {
            toUpdateStatus.push({ studentId, status: overrideStatus, record: existingRecord });
          }
        } else {
          skippedResults.push({
            studentId,
            action: 'skipped_already_marked',
            classStatus: null,
            success: true,
          });
        }
        continue;
      }

      if (overrideStatus) {
        if (overrideStatus === AttendanceStatus.PRESENT) {
          toMarkPresent.push(studentId);
        } else if (overrideStatus === AttendanceStatus.ABSENT) {
          toMarkAbsent.push(studentId);
        } else {
          toMarkOther.push({ studentId, status: overrideStatus });
        }
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

    // â”€â”€ 5b. Update status of already-marked students (override = status change only) â”€â”€
    const updatedResults: any[] = [];
    for (const item of toUpdateStatus) {
      try {
        const newStatusCode = statusToCode(item.status);
        await this.attendanceRecordRepository
          .createQueryBuilder()
          .update(AttendanceRecordEntity)
          .set({ status: newStatusCode as any, timestamp: String(Date.now()) })
          .where('id = :id', { id: item.record.id })
          .execute();

        // Also update via raw query as fallback to ensure the column is set
        await this.attendanceRecordRepository.query(
          'UPDATE attendance_records SET status = ?, timestamp = ? WHERE id = ?',
          [newStatusCode, String(Date.now()), item.record.id],
        );

        updatedResults.push({
          studentId: item.studentId,
          action: `marked_${item.status}`,
          classStatus: item.status,
          success: true,
        });
      } catch (err) {
        this.logger.error(`bulkMarkClass: status update failed for ${item.studentId} â€” ${err.message}`);
        updatedResults.push({
          studentId: item.studentId,
          action: `marked_${item.status}`,
          classStatus: item.status,
          success: false,
          error: err.message,
        });
      }
    }

    // â”€â”€ 6. Build and execute bulk mark â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
        classSessionId: dto.sessionId,
        students: ids.map(studentId => ({
          studentId,
          status,
        })),
      };

      try {
        const bulkResult = await this.markBulkAttendance(bulkDto, markedBy);
        const action = `marked_${status}`;
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
        this.logger.error(`bulkMarkClassAttendanceFromInstituteAttendance: bulk ${status} failed â€” ${err.message}`);
        for (const studentId of ids) {
          allResults.push({
            studentId,
            action: `marked_${status}`,
            classStatus: status,
            success: false,
            error: err.message,
          });
        }
      }
    };

    await buildAndMark(toMarkPresent, AttendanceStatus.PRESENT);
    await buildAndMark(toMarkAbsent, AttendanceStatus.ABSENT);

    // Mark students with custom override statuses (late, left, left_early, left_lately)
    const otherStatusGroups = new Map<AttendanceStatus, string[]>();
    for (const item of toMarkOther) {
      if (!otherStatusGroups.has(item.status)) {
        otherStatusGroups.set(item.status, []);
      }
      otherStatusGroups.get(item.status)!.push(item.studentId);
    }
    for (const [status, ids] of otherStatusGroups) {
      await buildAndMark(ids, status);
    }

    // Include status-update results for already-marked students
    allResults.push(...updatedResults);

    const markedPresent = allResults.filter(r => r.action === 'marked_present' && r.success).length;
    const markedAbsent = allResults.filter(r => r.action === 'marked_absent' && r.success).length;
    const statusChanged = updatedResults.filter(r => r.success).length;
    const markedOverride = allResults.filter(r => r.action?.startsWith('marked_') && r.action !== 'marked_present' && r.action !== 'marked_absent' && r.success).length;
    const failed = allResults.filter(r => !r.success).length;
    const skipped = allResults.filter(r => r.action?.startsWith('skipped')).length;

    return {
      success: failed === 0,
      message: `Class attendance bulk-marked: ${markedPresent} present, ${markedAbsent} absent, ${markedOverride} overridden, ${statusChanged} status changed, ${skipped} skipped`,
      date: queryDate,
      summary: {
        total: studentIds.length,
        markedPresent,
        markedAbsent,
        markedOverride,
        skipped,
        failed,
      },
      results: allResults,
    };
  }

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // SINGLE STUDENT STATUS UPDATE â€” inline status change
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  /**
   * Update the attendance status of a single student for today.
   * Works for both class-level and subject-level attendance.
   *
   * PATCH /api/attendance/institute/:instituteId/class/:classId/student/:studentId/status
   */
  async updateStudentAttendanceStatus(
    instituteId: string,
    classId: string,
    studentId: string,
    status: AttendanceStatus,
    subjectId?: string,
    instituteName?: string,
    className?: string,
    subjectName?: string,
  ): Promise<{ success: boolean; message: string; studentId: string; newStatus: string }> {
    const todayDate = getCurrentSriLankaDate();

    // Status string â†’ numeric code
    const statusToCode = (s: AttendanceStatus): number => {
      const map: Record<string, number> = { present: 1, absent: 0, late: 2, left: 3, left_early: 4, left_lately: 5 };
      return map[s] ?? 1;
    };

    // Find the existing attendance record
    const qb = this.attendanceRecordRepository
      .createQueryBuilder('ar')
      .where('ar.institute_id = :instituteId', { instituteId })
      .andWhere('ar.class_id = :classId', { classId })
      .andWhere('ar.student_id = :studentId', { studentId })
      .andWhere('ar.date = :date', { date: todayDate });

    if (subjectId) {
      qb.andWhere('ar.subject_id = :subjectId', { subjectId });
    } else {
      qb.andWhere('ar.subject_id IS NULL');
    }

    const existingRecord = await qb.getOne();

    if (!existingRecord) {
      // No existing record â€” create a new one via bulk mark (single student)
      // Look up names if not provided
      const [institute, clazz] = await Promise.all([
        instituteName ? null : this.instituteRepository.findOne({ where: { id: instituteId as any }, select: { id: true, name: true } }),
        className ? null : this.classRepository.findOne({ where: { id: classId as any }, select: { id: true, name: true } }),
      ]);
      let resolvedSubjectName = subjectName;
      if (subjectId && !resolvedSubjectName) {
        const rows = await this.dataSource.query('SELECT name FROM institute_class_subjects WHERE id = ? LIMIT 1', [subjectId]);
        resolvedSubjectName = rows?.[0]?.name;
      }

      const bulkDto: BulkAttendanceDto = {
        instituteId,
        instituteName: instituteName || institute?.name || instituteId,
        classId,
        className: className || clazz?.name || classId,
        subjectId: subjectId || undefined,
        subjectName: resolvedSubjectName || undefined,
        date: todayDate,
        markingMethod: MarkingMethod.MANUAL,
        students: [{ studentId, status }],
      };

      const bulkResult = await this.markBulkAttendance(bulkDto, 'system');
      const anyFailed = bulkResult?.results?.some((r: any) => r.success === false);
      if (anyFailed) {
        throw new BadRequestException(`Failed to create attendance record for student ${studentId}`);
      }

      const scope = subjectId ? 'subject' : 'class';
      return {
        success: true,
        message: `Student marked ${status} in ${scope}`,
        studentId,
        newStatus: status,
      };
    }

    const newStatusCode = statusToCode(status);

    // Update via raw SQL to ensure correct column mapping
    await this.attendanceRecordRepository.query(
      'UPDATE attendance_records SET status = ?, timestamp = ? WHERE id = ?',
      [newStatusCode, String(Date.now()), existingRecord.id],
    );

    // Send notification for all status changes
    {
      try {
        // Look up names for notification
        const [institute, clazz] = await Promise.all([
          this.instituteRepository.findOne({ where: { id: instituteId as any }, select: { id: true, name: true } }),
          this.classRepository.findOne({ where: { id: classId as any }, select: { id: true, name: true } }),
        ]);
        let subjectName: string | undefined;
        if (subjectId) {
          const subjectRows = await this.dataSource.query(
            'SELECT name FROM institute_class_subjects WHERE id = ? LIMIT 1',
            [subjectId],
          );
          subjectName = subjectRows?.[0]?.name;
        }
        const studentData = await this.fetchStudentWithParentData(studentId);
        const studentName = studentData.student?.user
          ? (studentData.student.user.nameWithInitials || `${studentData.student.user.firstName} ${studentData.student.user.lastName || ''}`.trim())
          : studentId;

        const markDto: MarkAttendanceDto = {
          studentId,
          studentName,
          instituteId,
          instituteName: institute?.name || instituteId,
          classId,
          className: clazz?.name || classId,
          subjectId: subjectId || undefined,
          subjectName: subjectName || undefined,
          date: todayDate,
          status,
          markingMethod: MarkingMethod.MANUAL,
          userType: AttendanceUserType.STUDENT,
        };

        this.scheduleAttendanceNotification(markDto, { id: existingRecord.id }, studentData);
      } catch (notifErr) {
        this.logger.warn(`Status change notification failed: ${notifErr.message}`);
      }
    }

    const scope = subjectId ? 'subject' : 'class';
    return {
      success: true,
      message: `Student ${scope} attendance status changed to ${status}`,
      studentId,
      newStatus: status,
    };
  }

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // SUBJECT ATTENDANCE FROM CLASS â€” new features
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

    // â”€â”€ 1. All active+verified students enrolled in this subject â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

    // â”€â”€ 2. Fetch user names + images â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

    // â”€â”€ 3. Class-level attendance (classId set, subjectId IS NULL) for date â”€â”€
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

    // â”€â”€ 4. Subject-level attendance for these students â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

    // â”€â”€ 5. Build response items â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

    // â”€â”€ 6. Summary stats â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
   *     â†’ mark PRESENT at subject level  (if markPresentFromClass: true, default)
   *   - Student has NO class attendance, OR class status is ABSENT (0)
   *     â†’ mark ABSENT at subject level   (if markAbsentForUnmarked: true, default)
   *   - Student already has subject-level attendance â†’ always skipped (idempotent)
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
    const todayDate = getCurrentSriLankaDate();
    const queryDate = dto.date || todayDate;

    // â”€â”€ 0. Date validation: only today's date is allowed â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if (queryDate !== todayDate) {
      throw new BadRequestException(
        `Attendance can only be marked for today (${todayDate}). Received date: ${queryDate}`,
      );
    }

    // â”€â”€ 1. All active+verified students in this subject â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

    // â”€â”€ 2. Class-level attendance (classId set, subjectId IS NULL) â”€â”€â”€â”€â”€â”€â”€â”€
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

    // â”€â”€ 3. Existing subject-level attendance (skip already-marked) â”€â”€â”€â”€â”€â”€â”€â”€
    const existingSubjectRecords = await this.attendanceRecordRepository
      .createQueryBuilder('ar')
      .where('ar.institute_id = :instituteId', { instituteId })
      .andWhere('ar.student_id IN (:...studentIds)', { studentIds })
      .andWhere('ar.date = :date', { date: queryDate })
      .andWhere('ar.class_id = :classId', { classId })
      .andWhere('ar.subject_id = :subjectId', { subjectId })
      .getMany();

    const alreadyMarkedSet = new Set(existingSubjectRecords.map(r => r.studentId));
    const existingSubjectMap = new Map<string, AttendanceRecordEntity>();
    for (const rec of existingSubjectRecords) {
      if (!existingSubjectMap.has(rec.studentId)) {
        existingSubjectMap.set(rec.studentId, rec);
      }
    }

    // â”€â”€ 4. Build student overrides map â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const overridesMap = new Map<string, AttendanceStatus>();
    if (dto.studentOverrides && dto.studentOverrides.length > 0) {
      for (const override of dto.studentOverrides) {
        overridesMap.set(override.studentId, override.status);
      }
    }

    // Status string â†’ numeric code helper
    const statusToCode = (s: AttendanceStatus): number => {
      const map: Record<string, number> = { present: 1, absent: 0, late: 2, left: 3, left_early: 4, left_lately: 5 };
      return map[s] ?? 1;
    };

    // â”€â”€ 5. Classify each student â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const toMarkPresent: string[] = [];
    const toMarkAbsent: string[] = [];
    const toMarkOther: { studentId: string; status: AttendanceStatus }[] = [];
    const skippedResults: any[] = [];

    // Already-marked students that need a status UPDATE (not re-mark)
    const toUpdateStatus: { studentId: string; status: AttendanceStatus; record: AttendanceRecordEntity }[] = [];

    for (const studentId of studentIds) {
      const overrideStatus = overridesMap.get(studentId);

      if (alreadyMarkedSet.has(studentId)) {
        if (overrideStatus) {
          // Student is already marked but has an override â†’ UPDATE existing record's status
          const existingRecord = existingSubjectMap.get(studentId);
          if (existingRecord) {
            toUpdateStatus.push({ studentId, status: overrideStatus, record: existingRecord });
          }
        } else {
          skippedResults.push({
            studentId,
            action: 'skipped_already_marked',
            subjectStatus: null,
            success: true,
          });
        }
        continue;
      }

      if (overrideStatus) {
        if (overrideStatus === AttendanceStatus.PRESENT) {
          toMarkPresent.push(studentId);
        } else if (overrideStatus === AttendanceStatus.ABSENT) {
          toMarkAbsent.push(studentId);
        } else {
          toMarkOther.push({ studentId, status: overrideStatus });
        }
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

    // â”€â”€ 5b. Update status of already-marked students (override = status change only) â”€â”€
    const updatedResults: any[] = [];
    for (const item of toUpdateStatus) {
      try {
        const newStatusCode = statusToCode(item.status);
        await this.attendanceRecordRepository
          .createQueryBuilder()
          .update(AttendanceRecordEntity)
          .set({ status: newStatusCode as any, timestamp: String(Date.now()) })
          .where('id = :id', { id: item.record.id })
          .execute();

        // Also update via raw query as fallback to ensure the column is set
        await this.attendanceRecordRepository.query(
          'UPDATE attendance_records SET status = ?, timestamp = ? WHERE id = ?',
          [newStatusCode, String(Date.now()), item.record.id],
        );

        updatedResults.push({
          studentId: item.studentId,
          action: `marked_${item.status}`,
          subjectStatus: item.status,
          success: true,
        });
      } catch (err) {
        this.logger.error(`bulkMarkSubject: status update failed for ${item.studentId} â€” ${err.message}`);
        updatedResults.push({
          studentId: item.studentId,
          action: `marked_${item.status}`,
          subjectStatus: item.status,
          success: false,
          error: err.message,
        });
      }
    }

    // â”€â”€ 6. Build and execute bulk mark â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
        const action = `marked_${status}`;
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
        this.logger.error(`bulkMarkSubjectAttendanceFromClassAttendance: bulk ${status} failed â€” ${err.message}`);
        for (const studentId of ids) {
          allResults.push({
            studentId,
            action: `marked_${status}`,
            subjectStatus: status,
            success: false,
            error: err.message,
          });
        }
      }
    };

    await buildAndMark(toMarkPresent, AttendanceStatus.PRESENT);
    await buildAndMark(toMarkAbsent, AttendanceStatus.ABSENT);

    // Mark students with custom override statuses (late, left, left_early, left_lately)
    const otherSubjectStatusGroups = new Map<AttendanceStatus, string[]>();
    for (const item of toMarkOther) {
      if (!otherSubjectStatusGroups.has(item.status)) {
        otherSubjectStatusGroups.set(item.status, []);
      }
      otherSubjectStatusGroups.get(item.status)!.push(item.studentId);
    }
    for (const [status, ids] of otherSubjectStatusGroups) {
      await buildAndMark(ids, status);
    }

    // Include status-update results for already-marked students
    allResults.push(...updatedResults);

    const markedPresent = allResults.filter(r => r.action === 'marked_present' && r.success).length;
    const markedAbsent = allResults.filter(r => r.action === 'marked_absent' && r.success).length;
    const statusChanged = updatedResults.filter(r => r.success).length;
    const markedOverride = allResults.filter(r => r.action?.startsWith('marked_') && r.action !== 'marked_present' && r.action !== 'marked_absent' && r.success).length;
    const failed = allResults.filter(r => !r.success).length;
    const skipped = allResults.filter(r => r.action?.startsWith('skipped')).length;

    return {
      success: failed === 0,
      message: `Subject attendance bulk-marked: ${markedPresent} present, ${markedAbsent} absent, ${markedOverride} overridden, ${statusChanged} status changed, ${skipped} skipped`,
      date: queryDate,
      summary: {
        total: studentIds.length,
        markedPresent,
        markedAbsent,
        markedOverride,
        skipped,
        failed,
      },
      results: allResults,
    };
  }

  // ── Aggregate profile-page methods ─────────────────────────────────────────
  // Class profile: sessions+groups JOIN; lecture live/rec per student
  // Institute profile: calendar_events JOIN for event title/time

  async getStudentClassProfile(params: {
    instituteId: string; classId: string; studentId: string;
    startDate: string; endDate: string; limit: number;
  }): Promise<any> {
    const { instituteId, classId, studentId, startDate, endDate, limit } = params;

    const [membershipRows, classRows, attendanceRows, paymentRows,
      paymentSubRows, subjectRows, lectureRows] = await Promise.all([
        this.dataSource.query(
          `SELECT iu.user_id_institue userIdByInstitute, iu.institute_user_type, iu.institute_user_image_url, iu.extra_data,
                u.first_name, u.last_name, u.name_with_initials, u.email, u.phone_number,
                u.date_of_birth, u.gender, u.nic, u.address_line1, u.city, u.district, u.province, u.image_url,
                s.emergency_contact, s.medical_conditions, s.allergies, s.father_id, s.mother_id, s.guardian_id
         FROM institute_user iu JOIN users u ON u.id = iu.user_id
         LEFT JOIN students s ON s.user_id = iu.user_id
         WHERE (iu.user_id = ? OR iu.user_id_institue = ?) AND iu.institute_id = ? LIMIT 1`,
          [studentId, studentId, instituteId]),
        this.dataSource.query(
          `SELECT id, name, code, grade, specialty, academic_year academicYear, class_type classType
         FROM institute_classes WHERE id = ? LIMIT 1`, [classId]),
        this.dataSource.query(
          `SELECT ar.date, ar.\`timestamp\` markedAt, ar.status, ar.marking_method markingMethod,
                ar.class_session_id sessionId, ar.location,
                sess.name sessionName, sess.start_time sessionStart, sess.end_time sessionEnd,
                grp.id groupId, grp.name groupName, grp.color groupColor
         FROM attendance_records ar
         LEFT JOIN institute_class_attendance_sessions sess ON sess.id = ar.class_session_id
         LEFT JOIN institute_class_attendance_session_groups grp ON grp.id = sess.session_group_id
         WHERE ar.institute_id = ? AND ar.class_id = ? AND ar.student_id = ?
           AND ar.date >= ? AND ar.date <= ?
         ORDER BY ar.date DESC LIMIT ?`,
          [instituteId, classId, studentId, startDate, endDate, limit]),
        this.dataSource.query(
          `SELECT id, title, description, amount, status, due_date dueDate
         FROM institute_class_payments
         WHERE institute_id = ? AND class_id = ? AND is_active = 1
         ORDER BY due_date DESC LIMIT 50`, [instituteId, classId]).catch(() => []),
        this.dataSource.query(
          `SELECT payment_id paymentId, status, submitted_amount submittedAmount
         FROM institute_class_payment_submissions
         WHERE institute_id = ? AND class_id = ? AND submitted_by = ? LIMIT 200`,
          [instituteId, classId, studentId]).catch(() => []),
        this.dataSource.query(
          `SELECT sub.id subjectId, sub.name, sub.code, sub.image_url imageUrl,
                u.name_with_initials teacherName, u.image_url teacherImageUrl
         FROM institute_class_subjects ics JOIN subjects sub ON sub.id = ics.subject_id
         LEFT JOIN users u ON u.id = ics.teacher_id
         WHERE ics.class_id = ? AND ics.is_active = 1 ORDER BY sub.name ASC LIMIT 50`, [classId]).catch(() => []),
        this.dataSource.query(
          `SELECT l.id, l.title, l.status, l.start_time startTime, l.end_time endTime,
                l.live_attendance_enabled liveEnabled, l.rec_attendance_enabled recEnabled,
                l.recording_url recordingUrl, l.rec_duration_seconds recDuration,
                sub.id subjectId, sub.name subjectName
         FROM institute_class_subject_lectures l
         LEFT JOIN subjects sub ON sub.id = l.subject_id
         WHERE l.class_id = ? AND l.institute_id = ? AND l.is_active = 1
           AND (l.live_attendance_enabled = 1 OR l.rec_attendance_enabled = 1)
         ORDER BY l.start_time DESC LIMIT 50`, [classId, instituteId]).catch(() => []),
      ]);

    const mem = membershipRows[0] ?? {};
    const parentIds = [mem.father_id, mem.mother_id, mem.guardian_id].filter(Boolean);
    let parentRows: any[] = [];
    if (parentIds.length > 0) {
      parentRows = await this.dataSource.query(
        `SELECT u.id, u.name_with_initials, u.email, u.phone_number, u.image_url, p.occupation, p.work_place workPlace
         FROM users u LEFT JOIN parents p ON p.user_id = u.id
         WHERE u.id IN (${parentIds.map(() => '?').join(',')})`, parentIds).catch(() => []);
    }
    const parentMap: Record<string, any> = {};
    for (const p of parentRows) parentMap[p.id] = p;
    const getParent = (id?: string | null) => {
      if (!id || !parentMap[id]) return undefined;
      const p = parentMap[id];
      return {
        name: p.name_with_initials, email: p.email, phoneNumber: p.phone_number,
        occupation: p.occupation, workPlace: p.workPlace,
        imageUrl: p.image_url ? this.CloudStorageService.getFullUrl(p.image_url) : null
      };
    };

    let liveSessions: any[] = [];
    let recSessions: any[] = [];
    if (lectureRows.length > 0) {
      const ids = lectureRows.map((l: any) => l.id);
      const ph = ids.map(() => '?').join(',');
      [liveSessions, recSessions] = await Promise.all([
        this.dataSource.query(
          `SELECT lecture_id lectureId, join_time joinTime, leave_time leaveTime
           FROM lecture_live_attendance WHERE lecture_id IN (${ph}) AND user_id = ?
           ORDER BY join_time ASC`, [...ids, studentId]).catch(() => []),
        this.dataSource.query(
          `SELECT lecture_id lectureId, start_time startTime, end_time endTime,
                  total_watched_seconds watchedSeconds, seek_count seekCount,
                  total_video_duration_seconds videoDuration
           FROM lecture_recording_sessions WHERE lecture_id IN (${ph}) AND user_id = ?
           ORDER BY start_time ASC`, [...ids, studentId]).catch(() => []),
      ]);
    }
    const liveMap: Record<string, any[]> = {};
    for (const r of liveSessions) (liveMap[r.lectureId] ??= []).push(r);
    const recMap: Record<string, any[]> = {};
    for (const r of recSessions) (recMap[r.lectureId] ??= []).push(r);

    const imgUrl = (p?: string | null) => p ? this.CloudStorageService.getFullUrl(p) : null;

    const student = mem.first_name ? {
      id: studentId,
      fullName: `${mem.first_name ?? ''} ${mem.last_name ?? ''}`.trim() || null,
      name: mem.name_with_initials ?? `${mem.first_name ?? ''} ${mem.last_name ?? ''}`.trim(),
      nameWithInitials: mem.name_with_initials, email: mem.email, phoneNumber: mem.phone_number,
      dateOfBirth: mem.date_of_birth, gender: mem.gender, nic: mem.nic,
      addressLine1: mem.address_line1, city: mem.city, district: mem.district, province: mem.province,
      imageUrl: imgUrl(mem.institute_user_image_url ?? mem.image_url),
      instituteImageUrl: imgUrl(mem.institute_user_image_url),
      userIdByInstitute: mem.userIdByInstitute, role: mem.institute_user_type,
      emergencyContact: mem.emergency_contact, medicalConditions: mem.medical_conditions, allergies: mem.allergies,
      extraData: mem.extra_data ?? null,
      father: getParent(mem.father_id), mother: getParent(mem.mother_id), guardian: getParent(mem.guardian_id),
    } : null;

    const classInfo = classRows[0] ? {
      id: classRows[0].id, name: classRows[0].name, code: classRows[0].code,
      grade: classRows[0].grade, specialty: classRows[0].specialty, academicYear: classRows[0].academicYear,
    } : null;

    const attendance = attendanceRows.map((r: any) => ({
      date: r.date ?? '',
      markedAt: r.markedAt != null ? new Date(Number(r.markedAt)).toISOString() : null,
      status: (['absent','present','late','left','left_early','left_lately'] as const)[r.status] ?? 'absent',
      markingMethod: r.markingMethod, location: r.location,
      sessionId: r.sessionId ?? null, sessionName: r.sessionName ?? null,
      sessionStart: r.sessionStart ?? null, sessionEnd: r.sessionEnd ?? null,
      groupId: r.groupId ?? null, groupName: r.groupName ?? null, groupColor: r.groupColor ?? null,
    }));

    const subMap: Record<string, any> = {};
    for (const sub of paymentSubRows) subMap[sub.paymentId] = sub;
    const payments = paymentRows.map((p: any) => ({
      id: p.id, title: p.title, description: p.description, amount: p.amount,
      status: p.status, dueDate: p.dueDate,
      submissionStatus: subMap[p.id]?.status ?? null, submittedAmount: subMap[p.id]?.submittedAmount ?? null,
    }));

    const subjects = subjectRows.map((s: any) => ({
      id: s.subjectId, name: s.name, code: s.code, imageUrl: imgUrl(s.imageUrl),
      teacher: s.teacherName ? { name: s.teacherName, imageUrl: imgUrl(s.teacherImageUrl) } : null,
    }));

    const lectures = lectureRows.map((l: any) => {
      const lRows = liveMap[l.id] ?? [];
      const rRows = recMap[l.id] ?? [];
      const liveSecs = lRows.reduce((sum: number, r: any) =>
        sum + (!r.leaveTime ? 0 : Math.floor((new Date(r.leaveTime).getTime() - new Date(r.joinTime).getTime()) / 1000)), 0);
      return {
        id: l.id, title: l.title, status: l.status, startTime: l.startTime, endTime: l.endTime,
        subjectId: l.subjectId, subjectName: l.subjectName,
        liveEnabled: !!l.liveEnabled, recEnabled: !!l.recEnabled,
        recordingUrl: l.recordingUrl, recDurationSeconds: l.recDuration,
        liveAttendance: {
          present: lRows.length > 0, totalSessions: lRows.length, totalSeconds: liveSecs,
          sessions: lRows.map((r: any) => ({ joinTime: r.joinTime, leaveTime: r.leaveTime })),
        },
        recordingActivity: {
          watched: rRows.length > 0,
          totalWatchedSeconds: rRows.reduce((s: number, r: any) => s + (r.watchedSeconds ?? 0), 0),
          sessionCount: rRows.length,
          sessions: rRows.map((r: any) => ({
            startTime: r.startTime, endTime: r.endTime,
            watchedSeconds: r.watchedSeconds, seekCount: r.seekCount ?? 0, videoDuration: r.videoDuration,
          })),
        },
      };
    });

    return { success: true, student, classInfo, attendance, payments, subjects, lectures };
  }

  async getStudentInstituteProfile(params: {
    instituteId: string; studentId: string;
    startDate: string; endDate: string; limit: number;
  }): Promise<any> {
    const { instituteId, studentId, startDate, endDate, limit } = params;

    const [membershipRows, attendanceRows, paymentRows, paymentSubRows, classRows] = await Promise.all([
      this.dataSource.query(
        `SELECT iu.user_id_institue userIdByInstitute, iu.institute_user_type, iu.institute_user_image_url, iu.extra_data,
                u.first_name, u.last_name, u.name_with_initials, u.email, u.phone_number,
                u.date_of_birth, u.gender, u.nic, u.address_line1, u.address_line2,
                u.city, u.district, u.province, u.image_url,
                s.emergency_contact, s.medical_conditions, s.allergies, s.father_id, s.mother_id, s.guardian_id
         FROM institute_user iu JOIN users u ON u.id = iu.user_id
         LEFT JOIN students s ON s.user_id = iu.user_id
         WHERE (iu.user_id = ? OR iu.user_id_institue = ?) AND iu.institute_id = ? LIMIT 1`,
        [studentId, studentId, instituteId]),
      this.dataSource.query(
        `SELECT ar.date, ar.\`timestamp\` markedAt, ar.status, ar.marking_method markingMethod,
                ar.location, ar.event_id eventId,
                ev.title eventTitle, ev.event_type eventType,
                ev.start_time eventStart, ev.end_time eventEnd,
                ev.venue eventVenue, ev.is_mandatory isMandatory
         FROM attendance_records ar
         LEFT JOIN institute_calendar_events ev ON ev.id = ar.event_id
         WHERE ar.institute_id = ? AND ar.student_id = ? AND ar.class_id IS NULL
           AND ar.date >= ? AND ar.date <= ?
         ORDER BY ar.date DESC LIMIT ?`,
        [instituteId, studentId, startDate, endDate, limit]),
      this.dataSource.query(
        `SELECT id, payment_type paymentType, description, amount, status, due_date dueDate
         FROM institute_payments WHERE institute_id = ? AND is_active = 1
         ORDER BY due_date DESC LIMIT 50`, [instituteId]).catch(() => []),
      this.dataSource.query(
        `SELECT payment_id paymentId, status, payment_amount submittedAmount
         FROM institute_payment_submissions
         WHERE institute_id = ? AND submitted_by = ?
         ORDER BY created_at DESC LIMIT 100`, [instituteId, studentId]).catch(() => []),
      this.dataSource.query(
        `SELECT ics.institute_class_id classId, ics.is_verified, ics.created_at enrolledAt,
                ic.name className, ic.code classCode, ic.grade, ic.specialty,
                ic.academic_year academicYear, ic.class_type classType, ic.image_url classImageUrl
         FROM institute_class_students ics JOIN institute_classes ic ON ic.id = ics.institute_class_id
         WHERE ics.student_user_id = ? AND ics.institute_id = ? AND ics.is_active = 1
         ORDER BY ics.is_verified DESC, ics.created_at DESC LIMIT 50`,
        [studentId, instituteId]).catch(() => []),
    ]);

    const mem = membershipRows[0] ?? {};
    const parentIds = [mem.father_id, mem.mother_id, mem.guardian_id].filter(Boolean);
    let parentRows: any[] = [];
    if (parentIds.length > 0) {
      parentRows = await this.dataSource.query(
        `SELECT u.id, u.name_with_initials, u.email, u.phone_number, u.image_url, p.occupation, p.work_place workPlace
         FROM users u LEFT JOIN parents p ON p.user_id = u.id
         WHERE u.id IN (${parentIds.map(() => '?').join(',')})`, parentIds).catch(() => []);
    }
    const parentMap: Record<string, any> = {};
    for (const p of parentRows) parentMap[p.id] = p;
    const getParent = (id?: string | null) => {
      if (!id || !parentMap[id]) return undefined;
      const p = parentMap[id];
      return {
        name: p.name_with_initials, email: p.email, phoneNumber: p.phone_number,
        occupation: p.occupation, workPlace: p.workPlace,
        imageUrl: p.image_url ? this.CloudStorageService.getFullUrl(p.image_url) : null
      };
    };

    const imgUrl = (p?: string | null) => p ? this.CloudStorageService.getFullUrl(p) : null;

    const student = mem.first_name ? {
      id: studentId,
      fullName: `${mem.first_name ?? ''} ${mem.last_name ?? ''}`.trim() || null,
      name: mem.name_with_initials ?? `${mem.first_name ?? ''} ${mem.last_name ?? ''}`.trim(),
      nameWithInitials: mem.name_with_initials, email: mem.email, phoneNumber: mem.phone_number,
      dateOfBirth: mem.date_of_birth, gender: mem.gender, nic: mem.nic,
      addressLine1: mem.address_line1, addressLine2: mem.address_line2,
      city: mem.city, district: mem.district, province: mem.province,
      imageUrl: imgUrl(mem.institute_user_image_url ?? mem.image_url),
      instituteImageUrl: imgUrl(mem.institute_user_image_url),
      userIdByInstitute: mem.userIdByInstitute, role: mem.institute_user_type,
      emergencyContact: mem.emergency_contact, medicalConditions: mem.medical_conditions, allergies: mem.allergies,
      extraData: mem.extra_data ?? null,
      father: getParent(mem.father_id), mother: getParent(mem.mother_id), guardian: getParent(mem.guardian_id),
    } : null;

    const attendance = attendanceRows.map((r: any) => ({
      date: r.date ?? '',
      markedAt: r.markedAt != null ? new Date(Number(r.markedAt)).toISOString() : null,
      status: (['absent','present','late','left','left_early','left_lately'] as const)[r.status] ?? 'absent',
      markingMethod: r.markingMethod, location: r.location,
      eventId: r.eventId ?? null, eventTitle: r.eventTitle ?? null,
      eventType: r.eventType ?? null, eventStart: r.eventStart ?? null,
      eventEnd: r.eventEnd ?? null, eventVenue: r.eventVenue ?? null, isMandatory: !!r.isMandatory,
    }));

    const subMap: Record<string, any> = {};
    for (const sub of paymentSubRows) subMap[sub.paymentId] = sub;
    const payments = paymentRows.map((p: any) => ({
      id: p.id, source: 'INSTITUTE', paymentType: p.paymentType, description: p.description,
      amount: p.amount, dueDate: p.dueDate, status: p.status,
      submissionStatus: subMap[p.id]?.status ?? null, submittedAmount: subMap[p.id]?.submittedAmount ?? null,
    }));

    const enrolledClasses = classRows.map((c: any) => ({
      classId: c.classId, className: c.className, classCode: c.classCode, grade: c.grade,
      specialty: c.specialty, academicYear: c.academicYear, classType: c.classType,
      classImageUrl: imgUrl(c.classImageUrl), isVerified: !!c.is_verified, enrolledAt: c.enrolledAt,
    }));

    return { success: true, student, attendance, payments, enrolledClasses };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // BATCH CLASS-LEVEL REPORT DATA
  // Returns full report payload for one or more students in a class.
  // Each date-range window is independent; withActivities includes per-session
  // recording detail rows alongside the lecture summary.
  // Access: InstituteAdmin → any class; Teacher → only their assigned class.
  // ─────────────────────────────────────────────────────────────────────────
  async getStudentClassReportData(params: {
    instituteId: string;
    classId: string;
    studentIds: string[];           // 1..N students
    attendanceStart: string;        // YYYY-MM-DD
    attendanceEnd: string;
    paymentsStart: string;          // YYYY-MM-DD
    paymentsEnd: string;
    liveStart: string;              // YYYY-MM-DD  (filter lecture start_time)
    liveEnd: string;
    recordingStart: string;         // YYYY-MM-DD
    recordingEnd: string;
    withActivities?: boolean;       // include per-session recording rows
    attendanceLimit?: number;       // default 500
  }): Promise<any> {
    const {
      instituteId, classId, studentIds,
      attendanceStart, attendanceEnd,
      paymentsStart, paymentsEnd,
      liveStart, liveEnd,
      recordingStart, recordingEnd,
      withActivities = false,
      attendanceLimit = 500,
    } = params;

    if (!studentIds.length) return { success: true, students: [] };

    const ph = (n: number) => Array(n).fill('?').join(',');

    // ── 1. Student membership rows (one query for all ids) ──────────────────
    const membershipRows: any[] = await this.dataSource.query(
      `SELECT iu.user_id userId, iu.user_id_institue userIdByInstitute,
              iu.institute_user_type, iu.institute_user_image_url, iu.extra_data,
              u.first_name, u.last_name, u.name_with_initials, u.email, u.phone_number,
              u.date_of_birth, u.gender, u.nic, u.address_line1, u.city, u.district, u.province, u.image_url,
              s.emergency_contact, s.medical_conditions, s.allergies,
              s.father_id, s.mother_id, s.guardian_id
       FROM institute_user iu
       JOIN users u ON u.id = iu.user_id
       LEFT JOIN students s ON s.user_id = iu.user_id
       WHERE (iu.user_id IN (${ph(studentIds.length)}) OR iu.user_id_institue IN (${ph(studentIds.length)}))
         AND iu.institute_id = ?`,
      [...studentIds, ...studentIds, instituteId],
    );

    // Build studentId → membership row map (prefer UUID match, fall back to instituteId)
    const memByUuid: Record<string, any> = {};
    const memByInstId: Record<string, any> = {};
    for (const m of membershipRows) {
      memByUuid[m.userId] = m;
      if (m.userIdByInstitute) memByInstId[m.userIdByInstitute] = m;
    }
    const resolveStudent = (sid: string) => memByUuid[sid] ?? memByInstId[sid] ?? null;

    // ── 2. Collect parent ids and fetch parents ─────────────────────────────
    const allParentIds = [...new Set(
      membershipRows.flatMap((m: any) => [m.father_id, m.mother_id, m.guardian_id].filter(Boolean))
    )];
    let parentRows: any[] = [];
    if (allParentIds.length) {
      parentRows = await this.dataSource.query(
        `SELECT u.id, u.name_with_initials, u.email, u.phone_number, u.image_url,
                p.occupation, p.work_place workPlace
         FROM users u LEFT JOIN parents p ON p.user_id = u.id
         WHERE u.id IN (${ph(allParentIds.length)})`, allParentIds,
      ).catch(() => []);
    }
    const parentMap: Record<string, any> = {};
    for (const p of parentRows) parentMap[p.id] = p;
    const imgUrl = (v?: string | null) => v ? this.CloudStorageService.getFullUrl(v) : null;
    const getParent = (id?: string | null) => {
      if (!id || !parentMap[id]) return undefined;
      const p = parentMap[id];
      return {
        name: p.name_with_initials, email: p.email, phoneNumber: p.phone_number,
        occupation: p.occupation, workPlace: p.workPlace, imageUrl: imgUrl(p.image_url),
      };
    };

    // ── 3. Class info ───────────────────────────────────────────────────────
    const classRows: any[] = await this.dataSource.query(
      `SELECT id, name, code, grade, specialty, academic_year academicYear, class_type classType
       FROM institute_classes WHERE id = ? LIMIT 1`, [classId],
    );
    const classInfo = classRows[0]
      ? { id: classRows[0].id, name: classRows[0].name, code: classRows[0].code, grade: classRows[0].grade, specialty: classRows[0].specialty, academicYear: classRows[0].academicYear }
      : null;

    // ── 4. Parallel bulk fetches ────────────────────────────────────────────
    const [attRows, payDefs, paySubs, lectureRows] = await Promise.all([
      // Attendance – filtered by attendanceStart..attendanceEnd
      this.dataSource.query(
        `SELECT ar.student_id studentId, ar.date, ar.\`timestamp\` markedAt,
                ar.status, ar.marking_method markingMethod, ar.location,
                sess.name sessionName, sess.start_time sessionStart, sess.end_time sessionEnd,
                grp.id groupId, grp.name groupName, grp.color groupColor
         FROM attendance_records ar
         LEFT JOIN institute_class_attendance_sessions sess ON sess.id = ar.class_session_id
         LEFT JOIN institute_class_attendance_session_groups grp ON grp.id = sess.session_group_id
         WHERE ar.institute_id = ? AND ar.class_id = ?
           AND ar.student_id IN (${ph(studentIds.length)})
           AND ar.date >= ? AND ar.date <= ?
         ORDER BY ar.date DESC LIMIT ?`,
        [instituteId, classId, ...studentIds, attendanceStart, attendanceEnd, attendanceLimit * studentIds.length],
      ).catch(() => []),

      // Payment definitions – filtered by paymentsStart..paymentsEnd (due_date window)
      this.dataSource.query(
        `SELECT id, title, description, amount, status, due_date dueDate
         FROM institute_class_payments
         WHERE institute_id = ? AND class_id = ? AND is_active = 1
           AND (due_date IS NULL OR (due_date >= ? AND due_date <= ?))
         ORDER BY due_date DESC LIMIT 100`,
        [instituteId, classId, paymentsStart, paymentsEnd],
      ).catch(() => []),

      // Submission status per student
      this.dataSource.query(
        `SELECT payment_id paymentId, submitted_by submittedBy, status, submitted_amount submittedAmount
         FROM institute_class_payment_submissions
         WHERE institute_id = ? AND class_id = ? AND submitted_by IN (${ph(studentIds.length)})
         LIMIT ${studentIds.length * 200}`,
        [instituteId, classId, ...studentIds],
      ).catch(() => []),

      // Lectures with live/rec attendance enabled – filtered by liveStart..liveEnd or recordingStart..recordingEnd
      this.dataSource.query(
        `SELECT l.id, l.title, l.status, l.start_time startTime, l.end_time endTime,
                l.live_attendance_enabled liveEnabled, l.rec_attendance_enabled recEnabled,
                l.recording_url recordingUrl, l.rec_duration_seconds recDuration,
                sub.id subjectId, sub.name subjectName
         FROM institute_class_subject_lectures l
         LEFT JOIN subjects sub ON sub.id = l.subject_id
         WHERE l.class_id = ? AND l.institute_id = ? AND l.is_active = 1
           AND (l.live_attendance_enabled = 1 OR l.rec_attendance_enabled = 1)
           AND (
             (l.live_attendance_enabled = 1 AND DATE(l.start_time) >= ? AND DATE(l.start_time) <= ?)
             OR
             (l.rec_attendance_enabled = 1 AND DATE(l.start_time) >= ? AND DATE(l.start_time) <= ?)
           )
         ORDER BY l.start_time DESC LIMIT 300`,
        [classId, instituteId, liveStart, liveEnd, recordingStart, recordingEnd],
      ).catch(() => []),
    ]);

    // ── 5. Per-student live + recording sessions ────────────────────────────
    let liveSessionRows: any[] = [];
    let recSessionRows: any[] = [];
    if (lectureRows.length && studentIds.length) {
      const lectureIds = lectureRows.map((l: any) => l.id);
      const lPh = ph(lectureIds.length);
      const sPh = ph(studentIds.length);
      [liveSessionRows, recSessionRows] = await Promise.all([
        this.dataSource.query(
          `SELECT lecture_id lectureId, user_id userId, join_time joinTime, leave_time leaveTime
           FROM lecture_live_attendance
           WHERE lecture_id IN (${lPh}) AND user_id IN (${sPh})
           ORDER BY join_time ASC`,
          [...lectureIds, ...studentIds],
        ).catch(() => []),
        this.dataSource.query(
          `SELECT lecture_id lectureId, user_id userId,
                  start_time startTime, end_time endTime,
                  total_watched_seconds watchedSeconds, seek_count seekCount,
                  total_video_duration_seconds videoDuration
           FROM lecture_recording_sessions
           WHERE lecture_id IN (${lPh}) AND user_id IN (${sPh})
           ORDER BY start_time ASC`,
          [...lectureIds, ...studentIds],
        ).catch(() => []),
      ]);
    }

    // ── 6. Build lookup maps ────────────────────────────────────────────────
    // attendance grouped by studentId
    const attByStudent: Record<string, any[]> = {};
    for (const r of attRows) (attByStudent[r.studentId] ??= []).push(r);

    // payment submission by studentId → paymentId
    const subByStudentPayment: Record<string, Record<string, any>> = {};
    for (const sub of paySubs) {
      (subByStudentPayment[sub.submittedBy] ??= {})[sub.paymentId] = sub;
    }

    // live sessions: lectureId → userId → rows[]
    const liveMap: Record<string, Record<string, any[]>> = {};
    for (const r of liveSessionRows) {
      ((liveMap[r.lectureId] ??= {})[r.userId] ??= []).push(r);
    }
    // recording sessions: lectureId → userId → rows[]
    const recMap: Record<string, Record<string, any[]>> = {};
    for (const r of recSessionRows) {
      ((recMap[r.lectureId] ??= {})[r.userId] ??= []).push(r);
    }

    // ── 7. Assemble per-student output ─────────────────────────────────────
    const students = studentIds.map((sid) => {
      const mem = resolveStudent(sid);
      if (!mem) return { id: sid, student: null, attendance: [], payments: [], lectures: [] };

      const resolvedId = mem.userId as string;

      // Student detail
      const student = {
        id: resolvedId,
        fullName: `${mem.first_name ?? ''} ${mem.last_name ?? ''}`.trim() || null,
        name: mem.name_with_initials ?? `${mem.first_name ?? ''} ${mem.last_name ?? ''}`.trim(),
        nameWithInitials: mem.name_with_initials,
        email: mem.email, phoneNumber: mem.phone_number,
        dateOfBirth: mem.date_of_birth, gender: mem.gender, nic: mem.nic,
        addressLine1: mem.address_line1, city: mem.city, district: mem.district, province: mem.province,
        imageUrl: imgUrl(mem.institute_user_image_url ?? mem.image_url),
        userIdByInstitute: mem.userIdByInstitute,
        role: mem.institute_user_type,
        emergencyContact: mem.emergency_contact,
        medicalConditions: mem.medical_conditions,
        allergies: mem.allergies,
        extraData: mem.extra_data ?? null,
        father: getParent(mem.father_id),
        mother: getParent(mem.mother_id),
        guardian: getParent(mem.guardian_id),
      };

      // Attendance
      const attendance = (attByStudent[resolvedId] ?? attByStudent[sid] ?? []).map((r: any) => ({
        date: r.date ?? '',
        markedAt: r.markedAt != null ? new Date(Number(r.markedAt)).toISOString() : null,
        status: (['absent','present','late','left','left_early','left_lately'] as const)[r.status] ?? 'absent',
        markingMethod: r.markingMethod, location: r.location,
        sessionName: r.sessionName ?? null,
        sessionStart: r.sessionStart ?? null, sessionEnd: r.sessionEnd ?? null,
        groupId: r.groupId ?? null, groupName: r.groupName ?? null, groupColor: r.groupColor ?? null,
      }));

      // Payments
      const subMap = subByStudentPayment[resolvedId] ?? subByStudentPayment[sid] ?? {};
      const payments = payDefs.map((p: any) => ({
        id: p.id, title: p.title, description: p.description,
        amount: p.amount, status: p.status, dueDate: p.dueDate,
        submissionStatus: subMap[p.id]?.status ?? null,
        submittedAmount: subMap[p.id]?.submittedAmount ?? null,
      }));

      // Lectures with per-student live + recording data
      const lectures = lectureRows.map((l: any) => {
        const lRows = (liveMap[l.id]?.[resolvedId] ?? liveMap[l.id]?.[sid] ?? []);
        const rRows = (recMap[l.id]?.[resolvedId] ?? recMap[l.id]?.[sid] ?? []);
        const liveSecs = lRows.reduce((sum: number, r: any) =>
          sum + (!r.leaveTime ? 0 : Math.floor((new Date(r.leaveTime).getTime() - new Date(r.joinTime).getTime()) / 1000)), 0);
        const totalWatched = rRows.reduce((sum: number, r: any) => sum + (r.watchedSeconds ?? 0), 0);
        return {
          id: l.id, title: l.title, status: l.status,
          startTime: l.startTime, endTime: l.endTime,
          subjectId: l.subjectId, subjectName: l.subjectName,
          liveEnabled: !!l.liveEnabled, recEnabled: !!l.recEnabled,
          recordingUrl: l.recordingUrl, recDurationSeconds: l.recDuration,
          liveAttendance: {
            present: lRows.length > 0,
            totalSessions: lRows.length,
            totalSeconds: liveSecs,
            sessions: lRows.map((r: any) => ({ joinTime: r.joinTime, leaveTime: r.leaveTime })),
          },
          recordingActivity: {
            watched: rRows.length > 0,
            totalWatchedSeconds: totalWatched,
            sessionCount: rRows.length,
            // per-session rows only when withActivities=true
            sessions: withActivities
              ? rRows.map((r: any) => ({
                  startTime: r.startTime, endTime: r.endTime,
                  watchedSeconds: r.watchedSeconds, seekCount: r.seekCount ?? 0, videoDuration: r.videoDuration,
                }))
              : [],
          },
        };
      });

      return { id: sid, student, classInfo, attendance, payments, lectures };
    });

    return { success: true, students };
  }
}

