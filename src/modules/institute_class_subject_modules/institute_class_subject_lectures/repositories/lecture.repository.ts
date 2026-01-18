import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, Like } from 'typeorm';
import { InstituteClassSubjectLecture } from '../entities/institute_class_subject_lecture.entity';
import { now } from '../../../../common/utils/timezone.util';
import { 
  ILectureRepository,
  ILectureCriteria,
  ICreateLecture,
  IUpdateLecture,
  IFindAllOptions,
  IScheduleCriteria,
  ILectureSchedule
} from '../interfaces/lecture.interface';
import { LECTURE_CONSTANTS } from '../constants/lecture.constants';

@Injectable()
export class LectureRepository implements ILectureRepository {
  constructor(
    @InjectRepository(InstituteClassSubjectLecture)
    private readonly repository: Repository<InstituteClassSubjectLecture>,
  ) {}

  async findAll(options: IFindAllOptions = {}): Promise<InstituteClassSubjectLecture[]> {
    const queryBuilder = this.repository.createQueryBuilder('lecture');
    
    if (options.withRelations || options.relations) {
      const relations = options.relations || LECTURE_CONSTANTS.RELATIONS.ALL;
      relations.forEach(relation => {
        queryBuilder.leftJoinAndSelect(`lecture.${relation}`, relation);
      });
    }

    if (options.where) {
      queryBuilder.where(options.where);
    }

    if (options.order) {
      queryBuilder.orderBy(options.order);
    } else {
      queryBuilder.orderBy('lecture.startTime', 'ASC');
    }

    if (options.skip) {
      queryBuilder.skip(options.skip);
    }

    if (options.take) {
      queryBuilder.take(options.take);
    }

    return await queryBuilder.getMany();
  }

  async findOne(criteria: ILectureCriteria): Promise<InstituteClassSubjectLecture | null> {
    const where: any = {};
    
    if (criteria.id) where.id = criteria.id;
    if (criteria.instituteId) where.instituteId = criteria.instituteId;
    if (criteria.classId) where.classId = criteria.classId;
    if (criteria.subjectId) where.subjectId = criteria.subjectId;
    if (criteria.instructorId) where.instructorId = criteria.instructorId;
    if (criteria.title) where.title = Like(`%${criteria.title}%`);
    if (criteria.lectureType) where.lectureType = criteria.lectureType;
    if (criteria.status) where.status = criteria.status;

    return await this.repository.findOne({
      where,
      relations: ['institute', 'class', 'subject', 'instructor'],
    });
  }

