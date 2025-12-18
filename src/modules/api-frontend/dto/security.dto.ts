import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsArray, IsBoolean, IsDateString } from 'class-validator';

export class SecurityContextDto {
  @ApiProperty({ 
    description: 'Unique request identifier',
    example: 'abc12345'
  })
  @IsString()
  requestId: string;

  @ApiProperty({ 
    description: 'Whether the request passed security validation',
    example: true
  })
  @IsBoolean()
  isValid: boolean;

  @ApiProperty({ 
    description: 'User permissions for this request',
    example: ['read', 'write'],
    required: false
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissions?: string[];

  @ApiProperty({ 
    description: 'Security validation errors',
    example: ['Invalid token', 'Access denied'],
    required: false
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  errors?: string[];

  @ApiProperty({ 
    description: 'Request validation timestamp',
    example: '2025-08-31T12:00:00Z'
  })
  @IsDateString()
  timestamp: string;
}

export class ApiHealthDto {
  @ApiProperty({ 
    description: 'API frontend service status',
    example: 'healthy'
  })
  @IsString()
  status: string;

  @ApiProperty({ 
    description: 'Service uptime in seconds',
    example: 86400
  })
  uptime: number;

  @ApiProperty({ 
    description: 'Total requests processed',
    example: 12345
  })
  totalRequests: number;

  @ApiProperty({ 
    description: 'Security checks performed',
    example: 12345
  })
  securityChecks: number;

  @ApiProperty({ 
    description: 'Blocked requests count',
    example: 42
  })
  blockedRequests: number;

  @ApiProperty({ 
    description: 'Service version',
    example: '1.0.0'
  })
  @IsString()
  version: string;
}

export class SecurityIncidentDto {
  @ApiProperty({ 
    description: 'Incident unique identifier',
    example: 'inc_abc12345'
  })
  @IsString()
  incidentId: string;

  @ApiProperty({ 
    description: 'Type of security incident',
    example: 'UNAUTHORIZED_ACCESS'
  })
  @IsString()
  type: string;

  @ApiProperty({ 
    description: 'Client IP address',
    example: '192.168.1.100'
  })
  @IsString()
  clientIP: string;

  @ApiProperty({ 
    description: 'Request URL that triggered the incident',
    example: '/api/admin/users'
  })
  @IsString()
  requestUrl: string;

  @ApiProperty({ 
    description: 'HTTP method used',
    example: 'POST'
  })
  @IsString()
  method: string;

  @ApiProperty({ 
    description: 'User email (if authenticated)',
    example: 'user@example.com',
    required: false
  })
  @IsOptional()
  @IsString()
  userEmail?: string;

  @ApiProperty({ 
    description: 'Incident severity level',
    example: 'HIGH'
  })
  @IsString()
  severity: string;

  @ApiProperty({ 
    description: 'Incident description',
    example: 'Multiple failed authentication attempts'
  })
  @IsString()
  description: string;

  @ApiProperty({ 
    description: 'Incident timestamp',
    example: '2025-08-31T12:00:00Z'
  })
  @IsDateString()
  timestamp: string;
}
