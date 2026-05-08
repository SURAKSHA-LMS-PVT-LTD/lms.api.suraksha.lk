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
          `[FCM] Credentials missing — FCM disabled. ` +
          `FIREBASE_PROJECT_ID=${!!projectId} FIREBASE_PRIVATE_KEY=${!!privateKey} FIREBASE_CLIENT_EMAIL=${!!clientEmail}`
        );
        return;
      }

      // Check if Firebase app already exists (avoid duplicate initialization)
      const existingApps = admin.apps;
      if (existingApps && existingApps.length > 0) {
        this.firebaseApp = existingApps[0];
        this.isInitialized = true;
        this.logger.log('✅ Firebase Admin SDK already initialized, reusing existing instance');
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
      this.logger.log('✅ Firebase Admin SDK initialized successfully');
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
      // Sanitize data payload - FCM requires all data values to be strings
      const sanitizedData: { [key: string]: string } = {};
      if (data) {
        for (const [key, value] of Object.entries(data)) {
          if (value !== null && value !== undefined) {
            sanitizedData[key] = String(value);
          }
        }
      }

      const message: admin.messaging.Message = {
        token: fcmToken,
        notification: {
          title: notification.title,
          body: notification.body,
          imageUrl: notification.imageUrl,
        },
        data: sanitizedData,
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
      
      // Handle specific Firebase errors for invalid/mismatched tokens
      if (error.code === 'messaging/invalid-registration-token' ||
          error.code === 'messaging/registration-token-not-registered' ||
          error.code === 'messaging/mismatched-credential') {
        return {
          success: false,
          error: 'Invalid, expired, or mismatched token',
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
      // Sanitize data payload - FCM requires all data values to be strings
      const sanitizedData: { [key: string]: string } = {};
      if (data) {
        for (const [key, value] of Object.entries(data)) {
          if (value !== null && value !== undefined) {
            sanitizedData[key] = String(value);
          }
        }
      }

      // Build notification object, excluding undefined/null values
      const notificationPayload: admin.messaging.Notification = {
        title: notification.title,
        body: notification.body,
      };
      if (notification.imageUrl) {
        notificationPayload.imageUrl = notification.imageUrl;
      }

      const message: admin.messaging.MulticastMessage = {
        tokens: fcmTokens,
        notification: notificationPayload,
        data: sanitizedData,
        android: {
          priority: options?.priority === 'high' ? 'high' : 'normal',
          ttl: options?.timeToLive || 86400000,
          ...(options?.collapseKey ? { collapseKey: options.collapseKey } : {}),
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
      this.logger.log(`📤 Sending multicast to ${fcmTokens.length} tokens`);
      this.logger.debug(`📋 Message payload: ${JSON.stringify({ notification: notificationPayload, data: sanitizedData })}`);
      
      const response = await admin.messaging().sendEachForMulticast(message);
      this.logger.log(`📊 Multicast result: ${response.successCount} success, ${response.failureCount} failure`);

      const invalidTokens: string[] = [];
      const results: SendNotificationResult[] = response.responses.map((resp, index) => {
        if (resp.success) {
          this.logger.log(`✅ Token ${index + 1}: sent successfully (messageId: ${resp.messageId})`);
          return {
            success: true,
            messageId: resp.messageId,
          };
        } else {
          const error = resp.error;
          this.logger.warn(`❌ Token ${index + 1} (${fcmTokens[index].substring(0, 20)}...): failed`);
          this.logger.warn(`   Error code: ${error?.code}`);
          this.logger.warn(`   Error message: ${error?.message}`);
          if (error?.stack) {
            this.logger.debug(`   Stack: ${error.stack}`);
          }
          // Mark tokens as invalid if they're unregistered, invalid, or from wrong Firebase project
          if (error?.code === 'messaging/invalid-registration-token' ||
              error?.code === 'messaging/registration-token-not-registered' ||
              error?.code === 'messaging/mismatched-credential') {
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
        this.logger.warn(`[FCM] No active tokens for userId=${userId} — user has not registered a device or tokens expired`);
        return { successCount: 0, failureCount: 0, results: [], invalidTokens: [] };
      }
      this.logger.log(`[FCM] Sending to userId=${userId} (${tokens.length} token(s))`);

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
   * Send notification to multiple users (OPTIMIZED FOR PERFORMANCE)
   * Fetches all tokens in one query and sends in batches
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
    if (userIds.length === 0) {
      return { totalSuccess: 0, totalFailure: 0, userResults: [] };
    }

    try {
      // ✅ OPTIMIZATION 1: Fetch ALL tokens in ONE database query
      const allTokens = await this.fcmTokenRepository.findActiveTokensByUserIds(userIds);
      
      // ✅ OPTIMIZATION 2: Group tokens by user
      const tokensByUser = new Map<string, string[]>();
      for (const token of allTokens) {
        if (!tokensByUser.has(token.userId)) {
          tokensByUser.set(token.userId, []);
        }
        tokensByUser.get(token.userId)!.push(token.fcmToken);
      }

      // ✅ OPTIMIZATION 3: Batch all tokens together for parallel sending
      const allFcmTokens = allTokens.map(t => t.fcmToken);
      
      if (allFcmTokens.length === 0) {
        // No tokens found for any user
        const userResults = userIds.map(userId => ({
          userId,
          result: {
            successCount: 0,
            failureCount: 0,
            results: [],
            invalidTokens: [],
          }
        }));
        
        this.logger.warn(`⚠️ No active FCM tokens found for ${userIds.length} users`);
        return { totalSuccess: 0, totalFailure: 0, userResults };
      }

      // ✅ OPTIMIZATION 4: Send all notifications in one multicast call
      this.logger.log(`📤 Bulk sending to ${allFcmTokens.length} tokens across ${tokensByUser.size} users`);
      const batchResult = await this.sendToMultipleDevices(allFcmTokens, notification, data, options);

      // ✅ OPTIMIZATION 5: Map results back to users
      const tokenIndexMap = new Map<string, number>();
      allTokens.forEach((token, index) => {
        tokenIndexMap.set(token.fcmToken, index);
      });

      const userResults: { userId: string; result: BatchNotificationResult }[] = [];
      let totalSuccess = 0;
      let totalFailure = 0;

      for (const userId of userIds) {
        const userTokens = tokensByUser.get(userId) || [];
        
        if (userTokens.length === 0) {
          userResults.push({
            userId,
            result: {
              successCount: 0,
              failureCount: 0,
              results: [],
              invalidTokens: [],
            }
          });
          continue;
        }

        // Extract results for this user's tokens
        const userSuccessCount = userTokens.filter(token => {
          const idx = tokenIndexMap.get(token);
          return idx !== undefined && batchResult.results[idx]?.success;
        }).length;

        const userFailureCount = userTokens.length - userSuccessCount;
        const userInvalidTokens = userTokens.filter(token => batchResult.invalidTokens.includes(token));

        const userTokenResults = userTokens.map(token => {
          const idx = tokenIndexMap.get(token);
          return idx !== undefined ? batchResult.results[idx] : { success: false, error: 'Token not found' };
        });

        userResults.push({
          userId,
          result: {
            successCount: userSuccessCount,
            failureCount: userFailureCount,
            results: userTokenResults,
            invalidTokens: userInvalidTokens,
          }
        });

        totalSuccess += userSuccessCount;
        totalFailure += userFailureCount;
      }

      // Handle invalid tokens
      if (batchResult.invalidTokens.length > 0) {
        await this.handleInvalidTokens(batchResult.invalidTokens);
      }

      this.logger.log(`✅ Bulk send complete: ${totalSuccess} success, ${totalFailure} failure`);

      return {
        totalSuccess,
        totalFailure,
        userResults,
      };
    } catch (error) {
      this.logger.error(`❌ Failed to send bulk notifications: ${error.message}`);
      
      // Return error result for all users
      const userResults = userIds.map(userId => ({
        userId,
        result: {
          successCount: 0,
          failureCount: 0,
          results: [],
          invalidTokens: [],
        }
      }));
      
      return { totalSuccess: 0, totalFailure: 0, userResults };
    }
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
      // Sanitize data payload - FCM requires all data values to be strings
      const sanitizedData: { [key: string]: string } = {};
      if (data) {
        for (const [key, value] of Object.entries(data)) {
          if (value !== null && value !== undefined) {
            sanitizedData[key] = String(value);
          }
        }
      }

      const message: admin.messaging.Message = {
        topic,
        notification: {
          title: notification.title,
          body: notification.body,
          imageUrl: notification.imageUrl,
        },
        data: sanitizedData,
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
