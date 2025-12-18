import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface AccessControlLayer {
  id: number;
  name: string;
  envKey: string;
  isActive: boolean;
  avgTime: string;
  description: string;
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'OPTIONAL';
  dependencies: number[];
}

@Injectable()
export class LayerManagementService {
  private readonly logger = new Logger(LayerManagementService.name);
  private layers: AccessControlLayer[] = [];

  constructor(private readonly configService: ConfigService) {
    this.initializeLayers();
    this.logLayerStatus();
  }

  private initializeLayers(): void {
    this.layers = [
      {
        id: 1,
        name: 'JWT Authentication',
        envKey: 'JWT_AUTHENTICATION_LAYER_ACTIVE',
        isActive: this.getLayerConfig('JWT_AUTHENTICATION_LAYER_ACTIVE', true),
        avgTime: '5-10ms',
        description: 'Core JWT token validation and user authentication',
        priority: 'CRITICAL',
        dependencies: []
      },
      {
        id: 2,
        name: 'Admin Access Control',
        envKey: 'ADMIN_ACCESS_CONTROL_LAYER_ACTIVE',
        isActive: this.getLayerConfig('ADMIN_ACCESS_CONTROL_LAYER_ACTIVE', true),
        avgTime: '2-5ms',
        description: 'IP and origin validation for admin roles (SUPERADMIN, ORGANIZATION_MANAGER)',
        priority: 'HIGH',
        dependencies: [1, 5]
      },
      {
        id: 3,
        name: 'Cache Validation',
        envKey: 'CACHE_VALIDATION_LAYER_ACTIVE',
        isActive: this.getLayerConfig('CACHE_VALIDATION_LAYER_ACTIVE', true),
        avgTime: '1-3ms (hit), 20-50ms (miss)',
        description: 'Cache-based user validation with Redis performance optimization',
        priority: 'HIGH',
        dependencies: [1]
      },
      {
        id: 4,
        name: 'Database Fallback',
        envKey: 'DATABASE_FALLBACK_LAYER_ACTIVE',
        isActive: this.getLayerConfig('DATABASE_FALLBACK_LAYER_ACTIVE', true),
        avgTime: '10-50ms',
        description: 'Direct database validation when cache fails - reliability layer',
        priority: 'HIGH',
        dependencies: [1, 3]
      },
      {
        id: 5,
        name: 'Global User Type Validation',
        envKey: 'GLOBAL_USER_TYPE_VALIDATION_LAYER_ACTIVE',
        isActive: this.getLayerConfig('GLOBAL_USER_TYPE_VALIDATION_LAYER_ACTIVE', true),
        avgTime: '1-2ms',
        description: 'Validate user types (SUPERADMIN, ORGANIZATION_MANAGER, INSTITUTE_ADMIN, etc.)',
        priority: 'HIGH',
        dependencies: [1]
      },
      {
        id: 6,
        name: 'Institute Access Validation',
        envKey: 'INSTITUTE_ACCESS_VALIDATION_LAYER_ACTIVE',
        isActive: this.getLayerConfig('INSTITUTE_ACCESS_VALIDATION_LAYER_ACTIVE', true),
        avgTime: '2-5ms',
        description: 'Institute-level permission validation and hierarchical access control',
        priority: 'MEDIUM',
        dependencies: [1, 5]
      },
      {
        id: 7,
        name: 'Class Access Validation',
        envKey: 'CLASS_ACCESS_VALIDATION_LAYER_ACTIVE',
        isActive: this.getLayerConfig('CLASS_ACCESS_VALIDATION_LAYER_ACTIVE', true),
        avgTime: '2-5ms',
        description: 'Class-level permission validation within institutes',
        priority: 'MEDIUM',
        dependencies: [1, 5, 6]
      },
      {
        id: 8,
        name: 'Subject Access Validation',
        envKey: 'SUBJECT_ACCESS_VALIDATION_LAYER_ACTIVE',
        isActive: this.getLayerConfig('SUBJECT_ACCESS_VALIDATION_LAYER_ACTIVE', true),
        avgTime: '2-5ms',
        description: 'Subject-level permission validation within classes',
        priority: 'MEDIUM',
        dependencies: [1, 5, 6, 7]
      },
      {
        id: 9,
        name: 'Parent-Student Relationship Validation',
        envKey: 'PARENT_STUDENT_VALIDATION_LAYER_ACTIVE',
        isActive: this.getLayerConfig('PARENT_STUDENT_VALIDATION_LAYER_ACTIVE', true),
        avgTime: '5-10ms',
        description: 'Validate parent-student relationships and family access controls',
        priority: 'MEDIUM',
        dependencies: [1, 3]
      },
      {
        id: 10,
        name: 'CORS Origin Validation',
        envKey: 'CORS_VALIDATION_LAYER_ACTIVE',
        isActive: this.getLayerConfig('CORS_VALIDATION_LAYER_ACTIVE', true),
        avgTime: '1-2ms',
        description: 'Cross-origin request validation and CORS policy enforcement',
        priority: 'HIGH',
        dependencies: []
      },
      {
        id: 11,
        name: 'Rate Limiting',
        envKey: 'RATE_LIMITING_LAYER_ACTIVE',
        isActive: this.getLayerConfig('RATE_LIMITING_LAYER_ACTIVE', true),
        avgTime: '1-3ms',
        description: 'Request throttling and DOS protection with configurable limits',
        priority: 'HIGH',
        dependencies: []
      },
      {
        id: 12,
        name: 'IP Geolocation Check',
        envKey: 'IP_GEOLOCATION_LAYER_ACTIVE',
        isActive: this.getLayerConfig('IP_GEOLOCATION_LAYER_ACTIVE', false),
        avgTime: '10-50ms',
        description: 'Geographic location validation for admin access (EXPENSIVE)',
        priority: 'OPTIONAL',
        dependencies: [2]
      },
      {
        id: 13,
        name: 'Strict Origin Validation',
        envKey: 'STRICT_ORIGIN_VALIDATION_LAYER_ACTIVE',
        isActive: this.getLayerConfig('STRICT_ORIGIN_VALIDATION_LAYER_ACTIVE', true),
        avgTime: '1-2ms',
        description: 'Direct blocking of unknown/malicious origins with 403 responses',
        priority: 'HIGH',
        dependencies: [10]
      },
      {
        id: 14,
        name: 'Request Metadata Validation',
        envKey: 'REQUEST_METADATA_VALIDATION_LAYER_ACTIVE',
        isActive: this.getLayerConfig('REQUEST_METADATA_VALIDATION_LAYER_ACTIVE', true),
        avgTime: '1-2ms',
        description: 'Extract and validate request metadata (IP, user-agent, headers)',
        priority: 'MEDIUM',
        dependencies: []
      },
      {
        id: 15,
        name: 'Session Management',
        envKey: 'SESSION_MANAGEMENT_LAYER_ACTIVE',
        isActive: this.getLayerConfig('SESSION_MANAGEMENT_LAYER_ACTIVE', true),
        avgTime: '1-2ms',
        description: 'Admin session timeout and management with configurable timeouts',
        priority: 'MEDIUM',
        dependencies: [1, 2]
      }
    ];
  }

