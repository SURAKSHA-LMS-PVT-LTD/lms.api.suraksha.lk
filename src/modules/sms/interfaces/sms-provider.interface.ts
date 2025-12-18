/**
 * SMS Provider Interface
 * 
 * Abstraction layer for SMS providers (SMSlenz, Twilio, etc.)
 * Allows easy switching between providers without changing business logic
 */

export interface SendSmsRequest {
  senderId: string;
  contact: string; // Format: +9476XXXXXXX
  message: string;
}

export interface SendBulkSmsRequest {
  senderId: string;
  contacts: string[]; // Array of phone numbers
  message: string;
}

export interface SmsProviderResponse {
  success: boolean;
  message: string;
  data?: {
    status: string;
    campaignId?: number;
    pages?: number;
    recipientNumber?: string;
    noOfRecipients?: number;
    creditBalance?: string;
  };
  error?: string;
}

export interface AccountStatusResponse {
  success: boolean;
  message: string;
  data?: {
    status: string;
    creditBalance: string;
    activePlan?: string;
    totalContacts?: number;
    totalSenderIds?: number;
  };
  error?: string;
}

/**
 * SMS Provider Interface
 * All SMS providers must implement these methods
 */
export interface ISmsProvider {
  /**
   * Send single SMS
   */
  sendSms(request: SendSmsRequest): Promise<SmsProviderResponse>;

  /**
   * Send bulk SMS to multiple recipients
   */
  sendBulkSms(request: SendBulkSmsRequest): Promise<SmsProviderResponse>;

  /**
   * Check account status and credit balance
   */
  getAccountStatus(): Promise<AccountStatusResponse>;

  /**
   * Get provider name
   */
  getProviderName(): string;
}
