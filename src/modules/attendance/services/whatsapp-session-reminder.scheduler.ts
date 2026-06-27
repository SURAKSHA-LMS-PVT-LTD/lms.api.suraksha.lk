import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class WhatsAppSessionReminderScheduler {
  private readonly logger = new Logger(WhatsAppSessionReminderScheduler.name);

  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  /**
   * Format a Date object to "h:mm A" string.
   */
  private formatTime(date: Date): string {
    return date.toLocaleString('en-US', {
      timeZone: 'Asia/Colombo',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  }

  private async notifyAdmins(message: string): Promise<void> {
    const adminStr = process.env.ADMIN_PHONE_NUMBERS || '';
    const adminNumbers = adminStr.split(',').map((n) => n.trim()).filter(Boolean);

    if (adminNumbers.length === 0) return;

    for (const phone of adminNumbers) {
      await this.sendWhatsAppText(phone, `[System Admin Info] ${message}`);
    }
  }

  private async sendWhatsAppText(phone: string, text: string): Promise<void> {
    try {
      const recipient = phone.replace(/^\+/, '');
      const body = {
        messaging_product: 'whatsapp',
        to: recipient,
        type: 'text',
        text: { body: text },
      };

      await fetch(
        `https://graph.facebook.com/v18.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        }
      );
    } catch (err: any) {
      this.logger.error(`Failed to send text to admin ${phone}: ${err.message}`);
    }
  }

  private async sendButtonMessage(phone: string, imageUrl: string, bodyText: string, buttons: any[]): Promise<boolean> {
    try {
      const recipient = phone.replace(/^\+/, '');
      const interactive = {
        type: 'button',
        header: { type: 'image', image: { link: imageUrl } },
        body: { text: bodyText },
        action: {
          buttons: buttons.map((b) => ({
            type: 'reply',
            reply: {
              id: String(b.id).slice(0, 256),
              title: String(b.title).slice(0, 20),
            },
          })),
        },
      };

      const body = {
        messaging_product: 'whatsapp',
        to: recipient,
        type: 'interactive',
        interactive,
      };

      const res = await fetch(
        `https://graph.facebook.com/v18.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        }
      );

      const json = await res.json() as any;
      if (res.ok && json.messages && json.messages[0]) {
        return true;
      }
      this.logger.error(`Button message failed for ${phone}: ${json.error?.message}`);
      return false;
    } catch (err: any) {
      this.logger.error(`Network error sending button to ${phone}: ${err.message}`);
      return false;
    }
  }

  // Ensure this runs on startup to notify admins that the scheduler is up
  async onApplicationBootstrap() {
    if (process.env.SessionUpdatinMessageSendByHere === 'true') {
      const startupMsg = `Session reminder scheduler started successfully on service: lms-api-suraksha-lk. Current time: ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Colombo' })}`;
      this.logger.log(startupMsg);
      await this.notifyAdmins(startupMsg);
    }
  }

  @Cron(CronExpression.EVERY_HOUR)
  async handleCron() {
    if (process.env.SessionUpdatinMessageSendByHere !== 'true') {
      return;
    }

    const startTime = Date.now();
    this.logger.log('Running session reminder job...');

    try {
      // Find all users expiring in the next hour who haven't received a reminder
      const sessions: any[] = await this.ds.query(`
        SELECT phone, session_expires_at 
        FROM whatsapp_contact_sessions 
        WHERE session_expires_at > NOW() 
          AND session_expires_at <= DATE_ADD(NOW(), INTERVAL 1 HOUR) 
          AND reminder_sent_at IS NULL
      `);

      let sentCount = 0;
      const imageUrl = process.env.WA_LOGO_URL || 'https://suraksha.lk/assets/logos/surakshalms-logo.png';

      for (const session of sessions) {
        const phone = session.phone;
        const expireTimeStr = this.formatTime(new Date(session.session_expires_at));

        const englishText = `Do you need future updates of you or your childrens related updates from Suraksha LMS. If yes make sure to reply this to click button of yes else stay without repling its consider as you never need any future updates and get resposbity for blickng us yourself. After today ${expireTimeStr} system will block you from future messages even u reply this like that also.`;
        
        const sinhalaText = `Suraksha LMS වෙතින් ඔබට හෝ ඔබගේ දරුවන්ට අදාල ඉදිරි පනිවිඩ / පැමිනීම් දැනුම් දීම් ලබා ගැනීමට අවශ්යද? එසේ නම් 'ඔව් / Yes' බොත්තම ඔබන්න. එසේ නොමැති නම් මෙම පනිවිඩය නොසලකා හරින්න . එවිට අද ${expireTimeStr} ට පසුව ඔබට පණිවිඩ එවීම් අපගේ පද්ධතිය මගින් ඔබව ස්වයංක්රීයව නවත්වනු කරනු ඇත.ස්තූතී.`;

        const bodyText = `${sinhalaText}\n\n${englishText}`;
        const buttons = [{ id: 'extend_session_yes', title: 'ඔව් / Yes' }];

        const success = await this.sendButtonMessage(phone, imageUrl, bodyText, buttons);
        if (success) {
          sentCount++;
          await this.ds.query(
            `UPDATE whatsapp_contact_sessions SET reminder_sent_at = NOW() WHERE phone = ?`,
            [phone]
          );
        }
      }

      const timeSpentSecs = ((Date.now() - startTime) / 1000).toFixed(2);
      const endMessage = `Session reminder job completed successfully.\nTime spent: ${timeSpentSecs} seconds.\nSessions found: ${sessions.length}\nReminders sent: ${sentCount}`;
      
      this.logger.log(endMessage.replace(/\n/g, ' - '));
      await this.notifyAdmins(endMessage);

    } catch (error: any) {
      this.logger.error(`Error running session reminder job: ${error.message}`, error.stack);
      await this.notifyAdmins(`Error running session reminder job: ${error.message}`);
    }
  }
}
