import { Injectable } from '@nestjs/common';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, QueryCommand, GetCommand, UpdateCommand, DeleteCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from 'uuid';
import { getCurrentSriLankaISO } from '../../../common/utils/timezone.util';

export interface BookhireAttendanceRecord {
  // Primary table structure (optimized for bookhire owners)
  PK: string;                    // BOOKHIRE#{bookhireId}
  SK: string;                    // TS#{timestamp}#STU#{studentId}#ID#{uuid} - UUID ensures uniqueness
  
  // Core attendance data
  bookhireId: string;
  studentId: string;
  attendanceDate: string;        // YYYY-MM-DD format
  timestamp: string;             // ISO timestamp when marked
  
  // Simplified attendance details
  status: 'pickup' | 'dropoff';  // Simple status - pickup or dropoff
  location?: string;             // Optional location
  
  // Administrative data
  markedBy: string;              // Owner/driver who marked attendance
  rfidCardId?: string;           // If marked via RFID
  notes?: string;
  
  // Student information (denormalized for performance)
  studentName: string;
  studentEmail?: string;
  parentContact?: string;
  parentEmail?: string;
  parentTelegramId?: string;
  
  // Vehicle information (denormalized)
  vehicleNumber: string;
  bookhireName: string;
  
  // Subscription and advertising
  subscriptionPlan: string;
  advertisementData?: {
    id: string;
    mediaUrl: string;
    mediaType: string;
    title: string;
    content: string;
  };
  
  // Notification tracking
  notificationSent?: boolean;
  notificationChannels?: string[];
  messageId?: string;
  
  // GSI attributes for student queries
  GSI_PK: string;                // STUDENT#{studentId}
  GSI_SK: string;                // D#{date}#TS#{timestamp}#BOOK#{bookhireId}#ID#{uuid}
  
  // Metadata
  createdAt: string;
  updatedAt: string;
  version: number;
  ttl?: number;                  // TTL for automatic deletion (configurable via ATTENDANCE_TTL_YEARS env var, default: 7 years)
}

export interface MarkBookhireAttendanceDto {
  bookhireId: string;
  studentId: string;
  attendanceDate: string;        // YYYY-MM-DD
  status: 'pickup' | 'dropoff';  // Simplified status
  location?: string;             // Optional location
  markedBy: string;
  rfidCardId?: string;
  notes?: string;
}

@Injectable()
export class DynamoDBBookhireAttendanceService {
  private dynamoClient: DynamoDBClient;
  private docClient: DynamoDBDocumentClient;
  private tableName: string;

  constructor() {
    // Initialize DynamoDB client
    this.dynamoClient = new DynamoDBClient({
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    });

    this.docClient = DynamoDBDocumentClient.from(this.dynamoClient);
    this.tableName = process.env.DYNAMODB_BOOKHIRE_ATTENDANCE_TABLE || 'BookhireAttendance';
  }

  /**
   * Handle DynamoDB-specific errors with proper error messages
   * Cost-effective: No extra queries, just better error handling
   */
  private handleDynamoDBError(error: any, operation: string): never {
    const errorCode = error.name || error.code;
    
    switch (errorCode) {
      // ✅ REMOVED ConditionalCheckFailedException - we now allow duplicate attendance marks
        
      case 'ProvisionedThroughputExceededException':
        throw new Error(`Database capacity exceeded. Please try again in a moment.`);
        
      case 'ResourceNotFoundException':
        throw new Error(`Bookhire attendance table not found. Please contact support.`);
        
      case 'ValidationException':
        throw new Error(`Invalid bookhire attendance data provided: ${error.message}`);
        
      case 'ItemCollectionSizeLimitExceededException':
        throw new Error(`Too many attendance records for this vehicle. Please contact support.`);
        
      case 'RequestLimitExceeded':
        throw new Error(`Too many requests. Please slow down and try again.`);
        
      case 'InternalServerError':
      case 'ServiceUnavailable':
        throw new Error(`Database service temporarily unavailable. Please try again.`);
        
      default:
        throw new Error(`Failed to ${operation}: ${error.message}`);
    }
  }

