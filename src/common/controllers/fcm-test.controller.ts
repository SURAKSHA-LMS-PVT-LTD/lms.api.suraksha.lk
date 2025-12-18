import { Controller, Post, Body, UseGuards, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { FcmNotificationService } from '../services/fcm-notification.service';

class TestNotificationDto {
  userId: string;
  title: string;
  body: string;
}

/**
 * TEST ONLY - Remove in production
 * Simple controller to test FCM notifications
 */
@ApiTags('FCM Test')
@Controller('fcm-test')
export class FcmTestController {
  private readonly logger = new Logger(FcmTestController.name);

  constructor(private readonly fcmService: FcmNotificationService) {}

  @Post('send')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Test FCM notification (DEVELOPMENT ONLY)' })
  @ApiResponse({ status: 200, description: 'Notification sent' })
  async testSendNotification(@Body() dto: TestNotificationDto) {
    this.logger.log(`🧪 Testing FCM notification for user ${dto.userId}`);

    if (!this.fcmService.isReady()) {
      return {
        success: false,
        error: 'FCM service not initialized. Check Firebase credentials in .env',
      };
    }

    const result = await this.fcmService.sendToUser(
      dto.userId,
      {
        title: dto.title || '🧪 Test Notification',
        body: dto.body || 'This is a test notification from Suraksha LMS',
        icon: '/icons/test.png',
      },
      {
        type: 'TEST',
        timestamp: new Date().toISOString(),
      },
      {
        priority: 'high',
      }
    );

    return {
      success: result.successCount > 0,
      devicesNotified: result.successCount,
      devicesFailed: result.failureCount,
      details: result,
    };
  }

  @Post('check')
  @ApiOperation({ summary: 'Check FCM service status' })
  @ApiResponse({ status: 200, description: 'Service status' })
  async checkStatus() {
    return {
      isReady: this.fcmService.isReady(),
      message: this.fcmService.isReady()
        ? '✅ FCM service is ready'
        : '❌ FCM service not initialized. Check Firebase credentials in .env',
    };
  }
}
