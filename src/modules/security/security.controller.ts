import { Controller, Get, Post, Body, Param, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { SecurityMonitoringService } from '../../common/services/security-monitoring.service';
import { AdvancedSecurityGuard } from '../../common/guards/advanced-security.guard';
import { JwtAuthGuard, FlexibleAccessGuard, RequireAnyOfRoles, UserType } from '../../auth/guards';
import { getCurrentSriLankaISO } from '../../common/utils/timezone.util';
import { RecordSecurityEventDto } from './dto/record-security-event.dto';

@ApiTags('Security')
@Controller('api/security')
@UseGuards(JwtAuthGuard, AdvancedSecurityGuard)
@ApiBearerAuth()
export class SecurityController {
  constructor(private securityMonitoringService: SecurityMonitoringService) {}

  @Get('metrics')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN] })
  @ApiOperation({ summary: 'Get security metrics (SUPERADMIN only)' })
  @ApiResponse({ status: 200, description: 'Security metrics retrieved successfully' })
  @HttpCode(HttpStatus.OK)
  async getSecurityMetrics(): Promise<any> {
    return {
      success: true,
      data: this.securityMonitoringService.getSecurityMetrics(),
      timestamp: getCurrentSriLankaISO()
    };
  }

  @Get('report')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN] })
  @ApiOperation({ summary: 'Get comprehensive security report (SUPERADMIN only)' })
  @ApiResponse({ status: 200, description: 'Security report generated successfully' })
  @HttpCode(HttpStatus.OK)
  async getSecurityReport(): Promise<any> {
    return {
      success: true,
      data: this.securityMonitoringService.exportSecurityReport(),
      timestamp: getCurrentSriLankaISO()
    };
  }

  @Get('threats')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN] })
  @ApiOperation({ summary: 'Get current security threats (SUPERADMIN only)' })
  @ApiResponse({ status: 200, description: 'Current threats retrieved successfully' })
  @HttpCode(HttpStatus.OK)
  async getCurrentThreats() {
    const metrics = this.securityMonitoringService.getSecurityMetrics();
    return {
      success: true,
      data: {
        topThreats: metrics.topThreats,
        totalEvents: metrics.totalEvents,
        uniqueIPs: metrics.uniqueIPs,
        alertLevel: this.calculateAlertLevel(metrics)
      },
      timestamp: getCurrentSriLankaISO()
    };
  }

  @Get('events/:ip')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN] })
  @ApiOperation({ summary: 'Get security events for specific IP (SUPERADMIN only)' })
  @ApiResponse({ status: 200, description: 'IP security events retrieved successfully' })
  @HttpCode(HttpStatus.OK)
  async getIPSecurityEvents(@Param('ip') ip: string): Promise<any> {
    return {
      success: true,
      data: this.securityMonitoringService.analyzeSecurityPatterns(ip),
      timestamp: getCurrentSriLankaISO()
    };
  }

  @Post('event')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN] })
  @ApiOperation({ summary: 'Record a security event (SUPERADMIN only - internal use)' })
  @ApiResponse({ status: 201, description: 'Security event recorded successfully' })
  @HttpCode(HttpStatus.CREATED)
  async recordSecurityEvent(@Body() eventData: RecordSecurityEventDto) {
    this.securityMonitoringService.recordSecurityEvent(eventData);
    return {
      success: true,
      message: 'Security event recorded',
      timestamp: getCurrentSriLankaISO()
    };
  }

  @Get('status')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN] })
  @ApiOperation({ summary: 'Get security system status (SUPERADMIN only)' })
  @ApiResponse({ status: 200, description: 'Security system status retrieved' })
  @HttpCode(HttpStatus.OK)
  async getSecurityStatus() {
    const metrics = this.securityMonitoringService.getSecurityMetrics();
    const status = this.determineSystemStatus(metrics);

    return {
      success: true,
      data: {
        status: status.level,
        message: status.message,
        recommendations: status.recommendations,
        metrics: {
          totalEvents: metrics.totalEvents,
          uniqueIPs: metrics.uniqueIPs,
          highRiskIPs: metrics.topThreats.filter(t => t.riskScore > 70).length
        }
      },
      timestamp: getCurrentSriLankaISO()
    };
  }

  private calculateAlertLevel(metrics: any): string {
    const highRiskIPs = metrics.topThreats.filter(t => t.riskScore > 70).length;
    const totalEvents = metrics.totalEvents;

    if (highRiskIPs > 5 || totalEvents > 500) {
      return 'CRITICAL';
    } else if (highRiskIPs > 2 || totalEvents > 200) {
      return 'HIGH';
    } else if (highRiskIPs > 0 || totalEvents > 50) {
      return 'MEDIUM';
    } else {
      return 'LOW';
    }
  }

  private determineSystemStatus(metrics: any): { level: string; message: string; recommendations: string[] } {
    const alertLevel = this.calculateAlertLevel(metrics);
    const recommendations: string[] = [];

    switch (alertLevel) {
      case 'CRITICAL':
        recommendations.push('Immediate security review required');
        recommendations.push('Consider blocking high-risk IPs');
        recommendations.push('Increase monitoring frequency');
        return {
          level: 'CRITICAL',
          message: 'System under high security threat - immediate action required',
          recommendations
        };

      case 'HIGH':
        recommendations.push('Review security logs');
        recommendations.push('Monitor suspicious IPs closely');
        recommendations.push('Consider tightening security policies');
        return {
          level: 'HIGH',
          message: 'Elevated security threats detected - increased monitoring recommended',
          recommendations
        };

      case 'MEDIUM':
        recommendations.push('Regular security monitoring');
        recommendations.push('Review blocked IPs periodically');
        return {
          level: 'MEDIUM',
          message: 'Normal security activity with some threats detected',
          recommendations
        };

      default:
        recommendations.push('Continue regular monitoring');
        recommendations.push('Maintain current security policies');
        return {
          level: 'LOW',
          message: 'System operating under normal security conditions',
          recommendations
        };
    }
  }
}
