import { IsString, IsNotEmpty, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AttendanceStatus, MarkingMethod } from './attendance.dto';

export class MarkAttendanceByInstituteCardDto {
  @ApiProperty({ 
    description: 'Institute Card ID (from institute_user table)', 
    example: 'CARD001' 
  })
  @IsNotEmpty()
  @IsString()
  instituteCardId: string;

  @ApiProperty({ 
    description: 'Institute ID', 
    example: '1' 
  })
  @IsNotEmpty()
  @IsString()
  instituteId: string;

  @ApiProperty({ 
    description: 'Institute name', 
    example: 'Suraksha Learning Academy' 
  })
  @IsNotEmpty()
  @IsString()
  instituteName: string;

  @ApiPropertyOptional({ 
    description: 'Class ID (optional)', 
    example: 'CLASS001' 
  })
  @IsOptional()
  @IsString()
  classId?: string;

  @ApiPropertyOptional({ 
    description: 'Class name (optional)', 
    example: 'Grade 10A' 
  })
  @IsOptional()
  @IsString()
  className?: string;

  @ApiPropertyOptional({ 
    description: 'Subject ID (optional)', 
    example: 'SUBJ001' 
  })
  @IsOptional()
  @IsString()
  subjectId?: string;

  @ApiPropertyOptional({ 
    description: 'Subject name (optional)', 
    example: 'Mathematics' 
  })
  @IsOptional()
  @IsString()
  subjectName?: string;

  @ApiProperty({ 
    description: 'Address/Location string', 
    example: 'Suraksha Learning Academy - Grade 10A - Mathematics' 
  })
  @IsNotEmpty()
  @IsString()
  address: string;

  @ApiProperty({ 
    description: 'Marking method', 
    enum: MarkingMethod, 
    example: MarkingMethod.RFID_NFC 
  })
  @IsEnum(MarkingMethod)
  markingMethod: MarkingMethod;

  @ApiProperty({ 
    description: 'Attendance status', 
    enum: AttendanceStatus, 
    example: AttendanceStatus.PRESENT 
  })
  @IsEnum(AttendanceStatus)
  status: AttendanceStatus;

  @ApiPropertyOptional({ 
    description: 'Location/Address (auto-generated if not provided)' 
  })
  @IsOptional()
  @IsString()
  location?: string;
}

export class GetInstituteUserByCardDto {
  @ApiProperty({ 
    description: 'Institute Card ID', 
    example: 'CARD001' 
  })
  @IsNotEmpty()
  @IsString()
  instituteCardId: string;

  @ApiProperty({ 
    description: 'Institute ID', 
    example: '1' 
  })
  @IsNotEmpty()
  @IsString()
  instituteId: string;
}

export class InstituteCardUserResponseDto {
  @ApiProperty({ description: 'User ID' })
  userId: string;

  @ApiProperty({ description: 'User name (full name)' })
  userName: string;

  @ApiPropertyOptional({ description: 'Name with initials (e.g. A.B. Perera)' })
  nameWithInitials?: string;

  @ApiProperty({ description: 'Institute user ID assigned by institute' })
  userIdByInstitute: string;

  @ApiProperty({ description: 'Institute card ID' })
  instituteCardId: string;

  @ApiProperty({ description: 'Final image URL (institute or global)' })
  imageUrl: string | null;

  @ApiProperty({ description: 'Image verification status' })
  imageVerificationStatus: string;

  @ApiProperty({ description: 'Is institute-specific image' })
  isInstituteImage: boolean;

  @ApiProperty({ description: 'User type' })
  userType: string;

  @ApiProperty({ description: 'Institute user status' })
  status: string;
}
