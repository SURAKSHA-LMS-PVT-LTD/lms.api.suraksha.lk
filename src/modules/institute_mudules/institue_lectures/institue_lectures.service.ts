import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { CreateInstitueLectureDto } from './dto/create-institue_lecture.dto';
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

@Injectable()
export class InstitueLecturesService {
  constructor(
    private readonly lectureRepository: InstituteLectureRepository,
  ) {}

  async create(createInstitueLectureDto: CreateInstitueLectureDto) {
    return await this.lectureRepository.create(createInstitueLectureDto);
  }

  async findAll(filterDto: LectureFilterDto = {}) {
    return await this.lectureRepository.findAll(filterDto);
  }

  async findOne(id: string) {
    const lecture = await this.lectureRepository.findOne(id);
    if (!lecture) {
      throw new NotFoundException(INSTITUTE_LECTURE_NOT_FOUND);
    }
    return lecture;
  }

  async update(id: string, updateInstitueLectureDto: UpdateInstitueLectureDto) {
    const lecture = await this.lectureRepository.findOne(id);
    if (!lecture) {
      throw new NotFoundException(INSTITUTE_LECTURE_NOT_FOUND);
    }
    return await this.lectureRepository.update(id, updateInstitueLectureDto);
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
    return await this.lectureRepository.findByInstitute(instituteId);
  }

  async findByClass(classId: string) {
    return await this.lectureRepository.findByClass(classId);
  }

  async findByInstructor(instructorId: string) {
    return await this.lectureRepository.findByInstructor(instructorId);
  }

  async findUpcoming(instituteId: string, limit?: number) {
    return await this.lectureRepository.findUpcoming(instituteId, limit);
  }

  async findOngoing(instituteId: string) {
    return await this.lectureRepository.findOngoing(instituteId);
  }

  async findCompleted(instituteId: string, limit?: number) {
    return await this.lectureRepository.findCompleted(instituteId, limit);
  }

  async updateStatus(id: string, updateStatusDto: UpdateLectureStatusDto) {
    const lecture = await this.lectureRepository.findOne(id);
    if (!lecture) {
      throw new NotFoundException(INSTITUTE_LECTURE_NOT_FOUND);
    }

    const updatedLecture = await this.lectureRepository.updateStatus(id, updateStatusDto.status);
    
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
    
    return { 
      lecture: updatedLecture, 
      message: INSTITUTE_LECTURE_RESCHEDULED 
    };
  }

  async findByDateRange(startDate: Date, endDate: Date) {
    return await this.lectureRepository.findByDateRange(startDate, endDate);
  }
}
