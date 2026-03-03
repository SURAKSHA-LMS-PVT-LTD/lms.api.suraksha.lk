import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Observable } from 'rxjs';

@Injectable()
export class SystemAdminGuard implements CanActivate {
  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    // Check if user is SUPER_ADMIN or ORGANIZATION_MANAGER
    // Support multiple JWT formats:
    // 1. Enhanced numeric: u = 0 (SUPERADMIN) or 1 (ORG_MANAGER)
    // 2. Database string: userType = 'SUPER_ADMIN' or 'ORGANIZATION_MANAGER'
    // 3. Legacy string: ut = 'SA' or 'OM' (if exists)
    
    if (user.u === 0 || user.u === 1) {
      return true;
    }
    
    const userType = (user.userType || '').toString().toUpperCase();
    if (userType === 'SUPER_ADMIN' || userType === 'ORGANIZATION_MANAGER') {
      return true;
    }
    
    const legacyType = (user.ut || '').toUpperCase();
    if (legacyType === 'SA' || legacyType === 'OM') {
      return true;
    }

    throw new ForbiddenException('Access denied. System admin privileges required.');
  }
}
