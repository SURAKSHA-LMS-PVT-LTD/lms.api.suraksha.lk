import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CardType } from '../../enums/card-type.enum';
import { CardStatus } from '../../enums/card-status.enum';
import { OrderStatus } from '../../enums/order-status.enum';

export class OrderResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  userId: string;

  @ApiProperty()
  cardId: string;

  @ApiProperty({ enum: CardType })
  cardType: CardType;

  @ApiPropertyOptional()
  paymentId?: string;

  @ApiProperty()
  cardExpiryDate: Date;

  @ApiProperty({ enum: CardStatus })
  status: CardStatus;

  @ApiProperty({ enum: OrderStatus })
  orderStatus: OrderStatus;

  @ApiPropertyOptional()
  rejectedReason?: string;

  @ApiProperty()
  orderDate: Date;

  @ApiProperty()
  deliveryAddress: string;

  @ApiProperty()
  contactPhone: string;

  @ApiPropertyOptional()
  notes?: string;

  @ApiPropertyOptional()
  trackingNumber?: string;

  @ApiPropertyOptional()
  rfidNumber?: string;

  @ApiPropertyOptional()
  deliveredAt?: Date;

  @ApiPropertyOptional()
  activatedAt?: Date;

  @ApiPropertyOptional()
  deactivatedAt?: Date;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  // Populated relations
  @ApiPropertyOptional()
  card?: any;

  @ApiPropertyOptional()
  user?: any;

  @ApiPropertyOptional({ type: 'array' })
  payments?: any[];
}

export class PaginatedOrdersResponseDto {
  @ApiProperty({ type: [OrderResponseDto] })
  data: OrderResponseDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;

  @ApiProperty()
  totalPages: number;
}
