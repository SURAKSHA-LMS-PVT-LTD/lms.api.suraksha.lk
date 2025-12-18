// src/modules/institute/dto/paginated-institute-response.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { InstituteResponseDto } from './institute-response.dto';

export class PaginationMetaDto {
  @ApiProperty({ description: 'Current page number', example: 1 })
  page: number;

  @ApiProperty({ description: 'Items per page', example: 10 })
  limit: number;

  @ApiProperty({ description: 'Total number of items', example: 25 })
  total: number;

  @ApiProperty({ description: 'Total number of pages', example: 3 })
  totalPages: number;

  @ApiProperty({ description: 'Has next page', example: true })
  hasNext: boolean;

  @ApiProperty({ description: 'Has previous page', example: false })
  hasPrev: boolean;
}

export class PaginatedInstituteResponseDto {
  @ApiProperty({
    description: 'Array of institutes',
    type: [InstituteResponseDto]
  })
  data: InstituteResponseDto[];

  @ApiProperty({
    description: 'Pagination metadata',
    type: PaginationMetaDto
  })
  meta: PaginationMetaDto;

  constructor(
    data: InstituteResponseDto[],
    total: number,
    page: number,
    limit: number
  ) {
    this.data = data;
    this.meta = {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasNext: page * limit < total,
      hasPrev: page > 1
    };
  }
}
