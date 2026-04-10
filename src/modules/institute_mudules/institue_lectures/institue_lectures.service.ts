import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { now } from '../../../common/utils/timezone.util';
import { CreateInstitueLectureDto, BulkCreateInstitueLectureDto } from './dto/create-institue_lecture.dto';
import { UpdateInstitueLectureDto } from './dto/update-institue_lecture.dto';
import { InstituteLectureRepository } from './repositories/institute-lecture.repository';
import { LectureFilterDto } from './dto/lecture-filter.dto';
import { UpdateLectureStatusDto } from './dto/update-lecture-status.dto';
import { RescheduleLectureDto } from './dto/reschedule-lecture.dto';
import { 
  INSTITUTE_LECTURE_NOT_FOUND, 
  INSTITUTE_LECTURE_CANCELLED,
  INSTITUTE_LECTURE_COMPLETED,
  INSTITUTE_LECTURE_RESCHEDULED,
  INSTITUTE_LECTURE_STARTED
} from './constants/institute-lecture.constants';
import { LectureStatus } from './enums/lecture.enum';
import { CloudStorageService } from '../../../common/services/cloud-storage.service';

@Injectable()
export class InstitueLecturesService {
  constructor(
    private readonly lectureRepository: InstituteLectureRepository,
    private readonly cloudStorageService: CloudStorageService,
  ) {}

  private transformMaterialUrls(lecture: any): void {
    if (Array.isArray(lecture?.materials)) {
      lecture.materials = lecture.materials.map((m: any) => ({
        ...m,
        documentUrl: m.source === 'S3' && m.documentUrl
          ? this.cloudStorageService.getFullUrl(m.documentUrl)
          : m.documentUrl,
      }));
    }
    if (lecture?.recordingUrl) {
      lecture.recordingUrl = this.cloudStorageService.getFullUrl(lecture.recordingUrl);
    }
    if (lecture?.thumbnailUrl && !lecture.thumbnailUrl.startsWith('http')) {
      lecture.thumbnailUrl = this.cloudStorageService.getFullUrl(lecture.thumbnailUrl);
    }
  }

  private transformLectures<T extends any>(lectures: T[]): T[] {
    lectures.forEach(l => this.transformMaterialUrls(l));
    return lectures;
  }

  async create(createInstitueLectureDto: CreateInstitueLectureDto) {
    const timestamp = now();
    return await this.lectureRepository.create({
      ...createInstitueLectureDto,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  }

  async findAll(filterDto: LectureFilterDto = {}) {
    const lectures = await this.lectureRepository.findAll(filterDto);
    return this.transformLectures(lectures);
  }

  async findOne(id: string) {
    const lecture = await this.lectureRepository.findOne(id);
    if (!lecture) {
      throw new NotFoundException(INSTITUTE_LECTURE_NOT_FOUND);
    }
    this.transformMaterialUrls(lecture);
    return lecture;
  }

  async update(id: string, updateInstitueLectureDto: UpdateInstitueLectureDto) {
    const lecture = await this.lectureRepository.findOne(id);
    if (!lecture) {
      throw new NotFoundException(INSTITUTE_LECTURE_NOT_FOUND);
    }
    const updated = await this.lectureRepository.update(id, updateInstitueLectureDto);
    this.transformMaterialUrls(updated);
    return updated;
  }

  async remove(id: string) {
    const lecture = await this.lectureRepository.findOne(id);
    if (!lecture) {
      throw new NotFoundException(INSTITUTE_LECTURE_NOT_FOUND);
    }
    await this.lectureRepository.remove(id);
    return { message: INSTITUTE_LECTURE_CANCELLED };
  }

  async removePermanent(id: string) {
    const lecture = await this.lectureRepository.findOne(id);
    if (!lecture) {
      throw new NotFoundException(INSTITUTE_LECTURE_NOT_FOUND);
    }
    await this.lectureRepository.remove(id);
    return {
      success: true,
      message: 'Lecture permanently deleted successfully',
      lectureId: id,
      instituteId: lecture.instituteId
    };
  }

  async findByInstitute(instituteId: string) {
    const lectures = await this.lectureRepository.findByInstitute(instituteId);
    return this.transformLectures(lectures);
  }

  async findByClass(classId: string) {
    const lectures = await this.lectureRepository.findByClass(classId);
    return this.transformLectures(lectures);
  }

  async findByInstructor(instructorId: string) {
    const lectures = await this.lectureRepository.findByInstructor(instructorId);
    return this.transformLectures(lectures);
  }

  async findUpcoming(instituteId: string, limit?: number) {
    const lectures = await this.lectureRepository.findUpcoming(instituteId, limit);
    return this.transformLectures(lectures);
  }

  async findOngoing(instituteId: string) {
    const lectures = await this.lectureRepository.findOngoing(instituteId);
    return this.transformLectures(lectures);
  }

  async findCompleted(instituteId: string, limit?: number) {
    const lectures = await this.lectureRepository.findCompleted(instituteId, limit);
    return this.transformLectures(lectures);
  }

  async updateStatus(id: string, updateStatusDto: UpdateLectureStatusDto) {
    const lecture = await this.lectureRepository.findOne(id);
    if (!lecture) {
      throw new NotFoundException(INSTITUTE_LECTURE_NOT_FOUND);
    }

    const updatedLecture = await this.lectureRepository.updateStatus(id, updateStatusDto.status);
    this.transformMaterialUrls(updatedLecture);
    
    let message: string;
    switch (updateStatusDto.status) {
      case LectureStatus.CANCELLED:
        message = INSTITUTE_LECTURE_CANCELLED;
        break;
      case LectureStatus.COMPLETED:
        message = INSTITUTE_LECTURE_COMPLETED;
        break;
      case LectureStatus.ONGOING:
        message = INSTITUTE_LECTURE_STARTED;
        break;
      default:
        message = 'Lecture status updated successfully';
    }
    
    return { lecture: updatedLecture, message };
  }

  async reschedule(id: string, rescheduleDto: RescheduleLectureDto) {
    const lecture = await this.lectureRepository.findOne(id);
    if (!lecture) {
      throw new NotFoundException(INSTITUTE_LECTURE_NOT_FOUND);
    }

    // Validate that end time is after start time
    if (rescheduleDto.endTime <= rescheduleDto.startTime) {
      throw new BadRequestException('End time must be after start time');
    }

    const updatedLecture = await this.lectureRepository.reschedule(
      id, 
      rescheduleDto.startTime, 
      rescheduleDto.endTime
    );
    this.transformMaterialUrls(updatedLecture);
    
    return { 
      lecture: updatedLecture, 
      message: INSTITUTE_LECTURE_RESCHEDULED 
    };
  }

  async findByDateRange(startDate: Date, endDate: Date) {
    const lectures = await this.lectureRepository.findByDateRange(startDate, endDate);
    return this.transformLectures(lectures);
  }

  async findBySchedule(date: string, filters?: any) {
    const lectures = await this.lectureRepository.findBySchedule(date, filters);
    return this.transformLectures(lectures);
  }

  async createBulk(bulkDto: BulkCreateInstitueLectureDto) {
    const timestamp = now();
    const withTimestamps = bulkDto.lectures.map(l => ({
      ...l,
      createdAt: timestamp,
      updatedAt: timestamp,
    }));
    const created = await this.lectureRepository.createBulk(withTimestamps);
    return this.transformLectures(created);
  }
}
