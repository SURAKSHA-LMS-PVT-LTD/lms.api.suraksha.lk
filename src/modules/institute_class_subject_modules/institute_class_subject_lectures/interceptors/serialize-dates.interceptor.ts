import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable()
export class SerializeDatesInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      map(data => this.convertDates(data))
    );
  }

  private convertDates(obj: any): any {
    if (!obj) return obj;
    
    if (obj instanceof Date) {
      return obj.toISOString();
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.convertDates(item));
    }
    
    if (typeof obj === 'object') {
      const converted: any = {};
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          const value = obj[key];
          
          // Convert Date objects to ISO strings
          if (value instanceof Date) {
            converted[key] = value.toISOString();
          } else if (typeof value === 'object' && value !== null) {
            converted[key] = this.convertDates(value);
          } else {
            converted[key] = value;
          }
        }
      }
      return converted;
    }
    
    return obj;
  }
}
