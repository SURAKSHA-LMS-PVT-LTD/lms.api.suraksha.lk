import { ExceptionFilter, Catch, ArgumentsHost, BadRequestException, Logger } from '@nestjs/common';
import { Request, Response } from 'express';

@Catch(BadRequestException)
export class FileUploadExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(FileUploadExceptionFilter.name);

  catch(exception: BadRequestException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    
    const message = exception.message;
    const status = exception.getStatus();

    // Handle multer unexpected field error
    if (message.includes('Unexpected field')) {
      const fieldMatch = message.match(/Unexpected field - (\w+)/);
      const fieldName = fieldMatch ? fieldMatch[1] : 'unknown';
      
      const errorResponse = {
        success: false,
        statusCode: status,
        timestamp: new Date().toISOString(),
        path: request.url,
        method: request.method,
        message: `Invalid form field name "${fieldName}". Please use field name "file" for file uploads.`,
        error: 'Bad Request',
        requestId: `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        details: {
          expectedField: 'file',
          receivedField: fieldName,
          hint: 'Make sure your form field name matches the expected field name'
        }
      };

      this.logger.error(`File upload error: ${message}`, exception.stack);
      
      response.status(status).json(errorResponse);
      return;
    }

    // Handle other multer errors
    if (message.includes('File too large')) {
      const errorResponse = {
        success: false,
        statusCode: status,
        timestamp: new Date().toISOString(),
        path: request.url,
        method: request.method,
        message: 'File size exceeds the maximum allowed limit',
        error: 'Bad Request',
        requestId: `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        details: {
          maxSize: request.url.includes('profile-image') ? '5MB' : '10MB',
          hint: 'Please upload a smaller file'
        }
      };

      this.logger.error(`File size error: ${message}`, exception.stack);
      
      response.status(status).json(errorResponse);
      return;
    }

    // Handle other bad request errors
    const errorResponse = {
      success: false,
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
      message: message,
      error: 'Bad Request',
      requestId: `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };

    this.logger.error(`Request error: ${message}`, exception.stack);
    
    response.status(status).json(errorResponse);
  }
}
