import { Controller, Delete, Get, Put, Post, Param, Query, Body, HttpException, HttpStatus, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { StructuredLecturesService } from './structured-lectures.service';
import { CreateLectureDto, UpdateLectureDto, LectureQueryDto } from './dto/lecture.dto';
import { UserType } from '../user/enums/user-type.enum';
import { JwtRequest } from '../../common/interfaces/jwt-request.interface';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { FlexibleAccessGuard } from '../../auth/guards/flexible-access.guard';
import { RequireAnyOfRoles } from '../../auth/decorators/flexible-access.decorator';

/**
 * Short-path alias: /lectures → maps to the same structured-lectures service.
 * Exists so the frontend can call DELETE /lectures/:id, GET /lectures/:id, etc.
 */
@ApiTags('Structured Lectures')
@Controller('lectures')
export class LecturesShortpathController {
  constructor(private readonly lecturesService: StructuredLecturesService) {}

  @Delete(':id')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: true,
  })
  @ApiOperation({ summary: 'Delete a lecture (soft delete) — /lectures alias' })
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

  @Delete(':id/permanent')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @ApiOperation({ summary: 'Permanently delete a lecture — /lectures alias' })
  async permanentlyDeleteLecture(@Param('id') id: string) {
    try {
      return await this.lecturesService.permanentlyDeleteLecture(id);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        { success: false, message: error.message || 'Failed to permanently delete lecture' },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
