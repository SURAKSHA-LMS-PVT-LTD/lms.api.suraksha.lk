import { ParseBigIntPipe } from '../../../common/pipes/parse-bigint.pipe';
import { Controller, Post, Get, Param, HttpStatus, HttpCode, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { FlexibleAccessGuard } from '../../../auth/guards/flexible-access.guard';
import { RequireAnyOfRoles } from '../../../auth/decorators/flexible-access.decorator';
import { UserType } from '../../user/enums/user-type.enum';
import { IdCardGeneratorService } from '../services/id-card-generator.service';

@ApiTags('ID Card Generator')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('id-cards')
export class IdCardController {
  constructor(private readonly idCardGeneratorService: IdCardGeneratorService) {}

  @Post('generate/:userId')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true
  })
  @ApiOperation({ 
    summary: 'Generate ID card for a specific user', 
    description: 'Generates a PDF ID card with QR code and uploads to Google Drive' 
  })
  @ApiResponse({ 
    status: HttpStatus.CREATED, 
    description: 'ID card generated successfully',
    schema: {
      example: {
        success: true,
        message: 'ID card generated successfully',
        url: 'https://drive.google.com/file/d/1ABC123.../view'
      }
    }
  })
  @ApiResponse({ 
    status: HttpStatus.NOT_FOUND, 
    description: 'User not found' 
  })
  @ApiParam({ name: 'userId', description: 'User ID' })
  @HttpCode(HttpStatus.CREATED)
  async generateUserIdCard(@Param('userId', ParseBigIntPipe) userId: string) {
    const url = await this.idCardGeneratorService.generateUserIdCard(userId);
    return {
      success: true,
      message: 'ID card generated successfully',
      url,
    };
  }

  @Post('regenerate/:userId')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true
  })
  @ApiOperation({ 
    summary: 'Regenerate ID card for a specific user', 
    description: 'Regenerates and overwrites existing ID card for a user' 
  })
  @ApiResponse({ 
    status: HttpStatus.CREATED, 
    description: 'ID card regenerated successfully' 
  })
  @ApiParam({ name: 'userId', description: 'User ID' })
  @HttpCode(HttpStatus.CREATED)
  async regenerateUserIdCard(@Param('userId', ParseBigIntPipe) userId: string) {
    const url = await this.idCardGeneratorService.regenerateUserIdCard(userId);
    return {
      success: true,
      message: 'ID card regenerated successfully',
      url,
    };
  }

  @Post('generate-all')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN]
  })
  @ApiOperation({ 
    summary: 'Generate ID cards for all active users', 
    description: 'Bulk generates ID cards for all active users in the system' 
  })
  @ApiResponse({ 
    status: HttpStatus.CREATED, 
    description: 'Bulk ID card generation completed',
    schema: {
      example: {
        success: true,
        message: 'Bulk ID card generation completed',
        results: {
          success: ['1', '2', '3'],
          failed: ['4']
        },
        summary: {
          total: 4,
          successful: 3,
          failed: 1
        }
      }
    }
  })
  @HttpCode(HttpStatus.CREATED)
  async generateAllIdCards() {
    const results = await this.idCardGeneratorService.generateIdCardsForAllUsers();
    return {
      success: true,
      message: 'Bulk ID card generation completed',
      results,
      summary: {
        total: results.success.length + results.failed.length,
        successful: results.success.length,
        failed: results.failed.length,
      },
    };
  }

  @Get('status/:userId')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    anyInstituteRole: true
  })
  @ApiOperation({ 
    summary: 'Check ID card status for a user', 
    description: 'Returns whether user has an ID card and its URL' 
  })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'ID card status retrieved successfully' 
  })
  @ApiParam({ name: 'userId', description: 'User ID' })
  @HttpCode(HttpStatus.OK)
  async getIdCardStatus(@Param('userId', ParseBigIntPipe) userId: string) {
    // This would typically query the user entity for the idUrl
    // For now, returning a placeholder response
    return {
      success: true,
      userId,
      hasIdCard: false, // This should be checked from the database
      url: null,
    };
  }

  @Get('template-info')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true
  })
  @ApiOperation({ 
    summary: 'Get template information', 
    description: 'Returns template dimensions and page count for overlay positioning' 
  })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Template information retrieved successfully',
    schema: {
      example: {
        success: true,
        templateInfo: {
          pageCount: 2,
          firstPageDimensions: { width: 612, height: 792 },
          secondPageDimensions: { width: 612, height: 792 }
        }
      }
    }
  })
  @HttpCode(HttpStatus.OK)
  async getTemplateInfo() {
    const templateInfo = await this.idCardGeneratorService.getTemplateInfo();
    return {
      success: true,
      templateInfo,
    };
  }
}
