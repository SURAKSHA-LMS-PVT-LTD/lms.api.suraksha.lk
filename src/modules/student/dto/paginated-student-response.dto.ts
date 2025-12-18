// src/students/dto/paginated-student-response.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { PaginatedResponseDto } from '../../../common/dto/paginated-response.dto';
import { StudentResponseDto } from './student-response.dto';

export class PaginatedStudentResponseDto extends PaginatedResponseDto<StudentResponseDto> {
//   @ApiProperty({
//     description: 'Array of students',
//     type: [StudentResponseDto],
//   })
//   data: StudentResponseDto[];

  constructor(students: StudentResponseDto[], page: number, limit: number, total: number) {
    super(students, page, limit, total);
  }
}
