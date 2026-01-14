import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OrderStatus } from '../enums/order-status.enum';

export class UpdateOrderStatusDto {
  @ApiProperty({ description: 'New order status', enum: OrderStatus })
  @IsEnum(OrderStatus)
  orderStatus: OrderStatus;

  @ApiPropertyOptional({ description: 'Tracking number' })
  @IsOptional()
  @IsString()
  trackingNumber?: string;

  @ApiPropertyOptional({ description: 'Rejection reason (if status is REJECTED)' })
  @IsOptional()
  @IsString()
  rejectedReason?: string;

  @ApiPropertyOptional({ description: 'Additional notes' })
  @IsOptional()
  @IsString()
  notes?: string;
}
