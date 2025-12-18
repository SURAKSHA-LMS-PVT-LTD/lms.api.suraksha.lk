import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { InstituteClassSubjectExamResponseDto } from './institute-class-subject-exam-response.dto';

export class PaginatedInstituteClassSubjectExamResponseDto {
  @ApiProperty({
    description: 'Array of exam data',
    type: [InstituteClassSubjectExamResponseDto],
  })
  @Type(() => InstituteClassSubjectExamResponseDto)
  data: InstituteClassSubjectExamResponseDto[];

  @ApiProperty({
    description: 'Total number of records',
    example: 100,
  })
  total: number;

  @ApiProperty({
    description: 'Current page number',
    example: 1,
  })
  page: number;

  @ApiProperty({
    description: 'Number of records per page',
    example: 10,
  })
  limit: number;

  @ApiProperty({
    description: 'Total number of pages',
    example: 10,
  })
  totalPages: number;

  @ApiProperty({
    description: 'Has previous page',
    example: false,
  })
  hasPrevious: boolean;

  @ApiProperty({
    description: 'Has next page',
    example: true,
  })
  hasNext: boolean;

  constructor(
    data: InstituteClassSubjectExamResponseDto[],
    total: number,
    page: number,
    limit: number,
  ) {
    this.data = data;
    this.total = total;
    this.page = page;
    this.limit = limit;
    this.totalPages = Math.ceil(total / limit);
    this.hasPrevious = page > 1;
    this.hasNext = page < this.totalPages;
  }
}
