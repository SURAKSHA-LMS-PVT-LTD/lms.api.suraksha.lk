import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from '../../modules/user/entities/user.entity';
import { JwtPayload } from '../interfaces/jwt-payload.interface';
import { 
  EnhancedInstituteAccessEntry, 
  EnhancedJwtPayload, 
  GLOBAL_INSTITUTE_ACCESS_FLAG,
  COMPACT_TO_USER_TYPE
} from '../interfaces/enhanced-jwt-payload.interface';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name);

  constructor(
    private configService: ConfigService,
    @InjectRepository(UserEntity)
    private userRepository: Repository<UserEntity>
  ) {
    // 🔒 SECURITY: Validate JWT_SECRET on initialization
    const jwtSecret = configService.get<string>('JWT_SECRET');
    if (!jwtSecret) {
      throw new Error(
        '❌ CRITICAL SECURITY ERROR: JWT_SECRET is not configured!\n' +
        'Generate a secure secret with: openssl rand -hex 64\n' +
        'Add it to your .env file: JWT_SECRET=your_generated_secret'
      );
    }

    if (jwtSecret.length < 64) {
      throw new Error(
        `❌ CRITICAL SECURITY ERROR: JWT_SECRET is too short (${jwtSecret.length} characters)!\n` +
        'JWT_SECRET must be at least 64 characters (128 recommended).\n' +
        'Generate a secure secret with: openssl rand -hex 64'
      );
    }

    // Warn about common weak secrets
    const weakSecrets = ['secret', 'fallback-secret-key', 'your-secret-key', 'jwt-secret', 'change-me'];
    if (weakSecrets.includes(jwtSecret.toLowerCase())) {
      throw new Error(
        '❌ CRITICAL SECURITY ERROR: JWT_SECRET is using a default/weak value!\n' +
        'NEVER use default secrets in production.\n' +
        'Generate a secure secret with: openssl rand -hex 64'
      );
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtSecret,
    });

  }

  async validate(payload: JwtPayload | EnhancedJwtPayload) {
    // Handle both legacy and enhanced JWT formats
    const isEnhanced = this.isEnhancedPayload(payload);
    
    // Validate structure
    if (!payload || !payload.s) {
      this.logger.error('Invalid payload structure', payload);
      throw new UnauthorizedException('Invalid token payload');
    }

    // For enhanced format, also check user type field
    if (isEnhanced && (payload as EnhancedJwtPayload).u === undefined) {
      this.logger.error('Invalid enhanced payload structure', payload);
      throw new UnauthorizedException('Invalid enhanced token payload');
    }

    const userId = payload.s.toString();
    
    // Only select essential fields to avoid performance issues
    const user = await this.userRepository.findOne({ 
      where: { id: userId },
      select: ['id', 'email', 'firstName', 'lastName', 'isActive', 'userType', 'imageUrl']
    });
    
    if (!user) {
      this.logger.error(`User not found for ID: ${userId}`);
      throw new UnauthorizedException('User not found');
    }

    // Check if user is active
    if (!user.isActive) {
      this.logger.error(`Inactive user attempted login: ${userId}`);
      throw new UnauthorizedException('User account is inactive');
    }
    
    // Extract user type
    let userType = user.userType;
    if (isEnhanced) {
      const compactType = (payload as EnhancedJwtPayload).u;
      const typeStr = COMPACT_TO_USER_TYPE[compactType as keyof typeof COMPACT_TO_USER_TYPE];
      if (typeStr && user.userType) {
        userType = user.userType; // Use database value as source of truth
      }
    }
    
    // Extract enhanced claims for new format
    const enhancedClaims = isEnhanced ? this.extractEnhancedClaims(payload as EnhancedJwtPayload) : null;
    
    // Return optimized user object.
    // IMPORTANT: spread payload FIRST, then override with normalized string values.
    // payload.s may be a number (JWT numeric claim) — we always expose it as a string
    // so that strict equality checks (currentUser.s === id) work correctly everywhere.
    return {
      ...payload, // Include all JWT fields for validation guards (spread first)
      id: userId,
      userId: userId,
      sub: userId, // For backward compatibility
      s: userId,   // Compact format — always a string, overrides numeric payload.s
      email: user.email,
      userType: userType,
      u: isEnhanced ? (payload as EnhancedJwtPayload).u : undefined,
      firstName: user.firstName,
      lastName: user.lastName,
      imageUrl: user.imageUrl,
      jwtPayload: payload,
      hasGlobalInstituteAccess: enhancedClaims?.hasGlobalAccess ?? false,
      enhancedInstituteAccess: enhancedClaims?.instituteAccess,
      enhancedChildrenAccess: enhancedClaims?.childrenAccess
    };
  }

  private isEnhancedPayload(payload: any): payload is EnhancedJwtPayload {
    return payload && typeof payload.u === 'number';
  }

  private extractEnhancedClaims(
    payload: EnhancedJwtPayload
  ): {
    hasGlobalAccess: boolean;
    instituteAccess?: EnhancedInstituteAccessEntry[];
    childrenAccess?: string[];
  } | null {
    if (!payload || (payload.i === undefined && payload.c === undefined)) {
      return null;
    }

    const rawInstituteAccess = payload.i;
    let hasGlobalAccess = false;
    let instituteAccess: EnhancedInstituteAccessEntry[] | undefined;

    if (Array.isArray(rawInstituteAccess)) {
      instituteAccess = rawInstituteAccess;
    } else if (typeof rawInstituteAccess === 'number') {
      hasGlobalAccess = rawInstituteAccess === GLOBAL_INSTITUTE_ACCESS_FLAG;
    }

    const childrenAccess = payload.c ? [...payload.c] : undefined;

    return {
      hasGlobalAccess,
      instituteAccess,
      childrenAccess
    };
  }
}
