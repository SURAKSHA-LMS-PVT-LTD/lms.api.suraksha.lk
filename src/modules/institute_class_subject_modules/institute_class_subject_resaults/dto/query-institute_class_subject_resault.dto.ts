import { IsBigIntId, IsOptionalBigIntId } from '../../../../common/validators/bigint-id.validator';
import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsBoolean, IsEnum } from 'class-validator';
import { PaginationDto } from '../../../../common/dto/pagination.dto';
import { Grade } from '../enums/grade.enum';

export class QueryInstituteClassSubjectResaultDto extends PaginationDto {
  @ApiProperty({ description: 'Filter by institute ID', example: '1', required: false })
  @IsOptionalBigIntId()
  instituteId?: string;

  @ApiProperty({ description: 'Filter by class ID', example: '1', required: false })
  @IsOptionalBigIntId()
  classId?: string;

  @ApiProperty({ description: 'Filter by subject ID', example: '1', required: false })
  @IsOptionalBigIntId()
  subjectId?: string;

  @ApiProperty({ description: 'Filter by student ID', example: '1', required: false })
  @IsOptionalBigIntId()
  studentId?: string;

  @ApiProperty({ description: 'Filter by exam ID', example: '1', required: false })
  @IsOptionalBigIntId()
  examId?: string;

  @ApiProperty({ description: 'Filter by minimum score', example: '70.00', required: false })
  @IsOptional()
  @IsString()
  minScore?: string;

  @ApiProperty({ description: 'Filter by maximum score', example: '100.00', required: false })
  @IsOptional()
  @IsString()
  maxScore?: string;

  @ApiProperty({ description: 'Filter by grade', example: 'A', required: false })
  @IsOptional()
  @IsEnum(Grade)
  grade?: Grade;

  @ApiProperty({ description: 'Filter by active status', example: true, required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({ description: 'Search in remarks', example: 'excellent', required: false })
  @IsOptional()
  @IsString()
  remarksSearch?: string;

  @ApiProperty({ description: 'User ID (for parent access validation)', example: '1', required: false })
  @IsOptionalBigIntId()
  userId?: string;
}
