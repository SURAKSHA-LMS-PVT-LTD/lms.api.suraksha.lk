import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  HttpStatus,
  UseGuards,
  Logger,
  BadRequestException,
  Headers,
  Ip,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiHeader,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { InstitutesService } from './institute.service';
import { CreatePublicInstituteDto } from './dto/create-public-institute.dto';
import { InstituteResponseDto } from './dto/institute-response.dto';
import { ApiKeyOrJwtGuard } from '../../auth/guards/api-key-or-jwt.guard';
import { Public } from '../../common/decorators/public.decorator';
import { v4 as uuidv4 } from 'uuid';
import { getCurrentSriLankaTime } from '../../common/utils/timezone.util';

/**
 * 🌐 PUBLIC INSTITUTE CONTROLLER
 * 
 * Publicly accessible API for institute creation with enhanced security
 * 
 * SECURITY FEATURES:
 * ✅ API Key authentication required
 * ✅ Rate limiting: 5 requests per minute per IP
 * ✅ Comprehensive logging with request IDs
 * ✅ Input validation
 * ✅ Auto-generated institute codes
 * ✅ Duplicate detection (email)
 * ✅ IP tracking for abuse prevention
 * 
 * AUTO-GENERATION:
 * ✅ Institute codes auto-generated (format: INST-YYYYMMDD-XXX)
 * ✅ Example: INST-20260118-001, INST-20260118-002
 * 
 * USAGE:
 * - Public institute registration
 * - Partner integrations
 * - Third-party systems
 * 
 * @version 2.0.0
 */
@ApiTags('Public Institute Management')
@ApiSecurity('api-key')
@Controller('public/institutes')
@Public() // Bypass JWT requirement
@UseGuards(ApiKeyOrJwtGuard) // But require API key
@Throttle({ default: { limit: 5, ttl: 60000 } }) // 5 requests per minute
export class PublicInstitutesController {
  private readonly logger = new Logger(PublicInstitutesController.name);

  constructor(private readonly institutesService: InstitutesService) {}

