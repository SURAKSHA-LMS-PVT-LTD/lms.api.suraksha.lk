import { ApiProperty } from '@nestjs/swagger';
import { PaginatedResponseDto } from '../../../common/dto/paginated-response.dto';
import { ParentResponseDto } from './parent-response.dto';

export class PaginatedParentResponseDto extends PaginatedResponseDto<ParentResponseDto> {
//   @ApiProperty({
//     description: 'Array of parents',
//     type: [ParentResponseDto],
//   })
//   data: ParentResponseDto[];

  constructor(parents: ParentResponseDto[], page: number, limit: number, total: number) {
    super(parents, page, limit, total);
  }
}
