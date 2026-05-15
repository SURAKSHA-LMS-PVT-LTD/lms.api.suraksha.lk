import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { SmsProviderService } from '../../sms/services/sms-provider.service';
import { FcmNotificationService } from '../../../common/services/fcm-notification.service';
import { EnhancedEmailService } from '../../../common/services/enhanced-email.service';
import { NOTIFICATION_PACKAGES_CONFIG } from '../../advertisement/services/notification-packages.config';

// Retry configuration interface
export interface RetryConfig {
  maxRetries: number;
  retryDelay: number;
  exponentialBackoff: boolean;
}

export interface AttendanceNotificationData {
  studentId: string;
  studentName: string;
  parentName?: string;
  parentContact?: string;
  parentEmail?: string;
  parentTelegramId?: string;
  parentUserId?: string;       // ✅ Parent user ID for push notifications
  instituteId?: string;        // ✅ Institute ID for push notification inbox
  attendanceId?: string;       // ✅ Encoded attendance record ID for deep-link
  attendanceStatus: 'PRESENT' | 'ABSENT' | 'LATE' | 'LEFT' | 'LEFT_EARLY' | 'LEFT_LATELY';
  attendanceType?: 'INSTITUTE' | 'CLASS' | 'SUBJECT' | 'TRANSPORT';  // ✅ Type of attendance (with all levels)
  date: string;
  time: string;
  location?: string;           // ✅ Location where attendance was marked
  instituteName?: string;
  className?: string;          // ✅ Class name for class/subject attendance
  subjectName?: string;        // ✅ Subject name for subject-level attendance
  vehicleNumber?: string;
  bookhireName?: string;
  subscriptionPlan: string;
  firstLoginCompleted?: boolean;   // ✅ Whether parent has completed first login (has app installed)
  advertisementData?: {
    id: string;
    mediaUrl: string;
    mediaType: string;
    title: string;
    content: string;
    sendingUrl?: string;
    supportivePlatforms?: string[];
    modeOfSending?: string[];
  };
}

export interface NotificationResult {
  success: boolean;
  channel: string;
  attempts: number;
  errorMessage?: string;
  deliveryId?: string;
  timestamp: number;
}

export interface NotificationSummary {
  studentId: string;
  totalChannels: number;
  successfulChannels: number;
  failedChannels: number;
  results: NotificationResult[];
  advertisementDelivered: boolean;
}

@Injectable()
export class AttendanceNotificationService {
  private readonly logger = new Logger(AttendanceNotificationService.name);

  constructor(
    private readonly smsProviderService: SmsProviderService,
    private readonly configService: ConfigService,
    private readonly fcmNotificationService: FcmNotificationService,
    private readonly enhancedEmailService: EnhancedEmailService,
    private readonly dataSource: DataSource,
  ) {}

  /** True when Firebase Admin SDK is initialised and push can be sent */
  isPushReady(): boolean {
    return this.fcmNotificationService.isReady();
  }

  /**
   * Get notification channels based on subscription plan
   */
  private getNotificationChannels(subscriptionPlan: string): string[] {
    const packageConfig = NOTIFICATION_PACKAGES_CONFIG.packages[subscriptionPlan.toUpperCase()];
    
    if (packageConfig && packageConfig.channels) {
      return packageConfig.channels;
    }
    
    return NOTIFICATION_PACKAGES_CONFIG.packages['FREE']?.channels || ['email'];
  }

  /**
   * Get retry configuration based on subscription plan
   */
  private getRetryConfig(subscriptionPlan: string): RetryConfig {
    const packageConfig = NOTIFICATION_PACKAGES_CONFIG.packages[subscriptionPlan.toUpperCase()];
    
    if (packageConfig) {
      return {
        maxRetries: packageConfig.retryCount || 1,
        retryDelay: packageConfig.retryDelay || 5000,
        exponentialBackoff: true
      };
    }
    
    // Fallback configuration
    return {
      maxRetries: 1,
      retryDelay: 5000,
      exponentialBackoff: true
    };
  }

  /**
   * Check if ads are enabled for this subscription plan
   */
  private isAdsEnabled(subscriptionPlan: string): boolean {
    const packageConfig = NOTIFICATION_PACKAGES_CONFIG.packages[subscriptionPlan.toUpperCase()];
    return packageConfig?.isAds === true;
  }

  /**
   * Check if channel is available in current environment
   */
  private isChannelAvailable(channel: string): boolean {
    if (channel === 'sms') return true;
    if (channel === 'push') return this.fcmNotificationService.isReady();
    if (channel === 'email') {
      const hasUrl = !!process.env.EMAIL_SERVER_URL;
      const hasToken = !!process.env.EMAIL_SERVER_AUTH_TOKEN;
      if (!hasUrl || !hasToken) {
        this.logger.warn(`[Email] Channel unavailable — EMAIL_SERVER_URL=${hasUrl} EMAIL_SERVER_AUTH_TOKEN=${hasToken}`);
        return false;
      }
      return true;
    }
    const envChannels: Record<string, string | undefined> = {
      'whatsapp': process.env.WHATSAPP_ACCESS_TOKEN,
      'telegram': process.env.TELEGRAM_BOT_TOKEN,
    };
    return !!envChannels[channel];
  }

