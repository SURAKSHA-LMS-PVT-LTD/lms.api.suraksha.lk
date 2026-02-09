import { ParseBigIntPipe } from '../../../common/pipes/parse-bigint.pipe';
import { Controller, Post, Get, Put, Delete, Body, Param, Query, UseGuards, Logger, HttpStatus, HttpException, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiCookieAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { FlexibleAccessGuard } from '../../../auth/guards/flexible-access.guard';
import { RequireAnyOfRoles } from '../../../auth/decorators/flexible-access.decorator';
import { UserType } from '../../../modules/user/enums/user-type.enum';
import { InstituteClassExamService } from '../services/institute-class-exam.service';
import { CreateExamDto } from '../dto/create-exam.dto';
import { UpdateExamDto, PublishResultsDto } from '../dto/update-exam.dto';
import { MarkEntryDto, BulkMarkEntryDto } from '../dto/mark-entry.dto';
import { ExamType, ExamStatus } from '../enums/exam.enum';

@ApiTags('Institute Class Exams')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard)
@Controller('institute-class-exams')
export class InstituteClassExamController {
  private readonly logger = new Logger(InstituteClassExamController.name);

  constructor(
    private readonly examService: InstituteClassExamService,
  ) {}

  /**
   * Create a new exam
   * POST /institute-class-exams
   */
  @Post()
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: { requireClass: true }
  })
  async createExam(
    @Body() createExamDto: CreateExamDto,
    @Request() req: any,
  ) {
    try {
      const createdBy = req.user?.s || req.user?.userId || 'unknown';
      
      const result = await this.examService.createExam(createExamDto, createdBy);
      
      return {
        success: true,
        message: 'Exam created successfully',
        data: result,
      };
    } catch (error) {
      this.logger.error('Failed to create exam', error.stack);
      throw new HttpException(
        {
          success: false,
          message: error instanceof HttpException ? error.message : 'Failed to create exam',
        },
        error instanceof HttpException ? error.getStatus() : HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * Get exam by ID
   * GET /institute-class-exams/:id
   */
  @Get(':id')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    anyInstituteRole: true
  })
  async getExamById(@Param('id', ParseBigIntPipe) examId: string) {
    try {
      const exam = await this.examService.getExamById(examId);
      
      return {
        success: true,
        message: 'Exam retrieved successfully',
        data: exam,
      };
    } catch (error) {
      this.logger.error(`Failed to get exam: ${examId}`, error.stack);
      throw new HttpException(
        {
          success: false,
          message: error instanceof HttpException ? error.message : 'Failed to retrieve exam',
        },
        error instanceof HttpException ? error.getStatus() : HttpStatus.NOT_FOUND,
      );
    }
  }

  /**
   * Get all exams for an institute
   * GET /institute-class-exams/institute/:instituteId
   */
  @Get('institute/:instituteId')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    anyInstituteRole: true
  })
  async getExamsByInstitute(@Param('instituteId', ParseBigIntPipe) instituteId: string) {
    try {
      const exams = await this.examService.getExamsByInstitute(instituteId);
      
      return {
        success: true,
        message: 'Institute exams retrieved successfully',
        data: exams,
        count: exams.length,
      };
    } catch (error) {
      this.logger.error(`Failed to get institute exams: ${instituteId}`, error.stack);
      throw new HttpException(
        {
          success: false,
          message: error instanceof HttpException ? error.message : 'Failed to retrieve institute exams',
        },
        error instanceof HttpException ? error.getStatus() : HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * Get all exams for a class
   * GET /institute-class-exams/class/:classId
   */
  @Get('class/:classId')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    anyInstituteRole: true
  })
  async getExamsByClass(@Param('classId', ParseBigIntPipe) classId: string) {
    try {
      const exams = await this.examService.getExamsByClass(classId);
      
      return {
        success: true,
        message: 'Class exams retrieved successfully',
        data: exams,
        count: exams.length,
      };
    } catch (error) {
      this.logger.error(`Failed to get class exams: ${classId}`, error.stack);
      throw new HttpException(
        {
          success: false,
          message: error instanceof HttpException ? error.message : 'Failed to retrieve class exams',
        },
        error instanceof HttpException ? error.getStatus() : HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * Update exam
   * PUT /institute-class-exams/:id
   */
  @Put(':id')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: { requireClass: true }
  })
  async updateExam(
    @Param('id', ParseBigIntPipe) examId: string,
    @Body() updateExamDto: UpdateExamDto,
  ) {
    try {
      const updatedExam = await this.examService.updateExam(examId, updateExamDto);
      
      return {
        success: true,
        message: 'Exam updated successfully',
        data: updatedExam,
      };
    } catch (error) {
      this.logger.error(`Failed to update exam: ${examId}`, error.stack);
      throw new HttpException(
        {
          success: false,
          message: error instanceof HttpException ? error.message : 'Failed to update exam',
        },
        error instanceof HttpException ? error.getStatus() : HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * Enter marks for a student
   * POST /institute-class-exams/:id/marks
   */
  @Post(':id/marks')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: { requireClass: true }
  })
  async enterMarks(
    @Param('id', ParseBigIntPipe) examId: string,
    @Body() markEntryDto: MarkEntryDto,
    @Request() req: any,
  ) {
    try {
      // Set the examId from the URL parameter
      markEntryDto.examId = examId;
      
      const enteredBy = req.user?.s || req.user?.userId || 'unknown';
      
      const result = await this.examService.enterMarks(markEntryDto, enteredBy);
      
      return {
        success: true,
        message: 'Marks entered successfully',
        data: result,
      };
    } catch (error) {
      this.logger.error(`Failed to enter marks for exam: ${examId}`, error.stack);
      throw new HttpException(
        {
          success: false,
          message: error instanceof HttpException ? error.message : 'Failed to enter marks',
        },
        error instanceof HttpException ? error.getStatus() : HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * Bulk entry of marks
   * POST /institute-class-exams/:id/marks/bulk
   */
  @Post(':id/marks/bulk')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: { requireClass: true }
  })
  async bulkEnterMarks(
    @Param('id', ParseBigIntPipe) examId: string,
    @Body() bulkMarkEntryDto: BulkMarkEntryDto,
    @Request() req: any,
  ) {
    try {
      // Set the examId from the URL parameter
      bulkMarkEntryDto.examId = examId;
      
      const enteredBy = req.user?.s || req.user?.userId || 'unknown';
      
      const result = await this.examService.bulkEnterMarks(bulkMarkEntryDto, enteredBy);
      
      return {
        success: result.success,
        message: result.message,
        data: {
          successCount: result.successCount,
          errorCount: result.errorCount,
          errors: result.errors,
        },
      };
    } catch (error) {
      this.logger.error(`Failed to bulk enter marks for exam: ${examId}`, error.stack);
      throw new HttpException(
        {
          success: false,
          message: error instanceof HttpException ? error.message : 'Failed to bulk enter marks',
        },
        error instanceof HttpException ? error.getStatus() : HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * Publish exam results (without Excel/Google Sheets integration)
   * POST /institute-class-exams/:id/publish-results
   */
  @Post(':id/publish-results')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true
  })
  async publishResults(
    @Param('id', ParseBigIntPipe) examId: string,
    @Body() publishResultsDto: PublishResultsDto,
    @Request() req: any,
  ) {
    try {
      const publishedBy = req.user?.s || req.user?.userId || 'unknown';
      
      const result = await this.examService.publishResults(examId, publishedBy);
      
      return {
        success: true,
        message: 'Results published successfully',
        data: result,
      };
    } catch (error) {
      this.logger.error(`Failed to publish results for exam: ${examId}`, error.stack);
      throw new HttpException(
        {
          success: false,
          message: error instanceof HttpException ? error.message : 'Failed to publish results',
        },
        error instanceof HttpException ? error.getStatus() : HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * Delete exam
   * DELETE /institute-class-exams/:id
   */
  @Delete(':id')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN]
  })
  async deleteExam(@Param('id', ParseBigIntPipe) examId: string) {
    try {
      const result = await this.examService.deleteExam(examId);
      
      return {
        success: true,
        message: result.message,
        data: { examId },
      };
    } catch (error) {
      this.logger.error(`Failed to delete exam: ${examId}`, error.stack);
      throw new HttpException(
        {
          success: false,
          message: error instanceof HttpException ? error.message : 'Failed to delete exam',
        },
        error instanceof HttpException ? error.getStatus() : HttpStatus.BAD_REQUEST,
      );
    }
  }
}
