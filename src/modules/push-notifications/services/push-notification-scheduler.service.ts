import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PushNotificationService } from './push-notification.service';
import { PushNotificationRepository } from '../repositories/push-notification.repository';

/**
 * Scheduler service that processes due scheduled notifications every minute.
 * Picks up all SCHEDULED notifications whose scheduledAt <= now and sends them.
 */
@Injectable()
export class PushNotificationSchedulerService {
  private readonly logger = new Logger(PushNotificationSchedulerService.name);
  private isRunning = false;

  constructor(
    private readonly notificationRepository: PushNotificationRepository,
    private readonly notificationService: PushNotificationService,
  ) {}

  /**
   * Runs every minute — picks up due scheduled notifications and sends them.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async processScheduledNotifications(): Promise<void> {
    // Guard against overlap if a previous run is still executing
    if (this.isRunning) {
      this.logger.debug('Scheduled notification processor already running — skipping this tick');
      return;
    }

    this.isRunning = true;

    try {
      const due = await this.notificationRepository.findDueScheduledNotifications();

      if (due.length === 0) return;

      this.logger.log(`⏰ Processing ${due.length} scheduled notification(s)`);

      for (const notification of due) {
        try {
          this.logger.log(`📤 Sending scheduled notification ${notification.id}: "${notification.title}"`);
          await this.notificationService.sendNotification(notification.id);
          this.logger.log(`✅ Scheduled notification ${notification.id} sent successfully`);
        } catch (error) {
          this.logger.error(
            `❌ Failed to send scheduled notification ${notification.id}: ${(error as Error).message}`,
          );
          // Continue with next notification even if one fails
        }
      }
    } catch (error) {
      this.logger.error(`❌ Scheduler error: ${(error as Error).message}`);
    } finally {
      this.isRunning = false;
    }
  }
}