  private getLayerConfig(envKey: string, defaultValue: boolean): boolean {
    const value = this.configService.get<string>(envKey);
    if (value === undefined || value === null) return defaultValue;
    return value.toLowerCase() === 'true';
  }

  private logLayerStatus(): void {
    const activeCount = this.layers.filter(layer => layer.isActive).length;
    const totalCount = this.layers.length;
    
    
    // Log active layers
    const activeLayers = this.layers.filter(layer => layer.isActive);
    activeLayers.forEach(layer => {
    });
    
    // Log disabled layers
    const disabledLayers = this.layers.filter(layer => !layer.isActive);
    if (disabledLayers.length > 0) {
      this.logger.warn(`⚠️  Disabled Layers (${disabledLayers.length}):`);
      disabledLayers.forEach(layer => {
        this.logger.warn(`  ❌ Layer ${layer.id}: ${layer.name} - ${layer.description}`);
      });
    }

    // Calculate estimated total validation time
    const estimatedMinTime = this.calculateEstimatedTime('min');
    const estimatedMaxTime = this.calculateEstimatedTime('max');
  }

  private calculateEstimatedTime(type: 'min' | 'max'): number {
    return this.layers
      .filter(layer => layer.isActive)
      .reduce((total, layer) => {
        const timeRange = layer.avgTime.match(/(\d+)-?(\d+)?/);
        if (timeRange) {
          const min = parseInt(timeRange[1]);
          const max = parseInt(timeRange[2] || timeRange[1]);
          return total + (type === 'min' ? min : max);
        }
        return total + 2; // Default fallback
      }, 0);
  }