  /**
   * Send attendance notification based on subscription package
   */
  async sendAttendanceNotification(data: AttendanceNotificationData): Promise<NotificationSummary> {
    const startTime = Date.now();

    let channels = this.getNotificationChannels(data.subscriptionPlan);
    const retryConfig = this.getRetryConfig(data.subscriptionPlan);
    const isAdsEnabled = this.isAdsEnabled(data.subscriptionPlan);

    this.logger.log(
      `[NotifSvc] student=${data.studentId} plan=${data.subscriptionPlan} channels=${channels.join(',')} ` +
      `hasAd=${!!data.advertisementData} contact=${!!data.parentContact} email=${!!data.parentEmail} telegram=${!!data.parentTelegramId}`,
    );

    if (isAdsEnabled && data.advertisementData) {
      const sendingModes = data.advertisementData.modeOfSending && data.advertisementData.modeOfSending.length > 0
        ? data.advertisementData.modeOfSending
        : (data.advertisementData.supportivePlatforms && data.advertisementData.supportivePlatforms.length > 0
          ? data.advertisementData.supportivePlatforms
          : null);

      if (sendingModes && sendingModes.length > 0) {
        const originalChannels = [...channels];
        channels = channels.filter(channel => {
          const modeMap: Record<string, string[]> = {
            'sms': ['sms'],
            'whatsapp': ['whatsapp'],
            'telegram': ['telegram'],
            'email': ['email'],
            'push': ['push-mobile', 'push-web', 'mobile-push', 'web-push', 'push']
          };
          const possibleModes = modeMap[channel] || [channel];
          return possibleModes.some(mode => sendingModes.includes(mode));
        });
        if (channels.length < originalChannels.length) {
          this.logger.debug(`[NotifSvc] Ad platform filter: ${originalChannels.join(',')} → ${channels.join(',')}`);
        }
      }
    }

    if (channels.length === 0) {
      this.logger.warn(`[NotifSvc] No channels after filtering for student=${data.studentId} plan=${data.subscriptionPlan}`);
      return {
        studentId: data.studentId,
        totalChannels: 0,
        successfulChannels: 0,
        failedChannels: 0,
        results: [],
        advertisementDelivered: false
      };
    }

    const now = Date.now();
    
    // Process all channels in parallel for maximum performance
    const results = await Promise.all(
      channels.map(channel => 
        this.sendChannelNotification(channel, data, retryConfig).catch(error => ({
          success: false,
          channel,
          attempts: 0,
          errorMessage: error.message,
          timestamp: now
        }))
      )
    );

    const successCount = results.filter(r => r.success).length;
    const advertisementDelivered = isAdsEnabled && !!data.advertisementData && successCount > 0;

    const summary: NotificationSummary = {
      studentId: data.studentId,
      totalChannels: channels.length,
      successfulChannels: successCount,
      failedChannels: channels.length - successCount,
      results,
      advertisementDelivered
    };

    const duration = Date.now() - startTime;

    return summary;
  } 

