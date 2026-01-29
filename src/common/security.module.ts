import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { getCurrentSriLankaISO } from '../common/utils/timezone.util';
import { SecurityMonitoringService } from '../common/services/security-monitoring.service';
import { EncryptionService } from '../common/services/encryption.service';
import { AdvancedSecurityGuard } from '../common/guards/advanced-security.guard';
import { CSRFProtectionMiddleware } from '../common/middleware/csrf-protection.middleware';
import { SecurityHeadersMiddleware } from '../common/middleware/security-headers.middleware';
import { SecurityInterceptor } from '../common/interceptors/security.interceptor';

/**
 * 🛡️ GLOBAL SECURITY MODULE
 * Provides all security services and guards globally
 */
@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    SecurityMonitoringService,
    EncryptionService,
    AdvancedSecurityGuard,
    CSRFProtectionMiddleware,
    SecurityHeadersMiddleware,
    SecurityInterceptor,
  ],
  exports: [
    SecurityMonitoringService,
    EncryptionService,
    AdvancedSecurityGuard,
    CSRFProtectionMiddleware,
    SecurityHeadersMiddleware,
    SecurityInterceptor,
  ],
})
export class SecurityModule {
  constructor(private securityMonitoring: SecurityMonitoringService) {
    // Start security monitoring
    console.log('🛡️ Security Module initialized - Advanced protection enabled');
    
    // Log security startup
    this.securityMonitoring.recordSecurityEvent({
      type: 'SYSTEM_START',
      ip: 'system',
      description: 'Security system initialized successfully',
      severity: 'LOW',
      metadata: {
        timestamp: getCurrentSriLankaISO(),
        version: '2.0.0'
      }
    });
  }
}
