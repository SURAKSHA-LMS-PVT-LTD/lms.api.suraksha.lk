import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { 
  IsString, 
  IsOptional, 
  IsEnum, 
  MinLength, 
  IsNumber, 
  IsNotEmpty,
  Matches
} from 'class-validator';
import { Gender } from '../enums/gender.enum';
import { CardStatus } from '../../user-card-management/enums/card-status.enum';

export class CompleteFirstLoginDto {
  @ApiProperty({ description: 'New password', minLength: 8 })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  @IsNotEmpty()
  password: string;

  @ApiPropertyOptional({ description: 'First name (if not provided earlier)' })
  @IsString()
  @IsOptional()
  firstName?: string;

  @ApiPropertyOptional({ description: 'Last name (if not provided earlier)' })
  @IsString()
  @IsOptional()
  lastName?: string;

  @ApiPropertyOptional({ description: 'Date of birth (YYYY-MM-DD)', example: '2000-01-01' })
  @IsString()
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Date of birth must be in YYYY-MM-DD format' })
  dateOfBirth?: string;

  @ApiPropertyOptional({ description: 'Gender', enum: Gender })
  @IsEnum(Gender)
  @IsOptional()
  gender?: string;
}

export class QuickGenerateProfileImageUrlDto {
  @ApiProperty({ description: 'File name', example: 'profile.jpg' })
  @IsString()
  @IsNotEmpty()
  fileName: string;

  @ApiProperty({ description: 'Content type', example: 'image/jpeg' })
  @IsString()
  @IsNotEmpty()
  contentType: string;

  @ApiPropertyOptional({ description: 'File size in bytes', example: 1048576 })
  @IsNumber()
  @IsOptional()
  fileSize?: number;
}

export class AssignNormalCardDto {
  @ApiProperty({ description: 'Card ID', example: 'CARD-2025-0001' })
  @IsString()
  @IsNotEmpty()
  cardId: string;

  @ApiPropertyOptional({ description: 'Optional expiry date (ISO format)', example: '2026-12-31' })
  @IsString()
  @IsOptional()
  cardExpiryDate?: string;
}

export enum CardTypeEnum {
  NORMAL = 'normal',
  RFID = 'rfid'
}

export class UpdateUserCardStatusDto {
  @ApiProperty({ description: 'Type of card', enum: CardTypeEnum })
  @IsEnum(CardTypeEnum)
  @IsNotEmpty()
  cardType: CardTypeEnum;

  @ApiProperty({ description: 'New status for the card', enum: CardStatus })
  @IsEnum(CardStatus)
  @IsNotEmpty()
  status: CardStatus;
}
