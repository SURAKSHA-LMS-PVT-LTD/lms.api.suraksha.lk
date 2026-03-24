import { IsNotEmpty, IsOptional, IsString, MaxLength, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CardDeliveryRecipient } from '../enums/card-delivery-recipient.enum';

export class CreateOrderDto {
  @ApiProperty({ description: 'Card ID to order', example: '1' })
  @IsNotEmpty()
  @IsString()
  cardId: string;

  @ApiPropertyOptional({ description: 'Delivery address (auto-populated from parent if deliveryRecipientType is set)' })
  @IsOptional()
  @IsString()
  deliveryAddress?: string;

  @ApiPropertyOptional({ description: 'Contact phone number (auto-populated from parent if deliveryRecipientType is set)', example: '+94771234567' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  contactPhone?: string;

  @ApiPropertyOptional({ description: 'Additional notes' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ 
    description: 'Delivery recipient type — overrides student\'s default. Auto-populates address & phone from the selected parent.',
    enum: CardDeliveryRecipient,
    example: 'FATHER'
  })
  @IsOptional()
  @IsEnum(CardDeliveryRecipient)
  deliveryRecipientType?: CardDeliveryRecipient;
}
