import { IsString, IsNumber, IsOptional, IsBoolean, Min, Max, Length } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateBookhireDto {
  @ApiProperty({ description: 'Title of the bookhire service' })
  @IsString()
  @Length(3, 200)
  title: string;

  @ApiProperty({ description: 'Year of the vehicle', minimum: 1990, maximum: 3000 })
  @IsNumber()
  @Type(() => Number)
  @Min(1990)
  @Max(2030)
  year: number;

  @ApiProperty({ description: 'Vehicle number/registration' })
  @IsString()
  @Length(3, 20)
  vehicleNumber: string;

  @ApiPropertyOptional({ description: 'Description of the service' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Vehicle capacity (number of passengers)' })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(1)
  @Max(100)
  capacity?: number;

  @ApiPropertyOptional({ description: 'Route description' })
  @IsOptional()
  @IsString()
  route?: string;

  @ApiPropertyOptional({ description: 'Image URL for the vehicle (optional)' })
  @IsOptional()
  @IsString()
  imageUrl?: string;
}

export class UpdateBookhireDto {
  @ApiPropertyOptional({ description: 'Title of the bookhire service' })
  @IsOptional()
  @IsString()
  @Length(3, 200)
  title?: string;

  @ApiPropertyOptional({ description: 'Year of the vehicle' })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(1990)
  @Max(2030)
  year?: number;

  @ApiPropertyOptional({ description: 'Vehicle number/registration' })
  @IsOptional()
  @IsString()
  @Length(3, 20)
  vehicleNumber?: string;

  @ApiPropertyOptional({ description: 'Description of the service' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Vehicle capacity (number of passengers)' })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(1)
  @Max(100)
  capacity?: number;

  @ApiPropertyOptional({ description: 'Route description' })
  @IsOptional()
  @IsString()
  route?: string;

  @ApiPropertyOptional({ description: 'Image URL for the vehicle (optional)' })
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiPropertyOptional({ description: 'Active status' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

// ========================================
// RESPONSE DTOs - Consistent API Responses
// ========================================

export class BookhireResponseDto {
  @ApiProperty({ description: 'Bookhire ID' })
  id: number;

  @ApiPropertyOptional({ description: 'Vehicle number/license plate' })
  vehicleNumber?: string;

  @ApiPropertyOptional({ description: 'Vehicle model' })
  vehicleModel?: string;

  @ApiProperty({ description: 'Monthly fee' })
  monthlyFee: number;

  @ApiPropertyOptional({ description: 'Main vehicle image URL' })
  imageUrl?: string;

  @ApiProperty({ description: 'Whether vehicle is available' })
  isAvailable: boolean;

  @ApiPropertyOptional({ description: 'Owner name' })
  ownerName?: string;

  @ApiPropertyOptional({ description: 'Owner phone' })
  ownerPhone?: string;

  @ApiPropertyOptional({ description: 'Owner email' })
  ownerEmail?: string;

  @ApiPropertyOptional({ description: 'Vehicle route' })
  route?: string;

  @ApiProperty({ description: 'Vehicle capacity' })
  capacity: number;

  @ApiProperty({ description: 'Available seats' })
  availableSeats: number;

  @ApiProperty({ description: 'Whether vehicle is active' })
  isActive: boolean;

  @ApiProperty({ description: 'Approval status' })
  status: string;

  @ApiProperty({ description: 'Creation timestamp' })
  createdAt: Date;

  @ApiProperty({ description: 'Last update timestamp' })
  updatedAt: Date;

  @ApiPropertyOptional({ description: 'Owner ID' })
  ownerId?: string;

  @ApiPropertyOptional({ description: 'Array of vehicle image URLs', type: [String] })
  vehicleImages?: string[];

  @ApiPropertyOptional({ description: 'Vehicle amenities', type: [String] })
  amenities?: string[];

  @ApiPropertyOptional({ description: 'Approved by user ID' })
  approvedBy?: string;

  @ApiPropertyOptional({ description: 'Approval timestamp' })
  approvedAt?: Date;

  @ApiPropertyOptional({ description: 'Rejection timestamp' })
  rejectedAt?: Date;

  @ApiPropertyOptional({ description: 'Rejection reason' })
  rejectionReason?: string;
}


export class BookhireListResponseDto {
  @ApiProperty({ description: 'List of bookhires', type: [BookhireResponseDto] })
  bookhires: BookhireResponseDto[];

  @ApiProperty({ description: 'Total number of bookhires' })
  total: number;

  @ApiProperty({ description: 'Total number of pages' })
  totalPages: number;

  @ApiProperty({ description: 'Current page number' })
  currentPage: number;

  @ApiProperty({ description: 'Number of items per page' })
  limit: number;
}