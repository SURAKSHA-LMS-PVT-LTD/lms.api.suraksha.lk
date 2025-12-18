import { ApiProperty } from '@nestjs/swagger';

export class FileUploadResponseDto {
  @ApiProperty({ 
    description: 'URL of the uploaded file',
    example: 'https://suraksha.lk/files/profile-images/user-123-profile.jpg'
  })
  url: string;

  @ApiProperty({ 
    description: 'Storage key/path of the uploaded file',
    example: 'profile-images/user-123-profile.jpg'
  })
  key: string;

  @ApiProperty({ 
    description: 'Original filename of the uploaded file',
    example: 'user-123-profile.jpg'
  })
  filename?: string;
}
