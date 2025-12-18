import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InstituteClassExamRepository } from '../repositories/institute-class-exam.repository';
import { CreateExamDto } from '../dto/create-exam.dto';
import { UpdateExamDto } from '../dto/update-exam.dto';
import { MarkEntryDto, BulkMarkEntryDto } from '../dto/mark-entry.dto';
import { InstituteClassExamEntity } from '../entities/institute-class-exam.entity';
import { ExamStatus, ExamType } from '../enums/exam.enum';
import { 
  CreateExamRequest, 
  ExamResponse,
  ExamResultSummary, 
  StudentResult 
} from '../interfaces/exam.interface';
import { SUCCESS_MESSAGES, ERROR_MESSAGES } from '../constants/exam.constants';

@Injectable()
export class InstituteClassExamService {
  private readonly logger = new Logger(InstituteClassExamService.name);

  constructor(
    private readonly examRepository: InstituteClassExamRepository,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Create a new exam (Google Sheets integration removed)
   */
  async createExam(createExamDto: CreateExamDto, createdBy: string): Promise<ExamResponse> {
    try {

      // Validate input data
      this.validateExamData(createExamDto);

      // Create exam record in database
      const examEntity = await this.examRepository.create({
        ...createExamDto,
      });

      
      return this.mapToExamResponse(examEntity);
    } catch (error) {
      this.logger.error('Failed to create exam', error);
      this.logger.error('Error details:', {
        message: error.message,
        stack: error.stack,
        name: error.name,
        cause: error.cause
      });
      throw new BadRequestException(`${ERROR_MESSAGES.EXAM_CREATION_FAILED}: ${error.message}`);
    }
  }

  /**
   * Enter marks for a student in a specific subject
   */
  async enterMarks(markEntryDto: MarkEntryDto, enteredBy: string): Promise<{ success: boolean; message: string }> {
    try {
      const exam = await this.examRepository.findOne(markEntryDto.examId);
      if (!exam) {
        throw new NotFoundException(ERROR_MESSAGES.EXAM_NOT_FOUND);
      }

      if (exam.status !== ExamStatus.PUBLISHED && exam.status !== ExamStatus.IN_PROGRESS) {
        throw new BadRequestException(ERROR_MESSAGES.EXAM_NOT_ACTIVE);
      }

      // Note: In a real implementation, you would store marks in a separate entity
      // For now, just log the marks entry
      
      return {
        success: true,
        message: SUCCESS_MESSAGES.MARKS_ENTERED_SUCCESSFULLY,
      };
    } catch (error) {
      this.logger.error('Failed to enter marks', error);
      throw error;
    }
  }

  /**
   * Bulk entry of marks for multiple students/subjects
   */
  async bulkEnterMarks(bulkMarkEntryDto: BulkMarkEntryDto, enteredBy: string): Promise<{ 
    success: boolean; 
    message: string; 
    successCount: number; 
    errorCount: number; 
    errors: any[] 
  }> {
    try {
      const exam = await this.examRepository.findOne(bulkMarkEntryDto.examId);
      if (!exam) {
        throw new NotFoundException(ERROR_MESSAGES.EXAM_NOT_FOUND);
      }

      let successCount = 0;
      let errorCount = 0;
      const errors: Array<{
        studentId: string;
        subject: string;
        error: string;
      }> = [];

      for (const markEntry of bulkMarkEntryDto.marks) {
        try {
          await this.enterMarks(markEntry, enteredBy);
          successCount++;
        } catch (error) {
          errorCount++;
          errors.push({
            studentId: markEntry.studentId,
            subject: markEntry.subjectName,
            error: error.message,
          });
        }
      }

      this.logger.log(`Bulk marks entry completed: ${successCount} success, ${errorCount} errors`);
      
      return {
        success: errorCount === 0,
        message: `Bulk marks entry completed: ${successCount} successful, ${errorCount} failed`,
        successCount,
        errorCount,
        errors,
      };
    } catch (error) {
      this.logger.error('Failed to bulk enter marks', error);
      throw error;
    }
  }

  /**
   * Publish exam results (without Excel/Google Sheets integration)
   */
  async publishResults(examId: string, publishedBy: string): Promise<ExamResponse> {
    try {
      const exam = await this.examRepository.findOne(examId);
      if (!exam) {
        throw new NotFoundException(ERROR_MESSAGES.EXAM_NOT_FOUND);
      }

      // Update exam status to published (without Excel/Google Sheets)
      const updatedExam = await this.examRepository.publishResults(examId);
      
      if (!updatedExam) {
        throw new BadRequestException('Failed to publish results');
      }

      
      return this.mapToExamResponse(updatedExam);
    } catch (error) {
      this.logger.error('Failed to publish results', error);
      throw error;
    }
  }

  /**
   * Get exam by ID
   */
  async getExamById(examId: string): Promise<ExamResponse> {
    const exam = await this.examRepository.findOne(examId);
    if (!exam) {
      throw new NotFoundException(ERROR_MESSAGES.EXAM_NOT_FOUND);
    }
    return this.mapToExamResponse(exam);
  }

  /**
   * Get all exams for an institute
   */
  async getExamsByInstitute(instituteId: string): Promise<ExamResponse[]> {
    const exams = await this.examRepository.findByInstituteId(instituteId);
    return exams.map(exam => this.mapToExamResponse(exam));
  }

  /**
   * Get all exams for a class
   */
  async getExamsByClass(classId: string): Promise<ExamResponse[]> {
    const exams = await this.examRepository.findByClassId(classId);
    return exams.map(exam => this.mapToExamResponse(exam));
  }

  /**
   * Update exam
   */
  async updateExam(examId: string, updateExamDto: UpdateExamDto): Promise<ExamResponse> {
    const exam = await this.examRepository.findOne(examId);
    if (!exam) {
      throw new NotFoundException(ERROR_MESSAGES.EXAM_NOT_FOUND);
    }

    const updatedExam = await this.examRepository.update(examId, updateExamDto);
    
    if (!updatedExam) {
      throw new NotFoundException('Failed to update exam');
    }
    
    return this.mapToExamResponse(updatedExam);
  }

  /**
   * Delete exam
   */
  async deleteExam(examId: string): Promise<{ success: boolean; message: string }> {
    const exam = await this.examRepository.findOne(examId);
    if (!exam) {
      throw new NotFoundException(ERROR_MESSAGES.EXAM_NOT_FOUND);
    }

    await this.examRepository.delete(examId);
    
    return {
      success: true,
      message: SUCCESS_MESSAGES.EXAM_DELETED_SUCCESSFULLY,
    };
  }

  // Helper methods
  private validateExamData(createExamDto: CreateExamDto): void {
    if (!createExamDto.title || createExamDto.title.trim().length === 0) {
      throw new BadRequestException('Exam title is required');
    }

    if (!createExamDto.instituteId) {
      throw new BadRequestException('Institute ID is required');
    }

    if (!createExamDto.classId) {
      throw new BadRequestException('Class ID is required');
    }

    if (!createExamDto.examType) {
      throw new BadRequestException('Exam type is required');
    }

    if (!createExamDto.startDate || !createExamDto.endDate) {
      throw new BadRequestException('Start date and end date are required');
    }

    if (createExamDto.startDate >= createExamDto.endDate) {
      throw new BadRequestException('Start date must be before end date');
    }
  }

  private mapToExamResponse(exam: InstituteClassExamEntity): ExamResponse {
    return {
      id: exam.id,
      title: exam.title,
      description: exam.description,
      instituteId: exam.instituteId,
      classId: exam.classId,
      examType: exam.examType,
      status: exam.status,
      startDate: exam.startDate,
      endDate: exam.endDate,
      isResultsPublished: exam.isResultsPublished,
      resultsPublishedDate: exam.resultsPublishedDate,
      totalStudents: exam.totalStudents,
      marksEnteredCount: exam.marksEnteredCount,
      completionPercentage: exam.completionPercentage,
      createdAt: exam.createdAt,
      updatedAt: exam.updatedAt,
    };
  }
}
