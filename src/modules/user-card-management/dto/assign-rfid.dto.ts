import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AssignRfidDto {
  @ApiProperty({ description: 'RFID number to assign', example: 'RFID123456' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(50)
  rfidNumber: string;
}