  async create(data: ICreateLecture): Promise<InstituteClassSubjectLecture> {
    const timestamp = now();
    const entity = this.repository.create({
      ...data,
      startTime: new Date(data.startTime),
      endTime: new Date(data.endTime),
      status: data.status || 'scheduled',
      lectureType: data.lectureType || 'physical',
      isRecorded: data.isRecorded || false,
      isActive: data.isActive !== undefined ? data.isActive : true,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    return await this.repository.save(entity);
  }

  async update(
    criteria: ILectureCriteria,
    data: IUpdateLecture,
  ): Promise<InstituteClassSubjectLecture> {
    const where: any = {};
    if (criteria.id) where.id = criteria.id;
    if (criteria.instituteId) where.instituteId = criteria.instituteId;
    if (criteria.classId) where.classId = criteria.classId;
    if (criteria.subjectId) where.subjectId = criteria.subjectId;
    if (criteria.instructorId) where.instructorId = criteria.instructorId;

    const updateData = { ...data };
    if (data.startTime) updateData.startTime = new Date(data.startTime);
    if (data.endTime) updateData.endTime = new Date(data.endTime);

    await this.repository.update(where, updateData);
    
    const updated = await this.findOne(criteria);
    if (!updated) {
      throw new Error(LECTURE_CONSTANTS.ERRORS.NOT_FOUND);
    }
    return updated;
  }

  async delete(criteria: ILectureCriteria): Promise<boolean> {
    const where: any = {};
    if (criteria.id) where.id = criteria.id;
    if (criteria.instituteId) where.instituteId = criteria.instituteId;
    if (criteria.classId) where.classId = criteria.classId;
    if (criteria.subjectId) where.subjectId = criteria.subjectId;
    if (criteria.instructorId) where.instructorId = criteria.instructorId;

    const result = await this.repository.delete(where);
    return result.affected! > 0;
  }

  async bulkCreate(data: ICreateLecture[]): Promise<InstituteClassSubjectLecture[]> {
    const timestamp = now();
    const entities = data.map(item => 
      this.repository.create({
        ...item,
        startTime: new Date(item.startTime),
        endTime: new Date(item.endTime),
        status: item.status || 'scheduled',
        lectureType: item.lectureType || 'physical',
        isRecorded: item.isRecorded || false,
        isActive: item.isActive !== undefined ? item.isActive : true,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
    );
    return await this.repository.save(entities);
  }

  async findByInstitute(
    instituteId: string,
    options: IFindAllOptions = {}
  ): Promise<InstituteClassSubjectLecture[]> {
    return await this.findAll({
      ...options,
      where: { ...options.where, instituteId },
    });
  }

  async findByClass(
    instituteId: string,
    classId: string,
    options: IFindAllOptions = {}
  ): Promise<InstituteClassSubjectLecture[]> {
    return await this.findAll({
      ...options,
      where: { ...options.where, instituteId, classId },
    });
  }

  async findBySubject(
    instituteId: string,
    classId: string,
    subjectId: string,
    options: IFindAllOptions = {}
  ): Promise<InstituteClassSubjectLecture[]> {
    return await this.findAll({
      ...options,
      where: { ...options.where, instituteId, classId, subjectId },
    });
  }

  async findByInstructor(
    instructorId: string,
    options: IFindAllOptions = {}
  ): Promise<InstituteClassSubjectLecture[]> {
    return await this.findAll({
      ...options,
      where: { ...options.where, instructorId },
    });
  }

  async findByDateRange(
    startDate: Date,
    endDate: Date,
    options: IFindAllOptions = {}
  ): Promise<InstituteClassSubjectLecture[]> {
    return await this.findAll({
      ...options,
      where: {
        ...options.where,
        startTime: Between(startDate, endDate),
      },
    });
  }

  async findConflictingLectures(
    instructorId: string,
    startTime: Date,
    endTime: Date,
    excludeId?: string
  ): Promise<InstituteClassSubjectLecture[]> {
    const queryBuilder = this.repository.createQueryBuilder('lecture');
    
    queryBuilder
      .where('lecture.instructorId = :instructorId', { instructorId })
      .andWhere(
        '(lecture.startTime BETWEEN :startTime AND :endTime OR lecture.endTime BETWEEN :startTime AND :endTime OR (:startTime BETWEEN lecture.startTime AND lecture.endTime))',
        { startTime, endTime }
      );

    if (excludeId) {
      queryBuilder.andWhere('lecture.id != :excludeId', { excludeId });
    }

    return await queryBuilder.getMany();
  }

  async getLectureSchedule(criteria: IScheduleCriteria): Promise<ILectureSchedule[]> {
    const lectures = await this.findByDateRange(criteria.startDate, criteria.endDate, {
      where: {
        ...(criteria.instituteId && { instituteId: criteria.instituteId }),
        ...(criteria.classId && { classId: criteria.classId }),
        ...(criteria.subjectId && { subjectId: criteria.subjectId }),
        ...(criteria.instructorId && { instructorId: criteria.instructorId }),
      },
      withRelations: true,
    });

    // Group lectures by date
    const scheduleMap = new Map<string, InstituteClassSubjectLecture[]>();
    
    lectures.forEach(lecture => {
      const dateKey = lecture.startTime.toISOString().split('T')[0];
      if (!scheduleMap.has(dateKey)) {
        scheduleMap.set(dateKey, []);
      }
      scheduleMap.get(dateKey)!.push(lecture);
    });

    // Convert to schedule format
    return Array.from(scheduleMap.entries()).map(([date, lectures]) => ({
      date,
      lectures: lectures.sort((a, b) => a.startTime.getTime() - b.startTime.getTime()),
      totalLectures: lectures.length,
    }));
  }

  async exists(criteria: ILectureCriteria): Promise<boolean> {
    const count = await this.repository.count({
      where: criteria as any,
    });
    return count > 0;
  }

  async count(criteria: Partial<ILectureCriteria> = {}): Promise<number> {
    return await this.repository.count({
      where: criteria as any,
    });
  }
}
