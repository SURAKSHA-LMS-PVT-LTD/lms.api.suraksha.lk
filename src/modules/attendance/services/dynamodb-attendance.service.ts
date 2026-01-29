import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getCurrentSriLankaDate } from '../../../common/utils/timezone.util';
import { DynamoDBClient, QueryCommand, PutItemCommand, UpdateItemCommand, DeleteItemCommand, BatchWriteItemCommand } from '@aws-sdk/client-dynamodb';
import { QueryCommandInput, PutItemCommandInput, UpdateItemCommandInput, DeleteItemCommandInput } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { MarkAttendanceDto, BulkAttendanceDto, AttendanceStatus, MarkingMethod } from '../dto/attendance.dto';
import { MarkAttendanceByCardDto, BulkCardAttendanceDto } from '../dto/card-attendance.dto';

export interface AttendanceRecord {
  pk: string;
  sk: string;
  gsi_pk: string;
  gsi_sk: string;
  studentId: string;
  studentName: string;
  instituteId: string;
  instituteName: string;
  classId?: string;  // Optional - for class-specific attendance
  className?: string; // Optional - for class-specific attendance
  subjectId?: string; // Optional - for subject-specific attendance
  subjectName?: string; // Optional - for subject-specific attendance
  date: string;
  status: number; // 1=Present, 0=Absent
  location?: string;
  remarks?: string;
  markingMethod?: string;
  timestamp: number;
  ttl?: number;
}

@Injectable()
export class DynamoDBAttendanceService {
  private readonly logger = new Logger(DynamoDBAttendanceService.name);
  private readonly dynamoClient: DynamoDBClient;
  private readonly tableName: string;
  private readonly gsiName: string;

  constructor(private readonly configService: ConfigService) {
    // Initialize DynamoDB client
    this.dynamoClient = new DynamoDBClient({
      region: this.configService.get('AWS_REGION', 'us-east-1'),
      credentials: {
        accessKeyId: this.configService.get('AWS_ACCESS_KEY_ID'),
        secretAccessKey: this.configService.get('AWS_SECRET_ACCESS_KEY'),
      },
    });

    this.tableName = this.configService.get('DYNAMODB_ATTENDANCE_TABLE', 'attendance_events');
    this.gsiName = this.configService.get('DYNAMODB_ATTENDANCE_GSI_NAME', 'gsi-student-attendance');
  }

  // Generate partition key (institute-based partitioning without sharding)
  private generatePartitionKey(instituteId: string): string {
    return `I#${instituteId}`;
  }

  // Generate sort key for attendance records
  // ✅ FIXED: Added timestamp to support multiple attendance marks per day
  // ✅ UPDATED: Class and subject are now optional (use "NONE" as placeholder)
  private generateSortKey(date: string, studentId: string, classId: string | undefined, subjectId: string | undefined, timestamp: number): string {
    const classValue = classId || 'NONE';
    const subjectValue = subjectId || 'NONE';
    return `ATTENDANCE#${date}#TS#${timestamp}#S#${studentId}#C#${classValue}#SUB#${subjectValue}`;
  }

  // Generate GSI partition key for student-based queries
  // Using STUDENT# prefix to match Bookhire attendance pattern
  private generateGSIPartitionKey(instituteId: string, studentId: string): string {
    return `STUDENT#${studentId}`;
  }

  // Generate GSI sort key (includes institute for cross-institute student queries)
  // ✅ FIXED: Added timestamp to support multiple attendance marks per day
  // ✅ UPDATED: Class and subject are now optional (use "NONE" as placeholder)
  private generateGSISortKey(date: string, classId: string | undefined, subjectId: string | undefined, instituteId: string, timestamp: number): string {
    const classValue = classId || 'NONE';
    const subjectValue = subjectId || 'NONE';
    return `I#${instituteId}#D#${date}#TS#${timestamp}#C#${classValue}#SUB#${subjectValue}`;
  }

  // Convert status string to number for DynamoDB
  private statusToNumber(status: AttendanceStatus): number {
    switch (status) {
      case AttendanceStatus.PRESENT:
        return 1;
      case AttendanceStatus.ABSENT:
        return 0;
      case AttendanceStatus.LATE:
        return 2;
      default:
        return 0; // Default to absent
    }
  }