  /**
   * Retry DynamoDB operations with exponential backoff
   * Cost-effective: No extra queries, just automatic retry on throttling
   * Saves money by reducing failed requests that would need manual retry
   */
  private async retryWithBackoff<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    baseDelay: number = 100
  ): Promise<T> {
    let lastError: any;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        const errorCode = error.name || error.code;
        
        // Only retry throttling and transient errors
        const isRetryable = [
          'ProvisionedThroughputExceededException',
          'RequestLimitExceeded',
          'InternalServerError',
          'ServiceUnavailable'
        ].includes(errorCode);
        
        if (!isRetryable || attempt === maxRetries) {
          throw error;
        }
        
        // Exponential backoff with jitter
        const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 100;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError;
  }

  /**
   * 🎯 MARK BOOKHIRE ATTENDANCE with advertising integration
   * ✅ FIXED: Now uses timestamp with UUID to prevent overwrites even in same millisecond
   */
  async markAttendance(dto: MarkBookhireAttendanceDto, studentData: any, vehicleData: any): Promise<BookhireAttendanceRecord> {
    const timestamp = getCurrentSriLankaISO();
    const attendanceId = uuidv4();
    
    // Create primary keys for efficient querying
    // ✅ FIXED: Added UUID suffix to SK to ensure uniqueness even in same millisecond
    const PK = `BOOKHIRE#${dto.bookhireId}`;
    const SK = `TS#${timestamp}#STU#${dto.studentId}#ID#${attendanceId}`;
    
    // GSI keys for student-centric queries
    // ✅ FIXED: Added UUID suffix to GSI_SK for uniqueness
    const GSI_PK = `STUDENT#${dto.studentId}`;
    const GSI_SK = `D#${dto.attendanceDate}#TS#${timestamp}#BOOK#${dto.bookhireId}#ID#${attendanceId}`;
    
    // Calculate TTL from environment variable (default: 7 years)
    const ttlYears = parseInt(process.env.ATTENDANCE_TTL_YEARS || '7', 10);
    const ttl = Math.floor(Date.now() / 1000) + (ttlYears * 365 * 24 * 60 * 60);

    const attendanceRecord: BookhireAttendanceRecord = {
      PK,
      SK,
      GSI_PK,
      GSI_SK,
      
      // Core data
      bookhireId: dto.bookhireId,
      studentId: dto.studentId,
      attendanceDate: dto.attendanceDate,
      timestamp,
      
      // Simplified attendance status
      status: dto.status,
      location: dto.location,
      
      // Administrative
      markedBy: dto.markedBy,
      rfidCardId: dto.rfidCardId,
      notes: dto.notes,
      
      // Student info (denormalized)
      studentName: studentData.studentName,
      studentEmail: studentData.studentEmail,
      parentContact: studentData.parentContact,
      parentEmail: studentData.parentEmail,
      parentTelegramId: studentData.parentTelegramId,
      
      // Vehicle info (denormalized)
      vehicleNumber: vehicleData.vehicleNumber,
      bookhireName: vehicleData.bookhireName,
      
      // Subscription
      subscriptionPlan: studentData.subscriptionPlan,
      
      // Metadata
      createdAt: timestamp,
      updatedAt: timestamp,
      version: 1,
      ttl
    };

    // Insert into DynamoDB
    const command = new PutCommand({
      TableName: this.tableName,
      Item: attendanceRecord,
      // ✅ NO ConditionExpression needed - UUID ensures uniqueness
      // Each attendance mark gets a unique ID, preventing any overwrites
    });

    try {
      await this.retryWithBackoff(async () => {
        return await this.docClient.send(command);
      });
      return attendanceRecord;
    } catch (error) {
      this.handleDynamoDBError(error, 'mark bookhire attendance');
    }
  }

  /**
   * 🔄 UPDATE ATTENDANCE with notification data
   * ✅ FIXED: Now accepts full SK to support UUID-based keys
   */
  async updateAttendanceWithNotification(
    bookhireId: string,
    studentId: string,
    timestampOrSK: string, // Can be either timestamp or full SK
    notificationData: {
      advertisementData?: any;
      notificationSent: boolean;
      notificationChannels: string[];
      messageId?: string;
    }
  ): Promise<void> {
    const PK = `BOOKHIRE#${bookhireId}`;
    
    // ✅ FIXED: Check if this is a full SK or just a timestamp
    let SK: string;
    if (timestampOrSK.startsWith('TS#')) {
      // Already a full SK
      SK = timestampOrSK;
    } else {
      // Legacy format: just timestamp, construct old-style SK for backward compatibility
      SK = `TS#${timestampOrSK}#STU#${studentId}`;
    }

    const updateCommand = new UpdateCommand({
      TableName: this.tableName,
      Key: { PK, SK },
      UpdateExpression: 'SET advertisementData = :adData, notificationSent = :sent, notificationChannels = :channels, messageId = :msgId, updatedAt = :updated, version = version + :inc',
      ExpressionAttributeValues: {
        ':adData': notificationData.advertisementData || null,
        ':sent': notificationData.notificationSent,
        ':channels': notificationData.notificationChannels,
        ':msgId': notificationData.messageId || null,
        ':updated': getCurrentSriLankaISO(),
        ':inc': 1
      }
    });

    try {
      await this.retryWithBackoff(async () => {
        return await this.docClient.send(updateCommand);
      });
    } catch (error) {
      this.handleDynamoDBError(error, 'update bookhire attendance notification');
    }
  }

  /**
   * 📊 GET BOOKHIRE ATTENDANCE for owners (optimized primary table query)
   */
  async getBookhireAttendance(params: {
    bookhireId: string;
    startDate?: string;
    endDate?: string;
    studentId?: string;
    limit?: number;
    lastEvaluatedKey?: any;
  }): Promise<{
    records: BookhireAttendanceRecord[];
    lastEvaluatedKey?: any;
    totalCount: number;
  }> {
    const { bookhireId, startDate, endDate, studentId, limit = 50 } = params;
    
    let KeyConditionExpression = 'PK = :pk';
    const ExpressionAttributeValues: any = {
      ':pk': `BOOKHIRE#${bookhireId}`
    };
    
    // Add timestamp range if dates provided
    if (startDate || endDate) {
      if (startDate && endDate) {
        KeyConditionExpression += ' AND SK BETWEEN :startSK AND :endSK';
        ExpressionAttributeValues[':startSK'] = `TS#${startDate}`;
        ExpressionAttributeValues[':endSK'] = `TS#${endDate}#ZZZZ`; // Ensure we get all records for end date
      } else if (startDate) {
        KeyConditionExpression += ' AND SK >= :startSK';
        ExpressionAttributeValues[':startSK'] = `TS#${startDate}`;
      } else if (endDate) {
        KeyConditionExpression += ' AND SK <= :endSK';
        ExpressionAttributeValues[':endSK'] = `TS#${endDate}#ZZZZ`;
      }
    }

    // Add student filter if specified
    let FilterExpression;
    if (studentId) {
      FilterExpression = 'studentId = :studentId';
      ExpressionAttributeValues[':studentId'] = studentId;
    }

    const command = new QueryCommand({
      TableName: this.tableName,
      KeyConditionExpression,
      FilterExpression,
      ExpressionAttributeValues,
      Limit: limit,
      ExclusiveStartKey: params.lastEvaluatedKey,
      ScanIndexForward: false // Most recent first
    });

    try {
      const response = await this.retryWithBackoff(async () => {
        return await this.docClient.send(command);
      });
      return {
        records: response.Items as BookhireAttendanceRecord[],
        lastEvaluatedKey: response.LastEvaluatedKey,
        totalCount: response.Count || 0
      };
    } catch (error) {
      this.handleDynamoDBError(error, 'get bookhire attendance');
    }
  }

  /**
   * 👨‍🎓 GET STUDENT ATTENDANCE across all bookhires (uses GSI)
   */
  async getStudentAttendance(params: {
    studentId: string;
    startDate?: string;
    endDate?: string;
    bookhireId?: string;
    limit?: number;
    lastEvaluatedKey?: any;
  }): Promise<{
    records: BookhireAttendanceRecord[];
    lastEvaluatedKey?: any;
    totalCount: number;
  }> {
    const { studentId, startDate, endDate, bookhireId, limit = 50 } = params;
    
    let KeyConditionExpression = 'GSI_PK = :gsiPk';
    const ExpressionAttributeValues: any = {
      ':gsiPk': `STUDENT#${studentId}`
    };
    
    // Add date range to GSI_SK if provided
    if (startDate || endDate) {
      if (startDate && endDate) {
        KeyConditionExpression += ' AND GSI_SK BETWEEN :startGSI AND :endGSI';
        ExpressionAttributeValues[':startGSI'] = `D#${startDate}`;
        ExpressionAttributeValues[':endGSI'] = `D#${endDate}#ZZZZ`;
      } else if (startDate) {
        KeyConditionExpression += ' AND GSI_SK >= :startGSI';
        ExpressionAttributeValues[':startGSI'] = `D#${startDate}`;
      } else if (endDate) {
        KeyConditionExpression += ' AND GSI_SK <= :endGSI';
        ExpressionAttributeValues[':endGSI'] = `D#${endDate}#ZZZZ`;
      }
    }

    // Add bookhire filter if specified
    let FilterExpression;
    if (bookhireId) {
      FilterExpression = 'bookhireId = :bookhireId';
      ExpressionAttributeValues[':bookhireId'] = bookhireId;
    }

    const command = new QueryCommand({
      TableName: this.tableName,
      IndexName: 'GSI_Student', // GSI name for student queries
      KeyConditionExpression,
      FilterExpression,
      ExpressionAttributeValues,
      Limit: limit,
      ExclusiveStartKey: params.lastEvaluatedKey,
      ScanIndexForward: false // Most recent first
    });

    try {
      const response = await this.retryWithBackoff(async () => {
        return await this.docClient.send(command);
      });
      return {
        records: response.Items as BookhireAttendanceRecord[],
        lastEvaluatedKey: response.LastEvaluatedKey,
        totalCount: response.Count || 0
      };
    } catch (error) {
      this.handleDynamoDBError(error, 'get student attendance');
    }
  }

  /**
   * 📈 GET ATTENDANCE SUMMARY for analytics
   */
  async getAttendanceSummary(params: {
    bookhireId?: string;
    studentId?: string;
    startDate: string;
    endDate: string;
  }): Promise<{
    totalRecords: number;
    totalDays: number;
    pickupRecords: number;
    dropoffRecords: number;
    attendancePercentage: number;
    records: BookhireAttendanceRecord[];
  }> {
    let records: BookhireAttendanceRecord[];
    
    if (params.bookhireId) {
      // Query by bookhire (efficient)
      const result = await this.getBookhireAttendance({
        bookhireId: params.bookhireId,
        startDate: params.startDate,
        endDate: params.endDate,
        studentId: params.studentId,
        limit: 1000 // Increase for summary calculations
      });
      records = result.records;
    } else if (params.studentId) {
      // Query by student (uses GSI)
      const result = await this.getStudentAttendance({
        studentId: params.studentId,
        startDate: params.startDate,
        endDate: params.endDate,
        limit: 1000
      });
      records = result.records;
    } else {
      throw new Error('Either bookhireId or studentId must be provided for attendance summary');
    }

    // Calculate statistics for simplified bookhire attendance
    const totalRecords = records.length;
    const pickupRecords = records.filter(r => r.status === 'pickup').length;
    const dropoffRecords = records.filter(r => r.status === 'dropoff').length;
    
    // Group by date to get unique attendance days
    const uniqueDates = [...new Set(records.map(r => r.attendanceDate))];
    const totalDays = uniqueDates.length;
    const attendancePercentage = totalRecords > 0 ? (totalRecords / (totalDays * 2)) * 100 : 0; // 2 = pickup + dropoff

    return {
      totalRecords,
      totalDays,
      pickupRecords,
      dropoffRecords,
      attendancePercentage: Math.round(attendancePercentage * 100) / 100,
      records
    };
  }

  /**
   * 🗑️ DELETE ATTENDANCE RECORD
   * ✅ FIXED: Now accepts full SK to support UUID-based keys
   */
  async deleteAttendance(bookhireId: string, SK: string): Promise<void> {
    const PK = `BOOKHIRE#${bookhireId}`;

    const command = new DeleteCommand({
      TableName: this.tableName,
      Key: { PK, SK }
    });

    try {
      await this.retryWithBackoff(async () => {
        return await this.docClient.send(command);
      });
    } catch (error) {
      this.handleDynamoDBError(error, 'delete attendance');
    }
  }

  /**
   * 🔧 UTILITY: Generate attendance record key
   * ✅ FIXED: Now includes UUID parameter for new SK format
   */
  generateAttendanceKey(bookhireId: string, timestamp: string, studentId: string, attendanceId: string): { PK: string; SK: string } {
    return {
      PK: `BOOKHIRE#${bookhireId}`,
      SK: `TS#${timestamp}#STU#${studentId}#ID#${attendanceId}`
    };
  }

  /**
   * 🔧 UTILITY: Parse timestamp from SK
   */
  parseTimestampFromSK(SK: string): string {
    const match = SK.match(/^TS#(.+?)#STU#/);
    return match ? match[1] : '';
  }

  /**
   * 🔧 UTILITY: Parse student ID from SK
   * ✅ FIXED: Now correctly extracts studentId without capturing UUID
   */
  parseStudentIdFromSK(SK: string): string {
    const match = SK.match(/#STU#([^#]+)/);
    return match ? match[1] : '';
  }

  /**
   * 🔧 UTILITY: Parse UUID from SK
   * ✅ NEW: Extracts the UUID portion for new SK format
   */
  parseUuidFromSK(SK: string): string {
    const match = SK.match(/#ID#(.+)$/);
    return match ? match[1] : '';
  }
}