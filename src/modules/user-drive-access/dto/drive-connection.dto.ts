import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Response DTO for Drive connection status.
 * NEVER exposes tokens — only connection metadata.
 */
export class DriveConnectionStatusDto {
  @ApiProperty({ description: 'Whether user has an active Google Drive connection', example: true })
  isConnected: boolean;

  @ApiPropertyOptional({ description: 'Google account email', example: 'john@gmail.com' })
  googleEmail?: string;

  @ApiPropertyOptional({ description: 'Google account display name', example: 'John Doe' })
  googleDisplayName?: string;

  @ApiPropertyOptional({ description: 'Google profile picture URL' })
  googleProfilePicture?: string;

  @ApiPropertyOptional({ description: 'Scopes granted', example: 'drive.file,openid,email,profile' })
  grantedScopes?: string;

  @ApiPropertyOptional({ description: 'Last time Drive was used' })
  lastUsedAt?: string;

  @ApiPropertyOptional({ description: 'When the connection was created' })
  connectedAt?: string;

  @ApiPropertyOptional({ description: 'Whether the token might need re-authorization' })
  needsReauthorization?: boolean;

  static fromEntity(entity: any): DriveConnectionStatusDto {
    if (!entity || !entity.isActive) {
      return { isConnected: false };
    }
    return {
      isConnected: true,
      googleEmail: entity.googleEmail,
      googleDisplayName: entity.googleDisplayName,
      googleProfilePicture: entity.googleProfilePicture,
      grantedScopes: entity.grantedScopes,
      lastUsedAt: entity.lastUsedAt?.toISOString?.() ?? entity.lastUsedAt,
      connectedAt: entity.createdAt?.toISOString?.() ?? entity.createdAt,
      needsReauthorization: entity.consecutiveFailures >= 3,
    };
  }
}

/**
 * Response DTO for OAuth initiation — returns the Google consent URL.
 */
export class DriveAuthUrlDto {
  @ApiProperty({ description: 'Google OAuth consent URL to redirect the user to' })
  authUrl: string;

  @ApiProperty({ description: 'State parameter for CSRF protection' })
  state: string;
}

/**
 * Response DTO after successful OAuth callback.
 * NEVER includes any token — only success status.
 */
export class DriveAuthCallbackResultDto {
  @ApiProperty({ description: 'Whether the connection was successful', example: true })
  success: boolean;

  @ApiProperty({ description: 'Message', example: 'Google Drive connected successfully' })
  message: string;

  @ApiPropertyOptional({ description: 'Connected Google email', example: 'john@gmail.com' })
  googleEmail?: string;

  @ApiPropertyOptional({ description: 'Connected Google display name' })
  googleDisplayName?: string;
}

/**
 * Response DTO for disconnect operation.
 */
export class DriveDisconnectResultDto {
  @ApiProperty({ description: 'Whether disconnect was successful', example: true })
  success: boolean;

  @ApiProperty({ description: 'Message', example: 'Google Drive disconnected and tokens revoked' })
  message: string;
}

/**
 * Response DTO for access token dispensing.
 * 
 * SECURITY NOTE:
 * - This returns a SHORT-LIVED access token (~1 hour) for direct Drive uploads
 * - Scoped to drive.file — can only access files created by our OAuth app
 * - Refresh token NEVER leaves the backend
 * - This is the same pattern Google's own gapi JS client uses
 */
export class DriveAccessTokenDto {
  @ApiProperty({ description: 'Short-lived Google access token for direct Drive API calls', example: 'ya29.a0ARrdaM...' })
  accessToken: string;

  @ApiProperty({ description: 'Seconds until the access token expires', example: 3599 })
  expiresIn: number;

  @ApiProperty({ description: 'ISO timestamp when the access token expires', example: '2026-02-11T15:30:00.000Z' })
  expiresAt: string;

  @ApiProperty({ description: 'Connected Google account email', example: 'john@gmail.com' })
  googleEmail: string;

  @ApiProperty({ description: 'Google OAuth client ID (needed for Google Picker)', example: '123456789.apps.googleusercontent.com' })
  clientId: string;
}
