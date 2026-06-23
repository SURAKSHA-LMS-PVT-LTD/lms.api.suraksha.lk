import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { now } from '../../../common/utils/timezone.util';
import { CreateInstituteClassSubjectLectureDto } from './dto/create-institute_class_subject_lecture.dto';
import { UpdateInstituteClassSubjectLectureDto } from './dto/update-institute-class-subject-lecture.dto';
import { InstituteClassSubjectLecture } from './entities/institute_class_subject_lecture.entity';
import { LectureLiveAttendance } from './entities/lecture_live_attendance.entity';
import { LectureLiveAttendanceSession } from './entities/lecture_live_attendance_session.entity';
import { LectureLiveAttendanceMark } from './entities/lecture_live_attendance_mark.entity';
import { LectureRecordingSession } from './entities/lecture_recording_session.entity';
import { PaginatedResponseDto } from '../../../common/dto/paginated-response.dto';
import { InstituteAccessValidator, ROLE_BITMASKS } from '../../../common/helpers/institute-access-validator.helper';
import { CloudStorageService } from '../../../common/services/cloud-storage.service';

export interface QueryLectureDto {
  page?: number;
  limit?: number;
  instituteId?: string;
  classId?: string;
  subjectId?: string;
  instructorId?: string;
  lectureType?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  isActive?: boolean;
  search?: string;
  userId?: string; // For parent access validation
}

@Injectable()
export class InstituteClassSubjectLecturesService {
  constructor(
    @InjectRepository(InstituteClassSubjectLecture)
    private readonly lectureRepository: Repository<InstituteClassSubjectLecture>,
    @InjectRepository(LectureLiveAttendance)
    private readonly liveAttendanceRepository: Repository<LectureLiveAttendance>,
    @InjectRepository(LectureLiveAttendanceSession)
    private readonly liveSessionRepository: Repository<LectureLiveAttendanceSession>,
    @InjectRepository(LectureLiveAttendanceMark)
    private readonly liveMarkRepository: Repository<LectureLiveAttendanceMark>,
    @InjectRepository(LectureRecordingSession)
    private readonly recordingSessionRepository: Repository<LectureRecordingSession>,
    private readonly cloudStorageService: CloudStorageService,
  ) {}

  private transformMaterialUrls(lecture: InstituteClassSubjectLecture): void {
    if (Array.isArray(lecture.materials)) {
      lecture.materials = lecture.materials.map(m => ({
        ...m,
        documentUrl: m.source === 'S3' && m.documentUrl
          ? this.cloudStorageService.getFullUrl(m.documentUrl)
          : m.documentUrl,
      }));
    }
    if ((lecture as any).thumbnailUrl && !(lecture as any).thumbnailUrl.startsWith('http')) {
      (lecture as any).thumbnailUrl = this.cloudStorageService.getFullUrl((lecture as any).thumbnailUrl);
    }
  }

