import * as crypto from 'crypto';
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { getCurrentSriLankaTime } from '../utils/timezone.util';

/**
 * ðŸ” SECURITY MONITORING SERVICE
 * Tracks and analyzes security events in real-time
 */
@Injectable()
export class SecurityMonitoringService implements OnModuleDestroy {
  private readonly logger = new Logger(SecurityMonitoringService.name);
  private readonly securityEvents = new Map<string, SecurityEvent[]>();
  private readonly MAX_IPS = 10000;
  private readonly MAX_EVENTS_PER_IP = 100;
  private readonly alertThresholds = {
    failedLogins: 5,
    suspiciousRequests: 10,
    rateLimitHits: 20,
    timeWindow: 15 * 60 * 1000, // 15 minutes
  };
  private cleanupInterval: ReturnType<typeof setInterval>;

  constructor(private configService: ConfigService) {
    // Start cleanup interval
    this.cleanupInterval = setInterval(() => this.cleanupOldEvents(), 5 * 60 * 1000); // Every 5 minutes
  }

  onModuleDestroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }

  /**
   * ðŸš¨ Record a security event
   */
  recordSecurityEvent(event: SecurityEventData): void {
    const securityEvent: SecurityEvent = {
      ...event,
      timestamp: Date.now(),
      id: this.generateEventId(),
    };

    // Store event (bounded)
    const ipEvents = this.securityEvents.get(event.ip) || [];
    ipEvents.push(securityEvent);
    // Cap per-IP events to prevent memory growth
    if (ipEvents.length > this.MAX_EVENTS_PER_IP) {
      ipEvents.splice(0, ipEvents.length - this.MAX_EVENTS_PER_IP);
    }
    this.securityEvents.set(event.ip, ipEvents);

    // Evict oldest IPs if total exceeds limit
    if (this.securityEvents.size > this.MAX_IPS) {
      const firstKey = this.securityEvents.keys().next().value;
      if (firstKey !== undefined) {
        this.securityEvents.delete(firstKey);
      }
    }

    // Log event
    this.logSecurityEvent(securityEvent);

    // Check for alert conditions
    this.checkAlertConditions(event.ip, securityEvent);

    // Send to external monitoring if configured
    this.sendToExternalMonitoring(securityEvent);
  }

  /**
   * ðŸ” Analyze security patterns for an IP
   */
  analyzeSecurityPatterns(ip: string): SecurityAnalysis {
    const events = this.securityEvents.get(ip) || [];
    const now = Date.now();
    const recentEvents = events.filter(e => now - e.timestamp < this.alertThresholds.timeWindow);

    const analysis: SecurityAnalysis = {
      ip,
      totalEvents: recentEvents.length,
      eventTypes: {},
      riskScore: 0,
      recommendations: [],
      timeWindow: this.alertThresholds.timeWindow,
    };

    // Count event types
    recentEvents.forEach(event => {
      analysis.eventTypes[event.type] = (analysis.eventTypes[event.type] || 0) + 1;
    });

    // Calculate risk score
    analysis.riskScore = this.calculateRiskScore(recentEvents);

    // Generate recommendations
    analysis.recommendations = this.generateRecommendations(analysis);

    return analysis;
  }

  /**
   * ðŸŽ¯ Get security metrics
   */
  getSecurityMetrics(): SecurityMetrics {
    const now = Date.now();
    const allEvents = Array.from(this.securityEvents.values()).flat();
    const recentEvents = allEvents.filter(e => now - e.timestamp < this.alertThresholds.timeWindow);

    const metrics: SecurityMetrics = {
      totalEvents: recentEvents.length,
      uniqueIPs: this.securityEvents.size,
      eventTypes: {},
      topThreats: [],
      alertsTriggered: 0,
      timestamp: now,
    };

    // Count event types
    recentEvents.forEach(event => {
      metrics.eventTypes[event.type] = (metrics.eventTypes[event.type] || 0) + 1;
    });

    // Get top threats
    const ipRisks = Array.from(this.securityEvents.keys()).map(ip => ({
      ip,
      riskScore: this.analyzeSecurityPatterns(ip).riskScore,
      eventCount: this.securityEvents.get(ip)?.filter(e => now - e.timestamp < this.alertThresholds.timeWindow).length || 0,
    }));

    metrics.topThreats = ipRisks
      .sort((a, b) => b.riskScore - a.riskScore)
      .slice(0, 10);

    return metrics;
  }

  /**
   * ðŸ“Š Export security report
   */
  exportSecurityReport(): SecurityReport {
    const metrics = this.getSecurityMetrics();
    const now = getCurrentSriLankaTime();

    return {
      generatedAt: now.toISOString(),
      period: `${Math.floor(this.alertThresholds.timeWindow / (60 * 1000))} minutes`,
      summary: {
        totalSecurityEvents: metrics.totalEvents,
        uniqueIPsMonitored: metrics.uniqueIPs,
        highRiskIPs: metrics.topThreats.filter(t => t.riskScore > 70).length,
        mostCommonThreat: this.getMostCommonThreat(metrics.eventTypes),
      },
      detailedMetrics: metrics,
      recommendations: this.getGlobalRecommendations(metrics),
      alerts: this.getRecentAlerts(),
    };
  }

  private logSecurityEvent(event: SecurityEvent): void {
    const logLevel = this.getLogLevel(event.severity);
    const message = `ðŸš¨ Security Event [${event.type}] from ${event.ip}: ${event.description}`;
    
    switch (logLevel) {
      case 'error':
        this.logger.error(message);
        break;
      case 'warn':
        this.logger.warn(message);
        break;
      default:
    }
  }

  private checkAlertConditions(ip: string, event: SecurityEvent): void {
    const events = this.securityEvents.get(ip) || [];
    const now = Date.now();
    const recentEvents = events.filter(e => now - e.timestamp < this.alertThresholds.timeWindow);

    // Check for failed login threshold
    const failedLogins = recentEvents.filter(e => e.type === 'FAILED_LOGIN').length;
    if (failedLogins >= this.alertThresholds.failedLogins) {
      this.triggerAlert('HIGH_FAILED_LOGINS', ip, `${failedLogins} failed logins detected`);
    }

    // Check for suspicious request patterns
    const suspiciousRequests = recentEvents.filter(e => 
      ['MALICIOUS_REQUEST', 'SCANNING_ATTEMPT', 'INJECTION_ATTEMPT'].includes(e.type)
    ).length;
    if (suspiciousRequests >= this.alertThresholds.suspiciousRequests) {
      this.triggerAlert('SUSPICIOUS_ACTIVITY', ip, `${suspiciousRequests} suspicious requests detected`);
    }

    // Check for rate limit hits
    const rateLimitHits = recentEvents.filter(e => e.type === 'RATE_LIMIT_HIT').length;
    if (rateLimitHits >= this.alertThresholds.rateLimitHits) {
      this.triggerAlert('RATE_LIMIT_ABUSE', ip, `${rateLimitHits} rate limit violations`);
    }
  }

  private triggerAlert(alertType: string, ip: string, description: string): void {
    const alert: SecurityAlert = {
      id: this.generateEventId(),
      type: alertType,
      ip,
      description,
      timestamp: Date.now(),
      severity: 'HIGH',
    };

    this.logger.error(`ðŸš¨ SECURITY ALERT [${alertType}] IP: ${ip} - ${description}`);
    
    // Send alert to external systems
    this.sendAlertToExternalSystems(alert);
  }

  private calculateRiskScore(events: SecurityEvent[]): number {
    let score = 0;
    
    const weights = {
      'FAILED_LOGIN': 5,
      'MALICIOUS_REQUEST': 15,
      'SCANNING_ATTEMPT': 20,
      'INJECTION_ATTEMPT': 25,
      'CSRF_VIOLATION': 20,
      'RATE_LIMIT_HIT': 3,
      'SUSPICIOUS_USER_AGENT': 10,
      'IP_BLOCKED': 30,
      'UNAUTHORIZED_ACCESS': 20,
    };

    events.forEach(event => {
      const weight = weights[event.type as keyof typeof weights] || 1;
      score += weight;
    });

    // Cap at 100
    return Math.min(score, 100);
  }

  private generateRecommendations(analysis: SecurityAnalysis): string[] {
    const recommendations: string[] = [];

    if (analysis.riskScore > 80) {
      recommendations.push('CRITICAL: Block this IP immediately');
      recommendations.push('Investigate all recent activities from this IP');
    } else if (analysis.riskScore > 60) {
      recommendations.push('HIGH: Monitor this IP closely');
      recommendations.push('Consider temporary rate limiting');
    } else if (analysis.riskScore > 40) {
      recommendations.push('MEDIUM: Increase monitoring for this IP');
    }

    if (analysis.eventTypes['FAILED_LOGIN'] > 3) {
      recommendations.push('Implement account lockout after failed attempts');
    }

    if (analysis.eventTypes['MALICIOUS_REQUEST'] > 5) {
      recommendations.push('Deploy additional request filtering');
    }

    if (Object.keys(analysis.eventTypes).length > 5) {
      recommendations.push('This IP shows diverse attack patterns - high risk');
    }

    return recommendations;
  }

  private getGlobalRecommendations(metrics: SecurityMetrics): string[] {
    const recommendations: string[] = [];

    if (metrics.totalEvents > 100) {
      recommendations.push('High security event volume detected - review security policies');
    }

    if (metrics.topThreats.length > 0 && metrics.topThreats[0].riskScore > 80) {
      recommendations.push('Critical threats detected - immediate attention required');
    }

    const maliciousRequests = metrics.eventTypes['MALICIOUS_REQUEST'] || 0;
    if (maliciousRequests > 20) {
      recommendations.push('High malicious request volume - strengthen input validation');
    }

    const failedLogins = metrics.eventTypes['FAILED_LOGIN'] || 0;
    if (failedLogins > 30) {
      recommendations.push('High failed login attempts - implement stronger authentication');
    }

    return recommendations;
  }

  private getMostCommonThreat(eventTypes: { [key: string]: number }): string {
    let maxCount = 0;
    let mostCommon = 'None';

    for (const [type, count] of Object.entries(eventTypes)) {
      if (count > maxCount) {
        maxCount = count;
        mostCommon = type;
      }
    }

    return mostCommon;
  }

  private getRecentAlerts(): SecurityAlert[] {
    // This would typically come from a persistent store
    // For now, return empty array
    return [];
  }

  private getLogLevel(severity: string): string {
    switch (severity) {
      case 'CRITICAL':
      case 'HIGH':
        return 'error';
      case 'MEDIUM':
        return 'warn';
      default:
        return 'log';
    }
  }

  private generateEventId(): string {
    return `sec_${Date.now()}_${crypto.randomBytes(6).toString('base64url')}`;
  }

  private sendToExternalMonitoring(event: SecurityEvent): void {
    // This would integrate with external security monitoring systems
    const webhookUrl = this.configService.get<string>('SECURITY_WEBHOOK_URL');
    if (webhookUrl) {
      // Send to webhook (implementation would depend on the service)
    }
  }

  private sendAlertToExternalSystems(alert: SecurityAlert): void {
    // This would send alerts to external systems like:
    // - Slack/Teams notifications
    // - Email alerts
    // - SIEM systems
    // - Security incident management systems
    
    const alertWebhook = this.configService.get<string>('ALERT_WEBHOOK_URL');
    if (alertWebhook) {
    }
  }

  private cleanupOldEvents(): void {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours

    for (const [ip, events] of this.securityEvents.entries()) {
      const recentEvents = events.filter(e => now - e.timestamp < maxAge);
      if (recentEvents.length === 0) {
        this.securityEvents.delete(ip);
      } else {
        this.securityEvents.set(ip, recentEvents);
      }
    }
  }
}

// Type definitions
interface SecurityEventData {
  type: string;
  ip: string;
  description: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  userAgent?: string;
  path?: string;
  method?: string;
  userId?: string;
  metadata?: any;
}

interface SecurityEvent extends SecurityEventData {
  id: string;
  timestamp: number;
}

interface SecurityAnalysis {
  ip: string;
  totalEvents: number;
  eventTypes: { [key: string]: number };
  riskScore: number;
  recommendations: string[];
  timeWindow: number;
}

interface SecurityMetrics {
  totalEvents: number;
  uniqueIPs: number;
  eventTypes: { [key: string]: number };
  topThreats: Array<{
    ip: string;
    riskScore: number;
    eventCount: number;
  }>;
  alertsTriggered: number;
  timestamp: number;
}

interface SecurityAlert {
  id: string;
  type: string;
  ip: string;
  description: string;
  timestamp: number;
  severity: string;
}

interface SecurityReport {
  generatedAt: string;
  period: string;
  summary: {
    totalSecurityEvents: number;
    uniqueIPsMonitored: number;
    highRiskIPs: number;
    mostCommonThreat: string;
  };
  detailedMetrics: SecurityMetrics;
  recommendations: string[];
  alerts: SecurityAlert[];
}
