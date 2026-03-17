import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getCurrentSriLankaDate, timestampToSriLankaDate } from '../../../common/utils/timezone.util';
import { DynamoDBClient, QueryCommand, PutItemCommand, UpdateItemCommand, DeleteItemCommand, BatchWriteItemCommand, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { QueryCommandInput, PutItemCommandInput, UpdateItemCommandInput, DeleteItemCommandInput } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { MarkAttendanceDto, BulkAttendanceDto, AttendanceStatus, MarkingMethod } from '../dto/attendance.dto';
import { MarkAttendanceByCardDto, BulkCardAttendanceDto } from '../dto/card-attendance.dto';

export interface AttendanceRecord {
  id: string;        // Base64url-encoded PK~SK — used for deep-link lookup (no GSI needed)
  pk: string;
  sk: string;
  gsi_pk: string;
  gsi_sk: string;
  studentId: string;
  studentName: string;
  studentImageUrl?: string;
  instituteId: string;
  instituteName: string;
  classId?: string;  // Optional - for class-specific attendance
  className?: string; // Optional - for class-specific attendance
  subjectId?: string; // Optional - for subject-specific attendance
  subjectName?: string; // Optional - for subject-specific attendance
  date: string;
  status: number; // 1=Present, 0=Absent
  location?: string;
  address?: { latitude?: number; longitude?: number };  // ✅ Consolidated: lat/lng stored here only
  remarks?: string;
  markingMethod?: string;
  userType?: string; // Institute user type: STUDENT, TEACHER, INSTITUTE_ADMIN, ATTENDANCE_MARKER, PARENT, NOT_ENROLLED
  calendarDayId?: string; // NEW - institute_calendar_days.id (FK to calendar)
  eventId?: string; // NEW - institute_calendar_events.id (optional - specific event attendance)
  advertisementId?: string; // Advertisement ID for delivery capability tracking
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
  // SECURITY: Sanitize input to prevent key injection attacks
  private generatePartitionKey(instituteId: string): string {
    const sanitized = String(instituteId).replace(/[^a-zA-Z0-9_-]/g, '');
    return `I#${sanitized}`;
  }

  // Generate sort key for attendance records
  // ✅ FIXED: Added timestamp to support multiple attendance marks per day
  // ✅ UPDATED: Class and subject are now optional (use "NONE" as placeholder)
  private generateSortKey(date: string, studentId: string, classId: string | undefined, subjectId: string | undefined, timestamp: number): string {
    // SECURITY: Sanitize all inputs to prevent DynamoDB key injection
    const safeDate = String(date).replace(/[^0-9-]/g, '');
    const safeStudentId = String(studentId).replace(/[^a-zA-Z0-9_-]/g, '');
    const classValue = classId ? String(classId).replace(/[^a-zA-Z0-9_-]/g, '') : 'NONE';
    const subjectValue = subjectId ? String(subjectId).replace(/[^a-zA-Z0-9_-]/g, '') : 'NONE';
    return `ATTENDANCE#${safeDate}#TS#${timestamp}#S#${safeStudentId}#C#${classValue}#SUB#${subjectValue}`;
  }

  // Generate GSI partition key for student-based queries
  // Using STUDENT# prefix to match Bookhire attendance pattern
  private generateGSIPartitionKey(instituteId: string, studentId: string): string {
    const sanitized = String(studentId).replace(/[^a-zA-Z0-9_-]/g, '');
    return `STUDENT#${sanitized}`;
  }

  // Generate GSI sort key (includes institute for cross-institute student queries)
  // ✅ FIXED: Added timestamp to support multiple attendance marks per day
  // ✅ UPDATED: Class and subject are now optional (use "NONE" as placeholder)
  private generateGSISortKey(date: string, classId: string | undefined, subjectId: string | undefined, instituteId: string, timestamp: number): string {
    // SECURITY: Sanitize all inputs to prevent DynamoDB key injection
    const safeInstituteId = String(instituteId).replace(/[^a-zA-Z0-9_-]/g, '');
    const safeDate = String(date).replace(/[^0-9-]/g, '');
    const classValue = classId ? String(classId).replace(/[^a-zA-Z0-9_-]/g, '') : 'NONE';
    const subjectValue = subjectId ? String(subjectId).replace(/[^a-zA-Z0-9_-]/g, '') : 'NONE';
    return `I#${safeInstituteId}#D#${safeDate}#TS#${timestamp}#C#${classValue}#SUB#${subjectValue}`;
  }

  // Convert status string to number for DynamoDB
  // ✅ FIXED: Added LEFT (3), LEFT_EARLY (4), LEFT_LATELY (5) mappings
  private statusToNumber(status: AttendanceStatus): number {
    switch (status) {
      case AttendanceStatus.PRESENT:
        return 1;
      case AttendanceStatus.ABSENT:
        return 0;
      case AttendanceStatus.LATE:
        return 2;
      case AttendanceStatus.LEFT:
        return 3;
      case AttendanceStatus.LEFT_EARLY:
        return 4;
      case AttendanceStatus.LEFT_LATELY:
        return 5;
      default:
        return 0; // Default to absent
    }
  }

  // Convert status number to string for DTOs
  // ✅ FIXED: Added LEFT (3), LEFT_EARLY (4), LEFT_LATELY (5) mappings
  private numberToStatus(status: number): AttendanceStatus {
    switch (status) {
      case 1:
        return AttendanceStatus.PRESENT;
      case 2:
        return AttendanceStatus.LATE;
      case 3:
        return AttendanceStatus.LEFT;
      case 4:
        return AttendanceStatus.LEFT_EARLY;
      case 5:
        return AttendanceStatus.LEFT_LATELY;
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
    // Derive date from timestamp — timestamp is the single source of truth
    const dateStr = timestampToSriLankaDate(timestamp);
    const ttl = this.calculateTTL();
    
    // ✅ FIXED: Pass timestamp to generateSortKey and generateGSISortKey
    // ✅ UPDATED: Handle optional class and subject fields
    const record: any = {
      pk: this.generatePartitionKey(attendance.instituteId),
      sk: this.generateSortKey(dateStr, attendance.studentId, attendance.classId, attendance.subjectId, timestamp),
      gsi_pk: this.generateGSIPartitionKey(attendance.instituteId, attendance.studentId),
      gsi_sk: this.generateGSISortKey(dateStr, attendance.classId, attendance.subjectId, attendance.instituteId, timestamp),
    };

    // Generate stable ID from PK+SK — decodable back to keys for direct GetItem lookup
    record.id = Buffer.from(`${record.pk}~${record.sk}`).toString('base64url');

    record.studentId = attendance.studentId;
    record.studentName = attendance.studentName;
    if ((attendance as any).studentImageUrl) {
      record.studentImageUrl = (attendance as any).studentImageUrl;
    } else if ((attendance as any).imageUrl) {
      record.studentImageUrl = (attendance as any).imageUrl;
    }
    record.instituteId = attendance.instituteId;
    record.instituteName = attendance.instituteName;
    record.date = dateStr;
    record.status = this.statusToNumber(attendance.status);
    record.timestamp = timestamp;
    record.ttl = ttl;

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

    // ✅ CONSOLIDATED: Store latitude/longitude in address object, not separately
    if (attendance.address?.latitude !== undefined || attendance.address?.longitude !== undefined) {
      record.address = {
        latitude: attendance.address?.latitude,
        longitude: attendance.address?.longitude
      };
    }

    if (attendance.remarks) {
      record.remarks = attendance.remarks;
    }
    if (attendance.markingMethod) {
      record.markingMethod = attendance.markingMethod;
    }

    // Add user type if provided (STUDENT, TEACHER, INSTITUTE_ADMIN, etc.)
    if ((attendance as any).userType) {
      record.userType = (attendance as any).userType;
    }

    // Add calendar day ID if provided (links to institute_calendar_days.id)
    if ((attendance as any).calendarDayId) {
      record.calendarDayId = (attendance as any).calendarDayId;
    }

    // Add event ID if provided (links to institute_calendar_events.id)
    if ((attendance as any).eventId) {
      record.eventId = (attendance as any).eventId;
    }

    // Add advertisement ID if provided (for delivery capability tracking)
    if (attendance.advertisementId) {
      record.advertisementId = attendance.advertisementId;
    }

    return record;
  }

  // Convert DynamoDB record to DTO
  // ✅ FIXED: Returns timestamp, calendarDayId, eventId for frontend update/delete operations
  // ✅ CONSOLIDATED: Extracts latitude/longitude from address object for backward compatibility
  private recordToAttendance(record: any): MarkAttendanceDto & { userType?: string; timestamp?: number; calendarDayId?: string; eventId?: string; latitude?: number; longitude?: number } {
    return {
      studentId: String(record.studentId), // Ensure string type for consistency
      studentName: record.studentName,
      studentImageUrl: record.studentImageUrl || record.imageUrl || undefined,
      imageUrl: record.studentImageUrl || record.imageUrl || undefined,
      instituteId: String(record.instituteId), // Ensure string type for consistency
      instituteName: record.instituteName,
      classId: record.classId ? String(record.classId) : undefined,  // Optional field, ensure string
      className: record.className || undefined,  // Optional field
      subjectId: record.subjectId ? String(record.subjectId) : undefined,  // Optional field, ensure string
      subjectName: record.subjectName || undefined,  // Optional field
      date: record.date,
      status: this.numberToStatus(record.status),
      location: record.location,
      address: record.address,  // Include address object as-is
      // ✅ CONSOLIDATED: Extract latitude/longitude from address for backward compatibility
      latitude: record.address?.latitude,
      longitude: record.address?.longitude,
      remarks: record.remarks,
      markingMethod: record.markingMethod,
      userType: record.userType || 'STUDENT',  // Default to STUDENT for backward compatibility
      calendarDayId: record.calendarDayId,
      eventId: record.eventId,
      advertisementId: record.advertisementId || undefined,
      timestamp: record.timestamp,  // ✅ FIXED DATA-004: Return timestamp so frontend can update/delete
    } as any;
  }

  // Mark single attendance
  async markAttendance(attendance: MarkAttendanceDto): Promise<AttendanceRecord> {
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
      return record as AttendanceRecord;
    } catch (error) {
      this.handleDynamoDBError(error, 'mark attendance');
    }
  }

  /**
   * Retrieve a single attendance record by its encoded ID.
   * The ID is a base64url-encoded string of "${pk}~${sk}", allowing direct
   * GetItem lookup without a secondary index.
   */
  async getAttendanceById(id: string): Promise<AttendanceRecord | null> {
    try {
      const decoded = Buffer.from(id, 'base64url').toString('utf8');
      const separatorIndex = decoded.indexOf('~');
      if (separatorIndex === -1) return null;

      const pk = decoded.substring(0, separatorIndex);
      const sk = decoded.substring(separatorIndex + 1);

      const result = await this.dynamoClient.send(
        new GetItemCommand({
          TableName: this.tableName,
          Key: marshall({ pk, sk }),
        }),
      );

      if (!result.Item) return null;
      const item = unmarshall(result.Item) as any;
      // Restore the id field (it's stored in the item but recompute for safety)
      item.id = id;
      return item as AttendanceRecord;
    } catch (error) {
      this.logger.error(`getAttendanceById failed: ${error.message}`);
      return null;
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
      
      // Generate DynamoDB records first so each record's .id (base64url PK~SK) is
      // captured before any timestamp changes — required for push-notification deep-links.
      const batchPairs: Array<{ dto: MarkAttendanceDto; record: AttendanceRecord }> =
        batch.map(dto => ({ dto, record: this.attendanceToRecord(dto) }));

      const writeRequests = batchPairs.map(({ record }) => ({
        PutRequest: {
          Item: marshall(record, { removeUndefinedValues: true })
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

        // ✅ FIXED BUG-005: Handle unprocessed items correctly
        // DynamoDB doesn't guarantee WHICH items fail, so we identify them by key comparison
        if (response.UnprocessedItems && response.UnprocessedItems[this.tableName]?.length > 0) {
          const unprocessedKeys = new Set(
            response.UnprocessedItems[this.tableName].map(item => {
              const rec = unmarshall(item.PutRequest.Item);
              return `${rec.studentId}#${rec.date}`;
            })
          );
          this.logger.warn(`${unprocessedKeys.size} items were not processed in batch`);

          for (const { dto, record } of batchPairs) {
            const key = `${dto.studentId}#${dto.date}`;
            if (unprocessedKeys.has(key)) {
              failed.push({
                attendance: dto,
                error: 'Item not processed in batch - capacity exceeded'
              });
            } else {
              // Attach generated record id and timestamp to the DTO so callers can build
              // deep-links and sync to MySQL with the SAME timestamp used in DynamoDB
              (dto as any).id = record.id;
              (dto as any).timestamp = record.timestamp;
              successful.push(dto);
            }
          }
        } else {
          // All items processed successfully — attach ids and timestamps, then collect
          for (const { dto, record } of batchPairs) {
            (dto as any).id = record.id;
            (dto as any).timestamp = record.timestamp;
          }
          successful.push(...batchPairs.map(p => p.dto));
        }
        
      } catch (error) {
        this.logger.error(`Batch write failed for items ${i} to ${i + batchPairs.length}:`, error);

        // Mark all items in failed batch as failed
        batchPairs.forEach(({ dto }) => {
          failed.push({
            attendance: dto,
            error: error.message || 'Batch write failed'
          });
        });
      }
    }
    
    return { successful, failed };
  }

  // Mark bulk attendance
  // ✅ FIXED BUG-001: Now accepts and propagates calendarDayId + eventId from the bulk DTO
  // ✅ CONSOLIDATED: Uses address object for storing latitude/longitude
  async markBulkAttendance(bulkData: BulkAttendanceDto): Promise<MarkAttendanceDto[]> {
    const dateForRecords = getCurrentSriLankaDate();
    const attendances = bulkData.students.map(studentData => ({
      studentId: studentData.studentId,
      studentName: studentData.studentName,
      studentImageUrl: (studentData as any).studentImageUrl || (studentData as any).imageUrl,
      instituteId: bulkData.instituteId,
      instituteName: bulkData.instituteName,
      classId: bulkData.classId,
      className: bulkData.className,
      subjectId: bulkData.subjectId,
      subjectName: bulkData.subjectName,
      date: dateForRecords,
      status: studentData.status,
      location: bulkData.location,
      address: bulkData.address,  // ✅ CONSOLIDATED: Pass address object directly
      remarks: studentData.remarks,
      markingMethod: bulkData.markingMethod,
      calendarDayId: (bulkData as any).calendarDayId,  // ✅ BUG-001 FIX: calendar linkage
      eventId: (bulkData as any).defaultEventId || (bulkData as any).eventId,  // ✅ BUG-001 FIX: event linkage
      userType: (bulkData as any).userTypeMap?.get(studentData.studentId) || undefined, // user type from service
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
    // SECURITY: Validate date format to prevent key injection
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new Error('Invalid date format. Expected YYYY-MM-DD.');
    }
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
  // ✅ FIXED PERF-002: Use KeyConditionExpression for date range on GSI sort key instead of FilterExpression
  async getStudentAttendance(studentId: string, instituteId: string, startDate?: string, endDate?: string): Promise<MarkAttendanceDto[]> {
    const gsiPk = this.generateGSIPartitionKey(instituteId, studentId);
    const safeInstituteId = String(instituteId).replace(/[^a-zA-Z0-9_-]/g, '');

    const params: QueryCommandInput = {
      TableName: this.tableName,
      IndexName: this.gsiName,
      ScanIndexForward: false // Latest first
    };

    // ✅ PERF-002: Use GSI sort key for date range (gsi_sk starts with I#<instituteId>#D#<date>)
    if (startDate && endDate) {
      params.KeyConditionExpression = 'gsi_pk = :gsi_pk AND gsi_sk BETWEEN :start AND :end';
      params.ExpressionAttributeValues = marshall({
        ':gsi_pk': gsiPk,
        ':start': `I#${safeInstituteId}#D#${startDate}`,
        ':end': `I#${safeInstituteId}#D#${endDate}~` // ~ sorts after all date-suffixed values
      }, { removeUndefinedValues: true });
    } else {
      params.KeyConditionExpression = 'gsi_pk = :gsi_pk';
      params.ExpressionAttributeValues = marshall({
        ':gsi_pk': gsiPk
      }, { removeUndefinedValues: true });
    }

    // ✅ PERF-003: Paginate through all results
    const allRecords: MarkAttendanceDto[] = [];
    let lastEvaluatedKey: Record<string, any> | undefined;

    do {
      if (lastEvaluatedKey) {
        params.ExclusiveStartKey = lastEvaluatedKey;
      }

      const result = await this.retryWithBackoff(async () => {
        return await this.dynamoClient.send(new QueryCommand(params));
      });

      if (result.Items) {
        allRecords.push(...result.Items.map(item => this.recordToAttendance(unmarshall(item))));
      }
      lastEvaluatedKey = result.LastEvaluatedKey;
    } while (lastEvaluatedKey);

    return allRecords;
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

  /**
   * Update just the advertisementId on an existing attendance record.
   * Called fire-and-forget after an ad is matched during notification delivery.
   */
  async patchAdvertisementId(encodedId: string, advertisementId: string): Promise<void> {
    try {
      const decoded = Buffer.from(encodedId, 'base64url').toString('utf8');
      const separatorIndex = decoded.indexOf('~');
      if (separatorIndex === -1) return;

      const pk = decoded.substring(0, separatorIndex);
      const sk = decoded.substring(separatorIndex + 1);

      await this.dynamoClient.send(new UpdateItemCommand({
        TableName: this.tableName,
        Key: marshall({ pk, sk }),
        UpdateExpression: 'SET #adId = :adId',
        ExpressionAttributeNames: { '#adId': 'advertisementId' },
        ExpressionAttributeValues: marshall({ ':adId': advertisementId }),
      }));
    } catch (error) {
      this.logger.warn(`patchAdvertisementId failed for ${encodedId}: ${error.message}`);
    }
  }

  /**
   * Get attendance for a specific event
   * Use case: See who attended Parents Meeting, Field Trip, etc.
   * ✅ FIXED PERF-003: Added pagination loop for DynamoDB 1MB limit
   */
  async getAttendanceByEvent(
    instituteId: string,
    eventId: string,
    date?: string
  ): Promise<MarkAttendanceDto[]> {
    const params: QueryCommandInput = {
      TableName: this.tableName,
      KeyConditionExpression: date 
        ? 'pk = :pk AND begins_with(sk, :sk)'
        : 'pk = :pk',
      FilterExpression: 'eventId = :eventId',
      ExpressionAttributeValues: marshall({
        ':pk': this.generatePartitionKey(instituteId),
        ...(date && { ':sk': `ATTENDANCE#${date}` }),
        ':eventId': eventId
      }, { removeUndefinedValues: true }),
      ScanIndexForward: false
    };

    const allRecords: MarkAttendanceDto[] = [];
    let lastEvaluatedKey: Record<string, any> | undefined;

    do {
      if (lastEvaluatedKey) {
        params.ExclusiveStartKey = lastEvaluatedKey;
      }
      const result = await this.retryWithBackoff(async () => {
        return await this.dynamoClient.send(new QueryCommand(params));
      });
      if (result.Items) {
        allRecords.push(...result.Items.map(item => this.recordToAttendance(unmarshall(item))));
      }
      lastEvaluatedKey = result.LastEvaluatedKey;
    } while (lastEvaluatedKey);

    return allRecords;
  }

  /**
   * Get attendance for a specific calendar day
   * Use case: See all attendance (students, teachers, parents) for a calendar day
   * ✅ FIXED PERF-003: Added pagination loop for DynamoDB 1MB limit
   */
  async getAttendanceByCalendarDay(
    instituteId: string,
    calendarDayId: string,
    userType?: string
  ): Promise<MarkAttendanceDto[]> {
    const filterConditions = ['calendarDayId = :calendarDayId'];
    const attributeValues: any = {
      ':pk': this.generatePartitionKey(instituteId),
      ':calendarDayId': calendarDayId
    };

    if (userType) {
      filterConditions.push('userType = :userType');
      attributeValues[':userType'] = userType;
    }

    const params: QueryCommandInput = {
      TableName: this.tableName,
      KeyConditionExpression: 'pk = :pk',
      FilterExpression: filterConditions.join(' AND '),
      ExpressionAttributeValues: marshall(attributeValues, { removeUndefinedValues: true }),
      ScanIndexForward: false
    };

    const allRecords: MarkAttendanceDto[] = [];
    let lastEvaluatedKey: Record<string, any> | undefined;

    do {
      if (lastEvaluatedKey) {
        params.ExclusiveStartKey = lastEvaluatedKey;
      }
      const result = await this.retryWithBackoff(async () => {
        return await this.dynamoClient.send(new QueryCommand(params));
      });
      if (result.Items) {
        allRecords.push(...result.Items.map(item => this.recordToAttendance(unmarshall(item))));
      }
      lastEvaluatedKey = result.LastEvaluatedKey;
    } while (lastEvaluatedKey);

    return allRecords;
  }

  /**
   * Get attendance by user type (STUDENT, TEACHER, PARENT, etc.)
   * Use case: See all teacher attendance, all parent attendance at events
   * ✅ FIXED PERF-003: Added pagination loop for DynamoDB 1MB limit
   */
  async getAttendanceByUserType(
    instituteId: string,
    userType: string,
    date?: string,
    eventId?: string,
    classId?: string,
    subjectId?: string
  ): Promise<MarkAttendanceDto[]> {
    const filterConditions = ['userType = :userType'];
    const attributeNames: Record<string, string> = {};
    const attributeValues: any = {
      ':pk': this.generatePartitionKey(instituteId),
      ':userType': userType
    };

    if (eventId) {
      filterConditions.push('eventId = :eventId');
      attributeValues[':eventId'] = eventId;
    }

    if (classId) {
      filterConditions.push('#classId = :classId');
      attributeNames['#classId'] = 'classId';
      attributeValues[':classId'] = classId;
    }

    if (subjectId) {
      filterConditions.push('#subjectId = :subjectId');
      attributeNames['#subjectId'] = 'subjectId';
      attributeValues[':subjectId'] = subjectId;
    }

    const params: QueryCommandInput = {
      TableName: this.tableName,
      KeyConditionExpression: date
        ? 'pk = :pk AND begins_with(sk, :sk)'
        : 'pk = :pk',
      FilterExpression: filterConditions.join(' AND '),
      ExpressionAttributeValues: marshall({
        ...attributeValues,
        ...(date && { ':sk': `ATTENDANCE#${date}` })
      }, { removeUndefinedValues: true }),
      ScanIndexForward: false
    };

    if (Object.keys(attributeNames).length > 0) {
      params.ExpressionAttributeNames = attributeNames;
    }

    const allRecords: MarkAttendanceDto[] = [];
    let lastEvaluatedKey: Record<string, any> | undefined;

    do {
      if (lastEvaluatedKey) {
        params.ExclusiveStartKey = lastEvaluatedKey;
      }
      const result = await this.retryWithBackoff(async () => {
        return await this.dynamoClient.send(new QueryCommand(params));
      });
      if (result.Items) {
        allRecords.push(...result.Items.map(item => this.recordToAttendance(unmarshall(item))));
      }
      lastEvaluatedKey = result.LastEvaluatedKey;
    } while (lastEvaluatedKey);

    return allRecords;
  }

  /**
   * Get student attendance at a specific event type
   * Use case: Get student's attendance at all PARENTS_MEETING events
   * ✅ FIXED PERF-003: Added pagination loop for DynamoDB 1MB limit
   */
  async getStudentAttendanceByEvent(
    studentId: string,
    instituteId: string,
    eventId: string,
    startDate?: string,
    endDate?: string
  ): Promise<MarkAttendanceDto[]> {
    const filterConditions = ['eventId = :eventId'];
    const attributeNames: Record<string, string> = {};
    const attributeValues: any = {
      ':gsi_pk': this.generateGSIPartitionKey(instituteId, studentId),
      ':eventId': eventId
    };

    if (startDate && endDate) {
      filterConditions.push('#date >= :startDate AND #date <= :endDate');
      attributeNames['#date'] = 'date';
      attributeValues[':startDate'] = startDate;
      attributeValues[':endDate'] = endDate;
    }

    const params: QueryCommandInput = {
      TableName: this.tableName,
      IndexName: this.gsiName,
      KeyConditionExpression: 'gsi_pk = :gsi_pk',
      FilterExpression: filterConditions.join(' AND '),
      ExpressionAttributeValues: marshall(attributeValues, { removeUndefinedValues: true }),
      ScanIndexForward: false
    };

    if (Object.keys(attributeNames).length > 0) {
      params.ExpressionAttributeNames = attributeNames;
    }

    const allRecords: MarkAttendanceDto[] = [];
    let lastEvaluatedKey: Record<string, any> | undefined;

    do {
      if (lastEvaluatedKey) {
        params.ExclusiveStartKey = lastEvaluatedKey;
      }
      const result = await this.retryWithBackoff(async () => {
        return await this.dynamoClient.send(new QueryCommand(params));
      });
      if (result.Items) {
        allRecords.push(...result.Items.map(item => this.recordToAttendance(unmarshall(item))));
      }
      lastEvaluatedKey = result.LastEvaluatedKey;
    } while (lastEvaluatedKey);

    return allRecords;
  }

  /**
   * Query ALL attendance for a student across ALL institutes via GSI.
   * Uses GSI_PK = STUDENT#{studentId} (no institute filter) so a single
   * DynamoDB query returns every record for this student regardless of institute.
   * Supports optional date-range on the GSI sort key for efficiency.
   */
  async getStudentAttendanceAllInstitutes(
    studentId: string,
    startDate?: string,
    endDate?: string
  ): Promise<(MarkAttendanceDto & { timestamp?: number; calendarDayId?: string; eventId?: string })[]> {
    const sanitized = String(studentId).replace(/[^a-zA-Z0-9_-]/g, '');
    const gsiPk = `STUDENT#${sanitized}`;

    const params: QueryCommandInput = {
      TableName: this.tableName,
      IndexName: this.gsiName,
      ScanIndexForward: false, // newest first
    };

    if (startDate && endDate) {
      // gsi_sk pattern: I#{instituteId}#D#{date}#TS#... — prefix all institutes with date range
      params.KeyConditionExpression = 'gsi_pk = :gsi_pk AND gsi_sk BETWEEN :start AND :end';
      params.ExpressionAttributeValues = marshall({
        ':gsi_pk': gsiPk,
        ':start': `I#`,
        ':end': `I#~`,
      }, { removeUndefinedValues: true });

      // Use FilterExpression to narrow by date since BETWEEN on prefix isn't date-exact
      params.FilterExpression = '#dt >= :startDate AND #dt <= :endDate';
      params.ExpressionAttributeNames = { '#dt': 'date' };
      // Merge filter values into the existing ExpressionAttributeValues
      const merged = marshall({
        ':gsi_pk': gsiPk,
        ':start': `I#`,
        ':end': `I#~`,
        ':startDate': startDate,
        ':endDate': endDate,
      }, { removeUndefinedValues: true });
      params.ExpressionAttributeValues = merged;
    } else {
      params.KeyConditionExpression = 'gsi_pk = :gsi_pk';
      params.ExpressionAttributeValues = marshall({ ':gsi_pk': gsiPk }, { removeUndefinedValues: true });
    }

    const allRecords: (MarkAttendanceDto & { timestamp?: number; calendarDayId?: string; eventId?: string })[] = [];
    let lastEvaluatedKey: Record<string, any> | undefined;

    do {
      if (lastEvaluatedKey) {
        params.ExclusiveStartKey = lastEvaluatedKey;
      }
      const result = await this.retryWithBackoff(async () => {
        return await this.dynamoClient.send(new QueryCommand(params));
      });
      if (result.Items) {
        allRecords.push(...result.Items.map(item => this.recordToAttendance(unmarshall(item))));
      }
      lastEvaluatedKey = result.LastEvaluatedKey;
    } while (lastEvaluatedKey);

    return allRecords;
  }

  // Get attendance summary for date range
  // ✅ PERFORMANCE: Added pagination support to prevent scanning millions of records
  // ✅ FIXED PERF-006: Records are now opt-in via includeRecords parameter to reduce memory usage
  // ✅ FIXED DATA-003: Added per-userType breakdown in summary
  async getAttendanceSummary(
    instituteId: string,
    classId?: string,
    subjectId?: string,
    startDate?: string,
    endDate?: string,
    limit?: number,
    includeRecords: boolean = false
  ): Promise<any> {
    const maxItems = limit || 10000; // Default safety limit
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
      filterConditions.push('#classId = :classId');
      filterConditions.push('#subjectId = :subjectId');
      attributeNames['#classId'] = 'classId';
      attributeNames['#subjectId'] = 'subjectId';
      attributeValues[':classId'] = classId;
      attributeValues[':subjectId'] = subjectId;
    } else if (classId && !subjectId) {
      filterConditions.push('#classId = :classId');
      filterConditions.push('(attribute_not_exists(#subjectId) OR #subjectId = :defaultSubject)');
      attributeNames['#classId'] = 'classId';
      attributeNames['#subjectId'] = 'subjectId';
      attributeValues[':classId'] = classId;
      attributeValues[':defaultSubject'] = 'default';
    } else if (!classId && !subjectId) {
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

    // ✅ PERFORMANCE: Paginate through results to handle DynamoDB 1MB limit
    const attendanceRecords: any[] = [];
    let lastEvaluatedKey: Record<string, any> | undefined;

    do {
      if (lastEvaluatedKey) {
        params.ExclusiveStartKey = lastEvaluatedKey;
      }

      const result = await this.retryWithBackoff(async () => {
        return await this.dynamoClient.send(new QueryCommand(params));
      });

      if (result.Items) {
        for (const item of result.Items) {
          attendanceRecords.push(unmarshall(item));
          if (attendanceRecords.length >= maxItems) break;
        }
      }

      lastEvaluatedKey = result.LastEvaluatedKey;
    } while (lastEvaluatedKey && attendanceRecords.length < maxItems);
    
    // Calculate summary statistics
    const totalRecords = attendanceRecords.length;
    const presentCount = attendanceRecords.filter(record => record.status === 1).length;
    const absentCount = attendanceRecords.filter(record => record.status === 0).length;
    const lateCount = attendanceRecords.filter(record => record.status === 2).length;
    const leftCount = attendanceRecords.filter(record => record.status === 3).length;
    const leftEarlyCount = attendanceRecords.filter(record => record.status === 4).length;
    const leftLatelyCount = attendanceRecords.filter(record => record.status === 5).length;
    const attendanceRate = totalRecords > 0 ? (presentCount / totalRecords) * 100 : 0;

    // ✅ FIXED DATA-003: Per-userType breakdown
    const byUserType: Record<string, { total: number; present: number; absent: number; late: number; left: number; leftEarly: number; leftLately: number }> = {};
    for (const record of attendanceRecords) {
      const uType = record.userType || 'STUDENT';
      if (!byUserType[uType]) {
        byUserType[uType] = { total: 0, present: 0, absent: 0, late: 0, left: 0, leftEarly: 0, leftLately: 0 };
      }
      byUserType[uType].total++;
      if (record.status === 1) byUserType[uType].present++;
      else if (record.status === 0) byUserType[uType].absent++;
      else if (record.status === 2) byUserType[uType].late++;
      else if (record.status === 3) byUserType[uType].left++;
      else if (record.status === 4) byUserType[uType].leftEarly++;
      else if (record.status === 5) byUserType[uType].leftLately++;
    }

    const response: any = {
      totalRecords,
      presentCount,
      absentCount,
      lateCount,
      leftCount,
      leftEarlyCount,
      leftLatelyCount,
      attendanceRate: parseFloat(attendanceRate.toFixed(2)),
      byUserType,  // ✅ DATA-003: Per-userType breakdown
    };

    // ✅ PERF-006: Only include raw records if explicitly requested
    if (includeRecords) {
      response.records = attendanceRecords.map(record => this.recordToAttendance(record));
    }

    return response;
  }

  /**
   * Get daily attendance counts for a month, grouped by date.
   * Queries raw DynamoDB records directly so status remains a number (0–5).
   */
  async getDailyAttendanceCount(
    instituteId: string,
    year: number,
    month: number,
    classId?: string,
    subjectId?: string,
  ): Promise<{ date: string; day: number; presentCount: number; absentCount: number; lateCount: number; leftCount: number; leftEarlyCount: number; leftLatelyCount: number; totalRecords: number }[]> {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    // Build DynamoDB query mirroring getAttendanceSummary — raw records, status is a number
    const params: QueryCommandInput = {
      TableName: this.tableName,
      KeyConditionExpression: 'pk = :pk',
      ExpressionAttributeValues: marshall({ ':pk': this.generatePartitionKey(instituteId) }, { removeUndefinedValues: true }),
      ScanIndexForward: false,
    };

    const filterConditions: string[] = [];
    const attributeNames: Record<string, string> = {};
    const attributeValues: Record<string, any> = { ':pk': this.generatePartitionKey(instituteId) };

    if (classId && subjectId) {
      filterConditions.push('#classId = :classId', '#subjectId = :subjectId');
      attributeNames['#classId'] = 'classId';
      attributeNames['#subjectId'] = 'subjectId';
      attributeValues[':classId'] = classId;
      attributeValues[':subjectId'] = subjectId;
    } else if (classId && !subjectId) {
      filterConditions.push('#classId = :classId', '(attribute_not_exists(#subjectId) OR #subjectId = :defaultSubject)');
      attributeNames['#classId'] = 'classId';
      attributeNames['#subjectId'] = 'subjectId';
      attributeValues[':classId'] = classId;
      attributeValues[':defaultSubject'] = 'default';
    } else if (!classId && !subjectId) {
      filterConditions.push('(attribute_not_exists(#classId) OR #classId = :defaultClass)');
      attributeNames['#classId'] = 'classId';
      attributeValues[':defaultClass'] = 'default';
    }

    filterConditions.push('#date >= :startDate AND #date <= :endDate');
    attributeNames['#date'] = 'date';
    attributeValues[':startDate'] = startDate;
    attributeValues[':endDate'] = endDate;

    params.FilterExpression = filterConditions.join(' AND ');
    params.ExpressionAttributeNames = attributeNames;
    params.ExpressionAttributeValues = marshall(attributeValues, { removeUndefinedValues: true });

    // Paginate through all matching records
    const rawRecords: any[] = [];
    let lastEvaluatedKey: Record<string, any> | undefined;
    do {
      if (lastEvaluatedKey) params.ExclusiveStartKey = lastEvaluatedKey;
      const result = await this.retryWithBackoff(async () => this.dynamoClient.send(new QueryCommand(params)));
      if (result.Items) {
        for (const item of result.Items) rawRecords.push(unmarshall(item));
      }
      lastEvaluatedKey = result.LastEvaluatedKey;
    } while (lastEvaluatedKey);

    // Aggregate day-by-day — record.status is a raw number here
    const dayMap: Record<string, { presentCount: number; absentCount: number; lateCount: number; leftCount: number; leftEarlyCount: number; leftLatelyCount: number; totalRecords: number }> = {};
    for (const record of rawRecords) {
      const d: string = record.date;
      if (!d) continue;
      if (!dayMap[d]) {
        dayMap[d] = { presentCount: 0, absentCount: 0, lateCount: 0, leftCount: 0, leftEarlyCount: 0, leftLatelyCount: 0, totalRecords: 0 };
      }
      dayMap[d].totalRecords++;
      switch (Number(record.status)) {
        case 1: dayMap[d].presentCount++; break;
        case 0: dayMap[d].absentCount++; break;
        case 2: dayMap[d].lateCount++; break;
        case 3: dayMap[d].leftCount++; break;
        case 4: dayMap[d].leftEarlyCount++; break;
        case 5: dayMap[d].leftLatelyCount++; break;
      }
    }

    return Object.entries(dayMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, counts]) => ({ date, day: parseInt(date.split('-')[2], 10), ...counts }));
  }

  /**
   * Get monthly attendance count grouped by status.
   * Delegates to getAttendanceSummary with computed month date range.
   */
  async getMonthlyAttendanceCount(
    instituteId: string,
    year: number,
    month: number,
    classId?: string,
    subjectId?: string,
  ): Promise<{
    totalRecords: number;
    presentCount: number;
    absentCount: number;
    lateCount: number;
    leftCount: number;
    leftEarlyCount: number;
    leftLatelyCount: number;
    attendanceRate: number;
  }> {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    const summary = await this.getAttendanceSummary(
      instituteId, classId, subjectId, startDate, endDate, undefined, false,
    );

    return {
      totalRecords: summary.totalRecords,
      presentCount: summary.presentCount,
      absentCount: summary.absentCount,
      lateCount: summary.lateCount || 0,
      leftCount: summary.leftCount || 0,
      leftEarlyCount: summary.leftEarlyCount || 0,
      leftLatelyCount: summary.leftLatelyCount || 0,
      attendanceRate: summary.attendanceRate,
    };
  }
}

