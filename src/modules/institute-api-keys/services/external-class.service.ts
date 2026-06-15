import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InstituteClassEntity } from '../../institute_mudules/institue_class/entities/institue_class.entity';
import { InstituteClassAttendanceSessionEntity } from '../../attendance/entities/institute-class-attendance-session.entity';
import { InstituteClassStudentEntity } from '../../institute_class_modules/institute_class_student/entities/institute_class_student.entity';
import { now, getCurrentSriLankaDate } from '../../../common/utils/timezone.util';
import {
  CreateExternalSessionDto,
  ExternalClassSummary,
  ExternalSessionSummary,
} from '../dto/external-class.dto';

/**
 * Read-only discovery (classes, sessions) + session generation for the external API.
 * Institute is always taken from the API key — every query is scoped to it.
 */
@Injectable()
export class ExternalClassService {
  private readonly logger = new Logger(ExternalClassService.name);

  constructor(
    @InjectRepository(InstituteClassEntity)
    private readonly classRepo: Repository<InstituteClassEntity>,
    @InjectRepository(InstituteClassAttendanceSessionEntity)
    private readonly sessionRepo: Repository<InstituteClassAttendanceSessionEntity>,
    @InjectRepository(InstituteClassStudentEntity)
    private readonly classStudentRepo: Repository<InstituteClassStudentEntity>,
  ) {}

  /** All classes for the institute (id + name + basic identifiers). Optional name filter. */
  async listClasses(instituteId: string, search?: string): Promise<ExternalClassSummary[]> {
    const qb = this.classRepo
      .createQueryBuilder('c')
      .where('c.instituteId = :instituteId', { instituteId })
      .orderBy('c.name', 'ASC');

    if (search?.trim()) {
      qb.andWhere('c.name LIKE :search', { search: `%${search.trim()}%` });
    }

    const classes = await qb.getMany();
    return classes.map(c => ({
      id: c.id,
      name: c.name,
      code: c.code,
      classType: c.classType,
      grade: c.grade,
      academicYear: c.academicYear,
      isActive: c.isActive,
    }));
  }

  /** Sessions for one class (must belong to the institute). Optional name filter. */
  async listSessions(
    instituteId: string,
    classId: string,
    search?: string,
  ): Promise<ExternalSessionSummary[]> {
    // Confirm the class belongs to this institute before listing its sessions.
    const cls = await this.classRepo.findOne({ where: { id: classId, instituteId } });
    if (!cls) {
      throw new NotFoundException(`Class '${classId}' not found for this institute`);
    }

    const qb = this.sessionRepo
      .createQueryBuilder('s')
      .where('s.instituteId = :instituteId', { instituteId })
      .andWhere('s.classId = :classId', { classId })
      .orderBy('s.date', 'DESC')
      .addOrderBy('s.startTime', 'DESC');

    if (search?.trim()) {
      qb.andWhere('s.name LIKE :search', { search: `%${search.trim()}%` });
    }

    const sessions = await qb.getMany();
    return sessions.map(s => this.mapSession(s));
  }

  /** Generate a new attendance session for a class. Mirrors the in-app session create. */
  async createSession(
    instituteId: string,
    classId: string,
    dto: CreateExternalSessionDto,
  ): Promise<ExternalSessionSummary> {
    const cls = await this.classRepo.findOne({ where: { id: classId, instituteId } });
    if (!cls) {
      throw new NotFoundException(`Class '${classId}' not found for this institute`);
    }

    const date = dto.date ?? getCurrentSriLankaDate();

    // Snapshot the verified active enrolment count, same as the in-app session creator.
    const totalStudents = await this.classStudentRepo.count({
      where: { instituteId, classId, isActive: true, isVerified: true },
    });

    const timestamp = now();
    const session = this.sessionRepo.create({
      instituteId,
      classId,
      name: dto.name,
      date,
      startTime: dto.startTime,
      endTime: dto.endTime,
      isClosed: false,
      totalStudents,
      // External sessions never trigger parent notifications — this is a migration/integration path.
      sendNotifications: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    const saved = await this.sessionRepo.save(session);
    this.logger.log(`External API created session ${saved.id} for class ${classId} on ${date}`);
    return this.mapSession(saved);
  }

  private mapSession(s: InstituteClassAttendanceSessionEntity): ExternalSessionSummary {
    return {
      id: s.id,
      name: s.name,
      classId: s.classId,
      date: typeof s.date === 'string' ? s.date : String(s.date).substring(0, 10),
      startTime: s.startTime,
      endTime: s.endTime,
      isClosed: s.isClosed,
      totalStudents: s.totalStudents,
    };
  }
}
