import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Pagination metadata for paginated responses
 */
export class PaginationMeta {
    @ApiProperty({ description: 'Current page number', example: 1 })
    page: number;

    @ApiProperty({ description: 'Number of items per page', example: 10 })
    limit: number;

    @ApiProperty({ description: 'Total number of items', example: 100 })
    total: number;

    @ApiProperty({ description: 'Total number of pages', example: 10 })
    totalPages: number;

    @ApiProperty({ description: 'Whether there is a previous page', example: false })
    hasPreviousPage: boolean;

    @ApiProperty({ description: 'Whether there is a next page', example: true })
    hasNextPage: boolean;

    @ApiPropertyOptional({ description: 'Previous page number', example: null })
    previousPage: number | null;

    @ApiPropertyOptional({ description: 'Next page number', example: 2 })
    nextPage: number | null;
}

/**
 * API error details
 */
export class ApiError {
    @ApiProperty({ description: 'Error message', example: 'Resource not found' })
    message: string;

    @ApiProperty({ description: 'HTTP status code', example: 404 })
    statusCode: number;

    @ApiProperty({ description: 'Error type', example: 'NotFoundError' })
    error: string;

    @ApiPropertyOptional({ description: 'Additional error details' })
    details?: any;
}

/**
 * Standardized API response wrapper
 * Use this for all API responses to ensure consistency
 */
export class ApiResponse<T = any> {
    @ApiProperty({ description: 'Whether the request was successful', example: true })
    success: boolean;

    @ApiPropertyOptional({ description: 'Response data' })
    data?: T;

    @ApiPropertyOptional({ description: 'Success or info message', example: 'Operation completed successfully' })
    message?: string;

    @ApiPropertyOptional({ description: 'Pagination metadata for paginated responses', type: PaginationMeta })
    meta?: PaginationMeta;

    @ApiPropertyOptional({ description: 'Error details if request failed', type: ApiError })
    error?: ApiError;
}

/**
 * Helper function to create success response
 */
export function createSuccessResponse<T>(
    data: T,
    message?: string,
    meta?: PaginationMeta,
): ApiResponse<T> {
    return {
        success: true,
        data,
        message,
        meta,
    };
}

/**
 * Helper function to create error response
 */
export function createErrorResponse(
    message: string,
    statusCode: number,
    error: string,
    details?: any,
): ApiResponse {
    return {
        success: false,
        error: {
            message,
            statusCode,
            error,
            details,
        },
    };
}

/**
 * Helper function to create paginated response
 */
export function createPaginatedResponse<T>(
    data: T[],
    page: number,
    limit: number,
    total: number,
    message?: string,
): ApiResponse<T[]> {
    const totalPages = Math.ceil(total / limit);
    const hasPreviousPage = page > 1;
    const hasNextPage = page < totalPages;

    return {
        success: true,
        data,
        message,
        meta: {
            page,
            limit,
            total,
            totalPages,
            hasPreviousPage,
            hasNextPage,
            previousPage: hasPreviousPage ? page - 1 : null,
            nextPage: hasNextPage ? page + 1 : null,
        },
    };
}
