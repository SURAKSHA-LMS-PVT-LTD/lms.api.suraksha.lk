import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  // Override handleRequest to not throw an error if no user is found
  handleRequest(err: any, user: any, info: any) {
    if (err) {
      return null;
    }
    return user || null;
  }
}
