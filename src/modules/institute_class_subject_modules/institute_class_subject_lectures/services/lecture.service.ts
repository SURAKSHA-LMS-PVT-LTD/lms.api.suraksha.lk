import { Injectable, ConflictException, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { LectureRepository } from '../repositories/lecture.repository';
import { 
  ILectureService,
  ILectureCriteria,
  ICreateLecture,
  IUpdateLecture,
  IBulkCreateLectures,
  IScheduleCriteria,
  ILectureSchedule,
  IFindAllOptions
} from '../interfaces/lecture.interface';
import { InstituteClassSubjectLecture } from '../entities/institute_class_subject_lecture.entity';
import { LectureStatus } from '../dto/create-institute_class_subject_lecture.dto';
import { LECTURE_CONSTANTS } from '../constants/lecture.constants';

@Injectable()
export class LectureService implements ILectureService {
  constructor(
    private readonly repository: LectureRepository,
  ) {}

  async createLecture(data: ICreateLecture): Promise<InstituteClassSubjectLecture> {
    // Validate time slot
    this.validateTimeSlot(data.startTime, data.endTime);
    
    // Check for time conflicts
    const hasConflict = await this.checkTimeConflict(
      data.instructorId,
      data.startTime,
      data.endTime
    );

    if (hasConflict) {
      throw new ConflictException(LECTURE_CONSTANTS.ERRORS.TIME_CONFLICT);
    }

    // Validate lecture type specific requirements
    this.validateLectureTypeRequirements(data);

    try {
      return await this.repository.create(data);
    } catch (error) {
      throw new BadRequestException('Failed to create lecture');
    }
  }

  async updateLecture(
    criteria: ILectureCriteria,
    data: IUpdateLecture,
  ): Promise<InstituteClassSubjectLecture> {
    const existingLecture = await this.repository.findOne(criteria);
    if (!existingLecture) {
      throw new NotFoundException(LECTURE_CONSTANTS.ERRORS.NOT_FOUND);
    }

    // Check if lecture can be modified
    this.validateLectureModification(existingLecture);

    // If updating time, validate and check conflicts
    if (data.startTime || data.endTime) {
      const startTime = data.startTime ? new Date(data.startTime) : existingLecture.startTime;
      const endTime = data.endTime ? new Date(data.endTime) : existingLecture.endTime;
      
      this.validateTimeSlot(startTime, endTime);
      
      const hasConflict = await this.checkTimeConflict(
        existingLecture.instructorId,
        startTime,
        endTime,
        existingLecture.id
      );

      if (hasConflict) {
        throw new ConflictException(LECTURE_CONSTANTS.ERRORS.TIME_CONFLICT);
      }
    }

    return await this.repository.update(criteria, data);
  }

  async deleteLecture(criteria: ILectureCriteria): Promise<boolean> {
    const existingLecture = await this.repository.findOne(criteria);
    if (!existingLecture) {
      throw new NotFoundException(LECTURE_CONSTANTS.ERRORS.NOT_FOUND);
    }

    // Check if lecture can be deleted
    this.validateLectureModification(existingLecture);

    return await this.repository.delete(criteria);
  }

  async getLecture(criteria: ILectureCriteria): Promise<InstituteClassSubjectLecture> {
    const result = await this.repository.findOne(criteria);
    if (!result) {
      throw new NotFoundException(LECTURE_CONSTANTS.ERRORS.NOT_FOUND);
    }
    return result;
  }

  async bulkCreateLectures(data: IBulkCreateLectures): Promise<InstituteClassSubjectLecture[]> {
    const lectureData: ICreateLecture[] = data.lectures.map(lecture => ({
      instituteId: data.instituteId,
      classId: data.classId,
      subjectId: data.subjectId,
      instructorId: data.instructorId,
      title: lecture.title,
      description: lecture.description,
      lectureType: lecture.lectureType,
      venue: lecture.venue,
      startTime: new Date(lecture.startTime),
      endTime: new Date(lecture.endTime),
      meetingLink: lecture.meetingLink,
      meetingId: lecture.meetingId,
      meetingPassword: lecture.meetingPassword,
    }));

    // Validate all lectures
    for (const lecture of lectureData) {
      this.validateTimeSlot(lecture.startTime, lecture.endTime);
      this.validateLectureTypeRequirements(lecture);
    }

    // Check for conflicts
    for (const lecture of lectureData) {
      const hasConflict = await this.checkTimeConflict(
        lecture.instructorId,
        lecture.startTime,
        lecture.endTime
      );
      if (hasConflict) {
        throw new ConflictException(`Time conflict for lecture: ${lecture.title}`);
      }
    }

    try {
      return await this.repository.bulkCreate(lectureData);
    } catch (error) {
      throw new BadRequestException(LECTURE_CONSTANTS.ERRORS.BULK_OPERATION_FAILED);
    }
  }

  async getLecturesByInstitute(
    instituteId: string,
    options: IFindAllOptions = {}
  ): Promise<InstituteClassSubjectLecture[]> {
    return await this.repository.findByInstitute(instituteId, {
      ...options,
      withRelations: true,
    });
  }

  async getLecturesByClass(
    instituteId: string,
    classId: string,
    options: IFindAllOptions = {}
  ): Promise<InstituteClassSubjectLecture[]> {
    return await this.repository.findByClass(instituteId, classId, {
      ...options,
      withRelations: true,
    });
  }

  async getLecturesBySubject(
    instituteId: string,
    classId: string,
    subjectId: string,
    options: IFindAllOptions = {}
  ): Promise<InstituteClassSubjectLecture[]> {
    return await this.repository.findBySubject(instituteId, classId, subjectId, {
      ...options,
      withRelations: true,
    });
  }

  async getLecturesByInstructor(
    instructorId: string,
    options: IFindAllOptions = {}
  ): Promise<InstituteClassSubjectLecture[]> {
    return await this.repository.findByInstructor(instructorId, {
      ...options,
      withRelations: true,
    });
  }

  async getLectureSchedule(criteria: IScheduleCriteria): Promise<ILectureSchedule[]> {
    return await this.repository.getLectureSchedule(criteria);
  }

  async updateLectureStatus(
    lectureId: string,
    status: LectureStatus,
  ): Promise<InstituteClassSubjectLecture> {
    return await this.updateLecture({ id: lectureId }, { status });
  }

  async checkTimeConflict(
    instructorId: string,
    startTime: Date,
    endTime: Date,
    excludeId?: string,
  ): Promise<boolean> {
    const conflicts = await this.repository.findConflictingLectures(
      instructorId,
      startTime,
      endTime,
      excludeId
    );
    return conflicts.length > 0;
  }

  async getUpcomingLectures(
    criteria: Partial<ILectureCriteria>,
    days: number = 7,
  ): Promise<InstituteClassSubjectLecture[]> {
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + days);

    return await this.repository.findByDateRange(startDate, endDate, {
      where: criteria,
      withRelations: true,
    });
  }

  async searchLectures(
    query: string,
    filters: Partial<ILectureCriteria> = {},
  ): Promise<InstituteClassSubjectLecture[]> {
    return await this.repository.findAll({
      where: {
        ...filters,
        title: query,
      },
      withRelations: true,
    });
  }

  // Private validation methods
  private validateTimeSlot(startTime: Date, endTime: Date): void {
    const start = new Date(startTime);
    const end = new Date(endTime);
    const now = new Date();

    if (start >= end) {
      throw new BadRequestException(LECTURE_CONSTANTS.ERRORS.INVALID_TIME_SLOT);
    }

    if (start < now) {
      throw new BadRequestException(LECTURE_CONSTANTS.ERRORS.PAST_DATE_NOT_ALLOWED);
    }

    const durationMinutes = (end.getTime() - start.getTime()) / (1000 * 60);
    
    if (durationMinutes < LECTURE_CONSTANTS.TIME_CONSTRAINTS.MIN_LECTURE_DURATION) {
      throw new BadRequestException(`Lecture must be at least ${LECTURE_CONSTANTS.TIME_CONSTRAINTS.MIN_LECTURE_DURATION} minutes long`);
    }

    if (durationMinutes > LECTURE_CONSTANTS.TIME_CONSTRAINTS.MAX_LECTURE_DURATION) {
      throw new BadRequestException(`Lecture cannot be longer than ${LECTURE_CONSTANTS.TIME_CONSTRAINTS.MAX_LECTURE_DURATION} minutes`);
    }
  }

  private validateLectureTypeRequirements(data: ICreateLecture): void {
    if (data.lectureType === 'online' || data.lectureType === 'hybrid') {
      if (!data.meetingLink) {
        throw new BadRequestException(LECTURE_CONSTANTS.ERRORS.INVALID_MEETING_LINK);
      }
    }

    if (data.lectureType === 'physical' || data.lectureType === 'hybrid') {
      if (!data.venue) {
        throw new BadRequestException(LECTURE_CONSTANTS.ERRORS.VENUE_REQUIRED);
      }
    }
  }

  private validateLectureModification(lecture: InstituteClassSubjectLecture): void {
    const now = new Date();
    const lectureStart = new Date(lecture.startTime);
    const cutoffTime = new Date(lectureStart.getTime() - (LECTURE_CONSTANTS.TIME_CONSTRAINTS.MODIFICATION_CUTOFF * 60 * 1000));

    if (lecture.status === 'completed') {
      throw new ForbiddenException(LECTURE_CONSTANTS.ERRORS.LECTURE_COMPLETED);
    }

    if (lecture.status === 'live' || now > cutoffTime) {
      throw new ForbiddenException(LECTURE_CONSTANTS.ERRORS.LECTURE_ALREADY_STARTED);
    }
  }

  // Additional convenience methods
  async findAll(options: IFindAllOptions = {}): Promise<InstituteClassSubjectLecture[]> {
    return await this.repository.findAll({
      ...options,
      withRelations: true,
    });
  }
}
