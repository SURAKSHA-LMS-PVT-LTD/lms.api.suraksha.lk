import { ApiProperty } from '@nestjs/swagger';
import { UserFcmTokenResponseDto } from './user-fcm-token-response.dto';

export class PaginatedUserFcmTokenResponseDto {
  @ApiProperty({ type: [UserFcmTokenResponseDto], description: 'Array of FCM tokens' })
  data: UserFcmTokenResponseDto[];

  @ApiProperty({ description: 'Total number of FCM tokens' })
  total: number;

  @ApiProperty({ description: 'Current page number' })
  page: number;

  @ApiProperty({ description: 'Number of items per page' })
  limit: number;

  @ApiProperty({ description: 'Total number of pages' })
  totalPages: number;

  @ApiProperty({ description: 'Whether there is a next page' })
  hasNext: boolean;

  @ApiProperty({ description: 'Whether there is a previous page' })
  hasPrev: boolean;
}
