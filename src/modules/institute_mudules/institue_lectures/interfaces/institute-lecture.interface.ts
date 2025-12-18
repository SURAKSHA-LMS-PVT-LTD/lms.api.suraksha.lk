import { LectureStatus, LectureType } from '../enums/lecture.enum';

export interface IInstituteLecture {
  id: string;
  instituteId: string;
  classId?: string;
  instructorId?: string;
  title: string;
  description?: string;
  lectureType: LectureType;
  venue?: string;
  subject?: string;
  startTime: Date;
  endTime: Date;
  status: LectureStatus;
  meetingLink?: string;
  meetingId?: string;
  meetingPassword?: string;
  recordingUrl?: string;
  isRecorded: boolean;
  maxParticipants?: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface IInstituteLectureRepository {
  create(lecture: Partial<IInstituteLecture>): Promise<IInstituteLecture>;
  findAll(filters?: Partial<IInstituteLecture>): Promise<IInstituteLecture[]>;
  findOne(id: string): Promise<IInstituteLecture | null>;
  findByInstitute(instituteId: string): Promise<IInstituteLecture[]>;
  findByClass(classId: string): Promise<IInstituteLecture[]>;
  findByInstructor(instructorId: string): Promise<IInstituteLecture[]>;
  findByDateRange(startDate: Date, endDate: Date): Promise<IInstituteLecture[]>;
  update(id: string, lecture: Partial<IInstituteLecture>): Promise<IInstituteLecture | null>;
  remove(id: string): Promise<void>;
  updateStatus(id: string, status: LectureStatus): Promise<IInstituteLecture | null>;
  findUpcoming(instituteId: string, limit?: number): Promise<IInstituteLecture[]>;
  findOngoing(instituteId: string): Promise<IInstituteLecture[]>;
  findCompleted(instituteId: string, limit?: number): Promise<IInstituteLecture[]>;
  reschedule(id: string, startTime: Date, endTime: Date): Promise<IInstituteLecture | null>;
}