  async create(createDto: CreateInstituteClassSubjectLectureDto): Promise<InstituteClassSubjectLecture> {
    try {
      const timestamp = now();
      const lectureData = {
        instituteId: createDto.instituteId,
        classId: createDto.classId,
        subjectId: createDto.subjectId,
        instructorId: createDto.instructorId,
        title: createDto.title,
        description: createDto.description,
        lectureType: createDto.lectureType,
        venue: createDto.venue,
        startTime: new Date(createDto.startTime),
        endTime: new Date(createDto.endTime),
        status: createDto.status || 'scheduled' as any,
        meetingLink: createDto.meetingLink,
        meetingId: createDto.meetingId,
        meetingPassword: createDto.meetingPassword,
        recordingUrl: createDto.recordingUrl,
        isRecorded: createDto.isRecorded ?? false,
        maxParticipants: createDto.maxParticipants,
        isActive: createDto.isActive ?? true,
        materials: createDto.materials ?? undefined,
        thumbnailUrl: createDto.thumbnailUrl ?? undefined,
        
        // --- Live Attendance Settings ---
        liveAttendanceEnabled: createDto.liveAttendanceEnabled ?? false,
        liveUrlId: createDto.liveAttendanceEnabled ? (createDto.liveUrlId || uuidv4().replace(/-/g, '').substring(0, 10)) : null,
        liveAccessLevel: createDto.liveAccessLevel ?? 'ENROLLED_ONLY',
        livePaymentId: createDto.livePaymentId,
        livePaymentStatuses: createDto.livePaymentStatuses,
        liveEntryBgUrl: createDto.liveEntryBgUrl,

        // --- Recording Attendance Settings ---
        recAttendanceEnabled: createDto.recAttendanceEnabled ?? false,
        recUrlId: createDto.recAttendanceEnabled ? (createDto.recUrlId || uuidv4().replace(/-/g, '').substring(0, 10)) : null,
        recPlatform: createDto.recPlatform ?? 'SYSTEM',
        recAccessLevel: createDto.recAccessLevel ?? 'ENROLLED_ONLY',
        recPaymentId: createDto.recPaymentId,
        recPaymentStatuses: createDto.recPaymentStatuses,
        recTrackingDays: createDto.recTrackingDays ?? null,
        recDurationSeconds: createDto.recDurationSeconds ?? null,

        welcomeMessageEnabled: createDto.welcomeMessageEnabled ?? false,
        welcomeMessageText: createDto.welcomeMessageText?.trim() || null,
        welcomeMessageVoiceEnabled: createDto.welcomeMessageVoiceEnabled ?? false,

        createdAt: timestamp,
        updatedAt: timestamp,
      };

      const lecture = this.lectureRepository.create(lectureData);
      const savedLecture = await this.lectureRepository.save(lecture);
      
      // Ensure date fields are properly set on the returned object
      savedLecture.startTime = lectureData.startTime;
      savedLecture.endTime = lectureData.endTime;
      
      return savedLecture;
    } catch (error) {
      throw new BadRequestException(`Failed to create lecture: ${error.message}`);
    }
  }

