import { ApiProperty } from '@nestjs/swagger';
import { IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CreateInstituteClassSubjectResaultDto } from './create-institute_class_subject_resault.dto';

export class CreateBulkInstituteClassSubjectResaultDto {
  @ApiProperty({ 
    description: 'Array of result data to create',
    type: [CreateInstituteClassSubjectResaultDto],
    isArray: true 
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateInstituteClassSubjectResaultDto)
  results: CreateInstituteClassSubjectResaultDto[];
}
