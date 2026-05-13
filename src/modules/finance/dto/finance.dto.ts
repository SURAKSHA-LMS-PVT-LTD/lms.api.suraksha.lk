import {
  IsString, IsNotEmpty, IsOptional, IsEnum, IsNumber, IsPositive,
  IsBoolean, Min, Max, MaxLength, IsIn,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { FinanceAccountType } from '../entities/finance-account.entity';
import { FinanceCategoryType } from '../entities/finance-category.entity';

// ─────────────────────────────────────────────────────────────────
// Accounts
// ─────────────────────────────────────────────────────────────────

export class CreateFinanceAccountDto {
  @ApiProperty({ example: 'BOC Main Account' })
  @IsString() @IsNotEmpty() @MaxLength(120)
  name: string;

  @ApiProperty({ enum: FinanceAccountType })
  @IsEnum(FinanceAccountType)
  type: FinanceAccountType;

  @ApiPropertyOptional({ example: 'Bank of Ceylon' })
  @IsOptional() @IsString() @MaxLength(120)
  bankName?: string;

  @ApiPropertyOptional({ example: '012345678' })
  @IsOptional() @IsString() @MaxLength(60)
  accountNumber?: string;
}

export class UpdateFinanceAccountDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) bankName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(60)  accountNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

export class SettleFundsDto {
  @ApiProperty({ description: 'Source account ID (usually Cash Locker)' })
  @IsString() @IsNotEmpty()
  fromAccountId: string;

  @ApiProperty({ description: 'Target account ID (bank account)' })
  @IsString() @IsNotEmpty()
  toAccountId: string;

  @ApiProperty({ example: 5000 })
  @IsNumber({ maxDecimalPlaces: 2 }) @IsPositive()
  amount: number;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) adminNote?: string;
}

// ─────────────────────────────────────────────────────────────────
// Categories
// ─────────────────────────────────────────────────────────────────

export class CreateFinanceCategoryDto {
  @ApiProperty({ example: 'Tuition Fee' })
  @IsString() @IsNotEmpty() @MaxLength(100)
  name: string;

  @ApiProperty({ enum: FinanceCategoryType })
  @IsEnum(FinanceCategoryType)
  type: FinanceCategoryType;

  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
}

export class UpdateFinanceCategoryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString()                 description?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean()                isActive?: boolean;
}

// ─────────────────────────────────────────────────────────────────
// Physical collection (Staff / Attendance Marker)
// ─────────────────────────────────────────────────────────────────

export class CollectPhysicalPaymentDto {
  @ApiProperty({ description: 'Student user ID' })
  @IsString() @IsNotEmpty()
  studentId: string;

  @ApiPropertyOptional({ description: 'Student display name for ledger' })
  @IsOptional() @IsString() @MaxLength(200)
  studentName?: string;

  @ApiProperty({ description: 'Class ID' })
  @IsString() @IsNotEmpty()
  classId: string;

  @ApiProperty({ example: 2500 })
  @IsNumber({ maxDecimalPlaces: 2 }) @IsPositive()
  amount: number;

  @ApiProperty({ description: 'Finance account to credit (target)' })
  @IsString() @IsNotEmpty()
  targetAccountId: string;

  @ApiPropertyOptional({ description: 'Finance category ID' })
  @IsOptional() @IsString()
  categoryId?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) adminNote?: string;
}

// ─────────────────────────────────────────────────────────────────
// Approval with finance routing
// ─────────────────────────────────────────────────────────────────

export class ApproveWithFinanceDto {
  @ApiProperty({ description: 'Finance account to credit' })
  @IsString() @IsNotEmpty()
  targetAccountId: string;

  @ApiPropertyOptional({ description: 'Teacher commission % override (0-100). If omitted, uses class default.' })
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100)
  commissionPctOverride?: number;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) notes?: string;
}

// ─────────────────────────────────────────────────────────────────
// Payout
// ─────────────────────────────────────────────────────────────────

export class TeacherPayoutDto {
  @ApiProperty({ description: 'Teacher user ID' })
  @IsString() @IsNotEmpty()
  teacherId: string;

