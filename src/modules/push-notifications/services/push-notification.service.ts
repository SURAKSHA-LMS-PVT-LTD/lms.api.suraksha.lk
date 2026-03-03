import { Injectable, Logger, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { plainToInstance } from 'class-transformer';
import { PushNotificationRepository } from '../repositories/push-notification.repository';
import { PushNotificationEntity, NotificationScope, NotificationStatus, NotificationTargetUserType } from '../entities/push-notification.entity';
import { CreatePushNotificationDto } from '../dto/create-push-notification.dto';
import { QueryPushNotificationDto, QueryUserNotificationsDto } from '../dto/query-push-notification.dto';
import { 
  PushNotificationResponseDto, 
  UserNotificationResponseDto,
  PaginatedPushNotificationResponseDto,
  PaginatedUserNotificationResponseDto,
  SendNotificationResultDto,
  UnreadCountResponseDto
} from '../dto/push-notification-response.dto';
import { FcmNotificationService, FcmNotificationPayload } from '../../../common/services/fcm-notification.service';
import { UserFcmTokenRepository } from '../../user/repositories/user-fcm-token.repository';
import { InstituteUserEntity } from '../../institute_mudules/institue_user/entities/institue_user.entity';
import { InstituteUserStatus } from '../../institute_mudules/institue_user/enums/institute-user-status.enum';
import { InstituteUserType } from '../../institute_mudules/institue_user/enums/institute-user-type.enum';
import { InstituteClassStudentEntity } from '../../institute_class_modules/institute_class_student/entities/institute_class_student.entity';
import { InstituteClassSubjectStudent } from '../../institute_class_subject_modules/institute_class_subject_students/entities/institute_class_subject_student.entity';
import { InstituteClassSubjectEntity } from '../../institute_class_modules/institute_class_subject/entities/institute_class_subject.entity';
import { StudentEntity } from '../../student/entities/student.entity';
import { UserEntity } from '../../user/entities/user.entity';
import { UserType } from '../../user/enums/user-type.enum';
import { now } from '../../../common/utils/timezone.util';

@Injectable()
export class PushNotificationService {
  private readonly logger = new Logger(PushNotificationService.name);

  constructor(
    private readonly notificationRepository: PushNotificationRepository,
    private readonly fcmService: FcmNotificationService,
    private readonly fcmTokenRepository: UserFcmTokenRepository,
    @InjectRepository(InstituteUserEntity)
    private readonly instituteUserRepository: Repository<InstituteUserEntity>,
    @InjectRepository(InstituteClassStudentEntity)
    private readonly classStudentRepository: Repository<InstituteClassStudentEntity>,
    @InjectRepository(InstituteClassSubjectStudent)
    private readonly subjectStudentRepository: Repository<InstituteClassSubjectStudent>,
    @InjectRepository(InstituteClassSubjectEntity)
    private readonly classSubjectRepository: Repository<InstituteClassSubjectEntity>,
    @InjectRepository(StudentEntity)
    private readonly studentRepository: Repository<StudentEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
  ) {}

  /**
   * Create a new push notification (admin/teacher)
   */
  async create(
    createDto: CreatePushNotificationDto, 
    senderId: string, 
    senderRole: string
  ): Promise<PushNotificationResponseDto> {
    this.logger.log(`🆕 Creating notification from ${senderRole} (senderId: ${senderId})`);
    this.logger.log(`📝 Request: ${JSON.stringify({
      title: createDto.title,
      body: createDto.body?.substring(0, 100),
      scope: createDto.scope,
      targetUserTypes: createDto.targetUserTypes,
      priority: createDto.priority,
      sendImmediately: createDto.sendImmediately,
      hasDataPayload: !!createDto.dataPayload,
      dataPayload: createDto.dataPayload,
      hasImageUrl: !!createDto.imageUrl,
      hasActionUrl: !!createDto.actionUrl
    }, null, 2)}`);

    // Validate scope requirements
    this.validateScopeRequirements(createDto);

    const notification = await this.notificationRepository.create(createDto, senderId, senderRole);
    this.logger.log(`💾 Notification created with ID: ${notification.id}`);

    // If send immediately flag is set, send right away
    if (createDto.sendImmediately !== false && !createDto.scheduledAt) {
      this.logger.log(`📤 Sending notification immediately...`);
      await this.sendNotification(notification.id);
    } else {
      this.logger.log(`⏰ Notification scheduled or saved as draft`);
    }

    const result = await this.notificationRepository.findOne(notification.id);
    // Manual mapping to preserve dates
    return {
      id: result.id,
      title: result.title,
      body: result.body,
      imageUrl: result.imageUrl,
      icon: result.icon,
      actionUrl: result.actionUrl,
      dataPayload: result.dataPayload,
      scope: result.scope,
      targetUserTypes: result.targetUserTypes,
      instituteId: result.instituteId,
      institute: result.institute,
      classId: result.classId,
      class: result.class,
      subjectId: result.subjectId,
      subject: result.subject,
      priority: result.priority,
      status: result.status,
      collapseKey: result.collapseKey,
      timeToLive: result.timeToLive,
      scheduledAt: result.scheduledAt,
      sentAt: result.sentAt,
      senderId: result.senderId,
      senderRole: result.senderRole,
      sender: result.sender,
      totalRecipients: result.totalRecipients,
      sentCount: result.sentCount,
      failedCount: result.failedCount,
      readCount: result.readCount,
      createdAt: result.createdAt,
      updatedAt: result.updatedAt
    } as PushNotificationResponseDto;
  }

  /**
   * Validate that scope requirements are met
   */
  private validateScopeRequirements(dto: CreatePushNotificationDto): void {
    if (dto.scope === NotificationScope.GLOBAL) {
      // Global notifications should not have institute/class/subject
      if (dto.instituteId || dto.classId || dto.subjectId) {
        throw new BadRequestException('Global notifications should not have institute, class, or subject specified');
      }
    } else if (dto.scope === NotificationScope.INSTITUTE) {
      if (!dto.instituteId) {
        throw new BadRequestException('Institute ID is required for institute-scope notifications');
      }
    } else if (dto.scope === NotificationScope.CLASS) {
      if (!dto.instituteId || !dto.classId) {
        throw new BadRequestException('Institute ID and Class ID are required for class-scope notifications');
      }
    } else if (dto.scope === NotificationScope.SUBJECT) {
      if (!dto.instituteId || !dto.classId || !dto.subjectId) {
        throw new BadRequestException('Institute ID, Class ID, and Subject ID are required for subject-scope notifications');
      }
    }
  }

  /**
   * Send notification to targeted users
   */
  async sendNotification(notificationId: string): Promise<SendNotificationResultDto> {
    this.logger.log(`🚀 ===== SENDING NOTIFICATION ${notificationId} =====`);
    const notification = await this.notificationRepository.findOne(notificationId);
    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    this.logger.log(`📋 Notification details: ${JSON.stringify({
      id: notification.id,
      title: notification.title,
      body: notification.body?.substring(0, 50),
      scope: notification.scope,
      targetUserTypes: notification.targetUserTypes,
      priority: notification.priority,
      hasDataPayload: !!notification.dataPayload,
      dataPayloadKeys: notification.dataPayload ? Object.keys(notification.dataPayload) : [],
      dataPayloadTypes: notification.dataPayload ? Object.entries(notification.dataPayload).map(([k,v]) => `${k}:${typeof v}`) : []
    }, null, 2)}`);

    // Update status to sending
    await this.notificationRepository.updateStatus(notificationId, NotificationStatus.SENDING);

    try {
      // Get target user IDs based on scope and target types
      const targetUserIds = await this.getTargetUserIds(notification);
      this.logger.log(`🎯 Found ${targetUserIds.length} target users`);

      if (targetUserIds.length === 0) {
        await this.notificationRepository.updateStatus(notificationId, NotificationStatus.SENT);
        await this.notificationRepository.updateStats(notificationId, { totalRecipients: 0, sentCount: 0, failedCount: 0 });
        return {
          success: true,
          notificationId,
          totalRecipients: 0,
          sentCount: 0,
          failedCount: 0,
          usersWithoutTokens: 0,
          usersWithTokens: 0,
          message: 'No recipients found for this notification',
          details: {
            targetedUsers: 0,
            usersWithTokens: 0,
            usersWithoutTokens: 0,
            successfulSends: 0,
            failedSends: 0,
            deliveryRate: '0.0%',
          },
        };
      }

      // Prepare FCM payload
      const fcmPayload: FcmNotificationPayload = {
        title: notification.title,
        body: notification.body,
        imageUrl: notification.imageUrl,
        icon: notification.icon,
      };

      this.logger.log(`📦 FCM Notification Payload: ${JSON.stringify(fcmPayload, null, 2)}`);

      const dataPayload = {
        notificationId: notification.id,
        scope: notification.scope,
        ...(notification.dataPayload || {}),
        ...(notification.actionUrl ? { actionUrl: notification.actionUrl } : {}),
        ...(notification.instituteId ? { instituteId: notification.instituteId } : {}),
        ...(notification.classId ? { classId: notification.classId } : {}),
        ...(notification.subjectId ? { subjectId: notification.subjectId } : {}),
      };

      this.logger.log(`📦 FCM Data Payload (before sanitization): ${JSON.stringify(dataPayload, null, 2)}`);
      this.logger.log(`📦 Data Payload Types: ${JSON.stringify(
        Object.entries(dataPayload).map(([k, v]) => ({ key: k, type: typeof v, value: v }))
      , null, 2)}`);

      // Send to all target users
      this.logger.log(`🚀 Calling FCM service to send to ${targetUserIds.length} users...`);
      const result = await this.fcmService.sendToUsers(
        targetUserIds,
        fcmPayload,
        dataPayload,
        {
          priority: notification.priority === 'HIGH' ? 'high' : 'normal',
          timeToLive: notification.timeToLive,
          collapseKey: notification.collapseKey,
        }
      );

      this.logger.log(`✅ FCM service returned: ${JSON.stringify({
        totalSuccess: result.totalSuccess,
        totalFailure: result.totalFailure,
        userResultsCount: result.userResults.length
      })}`);

      // Count users with and without tokens
      const usersWithTokens = result.userResults.filter(r => r.result.successCount > 0 || r.result.failureCount > 0).length;
      const usersWithoutTokens = targetUserIds.length - usersWithTokens;

      this.logger.log(`📊 Stats: ${usersWithTokens} users with tokens, ${usersWithoutTokens} without tokens`);
      this.logger.log(`📊 Delivery: ${result.totalSuccess} success, ${result.totalFailure} failed`);

      // ── Record recipient rows (only current members get rows) ──
      await this.notificationRepository.recordRecipients(notificationId, targetUserIds);

      // Mark users whose FCM send failed
      const failedUserIds = result.userResults
        .filter(r => r.result.failureCount > 0 && r.result.successCount === 0)
        .map(r => r.userId);
      if (failedUserIds.length > 0) {
        await this.notificationRepository.markRecipientsFailed(notificationId, failedUserIds);
        this.logger.log(`⚠️ Marked ${failedUserIds.length} recipients as FAILED`);
      }

      // Update notification stats
      await this.notificationRepository.updateStats(notificationId, {
        totalRecipients: targetUserIds.length,
        sentCount: result.totalSuccess,
        failedCount: result.totalFailure,
      });

      await this.notificationRepository.updateStatus(notificationId, NotificationStatus.SENT);

      const deliveryRate = usersWithTokens > 0 ? ((result.totalSuccess / usersWithTokens) * 100).toFixed(1) : '0.0';
      this.logger.log(`📈 Delivery rate: ${deliveryRate}%`);

      let message = `Notification sent to ${result.totalSuccess} out of ${targetUserIds.length} targeted users`;
      if (usersWithoutTokens > 0) {
        message += `. Note: ${usersWithoutTokens} user(s) don't have the app installed or notifications disabled.`;
      }

      return {
        success: true,
        notificationId,
        totalRecipients: targetUserIds.length,
        sentCount: result.totalSuccess,
        failedCount: result.totalFailure,
        usersWithoutTokens,
        usersWithTokens,
        message,
        details: {
          targetedUsers: targetUserIds.length,
          usersWithTokens,
          usersWithoutTokens,
          successfulSends: result.totalSuccess,
          failedSends: result.totalFailure,
          deliveryRate: `${deliveryRate}%`,
        },
      };
    } catch (error) {
      this.logger.error(`❌ ===== NOTIFICATION ${notificationId} FAILED =====`);
      this.logger.error(`❌ Error: ${error.message}`);
      this.logger.error(`❌ Stack: ${error.stack}`);
      await this.notificationRepository.updateStatus(notificationId, NotificationStatus.FAILED);
      throw error;
    }
  }

  /**
   * Get target user IDs based on notification scope and target types
   */
  private async getTargetUserIds(notification: PushNotificationEntity): Promise<string[]> {
    const targetTypes = notification.targetUserTypes;
    const userIds = new Set<string>();

    if (notification.scope === NotificationScope.GLOBAL) {
      // Global: Get all users based on target types (excluding parents - they're linked to students)
      await this.addGlobalUsers(userIds, targetTypes);
    } else if (notification.scope === NotificationScope.INSTITUTE) {
      // Institute: Get all users in the institute based on target types
      await this.addInstituteUsers(userIds, notification.instituteId!, targetTypes);
    } else if (notification.scope === NotificationScope.CLASS) {
      // Class: Get all users in the class based on target types
      await this.addClassUsers(userIds, notification.instituteId!, notification.classId!, targetTypes);
    } else if (notification.scope === NotificationScope.SUBJECT) {
      // Subject: Get all users in the subject based on target types
      await this.addSubjectUsers(userIds, notification.instituteId!, notification.classId!, notification.subjectId!, targetTypes);
    }

    return Array.from(userIds);
  }

  /**
   * Add global users based on target types
   */
  private async addGlobalUsers(userIds: Set<string>, targetTypes: NotificationTargetUserType[]): Promise<void> {
    if (targetTypes.includes(NotificationTargetUserType.ALL)) {
      // Get all active users
      const users = await this.userRepository.find({
        where: { isActive: true },
        select: ['id']
      });
      users.forEach(u => userIds.add(u.id));
      return;
    }

    // For global, we get users from all institutes
    if (targetTypes.includes(NotificationTargetUserType.STUDENTS)) {
      const students = await this.studentRepository.find({
        where: { isActive: true },
        select: ['userId']
      });
      students.forEach(s => userIds.add(s.userId));
    }

    if (targetTypes.includes(NotificationTargetUserType.TEACHERS)) {
      const teachers = await this.classSubjectRepository
        .createQueryBuilder('cs')
        .select('DISTINCT cs.teacherId', 'teacherId')
        .where('cs.teacherId IS NOT NULL')
        .andWhere('cs.isActive = :isActive', { isActive: true })
        .getRawMany();
      teachers.forEach(t => userIds.add(t.teacherId));
    }

    if (targetTypes.includes(NotificationTargetUserType.INSTITUTE_ADMINS)) {
      const admins = await this.instituteUserRepository.find({
        where: { status: InstituteUserStatus.ACTIVE, instituteUserType: InstituteUserType.INSTITUTE_ADMIN },
        select: ['userId']
      });
      admins.forEach(a => userIds.add(a.userId));
    }

    if (targetTypes.includes(NotificationTargetUserType.SYSTEM_ADMINS)) {
      // Get users with SUPERADMIN user type
      const systemAdmins = await this.userRepository.find({
        where: { isActive: true, userType: UserType.SUPERADMIN },
        select: ['id']
      });
      systemAdmins.forEach(a => userIds.add(a.id));
    }

    // Advanced filters for global notifications - optimized with single queries
    if (targetTypes.includes(NotificationTargetUserType.USERS_WITHOUT_INSTITUTE)) {
      // Single query: Get users NOT in institute_user table
      const users = await this.userRepository
        .createQueryBuilder('u')
        .select('u.id')
        .leftJoin('institute_user', 'iu', 'iu.user_id = u.id AND iu.status = :status', { status: InstituteUserStatus.ACTIVE })
        .where('u.is_active = :isActive', { isActive: true })
        .andWhere('iu.user_id IS NULL')
        .getRawMany();
      users.forEach(u => userIds.add(u.u_id));
    }

    if (targetTypes.includes(NotificationTargetUserType.USERS_WITHOUT_PARENT)) {
      // Single query: Get users with USER_WITHOUT_PARENT type
      const users = await this.userRepository
        .createQueryBuilder('u')
        .select('u.id')
        .where('u.is_active = :isActive', { isActive: true })
        .andWhere('u.user_type = :userType', { userType: UserType.USER_WITHOUT_PARENT })
        .getRawMany();
      users.forEach(u => userIds.add(u.u_id));
    }

    if (targetTypes.includes(NotificationTargetUserType.USERS_WITHOUT_STUDENT)) {
      // Single query: Get users with USER_WITHOUT_STUDENT type
      const users = await this.userRepository
        .createQueryBuilder('u')
        .select('u.id')
        .where('u.is_active = :isActive', { isActive: true })
        .andWhere('u.user_type = :userType', { userType: UserType.USER_WITHOUT_STUDENT })
        .getRawMany();
      users.forEach(u => userIds.add(u.u_id));
    }

    if (targetTypes.includes(NotificationTargetUserType.VERIFIED_USERS_ONLY)) {
      // Single query: Get only email-verified users
      const users = await this.userRepository
        .createQueryBuilder('u')
        .select('u.id')
        .where('u.is_active = :isActive', { isActive: true })
        .andWhere('u.is_email_verified = :verified', { verified: true })
        .getRawMany();
      users.forEach(u => userIds.add(u.u_id));
    }

    if (targetTypes.includes(NotificationTargetUserType.UNVERIFIED_USERS_ONLY)) {
      // Single query: Get only unverified users
      const users = await this.userRepository
        .createQueryBuilder('u')
        .select('u.id')
        .where('u.is_active = :isActive', { isActive: true })
        .andWhere('u.is_email_verified = :verified', { verified: false })
        .getRawMany();
      users.forEach(u => userIds.add(u.u_id));
    }
  }

  /**
   * Add institute users based on target types
   */
  private async addInstituteUsers(
    userIds: Set<string>, 
    instituteId: string, 
    targetTypes: NotificationTargetUserType[]
  ): Promise<void> {
    if (targetTypes.includes(NotificationTargetUserType.ALL)) {
      // Get all users in the institute
      const instituteUsers = await this.instituteUserRepository.find({
        where: { instituteId, status: InstituteUserStatus.ACTIVE },
        select: ['userId']
      });
      instituteUsers.forEach(u => userIds.add(u.userId));

      // Also get all students in the institute's classes
      const students = await this.classStudentRepository.find({
        where: { instituteId, isActive: true },
        select: ['studentUserId']
      });
      students.forEach(s => userIds.add(s.studentUserId));

      // Get parents of students
      await this.addParentsOfStudents(userIds, students.map(s => s.studentUserId));
      return;
    }

    if (targetTypes.includes(NotificationTargetUserType.STUDENTS)) {
      // Get students from institute_class_students table
      const classStudents = await this.classStudentRepository.find({
        where: { instituteId, isActive: true },
        select: ['studentUserId']
      });
      classStudents.forEach(s => userIds.add(s.studentUserId));
      
      // Also get students from institute_user table (students registered but not enrolled in classes)
      const instituteStudents = await this.instituteUserRepository.find({
        where: { instituteId, status: InstituteUserStatus.ACTIVE, instituteUserType: InstituteUserType.STUDENT },
        select: ['userId']
      });
      instituteStudents.forEach(s => userIds.add(s.userId));
    }

    if (targetTypes.includes(NotificationTargetUserType.PARENTS)) {
      const students = await this.classStudentRepository.find({
        where: { instituteId, isActive: true },
        select: ['studentUserId']
      });
      await this.addParentsOfStudents(userIds, students.map(s => s.studentUserId));
    }

    if (targetTypes.includes(NotificationTargetUserType.TEACHERS)) {
      const teachers = await this.classSubjectRepository.find({
        where: { instituteId, isActive: true },
        select: ['teacherId']
      });
      teachers.filter(t => t.teacherId).forEach(t => userIds.add(t.teacherId));
    }

    if (targetTypes.includes(NotificationTargetUserType.INSTITUTE_ADMINS)) {
      const admins = await this.instituteUserRepository.find({
        where: { instituteId, status: InstituteUserStatus.ACTIVE, instituteUserType: InstituteUserType.INSTITUTE_ADMIN },
        select: ['userId']
      });
      admins.forEach(a => userIds.add(a.userId));
    }

    if (targetTypes.includes(NotificationTargetUserType.ATTENDANCE_MARKERS)) {
      const markers = await this.instituteUserRepository.find({
        where: { instituteId, status: InstituteUserStatus.ACTIVE, instituteUserType: InstituteUserType.ATTENDANCE_MARKER },
        select: ['userId']
      });
      markers.forEach(m => userIds.add(m.userId));
    }
  }

  /**
   * Add class users based on target types
   */
  private async addClassUsers(
    userIds: Set<string>,
    instituteId: string,
    classId: string,
    targetTypes: NotificationTargetUserType[]
  ): Promise<void> {
    if (targetTypes.includes(NotificationTargetUserType.ALL) || targetTypes.includes(NotificationTargetUserType.STUDENTS)) {
      const students = await this.classStudentRepository.find({
        where: { instituteId, classId, isActive: true },
        select: ['studentUserId']
      });
      students.forEach(s => userIds.add(s.studentUserId));

      if (targetTypes.includes(NotificationTargetUserType.ALL)) {
        await this.addParentsOfStudents(userIds, students.map(s => s.studentUserId));
      }
    }

    if (targetTypes.includes(NotificationTargetUserType.PARENTS)) {
      const students = await this.classStudentRepository.find({
        where: { instituteId, classId, isActive: true },
        select: ['studentUserId']
      });
      await this.addParentsOfStudents(userIds, students.map(s => s.studentUserId));
    }

    if (targetTypes.includes(NotificationTargetUserType.TEACHERS)) {
      const teachers = await this.classSubjectRepository.find({
        where: { instituteId, classId, isActive: true },
        select: ['teacherId']
      });
      teachers.filter(t => t.teacherId).forEach(t => userIds.add(t.teacherId));
    }
  }

  /**
   * Add subject users based on target types
   */
  private async addSubjectUsers(
    userIds: Set<string>,
    instituteId: string,
    classId: string,
    subjectId: string,
    targetTypes: NotificationTargetUserType[]
  ): Promise<void> {
    if (targetTypes.includes(NotificationTargetUserType.ALL) || targetTypes.includes(NotificationTargetUserType.STUDENTS)) {
      const students = await this.subjectStudentRepository.find({
        where: { instituteId, classId, subjectId, isActive: true },
        select: ['studentId']
      });
      students.forEach(s => userIds.add(s.studentId));

      if (targetTypes.includes(NotificationTargetUserType.ALL)) {
        await this.addParentsOfStudents(userIds, students.map(s => s.studentId));
      }
    }

    if (targetTypes.includes(NotificationTargetUserType.PARENTS)) {
      const students = await this.subjectStudentRepository.find({
        where: { instituteId, classId, subjectId, isActive: true },
        select: ['studentId']
      });
      await this.addParentsOfStudents(userIds, students.map(s => s.studentId));
    }

    if (targetTypes.includes(NotificationTargetUserType.TEACHERS)) {
      const subject = await this.classSubjectRepository.findOne({
        where: { instituteId, classId, subjectId, isActive: true },
        select: ['teacherId']
      });
      if (subject?.teacherId) {
        userIds.add(subject.teacherId);
      }
    }
  }

  /**
   * Add parents of students using father_id, mother_id, guardian_id
   */
  private async addParentsOfStudents(userIds: Set<string>, studentUserIds: string[]): Promise<void> {
    if (studentUserIds.length === 0) return;

    const students = await this.studentRepository.find({
      where: { userId: In(studentUserIds), isActive: true },
      select: ['fatherId', 'motherId', 'guardianId']
    });

    students.forEach(student => {
      if (student.fatherId) userIds.add(student.fatherId);
      if (student.motherId) userIds.add(student.motherId);
      if (student.guardianId) userIds.add(student.guardianId);
    });
  }

  /**
   * Get all notifications (admin)
   */
  async findAll(queryDto: QueryPushNotificationDto): Promise<PaginatedPushNotificationResponseDto> {
    const { data, total } = await this.notificationRepository.findAll(queryDto);
    const { page = 1, limit = 10 } = queryDto;

    // Manual mapping to preserve dates
    const mappedData = data.map(n => ({
      id: n.id,
      title: n.title,
      body: n.body,
      imageUrl: n.imageUrl,
      icon: n.icon,
      actionUrl: n.actionUrl,
      dataPayload: n.dataPayload,
      scope: n.scope,
      targetUserTypes: n.targetUserTypes,
      instituteId: n.instituteId,
      institute: n.institute,
      classId: n.classId,
      class: n.class,
      subjectId: n.subjectId,
      subject: n.subject,
      priority: n.priority,
      status: n.status,
      collapseKey: n.collapseKey,
      timeToLive: n.timeToLive,
      scheduledAt: n.scheduledAt,
      sentAt: n.sentAt,
      senderId: n.senderId,
      senderRole: n.senderRole,
      sender: n.sender,
      totalRecipients: n.totalRecipients,
      sentCount: n.sentCount,
      failedCount: n.failedCount,
      readCount: n.readCount,
      createdAt: n.createdAt,
      updatedAt: n.updatedAt
    } as PushNotificationResponseDto));

    return {
      data: mappedData,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get notifications for an institute (user view)
   */
  async findByInstituteId(
    instituteId: string,
    queryDto: QueryUserNotificationsDto,
    userId: string
  ): Promise<PaginatedUserNotificationResponseDto> {
    const { data, total, unreadCount } = await this.notificationRepository.findByInstituteId(
      instituteId, 
      queryDto, 
      userId
    );
    const { page = 1, limit = 20 } = queryDto;

    // Get read status for each notification
    const notificationIds = data.map(n => n.id);
    const readIds = await this.notificationRepository.getReadNotificationIds(userId, notificationIds);

    // Transform using plainToInstance to preserve dates and work with ClassSerializerInterceptor
    const transformedData = data.map(notification => {
      const isRead = readIds.has(notification.id);
      const readAt = readIds.get(notification.id) ?? undefined;
      const plainObj = {
        id: notification.id,
        title: notification.title,
        body: notification.body,
        imageUrl: notification.imageUrl,
        icon: notification.icon,
        actionUrl: notification.actionUrl,
        dataPayload: notification.dataPayload,
        scope: notification.scope,
        priority: notification.priority,
        institute: notification.institute,
        class: notification.class,
        subject: notification.subject,
        sender: null,
        senderRole: notification.senderRole,
        isRead,
        readAt,
        sentAt: notification.sentAt || notification.createdAt
      };
      return plainToInstance(UserNotificationResponseDto, plainObj, { excludeExtraneousValues: true });
    });

    return {
      data: transformedData,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      unreadCount,
    };
  }

  /**
   * Get system/global notifications (user view)
   */
  async findSystemNotifications(
    queryDto: QueryUserNotificationsDto,
    userId: string
  ): Promise<PaginatedUserNotificationResponseDto> {
    const { data, total, unreadCount } = await this.notificationRepository.findSystemNotifications(
      queryDto,
      userId
    );
    const { page = 1, limit = 20 } = queryDto;

    // Get read status for each notification
    const notificationIds = data.map(n => n.id);
    const readIds = await this.notificationRepository.getReadNotificationIds(userId, notificationIds);

    // Transform using plainToInstance to preserve dates and work with ClassSerializerInterceptor
    const transformedData = data.map(notification => {
      const isRead = readIds.has(notification.id);
      const readAt = readIds.get(notification.id) ?? undefined;
      const plainObj = {
        id: notification.id,
        title: notification.title,
        body: notification.body,
        imageUrl: notification.imageUrl,
        icon: notification.icon,
        actionUrl: notification.actionUrl,
        dataPayload: notification.dataPayload,
        scope: notification.scope,
        priority: notification.priority,
        institute: notification.institute,
        class: notification.class,
        subject: notification.subject,
        sender: null,
        senderRole: notification.senderRole,
        isRead,
        readAt,
        sentAt: notification.sentAt || notification.createdAt
      };
      return plainToInstance(UserNotificationResponseDto, plainObj, { excludeExtraneousValues: true });
    });

    return {
      data: transformedData,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      unreadCount,
    };
  }

  /**
   * Get single notification
   */
  async findOne(id: string): Promise<PushNotificationResponseDto> {
    const notification = await this.notificationRepository.findOne(id);
    if (!notification) {
      throw new NotFoundException('Notification not found');
    }
    // Manual mapping to preserve dates
    return {
      id: notification.id,
      title: notification.title,
      body: notification.body,
      imageUrl: notification.imageUrl,
      icon: notification.icon,
      actionUrl: notification.actionUrl,
      dataPayload: notification.dataPayload,
      scope: notification.scope,
      targetUserTypes: notification.targetUserTypes,
      instituteId: notification.instituteId,
      institute: notification.institute,
      classId: notification.classId,
      class: notification.class,
      subjectId: notification.subjectId,
      subject: notification.subject,
      priority: notification.priority,
      status: notification.status,
      collapseKey: notification.collapseKey,
      timeToLive: notification.timeToLive,
      scheduledAt: notification.scheduledAt,
      sentAt: notification.sentAt,
      senderId: notification.senderId,
      senderRole: notification.senderRole,
      sender: notification.sender,
      totalRecipients: notification.totalRecipients,
      sentCount: notification.sentCount,
      failedCount: notification.failedCount,
      readCount: notification.readCount,
      createdAt: notification.createdAt,
      updatedAt: notification.updatedAt
    } as PushNotificationResponseDto;
  }

  /**
   * Mark all institute notifications as read for user (single DB update)
   */
  async markAllAsReadForInstitute(userId: string, instituteId: string): Promise<number> {
    return await this.notificationRepository.markAllAsReadForInstitute(userId, instituteId);
  }

  /**
   * Mark ALL notifications as read for user across all scopes
   */
  async markAllAsReadForUser(userId: string): Promise<number> {
    return await this.notificationRepository.markAllAsReadForUser(userId);
  }

  /**
   * Get ALL notifications for the current user across every institute and global scope.
   * This is the unified inbox endpoint — single query returns everything the user
   * was actually sent, with read status, from all institutes + global.
   */
  async findAllForUser(
    userId: string,
    queryDto: QueryUserNotificationsDto,
  ): Promise<PaginatedUserNotificationResponseDto> {
    const { data, total, unreadCount } = await this.notificationRepository.findAllForUser(userId, queryDto);
    const { page = 1, limit = 20 } = queryDto;

    const notificationIds = data.map(n => n.id);
    const readIds = await this.notificationRepository.getReadNotificationIds(userId, notificationIds);

    const transformedData = data.map(notification => {
      const isRead = readIds.has(notification.id);
      const readAt = readIds.get(notification.id) ?? undefined;
      return plainToInstance(UserNotificationResponseDto, {
        id: notification.id,
        title: notification.title,
        body: notification.body,
        imageUrl: notification.imageUrl,
        icon: notification.icon,
        actionUrl: notification.actionUrl,
        dataPayload: notification.dataPayload,
        scope: notification.scope,
        priority: notification.priority,
        institute: notification.institute,
        class: notification.class,
        subject: notification.subject,
        sender: null,
        senderRole: notification.senderRole,
        isRead,
        readAt,
        sentAt: notification.sentAt || notification.createdAt,
      }, { excludeExtraneousValues: true });
    });

    return {
      data: transformedData,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      unreadCount,
    };
  }

  /**
   * Total unread notification count across all scopes (global badge count)
   */
  async getUnreadCountAll(userId: string): Promise<UnreadCountResponseDto> {
    const count = await this.notificationRepository.getUnreadCountAll(userId);
    return { unreadCount: count, totalCount: 0 };
  }

  /**
   * Mark all institute notifications as read for user (single DB update)
   */
  async markAsRead(notificationId: string, userId: string): Promise<void> {
    await this.notificationRepository.markAsRead(userId, notificationId);
  }

  /**
   * Mark multiple notifications as read
   */
  async markMultipleAsRead(notificationIds: string[], userId: string): Promise<void> {
    await this.notificationRepository.markMultipleAsRead(userId, notificationIds);
  }

  /**
   * Cancel a notification (admin only)
   */
  async cancel(id: string): Promise<void> {
    const notification = await this.notificationRepository.findOne(id);
    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    if (notification.status === NotificationStatus.SENT) {
      throw new BadRequestException('Cannot cancel a notification that has already been sent');
    }

    await this.notificationRepository.updateStatus(id, NotificationStatus.CANCELLED);
  }

  /**
   * Delete a notification (admin only)
   */
  async delete(id: string): Promise<void> {
    const notification = await this.notificationRepository.findOne(id);
    if (!notification) {
      throw new NotFoundException('Notification not found');
    }
    await this.notificationRepository.delete(id);
  }

  /**
   * Resend a failed notification
   */
  async resend(id: string): Promise<SendNotificationResultDto> {
    const notification = await this.notificationRepository.findOne(id);
    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    if (notification.status !== NotificationStatus.FAILED) {
      throw new BadRequestException('Only failed notifications can be resent');
    }

    return await this.sendNotification(id);
  }

  /**
   * Get unread count for user
   */
  async getUnreadCount(userId: string, instituteId?: string): Promise<{ unreadCount: number }> {
    if (instituteId) {
      const count = await this.notificationRepository.getUnreadCount(userId, instituteId);
      return { unreadCount: count };
    } else {
      const count = await this.notificationRepository.getUnreadCountGlobal(userId);
      return { unreadCount: count };
    }
  }
}
