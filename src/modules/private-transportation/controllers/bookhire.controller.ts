import { 
  Controller, 
  Get, 
  Post, 
  Put, 
  Delete, 
  Body, 
  Param, 
  Query,
  Req,
  HttpCode,
  HttpStatus,
  BadRequestException,
  UseGuards
} from '@nestjs/common';
import { 
  ApiTags, 
  ApiOperation, 
  ApiResponse, 
  ApiBearerAuth,
  ApiQuery,
  ApiParam,
  ApiBody
} from '@nestjs/swagger';
import { BookhireService } from '../services/bookhire.service';
import { CreateBookhireDto, UpdateBookhireDto, BookhireResponseDto, BookhireListResponseDto } from '../dto/bookhire.dto';
import { BookhireOwnerJwtGuard } from '../guards/bookhire-owner-jwt.guard';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { FlexibleAccessGuard } from '../../../auth/guards/flexible-access.guard';
import { RequireAnyOfRoles } from '../../../auth/decorators/flexible-access.decorator';
import { UserType } from '../../../modules/user/enums/user-type.enum';
import { CloudStorageService } from '../../../common/services/cloud-storage.service';

// ⚠️ MULTER REMOVED: All file uploads now use signed URL client-side direct upload
// Vehicle images should be uploaded via /upload/generate-signed-url with folder='bookhire-vehicle-images' first, then imageUrl passed to this endpoint
// See docs/SIGNED_URL_UPLOAD_SYSTEM.md for migration guide

interface BookhireOwnerRequest extends Request {
  user: {
    sub: string;
    email: string;
    type: string;
    bookhireIds?: string[];
  };
}

@ApiTags('bookhire-management')
@Controller('api/bookhires')
export class BookhireController {
  constructor(
    private readonly bookhireService: BookhireService,
    private readonly cloudStorageService: CloudStorageService,
  ) {}