  @ApiProperty({ example: 10000 })
  @IsNumber({ maxDecimalPlaces: 2 }) @IsPositive()
  amount: number;

  @ApiProperty({ description: 'Finance account to debit (pay from)' })
  @IsString() @IsNotEmpty()
  fromAccountId: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) adminNote?: string;
}

// ─────────────────────────────────────────────────────────────────
// Deduction
// ─────────────────────────────────────────────────────────────────

export class TeacherDeductionDto {
  @ApiProperty({ description: 'Teacher user ID' })
  @IsString() @IsNotEmpty()
  teacherId: string;

  @ApiProperty({ example: 500 })
  @IsNumber({ maxDecimalPlaces: 2 }) @IsPositive()
  amount: number;

  @ApiPropertyOptional({ description: 'Finance account to credit (e.g. institute printing fund)' })
  @IsOptional() @IsString()
  toAccountId?: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  categoryId?: string;

  @ApiProperty({ description: 'Reason for deduction' })
  @IsString() @IsNotEmpty() @MaxLength(1000)
  adminNote: string;
}

// ─────────────────────────────────────────────────────────────────
// Ledger query
// ─────────────────────────────────────────────────────────────────

export class LedgerQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() startDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() endDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() createdByUserId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() teacherId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() accountId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() categoryId?: string;
  @ApiPropertyOptional() @IsOptional() @IsIn(['CREDIT', 'DEBIT']) type?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() txSource?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 50 })
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) @Max(200)
  limit?: number = 50;
}

// ─────────────────────────────────────────────────────────────────
// Teacher Advance
// ─────────────────────────────────────────────────────────────────

export class TeacherAdvanceDto {
  @ApiProperty({ description: 'Teacher user ID' })
  @IsString() @IsNotEmpty()
  teacherId: string;

  @ApiProperty({ example: 5000 })
  @IsNumber({ maxDecimalPlaces: 2 }) @IsPositive()
  amount: number;

  @ApiProperty({ description: 'Finance account to debit for the advance' })
  @IsString() @IsNotEmpty()
  fromAccountId: string;

  @ApiProperty({ description: 'Reason / reference for advance' })
  @IsString() @IsNotEmpty() @MaxLength(300)
  description: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000)
  adminNote?: string;
}

// ─────────────────────────────────────────────────────────────────
// Manual Record
// ─────────────────────────────────────────────────────────────────

export class ManualRecordDto {
  @ApiProperty({ enum: ['INCOME', 'EXPENSE'] })
  @IsIn(['INCOME', 'EXPENSE'])
  recordType: 'INCOME' | 'EXPENSE';

  @ApiProperty({ example: 3500 })
  @IsNumber({ maxDecimalPlaces: 2 }) @IsPositive()
  amount: number;

  @ApiPropertyOptional({ description: 'Finance category ID' })
  @IsOptional() @IsString()
  categoryId?: string;

  @ApiProperty({ description: 'Finance account to credit (income) or debit (expense)' })
  @IsString() @IsNotEmpty()
  accountId: string;

  @ApiProperty({ description: 'Short description of the record' })
  @IsString() @IsNotEmpty() @MaxLength(300)
  description: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000)
  adminNote?: string;

  @ApiPropertyOptional({ description: 'Override transaction date YYYY-MM-DD (defaults to now)' })
  @IsOptional() @IsString()
  recordDate?: string;
}

// ─────────────────────────────────────────────────────────────────
// Analytics
// ─────────────────────────────────────────────────────────────────

export class AnalyticsQueryDto {
  @ApiPropertyOptional({ enum: ['daily', 'weekly', 'monthly', 'yearly'], default: 'monthly' })
  @IsOptional() @IsIn(['daily', 'weekly', 'monthly', 'yearly'])
  period?: string = 'monthly';

  @ApiPropertyOptional({ description: 'Start date YYYY-MM-DD' })
  @IsOptional() @IsString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'End date YYYY-MM-DD' })
  @IsOptional() @IsString()
  endDate?: string;
}
