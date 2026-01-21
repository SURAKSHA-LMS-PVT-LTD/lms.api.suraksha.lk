import { ApiProperty } from '@nestjs/swagger';

export class GoogleTokenResponseDto {
  @ApiProperty({
    description: 'Google access token (valid for 1 hour)',
    example: 'ya29.a0AfH6SMBx...',
  })
  access_token: string;

  @ApiProperty({
    description: 'Token expiration time in seconds',
    example: 3599,
  })
  expires_in: number;

  @ApiProperty({
    description: 'Token type (always Bearer)',
    example: 'Bearer',
  })
  token_type: string;

  @ApiProperty({
    description: 'Granted scopes',
    example: 'https://www.googleapis.com/auth/drive.file openid email profile',
    required: false,
  })
  scope?: string;

  @ApiProperty({
    description: 'OpenID Connect ID token',
    required: false,
  })
  id_token?: string;
}
