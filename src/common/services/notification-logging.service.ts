import { Injectable, Logger } from '@nestjs/common';
import { DynamoDbService } from './dynamodb.service';
import { getCurrentSriLankaISO } from '../utils/timezone.util';

@Injectable()
export class NotificationLoggingService {
  private readonly logger = new Logger(NotificationLoggingService.name);

  constructor(
    private readonly dynamoDbService: DynamoDbService,
  ) {}

  /**
   * Log SMS notification directly to DynamoDB (optimized for performance)
   */
  async logSmsNotification(data: {
    instituteId: string;
    messageId: string;
    recipientId?: string;
    recipientType: string;
    phoneNumber: string;
    recipientName?: string;
    messageContent: string;
    status: string;
    sentAt?: Date;
    deliveredAt?: Date;
    errorMessage?: string;
  }): Promise<void> {
    try {
      // Log directly to DynamoDB only (no MySQL, optimal performance)
      await this.logToDynamoDBAsync({
        ...data,
        timestamp: getCurrentSriLankaISO(),
      });
    } catch (error) {
      this.logger.error(`❌ Failed to log SMS notification to DynamoDB: ${error.message}`, error);
      // Don't throw error to avoid breaking SMS sending process
    }
  }

  /**
   * Log SMS message batch to notifications (optimized for performance)
   */
  async logSmsBatch(messageId: string, recipients: Array<{
    recipientId?: string;
    recipientType: string;
    phoneNumber: string;
    recipientName?: string;
    status: string;
    sentAt?: Date;
    deliveredAt?: Date;
    errorMessage?: string;
  }>, messageData: {
    instituteId: string;
    messageContent: string;
  }): Promise<void> {
    try {
      // Use Promise.allSettled for parallel processing without blocking on failures
      const batchPromises = recipients.map(recipient => 
        this.logToDynamoDBAsync({
          messageId,
          ...recipient,
          ...messageData,
          timestamp: getCurrentSriLankaISO(),
        })
      );

      const results = await Promise.allSettled(batchPromises);
      
      // Count successes and failures
      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;
      
      // Log failures for debugging (without throwing)
      if (failed > 0) {
        const failures = results
          .filter((r, index) => r.status === 'rejected')
          .map((r, index) => ({ recipient: recipients[index].phoneNumber, error: (r as PromiseRejectedResult).reason }));
        
        this.logger.warn(`⚠️ SMS logging failures for message ${messageId}:`, failures);
      }
    } catch (error) {
      this.logger.error(`Failed to process SMS batch logging: ${error.message}`, error);
      // Don't throw - logging failures shouldn't break SMS sending
    }
  }

  /**
   * 🚀 Optimized async method for DynamoDB logging (fire-and-forget)
   */
  private async logToDynamoDBAsync(data: any): Promise<void> {
    return this.dynamoDbService.putItem('SmsNotificationLogs', {
      messageId: data.messageId,
      recipientPhone: data.phoneNumber,
      instituteId: data.instituteId,
      recipientId: data.recipientId,
      recipientType: data.recipientType,
      recipientName: data.recipientName,
      messageContent: data.messageContent,
      status: data.status,
      sentAt: data.sentAt?.toISOString(),
      deliveredAt: data.deliveredAt?.toISOString(),
      errorMessage: data.errorMessage,
      timestamp: data.timestamp,
      ttl: Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60), // 1 year TTL
    });
  }

  /**
   * Update notification status
   */
  async updateNotificationStatus(
    messageId: string,
    recipientPhone: string,
    status: string,
    deliveredAt?: Date,
    errorMessage?: string
  ): Promise<void> {
    try {
      // Update DynamoDB record
      await this.dynamoDbService.updateItem(
        'SmsNotificationLogs',
        { 
          messageId,
          recipientPhone 
        },
        'SET #status = :status, #updatedAt = :updatedAt' + 
        (deliveredAt ? ', #deliveredAt = :deliveredAt' : '') +
        (errorMessage ? ', #errorMessage = :errorMessage' : ''),
        {
          ':status': status,
          ':updatedAt': getCurrentSriLankaISO(),
          ...(deliveredAt && { ':deliveredAt': deliveredAt.toISOString() }),
          ...(errorMessage && { ':errorMessage': errorMessage }),
        },
        {
          '#status': 'status',
          '#updatedAt': 'updatedAt',
          ...(deliveredAt && { '#deliveredAt': 'deliveredAt' }),
          ...(errorMessage && { '#errorMessage': 'errorMessage' }),
        }
      );

    } catch (error) {
      this.logger.error(`Failed to update notification status: ${error.message}`, error);
    }
  }

  /**
   * Get SMS statistics for institute
   */
  async getSmsStatistics(instituteId: string, dateFrom?: Date, dateTo?: Date): Promise<{
    totalSent: number;
    totalDelivered: number;
    totalFailed: number;
    totalPending: number;
    byRecipientType: Record<string, number>;
    byStatus: Record<string, number>;
  }> {
    try {
      const items = await this.dynamoDbService.queryItems(
        'SmsNotificationLogs',
        'instituteId = :instituteId',
        { ':instituteId': instituteId }
      );

      const stats = {
        totalSent: 0,
        totalDelivered: 0,
        totalFailed: 0,
        totalPending: 0,
        byRecipientType: {} as Record<string, number>,
        byStatus: {} as Record<string, number>,
      };

      items.forEach(item => {
        // Count by status
        if (item.status === 'SENT') stats.totalSent++;
        else if (item.status === 'DELIVERED') stats.totalDelivered++;
        else if (item.status === 'FAILED') stats.totalFailed++;
        else stats.totalPending++;

        // Count by recipient type
        stats.byRecipientType[item.recipientType] = (stats.byRecipientType[item.recipientType] || 0) + 1;
        
        // Count by status
        stats.byStatus[item.status] = (stats.byStatus[item.status] || 0) + 1;
      });

      return stats;
    } catch (error) {
      this.logger.error(`Failed to get SMS statistics: ${error.message}`, error);
      return {
        totalSent: 0,
        totalDelivered: 0,
        totalFailed: 0,
        totalPending: 0,
        byRecipientType: {},
        byStatus: {},
      };
    }
  }


}