  // Convert status number to string for DTOs
  private numberToStatus(status: number): AttendanceStatus {
    switch (status) {
      case 1:
        return AttendanceStatus.PRESENT;
      case 2:
        return AttendanceStatus.LATE;
      case 0:
      default:
        return AttendanceStatus.ABSENT;
    }
  }

  // Calculate TTL timestamp
  private calculateTTL(): number {
    const ttlYears = this.configService.get('ATTENDANCE_TTL_YEARS', '7');
    const ttlSeconds = parseInt(ttlYears) * 365 * 24 * 60 * 60;
    return Math.floor(Date.now() / 1000) + ttlSeconds;
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
        throw new Error(`Attendance table not found. Please contact support.`);
        
      case 'ValidationException':
        throw new Error(`Invalid attendance data provided: ${error.message}`);
        
      case 'ItemCollectionSizeLimitExceededException':
        throw new Error(`Too many attendance records for this student. Please contact support.`);
        
      case 'RequestLimitExceeded':
        throw new Error(`Too many requests. Please slow down and try again.`);
        
      case 'InternalServerError':
      case 'ServiceUnavailable':
        throw new Error(`Database service temporarily unavailable. Please try again.`);
        
      default:
        this.logger.error(`Unexpected DynamoDB error during ${operation}:`, error);
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
        this.logger.warn(`DynamoDB operation failed (${errorCode}), retrying in ${delay}ms... (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError;
  }

  // Convert DTO to DynamoDB record
  private attendanceToRecord(attendance: MarkAttendanceDto): AttendanceRecord {
    const timestamp = Date.now();
    const ttl = this.calculateTTL();
    
    // ✅ FIXED: Pass timestamp to generateSortKey and generateGSISortKey
    // ✅ UPDATED: Handle optional class and subject fields
    const record: any = {
      pk: this.generatePartitionKey(attendance.instituteId),
      sk: this.generateSortKey(attendance.date, attendance.studentId, attendance.classId, attendance.subjectId, timestamp),
      gsi_pk: this.generateGSIPartitionKey(attendance.instituteId, attendance.studentId),
      gsi_sk: this.generateGSISortKey(attendance.date, attendance.classId, attendance.subjectId, attendance.instituteId, timestamp),
      studentId: attendance.studentId,
      studentName: attendance.studentName,
      instituteId: attendance.instituteId,
      instituteName: attendance.instituteName,
      date: attendance.date,
      status: this.statusToNumber(attendance.status),
      timestamp,
      ttl
    };

    // Add optional class fields
    if (attendance.classId) {
      record.classId = attendance.classId;
    }
    if (attendance.className) {
      record.className = attendance.className;
    }

    // Add optional subject fields
    if (attendance.subjectId) {
      record.subjectId = attendance.subjectId;
    }
    if (attendance.subjectName) {
      record.subjectName = attendance.subjectName;
    }

    // Add other optional fields
    if (attendance.location) {
      record.location = attendance.location;
    }
    if (attendance.remarks) {
      record.remarks = attendance.remarks;
    }
    if (attendance.markingMethod) {
      record.markingMethod = attendance.markingMethod;
    }

    return record;
  }

  // Convert DynamoDB record to DTO
  private recordToAttendance(record: any): MarkAttendanceDto {
    return {
      studentId: String(record.studentId), // Ensure string type for consistency
      studentName: record.studentName,
      instituteId: String(record.instituteId), // Ensure string type for consistency
      instituteName: record.instituteName,
      classId: record.classId ? String(record.classId) : undefined,  // Optional field, ensure string
      className: record.className || undefined,  // Optional field
      subjectId: record.subjectId ? String(record.subjectId) : undefined,  // Optional field, ensure string
      subjectName: record.subjectName || undefined,  // Optional field
      date: record.date,
      status: this.numberToStatus(record.status),
      location: record.location,
      remarks: record.remarks,
      markingMethod: record.markingMethod
    };
  }

  // Mark single attendance
  async markAttendance(attendance: MarkAttendanceDto): Promise<MarkAttendanceDto> {
    const record = this.attendanceToRecord(attendance);
    
    const params: PutItemCommandInput = {
      TableName: this.tableName,
      Item: marshall(record, { removeUndefinedValues: true }),
      // ✅ REMOVED ConditionExpression to allow updating existing attendance
      // This improves performance by eliminating duplicate checks and allows multiple marks per day
    };

    try {
      await this.retryWithBackoff(async () => {
        return await this.dynamoClient.send(new PutItemCommand(params));
      });
      return attendance;
    } catch (error) {
      this.handleDynamoDBError(error, 'mark attendance');
    }
  }

  /**
   * OPTIMIZED: True batch write with BatchWriteCommand
   * Cost-effective: 25 items per API call instead of 25 individual calls
   * No duplicate checks in batch (relies on conditional writes)
   */
  private async batchMarkAttendance(attendances: MarkAttendanceDto[]): Promise<{
    successful: MarkAttendanceDto[];
    failed: Array<{ attendance: MarkAttendanceDto; error: string }>;
  }> {
    const successful: MarkAttendanceDto[] = [];
    const failed: Array<{ attendance: MarkAttendanceDto; error: string }> = [];
    
    // DynamoDB BatchWriteItem supports max 25 items per request
    const BATCH_SIZE = 25;
    
    for (let i = 0; i < attendances.length; i += BATCH_SIZE) {
      const batch = attendances.slice(i, i + BATCH_SIZE);
      
      // Convert to DynamoDB records
      const writeRequests = batch.map(attendance => ({
        PutRequest: {
          Item: marshall(this.attendanceToRecord(attendance), { removeUndefinedValues: true })
        }
      }));
      
      try {
        const response = await this.retryWithBackoff(async () => {
          return await this.dynamoClient.send(new BatchWriteItemCommand({
            RequestItems: {
              [this.tableName]: writeRequests
            }
          }));
        });
        
        // Handle unprocessed items
        if (response.UnprocessedItems && response.UnprocessedItems[this.tableName]) {
          const unprocessedCount = response.UnprocessedItems[this.tableName].length;
          this.logger.warn(`${unprocessedCount} items were not processed in batch`);
          
          // Mark unprocessed items as failed for retry
          const processedCount = batch.length - unprocessedCount;
          successful.push(...batch.slice(0, processedCount));
          
          for (let j = processedCount; j < batch.length; j++) {
            failed.push({
              attendance: batch[j],
              error: 'Item not processed in batch - capacity exceeded'
            });
          }
        } else {
          // All items processed successfully
          successful.push(...batch);
        }
        
      } catch (error) {
        this.logger.error(`Batch write failed for items ${i} to ${i + batch.length}:`, error);
        
        // Mark all items in failed batch as failed
        batch.forEach(attendance => {
          failed.push({
            attendance,
            error: error.message || 'Batch write failed'
          });
        });
      }
    }
    
    return { successful, failed };
  }

  // Mark bulk attendance
  async markBulkAttendance(bulkData: BulkAttendanceDto): Promise<MarkAttendanceDto[]> {
    const today = getCurrentSriLankaDate();
    const attendances = bulkData.students.map(studentData => ({
      studentId: studentData.studentId,
      studentName: studentData.studentName,
      instituteId: bulkData.instituteId,
      instituteName: bulkData.instituteName,
      classId: bulkData.classId,
      className: bulkData.className,
      subjectId: bulkData.subjectId,
      subjectName: bulkData.subjectName,
      date: today,
      status: studentData.status,
      location: bulkData.location,
      remarks: studentData.remarks,
      markingMethod: bulkData.markingMethod
    }));

    // Use true batch operations for maximum performance
    const { successful, failed } = await this.batchMarkAttendance(attendances);
    
    // Retry failed items individually (may be duplicates or need conditional writes)
    if (failed.length > 0) {
      
      for (const failedItem of failed) {
        try {
          await this.markAttendance(failedItem.attendance);
          successful.push(failedItem.attendance);
        } catch (error) {
          this.logger.error(`Failed to mark attendance for student ${failedItem.attendance.studentId}:`, error.message);
        }
      }
    }

    return successful;
  }

  // Get attendance for specific date
  async getAttendanceByDate(instituteId: string, date: string): Promise<MarkAttendanceDto[]> {
    const sk = `ATTENDANCE#${date}`;
    
    const params: QueryCommandInput = {
      TableName: this.tableName,
      KeyConditionExpression: 'pk = :pk AND begins_with(sk, :sk)',
      ExpressionAttributeValues: marshall({
        ':pk': this.generatePartitionKey(instituteId),
        ':sk': sk
      }, { removeUndefinedValues: true }),
      ScanIndexForward: false // ✅ Return newest attendance first (descending order)
    };

    const result = await this.retryWithBackoff(async () => {
      return await this.dynamoClient.send(new QueryCommand(params));
    });
    return result.Items?.map(item => this.recordToAttendance(unmarshall(item))) || [];
  }

  // Get student attendance history
  async getStudentAttendance(studentId: string, instituteId: string, startDate?: string, endDate?: string): Promise<MarkAttendanceDto[]> {
    const params: QueryCommandInput = {
      TableName: this.tableName,
      IndexName: this.gsiName,
      KeyConditionExpression: 'gsi_pk = :gsi_pk',
      ExpressionAttributeValues: marshall({
        ':gsi_pk': this.generateGSIPartitionKey(instituteId, studentId)
      }, { removeUndefinedValues: true }),
      ScanIndexForward: false // Latest first
    };

    // Add date range filter if provided (optimized with comparison operators)
    if (startDate && endDate) {
      params.FilterExpression = '#date >= :startDate AND #date <= :endDate';
      params.ExpressionAttributeNames = { '#date': 'date' };
      params.ExpressionAttributeValues = marshall({
        ...unmarshall(params.ExpressionAttributeValues),
        ':startDate': startDate,
        ':endDate': endDate
      }, { removeUndefinedValues: true });
    }

    const result = await this.retryWithBackoff(async () => {
      return await this.dynamoClient.send(new QueryCommand(params));
    });
    return result.Items?.map(item => this.recordToAttendance(unmarshall(item))) || [];
  }

  // Update attendance status
  // ✅ FIXED: Added timestamp parameter to uniquely identify the attendance record
  async updateAttendance(
    instituteId: string,
    studentId: string,
    classId: string,
    subjectId: string,
    date: string,
    timestamp: number,
    status: AttendanceStatus,
    remarks?: string
  ): Promise<MarkAttendanceDto> {
    const pk = this.generatePartitionKey(instituteId);
    const sk = this.generateSortKey(date, studentId, classId, subjectId, timestamp);
    
    const params: UpdateItemCommandInput = {
      TableName: this.tableName,
      Key: marshall({ pk, sk }, { removeUndefinedValues: true }),
      UpdateExpression: 'SET #status = :status, #remarks = :remarks, #timestamp = :timestamp',
      ExpressionAttributeNames: {
        '#status': 'status',
        '#remarks': 'remarks',
        '#timestamp': 'timestamp'
      },
      ExpressionAttributeValues: marshall({
        ':status': this.statusToNumber(status),
        ':remarks': remarks || '',
        ':timestamp': Date.now() // Update timestamp
      }, { removeUndefinedValues: true }),
      ReturnValues: 'ALL_NEW'
    };

    try {
      const result = await this.retryWithBackoff(async () => {
        return await this.dynamoClient.send(new UpdateItemCommand(params));
      });
      return this.recordToAttendance(unmarshall(result.Attributes));
    } catch (error) {
      this.handleDynamoDBError(error, 'update attendance');
    }
  }

  // Delete attendance record
  // ✅ FIXED: Added timestamp parameter to uniquely identify the attendance record
  async deleteAttendance(
    instituteId: string,
    studentId: string,
    classId: string,
    subjectId: string,
    date: string,
    timestamp: number
  ): Promise<void> {
    const pk = this.generatePartitionKey(instituteId);
    const sk = this.generateSortKey(date, studentId, classId, subjectId, timestamp);
    
    const params: DeleteItemCommandInput = {
      TableName: this.tableName,
      Key: marshall({ pk, sk }, { removeUndefinedValues: true })
    };

    try {
      await this.retryWithBackoff(async () => {
        return await this.dynamoClient.send(new DeleteItemCommand(params));
      });
    } catch (error) {
      this.handleDynamoDBError(error, 'delete attendance');
    }
  }

  // Get attendance summary for date range
  async getAttendanceSummary(
    instituteId: string,
    classId?: string,
    subjectId?: string,
    startDate?: string,
    endDate?: string
  ): Promise<any> {
    const params: QueryCommandInput = {
      TableName: this.tableName,
      KeyConditionExpression: 'pk = :pk',
      ExpressionAttributeValues: marshall({
        ':pk': this.generatePartitionKey(instituteId)
      }, { removeUndefinedValues: true }),
      ScanIndexForward: false // ✅ CRITICAL: Return newest attendance first (descending order)
    };

    // Build filter conditions
    const filterConditions: string[] = [];
    const attributeNames: Record<string, string> = {};
    const attributeValues: Record<string, any> = { ':pk': this.generatePartitionKey(instituteId) };

    // ✅ FIXED: Proper filtering based on hierarchy level
    if (classId && subjectId) {
      // Subject-level: Must have BOTH classId AND subjectId
      filterConditions.push('#classId = :classId');
      filterConditions.push('#subjectId = :subjectId');
      attributeNames['#classId'] = 'classId';
      attributeNames['#subjectId'] = 'subjectId';
      attributeValues[':classId'] = classId;
      attributeValues[':subjectId'] = subjectId;
    } else if (classId && !subjectId) {
      // Class-level: Must have classId but NO subjectId (or default/undefined)
      filterConditions.push('#classId = :classId');
      filterConditions.push('(attribute_not_exists(#subjectId) OR #subjectId = :defaultSubject)');
      attributeNames['#classId'] = 'classId';
      attributeNames['#subjectId'] = 'subjectId';
      attributeValues[':classId'] = classId;
      attributeValues[':defaultSubject'] = 'default';
    } else if (!classId && !subjectId) {
      // Institute-level: Must have NO classId (or default/undefined)
      filterConditions.push('(attribute_not_exists(#classId) OR #classId = :defaultClass)');
      attributeNames['#classId'] = 'classId';
      attributeValues[':defaultClass'] = 'default';
    }

    if (startDate && endDate) {
      filterConditions.push('#date >= :startDate AND #date <= :endDate');
      attributeNames['#date'] = 'date';
      attributeValues[':startDate'] = startDate;
      attributeValues[':endDate'] = endDate;
    }

    if (filterConditions.length > 0) {
      params.FilterExpression = filterConditions.join(' AND ');
      params.ExpressionAttributeNames = attributeNames;
      params.ExpressionAttributeValues = marshall(attributeValues, { removeUndefinedValues: true });
    }

    const result = await this.retryWithBackoff(async () => {
      return await this.dynamoClient.send(new QueryCommand(params));
    });
    const attendanceRecords = result.Items?.map(item => unmarshall(item)) || [];
    
    // Calculate summary statistics
    const totalRecords = attendanceRecords.length;
    const presentCount = attendanceRecords.filter(record => record.status === 1).length;
    const absentCount = attendanceRecords.filter(record => record.status === 0).length;
    const lateCount = attendanceRecords.filter(record => record.status === 2).length;
    const leftCount = attendanceRecords.filter(record => record.status === 3).length;
    const leftEarlyCount = attendanceRecords.filter(record => record.status === 4).length;
    const leftLatelyCount = attendanceRecords.filter(record => record.status === 5).length;
    const attendanceRate = totalRecords > 0 ? (presentCount / totalRecords) * 100 : 0;

    return {
      totalRecords,
      presentCount,
      absentCount,
      lateCount,
      leftCount,
      leftEarlyCount,
      leftLatelyCount,
      attendanceRate: parseFloat(attendanceRate.toFixed(2)),
      records: attendanceRecords.map(record => this.recordToAttendance(record))
    };
  }
}

