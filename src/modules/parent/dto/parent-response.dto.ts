import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserResponseDto } from '../../user/dto/user-response.dto';

export class ParentResponseDto {
  @ApiProperty({ description: 'User ID (same as parent primary key)' })
  userId: string;

  @ApiPropertyOptional({ description: 'Occupation' })
  occupation?: string;

  @ApiPropertyOptional({ description: 'Workplace' })
  workplace?: string;

  @ApiPropertyOptional({ description: 'Work phone number' })
  workPhone?: string;

  @ApiPropertyOptional({ description: 'Monthly income' })
  monthlyIncome?: number;

  @ApiPropertyOptional({ description: 'Education level' })
  educationLevel?: string;

  @ApiPropertyOptional({ description: 'Emergency contact name' })
  emergencyContactName?: string;

  @ApiPropertyOptional({ description: 'Emergency contact phone' })
  emergencyContactPhone?: string;

  @ApiPropertyOptional({ description: 'Relationship to emergency contact' })
  relationshipToEmergencyContact?: string;

  @ApiProperty({ description: 'Active status' })
  isActive: boolean;

  @ApiProperty({ description: 'Creation timestamp' })
  createdAt: Date;

  @ApiProperty({ description: 'Last update timestamp' })
  updatedAt: Date;

  @ApiProperty({ description: 'User information', type: UserResponseDto })
  user: UserResponseDto;

  constructor(partial: Partial<ParentResponseDto>) {
    Object.assign(this, partial);
  }
}
