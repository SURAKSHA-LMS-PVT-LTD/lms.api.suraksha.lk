import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CardType } from '../../enums/card-type.enum';

export class CardResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  cardName: string;

  @ApiProperty({ enum: CardType })
  cardType: CardType;

  @ApiPropertyOptional()
  cardImageUrl?: string;

  @ApiPropertyOptional()
  cardVideoUrl?: string;

  @ApiPropertyOptional()
  description?: string;

  @ApiProperty()
  price: number;

  @ApiProperty()
  quantityAvailable: number;

  @ApiProperty()
  validityDays: number;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class PaginatedCardsResponseDto {
  @ApiProperty({ type: [CardResponseDto] })
  data: CardResponseDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;

  @ApiProperty()
  totalPages: number;
}
