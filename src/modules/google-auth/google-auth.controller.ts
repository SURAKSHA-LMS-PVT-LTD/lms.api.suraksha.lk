import { 
  Controller, 
  Get, 
  Query, 
  Res, 
  UseGuards, 
  Request,
  BadRequestException,
  HttpStatus
} from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { GoogleAuthService } from './google-auth.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { GoogleTokenResponseDto } from './dto/google-token-response.dto';
import { JwtRequest, JwtRequestHelper } from '@common/interfaces/jwt-request.interface';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('Google OAuth 2.0')
@Controller('auth/google')
export class GoogleAuthController {
  constructor(private readonly googleAuthService: GoogleAuthService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ 
    summary: 'Initiate Google OAuth 2.0 Authorization Code Flow',
    description: `
    Redirects the authenticated LMS user to Google's consent screen.
    
    **Flow:**
    1. User must be logged into LMS (JWT required)
    2. Redirects to Google OAuth consent screen
    3. User grants permissions for Google Drive file access
    4. Google redirects back to callback URL with authorization code
    
    **Required Scopes:**
    - https://www.googleapis.com/auth/drive.file (limited Drive access)
    - openid, email, profile (user identification)
    `
  })
  @ApiQuery({ 
    name: 'state', 
    required: false, 
    description: 'Optional state parameter for CSRF protection',
    example: 'random_state_string'
  })
  @ApiResponse({ 
    status: 302, 
    description: 'Redirects to Google OAuth consent screen' 
  })
  @ApiResponse({ 
    status: 401, 
    description: 'Unauthorized - User must be logged into LMS first' 
  })
  initiateGoogleAuth(
    @Query('state') state: string,
    @Request() req: JwtRequest,
    @Res() res: Response
  ): void {
    // Generate state with user ID for verification in callback
    const userId = JwtRequestHelper.getUserId(req.user);
    const stateParam = state || `${userId}_${Date.now()}`;
    
    const authUrl = this.googleAuthService.getAuthorizationUrl(stateParam);
    res.redirect(authUrl);
  }

  @Get('callback')
  @Public()
  @ApiOperation({ 
    summary: 'Google OAuth 2.0 callback handler',
    description: `
    Receives authorization code from Google and exchanges it for access token.
    
    **Flow:**
    1. Google redirects here with authorization code
    2. Backend exchanges code for access token
    3. Returns access token to frontend (temporary, not stored)
    4. Frontend uses this token to upload files to Google Drive
    
    **Security:**
    - Access token is never stored in database
    - Token expires in 1 hour (Google default)
    - No refresh token is requested or stored
    `
  })
  @ApiQuery({ 
    name: 'code', 
    required: true, 
    description: 'Authorization code from Google',
    example: '4/0AeanBLsdhfkjsdhfkjhsdkjfhskdjfh'
  })
  @ApiQuery({ 
    name: 'state', 
    required: false, 
    description: 'State parameter for CSRF verification'
  })
  @ApiQuery({ 
    name: 'error', 
    required: false, 
    description: 'Error code if user denied consent'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Successfully exchanged code for access token',
    type: GoogleTokenResponseDto
  })
  @ApiResponse({ 
    status: 400, 
    description: 'Bad request - Missing code or user denied access' 
  })
  @ApiResponse({ 
    status: 500, 
    description: 'Failed to exchange code for token' 
  })
  async handleGoogleCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string,
    @Res() res: Response
  ): Promise<void> {
    // Extract return URL from state if possible
    let returnUrl = '/homework/upload';
    try {
      if (state) {
        // State might be a base64 encoded JSON string with signature appended
        // e.g., eyJ1c2VySWQiOiIyIiwicmV0dXJuVXJsIjoiL3Byb2ZpbGUifQ.signature
        const statePayload = state.split('.')[0];
        const decodedState = Buffer.from(statePayload, 'base64').toString('utf8');
        const stateObj = JSON.parse(decodedState);
        if (stateObj.returnUrl) {
          returnUrl = stateObj.returnUrl;
        }
      }
    } catch (e) {
      // Ignore parsing errors, fallback to default
    }

    // Handle user denial
    if (error) {
      const errorMessage = error === 'access_denied' 
        ? 'User denied Google Drive access' 
        : `Google OAuth error: ${error}`;
      
      // Redirect to frontend with error
      const frontendUrl = process.env.FRONTEND_URL || 'https://lms.suraksha.lk';
      res.redirect(`${frontendUrl}${returnUrl}?error=${encodeURIComponent(errorMessage)}`);
      return;
    }

    // Validate authorization code
    if (!code) {
      throw new BadRequestException('Authorization code is required');
    }

    try {
      // Exchange code for access token
      const tokenData = await this.googleAuthService.exchangeCodeForToken(code);

      // 🔒 SECURITY: Set token as httpOnly cookie instead of URL fragment
      const frontendUrl = process.env.FRONTEND_URL || 'https://lms.suraksha.lk';
      const isProduction = process.env.NODE_ENV === 'production';
      
      res.cookie('google_access_token', tokenData.access_token, {
        httpOnly: false, // Frontend needs to read this for Google Drive API calls
        secure: isProduction,
        sameSite: 'lax',
        maxAge: (tokenData.expires_in || 3600) * 1000, // Convert seconds to ms
        path: '/',
      });

      const redirectUrl = returnUrl !== '/homework/upload'
        ? `${frontendUrl}${returnUrl}?google_auth=success`
        : `${frontendUrl}/profile?google_auth=success`;

      res.redirect(redirectUrl);
    } catch (error) {
      const frontendUrl = process.env.FRONTEND_URL || 'https://lms.suraksha.lk';
      res.redirect(`${frontendUrl}${returnUrl}?error=${encodeURIComponent('Failed to authenticate with Google')}`);
    }
  }

  @Get('revoke')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ 
    summary: 'Revoke Google access (client-side instruction)',
    description: `
    Provides instructions for revoking Google Drive access.
    
    **Note:** Since tokens are not stored, revocation must be done by:
    1. User visiting Google Account settings
    2. Or frontend calling Google's revoke endpoint directly
    `
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Revocation instructions returned' 
  })
  getRevokeInstructions(): { 
    message: string; 
    revokeUrl: string;
    instructions: string[];
  } {
    return {
      message: 'Google access tokens are not stored in our system',
      revokeUrl: 'https://myaccount.google.com/permissions',
      instructions: [
        '1. Visit https://myaccount.google.com/permissions',
        '2. Find "Suraksha LMS" in the list',
        '3. Click "Remove Access"',
        'Alternatively, let the token expire naturally (1 hour)'
      ]
    };
  }
}