  async findAll(queryDto: QueryLectureDto = {}, user?: any): Promise<PaginatedResponseDto<InstituteClassSubjectLecture>> {
    const { page = 1, limit = 10, ...filters } = queryDto;
    const skip = (page - 1) * limit;

    // SECURITY: Validate user has access to requested institute, class, and subject
    if (user) {
      if (filters.instituteId) {
        // Extract targetUserId for parent access validation
        const targetUserId = filters.userId;
        
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
    }

    const queryBuilder = this.lectureRepository
      .createQueryBuilder('lecture');
      // Remove joins to avoid loading heavy nested objects

    this.applyFilters(queryBuilder, filters);

    const [lectures, total] = await queryBuilder
      .skip(skip)
      .take(limit)
      .orderBy('lecture.startTime', 'ASC')
      .getManyAndCount();

    // ✅ Transform recordingUrl and material URLs to full URLs for all lectures
    const transformedLectures = lectures.map(lecture => {
      if (lecture.recordingUrl) {
        lecture.recordingUrl = this.cloudStorageService.getFullUrl(lecture.recordingUrl);
      }
      this.transformMaterialUrls(lecture);
      return lecture;
    });

    return new PaginatedResponseDto(transformedLectures, page, limit, total);
  }

  async findOne(id: string, user?: any): Promise<InstituteClassSubjectLecture> {
    const lecture = await this.lectureRepository
      .createQueryBuilder('lecture')
      // Remove joins to keep response lightweight
      .where('lecture.id = :id', { id })
      .getOne();

    if (!lecture) {
      throw new NotFoundException(`Lecture with ID ${id} not found`);
    }

    // SECURITY: Validate user has access to this lecture's institute, class, and subject
    if (user) {
      InstituteAccessValidator.validateResourceAccess(user, lecture);
      
      // Validate class and subject access
      const userInstituteAccess = Array.isArray(user.i) ? user.i : [];
      const instituteEntry = userInstituteAccess.find((entry: any) => entry.i === lecture.instituteId);
      
      if (instituteEntry && Array.isArray(instituteEntry.c)) {
        // Validate class access
        const classSubjectEntry = instituteEntry.c.find(
          ([classId]: [string, number]) => classId === lecture.classId
        );
        
        if (!classSubjectEntry) {
          throw new ForbiddenException(`You do not have access to class ${lecture.classId} in institute ${lecture.instituteId}`);
        }
        
        // Validate subject access using bitmask
        const [classId, subjectBitmask] = classSubjectEntry;
        const subjectIdNum = parseInt(lecture.subjectId, 10);
        // Proper bitmask check: subject ID 1 = bit 0, subject ID 2 = bit 1, etc.
        const hasSubjectAccess = (subjectBitmask & (1 << (subjectIdNum - 1))) !== 0;
        
        if (!hasSubjectAccess) {
          throw new ForbiddenException(`You do not have access to subject ${lecture.subjectId} in class ${lecture.classId}`);
        }
      }
    }

    // ✅ Transform recordingUrl and material URLs to full URLs
    if (lecture.recordingUrl) {
      lecture.recordingUrl = this.cloudStorageService.getFullUrl(lecture.recordingUrl);
    }
    this.transformMaterialUrls(lecture);

    return lecture;
  }

  async findOneWithDetails(id: string): Promise<InstituteClassSubjectLecture> {
    const lecture = await this.lectureRepository
      .createQueryBuilder('lecture')
      .select([
        'lecture.id',
        'lecture.instituteId',
        'lecture.classId',
        'lecture.subjectId',
        'lecture.instructorId',
        'lecture.title',
        'lecture.description',
        'lecture.startTime',
        'lecture.endTime',
        'lecture.location',
        'lecture.isActive',
        'lecture.materials',
        'lecture.recordingUrl',
        'lecture.status',
        'lecture.lectureType',
        'lecture.venue',
        'lecture.meetingLink',
        'lecture.meetingId',
        'lecture.maxParticipants',
        'lecture.isRecorded',
        'lecture.thumbnailUrl'
      ])
      .leftJoin('lecture.institute', 'institute')
      .addSelect([
        'institute.id',
        'institute.name'
      ])
      .leftJoin('lecture.class', 'class')
      .addSelect([
        'class.id',
        'class.name'
      ])
      .leftJoin('lecture.subject', 'subject')
      .addSelect([
        'subject.id',
        'subject.name'
      ])
      .leftJoin('lecture.instructor', 'instructor')
      .addSelect([
        'instructor.id',
        'instructor.firstName',
        'instructor.lastName',
        'instructor.email'
      ])
      .where('lecture.id = :id', { id })
      .getOne();

    if (!lecture) {
      throw new NotFoundException(`Lecture with ID ${id} not found`);
    }

    // ✅ Transform recordingUrl and material URLs to full URLs
    if (lecture.recordingUrl) {
      lecture.recordingUrl = this.cloudStorageService.getFullUrl(lecture.recordingUrl);
    }
    this.transformMaterialUrls(lecture);

    return lecture; // Return full entity with all relations
  }

  async update(id: string, updateDto: UpdateInstituteClassSubjectLectureDto, user: any): Promise<InstituteClassSubjectLecture> {
    const lecture = await this.lectureRepository.findOne({ where: { id } });
    
    if (!lecture) {
      throw new NotFoundException(`Lecture with ID ${id} not found`);
    }

    // Validate user has access to this lecture's institute with required roles
    InstituteAccessValidator.validateResourceAccess(user, lecture, [ROLE_BITMASKS.TEACHER, ROLE_BITMASKS.INSTITUTE_ADMIN]);

    try {
      const updateData: any = {};
      
      if (updateDto.title !== undefined) updateData.title = updateDto.title;
      if (updateDto.description !== undefined) updateData.description = updateDto.description;
      if (updateDto.venue !== undefined) updateData.venue = updateDto.venue;
      if (updateDto.startTime !== undefined) updateData.startTime = new Date(updateDto.startTime);
      if (updateDto.endTime !== undefined) updateData.endTime = new Date(updateDto.endTime);
      if (updateDto.status !== undefined) updateData.status = updateDto.status;
      if (updateDto.meetingLink !== undefined) updateData.meetingLink = updateDto.meetingLink;
      if (updateDto.meetingId !== undefined) updateData.meetingId = updateDto.meetingId;
      if (updateDto.meetingPassword !== undefined) updateData.meetingPassword = updateDto.meetingPassword;
      if (updateDto.recordingUrl !== undefined) updateData.recordingUrl = updateDto.recordingUrl;
      if (updateDto.isRecorded !== undefined) updateData.isRecorded = updateDto.isRecorded;
      if (updateDto.maxParticipants !== undefined) updateData.maxParticipants = updateDto.maxParticipants;
      if (updateDto.isActive !== undefined) updateData.isActive = updateDto.isActive;
      if (updateDto.materials !== undefined) updateData.materials = updateDto.materials;
      if (updateDto.thumbnailUrl !== undefined) updateData.thumbnailUrl = updateDto.thumbnailUrl;

      // --- Live Attendance Updates ---
      if (updateDto.liveAttendanceEnabled !== undefined) {
        updateData.liveAttendanceEnabled = updateDto.liveAttendanceEnabled;
        if (updateDto.liveAttendanceEnabled && !lecture.liveUrlId && !updateDto.liveUrlId) {
          updateData.liveUrlId = uuidv4().replace(/-/g, '').substring(0, 10);
        }
      }
      if (updateDto.liveUrlId !== undefined) updateData.liveUrlId = updateDto.liveUrlId;
      if (updateDto.liveAccessLevel !== undefined) updateData.liveAccessLevel = updateDto.liveAccessLevel;
      if (updateDto.livePaymentId !== undefined) updateData.livePaymentId = updateDto.livePaymentId;
      if (updateDto.livePaymentStatuses !== undefined) updateData.livePaymentStatuses = updateDto.livePaymentStatuses;
      if (updateDto.liveEntryBgUrl !== undefined) updateData.liveEntryBgUrl = updateDto.liveEntryBgUrl;

      // --- Recording Attendance Updates ---
      if (updateDto.recAttendanceEnabled !== undefined) {
        updateData.recAttendanceEnabled = updateDto.recAttendanceEnabled;
        if (updateDto.recAttendanceEnabled && !lecture.recUrlId && !updateDto.recUrlId) {
          updateData.recUrlId = uuidv4().replace(/-/g, '').substring(0, 10);
        }
      }
      if (updateDto.recUrlId !== undefined) updateData.recUrlId = updateDto.recUrlId;
      if (updateDto.recPlatform !== undefined) updateData.recPlatform = updateDto.recPlatform;
      if (updateDto.recAccessLevel !== undefined) updateData.recAccessLevel = updateDto.recAccessLevel;
      if (updateDto.recPaymentId !== undefined) updateData.recPaymentId = updateDto.recPaymentId;
      if (updateDto.recPaymentStatuses !== undefined) updateData.recPaymentStatuses = updateDto.recPaymentStatuses;
      if (updateDto.recTrackingDays !== undefined) updateData.recTrackingDays = updateDto.recTrackingDays;
      if (updateDto.recDurationSeconds !== undefined) updateData.recDurationSeconds = updateDto.recDurationSeconds;

      if (updateDto.welcomeMessageEnabled !== undefined) updateData.welcomeMessageEnabled = updateDto.welcomeMessageEnabled;
      if (updateDto.welcomeMessageText !== undefined) {
        updateData.welcomeMessageText = updateDto.welcomeMessageText?.trim() || null;
      }
      if (updateDto.welcomeMessageVoiceEnabled !== undefined) {
        updateData.welcomeMessageVoiceEnabled = updateDto.welcomeMessageVoiceEnabled;
      }

      await this.lectureRepository.update(id, updateData);
      
      const updatedLecture = await this.lectureRepository.findOne({ where: { id } });
      
      // ✅ Transform recordingUrl and material URLs to full URLs
      if (updatedLecture) {
        if (updatedLecture.recordingUrl) {
          updatedLecture.recordingUrl = this.cloudStorageService.getFullUrl(updatedLecture.recordingUrl);
        }
        this.transformMaterialUrls(updatedLecture);
      }
      
      return updatedLecture!;
    } catch (error) {
      throw new BadRequestException(`Failed to update lecture: ${error.message}`);
    }
  }

  async closeLecture(id: string, user: any): Promise<InstituteClassSubjectLecture> {
    const lecture = await this.lectureRepository.findOne({ where: { id } });
    if (!lecture) throw new NotFoundException(`Lecture with ID ${id} not found`);

    InstituteAccessValidator.validateResourceAccess(user, lecture, [ROLE_BITMASKS.TEACHER, ROLE_BITMASKS.INSTITUTE_ADMIN]);

    if (lecture.status === 'completed') {
      throw new BadRequestException('Lecture is already closed.');
    }

    // ── 1. Attendance sessions (links) ─────────────────────────────────────
    // Each session = one QR/link created by the teacher. Fetch all sessions for
    // this lecture, then all marks across those sessions.
    const sessions = await this.liveSessionRepository.find({ where: { lectureId: id } });
    const totalSessions = sessions.length;
    const sessionIds = sessions.map(s => s.id);

    // All marks across every session for this lecture
    const allMarks = sessionIds.length > 0
      ? await this.liveMarkRepository
          .createQueryBuilder('m')
          .where('m.lectureId = :lectureId', { lectureId: id })
          .orderBy('m.markedAt', 'ASC')
          .getMany()
      : [];

    // Per-student aggregation across all sessions
    // student attended N times = marked in N distinct sessions
    const studentSessionMap = new Map<string, { sessions: Set<string>; firstAt: Date; lastAt: Date }>();
    for (const mark of allMarks) {
      const sid = String(mark.studentId);
      if (!studentSessionMap.has(sid)) {
        studentSessionMap.set(sid, { sessions: new Set(), firstAt: mark.markedAt, lastAt: mark.markedAt });
      }
      const entry = studentSessionMap.get(sid)!;
      entry.sessions.add(String(mark.sessionId));
      if (mark.markedAt < entry.firstAt) entry.firstAt = mark.markedAt;
      if (mark.markedAt > entry.lastAt) entry.lastAt = mark.markedAt;
    }

    const totalStudentsMarked = studentSessionMap.size;
    // How many students attended ALL sessions (full attendance)
    const fullAttendanceCount = totalSessions > 0
      ? [...studentSessionMap.values()].filter(e => e.sessions.size === totalSessions).length
      : 0;
    // Per-student compact list: [studentId, attendCount, firstAt, lastAt]
    const studentAttendance = [...studentSessionMap.entries()].map(([studentId, e]) => ({
      studentId,
      attendCount: e.sessions.size,        // how many links they clicked / were marked in
      attendPercent: totalSessions > 0 ? Math.round((e.sessions.size / totalSessions) * 100) : 0,
      firstAt: e.firstAt.toISOString(),
      lastAt: e.lastAt.toISOString(),
    }));

    // ── 2. Live join/leave records (direct join, not via link) ─────────────
    const liveJoinRows = await this.liveAttendanceRepository.find({ where: { lectureId: id } });
    const liveDirectJoins = liveJoinRows.length;
    const liveDirectUniqueUsers = new Set(liveJoinRows.filter(r => r.userId).map(r => String(r.userId))).size;
    const liveGuestJoins = liveJoinRows.filter(r => !r.userId).length;
    let totalLiveDurationMs = 0;
    let durationCount = 0;
    for (const r of liveJoinRows) {
      if (r.joinTime && r.leaveTime) {
        totalLiveDurationMs += new Date(r.leaveTime).getTime() - new Date(r.joinTime).getTime();
        durationCount++;
      }
    }
    const liveAvgDurationMinutes = durationCount > 0
      ? Math.round(totalLiveDurationMs / durationCount / 60000)
      : 0;

    // ── 3. Recording sessions ──────────────────────────────────────────────
    const recRows = await this.recordingSessionRepository.find({ where: { lectureId: id } });
    // Group by userId — take best (max totalWatchedSeconds) session per user
    const recByUser = new Map<string, { watchedSec: number; timesViewed: number; lastPos: number }>();
    let recGuestSessions = 0;
    for (const r of recRows) {
      if (!r.userId) { recGuestSessions++; continue; }
      const key = String(r.userId);
      const existing = recByUser.get(key);
      if (!existing || r.totalWatchedSeconds > existing.watchedSec) {
        recByUser.set(key, {
          watchedSec: r.totalWatchedSeconds ?? 0,
          timesViewed: r.timesViewed ?? 1,
          lastPos: r.lastPositionSeconds ?? 0,
        });
      } else {
        existing.timesViewed += r.timesViewed ?? 1;
      }
    }
    const recUniqueRegisteredViewers = recByUser.size;
    const recTotalWatchedSeconds = [...recByUser.values()].reduce((s, v) => s + v.watchedSec, 0);
    const recTimesViewed = [...recByUser.values()].reduce((s, v) => s + v.timesViewed, 0) + recGuestSessions;
    const recAvgWatchedSeconds = recUniqueRegisteredViewers > 0
      ? Math.round(recTotalWatchedSeconds / recUniqueRegisteredViewers)
      : 0;
    // Completion percentage per user (needs recDurationSeconds on lecture)
    const recDuration = lecture.recDurationSeconds ?? 0;
    const recPerStudentWatch = [...recByUser.entries()].map(([userId, v]) => ({
      userId,
      watchedMinutes: Math.round(v.watchedSec / 60),
      completionPercent: recDuration > 0 ? Math.min(100, Math.round((v.watchedSec / recDuration) * 100)) : null,
      timesViewed: v.timesViewed,
      lastPositionMinutes: Math.round(v.lastPos / 60),
    }));

    const closedBy = user?.firstName
      ? `${user.firstName}${user.lastName ? ' ' + user.lastName : ''}`.trim()
      : (user?.email ?? undefined);

    const summary = {
      // attendance via links
      totalAttendanceSessions: totalSessions,       // number of links created
      totalStudentsMarked,                           // unique students marked across all links
      fullAttendanceCount,                           // students marked in every link
      studentAttendance,                             // [{studentId, attendCount, attendPercent, firstAt, lastAt}]

      // direct live join/leave tracking
      liveDirectJoins,
      liveDirectUniqueUsers,
      liveGuestJoins,
      liveAvgDurationMinutes,

      // recording
      recUniqueViewers: recUniqueRegisteredViewers + recGuestSessions,
      recTimesViewed,
      recTotalWatchedMinutes: Math.round(recTotalWatchedSeconds / 60),
      recAvgWatchedMinutes: Math.round(recAvgWatchedSeconds / 60),
      recPerStudentWatch,                            // [{userId, watchedMinutes, completionPercent, timesViewed, lastPositionMinutes}]

      closedBy,
    };

    await this.lectureRepository.update(id, {
      status: 'completed' as any,
      closedAt: now(),
      lectureSummary: summary as any,
    });

    const updated = await this.lectureRepository.findOne({ where: { id } });
    return updated!;
  }

  async remove(id: string): Promise<void> {
    const lecture = await this.lectureRepository.findOne({ where: { id } });
    
    if (!lecture) {
      throw new NotFoundException(`Lecture with ID ${id} not found`);
    }

    await this.lectureRepository.delete(id);
  }

  /**
   * Permanently delete lecture from database
   * Only accessible to Institute Admins and Super Admins
   */
  async removePermanent(id: string, user: any): Promise<any> {
    const lecture = await this.lectureRepository.findOne({ where: { id } });
    
    if (!lecture) {
      throw new NotFoundException(`Lecture with ID ${id} not found`);
    }

    // SECURITY: Validate user has access to this lecture's institute
    if (user) {
      InstituteAccessValidator.validateInstituteAccess(user, lecture.instituteId);
    }

    // Delete lecture from database
    await this.lectureRepository.delete(id);

    return {
      success: true,
      message: 'Lecture permanently deleted successfully',
      lectureId: id,
      instituteId: lecture.instituteId
    };
  }

  async getSchedule(date: string, query: any = {}, user?: any): Promise<InstituteClassSubjectLecture[]> {
    const startDate = new Date(date);
    const endDate = new Date(date);
    endDate.setHours(23, 59, 59, 999);

    // SECURITY: Validate user has access to requested institute, class, and subject
    if (user) {
      if (query.instituteId) {
        // Validate institute access first
        InstituteAccessValidator.validateInstituteAccess(user, query.instituteId);
        
        // Validate class access if classId is provided
        if (query.classId) {
          const userInstituteAccess = Array.isArray(user.i) ? user.i : [];
          const instituteEntry = userInstituteAccess.find((entry: any) => entry.i === query.instituteId);
          
          if (instituteEntry && Array.isArray(instituteEntry.c)) {
            const classSubjectEntry = instituteEntry.c.find(
              ([classId]: [string, number]) => classId === query.classId
            );
            
            if (!classSubjectEntry) {
              throw new ForbiddenException(`You do not have access to class ${query.classId} in institute ${query.instituteId}`);
            }
            
            // If subjectId is also provided, validate subject access using bitmask
            if (query.subjectId) {
              const [classId, subjectBitmask] = classSubjectEntry;
              const subjectIdNum = parseInt(query.subjectId, 10);
              // Proper bitmask check: subject ID 1 = bit 0, subject ID 2 = bit 1, etc.
              const hasSubjectAccess = (subjectBitmask & (1 << (subjectIdNum - 1))) !== 0;
              
              if (!hasSubjectAccess) {
                throw new ForbiddenException(`You do not have access to subject ${query.subjectId} in class ${query.classId}`);
              }
            }
          }
        }
      }
    }

    const queryBuilder = this.lectureRepository
      .createQueryBuilder('lecture')
      // Remove joins to keep response lightweight
      .where('lecture.startTime >= :startDate', { startDate })
      .andWhere('lecture.startTime <= :endDate', { endDate });

    this.applyFilters(queryBuilder, query);

    const lectures = await queryBuilder
      .orderBy('lecture.startTime', 'ASC')
      .getMany();

    // ✅ Transform recordingUrl and material URLs to full URLs for schedule
    return lectures.map(lecture => {
      if (lecture.recordingUrl) {
        lecture.recordingUrl = this.cloudStorageService.getFullUrl(lecture.recordingUrl);
      }
      this.transformMaterialUrls(lecture);
      return lecture;
    });
  }

  async createBulk(createDtos: CreateInstituteClassSubjectLectureDto[]): Promise<InstituteClassSubjectLecture[]> {
    try {
      const timestamp = now();
      const lectures = createDtos.map(dto => {
        const lectureData = {
          instituteId: dto.instituteId,
          classId: dto.classId,
          subjectId: dto.subjectId,
          instructorId: dto.instructorId,
          title: dto.title,
          description: dto.description,
          lectureType: dto.lectureType,
          venue: dto.venue,
          startTime: new Date(dto.startTime),
          endTime: new Date(dto.endTime),
          status: dto.status || 'scheduled' as any,
          meetingLink: dto.meetingLink,
          meetingId: dto.meetingId,
          meetingPassword: dto.meetingPassword,
          recordingUrl: dto.recordingUrl,
          isRecorded: dto.isRecorded ?? false,
          maxParticipants: dto.maxParticipants,
          isActive: dto.isActive ?? true,
          materials: dto.materials ?? undefined,
          thumbnailUrl: dto.thumbnailUrl ?? undefined,
          
          liveAttendanceEnabled: dto.liveAttendanceEnabled ?? false,
          liveUrlId: dto.liveAttendanceEnabled ? (dto.liveUrlId || uuidv4().replace(/-/g, '').substring(0, 10)) : null,
          liveAccessLevel: dto.liveAccessLevel ?? 'ENROLLED_ONLY',
          livePaymentId: dto.livePaymentId,
          livePaymentStatuses: dto.livePaymentStatuses,
          liveEntryBgUrl: dto.liveEntryBgUrl,

          recAttendanceEnabled: dto.recAttendanceEnabled ?? false,
          recUrlId: dto.recAttendanceEnabled ? (dto.recUrlId || uuidv4().replace(/-/g, '').substring(0, 10)) : null,
          recPlatform: dto.recPlatform ?? 'SYSTEM',
          recAccessLevel: dto.recAccessLevel ?? 'ENROLLED_ONLY',
          recPaymentId: dto.recPaymentId,
          recPaymentStatuses: dto.recPaymentStatuses,
          recTrackingDays: dto.recTrackingDays ?? null,
          recDurationSeconds: dto.recDurationSeconds ?? null,

          createdAt: timestamp,
          updatedAt: timestamp,
        };
        return this.lectureRepository.create(lectureData);
      });

      return await this.lectureRepository.save(lectures);
    } catch (error) {
      throw new BadRequestException(`Failed to create bulk lectures: ${error.message}`);
    }
  }

  async findAllRaw(): Promise<InstituteClassSubjectLecture[]> {
    return await this.lectureRepository
      .createQueryBuilder('lecture')
      .select([
        'lecture.id',
        'lecture.instituteId',
        'lecture.classId',
        'lecture.subjectId',
        'lecture.instructorId',
        'lecture.title',
        'lecture.description',
        'lecture.startTime',
        'lecture.endTime',
        'lecture.location',
        'lecture.status',
        'lecture.lectureType',
        'lecture.isActive',
        'lecture.thumbnailUrl'
      ])
      .leftJoin('lecture.institute', 'institute')
      .addSelect([
        'institute.id',
        'institute.name'
      ])
      .leftJoin('lecture.class', 'class')
      .addSelect([
        'class.id',
        'class.name'
      ])
      .leftJoin('lecture.subject', 'subject')
      .addSelect([
        'subject.id',
        'subject.name'
      ])
      .leftJoin('lecture.instructor', 'instructor')
      .addSelect([
        'instructor.id',
        'instructor.firstName',
        'instructor.lastName',
        'instructor.email'
      ])
      .getMany();
  }

  async getStats(): Promise<any> {
    // 🚀 OPTIMIZED: Single aggregated query instead of 7 separate COUNT queries
    const stats = await this.lectureRepository
      .createQueryBuilder('lecture')
      .select([
        'COUNT(*) as total',
        'SUM(CASE WHEN lecture.isActive = true THEN 1 ELSE 0 END) as active',
        'SUM(CASE WHEN lecture.status = "scheduled" THEN 1 ELSE 0 END) as scheduled',
        'SUM(CASE WHEN lecture.status = "completed" THEN 1 ELSE 0 END) as completed',
        'SUM(CASE WHEN lecture.status = "cancelled" THEN 1 ELSE 0 END) as cancelled',
        'SUM(CASE WHEN lecture.lectureType = "online" THEN 1 ELSE 0 END) as online',
        'SUM(CASE WHEN lecture.lectureType = "physical" THEN 1 ELSE 0 END) as physical'
      ])
      .getRawOne();

    const total = parseInt(stats.total) || 0;
    const active = parseInt(stats.active) || 0;
    const online = parseInt(stats.online) || 0;
    const physical = parseInt(stats.physical) || 0;

    return {
      total,
      active,
      inactive: total - active,
      byStatus: {
        scheduled: parseInt(stats.scheduled) || 0,
        completed: parseInt(stats.completed) || 0,
        cancelled: parseInt(stats.cancelled) || 0,
      },
      byType: {
        online,
        physical,
        hybrid: total - online - physical,
      },
    };
  }

  private applyFilters(queryBuilder: SelectQueryBuilder<InstituteClassSubjectLecture>, filters: any): void {
    if (filters.instituteId) {
      queryBuilder.andWhere('lecture.instituteId = :instituteId', { instituteId: filters.instituteId });
    }

    if (filters.classId) {
      queryBuilder.andWhere('lecture.classId = :classId', { classId: filters.classId });
    }

    if (filters.subjectId) {
      queryBuilder.andWhere('lecture.subjectId = :subjectId', { subjectId: filters.subjectId });
    }

    if (filters.instructorId) {
      queryBuilder.andWhere('lecture.instructorId = :instructorId', { instructorId: filters.instructorId });
    }

    if (filters.lectureType) {
      queryBuilder.andWhere('lecture.lectureType = :lectureType', { lectureType: filters.lectureType });
    }

    if (filters.status) {
      queryBuilder.andWhere('lecture.status = :status', { status: filters.status });
    }

    if (filters.dateFrom) {
      queryBuilder.andWhere('lecture.startTime >= :dateFrom', { dateFrom: filters.dateFrom });
    }

    if (filters.dateTo) {
      queryBuilder.andWhere('lecture.startTime <= :dateTo', { dateTo: filters.dateTo });
    }

    if (filters.isActive !== undefined) {
      queryBuilder.andWhere('lecture.isActive = :isActive', { isActive: filters.isActive });
    }

    if (filters.search) {
      queryBuilder.andWhere('(lecture.title LIKE :search OR lecture.description LIKE :search)', { search: `%${filters.search}%` });
    }
  }
}
