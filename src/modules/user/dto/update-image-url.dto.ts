import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsUrl, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class UpdateImageUrlDto {
  @ApiProperty({
    description: 'User ID to update image for',
    example: '12345'
  })
  @IsString({ message: 'User ID must be a string' })
  @IsNotEmpty({ message: 'User ID is required' })
  @Transform(({ value }) => value?.toString().trim())
  userId: string;

  @ApiProperty({
    description: 'Relative path from /upload/verify-and-publish endpoint (stored in database as-is)',
    example: 'profile-images/user-12345-uuid.jpg',
    maxLength: 500
  })
  @IsString({ message: 'Image URL must be a string' })
  @IsNotEmpty({ message: 'Image URL is required' })
  @MaxLength(500, { message: 'Image URL cannot exceed 500 characters' })
  @Transform(({ value }) => value?.trim())
  imageUrl: string;
}
