import { Controller, Get, UseGuards } from '@nestjs/common';
import { AppService } from './app.service';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { getCurrentSriLankaISO } from './common/utils/timezone.util';

@Controller()
@ApiTags('Application')
@UseGuards(JwtAuthGuard)
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('health')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Health check endpoint - requires authentication' })
  @ApiResponse({ status: 200, description: 'System is healthy' })
  @ApiResponse({ status: 401, description: 'Unauthorized - JWT token required' })
  @ApiResponse({ status: 403, description: 'Forbidden - Invalid origin' })
  healthCheck(): object {
    return {
      status: 'healthy',
      timestamp: getCurrentSriLankaISO(),
      environment: process.env.NODE_ENV || 'development'
    };
  }
}