  /**
   * Validate notification data before sending
   */
  private validateNotificationData(data: AttendanceNotificationData): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!data.parentContact && !data.parentEmail && !data.parentTelegramId) {
      errors.push('No valid parent contact information available');
    }

    if (!data.studentName?.trim()) {
      errors.push('Student name is required');
    }

    if (!data.attendanceStatus || !['PRESENT', 'ABSENT'].includes(data.attendanceStatus)) {
      errors.push('Valid attendance status is required');
    }

    if (!data.date || !data.time) {
      errors.push('Date and time are required');
    }

    // Check channel-specific requirements
    const channels = this.getNotificationChannels(data.subscriptionPlan);
    
    if (channels.includes('whatsapp') && !data.parentContact) {
      errors.push('WhatsApp requires parent phone number');
    }

    if (channels.includes('telegram') && !data.parentTelegramId) {
      errors.push('Telegram requires parent Telegram ID');
    }

    if (channels.includes('email') && !data.parentEmail) {
      errors.push('Email requires parent email address');
    }

    if (channels.includes('sms') && !data.parentContact) {
      errors.push('SMS requires parent phone number');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Send notification through a specific channel with retry logic
   */
  private async sendChannelNotification(
    channel: string,
    data: AttendanceNotificationData,
    retryConfig: RetryConfig
  ): Promise<NotificationResult> {
    if (!this.isChannelAvailable(channel)) {
      this.logger.warn(`[NotifSvc] Channel '${channel}' not available in env — skipping for student=${data.studentId}`);
      return {
        success: false,
        channel,
        attempts: 0,
        errorMessage: `Channel ${channel} not configured`,
        timestamp: Date.now()
      };
    }

    let attempts = 0;
    let lastError: Error | null = null;

    for (attempts = 1; attempts <= retryConfig.maxRetries + 1; attempts++) {
      try {
        let deliveryId: string | undefined;
        let success = false;

        switch (channel) {
          case 'whatsapp':
            ({ success, deliveryId } = await this.sendWhatsAppNotification(data));
            break;
          case 'email':
            ({ success, deliveryId } = await this.sendEmailNotification(data));
            break;
          case 'telegram':
            ({ success, deliveryId } = await this.sendTelegramNotification(data));
            break;
          case 'sms':
            ({ success, deliveryId } = await this.sendSMSNotification(data));
            break;
          case 'push':
            ({ success, deliveryId } = await this.sendPushNotification(data));
            break;
          default:
            throw new Error(`Unsupported channel: ${channel}`);
        }

        if (success) {
          return {
            success: true,
            channel,
            attempts,
            deliveryId,
            timestamp: Date.now()
          };
        }

        throw new Error(`${channel} notification failed - no success response`);

      } catch (error) {
        lastError = error as Error;

        // If this isn't the last attempt, wait before retrying
        if (attempts <= retryConfig.maxRetries) {
          const delay = retryConfig.exponentialBackoff 
            ? retryConfig.retryDelay * Math.pow(2, attempts - 1)
            : retryConfig.retryDelay;
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    return {
      success: false,
      channel,
      attempts: attempts - 1,
      errorMessage: lastError?.message || 'Unknown error',
      timestamp: Date.now()
    };
  }

  /**
   * Send WhatsApp notification with subscription-based logic:
   * - PREMIUM (WhatsApp-only): Use template messages (requires pre-approval)
   * - PLATINUM/packages with WhatsApp: Use session messages (no cost, 24hr window)
   */
  private async sendWhatsAppNotification(
    data: AttendanceNotificationData
  ): Promise<{ success: boolean; deliveryId?: string }> {
    if (!data.parentContact) {
      return { success: false };
    }

    const message = this.buildAttendanceMessage(data, false, 'whatsapp');
    const subscriptionPlan = data.subscriptionPlan.toUpperCase();
    const channels = this.getNotificationChannels(subscriptionPlan);
    
    // Check if this is WhatsApp-only subscription (PREMIUM with only WhatsApp)
    const isWhatsAppOnly = subscriptionPlan === 'PREMIUM' && 
                          channels.length === 1 && 
                          channels[0] === 'whatsapp';

    try {
      // PREMIUM WhatsApp-only: Use template message (requires pre-approval from Meta)
      if (isWhatsAppOnly && process.env.WHATSAPP_TEMPLATE_ENABLED === 'true') {
        const templateResult = await this.sendWhatsAppTemplateMessage(
          data.parentContact,
          data
        );

        if (templateResult.success) {
          return templateResult;
        }
        
        // Fallback to session message if template fails
        this.logger.warn(`⚠️ Template message failed, trying session message`);
      }

      // PLATINUM or packages with multiple channels: Use session message (no cost)
      const sessionResult = await this.sendWhatsAppSessionMessage(
        data.parentContact,
        message,
        data.advertisementData
      );

      if (sessionResult.success) {
        return sessionResult;
      }

      return { success: false };

    } catch (error: any) {
      this.logger.error(`❌ WhatsApp notification failed: ${error.message}`);
      return { success: false };
    }
  }

  /**
   * Send WhatsApp session message with media preview support (image/video)
   * Session messages are free within 24-hour customer service window
   */
  private async sendWhatsAppSessionMessage(
    phoneNumber: string,
    message: string,
    advertisementData?: AttendanceNotificationData['advertisementData']
  ): Promise<{ success: boolean; deliveryId?: string; error?: string }> {
    try {
      const mediaUrl = advertisementData?.mediaUrl;
      const mediaType = advertisementData?.mediaType?.toLowerCase();
      
      // Determine message type based on media availability
      let messageType = 'text';
      if (mediaUrl && mediaType) {
        if (mediaType === 'image') messageType = 'image';
        else if (mediaType === 'video') messageType = 'video';
        else if (mediaType === 'audio') messageType = 'audio';
        else if (mediaType === 'pdf' || mediaType === 'document') messageType = 'document';
      }

      const whatsappData: any = {
        messaging_product: 'whatsapp',
        to: phoneNumber.replace('+', ''),
        type: messageType
      };

      // Add media with caption if available
      if (messageType === 'image' && mediaUrl) {
        whatsappData.image = {
          link: mediaUrl,
          caption: message
        };
      } else if (messageType === 'video' && mediaUrl) {
        whatsappData.video = {
          link: mediaUrl,
          caption: message
        };
      } else if (messageType === 'audio' && mediaUrl) {
        whatsappData.audio = {
          link: mediaUrl
        };
        // Send text message separately for audio
      } else if (messageType === 'document' && mediaUrl) {
        whatsappData.document = {
          link: mediaUrl,
          caption: message,
          filename: advertisementData?.title || 'document.pdf'
        };
      } else {
        // Plain text message
        whatsappData.text = {
          body: message
        };
      }

      const response = await fetch(
        `https://graph.facebook.com/v18.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(whatsappData)
        }
      );

      const result = await response.json();

      if (response.ok && result.messages) {
        return {
          success: true,
          deliveryId: result.messages[0]?.id
        };
      }

      return {
        success: false,
        error: result.error?.message || 'Session message failed'
      };

    } catch (error) {
      return {
        success: false,
        error: (error as Error).message
      };
    }
  }

  /**
   * Send WhatsApp template message (requires pre-approval from Meta)
   * Template name: suraksha_attendance_with_ad
   * See: docs/WHATSAPP_TEMPLATE_MESSAGE_APPROVAL_REQUEST.md
   */
  private async sendWhatsAppTemplateMessage(
    phoneNumber: string,
    data: AttendanceNotificationData
  ): Promise<{ success: boolean; deliveryId?: string; error?: string }> {
    try {
      const statusIcon = data.attendanceStatus === 'PRESENT' ? '✅' : '❌';
      const statusText = data.attendanceStatus === 'PRESENT' ? 'PRESENT' : 'ABSENT';
      const adUrl = data.advertisementData?.sendingUrl || data.advertisementData?.mediaUrl || '';
      
      const templateData = {
        messaging_product: 'whatsapp',
        to: phoneNumber.replace('+', ''),
        type: 'template',
        template: {
          name: 'suraksha_attendance_with_ad', // Must be pre-approved by Meta
          language: {
            code: 'en'
          },
          components: [
            // Header with media (if available)
            ...(data.advertisementData?.mediaUrl ? [{
              type: 'header',
              parameters: [
                {
                  type: data.advertisementData.mediaType === 'video' ? 'video' : 'image',
                  [data.advertisementData.mediaType === 'video' ? 'video' : 'image']: {
                    link: data.advertisementData.mediaUrl
                  }
                }
              ]
            }] : []),
            
            // Body with all 11 variables
            {
              type: 'body',
              parameters: [
                { type: 'text', text: data.studentName },                          // {{1}}
                { type: 'text', text: data.date },                                 // {{2}}
                { type: 'text', text: data.time },                                 // {{3}}
                { type: 'text', text: `${statusIcon} ${statusText}` },            // {{4}}
                { type: 'text', text: data.location || 'Not specified' },         // {{5}}
                { type: 'text', text: data.instituteName || 'School' },           // {{6}}
                { type: 'text', text: data.bookhireName || 'Transport' },         // {{7}}
                { type: 'text', text: data.advertisementData?.title || '' },      // {{8}}
                { type: 'text', text: data.advertisementData?.content || '' },    // {{9}}
                { type: 'text', text: adUrl },                                     // {{10}}
                { type: 'text', text: data.instituteName || 'School' }            // {{11}}
              ]
            },
            
            // Button (optional - if URL available)
            ...(adUrl ? [{
              type: 'button',
              sub_type: 'url',
              index: '0',
              parameters: [
                {
                  type: 'text',
                  text: adUrl
                }
              ]
            }] : [])
          ]
        }
      };

      const response = await fetch(
        `https://graph.facebook.com/v18.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(templateData)
        }
      );

      const result = await response.json();

      if (response.ok && result.messages) {
        return {
          success: true,
          deliveryId: result.messages[0]?.id
        };
      }

      this.logger.error(`❌ Template message failed: ${result.error?.message}`);
      return {
        success: false,
        error: result.error?.message || 'Template message failed'
      };

    } catch (error: any) {
      this.logger.error(`❌ WhatsApp template error: ${error.message}`);
      return {
        success: false,
        error: (error as Error).message
      };
    }
  }

  /**
   * ⚡ Send email notification ASYNC (FIRE-AND-FORGET - MAXIMUM PERFORMANCE)
   * 
   * Performance Optimization:
   * - OLD: API waited for email service (~500-2000ms response time)
   * - NEW: Returns immediately, email sent in background (~1-5ms)
   * 
   * Benefits:
   * - 100-500x faster API response time
   * - Non-blocking - API doesn't wait for email delivery
   * - Email sent in background with automatic retry
   * - No Redis/Queue dependency - pure Node.js async
   * 
   * Note: Email delivery happens asynchronously. Check logs for success/failure.
   */
  private async sendEmailNotification(
    data: AttendanceNotificationData
  ): Promise<{ success: boolean; deliveryId?: string }> {
    if (!data.parentEmail) {
      this.logger.warn(`[Email] Skipped — no parent email for student=${data.studentId}`);
      return { success: false };
    }

    const templateType = this.determineEmailTemplate(data);
    const templateData = this.buildEmailTemplateData(data);

    this.logger.log(`[Email] Sending template=${templateType} to=${data.parentEmail} student=${data.studentId}`);

    try {
      const result = await this.enhancedEmailService.sendTemplateEmail({
        templateType,
        toEmails: [data.parentEmail],
        templateData,
      });

      if (result.success) {
        this.logger.log(`[Email] Sent successfully to=${data.parentEmail} messageId=${result.messageId}`);
        return { success: true, deliveryId: result.messageId };
      } else {
        this.logger.warn(`[Email] Provider returned failure for student=${data.studentId}: ${result.error}`);
        return { success: false };
      }
    } catch (error: any) {
      this.logger.error(`[Email] Exception for student=${data.studentId}: ${error.message}`);
      return { success: false };
    }
  }

  /**
   * ✅ NEW: Determine correct email template based on subscription and attendance type
   */
  private determineEmailTemplate(data: AttendanceNotificationData): string {
    // Check if it's vehicle/bookhire attendance
    const isVehicleAttendance = !!(data.vehicleNumber && data.bookhireName);
    
    // Check if subscription plan should receive ads
    const shouldShowAds = this.isAdsEnabled(data.subscriptionPlan) && !!data.advertisementData;

    // Return appropriate template
    if (isVehicleAttendance) {
      return shouldShowAds ? 'attendance_bookhire_with_ads' : 'attendance_bookhire_no_ads';
    } else {
      return shouldShowAds ? 'attendance_institute_with_ads' : 'attendance_institute_no_ads';
    }
  }

  /**
   * ✅ NEW: Build template data for email service
   */
  private buildEmailTemplateData(data: AttendanceNotificationData): any {
    // Determine attendance type (auto-detect if not specified)
    const attendanceType = data.attendanceType || (data.bookhireName ? 'TRANSPORT' : 'INSTITUTE');
    const isTransport = attendanceType === 'TRANSPORT';
    
    // Format date and time properly
    const formattedDate = this.formatDate(data.date);
    const formattedTime = this.formatTime(data.time);
    
    // Base template data (common for all templates)
    const templateData: any = {
      parentName: data.parentName || 'Parent/Guardian',
      studentName: data.studentName,
      studentId: data.studentId,
      status: data.attendanceStatus === 'PRESENT' ? 'Present' : 'Absent',
      date: formattedDate,
      time: formattedTime,
      markedBy: 'System Administrator',
      locale: 'en'
    };

    if (isTransport) {
      // TRANSPORT ATTENDANCE - Vehicle/Bookhire specific data
      templateData.bookhireName = data.bookhireName || 'School Transport';
      templateData.vehicleNumber = data.vehicleNumber || 'N/A';
      templateData.driverName = 'Transport Staff';
      
      // Natural language for pickup/dropoff status
      if (data.attendanceStatus === 'PRESENT') {
        templateData.pickupStatus = 'boarded';
        templateData.statusMessage = `Your child ${data.studentName} boarded ${data.bookhireName}${data.vehicleNumber ? ' (' + data.vehicleNumber + ')' : ''} at ${formattedTime} on ${formattedDate}.`;
      } else {
        templateData.pickupStatus = 'did not board';
        templateData.statusMessage = `Your child ${data.studentName} did not board ${data.bookhireName}${data.vehicleNumber ? ' (' + data.vehicleNumber + ')' : ''} at ${formattedTime} on ${formattedDate}.`;
      }
      
      templateData.place = data.location || `${data.bookhireName} - ${data.vehicleNumber || 'Transport'}`;
      
    } else {
      // INSTITUTE ATTENDANCE - School/Class/Subject specific data
      templateData.instituteName = data.instituteName || 'School';
      templateData.className = data.className || '';
      templateData.subjectName = data.subjectName || '';
      templateData.place = data.location || data.instituteName || 'School';
      
      // Build context based on available information (most specific to least specific)
      let contextText = '';
      if (data.subjectName && data.className && data.instituteName) {
        // Subject level: Show Subject (Class) at Institute
        contextText = `${data.subjectName} (${data.className}) at ${data.instituteName}`;
      } else if (data.subjectName && data.className) {
        // Subject + Class without institute
        contextText = `${data.subjectName} (${data.className})`;
      } else if (data.className && data.instituteName) {
        // Class level: Show Class at Institute
        contextText = `${data.className} at ${data.instituteName}`;
      } else if (data.className) {
        // Class only
        contextText = data.className;
      } else if (data.instituteName) {
        // Institute level only
        contextText = data.instituteName;
      }
      
      // Natural language for institute attendance with proper context
      if (data.attendanceStatus === 'PRESENT') {
        templateData.statusMessage = `Your child ${data.studentName} arrived at ${contextText} at ${formattedTime} on ${formattedDate}.`;
      } else {
        templateData.statusMessage = `Your child ${data.studentName} was absent from ${contextText} at ${formattedTime} on ${formattedDate}.`;
      }
    }

    // Add advertisement data (only if ads are enabled for this plan)
    if (data.advertisementData && this.isAdsEnabled(data.subscriptionPlan)) {
      templateData.adTitle = data.advertisementData.title || '';
      templateData.adContent = data.advertisementData.content || '';
      templateData.adImageUrl = data.advertisementData.mediaUrl || '';
      
      // Use sendingUrl if available, otherwise fallback to mediaUrl
      templateData.adLinkUrl = data.advertisementData.sendingUrl?.trim() || data.advertisementData.mediaUrl || '';
      
      // Dynamic button text based on ad type
      templateData.adButtonText = 'Learn More';
      
      // Media type for email rendering
      templateData.adMediaType = data.advertisementData.mediaType || 'image';
      
      // Include supportivePlatforms for tracking/analytics
      if (data.advertisementData.supportivePlatforms) {
        templateData.adSupportedPlatforms = data.advertisementData.supportivePlatforms.join(', ');
      }
    }

    return templateData;
  }

  /**
   * Convert Markdown formatting to HTML for Telegram
   */
  private convertMarkdownToHtml(text: string): string {
    return text
      .replace(/\*([^*]+)\*/g, '<b>$1</b>')  // *bold* to <b>bold</b>
      .replace(/_([^_]+)_/g, '<i>$1</i>');   // _italic_ to <i>italic</i>
  }

  /**
   * Send Telegram notification with enhanced media support
   */
  private async sendTelegramNotification(
    data: AttendanceNotificationData
  ): Promise<{ success: boolean; deliveryId?: string }> {
    if (!data.parentTelegramId) {
      return { success: false };
    }

    try {

      const messageMarkdown = this.buildAttendanceMessage(data, false, 'telegram');
      const message = this.convertMarkdownToHtml(messageMarkdown);
      const botToken = process.env.TELEGRAM_BOT_TOKEN;

      if (!botToken) {
        return { success: false };
      }

      let response;
      
      // Build inline keyboard button ("More Info" button if sendingUrl exists)
      let reply_markup = undefined;
      
      if (data.advertisementData?.sendingUrl?.trim()) {
        reply_markup = {
          inline_keyboard: [[{
            text: '🔗 More Info',
            url: data.advertisementData.sendingUrl.trim()
          }]]
        };
      }

      if (data.advertisementData?.mediaUrl && data.advertisementData?.mediaType) {
        // Enhanced media support based on type
        const mediaType = data.advertisementData.mediaType.toLowerCase();
        
        if (mediaType === 'image' || mediaType.startsWith('image/')) {
          // Send photo
          response = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: data.parentTelegramId,
              photo: data.advertisementData.mediaUrl,
              caption: message,
              parse_mode: 'HTML',
              reply_markup
            })
          });
        } else if (mediaType === 'video' || mediaType.startsWith('video/')) {
          // Send video
          response = await fetch(`https://api.telegram.org/bot${botToken}/sendVideo`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: data.parentTelegramId,
              video: data.advertisementData.mediaUrl,
              caption: message,
              parse_mode: 'HTML',
              reply_markup
            })
          });
        } else if (mediaType === 'audio' || mediaType.startsWith('audio/')) {
          // Send audio
          response = await fetch(`https://api.telegram.org/bot${botToken}/sendAudio`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: data.parentTelegramId,
              audio: data.advertisementData.mediaUrl,
              caption: message,
              parse_mode: 'HTML',
              reply_markup
            })
          });
        } else if (mediaType === 'document' || mediaType.startsWith('application/')) {
          // Send document (PDF, etc.)
          response = await fetch(`https://api.telegram.org/bot${botToken}/sendDocument`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: data.parentTelegramId,
              document: data.advertisementData.mediaUrl,
              caption: message,
              parse_mode: 'HTML',
              reply_markup
            })
          });
        } else {
          // Fallback: send as text with media link
          response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: data.parentTelegramId,
              text: `${message}\n\n📎 Media: ${data.advertisementData.mediaUrl}`,
              parse_mode: 'HTML',
              reply_markup
            })
          });
        }
      } else {
        // Send text message only
        response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: data.parentTelegramId,
            text: message,
            parse_mode: 'HTML',
            reply_markup
          })
        });
      }

      const result = await response.json();

      if (result.ok) {
        return {
          success: true,
          deliveryId: result.result.message_id.toString()
        };
      }

      return { success: false };

    } catch (error) {
      return { success: false };
    }
  }

  /**
   * Send SMS notification via configured SMS provider (SMSlenz/Dialog eSMS)
   */
  private normalizeSriLankaPhone(raw: string): string {
    const trimmed = raw.trim().replace(/\s+/g, '');
    // Already correct international format
    if (/^\+947[0-9]{8}$/.test(trimmed)) return trimmed;
    // Local 10-digit format: 07XXXXXXXX → +947XXXXXXXX
    if (/^07[0-9]{8}$/.test(trimmed)) return `+94${trimmed.slice(1)}`;
    // 9-digit without leading 0: 7XXXXXXXX → +947XXXXXXXX
    if (/^7[0-9]{8}$/.test(trimmed)) return `+94${trimmed}`;
    // Country code without +: 947XXXXXXXX → +947XXXXXXXX
    if (/^947[0-9]{8}$/.test(trimmed)) return `+${trimmed}`;
    return trimmed;
  }

  private async sendSMSNotification(
    data: AttendanceNotificationData
  ): Promise<{ success: boolean; deliveryId?: string }> {
    try {
      if (!data.parentContact) {
        this.logger.warn(`[SMS] Skipped — no parent contact for student=${data.studentId}`);
        return { success: false, deliveryId: undefined };
      }

      const normalized = this.normalizeSriLankaPhone(data.parentContact);
      const sriLankaPattern = /^\+947[0-9]{8}$/;
      if (!sriLankaPattern.test(normalized)) {
        this.logger.warn(`[SMS] Skipped — invalid number: raw=${data.parentContact} normalized=${normalized} (expected +947XXXXXXXX)`);
        return { success: false };
      }
      if (normalized !== data.parentContact) {
        this.logger.log(`[SMS] Normalized phone: ${data.parentContact} → ${normalized}`);
      }

      const userId = this.configService.get<string>('SMSLENZ_USER_ID');
      const apiKey = this.configService.get<string>('SMSLENZ_API_KEY');
      const senderId = this.configService.get<string>('SMSLENZ_SENDER_ID') ||
                       this.configService.get<string>('SMSLENZ_DEFAULT_SENDER_ID') ||
                       'SMSlenzDEMO';

      if (!userId || !apiKey) {
        this.logger.warn(`[SMS] Skipped — SMSLENZ_USER_ID or SMSLENZ_API_KEY not set`);
        return { success: false, deliveryId: undefined };
      }

      this.logger.log(`[SMS] Sending to ${normalized} via sender=${senderId} for student=${data.studentId}`);
      const message = this.buildAttendanceMessage(data, true, 'sms');

      const result = await this.smsProviderService.sendSingleSms(
        userId,
        apiKey,
        senderId,
        normalized,
        message
      );

      this.logger.debug(`[SMS] Provider response: ${JSON.stringify(result)}`);

      if (result.success === true || result.data?.status === 'success') {
        this.logger.log(`[SMS] Sent successfully to ${normalized} campaignId=${result.data?.campaign_id}`);
        return {
          success: true,
          deliveryId: result.data.campaign_id?.toString()
        };
      } else {
        this.logger.warn(`[SMS] Provider returned failure: ${JSON.stringify(result.data)}`);
        return { success: false };
      }

    } catch (error) {
      this.logger.error(`[SMS] Exception for student=${data.studentId}: ${error.message}`, error.stack);
      return { success: false };
    }
  }

  /**
   * 📱 Send Push Notification via Firebase Cloud Messaging (FCM)
   * 
   * Features:
   * - Sends rich push notifications with images (if advertisement has image)
   * - Supports both with-ads and no-ads modes
   * - Uses parent's userId to find their FCM tokens
   * - Includes deep link/action URL for ad click-through
   */
  private async sendPushNotification(
    data: AttendanceNotificationData
  ): Promise<{ success: boolean; deliveryId?: string }> {
    try {
      if (!data.parentUserId) {
        this.logger.warn(`[Push] Skipped — no parentUserId for student=${data.studentId} (student has no linked parent account)`);
        return { success: false };
      }

      if (!this.fcmNotificationService.isReady()) {
        this.logger.warn(`[Push] Skipped — FCM not initialized (check FIREBASE_PROJECT_ID, FIREBASE_PRIVATE_KEY, FIREBASE_CLIENT_EMAIL env vars)`);
        return { success: false };
      }

      this.logger.log(`[Push] Sending to parentUserId=${data.parentUserId} student=${data.studentId}`);

      const pushContent = this.buildPushNotificationContent(data);

      const result = await this.fcmNotificationService.sendToUser(
        data.parentUserId,
        {
          title: pushContent.title,
          body: pushContent.body,
          imageUrl: pushContent.imageUrl,
          icon: 'ic_notification',
        },
        pushContent.data,
        {
          priority: 'high',
          timeToLive: 86400,
          collapseKey: `attendance_${data.studentId}`,
        }
      );

      this.logger.log(`[Push] Result for parentUserId=${data.parentUserId}: success=${result.successCount} failure=${result.failureCount} invalidTokens=${result.invalidTokens.length}`);

      if (result.successCount > 0) {
        try {
          await this.recordAttendancePushNotification(data, pushContent);
        } catch (recErr) {
          this.logger.warn(`[Push] Record failed: ${(recErr as Error).message}`);
        }
        return { success: true, deliveryId: `push_${Date.now()}_${data.parentUserId}` };
      } else {
        if (result.failureCount > 0) {
          this.logger.warn(`[Push] All ${result.failureCount} tokens failed — parent may not have app installed or notifications disabled`);
        } else {
          this.logger.warn(`[Push] No FCM tokens registered for parentUserId=${data.parentUserId} — parent has not logged in to the app`);
        }
        return { success: false };
      }

    } catch (error) {
      this.logger.error(`[Push] Exception for student=${data.studentId}: ${(error as Error).message}`);
      return { success: false };
    }
  }

  /**
   * Build push notification content with ad support
   */
  private buildPushNotificationContent(data: AttendanceNotificationData): {
    title: string;
    body: string;
    imageUrl?: string;
    data: Record<string, string>;
  } {
    const statusIcon = data.attendanceStatus === 'PRESENT' ? '✅' : '❌';
    const statusText = data.attendanceStatus === 'PRESENT' ? 'Present' : 'Absent';
    
    // Format date and time
    const formattedDate = this.formatDate(data.date);
    const formattedTime = this.formatTime(data.time);
    
    // Determine attendance type
    const attendanceType = data.attendanceType || (data.bookhireName ? 'TRANSPORT' : 'INSTITUTE');
    
    let title = '';
    let body = '';
    
    if (attendanceType === 'TRANSPORT') {
      // Transport attendance
      title = `${statusIcon} Transport Attendance`;
      if (data.attendanceStatus === 'PRESENT') {
        body = `${data.studentName} boarded ${data.bookhireName || 'transport'}${data.vehicleNumber ? ' (' + data.vehicleNumber + ')' : ''} at ${formattedTime}`;
      } else {
        body = `${data.studentName} did not board ${data.bookhireName || 'transport'}${data.vehicleNumber ? ' (' + data.vehicleNumber + ')' : ''} at ${formattedTime}`;
      }
    } else {
      // Institute attendance
      title = `${statusIcon} Attendance Update`;
      
      // Build context based on available information
      let context = '';
      if (data.subjectName && data.className) {
        context = `${data.subjectName} (${data.className})`;
      } else if (data.className) {
        context = data.className;
      } else if (data.instituteName) {
        context = data.instituteName;
      }
      
      if (data.attendanceStatus === 'PRESENT') {
        body = `${data.studentName} arrived at ${context} at ${formattedTime}`;
      } else {
        body = `${data.studentName} was absent from ${context} at ${formattedTime}`;
      }
    }
    
    // Build data payload
    const dataPayload: Record<string, string> = {
      type: 'attendance',
      studentId: data.studentId,
      studentName: data.studentName,
      status: data.attendanceStatus,
      date: data.date,
      time: data.time,
      attendanceType: attendanceType,
    };

    // Add optional fields
    if (data.instituteName) dataPayload.instituteName = data.instituteName;
    if (data.className) dataPayload.className = data.className;
    if (data.subjectName) dataPayload.subjectName = data.subjectName;
    if (data.bookhireName) dataPayload.bookhireName = data.bookhireName;
    if (data.vehicleNumber) dataPayload.vehicleNumber = data.vehicleNumber;

    // Always include a navigation URL so tapping the notification opens the right screen.
    // Prefer a specific record deep-link; fall back to the notifications inbox.
    const webBase = process.env.WEB_APP_URL || 'https://lms.suraksha.lk';
    const mobileScheme = process.env.MOBILE_APP_SCHEME || 'suraksha';
    if (data.attendanceId) {
      dataPayload.attendanceId = data.attendanceId;
      dataPayload.actionUrl = `${webBase}/attendance/view?id=${data.attendanceId}`;
      dataPayload.deepLink   = `${mobileScheme}://attendance/view?id=${data.attendanceId}`;
    } else {
      // Bulk or card attendance without a specific record ID — open the parent’s
      // notification inbox which lists all recent attendance updates.
      dataPayload.actionUrl = `${webBase}/notifications`;
      dataPayload.deepLink  = `${mobileScheme}://notifications`;
    }

    // Add advertisement data if available and ads are enabled
    let imageUrl: string | undefined;
    
    if (data.advertisementData && this.isAdsEnabled(data.subscriptionPlan)) {
      // Check if push is supported for this ad (modeOfSending takes priority over supportivePlatforms)
      const sendingModes = data.advertisementData.modeOfSending && data.advertisementData.modeOfSending.length > 0
        ? data.advertisementData.modeOfSending
        : (data.advertisementData.supportivePlatforms || []);
      const isPushSupported = sendingModes.length === 0 || 
                              sendingModes.includes('mobile-push') ||
                              sendingModes.includes('push-mobile') ||
                              sendingModes.includes('push');
      
      if (isPushSupported) {
        // Use ad image for rich notification
        if (data.advertisementData.mediaUrl && 
            (data.advertisementData.mediaType === 'image' || data.advertisementData.mediaType?.startsWith('image/'))) {
          imageUrl = data.advertisementData.mediaUrl;
        }
        
        // Add ad data for tracking — store the ad landing URL separately so it
        // can be shown on the attendance view page without overriding the deep-link
        // that navigates the parent to their child's attendance record.
        dataPayload.adId = data.advertisementData.id;
        if (data.advertisementData.title) dataPayload.adTitle = data.advertisementData.title;
        if (data.advertisementData.sendingUrl) dataPayload.adLandingUrl = data.advertisementData.sendingUrl;
        if (data.advertisementData.mediaUrl) dataPayload.adMediaUrl = data.advertisementData.mediaUrl;
        
        // Optionally append ad info to body (brief)
        if (data.advertisementData.title) {
          body += ` | ${data.advertisementData.title}`;
        }
      }
    }
    
    return {
      title,
      body,
      imageUrl,
      data: dataPayload,
    };
  }

  /**
   * Format date to user-friendly format
   * Converts ISO date (2025-12-20T20:29:25.139Z) to readable format (December 20, 2025)
   */
  private formatDate(dateInput: string): string {
    try {
      const date = new Date(dateInput);
      
      // Check if valid date
      if (isNaN(date.getTime())) {
        return dateInput; // Return original if can't parse
      }
      
      return date.toLocaleDateString('en-US', {
        timeZone: 'UTC', // Time values are stored as Sri Lanka time in UTC slots — read without offset
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch (error) {
      return dateInput; // Return original if error
    }
  }

  /**
   * Format time to user-friendly format
   * Converts ISO date or time string to readable format (1:59 PM)
   */
  private formatTime(timeInput: string): string {
    try {
      // Try parsing as date first (handles ISO strings)
      const date = new Date(timeInput);
      
      // Check if valid date
      if (!isNaN(date.getTime())) {
        return date.toLocaleTimeString('en-US', {
          timeZone: 'UTC', // Time values are stored as Sri Lanka time in UTC slots — read without offset
          hour: 'numeric',
          minute: '2-digit',
          hour12: true
        });
      }
      
      // If not a valid date, return as-is
      return timeInput;
    } catch (error) {
      return timeInput; // Return original if error
    }
  }

  /**
   * Build attendance message content
   * @param data - Attendance notification data
   * @param smsVersion - If true, returns SMS format
   * @param platform - Platform type: 'whatsapp', 'telegram', or 'sms'
   */
  private buildAttendanceMessage(data: AttendanceNotificationData, smsVersion = false, platform: 'whatsapp' | 'telegram' | 'sms' = 'whatsapp'): string {
    const statusIcon = data.attendanceStatus === 'PRESENT' ? '✅' : '❌';
    const statusText = data.attendanceStatus === 'PRESENT' ? 'Present' : 'Absent';
    const vehicle = data.vehicleNumber ? ` (${data.vehicleNumber})` : '';
    
    // Format date and time properly
    const formattedDate = this.formatDate(data.date);
    const formattedTime = this.formatTime(data.time);
    
    if (smsVersion) {
      // Plain SMS format - Natural conversational style
      let sms = ``;
      
      // Add advertisement content FIRST if available and has content (keep it brief for SMS)
      if (data.advertisementData && (data.advertisementData.title?.trim() || data.advertisementData.content?.trim())) {
        if (data.advertisementData.title?.trim()) {
          sms += `${data.advertisementData.title.trim()}\n\n`;
        }
        
        if (data.advertisementData.content?.trim()) {
          sms += `${data.advertisementData.content.trim()}\n`;
        }
        
        // Add sendingUrl as 'More info:' link if available
        if (data.advertisementData.sendingUrl?.trim()) {
          sms += `\nMore info: ${data.advertisementData.sendingUrl.trim()}\n`;
        }
        sms += `\n---\n\n`;
      }
      
      // Natural conversational message based on attendance type
      
      // Determine attendance type (auto-detect if not specified)
      const attendanceType = data.attendanceType || (data.bookhireName ? 'TRANSPORT' : 'INSTITUTE');
      
      if (attendanceType === 'TRANSPORT') {
        // Transport attendance
        if (data.attendanceStatus === 'PRESENT') {
          sms += `Your child ${data.studentName} boarded ${data.bookhireName}${vehicle} at ${formattedTime} on ${formattedDate}.`;
        } else {
          sms += `Your child ${data.studentName} did not board ${data.bookhireName}${vehicle} at ${formattedTime} on ${formattedDate}.`;
        }
        
      } else {
        // Institute attendance - show appropriate level of detail
        if (data.attendanceStatus === 'PRESENT') {
          sms += `Your child ${data.studentName} arrived at`;
        } else {
          sms += `Your child ${data.studentName} was absent from`;
        }
        
        // Build context based on available information (most specific to least specific)
        if (data.subjectName && data.className && data.instituteName) {
          // Subject level: Show Subject (Class) at Institute
          sms += ` ${data.subjectName} (${data.className}) at ${data.instituteName}`;
        } else if (data.subjectName && data.className) {
          // Subject + Class without institute
          sms += ` ${data.subjectName} (${data.className})`;
        } else if (data.className && data.instituteName) {
          // Class level: Show Class at Institute
          sms += ` ${data.className} at ${data.instituteName}`;
        } else if (data.className) {
          // Class only
          sms += ` ${data.className}`;
        } else if (data.instituteName) {
          // Institute level only
          sms += ` ${data.instituteName}`;
        }
        
        sms += ` at ${formattedTime} on ${formattedDate}.`;
      }
      
      // Footer with branding and contact info
      sms += `\n\n---\n`;
      sms += `Suraksha LMS`;
      if (data.instituteName) {
        sms += ` | ${data.instituteName}`;
      }

      // 📥 APP DOWNLOAD CTA: Parent hasn't installed the app yet — invite them
      if (!data.firstLoginCompleted) {
        const downloadUrl = process.env.APP_DOWNLOAD_URL || 'https://play.google.com/store/apps/details?id=lk.suraksha.lms';
        sms += `\n\nGet real-time updates, attendance history & more - Download the Suraksha LMS app:\n${downloadUrl}`;
      }

      return sms;
    }

    // WhatsApp/Telegram format (natural, conversational)
    let message = ``;
    
    // Advertisement section FIRST (if available and has content)
    if (data.advertisementData && (data.advertisementData.title?.trim() || data.advertisementData.content?.trim())) {
      if (data.advertisementData.title?.trim()) {
        message += `${data.advertisementData.title.trim()}\n\n`;
      }
      
      if (data.advertisementData.content?.trim()) {
        message += `${data.advertisementData.content.trim()}\n`;
      }
      
      // Add sendingUrl as clickable link for WhatsApp/Telegram if available
      if (data.advertisementData.sendingUrl?.trim()) {
        if (platform === 'telegram') {
          // Telegram supports inline buttons (handled separately in sendTelegramNotification)
          // Just add text link as fallback
          message += `\n🔗 More Info: ${data.advertisementData.sendingUrl.trim()}\n`;
        } else {
          // WhatsApp - add as clickable link
          message += `\n🔗 More Info: ${data.advertisementData.sendingUrl.trim()}\n`;
        }
      }
      
      message += `\n━━━━━━━━━━━━━━━━━━━━\n\n`;
    }
    
    // Natural conversational attendance message based on type
    
    // Determine attendance type (auto-detect if not specified)
    const attendanceType = data.attendanceType || (data.bookhireName ? 'TRANSPORT' : 'INSTITUTE');
    
    if (attendanceType === 'TRANSPORT') {
      // Transport attendance: getting on/off bus/van
      if (data.attendanceStatus === 'PRESENT') {
        message += `Your child *${data.studentName}* boarded ${data.bookhireName}${vehicle} at ${formattedTime} on ${formattedDate}.`;
      } else {
        message += `Your child *${data.studentName}* did not board ${data.bookhireName}${vehicle} at ${formattedTime} on ${formattedDate}.`;
      }
      
    } else {
      // Institute attendance - show appropriate level of detail
      if (data.attendanceStatus === 'PRESENT') {
        message += `Your child *${data.studentName}* arrived at`;
      } else {
        message += `Your child *${data.studentName}* was absent from`;
      }
      
      // Build context based on available information (most specific to least specific)
      if (data.subjectName && data.className && data.instituteName) {
        // Subject level: Show Subject (Class) at Institute
        message += ` *${data.subjectName}* (${data.className}) at ${data.instituteName}`;
      } else if (data.subjectName && data.className) {
        // Subject + Class without institute
        message += ` *${data.subjectName}* (${data.className})`;
      } else if (data.className && data.instituteName) {
        // Class level: Show Class at Institute
        message += ` *${data.className}* at ${data.instituteName}`;
      } else if (data.className) {
        // Class only
        message += ` *${data.className}*`;
      } else if (data.instituteName) {
        // Institute level only
        message += ` ${data.instituteName}`;
      }
      
      message += ` at ${formattedTime} on ${formattedDate}.`;
    }

    // Add footer only for WhatsApp
    if (platform === 'whatsapp') {
      message += `\n\n━━━━━━━━━━━━━━━━━━━━\n`;
      message += `\n_If you require further updates within the next 24 hours, please reply or react to this message._`;
    }

    return message;
  }

    // ─────────────────────────────────────────────────────────────────────────────
  // NOTIFICATION INBOX RECORDING
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * After a successful attendance FCM push, persist a push_notifications row and
   * a notification_recipients row so the parent sees this notification in the
   * in-app notification inbox (same as institute announcements).
   */
  private async recordAttendancePushNotification(
    data: AttendanceNotificationData,
    pushContent: { title: string; body: string; imageUrl?: string; data: Record<string, string> },
  ): Promise<void> {
    const ts = new Date();
    const scope = data.instituteId ? 'INSTITUTE' : 'GLOBAL';

    // 1. Insert a push_notifications row
    const insertResult = await this.dataSource.query(
      `INSERT INTO push_notifications
         (title, body, image_url, scope, target_user_types, institute_id,
          priority, status, sender_role, total_recipients, sent_count, failed_count,
          read_count, created_at, updated_at, sent_at)
       VALUES (?, ?, ?, ?, ?, ?, 'HIGH', 'SENT', 'SYSTEM', 1, 1, 0, 0, ?, ?, ?)`,
      [
        pushContent.title,
        pushContent.body,
        pushContent.imageUrl ?? null,
        scope,
        JSON.stringify(['PARENTS']),
        data.instituteId ?? null,
        ts,
        ts,
        ts,
      ],
    );

    const notificationId: string = String(insertResult.insertId);

    // 2. Insert a recipient row for the parent
    await this.dataSource.query(
      `INSERT IGNORE INTO notification_recipients
         (notification_id, user_id, status, created_at, updated_at)
       VALUES (?, ?, 'SENT', ?, ?)`,
      [notificationId, data.parentUserId, ts, ts],
    );

    this.logger.debug(`📬 Attendance push recorded: notification #${notificationId} → parent ${data.parentUserId}`);
  }
}




