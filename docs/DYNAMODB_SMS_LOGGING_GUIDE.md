# 📊 DynamoDB SMS Logging System Guide

## 🎯 **Overview**

The Enhanced SMS System stores comprehensive logs in **DynamoDB** for tracking SMS notifications, delivery status, and analytics. Here's how the logging system works:

## 🏗️ **Architecture**

```
Enhanced SMS Service → NotificationLoggingService → DynamoDbService → AWS DynamoDB
```

## 📋 **DynamoDB Table Structure**

### **Table Name: `SmsNotificationLogs`**

| Field | Type | Description |
|-------|------|-------------|
| `messageId` | String (PK) | Unique SMS message identifier |
| `recipientPhone` | String (SK) | Recipient phone number (sort key) |
| `instituteId` | String | Institute identifier |
| `recipientId` | String | User ID of recipient (optional) |
| `recipientType` | String | Type: STUDENT, TEACHER, PARENT, CUSTOM |
| `recipientName` | String | Name of recipient |
| `messageContent` | String | SMS message content |
| `status` | String | QUEUED, SENT, DELIVERED, FAILED |
| `sentAt` | String | ISO timestamp when SMS was sent |
| `deliveredAt` | String | ISO timestamp when SMS was delivered |
| `errorMessage` | String | Error details if failed |
| `timestamp` | String | Creation timestamp |
| `ttl` | Number | Time-to-live (1 year) |

## 🔄 **Logging Flow**

### **1. Initial SMS Log Entry**
```typescript
// In enhanced-sms.service.ts
await this.notificationLoggingService.logSmsBatch(
  savedMessage.id,              // messageId
  params.recipients.map(recipient => ({
    recipientId: recipient.userId,
    recipientType: recipient.userType || 'CUSTOM',
    phoneNumber: recipient.phoneNumber,
    recipientName: recipient.name,
    status: requiresVerification ? 'PENDING_VERIFICATION' : 'QUEUED',
  })),
  {
    instituteId: params.instituteId,
    messageContent: params.messageTemplate,
  }
);
```

### **2. DynamoDB Storage**
```typescript
// In notification-logging.service.ts
private async logToDynamoDB(data: any): Promise<void> {
  await this.dynamoDbService.putItem('SmsNotificationLogs', {
    messageId: data.messageId,
    recipientPhone: data.phoneNumber,
    instituteId: data.instituteId,
    recipientId: data.recipientId,
    recipientType: data.recipientType,
    recipientName: data.recipientName,
    messageContent: data.messageContent,
    status: data.status,
    sentAt: data.sentAt?.toISOString(),
    deliveredAt: data.deliveredAt?.toISOString(),
    errorMessage: data.errorMessage,
    timestamp: new Date().toISOString(),
    ttl: Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60), // 1 year TTL
  });
}
```

### **3. Status Updates**
```typescript
// Update delivery status
await this.notificationLoggingService.updateNotificationStatus(
  messageId,
  recipientPhone,
  'DELIVERED',
  new Date(),
  null
);
```

## 🚀 **How to Use DynamoDB Logging**

### **1. Environment Configuration**
```env
# Add to your .env file
AWS_DYNAMODB_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
```

### **2. Create DynamoDB Table**
```bash
# AWS CLI command to create the table
aws dynamodb create-table \
  --table-name SmsNotificationLogs \
  --attribute-definitions \
    AttributeName=messageId,AttributeType=S \
    AttributeName=recipientPhone,AttributeType=S \
  --key-schema \
    AttributeName=messageId,KeyType=HASH \
    AttributeName=recipientPhone,KeyType=RANGE \
  --billing-mode PAY_PER_REQUEST \
  --time-to-live-specification \
    AttributeName=ttl,Enabled=true
```

### **3. Query SMS Logs**

#### **Get All Logs for a Message**
```typescript
const logs = await this.dynamoDbService.queryItems(
  'SmsNotificationLogs',
  'messageId = :messageId',
  { ':messageId': 'MSG_12345' }
);
```

#### **Get All Logs for an Institute**
```typescript
const stats = await this.notificationLoggingService.getSmsStatistics(
  'institute123',
  new Date('2024-01-01'),
  new Date('2024-12-31')
);
```

#### **Custom Query Example**
```typescript
// Get failed SMS logs
const failedLogs = await this.dynamoDbService.scanItems(
  'SmsNotificationLogs',
  '#status = :status',
  { ':status': 'FAILED' },
  { '#status': 'status' }
);
```

## 📈 **Analytics & Statistics**

The system provides comprehensive analytics:

```typescript
const stats = await this.notificationLoggingService.getSmsStatistics('institute123');

console.log(stats);
// Output:
{
  totalSent: 1250,
  totalDelivered: 1187,
  totalFailed: 13,
  totalPending: 50,
  byRecipientType: {
    STUDENT: 800,
    PARENT: 350,
    TEACHER: 100
  },
  byStatus: {
    DELIVERED: 1187,
    FAILED: 13,
    PENDING: 50
  }
}
```

## 🔍 **Log Tracking Examples**

### **Example 1: Send Custom SMS with Logging**
```typescript
// When you send SMS
const result = await this.enhancedSmsService.sendCustomSms(
  'institute123',
  'user456',
  'Hello {{name}}, your attendance is {{attendance}}%',
  [
    { number: '+94771234567', name: 'John Doe' },
    { number: '+94777654321', name: 'Jane Smith' }
  ]
);

// Automatically logs to DynamoDB:
// - messageId: result.messageId
// - 2 entries (one per recipient)
// - status: 'QUEUED'
// - timestamp: current time
```

### **Example 2: Track Delivery Status**
```typescript
// When SMS provider confirms delivery
await this.notificationLoggingService.updateNotificationStatus(
  'MSG_12345',
  '+94771234567',
  'DELIVERED',
  new Date()
);

// Updates DynamoDB record:
// - status: 'DELIVERED'
// - deliveredAt: timestamp
// - updatedAt: current time
```

## 🛠️ **Benefits of DynamoDB Logging**

### **✅ Advantages:**
- **High Performance**: NoSQL, fast queries
- **Scalability**: Handles millions of SMS logs
- **TTL Support**: Automatic cleanup after 1 year
- **Global Secondary Indexes**: Query by institute, date, status
- **Cost Effective**: Pay per request model
- **Real-time Analytics**: Instant statistics

### **📊 Use Cases:**
- **Delivery Tracking**: Monitor SMS delivery rates
- **Compliance**: Audit trail for SMS communications
- **Analytics**: Usage patterns and statistics
- **Troubleshooting**: Debug failed SMS deliveries
- **Billing**: Track SMS usage per institute

## 🔧 **Advanced Features**

### **Batch Logging**
```typescript
// Log multiple SMS at once
await this.notificationLoggingService.logSmsBatch(
  messageId,
  recipients,
  messageData
);
```

### **Error Handling**
```typescript
// Logs errors without breaking SMS flow
try {
  await this.logToDynamoDB(data);
} catch (error) {
  this.logger.error('DynamoDB logging failed', error);
  // SMS continues even if logging fails
}
```

### **Retention Policy**
- **TTL**: 1 year automatic deletion
- **Archival**: Move old logs to S3 for long-term storage
- **Compliance**: Maintain logs as per regulatory requirements

This comprehensive DynamoDB logging system ensures complete SMS tracking, analytics, and compliance for your LMS platform! 🚀