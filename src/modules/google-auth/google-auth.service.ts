import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { GoogleTokenResponse } from './interfaces/google-token-response.interface';

@Injectable()
export class GoogleAuthService {
  private readonly logger = new Logger(GoogleAuthService.name);
  
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;
  private readonly scopes: string[];

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService
  ) {
    this.clientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
    this.clientSecret = this.configService.get<string>('GOOGLE_CLIENT_SECRET');
    this.redirectUri = this.configService.get<string>('GOOGLE_REDIRECT_URI');
    
    // Limited scopes - only file creation, not full Drive access
    this.scopes = [
      'https://www.googleapis.com/auth/drive.file', // Only files created by this app
      'openid',
      'email',
      'profile'
    ];

    // Validate configuration
    if (!this.clientId || !this.clientSecret || !this.redirectUri) {
      throw new Error(
        'Missing required Google OAuth configuration. Please set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI environment variables.'
      );
    }
  }

  /**
   * Generate Google OAuth 2.0 authorization URL
   */
  getAuthorizationUrl(state?: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: this.scopes.join(' '),
      access_type: 'online', // No refresh token
      prompt: 'consent', // Always show consent screen
      state: state || `state_${Date.now()}`,
    });

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    
    this.logger.log(`Generated authorization URL for state: ${state}`);
    
    return authUrl;
  }

  /**
   * Exchange authorization code for access token
   * 
   * IMPORTANT: This does NOT store the token - it returns it to the caller
   */
  async exchangeCodeForToken(code: string): Promise<GoogleTokenResponse> {
    try {
      const tokenEndpoint = 'https://oauth2.googleapis.com/token';
      
      const requestBody = {
        code,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        redirect_uri: this.redirectUri,
        grant_type: 'authorization_code',
      };

      this.logger.log('Exchanging authorization code for access token');

      const response = await firstValueFrom(
        this.httpService.post<GoogleTokenResponse>(tokenEndpoint, requestBody, {
          headers: {
            'Content-Type': 'application/json',
          },
        })
      );

      const tokenData = response.data;

      // Log success (without exposing token)
      this.logger.log(`Successfully obtained access token (expires in ${tokenData.expires_in}s)`);

      // Validate response
      if (!tokenData.access_token) {
        throw new Error('No access token in response');
      }

      return {
        access_token: tokenData.access_token,
        expires_in: tokenData.expires_in,
        token_type: tokenData.token_type,
        scope: tokenData.scope,
        id_token: tokenData.id_token,
      };
    } catch (error) {
      this.logger.error('Failed to exchange code for token', error.response?.data || error.message);
      
      if (error.response?.data?.error) {
        throw new InternalServerErrorException(
          `Google OAuth error: ${error.response.data.error_description || error.response.data.error}`
        );
      }
      
      throw new InternalServerErrorException('Failed to authenticate with Google');
    }
  }

  /**
   * Verify that a Google Drive file exists and is accessible
   * 
   * This is called by the homework service to validate fileId before saving
   */
  async verifyFileExists(fileId: string, accessToken: string): Promise<boolean> {
    try {
      const fileEndpoint = `https://www.googleapis.com/drive/v3/files/${fileId}`;
      
      const response = await firstValueFrom(
        this.httpService.get(fileEndpoint, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          params: {
            fields: 'id,name,mimeType',
          },
        })
      );

      this.logger.log(`Verified file exists: ${response.data.name} (${fileId})`);
      
      return true;
    } catch (error) {
      if (error.response?.status === 404) {
        this.logger.warn(`File not found: ${fileId}`);
        return false;
      }
      
      if (error.response?.status === 401 || error.response?.status === 403) {
        this.logger.warn(`Access denied to file: ${fileId}`);
        return false;
      }
      
      this.logger.error(`Error verifying file: ${error.message}`);
      return false;
    }
  }

  /**
   * Get file metadata from Google Drive
   */
  async getFileMetadata(fileId: string, accessToken: string): Promise<{
    id: string;
    name: string;
    mimeType: string;
    size?: string;
    createdTime?: string;
  } | null> {
    try {
      const fileEndpoint = `https://www.googleapis.com/drive/v3/files/${fileId}`;
      
      const response = await firstValueFrom(
        this.httpService.get(fileEndpoint, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          params: {
            fields: 'id,name,mimeType,size,createdTime',
          },
        })
      );

      return response.data;
    } catch (error) {
      this.logger.error(`Failed to get file metadata: ${error.message}`);
      return null;
    }
  }
}
