import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';
import { UserFcmTokenRepository } from '../../modules/user/repositories/user-fcm-token.repository';

export interface FcmNotificationPayload {
  title: string;
  body: string;
  imageUrl?: string;
  icon?: string;
  badge?: string;
}

export interface FcmDataPayload {
  [key: string]: string;
}

export interface SendNotificationResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface BatchNotificationResult {
  successCount: number;
  failureCount: number;
  results: SendNotificationResult[];
  invalidTokens: string[];
}

@Injectable()
export class FcmNotificationService implements OnModuleInit {
  private readonly logger = new Logger(FcmNotificationService.name);
  private firebaseApp: admin.app.App;
  private isInitialized = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly fcmTokenRepository: UserFcmTokenRepository,
  ) {}

  /**
   * Initialize Firebase Admin SDK on module startup
   */
  onModuleInit() {
    try {
      const projectId = this.configService.get<string>('FIREBASE_PROJECT_ID');
      const privateKey = this.configService.get<string>('FIREBASE_PRIVATE_KEY');
      const clientEmail = this.configService.get<string>('FIREBASE_CLIENT_EMAIL');

      if (!projectId || !privateKey || !clientEmail) {
        this.logger.warn(
          '⚠️ Firebase credentials not configured. FCM notifications will be disabled. ' +
          'Set FIREBASE_PROJECT_ID, FIREBASE_PRIVATE_KEY, and FIREBASE_CLIENT_EMAIL in .env'
        );
        return;
      }

      // Initialize Firebase Admin SDK
      this.firebaseApp = admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          privateKey: privateKey.replace(/\\n/g, '\n'), // Handle escaped newlines
          clientEmail,
        }),
      });

      this.isInitialized = true;
    } catch (error) {
      this.logger.error(`❌ Failed to initialize Firebase Admin SDK: ${error.message}`);
    }
  }

  /**
   * Check if FCM service is ready
   */
  isReady(): boolean {
    return this.isInitialized;
  }

  /**
   * Send notification to a single device
   */
  async sendToDevice(
    fcmToken: string,
    notification: FcmNotificationPayload,
    data?: FcmDataPayload,
    options?: {
      priority?: 'high' | 'normal';
      timeToLive?: number; // seconds
      collapseKey?: string;
    }
  ): Promise<SendNotificationResult> {
    if (!this.isInitialized) {
      return {
        success: false,
        error: 'Firebase Admin SDK not initialized',
      };
    }

    try {
      const message: admin.messaging.Message = {
        token: fcmToken,
        notification: {
          title: notification.title,
          body: notification.body,
          imageUrl: notification.imageUrl,
        },
        data: data || {},
        android: {
          priority: options?.priority === 'high' ? 'high' : 'normal',
          ttl: options?.timeToLive || 86400000, // 24 hours default
          collapseKey: options?.collapseKey,
          notification: {
            icon: notification.icon || 'ic_notification',
            color: '#4CAF50',
            sound: 'default',
            clickAction: 'FLUTTER_NOTIFICATION_CLICK',
          },
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: notification.badge ? parseInt(notification.badge) : undefined,
            },
          },
        },
        webpush: {
          notification: {
            icon: notification.icon || '/icon-192x192.png',
            badge: notification.badge || '/badge-72x72.png',
            requireInteraction: true,
            tag: options?.collapseKey || 'default',
          },
        },
      };

      const messageId = await admin.messaging().send(message);

      return {
        success: true,
        messageId,
      };
    } catch (error) {
      this.logger.error(`❌ Failed to send notification: ${error.message}`);
      
      // Handle specific Firebase errors
      if (error.code === 'messaging/invalid-registration-token' ||
          error.code === 'messaging/registration-token-not-registered') {
        return {
          success: false,
          error: 'Invalid or expired token',
        };
      }

      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Send notification to multiple devices (batch)
   */
  async sendToMultipleDevices(
    fcmTokens: string[],
    notification: FcmNotificationPayload,
    data?: FcmDataPayload,
    options?: {
      priority?: 'high' | 'normal';
      timeToLive?: number;
      collapseKey?: string;
    }
  ): Promise<BatchNotificationResult> {
    if (!this.isInitialized) {
      return {
        successCount: 0,
        failureCount: fcmTokens.length,
        results: fcmTokens.map(() => ({
          success: false,
          error: 'Firebase Admin SDK not initialized',
        })),
        invalidTokens: [],
      };
    }

    if (fcmTokens.length === 0) {
      return {
        successCount: 0,
        failureCount: 0,
        results: [],
        invalidTokens: [],
      };
    }

    try {
      const message: admin.messaging.MulticastMessage = {
        tokens: fcmTokens,
        notification: {
          title: notification.title,
          body: notification.body,
          imageUrl: notification.imageUrl,
        },
        data: data || {},
        android: {
          priority: options?.priority === 'high' ? 'high' : 'normal',
          ttl: options?.timeToLive || 86400000,
          collapseKey: options?.collapseKey,
          notification: {
            icon: notification.icon || 'ic_notification',
            color: '#4CAF50',
            sound: 'default',
          },
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: notification.badge ? parseInt(notification.badge) : undefined,
            },
          },
        },
        webpush: {
          notification: {
            icon: notification.icon || '/icon-192x192.png',
            badge: notification.badge || '/badge-72x72.png',
            requireInteraction: true,
          },
        },
      };

      // Use sendEachForMulticast (correct method name) instead of sendMulticast
      const response = await admin.messaging().sendEachForMulticast(message);

      const invalidTokens: string[] = [];
      const results: SendNotificationResult[] = response.responses.map((resp, index) => {
        if (resp.success) {
          return {
            success: true,
            messageId: resp.messageId,
          };
        } else {
          const error = resp.error;
          if (error?.code === 'messaging/invalid-registration-token' ||
              error?.code === 'messaging/registration-token-not-registered') {
            invalidTokens.push(fcmTokens[index]);
          }
          return {
            success: false,
            error: error?.message || 'Unknown error',
          };
        }
      });

      if (invalidTokens.length > 0) {
        this.logger.warn(`⚠️ Found ${invalidTokens.length} invalid tokens`);
      }

      return {
        successCount: response.successCount,
        failureCount: response.failureCount,
        results,
        invalidTokens,
      };
    } catch (error) {
      this.logger.error(`❌ Failed to send batch notification: ${error.message}`);
      return {
        successCount: 0,
        failureCount: fcmTokens.length,
        results: fcmTokens.map(() => ({
          success: false,
          error: error.message,
        })),
        invalidTokens: [],
      };
    }
  }

  /**
   * Send notification to all active devices of a user
   */
  async sendToUser(
    userId: string,
    notification: FcmNotificationPayload,
    data?: FcmDataPayload,
    options?: {
      priority?: 'high' | 'normal';
      timeToLive?: number;
      collapseKey?: string;
    }
  ): Promise<BatchNotificationResult> {
    try {
      // Get all active FCM tokens for the user
      const tokens = await this.fcmTokenRepository.findActiveTokensByUserId(userId);

      if (tokens.length === 0) {
        this.logger.warn(`⚠️ No active FCM tokens found for user ${userId}`);
        return {
          successCount: 0,
          failureCount: 0,
          results: [],
          invalidTokens: [],
        };
      }

      const fcmTokens = tokens.map(token => token.fcmToken);

      const result = await this.sendToMultipleDevices(fcmTokens, notification, data, options);

      // Deactivate invalid tokens
      if (result.invalidTokens.length > 0) {
        await this.handleInvalidTokens(result.invalidTokens);
      }

      return result;
    } catch (error) {
      this.logger.error(`❌ Failed to send notification to user ${userId}: ${error.message}`);
      return {
        successCount: 0,
        failureCount: 0,
        results: [],
        invalidTokens: [],
      };
    }
  }

  /**
   * Send notification to multiple users
   */
  async sendToUsers(
    userIds: string[],
    notification: FcmNotificationPayload,
    data?: FcmDataPayload,
    options?: {
      priority?: 'high' | 'normal';
      timeToLive?: number;
      collapseKey?: string;
    }
  ): Promise<{
    totalSuccess: number;
    totalFailure: number;
    userResults: { userId: string; result: BatchNotificationResult }[];
  }> {
    const userResults: { userId: string; result: BatchNotificationResult }[] = [];
    let totalSuccess = 0;
    let totalFailure = 0;

    for (const userId of userIds) {
      const result = await this.sendToUser(userId, notification, data, options);
      userResults.push({ userId, result });
      totalSuccess += result.successCount;
      totalFailure += result.failureCount;
    }

    return {
      totalSuccess,
      totalFailure,
      userResults,
    };
  }

  /**
   * Subscribe tokens to a topic
   */
  async subscribeToTopic(
    fcmTokens: string[],
    topic: string
  ): Promise<{ successCount: number; failureCount: number; errors: any[] }> {
    if (!this.isInitialized) {
      return {
        successCount: 0,
        failureCount: fcmTokens.length,
        errors: [{ error: 'Firebase Admin SDK not initialized' }],
      };
    }

    try {
      const response = await admin.messaging().subscribeToTopic(fcmTokens, topic);

      return {
        successCount: response.successCount,
        failureCount: response.failureCount,
        errors: response.errors,
      };
    } catch (error) {
      this.logger.error(`❌ Failed to subscribe to topic: ${error.message}`);
      return {
        successCount: 0,
        failureCount: fcmTokens.length,
        errors: [{ error: error.message }],
      };
    }
  }

  /**
   * Unsubscribe tokens from a topic
   */
  async unsubscribeFromTopic(
    fcmTokens: string[],
    topic: string
  ): Promise<{ successCount: number; failureCount: number; errors: any[] }> {
    if (!this.isInitialized) {
      return {
        successCount: 0,
        failureCount: fcmTokens.length,
        errors: [{ error: 'Firebase Admin SDK not initialized' }],
      };
    }

    try {
      const response = await admin.messaging().unsubscribeFromTopic(fcmTokens, topic);

      return {
        successCount: response.successCount,
        failureCount: response.failureCount,
        errors: response.errors,
      };
    } catch (error) {
      this.logger.error(`❌ Failed to unsubscribe from topic: ${error.message}`);
      return {
        successCount: 0,
        failureCount: fcmTokens.length,
        errors: [{ error: error.message }],
      };
    }
  }

  /**
   * Send notification to a topic
   */
  async sendToTopic(
    topic: string,
    notification: FcmNotificationPayload,
    data?: FcmDataPayload,
    options?: {
      priority?: 'high' | 'normal';
      timeToLive?: number;
    }
  ): Promise<SendNotificationResult> {
    if (!this.isInitialized) {
      return {
        success: false,
        error: 'Firebase Admin SDK not initialized',
      };
    }

    try {
      const message: admin.messaging.Message = {
        topic,
        notification: {
          title: notification.title,
          body: notification.body,
          imageUrl: notification.imageUrl,
        },
        data: data || {},
        android: {
          priority: options?.priority === 'high' ? 'high' : 'normal',
          ttl: options?.timeToLive || 86400000,
          notification: {
            icon: notification.icon || 'ic_notification',
            color: '#4CAF50',
            sound: 'default',
          },
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
            },
          },
        },
      };

      const messageId = await admin.messaging().send(message);

      return {
        success: true,
        messageId,
      };
    } catch (error) {
      this.logger.error(`❌ Failed to send notification to topic: ${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Handle invalid tokens by deactivating them in database
   */
  private async handleInvalidTokens(invalidTokens: string[]): Promise<void> {
    try {
      for (const token of invalidTokens) {
        // Find and deactivate token in database
        const tokenEntity = await this.fcmTokenRepository.findByToken(token);
        if (tokenEntity) {
          await this.fcmTokenRepository.deactivateToken(tokenEntity.id);
        }
      }
    } catch (error) {
      this.logger.error(`❌ Failed to handle invalid tokens: ${error.message}`);
    }
  }
}
