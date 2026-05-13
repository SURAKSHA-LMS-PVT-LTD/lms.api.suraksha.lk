import { ApiProperty } from '@nestjs/swagger';
import { IsUrl, MaxLength } from 'class-validator';

export class SubmitHomeworkDto {
  @ApiProperty({ description: 'Publicly accessible URL of the submitted file', maxLength: 2048 })
  @IsUrl({ require_tld: true, require_protocol: true })
  @MaxLength(2048)
  fileUrl: string;
}

export class UploadCorrectionFileDto {
  @ApiProperty({ description: 'Publicly accessible URL of the correction file', maxLength: 2048 })
  @IsUrl({ require_tld: true, require_protocol: true })
  @MaxLength(2048)
  correctionFileUrl: string;
}
