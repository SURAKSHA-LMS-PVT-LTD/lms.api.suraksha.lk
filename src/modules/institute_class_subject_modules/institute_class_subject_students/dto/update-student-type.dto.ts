import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';

export enum StudentType {
  NORMAL = 'normal',
  PAID = 'paid',
  FREE_CARD = 'free_card',
  HALF_PAID = 'half_paid',
  QUARTER_PAID = 'quarter_paid',
}

export class UpdateStudentTypeDto {
  @ApiProperty({ enum: StudentType, description: 'New student payment type' })
  @IsEnum(StudentType)
  studentType: StudentType;
}