  /**
   * 🏫 Create New Institute (Public API)
   * 
   * Allows public creation of institutes with enhanced security
   * 
   * SECURITY FEATURES:
   * - API key required in header
   * - Rate limited: 5 requests per minute
   * - Auto-generated institute codes
   * - Full input validation
   * - Duplicate email detection
   * - Comprehensive audit logging
   * - IP tracking
   * 
   * AUTO-GENERATION:
   * - Institute code automatically generated
   * - Format: INST-YYYYMMDD-XXX (e.g., INST-20260118-001)
   * 
   * REQUIRED FIELDS:
   * - name: Institute name
   * - email: Institute email
   * - systemContactPhoneNumber: System contact phone (+947XXXXXXXX)
   * - systemContactEmail: System notifications email
   * 
   * OPTIONAL FIELDS:
   * - All images (logoUrl, loadingGifUrl, imageUrl)
   * - Address, city, district, province
   * - Phone, website, description
   */
  @Post()
  @Throttle({ default: { limit: 3, ttl: 60000 } }) // Extra strict: 3 per minute for creation
  @ApiOperation({
    summary: '🏫 Create a new institute (Public API with API Key)',
    description: `
      **PUBLIC ENDPOINT** - Requires API Key authentication
      
      Creates a new educational institute with automatic code generation.
      
      **🔐 Required Header:**
      - x-api-key: Your API key (contact admin for access)
      
      **✅ Required Fields:**
      - name (Institute name)
      - email (Institute email)
      - systemContactPhoneNumber (+947XXXXXXXX)
      - systemContactEmail (System notifications)
      
      **🎯 Auto-Generated:**
      - Institute code (format: INST-YYYYMMDD-XXX)
      - Example: INST-20260118-001, INST-20260118-002
      
      **🖼️ Optional Fields:**
      - All images (logoUrl, loadingGifUrl, imageUrl)
      - Upload images first via /public/upload endpoints
      - Address, city, district, province
      - Phone, website, description
      
      **🔒 Security:**
      - Rate limit: 3 requests per minute
      - API key authentication
      - Duplicate email detection
      - Input validation
      - Comprehensive logging
      
      **📝 Response:**
      - Returns created institute with auto-generated code
      - Includes unique institute ID
    `,
  })
  @ApiHeader({
    name: 'x-api-key',
    description: 'API Key for authentication',
    required: true,
    example: 'your-api-key-here',
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: '✅ Institute created successfully with auto-generated code',
    type: InstituteResponseDto,
    schema: {
      example: {
        success: true,
        message: 'Institute created successfully',
        requestId: 'CREATE-INST-A1B2C3D4',
        data: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          name: 'Cambridge International School',
          code: 'INST-20260118-001',
          email: 'admin@cambridge-school.edu',
          systemContactPhoneNumber: '+94712345678',
          systemContactEmail: 'system@cambridge-school.edu',
          phone: '+94112345678',
          address: '123 Education Street',
          city: 'Colombo',
          country: 'Sri Lanka',
          createdAt: '2026-01-18T00:00:00.000Z',
        },
      },
    },
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: '❌ Invalid input data',
    schema: {
      example: {
        success: false,
        message: 'Validation failed',
        errors: [
          'email must be a valid email',
          'systemContactPhoneNumber must be in format +947XXXXXXXX',
        ],
      },
    },
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: '❌ Institute with email already exists',
    schema: {
      example: {
        success: false,
        message: 'Institute with this email already exists',
      },
    },
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: '❌ Missing or invalid API key',
  })
  @ApiResponse({
    status: HttpStatus.TOO_MANY_REQUESTS,
    description: '❌ Rate limit exceeded (max 3 requests per minute)',
    schema: {
      example: {
        success: false,
        message: 'ThrottlerException: Too Many Requests',
      },
    },
  })
  async createPublic(
    @Body() createInstituteDto: CreatePublicInstituteDto,
    @Headers('x-api-key') apiKey: string,
    @Ip() ipAddress: string,
  ): Promise<{
    success: boolean;
    message: string;
    data: InstituteResponseDto;
    requestId: string;
  }> {
    const requestId = `CREATE-INST-${uuidv4().substring(0, 8).toUpperCase()}`;

    try {
      // 📝 LOG: Request received
      this.logger.log(
        `[${requestId}] 🏫 Public institute creation request - ` +
        `Name: "${createInstituteDto.name}", Email: "${createInstituteDto.email}", ` +
        `SysPhone: "${createInstituteDto.systemContactPhoneNumber}", ` +
        `SysEmail: "${createInstituteDto.systemContactEmail}", IP: ${ipAddress}`,
      );

      // 🔍 Validate required fields
      if (!createInstituteDto.name || createInstituteDto.name.trim().length === 0) {
        this.logger.warn(`[${requestId}] ⚠️ Missing institute name`);
        throw new BadRequestException('Institute name is required');
      }

      if (!createInstituteDto.email || createInstituteDto.email.trim().length === 0) {
        this.logger.warn(`[${requestId}] ⚠️ Missing institute email`);
        throw new BadRequestException('Institute email is required');
      }

      if (!createInstituteDto.systemContactPhoneNumber) {
        this.logger.warn(`[${requestId}] ⚠️ Missing system contact phone`);
        throw new BadRequestException('System contact phone number is required');
      }

      if (!createInstituteDto.systemContactEmail) {
        this.logger.warn(`[${requestId}] ⚠️ Missing system contact email`);
        throw new BadRequestException('System contact email is required');
      }

      // 🎯 AUTO-GENERATE INSTITUTE CODE
      const generatedCode = await this.generateInstituteCode();
      this.logger.log(
        `[${requestId}] 🔑 Generated institute code: ${generatedCode}`,
      );

      // 🔒 Check for email conflicts
      const existingInstitute = await this.institutesService['instituteRepository'].findOne({
        where: { email: createInstituteDto.email.toLowerCase() }
      });

      if (existingInstitute) {
        this.logger.warn(
          `[${requestId}] ⚠️ Duplicate email: ${createInstituteDto.email}`,
        );
        throw new BadRequestException(
          `Institute with email ${createInstituteDto.email} already exists`
        );
      }

      // 🚀 Create institute with generated code
      this.logger.log(
        `[${requestId}] 🚀 Creating institute: ${createInstituteDto.name}`,
      );

      // Merge DTO with generated code
      const instituteData: any = {
        ...createInstituteDto,
        code: generatedCode,
      };

      const institute = await this.institutesService.create(
        instituteData,
        createInstituteDto.imageUrl || null,
        null, // imageUrls not supported in public API
        createInstituteDto.logoUrl || null,
        createInstituteDto.loadingGifUrl || null,
      );

      // ✅ Success logging
      this.logger.log(
        `[${requestId}] ✅ Institute created successfully - ` +
        `ID: ${institute.id}, Name: "${institute.name}", Code: "${institute.code}"`,
      );

      const response = new InstituteResponseDto(institute);

      return {
        success: true,
        message: 'Institute created successfully with auto-generated code',
        data: response,
        requestId,
      };
    } catch (error) {
      // ❌ Error logging
      this.logger.error(
        `[${requestId}] ❌ Institute creation failed - ` +
        `Error: ${error.message}, ` +
        `Name: "${createInstituteDto.name}", ` +
        `Email: "${createInstituteDto.email}", IP: ${ipAddress}`,
        error.stack,
      );

      throw error;
    }
  }

  /**
   * 🔑 Generate unique institute code
   * Format: INST-YYYYMMDD-XXX
   * Example: INST-20260118-001
   */
  @Get('by-domain/:domain')
  @ApiOperation({
    summary: '🏫 Get institute by custom domain',
    description: `
      Fetch institute branding and configuration by custom domain.
      Used for custom domain login page rendering.
      
      Example: GET /public/institutes/by-domain/lms2.thilinadhananjaya.lk
    `,
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Institute found with branding config',
    schema: {
      example: {
        id: 109,
        code: 'VHDAGS88',
        name: 'Thilina Dhananjaya Institute',
        customDomain: 'lms2.thilinadhananjaya.lk',
        customDomainVerified: true,
        tier: 'ENTERPRISE',
        logoUrl: 'https://...',
        primaryColorCode: '#1E40AF',
        secondaryColorCode: '#3B82F6',
        loginWelcomeTitle: 'Welcome',
        loginWelcomeSubtitle: 'Sign in to your account',
      },
    },
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Custom domain not found or not verified',
  })
  async getByCustomDomain(@Param('domain') domain: string) {
    if (!domain) {
      throw new BadRequestException('Domain is required');
    }

    const institute = await this.institutesService['instituteRepository'].findOne({
      where: {
        customDomain: domain,
        customDomainVerified: true, // Only return verified domains
      },
      select: [
        'id',
        'code',
        'name',
        'customDomain',
        'customDomainVerified',
        'tier',
        'logoUrl',
        'primaryColorCode',
        'secondaryColorCode',
        'loginWelcomeTitle',
        'loginWelcomeSubtitle',
        'loginLogoUrl',
        'loginBackgroundUrl',
        'loginFooterText',
      ],
    });

    if (!institute) {
      throw new BadRequestException(`Domain ${domain} not found or not verified`);
    }

    return {
      success: true,
      data: institute,
    };
  }

  private async generateInstituteCode(): Promise<string> {
    const today = getCurrentSriLankaTime();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const dateStr = `${year}${month}${day}`;

    // Find the last code for today
    const prefix = `INST-${dateStr}-`;
    const lastInstitute = await this.institutesService['instituteRepository']
      .createQueryBuilder('institute')
      .where('institute.code LIKE :prefix', { prefix: `${prefix}%` })
      .orderBy('institute.code', 'DESC')
      .getOne();

    let sequence = 1;
    if (lastInstitute && lastInstitute.code) {
      const lastSequence = parseInt(lastInstitute.code.split('-')[2], 10);
      if (!isNaN(lastSequence)) {
        sequence = lastSequence + 1;
      }
    }

    const sequenceStr = String(sequence).padStart(3, '0');
    return `${prefix}${sequenceStr}`;
  }
}
