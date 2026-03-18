import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * 🔌 SMS PROVIDER SERVICE - SMSlenz.lk Integration
 * 
 * This service integrates with SMSlenz.lk API for SMS delivery.
 * Provider can be easily changed in the future by implementing a new provider service.
 * 
 * API DOCUMENTATION: https://smslenz.lk/docs/api
 * 
 * FEATURES:
 * ✅ Send single SMS
 * ✅ Send bulk SMS (up to 500 contacts per request)
 * ✅ Check account status and balance
 * ✅ Automatic chunking for large batches
 * ✅ Error handling and logging
 */

// Provider response interfaces
export interface SmsSendResponse {
  success: boolean;
  message: string;
  data: {
    status: string;
    campaign_id: number;
    message: string;
    sender_id: string;
    pages: number;
    recipient_number?: string;
    no_of_recipients?: number;
    sms_credit_balance: string;
  };
}

export interface SmsAccountStatusResponse {
  success: boolean;
  message: string;
  data: {
    status: string;
    sms_credit_balance: string;
    active_plan: string;
    total_contacts: number;
    total_sender_ids: number;
  };
}

export interface BulkSmsResult {
  success: boolean;
  totalSent: number;
  totalFailed: number;
  campaignIds: number[];
  remainingBalance: string;
  batches: number;
}

@Injectable()
export class SmsProviderService {
  private readonly logger = new Logger(SmsProviderService.name);

  // SMSlenz.lk API endpoints
  private readonly API_BASE_URL = 'https://smslenz.lk/api';
  private readonly SEND_SMS_URL = `${this.API_BASE_URL}/send-sms`;
  private readonly SEND_BULK_SMS_URL = `${this.API_BASE_URL}/send-bulk-sms`;
  private readonly ACCOUNT_STATUS_URL = `${this.API_BASE_URL}/account-status`;

  // Provider limits
  private readonly MAX_RECIPIENTS_PER_BATCH = 500; // SMSlenz limit
  private readonly MAX_MESSAGE_LENGTH = 1500; // SMSlenz limit
  private readonly HTTP_TIMEOUT_MS = 30000; // 30 second timeout for API calls

  constructor(
    private readonly configService: ConfigService,
  ) {}

