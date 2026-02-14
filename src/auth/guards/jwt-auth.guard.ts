import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
    // Check for @Public() decorator
    const isPublic = this.reflector.getAllAndOverride<boolean>('isPublic', [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    // Default JWT validation
    return super.canActivate(context);
  }

  handleRequest(err, user, info, context: ExecutionContext) {
    // Check if route is public BEFORE throwing error
    const isPublic = this.reflector.getAllAndOverride<boolean>('isPublic', [
      context.getHandler(),
      context.getClass(),
    ]);

    // Allow public routes to proceed without authentication
    if (isPublic) {
      return user; // Can be undefined for public routes
    }

    // For protected routes, throw error if no user
    if (err || !user) {
      // Provide detailed error message from passport info
      const errorMessage = info?.message || info?.name || 'Authentication failed';
      throw err || new UnauthorizedException(errorMessage);
    }

    return user;
  }
}
