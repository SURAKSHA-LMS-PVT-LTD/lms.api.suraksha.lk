import { 
  Controller, 
  Post, 
  Get, 
  Put, 
  Body, 
  Param,
  Req, 
  Query,
  HttpCode,
  HttpStatus,
  UseGuards
} from '@nestjs/common';
import { 
  ApiTags, 
  ApiOperation, 
  ApiResponse, 
  ApiBearerAuth,
  ApiQuery 
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { BookhireOwnerService } from '../services/bookhire-owner.service';
import { 
  CreateBookhireOwnerDto, 
  UpdateBookhireOwnerDto, 
  BookhireOwnerLoginDto,
  ChangeBookhireOwnerPasswordDto,
  BookhireOwnerResponseDto,
  BookhireOwnerListResponseDto
} from '../dto/bookhire-owner.dto';
import { BookhireOwnerJwtGuard } from '../guards/bookhire-owner-jwt.guard';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { FlexibleAccessGuard } from '../../../auth/guards/flexible-access.guard';
import { RequireAnyOfRoles } from '../../../auth/decorators/flexible-access.decorator';
import { UserType } from '../../../modules/user/enums/user-type.enum';
import { Public } from '../../../common/decorators/public.decorator';

interface BookhireOwnerRequest extends Request {
  user: {
    sub: string;
    email: string;
    type: string;
  };
}

@ApiTags('bookhire-owner-auth')
@Controller('api/bookhire-owner-auth')
export class BookhireOwnerAuthController {
  constructor(private readonly bookhireOwnerService: BookhireOwnerService) {}

  // ✅ PUBLIC: Registration endpoint with rate limiting
  @Post('register')
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } }) // 5 requests per minute
  @ApiOperation({ summary: 'Register a new bookhire owner (PUBLIC - Rate Limited)' })
  @ApiResponse({ 
    status: 201, 
    description: 'Bookhire owner registered successfully',
    schema: {
      type: 'object',
      properties: {
        owner: { type: 'object' },
        token: { type: 'string' }
      }
    }
  })
  @ApiResponse({ status: 409, description: 'Email or contact number already registered' })
  @ApiResponse({ status: 400, description: 'Bad Request - Validation failed' })
  @ApiResponse({ status: 429, description: 'Too Many Requests - Rate limit exceeded' })
  async register(@Body() createBookhireOwnerDto: CreateBookhireOwnerDto) {
    return this.bookhireOwnerService.register(createBookhireOwnerDto);
  }

  // ✅ PUBLIC: Login endpoint with rate limiting
  @Post('login')
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 requests per minute
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login bookhire owner (PUBLIC - Rate Limited)' })
  @ApiResponse({ 
    status: 200, 
    description: 'Login successful',
    schema: {
      type: 'object',
      properties: {
        owner: { type: 'object' },
        token: { type: 'string' }
      }
    }
  })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  @ApiResponse({ status: 429, description: 'Too Many Requests - Rate limit exceeded' })
  async login(@Body() loginDto: BookhireOwnerLoginDto) {
    return this.bookhireOwnerService.login(loginDto);
  }

  // ✅ PROTECTED: Requires authentication
  @Get('profile')
  @UseGuards(BookhireOwnerJwtGuard)
  @ApiBearerAuth('bookhire-owner-jwt')
  @ApiOperation({ summary: 'Get bookhire owner profile (PROTECTED)' })
  @ApiResponse({ status: 200, description: 'Profile retrieved successfully', type: BookhireOwnerResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid or missing token' })
  async getProfile(@Req() req: BookhireOwnerRequest): Promise<{ success: boolean; message: string; data: BookhireOwnerResponseDto }> {
    const data = await this.bookhireOwnerService.findByIdAsDto(req.user.sub);
    return {
      success: true,
      message: 'Profile retrieved successfully',
      data
    };
  }

  // ✅ PROTECTED: Requires authentication
  @Put('profile')
  @UseGuards(BookhireOwnerJwtGuard)
  @ApiBearerAuth('bookhire-owner-jwt')
  @ApiOperation({ summary: 'Update bookhire owner profile (PROTECTED)' })
  @ApiResponse({ status: 200, description: 'Profile updated successfully', type: BookhireOwnerResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid or missing token' })
  async updateProfile(
    @Req() req: BookhireOwnerRequest,
    @Body() updateDto: UpdateBookhireOwnerDto
  ): Promise<{ success: boolean; message: string; data: BookhireOwnerResponseDto }> {
    const data = await this.bookhireOwnerService.updateProfileAsDto(req.user.sub, updateDto);
    return {
      success: true,
      message: 'Profile updated successfully',
      data
    };
  }

  // ✅ PROTECTED: Requires authentication with rate limiting
  @Put('change-password')
  @UseGuards(BookhireOwnerJwtGuard)
  @Throttle({ default: { limit: 3, ttl: 60000 } }) // 3 password changes per minute
  @ApiBearerAuth('bookhire-owner-jwt')
  @ApiOperation({ summary: 'Change password (PROTECTED - Rate Limited)' })
  @ApiResponse({ status: 200, description: 'Password changed successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized or current password incorrect' })
  @ApiResponse({ status: 429, description: 'Too Many Requests - Rate limit exceeded' })
  async changePassword(
    @Req() req: BookhireOwnerRequest,
    @Body() changePasswordDto: ChangeBookhireOwnerPasswordDto
  ) {
    await this.bookhireOwnerService.changePassword(req.user.sub, changePasswordDto);
    return { message: 'Password changed successfully' };
  }
}

@ApiTags('bookhire-owners-admin')
@Controller('bookhire-owners')
@UseGuards(JwtAuthGuard, FlexibleAccessGuard)
@RequireAnyOfRoles({
  global: [UserType.SUPERADMIN]
})
export class BookhireOwnerAdminController {
  constructor(private readonly bookhireOwnerService: BookhireOwnerService) {}

  // ✅ PROTECTED: SUPERADMIN only
  @Get()
  @ApiBearerAuth('jwt')
  @ApiOperation({ summary: 'Get all bookhire owners (SUPERADMIN ONLY)' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number', type: Number })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page', type: Number })
  @ApiResponse({ status: 200, description: 'List of bookhire owners', type: BookhireOwnerListResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid or missing token' })
  @ApiResponse({ status: 403, description: 'Forbidden - SUPERADMIN role required' })
  async findAll(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10
  ): Promise<{ success: boolean; message: string; data: BookhireOwnerListResponseDto }> {
    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.min(100, Math.max(1, Number(limit) || 10));
    
    const data = await this.bookhireOwnerService.findAllAsDto(pageNum, limitNum);
    return {
      success: true,
      message: 'Bookhire owners retrieved successfully',
      data
    };
  }

  // ✅ PROTECTED: SUPERADMIN only
  @Put(':id/deactivate')
  @ApiBearerAuth('jwt')
  @ApiOperation({ summary: 'Deactivate bookhire owner (SUPERADMIN ONLY)' })
  @ApiResponse({ status: 200, description: 'Bookhire owner deactivated successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid or missing token' })
  @ApiResponse({ status: 403, description: 'Forbidden - SUPERADMIN role required' })
  @ApiResponse({ status: 404, description: 'Bookhire owner not found' })
  async deactivate(@Param('id') id: string) {
    await this.bookhireOwnerService.deactivate(id);
    return { message: 'Bookhire owner deactivated successfully' };
  }

  // ✅ PROTECTED: SUPERADMIN only
  @Put(':id/activate')
  @ApiBearerAuth('jwt')
  @ApiOperation({ summary: 'Activate bookhire owner (SUPERADMIN ONLY)' })
  @ApiResponse({ status: 200, description: 'Bookhire owner activated successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid or missing token' })
  @ApiResponse({ status: 403, description: 'Forbidden - SUPERADMIN role required' })
  @ApiResponse({ status: 404, description: 'Bookhire owner not found' })
  async activate(@Param('id') id: string) {
    await this.bookhireOwnerService.activate(id);
    return { message: 'Bookhire owner activated successfully' };
  }
}

