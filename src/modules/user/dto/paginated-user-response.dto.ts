import { PaginatedResponseDto } from '../../../common/dto/paginated-response.dto';
import { UserResponseDto } from './user-response.dto';

export class PaginatedUserResponseDto extends PaginatedResponseDto<UserResponseDto> {
  // data: UserResponseDto[]; // Inherited and already decorated

  constructor(users: UserResponseDto[], page: number, limit: number, total: number) {
    super(users, page, limit, total);
  }
}
