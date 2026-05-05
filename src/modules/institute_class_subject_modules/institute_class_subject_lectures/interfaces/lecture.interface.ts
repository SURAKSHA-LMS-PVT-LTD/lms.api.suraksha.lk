import { InstituteClassSubjectLecture } from '../entities/institute_class_subject_lecture.entity';
import { LectureType, LectureStatus } from '../dto/create-institute_class_subject_lecture.dto';

/**
 * Interface for Lecture Repository operations
 */
export interface ILectureRepository {
  findAll(options?: IFindAllOptions): Promise<InstituteClassSubjectLecture[]>;
  findOne(criteria: ILectureCriteria): Promise<InstituteClassSubjectLecture | null>;
  create(data: ICreateLecture): Promise<InstituteClassSubjectLecture>;
  update(criteria: ILectureCriteria, data: IUpdateLecture): Promise<InstituteClassSubjectLecture>;
  delete(criteria: ILectureCriteria): Promise<boolean>;
  bulkCreate(data: ICreateLecture[]): Promise<InstituteClassSubjectLecture[]>;
  findByInstitute(instituteId: string, options?: IFindAllOptions): Promise<InstituteClassSubjectLecture[]>;
  findByClass(instituteId: string, classId: string, options?: IFindAllOptions): Promise<InstituteClassSubjectLecture[]>;
  findBySubject(instituteId: string, classId: string, subjectId: string, options?: IFindAllOptions): Promise<InstituteClassSubjectLecture[]>;
  findByInstructor(instructorId: string, options?: IFindAllOptions): Promise<InstituteClassSubjectLecture[]>;
  findByDateRange(startDate: Date, endDate: Date, options?: IFindAllOptions): Promise<InstituteClassSubjectLecture[]>;
  findConflictingLectures(instructorId: string, startTime: Date, endTime: Date, excludeId?: string): Promise<InstituteClassSubjectLecture[]>;
  getLectureSchedule(criteria: IScheduleCriteria): Promise<ILectureSchedule[]>;
  exists(criteria: ILectureCriteria): Promise<boolean>;
  count(criteria?: Partial<ILectureCriteria>): Promise<number>;
}

export interface ILectureService {
  createLecture(data: ICreateLecture): Promise<InstituteClassSubjectLecture>;
  updateLecture(criteria: ILectureCriteria, data: IUpdateLecture): Promise<InstituteClassSubjectLecture>;
  deleteLecture(criteria: ILectureCriteria): Promise<boolean>;
  getLecture(criteria: ILectureCriteria): Promise<InstituteClassSubjectLecture>;
  bulkCreateLectures(data: IBulkCreateLectures): Promise<InstituteClassSubjectLecture[]>;
  getLecturesByInstitute(instituteId: string, options?: IFindAllOptions): Promise<InstituteClassSubjectLecture[]>;
  getLecturesByClass(instituteId: string, classId: string, options?: IFindAllOptions): Promise<InstituteClassSubjectLecture[]>;
  getLecturesBySubject(instituteId: string, classId: string, subjectId: string, options?: IFindAllOptions): Promise<InstituteClassSubjectLecture[]>;
  getLecturesByInstructor(instructorId: string, options?: IFindAllOptions): Promise<InstituteClassSubjectLecture[]>;
  getLectureSchedule(criteria: IScheduleCriteria): Promise<ILectureSchedule[]>;
  updateLectureStatus(lectureId: string, status: LectureStatus): Promise<InstituteClassSubjectLecture>;
  checkTimeConflict(instructorId: string, startTime: Date, endTime: Date, excludeId?: string): Promise<boolean>;
  getUpcomingLectures(criteria: Partial<ILectureCriteria>, days?: number): Promise<InstituteClassSubjectLecture[]>;
  searchLectures(query: string, filters?: Partial<ILectureCriteria>): Promise<InstituteClassSubjectLecture[]>;
}

/**
 * Core data interfaces
 */
export interface ILectureCriteria {
  id?: string;
  instituteId?: string;
  classId?: string;
  subjectId?: string;
  instructorId?: string;
  title?: string;
  lectureType?: LectureType;
  status?: LectureStatus;
  startDate?: Date;
  endDate?: Date;
}

export interface ICreateLecture {
  instituteId: string;
  classId?: string;
  subjectId: string;
  instructorId: string;
  title: string;
  description?: string;
  lectureType: LectureType;
  venue?: string;
  startTime: Date;
  endTime: Date;
  status?: LectureStatus;
  meetingLink?: string;
  meetingId?: string;
  meetingPassword?: string;
  recordingUrl?: string;
  isRecorded?: boolean;
  maxParticipants?: number;
  isActive?: boolean;
  materials?: Array<{
    documentName: string;
    documentUrl: string;
    driveFileId?: string;
    driveWebViewLink?: string;
    source?: string;
  }>;
  welcomeMessageEnabled?: boolean;
  welcomeMessageText?: string;
  welcomeMessageVoiceEnabled?: boolean;
}

export interface IUpdateLecture {
  title?: string;
  description?: string;
  venue?: string;
  startTime?: Date;
  endTime?: Date;
  status?: LectureStatus;
  meetingLink?: string;
  meetingId?: string;
  meetingPassword?: string;
  recordingUrl?: string;
  isRecorded?: boolean;
  maxParticipants?: number;
  isActive?: boolean;
  materials?: Array<{
    documentName: string;
    documentUrl: string;
    driveFileId?: string;
    driveWebViewLink?: string;
    source?: string;
  }>;
  welcomeMessageEnabled?: boolean;
  welcomeMessageText?: string;
  welcomeMessageVoiceEnabled?: boolean;
}

export interface IBulkCreateLectures {
  instituteId: string;
  classId?: string;
  subjectId: string;
  instructorId: string;
  lectures: Array<{
    title: string;
    description?: string;
    lectureType: LectureType;
    venue?: string;
    startTime: Date;
    endTime: Date;
    meetingLink?: string;
    meetingId?: string;
    meetingPassword?: string;
  }>;
}

export interface IScheduleCriteria {
  instituteId?: string;
  classId?: string;
  subjectId?: string;
  instructorId?: string;
  startDate: Date;
  endDate: Date;
}

/**
 * Query options
 */
export interface IFindAllOptions {
  skip?: number;
  take?: number;
  withRelations?: boolean;
  relations?: string[];
  where?: any;
  order?: any;
}

/**
 * Response interfaces
 */
export interface ILectureSchedule {
  date: string;
  lectures: InstituteClassSubjectLecture[];
  totalLectures: number;
}

export interface ILectureConflict {
  hasConflict: boolean;
  conflictingLectures: InstituteClassSubjectLecture[];
}

export interface IPaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
