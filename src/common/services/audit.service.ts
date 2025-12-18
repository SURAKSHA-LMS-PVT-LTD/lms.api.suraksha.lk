import { Injectable, Logger } from '@nestjs/common';

export interface AuditLogEntry {
  id: string;
  timestamp: Date;
  userId?: string;
  action: string;
  resource: string;
  method: string;
  url: string;
  ip: string;
  userAgent: string;
  requestBody?: any;
  responseBody?: any;
  statusCode: number;
  duration: number;
  error?: any;
  metadata?: any;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger('AuditService');
  private auditLogs: AuditLogEntry[] = []; // In production, use a database

  async createAuditLog(entry: Partial<AuditLogEntry>): Promise<void> {
    const auditEntry: AuditLogEntry = {
      id: this.generateId(),
      timestamp: new Date(),
      action: 'UNKNOWN',
      resource: 'UNKNOWN',
      method: 'UNKNOWN',
      url: '',
      ip: '',
      userAgent: '',
      statusCode: 0,
      duration: 0,
      ...entry,
    };

    // Store in memory (in production, save to database)
    this.auditLogs.push(auditEntry);

    // Log to console with detailed formatting
    this.logAuditEntry(auditEntry);
  }

  async getUserAuditLogs(userId: string, limit = 50): Promise<AuditLogEntry[]> {
    return this.auditLogs
      .filter(log => log.userId === userId)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  async getResourceAuditLogs(resource: string, limit = 100): Promise<AuditLogEntry[]> {
    return this.auditLogs
      .filter(log => log.resource === resource)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  async getAuditStats(): Promise<any> {
    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const logsLast24h = this.auditLogs.filter(log => log.timestamp >= last24h);
    const logsLast7d = this.auditLogs.filter(log => log.timestamp >= last7d);

    return {
      totalLogs: this.auditLogs.length,
      logsLast24h: logsLast24h.length,
      logsLast7d: logsLast7d.length,
      byAction: this.groupBy(this.auditLogs, 'action'),
      byResource: this.groupBy(this.auditLogs, 'resource'),
      byStatusCode: this.groupBy(this.auditLogs, 'statusCode'),
      averageResponseTime: this.calculateAverageResponseTime(),
      errorRate: this.calculateErrorRate(),
    };
  }

  private logAuditEntry(entry: AuditLogEntry): void {
    const emoji = this.getActionEmoji(entry.action, entry.statusCode);
    const colorCode = this.getColorCode(entry.statusCode);
    
    const logData = {
      id: entry.id,
      timestamp: entry.timestamp.toISOString(),
      userId: entry.userId || 'Anonymous',
      action: entry.action,
      resource: entry.resource,
      method: entry.method,
      url: entry.url,
      ip: entry.ip,
      statusCode: entry.statusCode,
      duration: `${entry.duration}ms`,
      requestBody: entry.requestBody ? this.formatBody(entry.requestBody) : null,
      responseBody: entry.responseBody ? this.formatBody(entry.responseBody) : null,
      error: entry.error || null,
    };

  }

  private formatBody(body: any): any {
    if (!body) return null;
    
    const bodyStr = JSON.stringify(body);
    if (bodyStr.length > 500) {
      return `[Body size: ${bodyStr.length} chars] ${bodyStr.substring(0, 200)}...`;
    }
    return body;
  }

  private getActionEmoji(action: string, statusCode: number): string {
    if (statusCode >= 400) return '❌';
    
    switch (action.toUpperCase()) {
      case 'CREATE': return '✅';
      case 'READ': return '👁️';
      case 'UPDATE': return '📝';
      case 'DELETE': return '🗑️';
      case 'LOGIN': return '🔐';
      case 'LOGOUT': return '🚪';
      default: return '📋';
    }
  }

  private getColorCode(statusCode: number): string {
    if (statusCode >= 200 && statusCode < 300) return '\x1b[32m'; // Green
    if (statusCode >= 300 && statusCode < 400) return '\x1b[33m'; // Yellow
    if (statusCode >= 400 && statusCode < 500) return '\x1b[31m'; // Red
    if (statusCode >= 500) return '\x1b[35m'; // Magenta
    return '\x1b[0m'; // Reset
  }

  private generateId(): string {
    return `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private groupBy(array: any[], key: string): Record<string, number> {
    return array.reduce((result, item) => {
      const group = item[key]?.toString() || 'unknown';
      result[group] = (result[group] || 0) + 1;
      return result;
    }, {});
  }

  private calculateAverageResponseTime(): number {
    if (this.auditLogs.length === 0) return 0;
    const total = this.auditLogs.reduce((sum, log) => sum + log.duration, 0);
    return Math.round(total / this.auditLogs.length);
  }

  private calculateErrorRate(): number {
    if (this.auditLogs.length === 0) return 0;
    const errorCount = this.auditLogs.filter(log => log.statusCode >= 400).length;
    return Math.round((errorCount / this.auditLogs.length) * 100);
  }
}