  /**
   * 📱 Send SMS to a single contact
   * 
   * @param userId - SMSlenz user ID
   * @param apiKey - SMSlenz API key
   * @param senderId - Approved sender ID (use 'SMSlenzDEMO' for testing)
   * @param contact - Phone number in format +9476XXXXXXX
   * @param message - Message content (max 1500 chars)
   */
  async sendSingleSms(
    userId: string,
    apiKey: string,
    senderId: string,
    contact: string,
    message: string
  ): Promise<SmsSendResponse> {
    try {
      this.validateCredentials(userId, apiKey, senderId);
      this.validateMessage(message);
      this.validatePhoneNumber(contact);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.HTTP_TIMEOUT_MS);

      const response = await fetch(this.SEND_SMS_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: userId,
          api_key: apiKey,
          sender_id: senderId,
          contact: contact,
          message: message,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);
      const data: SmsSendResponse = await response.json();

      if (!(data.success || data.data?.status === 'success')) {
        this.logger.error(`❌ SMS failed to ${contact}: ${data.message}`);
      }

      return data;

    } catch (error) {
      // Validation errors (bad phone/message) are caller mistakes — log as warn, not error.
      // Network / provider errors are logged as error.
      const isValidationError = error?.status === 400 || error?.name === 'BadRequestException';
      if (isValidationError) {
        this.logger.warn(`⚠️ SMS skipped: ${error.message}`);
      } else {
        this.logger.error(`❌ SMS send error: ${error.message}`);
      }
      throw new BadRequestException(`Failed to send SMS: ${error.message}`);
    }
  }

  /**
   * 📢 Send bulk SMS with automatic chunking
   * 
   * This method automatically splits large contact lists into batches of 500
   * and sends them sequentially to comply with SMSlenz API limits.
   * 
   * Example: 1500 contacts → 3 batches (500 + 500 + 500)
   * 
   * @param userId - SMSlenz user ID
   * @param apiKey - SMSlenz API key
   * @param senderId - Approved sender ID
   * @param phoneNumbers - Array of phone numbers (will be auto-chunked)
   * @param message - Message content (same for all recipients)
   */
  async sendBulkSms(
    userId: string,
    apiKey: string,
    senderId: string,
    phoneNumbers: string[],
    message: string
  ): Promise<BulkSmsResult> {
    try {
      this.validateCredentials(userId, apiKey, senderId);
      this.validateMessage(message);

      if (!phoneNumbers || phoneNumbers.length === 0) {
        throw new BadRequestException('Phone numbers array cannot be empty');
      }

      // Validate all phone numbers
      const validNumbers = phoneNumbers.filter(num => this.isValidPhoneNumber(num));
      if (validNumbers.length === 0) {
        throw new BadRequestException('No valid phone numbers provided');
      }

      if (validNumbers.length !== phoneNumbers.length) {
        this.logger.warn(
          `⚠️ ${phoneNumbers.length - validNumbers.length} invalid phone numbers filtered out`
        );
      }

      // Split into batches of 500
      const batches = this.chunkArray(validNumbers, this.MAX_RECIPIENTS_PER_BATCH);

      let totalSent = 0;
      let totalFailed = 0;
      const campaignIds: number[] = [];
      let lastBalance = '0';

      // Send each batch sequentially
      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];

        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), this.HTTP_TIMEOUT_MS);

          const response = await fetch(this.SEND_BULK_SMS_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              user_id: userId,
              api_key: apiKey,
              sender_id: senderId,
              contacts: batch,
              message: message,
            }),
            signal: controller.signal,
          });

          clearTimeout(timeout);
          const data: SmsSendResponse = await response.json();

          if (data.success) {
            const sentCount = data.data.no_of_recipients || batch.length;
            totalSent += sentCount;
            campaignIds.push(data.data.campaign_id);
            lastBalance = data.data.sms_credit_balance;
          } else {
            totalFailed += batch.length;
            this.logger.error(`❌ Batch ${i + 1} failed: ${data.message}`);
          }

          // Small delay between batches to avoid rate limiting
          if (i < batches.length - 1) {
            await this.delay(500); // 500ms delay
          }

        } catch (batchError) {
          totalFailed += batch.length;
          this.logger.error(`❌ Batch ${i + 1} error: ${batchError.message}`);
        }
      }

      const result: BulkSmsResult = {
        success: totalSent > 0,
        totalSent,
        totalFailed,
        campaignIds,
        remainingBalance: lastBalance,
        batches: batches.length,
      };

      return result;

    } catch (error) {
      this.logger.error(`❌ Bulk SMS error: ${error.message}`);
      throw new BadRequestException(`Failed to send bulk SMS: ${error.message}`);
    }
  }

  /**
   * 📊 Check account status and available credits
   * 
   * @param userId - SMSlenz user ID
   * @param apiKey - SMSlenz API key
   */
  async getAccountStatus(
    userId: string,
    apiKey: string
  ): Promise<SmsAccountStatusResponse> {
    try {
      this.validateCredentials(userId, apiKey, 'N/A');

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.HTTP_TIMEOUT_MS);

      const response = await fetch(this.ACCOUNT_STATUS_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: userId,
          api_key: apiKey,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);
      const data: SmsAccountStatusResponse = await response.json();

      return data;

    } catch (error) {
      this.logger.error(`❌ Account status error: ${error.message}`);
      throw new BadRequestException(`Failed to get account status: ${error.message}`);
    }
  }

  // PRIVATE HELPER METHODS

  /**
   * Split array into chunks of specified size
   */
  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  /**
   * Validate SMS credentials
   */
  private validateCredentials(userId: string, apiKey: string, senderId: string): void {
    if (!userId || !userId.trim()) {
      throw new BadRequestException('SMSlenz user_id is required');
    }

    if (!apiKey || !apiKey.trim()) {
      throw new BadRequestException('SMSlenz api_key is required');
    }

    if (!senderId || !senderId.trim()) {
      throw new BadRequestException('Sender ID is required');
    }
  }

  /**
   * Validate message content
   */
  private validateMessage(message: string): void {
    if (!message || !message.trim()) {
      throw new BadRequestException('Message content cannot be empty');
    }

    if (message.length > this.MAX_MESSAGE_LENGTH) {
      throw new BadRequestException(
        `Message exceeds maximum length of ${this.MAX_MESSAGE_LENGTH} characters`
      );
    }
  }

  /**
   * Validate phone number format
   */
  private validatePhoneNumber(phoneNumber: string): void {
    if (!this.isValidPhoneNumber(phoneNumber)) {
      throw new BadRequestException(
        `Invalid phone number format: ${phoneNumber}. Expected format: +9476XXXXXXX`
      );
    }
  }

  /**
   * Check if phone number is valid
   */
  private isValidPhoneNumber(phoneNumber: string): boolean {
    if (!phoneNumber || !phoneNumber.trim()) {
      return false;
    }

    // Expected format: +9476XXXXXXX or +9477XXXXXXX (Sri Lanka mobile numbers)
    const sriLankaPattern = /^\+947[0-9]{8}$/;
    return sriLankaPattern.test(phoneNumber);
  }

  /**
   * Delay helper for rate limiting
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
