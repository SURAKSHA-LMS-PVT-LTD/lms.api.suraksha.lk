import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsEnum,
  IsOptional,
  IsArray,
  IsInt,
  Min,
  IsNotEmpty,
  ArrayNotEmpty,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { SmartCardType, SmartCardScope, SmartCardStatus } from '../enums/smart-card.enums';

/** Create a single smart card (system admin). */
export class CreateSmartCardDto {
  @ApiProperty({ example: 'NFC Card 001' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  cardName: string;

  @ApiProperty({ example: 'NFC-000123', description: 'Printed value handed to the user (≤30 chars)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  cardId: string;

  @ApiProperty({ enum: SmartCardType })
  @IsEnum(SmartCardType)
  cardType: SmartCardType;

  @ApiProperty({ enum: SmartCardScope })
  @IsEnum(SmartCardScope)
  scope: SmartCardScope;

  @ApiPropertyOptional({ description: 'Auto-assign to this institute on creation (INSTITUTE scope).' })
  @IsOptional()
  @IsString()
  instituteId?: string;

  @ApiPropertyOptional({ description: 'Auto-assign to this class on creation (requires instituteId).' })
  @IsOptional()
  @IsString()
  classId?: string;
}

/**
 * Bulk-create smart cards (system admin). Supports three input shapes:
 *  - explicit `cardIds` list (["12312","421241","efa","r3"])
 *  - numeric range via `rangePrefix` + `rangeStart`/`rangeEnd` (+ optional zero `pad`)
 *  - CSV pasted into `cardIds` after the frontend splits it
 * All created cards share the same name-prefix, type and scope.
 */
export class BulkCreateSmartCardsDto {
  @ApiProperty({ enum: SmartCardType })
  @IsEnum(SmartCardType)
  cardType: SmartCardType;

  @ApiProperty({ enum: SmartCardScope })
  @IsEnum(SmartCardScope)
  scope: SmartCardScope;

  @ApiPropertyOptional({ example: 'Card', description: 'Prefix for generated card names (e.g. "Card 001").' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  namePrefix?: string;

  @ApiPropertyOptional({ type: [String], example: ['12312', '421241', 'efa', 'r3'] })
  @ValidateIf((o) => !o.rangePrefix && (o.rangeStart === undefined || o.rangeStart === null))
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  cardIds?: string[];

  @ApiPropertyOptional({ example: 'CARD-', description: 'Prefix for a generated numeric range.' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  rangePrefix?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @Min(0)
  rangeStart?: number;

  @ApiPropertyOptional({ example: 1000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  rangeEnd?: number;

  @ApiPropertyOptional({ example: 4, description: 'Zero-pad numbers to this width (CARD-0001).' })
  @IsOptional()
  @IsInt()
  @Min(0)
  pad?: number;

  @ApiPropertyOptional({ description: 'Auto-assign all created cards to this institute.' })
  @IsOptional()
  @IsString()
  instituteId?: string;

  @ApiPropertyOptional({ description: 'Auto-assign all created cards to this class (requires instituteId).' })
  @IsOptional()
  @IsString()
  classId?: string;
}

/** Update mutable fields of a card (system admin). */
export class UpdateSmartCardDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  cardName?: string;

  @ApiPropertyOptional({ enum: SmartCardType })
  @IsOptional()
  @IsEnum(SmartCardType)
  cardType?: SmartCardType;

  @ApiPropertyOptional({ enum: SmartCardStatus, description: 'Use to retire (INACTIVE) or re-activate (AVAILABLE) a card.' })
  @IsOptional()
  @IsEnum(SmartCardStatus)
  status?: SmartCardStatus;
}

/** Assign a batch of cards to an institute (system admin). */
export class AssignCardsToInstituteDto {
  @ApiProperty({ example: '6e09518a-89ac-47e1-8961-326b5fd5fc9c' })
  @IsString()
  @IsNotEmpty()
  instituteId: string;

  @ApiProperty({ type: [String], description: 'Smart card row ids to allocate to the institute.' })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  cardRowIds: string[];
}

/** Assign a batch of an institute's cards to a class (system admin). */
export class AssignCardsToClassDto {
  @ApiProperty({ example: 'class-uuid' })
  @IsString()
  @IsNotEmpty()
  classId: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  cardRowIds: string[];
}

/**
 * Bulk assign institute cards to a class by card-value range (admin shortcut).
 * Finds all cards in the institute whose cardId falls within [cardIdMin, cardIdMax] (string comparison)
 * and assigns them to the given class in one shot.
 */
export class BulkAssignToClassByRangeDto {
  @ApiProperty({ example: 'class-uuid' })
  @IsString()
  @IsNotEmpty()
  classId: string;

  @ApiProperty({ example: 'CARD-2000', description: 'Lower bound cardId (inclusive, string comparison).' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  cardIdMin: string;

  @ApiProperty({ example: 'CARD-2200', description: 'Upper bound cardId (inclusive, string comparison).' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  cardIdMax: string;
}

/** Institute admin: assign one card to a user (manual = cardValue given, auto = scope only). */
export class AssignCardToUserDto {
  @ApiProperty({ example: '123', description: 'Target user id.' })
  @IsString()
  @IsNotEmpty()
  userId: string;

  @ApiProperty({ enum: SmartCardScope })
  @IsEnum(SmartCardScope)
  scope: SmartCardScope;

  @ApiPropertyOptional({
    description: 'When provided → manual mode (validate this value is in the institute pool). Omit → auto-assign next available.',
    example: 'NFC-000123',
  })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  cardValue?: string;

  @ApiPropertyOptional({ description: 'Optional class to scope an auto-assign to that class pool first.' })
  @IsOptional()
  @IsString()
  classId?: string;
}

/** Filter query for listing cards (admin pool browser / institute search). */
export class ListSmartCardsQueryDto {
  @ApiPropertyOptional({ enum: SmartCardScope })
  @IsOptional()
  @IsEnum(SmartCardScope)
  scope?: SmartCardScope;

  @ApiPropertyOptional({ enum: SmartCardType })
  @IsOptional()
  @IsEnum(SmartCardType)
  cardType?: SmartCardType;

  @ApiPropertyOptional({ enum: SmartCardStatus })
  @IsOptional()
  @IsEnum(SmartCardStatus)
  status?: SmartCardStatus;

  @ApiPropertyOptional({ description: 'Free-text match against card name or card id.' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Filter to a specific institute (admin only).' })
  @IsOptional()
  @IsString()
  instituteId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  classId?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({ example: 50 })
  @IsOptional()
  limit?: number;
}
