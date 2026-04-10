import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, MoreThanOrEqual, LessThanOrEqual, In } from 'typeorm';
import { InstituteLectureEntity } from '../entities/institue_lecture.entity';
import { LectureStatus } from '../enums/lecture.enum';
import { IInstituteLecture, IInstituteLectureRepository } from '../interfaces/institute-lecture.interface';

@Injectable()
export class InstituteLectureRepository implements IInstituteLectureRepository {
  constructor(
    @InjectRepository(InstituteLectureEntity)
    private readonly lectureRepository: Repository<InstituteLectureEntity>,
  ) {}

  async create(lecture: Partial<IInstituteLecture>): Promise<IInstituteLecture> {
    try {
      // Validate required fields
      if (!lecture.instituteId) {
        throw new BadRequestException('Institute ID is required');
      }
      if (!lecture.instructorId) {
        throw new BadRequestException('Instructor ID is required');
      }
      if (!lecture.title || !lecture.title.trim()) {
        throw new BadRequestException('Lecture title is required');
      }
      if (!lecture.startTime) {
        throw new BadRequestException('Start time is required');
      }
      if (!lecture.endTime) {
        throw new BadRequestException('End time is required');
      }

      // Sanitize string inputs
      const sanitizedLecture = {
        ...lecture,
        title: lecture.title?.trim(),
        description: lecture.description?.trim() || null,
        venue: lecture.venue?.trim() || null,
        subject: lecture.subject?.trim() || null,
        meetingLink: lecture.meetingLink?.trim() || null,
        meetingId: lecture.meetingId?.trim() || null,
        meetingPassword: lecture.meetingPassword?.trim() || null,
        recordingUrl: lecture.recordingUrl?.trim() || null,
      };

      const newLecture = this.lectureRepository.create(sanitizedLecture);
      return await this.lectureRepository.save(newLecture);
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`Failed to create lecture: ${error.message}`);
    }
  }

  async findAll(filters?: Partial<IInstituteLecture>): Promise<IInstituteLecture[]> {
    try {
      const queryBuilder = this.lectureRepository.createQueryBuilder('lecture')
        // Only select specific class fields if exists (name and grade)
        .leftJoin('lecture.class', 'class')
        .addSelect(['class.id', 'class.name', 'class.grade'])
        // Only select instructor name fields
        .leftJoin('lecture.instructor', 'instructor')
        .addSelect(['instructor.id', 'instructor.firstName', 'instructor.lastName', 'instructor.nameWithInitials', 'instructor.email', 'instructor.imageUrl'])
        .orderBy('lecture.startTime', 'ASC');

      if (filters) {
        if (filters.instituteId) {
          queryBuilder.andWhere('lecture.instituteId = :instituteId', { instituteId: filters.instituteId });
        }
        if (filters.classId) {
          queryBuilder.andWhere('lecture.classId = :classId', { classId: filters.classId });
        }
        if (filters.instructorId) {
          queryBuilder.andWhere('lecture.instructorId = :instructorId', { instructorId: filters.instructorId });
        }
        if (filters.status) {
          queryBuilder.andWhere('lecture.status = :status', { status: filters.status });
        }
        if ((filters as any).lectureType) {
          queryBuilder.andWhere('lecture.lectureType = :lectureType', { lectureType: (filters as any).lectureType });
        }
      }

      const results = await queryBuilder.getMany();
      
      // Manually serialize to plain objects to bypass class-transformer
      // TypeORM returns Date objects, but class-transformer converts them to {}
      // So we use JSON.parse(JSON.stringify()) to get clean plain objects with ISO date strings
      return JSON.parse(JSON.stringify(results));
    } catch (error) {
      throw new BadRequestException(`Failed to fetch lectures: ${error.message}`);
    }
  }

  async findOne(id: string): Promise<IInstituteLecture | null> {
    try {
      // Validate ID format
      if (!id || isNaN(Number(id))) {
        return null;
      }

      const lecture = await this.lectureRepository.createQueryBuilder('lecture')
        // Don't use .select() - let TypeORM load all lecture fields automatically
        .leftJoin('lecture.institute', 'institute')
        .addSelect(['institute.id', 'institute.name'])
        .leftJoin('lecture.class', 'class')
        .addSelect(['class.id', 'class.name', 'class.grade'])
        .leftJoin('lecture.instructor', 'instructor')
        .addSelect(['instructor.id', 'instructor.firstName', 'instructor.lastName', 'instructor.nameWithInitials', 'instructor.email', 'instructor.imageUrl'])
        .where('lecture.id = :id', { id })
        .getOne();
      
      if (!lecture) {
        return null;
      }
      
      // Serialize to plain object
      return JSON.parse(JSON.stringify(lecture));
    } catch (error) {
      return null;
    }
  }

  async findByInstitute(instituteId: string): Promise<IInstituteLecture[]> {
    try {
      // Validate ID format
      if (!instituteId || isNaN(Number(instituteId))) {
        throw new BadRequestException('Invalid institute ID format');
      }

      const results = await this.lectureRepository.createQueryBuilder('lecture')
        // Don't use .select() - let TypeORM load all lecture fields automatically
        .leftJoin('lecture.class', 'class')
        .addSelect(['class.id', 'class.name', 'class.grade'])
        .leftJoin('lecture.instructor', 'instructor')
        .addSelect(['instructor.id', 'instructor.firstName', 'instructor.lastName', 'instructor.nameWithInitials', 'instructor.email', 'instructor.imageUrl'])
        .where('lecture.instituteId = :instituteId', { instituteId })
        .orderBy('lecture.startTime', 'ASC')
        .getMany();
      
      return JSON.parse(JSON.stringify(results));
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`Failed to fetch institute lectures: ${error.message}`);
    }
  }

  async findByClass(classId: string): Promise<IInstituteLecture[]> {
    try {
      // Validate ID format
      if (!classId || isNaN(Number(classId))) {
        throw new BadRequestException('Invalid class ID format');
      }

      const results = await this.lectureRepository.createQueryBuilder('lecture')
        .leftJoinAndSelect('lecture.institute', 'institute')
        .leftJoinAndSelect('lecture.instructor', 'instructor')
        .where('lecture.classId = :classId', { classId })
        .orderBy('lecture.startTime', 'ASC')
        .getMany();
      
      return JSON.parse(JSON.stringify(results));
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`Failed to fetch class lectures: ${error.message}`);
    }
  }

  async findByInstructor(instructorId: string): Promise<IInstituteLecture[]> {
    try {
      // Validate ID format
      if (!instructorId || isNaN(Number(instructorId))) {
        throw new BadRequestException('Invalid instructor ID format');
      }

      const results = await this.lectureRepository.createQueryBuilder('lecture')
        .leftJoinAndSelect('lecture.institute', 'institute')
        .leftJoinAndSelect('lecture.class', 'class')
        .where('lecture.instructorId = :instructorId', { instructorId })
        .orderBy('lecture.startTime', 'ASC')
        .getMany();
      
      return JSON.parse(JSON.stringify(results));
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`Failed to fetch instructor lectures: ${error.message}`);
    }
  }

  async findByDateRange(startDate: Date, endDate: Date): Promise<IInstituteLecture[]> {
    try {
      const results = await this.lectureRepository.find({
        where: {
          startTime: Between(startDate, endDate),
        },
        order: { startTime: 'ASC' },
        relations: ['institute', 'class', 'instructor'],
      });
      
      return JSON.parse(JSON.stringify(results));
    } catch (error) {
      throw new BadRequestException(`Failed to fetch lectures by date range: ${error.message}`);
    }
  }

  async update(id: string, lecture: Partial<IInstituteLecture>): Promise<IInstituteLecture | null> {
    try {
      // Validate ID format
      if (!id || isNaN(Number(id))) {
        throw new BadRequestException('Invalid lecture ID format');
      }

      // Sanitize string inputs
      const sanitizedLecture = {
        ...lecture,
        title: lecture.title?.trim(),
        description: lecture.description?.trim() || null,
        venue: lecture.venue?.trim() || null,
        subject: lecture.subject?.trim() || null,
        meetingLink: lecture.meetingLink?.trim() || null,
        meetingId: lecture.meetingId?.trim() || null,
        meetingPassword: lecture.meetingPassword?.trim() || null,
        recordingUrl: lecture.recordingUrl?.trim() || null,
      };

      await this.lectureRepository.update(id, sanitizedLecture);
      return await this.findOne(id);
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`Failed to update lecture: ${error.message}`);
    }
  }

  async remove(id: string): Promise<void> {
    try {
      // Validate ID format
      if (!id || isNaN(Number(id))) {
        throw new BadRequestException('Invalid lecture ID format');
      }

      await this.lectureRepository.delete(id);
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`Failed to delete lecture: ${error.message}`);
    }
  }

  async updateStatus(id: string, status: LectureStatus): Promise<IInstituteLecture | null> {
    try {
      // Validate ID format
      if (!id || isNaN(Number(id))) {
        throw new BadRequestException('Invalid lecture ID format');
      }

      await this.lectureRepository.update(id, { status });
      return await this.findOne(id);
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`Failed to update lecture status: ${error.message}`);
    }
  }

  async findUpcoming(instituteId: string, limit?: number): Promise<IInstituteLecture[]> {
    try {
      // Validate ID format
      if (!instituteId || isNaN(Number(instituteId))) {
        throw new BadRequestException('Invalid institute ID format');
      }

      const now = new Date();
      const results = await this.lectureRepository.find({
        where: {
          instituteId,
          startTime: MoreThanOrEqual(now),
          status: In([LectureStatus.SCHEDULED, LectureStatus.POSTPONED]),
        },
        order: { startTime: 'ASC' },
        take: limit || 50,
        relations: ['class', 'instructor'],
      });
      
      return JSON.parse(JSON.stringify(results));
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`Failed to fetch upcoming lectures: ${error.message}`);
    }
  }

  async findOngoing(instituteId: string): Promise<IInstituteLecture[]> {
    try {
      // Validate ID format
      if (!instituteId || isNaN(Number(instituteId))) {
        throw new BadRequestException('Invalid institute ID format');
      }

      const now = new Date();
      const results = await this.lectureRepository.find({
        where: {
          instituteId,
          startTime: LessThanOrEqual(now),
          endTime: MoreThanOrEqual(now),
          status: LectureStatus.ONGOING,
        },
        relations: ['class', 'instructor'],
      });
      
      return JSON.parse(JSON.stringify(results));
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`Failed to fetch ongoing lectures: ${error.message}`);
    }
  }

  async findCompleted(instituteId: string, limit?: number): Promise<IInstituteLecture[]> {
    try {
      // Validate ID format
      if (!instituteId || isNaN(Number(instituteId))) {
        throw new BadRequestException('Invalid institute ID format');
      }

      const now = new Date();
      const results = await this.lectureRepository.find({
        where: {
          instituteId,
          endTime: LessThanOrEqual(now),
          status: LectureStatus.COMPLETED,
        },
        order: { endTime: 'DESC' },
        take: limit || 50,
        relations: ['class', 'instructor'],
      });
      
      return JSON.parse(JSON.stringify(results));
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`Failed to fetch completed lectures: ${error.message}`);
    }
  }

  async reschedule(id: string, startTime: Date, endTime: Date): Promise<IInstituteLecture | null> {
    try {
      // Validate ID format
      if (!id || isNaN(Number(id))) {
        throw new BadRequestException('Invalid lecture ID format');
      }

      // Validate dates
      if (!startTime || !endTime) {
        throw new BadRequestException('Start time and end time are required');
      }

      if (endTime <= startTime) {
        throw new BadRequestException('End time must be after start time');
      }

      await this.lectureRepository.update(id, { 
        startTime, 
        endTime,
        status: LectureStatus.SCHEDULED 
      });
      return await this.findOne(id);
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`Failed to reschedule lecture: ${error.message}`);
    }
  }

  async findBySchedule(date: string, filters?: Partial<IInstituteLecture>): Promise<IInstituteLecture[]> {
    try {
      const dayStart = new Date(`${date}T00:00:00.000Z`);
      const dayEnd = new Date(`${date}T23:59:59.999Z`);

      if (isNaN(dayStart.getTime())) {
        throw new BadRequestException('Invalid date format. Use YYYY-MM-DD');
      }

      const qb = this.lectureRepository.createQueryBuilder('lecture')
        .leftJoin('lecture.class', 'class')
        .addSelect(['class.id', 'class.name', 'class.grade'])
        .leftJoin('lecture.instructor', 'instructor')
        .addSelect(['instructor.id', 'instructor.firstName', 'instructor.lastName', 'instructor.nameWithInitials', 'instructor.email', 'instructor.imageUrl'])
        .where('lecture.startTime >= :dayStart', { dayStart })
        .andWhere('lecture.startTime <= :dayEnd', { dayEnd })
        .orderBy('lecture.startTime', 'ASC');

      if (filters?.instituteId) {
        qb.andWhere('lecture.instituteId = :instituteId', { instituteId: filters.instituteId });
      }
      if (filters?.classId) {
        qb.andWhere('lecture.classId = :classId', { classId: filters.classId });
      }
      if (filters?.instructorId) {
        qb.andWhere('lecture.instructorId = :instructorId', { instructorId: filters.instructorId });
      }
      if ((filters as any)?.status) {
        qb.andWhere('lecture.status = :status', { status: (filters as any).status });
      }
      if ((filters as any)?.lectureType) {
        qb.andWhere('lecture.lectureType = :lectureType', { lectureType: (filters as any).lectureType });
      }

      const results = await qb.getMany();
      return JSON.parse(JSON.stringify(results));
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`Failed to fetch schedule: ${error.message}`);
    }
  }

  async createBulk(lectures: Partial<IInstituteLecture>[]): Promise<IInstituteLecture[]> {
    try {
      if (!Array.isArray(lectures) || lectures.length === 0) {
        throw new BadRequestException('Lectures array must not be empty');
      }

      const entities = lectures.map(l => this.lectureRepository.create({
        ...l,
        title: l.title?.trim(),
        description: l.description?.trim() || null,
        venue: l.venue?.trim() || null,
        subject: l.subject?.trim() || null,
        meetingLink: l.meetingLink?.trim() || null,
        meetingId: l.meetingId?.trim() || null,
        meetingPassword: l.meetingPassword?.trim() || null,
        recordingUrl: l.recordingUrl?.trim() || null,
      }));

      const saved = await this.lectureRepository.save(entities);
      return JSON.parse(JSON.stringify(saved));
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`Failed to bulk create lectures: ${error.message}`);
    }
  }
}
