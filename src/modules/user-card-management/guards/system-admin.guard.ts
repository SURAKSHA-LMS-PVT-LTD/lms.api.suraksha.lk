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
    const allowedTypes = ['SA', 'OM']; // Compact user types
    
    if (!allowedTypes.includes(user.ut)) {
      throw new ForbiddenException('Access denied. System admin privileges required.');
    }

    return true;
  }
}
