import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, IsUrl, Min, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CardType } from '../enums/card-type.enum';

export class CreateCardDto {
  @ApiProperty({ description: 'Card name', example: 'Standard NFC Card' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  cardName: string;

  @ApiProperty({ description: 'Card type', enum: CardType })
  @IsEnum(CardType)
  cardType: CardType;

  @ApiPropertyOptional({ description: 'Card image URL' })
  @IsOptional()
  @IsUrl()
  cardImageUrl?: string;

  @ApiPropertyOptional({ description: 'Card video URL' })
  @IsOptional()
  @IsUrl()
  cardVideoUrl?: string;

  @ApiPropertyOptional({ description: 'Card description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ description: 'Card price', example: 500.00 })
  @IsNumber()
  @Min(0)
  price: number;

  @ApiProperty({ description: 'Quantity available', example: 100 })
  @IsNumber()
  @Min(0)
  quantityAvailable: number;

  @ApiProperty({ description: 'Validity days', example: 730 })
  @IsNumber()
  @Min(1)
  validityDays: number;
}
