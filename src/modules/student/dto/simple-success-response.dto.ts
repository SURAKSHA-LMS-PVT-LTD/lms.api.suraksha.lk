import { ApiProperty } from '@nestjs/swagger';
import { now } from '../../../common/utils/timezone.util';

export class SimpleSuccessResponseDto {
  @ApiProperty({
    description: 'Success status',
    example: true
  })
  success: boolean;

  @ApiProperty({
    description: 'Success message',
    example: 'Parent assigned successfully'
  })
  message: string;

  @ApiProperty({
    description: 'Timestamp of the operation',
    example: '2025-08-30T17:30:00Z'
  })
  timestamp: Date;

  constructor(message: string) {
    this.success = true;
    this.message = message;
    this.timestamp = now();
  }
}
