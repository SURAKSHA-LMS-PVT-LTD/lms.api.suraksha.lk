// User Response DTOs - Export all secure response types
export { UserSecureResponseDto } from './user-secure-response.dto';
export { UserMinimalResponseDto, UserProfileResponseDto } from './user-response-variants.dto';
export { UserResponseDto } from './user-response.dto';

// Usage Guidelines:
// - UserSecureResponseDto: Default secure response with all safe fields
// - UserMinimalResponseDto: Minimal info for lists and references
// - UserProfileResponseDto: Profile pages and detailed views
// - UserResponseDto: Legacy/internal use (all fields with @Exclude decorators)
