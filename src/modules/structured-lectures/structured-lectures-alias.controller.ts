import { Controller, Post, Delete, Param, Body, HttpException, HttpStatus, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { StructuredLecturesService } from './structured-lectures.service';
import { CreateLectureDto, LectureResponseDto } from './dto/lecture.dto';
import { UserType } from '../user/enums/user-type.enum';
import { JwtRequest } from '../../common/interfaces/jwt-request.interface';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { FlexibleAccessGuard } from '../../auth/guards/flexible-access.guard';
import { RequireAnyOfRoles } from '../../auth/decorators/flexible-access.decorator';

/**
 * Alias controller that serves the same endpoints at /structured-lectures
 * (without the /api prefix) for frontend compatibility.
 * Also provides /lectures alias for delete operations.
 */
@ApiTags('Structured Lectures')
@Controller('structured-lectures')
export class StructuredLecturesAliasController {
  constructor(private readonly lecturesService: StructuredLecturesService) {}

  @Post()
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: true,
  })
  @ApiOperation({ summary: 'Create a new lecture (alias path without /api prefix)' })
  @ApiResponse({ status: 201, description: 'Lecture created successfully', type: LectureResponseDto })
  @ApiResponse({ status: 400, description: 'Bad request - validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async createLecture(
    @Body() createLectureDto: CreateLectureDto,
    @Req() request: JwtRequest,
  ): Promise<{ success: boolean; message: string; data: LectureResponseDto }> {
    try {
      const userId = request.user.s;
      const result = await this.lecturesService.createLectureAsDto(createLectureDto, userId);
      return {
        success: true,
        message: 'Structured lecture created successfully',
        data: result,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        { success: false, message: error.message || 'Failed to create lecture' },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: true,
  })
  @ApiOperation({ summary: 'Delete a lecture (soft delete)' })
  async deleteLecture(
    @Param('id') id: string,
    @Req() request: JwtRequest,
  ) {
    try {
      const userId = request.user.s;
      return await this.lecturesService.deleteLecture(id, userId);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        { success: false, message: error.message || 'Failed to delete lecture' },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
