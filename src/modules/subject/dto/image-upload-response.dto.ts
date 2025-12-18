import { ApiProperty } from '@nestjs/swagger';

export class ImageUploadResponseDto {
  @ApiProperty({ 
    description: 'Upload status',
    example: 'success'
  })
  status: string;

  @ApiProperty({ 
    description: 'Success message',
    example: 'Image uploaded successfully'
  })
  message: string;

  @ApiProperty({ 
    description: 'Image URL in Google Cloud Storage',
    example: 'https://storage.googleapis.com/laas-file-storage/subject-images/subject-123-1609459200000.jpg'
  })
  imageUrl: string;

  @ApiProperty({ 
    description: 'File key in storage',
    example: 'subject-images/subject-123-1609459200000.jpg'
  })
  fileKey: string;

  @ApiProperty({ 
    description: 'File size in bytes',
    example: 524288
  })
  fileSize: number;

  @ApiProperty({ 
    description: 'File type',
    example: 'image/jpeg'
  })
  fileType: string;

  constructor(partial: Partial<ImageUploadResponseDto>) {
    Object.assign(this, partial);
  }
}
