import { SetMetadata } from '@nestjs/common';

/**
 * Decorator to disable data masking for specific endpoints
 * Use this on endpoints where you want to return unmasked data
 * 
 * @example
 * @NoDataMasking()
 * @Get('institute/:id/me')
 * getMyData() { ... }
 */
export const NO_DATA_MASKING_KEY = 'noDataMasking';
export const NoDataMasking = () => SetMetadata(NO_DATA_MASKING_KEY, true);