  /**
   * Check if a specific layer is active
   */
  isLayerActive(layerId: number): boolean {
    const layer = this.layers.find(l => l.id === layerId);
    return layer ? layer.isActive : false;
  }

  /**
   * Check if a layer is active by environment key
   */
  isLayerActiveByKey(envKey: string): boolean {
    const layer = this.layers.find(l => l.envKey === envKey);
    return layer ? layer.isActive : false;
  }

  /**
   * Get layer information
   */
  getLayer(layerId: number): AccessControlLayer | undefined {
    return this.layers.find(l => l.id === layerId);
  }

  /**
   * Get all active layers
   */
  getActiveLayers(): AccessControlLayer[] {
    return this.layers.filter(layer => layer.isActive);
  }

  /**
   * Get layers by priority
   */
  getLayersByPriority(priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'OPTIONAL'): AccessControlLayer[] {
    return this.layers.filter(layer => layer.priority === priority);
  }

  /**
   * Check if dependencies are satisfied for a layer
   */
  areDependenciesSatisfied(layerId: number): boolean {
    const layer = this.getLayer(layerId);
    if (!layer) return false;

    return layer.dependencies.every(depId => this.isLayerActive(depId));
  }

  /**
   * Get layer validation summary
   */
  getValidationSummary(): {
    total: number;
    active: number;
    disabled: number;
    critical: number;
    estimatedTimeRange: string;
    warnings: string[];
  } {
    const total = this.layers.length;
    const active = this.layers.filter(l => l.isActive).length;
    const disabled = total - active;
    const critical = this.layers.filter(l => l.priority === 'CRITICAL' && l.isActive).length;
    
    const minTime = this.calculateEstimatedTime('min');
    const maxTime = this.calculateEstimatedTime('max');
    
    const warnings: string[] = [];
    
    // Check for critical layers that are disabled
    const disabledCritical = this.layers.filter(l => l.priority === 'CRITICAL' && !l.isActive);
    if (disabledCritical.length > 0) {
      warnings.push(`Critical layers disabled: ${disabledCritical.map(l => l.name).join(', ')}`);
    }
    
    // Check for dependency violations
    this.layers.forEach(layer => {
      if (layer.isActive && !this.areDependenciesSatisfied(layer.id)) {
        warnings.push(`Layer ${layer.name} is active but dependencies are not satisfied`);
      }
    });

    return {
      total,
      active,
      disabled,
      critical,
      estimatedTimeRange: `${minTime}-${maxTime}ms`,
      warnings
    };
  }

  /**
   * Validate layer configuration
   */
  validateConfiguration(): { isValid: boolean; errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check critical layers
    const jwtLayer = this.getLayer(1);
    if (!jwtLayer?.isActive) {
      errors.push('JWT Authentication Layer must be active - SECURITY CRITICAL');
    }

    // Check dependencies
    this.layers.forEach(layer => {
      if (layer.isActive && !this.areDependenciesSatisfied(layer.id)) {
        const missingDeps = layer.dependencies.filter(depId => !this.isLayerActive(depId));
        const missingNames = missingDeps.map(depId => this.getLayer(depId)?.name).join(', ');
        errors.push(`Layer ${layer.name} requires dependencies: ${missingNames}`);
      }
    });

    // Performance warnings
    if (this.isLayerActive(12)) {
      warnings.push('IP Geolocation layer is expensive (~10-50ms) - consider disabling for better performance');
    }

    const activeLayers = this.getActiveLayers().length;
    if (activeLayers > 12) {
      warnings.push(`High number of active layers (${activeLayers}) may impact performance`);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }
}
