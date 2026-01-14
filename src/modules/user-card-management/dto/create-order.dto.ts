import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateOrderDto {
  @ApiProperty({ description: 'Card ID to order', example: '1' })
  @IsNotEmpty()
  @IsString()
  cardId: string;

  @ApiProperty({ description: 'Delivery address' })
  @IsNotEmpty()
  @IsString()
  deliveryAddress: string;

  @ApiProperty({ description: 'Contact phone number', example: '+94771234567' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(20)
  contactPhone: string;

  @ApiPropertyOptional({ description: 'Additional notes' })
  @IsOptional()
  @IsString()
  notes?: string;
}
