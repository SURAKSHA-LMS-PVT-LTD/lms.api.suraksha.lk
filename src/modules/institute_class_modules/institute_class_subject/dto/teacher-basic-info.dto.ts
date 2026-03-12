import { ApiProperty } from '@nestjs/swagger';

export class TeacherBasicInfoDto {
  @ApiProperty({ description: 'Teacher first name' })
  firstName: string;

  @ApiProperty({ description: 'Teacher last name', required: false })
  lastName?: string;

  @ApiProperty({ description: 'Name with initials (e.g. A.B. Perera)', required: false })
  nameWithInitials?: string;

  @ApiProperty({ description: 'Teacher email', required: false })
  email?: string;

  @ApiProperty({ description: 'Teacher phone number', required: false })
  phone?: string;

  @ApiProperty({ description: 'Teacher profile image URL', required: false })
  imageUrl?: string;

  @ApiProperty({ description: 'Teacher qualification', required: false })
  qualification?: string;

  @ApiProperty({ description: 'Teacher department', required: false })
  department?: string;

  @ApiProperty({ description: 'Years of experience', required: false })
  experience?: number;

  @ApiProperty({ description: 'Subjects specialization', type: [String], required: false })
  specialization?: string[];
}
