import {
  Controller, Get, Post, Delete, Body, Param,
  Req, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiBearerAuth } from '@nestjs/swagger';
import {
  IsString, IsNotEmpty, IsOptional, IsArray, IsEnum, IsDateString, MinLength, MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { FlexibleAccessGuard } from '../../../auth/guards/flexible-access.guard';
import { RequireAnyOfRoles } from '../../../auth/decorators/flexible-access.decorator';
import { UserType } from '../../user/enums/user-type.enum';
import { InstituteApiKeyService } from '../services/institute-api-key.service';
import { ApiKeyScope } from '../entities/institute-api-key.entity';

class CreateApiKeyDto {
  @ApiProperty({ description: 'Human-readable name for this API key', example: 'Gate Scanner System' })
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(100)
  name: string;

  @ApiProperty({
    description: 'Permissions this key is allowed to use',
    enum: ApiKeyScope,
    isArray: true,
    example: [ApiKeyScope.ATTENDANCE_MARK],
  })
  @IsArray()
  @IsEnum(ApiKeyScope, { each: true })
  scopes: ApiKeyScope[];

  @ApiPropertyOptional({
    description: 'Optional expiry date (ISO 8601). Leave blank for no expiry.',
    example: '2027-01-01',
  })
  @IsDateString()
  @IsOptional()
  expiresAt?: string;
}

const ADMIN_ROLES = {
  global: [UserType.SUPERADMIN],
  instituteAdmin: true,
};

@ApiTags('Institute API Keys')
@ApiBearerAuth()
@Controller('api/institutes/:instituteId/api-keys')
@UseGuards(JwtAuthGuard, FlexibleAccessGuard)
export class InstituteApiKeyManagementController {
  constructor(private readonly svc: InstituteApiKeyService) {}

  @Get()
  @RequireAnyOfRoles(ADMIN_ROLES)
  @ApiOperation({ summary: 'List all API keys for an institute' })
  @ApiParam({ name: 'instituteId' })
  list(@Param('instituteId') instituteId: string) {
    return this.svc.listKeys(instituteId);
  }

  @Post()
  @RequireAnyOfRoles(ADMIN_ROLES)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Generate a new API key',
    description:
      'Returns the raw key ONCE — it cannot be retrieved again. Store it securely. ' +
      'Only the hash is kept in the database.',
  })
  @ApiParam({ name: 'instituteId' })
  create(
    @Param('instituteId') instituteId: string,
    @Body() dto: CreateApiKeyDto,
    @Req() req: any,
  ) {
    const userId = req.user?.s ?? req.user?.sub;
    return this.svc.createKey(instituteId, dto, userId);
  }

  @Delete(':keyId')
  @RequireAnyOfRoles(ADMIN_ROLES)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke (deactivate) an API key' })
  @ApiParam({ name: 'instituteId' })
  @ApiParam({ name: 'keyId' })
  revoke(
    @Param('instituteId') instituteId: string,
    @Param('keyId') keyId: string,
  ) {
    return this.svc.revokeKey(keyId, instituteId);
  }
}
