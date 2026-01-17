import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import {
  ISmsProvider,
  SendSmsRequest,
  SendBulkSmsRequest,
  SmsProviderResponse,
  AccountStatusResponse,
} from '../interfaces/sms-provider.interface';

/**
 * SMSlenz Provider Implementation
 * 
 * Official API Documentation: https://smslenz.lk/api
 * Base URL: https://smslenz.lk/api
 * 
 * Features:
 * - Send single SMS
 * - Send bulk SMS
 * - Check account status
 * - Credit balance tracking
 */
@Injectable()
export class SmslenzProvider implements ISmsProvider {
  private readonly logger = new Logger(SmslenzProvider.name);
  private readonly baseUrl = 'https://smslenz.lk/api';
  private readonly userId: string;
  private readonly apiKey: string;
  private readonly defaultSenderId: string;
  private readonly httpClient: AxiosInstance;

  constructor(private readonly configService: ConfigService) {
    this.userId = this.configService.get<string>('SMSLENZ_USER_ID');
    this.apiKey = this.configService.get<string>('SMSLENZ_API_KEY');
    this.defaultSenderId = this.configService.get<string>('SMSLENZ_SENDER_ID', 'SMSlenzDEMO');

    // Validate configuration
    if (!this.userId || !this.apiKey) {
      this.logger.warn('⚠️ SMSlenz credentials not configured. SMS functionality will be disabled.');
    }

    // Create axios instance for API calls
    this.httpClient = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000, // 30 seconds timeout
      headers: {
        'Content-Type': 'application/json',
      },
    });

  }

  /**
   * Send single SMS
   * 
   * @param request - SMS request with sender, contact, and message
   * @returns Provider response with campaign details
   */
  async sendSms(request: SendSmsRequest): Promise<SmsProviderResponse> {
    try {

      const response = await this.httpClient.post('/send-sms', {
        user_id: this.userId,
        api_key: this.apiKey,
        sender_id: request.senderId || this.defaultSenderId,
        contact: request.contact,
        message: request.message,
      });

      // SMSlenz API returns success in multiple ways - check all of them
      const isSuccess = 
        response.data.success === true || 
        response.data.data?.status === 'success' ||
        (response.data.message && response.data.message.toLowerCase().includes('success'));
      
      return {
        success: isSuccess,
        message: response.data.message,
        data: {
          status: response.data.data?.status,
          campaignId: response.data.data?.campaign_id,
          pages: response.data.data?.pages,
          recipientNumber: response.data.data?.recipient_number,
          creditBalance: response.data.data?.sms_credit_balance,
        },
      };
    } catch (error) {
      this.logger.error(`❌ Failed to send SMS to ${request.contact}: ${error.message}`);
      
      // Detailed error message for timeouts
      let errorMessage = 'Failed to send SMS';
      if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
        errorMessage = 'SMS service timeout - please check your internet connection and try again';
      } else if (error.code === 'ECONNREFUSED') {
        errorMessage = 'SMS service unavailable - please try again later';
      } else if (error.response?.status === 401) {
        errorMessage = 'SMS service authentication failed - please contact support';
      } else if (error.response?.status === 429) {
        errorMessage = 'SMS rate limit exceeded - please try again later';
      }
      
      return {
        success: false,
        message: errorMessage,
        error: error.response?.data?.message || error.message,
      };
    }
  }

  /**
   * Send bulk SMS to multiple recipients
   * 
   * @param request - Bulk SMS request with sender, contacts array, and message
   * @returns Provider response with bulk campaign details
   */
  async sendBulkSms(request: SendBulkSmsRequest): Promise<SmsProviderResponse> {
    try {

      const response = await this.httpClient.post('/send-bulk-sms', {
        user_id: this.userId,
        api_key: this.apiKey,
        sender_id: request.senderId || this.defaultSenderId,
        contacts: request.contacts,
        message: request.message,
      });

      
      return {
        success: response.data.success,
        message: response.data.message,
        data: {
          status: response.data.data?.status,
          campaignId: response.data.data?.campaign_id,
          pages: response.data.data?.pages,
          noOfRecipients: response.data.data?.no_of_recipients,
          creditBalance: response.data.data?.sms_credit_balance,
        },
      };
    } catch (error) {
      this.logger.error(`❌ Failed to send bulk SMS: ${error.message}`);
      
      return {
        success: false,
        message: 'Failed to send bulk SMS',
        error: error.response?.data?.message || error.message,
      };
    }
  }

  /**
   * Get account status and credit balance from SMSlenz
   * 
   * @returns Account status with credit balance and plan details
   */
  async getAccountStatus(): Promise<AccountStatusResponse> {
    try {

      const response = await this.httpClient.post('/account-status', {
        user_id: this.userId,
        api_key: this.apiKey,
      });

      
      return {
        success: response.data.success,
        message: response.data.message,
        data: {
          status: response.data.data?.status,
          creditBalance: response.data.data?.sms_credit_balance,
          activePlan: response.data.data?.active_plan,
          totalContacts: response.data.data?.total_contacts,
          totalSenderIds: response.data.data?.total_sender_ids,
        },
      };
    } catch (error) {
      this.logger.error(`❌ Failed to fetch account status: ${error.message}`);
      
      return {
        success: false,
        message: 'Failed to fetch account status',
        error: error.response?.data?.message || error.message,
      };
    }
  }

  /**
   * Get provider name
   */
  getProviderName(): string {
    return 'SMSlenz';
  }

  /**
   * Validate phone number format for Sri Lankan numbers
   * Expected format: +9476XXXXXXX
   */
  validatePhoneNumber(phoneNumber: string): boolean {
    const sriLankanPhoneRegex = /^\+947[0-9]{8}$/;
    return sriLankanPhoneRegex.test(phoneNumber);
  }
}
