import { Controller, Get, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { FlexibleAccessGuard } from './guards/flexible-access.guard';
import { RequireAnyOfRoles } from './decorators/flexible-access.decorator';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtRequest } from '@common/interfaces/jwt-request.interface';

@ApiTags('Institute Information')
@Controller('auth/institute')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class InstituteSelectionController {

  @Get('available')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    anyInstituteRole: true,
    global: []
  })
  @ApiOperation({ summary: 'Get available institutes for current user' })
  @ApiResponse({ status: 200, description: 'Available institutes retrieved successfully' })
  async getAvailableInstitutes(@Req() req: JwtRequest) {
    // Return institutes with class information from the main JWT token
    const user = req.user;
    
    return {
      message: 'Available institutes retrieved successfully',
      institutes: user.i || [],
      note: 'Class information is already included in each institute access'
    };
  }

  @Get('current')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    anyInstituteRole: true,
    global: []
  })
  @ApiOperation({ summary: 'Get current user institute access information' })
  @ApiResponse({ status: 200, description: 'User institute access information' })
  async getCurrentUserInfo(@Req() req: JwtRequest) {
    const user = req.user;
    
    return {
      message: 'User institute access information',
      userId: user.s,
      email: user.s /* TODO: fetch email from database */,
      userType: user.u,
      instituteAccess: user.i || [],
      totalInstitutes: user.i?.length || 0,
      totalClasses: user.i?.reduce((total: number, institute: any) => 
        total + (institute.classIds?.length || 0), 0) || 0
    };
  }
}
