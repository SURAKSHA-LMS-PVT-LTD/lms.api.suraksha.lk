import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Query, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import {
  IsString, IsNotEmpty, IsOptional, MaxLength, IsBoolean,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { FlexibleAccessGuard } from '../../../auth/guards/flexible-access.guard';
import { RequireAnyOfRoles } from '../../../auth/decorators/flexible-access.decorator';
import { UserType } from '../../user/enums/user-type.enum';
import { InstituteBankAccountsService } from '../services/institute-bank-accounts.service';

const ADMIN_ROLES = { global: [UserType.SUPERADMIN], instituteAdmin: true };
const MEMBER_ROLES = { global: [UserType.SUPERADMIN], instituteAdmin: true, instituteMember: true };

class CreateBankAccountDto {
  @IsString() @IsNotEmpty() @MaxLength(100)
  @Transform(({ value }) => value?.trim())
  label: string;

  @IsString() @IsNotEmpty() @MaxLength(100)
  @Transform(({ value }) => value?.trim())
  bankName: string;

  @IsString() @IsOptional() @MaxLength(100)
  @Transform(({ value }) => value?.trim() || null)
  branch?: string;

  @IsString() @IsNotEmpty() @MaxLength(150)
  @Transform(({ value }) => value?.trim())
  accountHolderName: string;

  @IsString() @IsNotEmpty() @MaxLength(50)
  @Transform(({ value }) => value?.trim())
  accountNumber: string;
}

class UpdateBankAccountDto {
  @IsString() @IsOptional() @MaxLength(100)
  @Transform(({ value }) => value?.trim())
  label?: string;

  @IsString() @IsOptional() @MaxLength(100)
  @Transform(({ value }) => value?.trim())
  bankName?: string;

  @IsString() @IsOptional() @MaxLength(100)
  @Transform(({ value }) => value?.trim() || null)
  branch?: string | null;

  @IsString() @IsOptional() @MaxLength(150)
  @Transform(({ value }) => value?.trim())
  accountHolderName?: string;

  @IsString() @IsOptional() @MaxLength(50)
  @Transform(({ value }) => value?.trim())
  accountNumber?: string;

  @IsBoolean() @IsOptional()
  isActive?: boolean;
}

@ApiTags('Institute Bank Accounts')
@ApiBearerAuth()
@Controller('api/institutes/:instituteId/bank-accounts')
@UseGuards(JwtAuthGuard, FlexibleAccessGuard)
export class InstituteBankAccountsController {
  constructor(private readonly svc: InstituteBankAccountsService) {}

  @Get()
  @RequireAnyOfRoles(MEMBER_ROLES)
  @ApiOperation({ summary: 'List institute bank accounts (active only, or all with ?all=true for admins)' })
  list(
    @Param('instituteId') instituteId: string,
    @Query('all') all?: string,
  ) {
    return this.svc.list(instituteId, all === 'true');
  }

  @Post()
  @RequireAnyOfRoles(ADMIN_ROLES)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a bank account (institute admin only)' })
  create(
    @Param('instituteId') instituteId: string,
    @Body() dto: CreateBankAccountDto,
  ) {
    return this.svc.create(instituteId, dto);
  }

  @Patch(':id')
  @RequireAnyOfRoles(ADMIN_ROLES)
  @ApiOperation({ summary: 'Update a bank account (institute admin only)' })
  update(
    @Param('instituteId') instituteId: string,
    @Param('id') id: string,
    @Body() dto: UpdateBankAccountDto,
  ) {
    return this.svc.update(id, instituteId, dto);
  }

  @Delete(':id')
  @RequireAnyOfRoles(ADMIN_ROLES)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a bank account (institute admin only)' })
  remove(
    @Param('instituteId') instituteId: string,
    @Param('id') id: string,
  ) {
    return this.svc.remove(id, instituteId);
  }
}
