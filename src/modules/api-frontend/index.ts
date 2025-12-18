// Main module
export { ApiFrontendModule } from './api-frontend.module';

// Services
export { ApiSecurityService, SecurityValidationResult } from './services/api-security.service';

// Guards
export { ApiFrontendGuard, Public, RequirePermissions, SecureRequest } from './guards/api-frontend.guard';

// Interceptors
export { SecurityMonitoringInterceptor } from './interceptors/security-monitoring.interceptor';

// Middleware
export { RequestFilterMiddleware } from './middleware/request-filter.middleware';

// DTOs
export { SecurityContextDto, ApiHealthDto, SecurityIncidentDto } from './dto/security.dto';

// Types and Interfaces
export interface ApiSecurityConfig {
  maxRequestSize?: number;
  allowedFileTypes?: string[];
  rateLimitWindow?: number;
  rateLimitMax?: number;
  blockedIPs?: string[];
  publicEndpoints?: string[];
}

export interface RequestSecurityContext {
  clientIP: string;
  userAgent: string;
  requestTime: Date;
  contentLength: number;
  securityFlags?: {
    suspicious: boolean;
    blocked: boolean;
    rateLimited: boolean;
  };
}