  // Bookhire Owner Endpoints
  /**
   * ✅ UPDATED: No file upload - imageUrl comes as string after client-side upload
   * Flow: 1) POST /upload/generate-signed-url with folder='bookhire-vehicle-images' → 2) Upload to GCS → 3) POST /bookhires with imageUrl
   * See docs/SIGNED_URL_UPLOAD_SYSTEM.md for migration guide
   */
  @Post()
  @UseGuards(BookhireOwnerJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ 
    summary: 'Create a new bookhire (imageUrl as string - upload via signed URL first)'
  })
  @ApiBody({
    description: 'Create bookhire with imageUrl (string) after uploading via signed URL',
    schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Title of the bookhire service' },
        year: { type: 'number', description: 'Year of the vehicle' },
        vehicleNumber: { type: 'string', description: 'Vehicle number/registration' },
        description: { type: 'string', description: 'Description of the service' },
        capacity: { type: 'number', description: 'Vehicle capacity' },
        route: { type: 'string', description: 'Route description' },
        imageUrl: { type: 'string', description: 'Image URL (from signed URL upload)' },
      },
      required: ['title', 'year', 'vehicleNumber'],
    },
  })
  @ApiResponse({ status: 201, description: 'Bookhire created successfully', type: BookhireResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 409, description: 'Vehicle number already registered' })
  async create(
    @Body() createBookhireDto: CreateBookhireDto, 
    @Req() req: BookhireOwnerRequest
  ): Promise<BookhireResponseDto> {
    // imageUrl now comes as string in DTO (no file upload processing)
    const bookhireData = {
      ...createBookhireDto,
      imageUrl: createBookhireDto.imageUrl, // String URL from signed URL upload
    };

    // Use authenticated owner's ID from JWT token
    const ownerId = req.user.sub;
    return this.bookhireService.createAsDto(ownerId, bookhireData);
  }

  @Get('my-bookhires')
  @UseGuards(BookhireOwnerJwtGuard)
  @ApiOperation({ summary: 'Get bookhires owned by authenticated owner' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number', type: Number })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page', type: Number })
  @ApiResponse({ status: 200, description: 'List of owned bookhires', type: BookhireListResponseDto })
  async getMyBookhires(
    @Req() req: BookhireOwnerRequest,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10
  ): Promise<BookhireListResponseDto> {
    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.min(100, Math.max(1, Number(limit) || 10));
    
    return this.bookhireService.findByOwnerAsDto(req.user.sub, pageNum, limitNum);
  }

  @Get('my-bookhires/:id')
  @UseGuards(BookhireOwnerJwtGuard)
  @ApiOperation({ summary: 'Get specific bookhire owned by authenticated owner' })
  @ApiParam({ name: 'id', description: 'Bookhire ID' })
  @ApiResponse({ status: 200, description: 'Bookhire details', type: BookhireResponseDto })
  @ApiResponse({ status: 404, description: 'Bookhire not found' })
  @ApiResponse({ status: 403, description: 'Not your bookhire' })
  async getMyBookhire(@Param('id') id: number, @Req() req: BookhireOwnerRequest): Promise<BookhireResponseDto> {
    return this.bookhireService.findOneAsDto(+id, req.user.sub);
  }

  /**
   * ✅ UPDATED: No file upload - imageUrl comes as string after client-side upload
   * Flow: 1) POST /upload/generate-signed-url with folder='bookhire-vehicle-images' → 2) Upload to GCS → 3) PUT /bookhires/my-bookhires/:id with imageUrl
   * See docs/SIGNED_URL_UPLOAD_SYSTEM.md for migration guide
   */
  @Put('my-bookhires/:id')
  @UseGuards(BookhireOwnerJwtGuard)
  @ApiOperation({ 
    summary: 'Update bookhire (imageUrl as string - upload via signed URL first)'
  })
  @ApiBody({
    description: 'Update bookhire with imageUrl (string) after uploading via signed URL',
    schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Title of the bookhire service' },
        year: { type: 'number', description: 'Year of the vehicle' },
        vehicleNumber: { type: 'string', description: 'Vehicle number/registration' },
        description: { type: 'string', description: 'Description of the service' },
        capacity: { type: 'number', description: 'Vehicle capacity' },
        route: { type: 'string', description: 'Route description' },
        imageUrl: { type: 'string', description: 'Image URL (from signed URL upload)' },
        isActive: { type: 'boolean', description: 'Active status' },
      },
    },
  })
  @ApiParam({ name: 'id', description: 'Bookhire ID' })
  @ApiResponse({ status: 200, description: 'Bookhire updated successfully', type: BookhireResponseDto })
  @ApiResponse({ status: 404, description: 'Bookhire not found' })
  @ApiResponse({ status: 403, description: 'Not your bookhire' })
  async updateMyBookhire(
    @Param('id') id: number,
    @Body() updateBookhireDto: UpdateBookhireDto,
    @Req() req: BookhireOwnerRequest
  ): Promise<BookhireResponseDto> {
    // imageUrl now comes as string in DTO (no file upload processing)
    const updateData = {
      ...updateBookhireDto,
      ...(updateBookhireDto.imageUrl && { imageUrl: updateBookhireDto.imageUrl }),
    };

    return this.bookhireService.updateAsDto(+id, req.user.sub, updateData);
  }

  @Delete('my-bookhires/:id')
  @UseGuards(BookhireOwnerJwtGuard)
  @ApiOperation({ summary: 'Delete bookhire owned by authenticated owner' })
  @ApiParam({ name: 'id', description: 'Bookhire ID' })
  @ApiResponse({ status: 200, description: 'Bookhire deleted successfully' })
  @ApiResponse({ status: 404, description: 'Bookhire not found' })
  @ApiResponse({ status: 403, description: 'Not your bookhire' })
  async deleteMyBookhire(@Param('id') id: number, @Req() req: BookhireOwnerRequest) {
    await this.bookhireService.remove(+id, req.user.sub);
    return { message: 'Bookhire deleted successfully' };
  }

  @Get('my-bookhires/:id/students')
  @UseGuards(BookhireOwnerJwtGuard)
  @ApiOperation({ summary: 'Get students enrolled in bookhire owned by authenticated owner' })
  @ApiParam({ name: 'id', description: 'Bookhire ID' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number', type: Number })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page', type: Number })
  @ApiQuery({ name: 'status', required: false, description: 'Filter by enrollment status', enum: ['PENDING', 'APPROVED', 'REJECTED', 'ACTIVE', 'SUSPENDED', 'CANCELLED'] })
  @ApiResponse({ 
    status: 200, 
    description: 'List of students enrolled in the bookhire',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
        data: {
          type: 'object',
          properties: {
            students: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  studentId: { type: 'string' },
                  studentName: { type: 'string' },
                  enrollmentStatus: { type: 'string' },
                  pickupTime: { type: 'string' },
                  dropoffTime: { type: 'string' },
                  pickupLocation: { type: 'string' },
                  dropoffLocation: { type: 'string' },
                  monthlyFee: { type: 'number' },
                  enrollmentDate: { type: 'string', format: 'date-time' },
                  parentContact: { type: 'string' },
                  emergencyContact: { type: 'string' },
                  rfid: { type: 'string' },
                  isActive: { type: 'boolean' }
                }
              }
            },
            totalStudents: { type: 'number' },
            currentPage: { type: 'number' },
            totalPages: { type: 'number' },
            hasNextPage: { type: 'boolean' },
            hasPrevPage: { type: 'boolean' }
          }
        }
      }
    }
  })
  @ApiResponse({ status: 404, description: 'Bookhire not found' })
  @ApiResponse({ status: 403, description: 'Not your bookhire' })
  async getMyBookhireStudents(
    @Param('id') bookhireId: number, 
    @Req() req: BookhireOwnerRequest,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('status') status?: string
  ) {
    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.min(100, Math.max(1, Number(limit) || 10));
    
    return this.bookhireService.getBookhireStudents(+bookhireId, req.user.sub, pageNum, limitNum, status);
  }

  // Public/Student Endpoints
  @Get('available')
  @ApiOperation({ summary: 'Get available approved bookhires for student enrollment' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number', type: Number })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page', type: Number })
  @ApiQuery({ name: 'instituteId', required: false, description: 'Filter by institute (reserved for future use)', type: String })
  @ApiResponse({ status: 200, description: 'List of available bookhires', type: BookhireListResponseDto })
  async getAvailableBookhires(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('instituteId') _instituteId?: string,
  ): Promise<BookhireListResponseDto> {
    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.min(100, Math.max(1, Number(limit) || 10));
    
    return this.bookhireService.findApprovedBookhiresAsDto(pageNum, limitNum);
  }

  @Get('vehicle/:vehicleNumber')
  @ApiOperation({ summary: 'Get bookhire by vehicle number (for enrollment)' })
  @ApiParam({ name: 'vehicleNumber', description: 'Vehicle number' })
  @ApiResponse({ status: 200, description: 'Bookhire found', type: BookhireResponseDto })
  @ApiResponse({ status: 404, description: 'Bookhire not found' })
  async getByVehicleNumber(@Param('vehicleNumber') vehicleNumber: string): Promise<BookhireResponseDto> {
    return this.bookhireService.findByVehicleNumberAsDto(vehicleNumber);
  }

  // ===================================
  // ADMIN ENDPOINTS - SUPERADMIN ONLY
  // ===================================
  
  // ✅ PROTECTED: SUPERADMIN only
  @Get('admin/all')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN] })
  @ApiBearerAuth('jwt')
  @ApiOperation({ summary: 'Get all bookhires (SUPERADMIN ONLY)' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number', type: Number })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page', type: Number })
  @ApiResponse({ status: 200, description: 'List of all bookhires', type: BookhireListResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid or missing token' })
  @ApiResponse({ status: 403, description: 'Forbidden - SUPERADMIN role required' })
  async getAllBookhires(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10
  ): Promise<BookhireListResponseDto> {
    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.min(100, Math.max(1, Number(limit) || 10));
    
    return this.bookhireService.findAllAsDto(pageNum, limitNum);
  }

  // ✅ PROTECTED: SUPERADMIN only
  @Put('admin/:id/approve')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN] })
  @ApiBearerAuth('jwt')
  @ApiOperation({ summary: 'Approve bookhire (SUPERADMIN ONLY)' })
  @ApiParam({ name: 'id', description: 'Bookhire ID' })
  @ApiResponse({ status: 200, description: 'Bookhire approved successfully', type: BookhireResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid or missing token' })
  @ApiResponse({ status: 403, description: 'Forbidden - SUPERADMIN role required' })
  @ApiResponse({ status: 404, description: 'Bookhire not found' })
  async approveBookhire(@Param('id') id: number): Promise<{ message: string; bookhire: BookhireResponseDto }> {
    const bookhire = await this.bookhireService.approveBookhire(+id);
    return { 
      message: 'Bookhire approved successfully', 
      bookhire: this.bookhireService['transformEntityToDto'](bookhire) 
    };
  }

  // ✅ PROTECTED: SUPERADMIN only
  @Put('admin/:id/reject')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN] })
  @ApiBearerAuth('jwt')
  @ApiOperation({ summary: 'Reject/Disapprove bookhire (SUPERADMIN ONLY)' })
  @ApiParam({ name: 'id', description: 'Bookhire ID' })
  @ApiResponse({ status: 200, description: 'Bookhire rejected successfully', type: BookhireResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid or missing token' })
  @ApiResponse({ status: 403, description: 'Forbidden - SUPERADMIN role required' })
  @ApiResponse({ status: 404, description: 'Bookhire not found' })
  async rejectBookhire(@Param('id') id: number): Promise<{ message: string; bookhire: BookhireResponseDto }> {
    const bookhire = await this.bookhireService.rejectBookhire(+id);
    return { 
      message: 'Bookhire rejected successfully', 
      bookhire: this.bookhireService['transformEntityToDto'](bookhire) 
    };
  }

  // ✅ PROTECTED: SUPERADMIN only
  @Put('admin/:id/deactivate')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN] })
  @ApiBearerAuth('jwt')
  @ApiOperation({ summary: 'Deactivate bookhire (SUPERADMIN ONLY)' })
  @ApiParam({ name: 'id', description: 'Bookhire ID' })
  @ApiResponse({ status: 200, description: 'Bookhire deactivated successfully', type: BookhireResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid or missing token' })
  @ApiResponse({ status: 403, description: 'Forbidden - SUPERADMIN role required' })
  @ApiResponse({ status: 404, description: 'Bookhire not found' })
  async deactivateBookhire(@Param('id') id: number): Promise<{ message: string; bookhire: BookhireResponseDto }> {
    const bookhire = await this.bookhireService.deactivateBookhire(+id);
    return { 
      message: 'Bookhire deactivated successfully', 
      bookhire: this.bookhireService['transformEntityToDto'](bookhire) 
    };
  }
}

