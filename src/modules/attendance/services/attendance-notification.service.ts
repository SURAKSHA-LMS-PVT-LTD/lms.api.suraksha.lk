import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SmsProviderService } from '../../sms/services/sms-provider.service';
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
  attendanceStatus: 'PRESENT' | 'ABSENT';
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
  advertisementData?: {
    id: string;
    mediaUrl: string;
    mediaType: string;
    title: string;
    content: string;
    sendingUrl?: string;
    supportivePlatforms?: string[];
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
  ) {}

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
    const envChannels: Record<string, string | undefined> = {
      'whatsapp': process.env.WHATSAPP_ACCESS_TOKEN,
      'telegram': process.env.TELEGRAM_BOT_TOKEN,
      'email': process.env.EMAIL_SERVER_URL
    };
    
    // SMS is always available
    if (channel === 'sms') return true;
    
    // Check if environment variable is configured
    return !!envChannels[channel];
  }

  /**
   * Send attendance notification based on subscription package
   */
  async sendAttendanceNotification(data: AttendanceNotificationData): Promise<NotificationSummary> {
    const startTime = Date.now();
    this.logger.log(`📝 Attendance marked: ${data.studentName}`);

    // Get package configuration (with environment filtering)
    let channels = this.getNotificationChannels(data.subscriptionPlan);
    const retryConfig = this.getRetryConfig(data.subscriptionPlan);
    const isAdsEnabled = this.isAdsEnabled(data.subscriptionPlan);

    // 🎯 PLATFORM-SPECIFIC FILTERING: If advertisement has supportivePlatforms, filter channels
    if (isAdsEnabled && data.advertisementData?.supportivePlatforms && data.advertisementData.supportivePlatforms.length > 0) {
      const supportedPlatforms = data.advertisementData.supportivePlatforms;
      const originalChannels = [...channels];
      
      // Filter channels to only those supported by the advertisement
      channels = channels.filter(channel => {
        // Map channel names to platform enum values
        const platformMap: Record<string, string> = {
          'sms': 'sms',
          'whatsapp': 'whatsapp',
          'telegram': 'telegram',
          'email': 'email',
          'push': 'mobile-push' // Mobile push notifications
        };
        
        const platformName = platformMap[channel] || channel;
        return supportedPlatforms.includes(platformName);
      });
      
      if (channels.length < originalChannels.length) {
        this.logger.log(`🎯 Platform filtering: ${originalChannels.length} → ${channels.length} channels (Ad supports: ${supportedPlatforms.join(', ')})`);
      }
    }

    // Log ad selection
    if (isAdsEnabled && data.advertisementData) {
      this.logger.log(`📢 Selected ad: ${data.advertisementData.id}`);
    } else if (isAdsEnabled) {
      this.logger.log(`⏭️ Skip ads: No advertisement available`);
    } else {
      this.logger.log(`⏭️ Skip ads: isAds=false`);
    }

    if (channels.length === 0) {
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
    this.logger.log(`✅ Sent ${successCount}/${channels.length} notifications (${duration}ms)`);

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
    // Check if channel is available in current environment
    if (!this.isChannelAvailable(channel)) {
      this.logger.log(`⏭️ ${channel} skip: Not configured`);
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
          default:
            throw new Error(`Unsupported channel: ${channel}`);
        }

        if (success) {
          this.logger.log(`✅ Sent ${channel}`);
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
      this.logger.log(`⏭️ WhatsApp skip: No parent contact`);
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
        this.logger.log(`📋 Using WhatsApp template message (PREMIUM WhatsApp-only)`);
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
      this.logger.log(`💬 Using WhatsApp session message (${subscriptionPlan})`);
      const sessionResult = await this.sendWhatsAppSessionMessage(
        data.parentContact,
        message,
        data.advertisementData
      );

      if (sessionResult.success) {
        return sessionResult;
      }

      return { success: false };

    } catch (error) {
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
        this.logger.log(`✅ WhatsApp session message sent (${messageType})`);
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
        this.logger.log(`✅ WhatsApp template message sent`);
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

    } catch (error) {
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
    try {
      if (!data.parentEmail) {
        throw new Error('Parent email not available');
      }

      // ✅ Determine correct template based on subscription plan and attendance type
      const templateType = this.determineEmailTemplate(data);
      const templateData = this.buildEmailTemplateData(data);
      
      // ⚡ FIRE-AND-FORGET: Send email in background without waiting
      this.sendEmailInBackground(
        templateType,
        [data.parentEmail],
        templateData,
        data.studentId
      ).catch(() => {});

      // Return immediately - don't wait for email service
      return {
        success: true,
        deliveryId: `email_${Date.now()}_${data.studentId}`
      };

    } catch (error) {
      return { success: false };
    }
  }

  /**
   * 🔥 TRUE FIRE-AND-FORGET: Send email in background with NO retries
   * For performance - just send once and move on
   */
  private async sendEmailInBackground(
    templateType: string,
    toEmails: string[],
    templateData: any,
    studentId: string
  ): Promise<void> {
    const startTime = Date.now();
    
    try {
      const emailServerUrl = process.env.EMAIL_SERVER_URL || process.env.EMAIL_API_URL;
      const authToken = process.env.EMAIL_SERVER_AUTH_TOKEN || process.env.AWS_LAMBDA_API_KEY;
      
      if (!emailServerUrl) {
        return;
      }
      
      const response = await fetch(emailServerUrl, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken || ''}`
        },
        body: JSON.stringify({
          operation: 'send_template_email',
          template_type: templateType,
          to_emails: toEmails,
          template_data: templateData
        })
      });

      const result = await response.json();

      // Check multiple success indicators from Lambda response
      const isSuccess = response.ok && (
        result.message?.includes('successfully') || 
        result.status === 'success' ||
        result.messageId
      );

      // Silent success/failure for performance
    } catch (error) {
      // Silent failure for performance
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
      this.logger.log(`⏭️ Telegram skip: User hasn't Telegram ID`);
      return { success: false };
    }

    try {

      const messageMarkdown = this.buildAttendanceMessage(data, false, 'telegram');
      const message = this.convertMarkdownToHtml(messageMarkdown);
      const botToken = process.env.TELEGRAM_BOT_TOKEN;

      if (!botToken) {
        this.logger.log(`⏭️ Telegram skip: Not configured`);
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
  private async sendSMSNotification(
    data: AttendanceNotificationData
  ): Promise<{ success: boolean; deliveryId?: string }> {
    try {
      // Check if parent contact is available
      if (!data.parentContact) {
        this.logger.log(`⏭️ SMS skip: No parent contact`);
        return { success: false, deliveryId: undefined };
      }

      // Get SMS credentials from environment
      const userId = this.configService.get<string>('SMSLENZ_USER_ID');
      const apiKey = this.configService.get<string>('SMSLENZ_API_KEY');
      const senderId = this.configService.get<string>('SMSLENZ_SENDER_ID') || 
                       this.configService.get<string>('SMSLENZ_DEFAULT_SENDER_ID') || 
                       'SMSlenzDEMO';

      // Check if SMS is configured
      if (!userId || !apiKey) {
        this.logger.log(`⏭️ SMS skip: Not configured`);
        return { success: false, deliveryId: undefined };
      }

      // Build message content (SMS version - shorter)
      const message = this.buildAttendanceMessage(data, true, 'sms');

      // Send SMS via provider
      const result = await this.smsProviderService.sendSingleSms(
        userId,
        apiKey,
        senderId,
        data.parentContact,
        message
      );

      // Check if SMS was sent successfully
      if (result.success === true || result.data?.status === 'success') {
        return {
          success: true,
          deliveryId: result.data.campaign_id?.toString()
        };
      } else {
        return { success: false };
      }

    } catch (error) {
      return { success: false };
    }
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


}




