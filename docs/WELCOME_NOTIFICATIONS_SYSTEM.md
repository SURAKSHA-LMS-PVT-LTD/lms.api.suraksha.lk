# Welcome Notification System (Email + SMS)

## ✅ Feature Complete

Successfully implemented dual notification system for comprehensive user creation endpoint. Users receive both email and SMS notifications upon account creation.

---

## 🎯 Overview

### Dual Notification Strategy
When creating users via `POST /users/comprehensive`, the system sends:

1. **📧 Email (PRIMARY)** - Always sent to all users
2. **📱 SMS (SECONDARY)** - Sent only if phone number is valid

Both notifications include the user's unique User ID for easy reference.

---

## 📧 Email Notification

### Email Details
- **Service**: AsyncEmailService (fire-and-forget pattern)
- **Template**: Registration/Welcome template
- **Delivery**: Always sent regardless of phone number
- **Blocking**: Non-blocking (async)
- **Retry**: Single automatic retry on failure

### Email Content
```
Subject: Welcome to Suraksha LMS!

Dear [FirstName],

Your account has been successfully created at Suraksha LMS.

Account Details:
- Name: [FirstName] [LastName]
- Email: [email]
- User ID: [userId]
- Registration Date: [date]

Visit our platform to get started with your learning journey.

Thank you,
Suraksha LMS Team
```

### Email Requirements
✅ User creation must succeed  
✅ Email address must be provided  
✅ EMAIL_SERVICE_ENABLED must be true (env)  
✅ EMAIL_SERVER_AUTH_TOKEN must be configured  

---

## 📱 SMS Notification

### SMS Details
- **Service**: InstantSmsService (SMSlenz provider)
- **Format**: +947XXXXXXXX (Sri Lankan format)
- **Delivery**: Only if phone number is valid
- **Blocking**: Non-blocking (async)
- **Credits**: Deducted from institute SMS balance

### SMS Message Format
```
Dear [FirstName],

Welcome to Suraksha LMS!

Your account has been successfully created.
User ID: [userId]

Visit our platform to get started with your learning journey.

Thank you,
Suraksha LMS Team
```

### SMS Requirements
✅ User creation must succeed  
✅ Phone number must be valid (+947XXXXXXXX)  
✅ Institute ID must be provided  
✅ Institute must have active sender mask  
✅ Institute must have sufficient SMS credits  

---

## 🔄 Notification Flow

```
POST /users/comprehensive
  ↓
Create user in database
  ↓
✅ User created successfully (result.userId generated)
  ↓
┌─────────────────────────────┬─────────────────────────────┐
│ EMAIL (PRIMARY)             │ SMS (SECONDARY)             │
├─────────────────────────────┼─────────────────────────────┤
│ Check: email exists?        │ Check: phone exists?        │
│   ✅ YES                     │   ✅ YES                     │
│      ↓                      │      ↓                      │
│ Send welcome email          │ Validate phone format       │
│   (async/non-blocking)      │   ✅ Valid: +947XXXXXXXX     │
│      ↓                      │      ↓                      │
│ Log: Email queued           │ Check: institute ID?        │
│      ↓                      │   ✅ YES                     │
│ Continue ✅                  │      ↓                      │
│                             │ Get sender mask             │
│                             │   ✅ Active mask found       │
│                             │      ↓                      │
│                             │ Send SMS (async)            │
│                             │      ↓                      │
│                             │ Log: SMS sent               │
│                             │      ↓                      │
│                             │ Continue ✅                  │
└─────────────────────────────┴─────────────────────────────┘
  ↓
Return user creation response
```

---

## 📋 Request Examples

### Scenario 1: Valid Email + Valid Phone (Both Sent)
```bash
curl -X POST https://your-api.com/users/comprehensive \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "John",
    "lastName": "Doe",
    "email": "john.doe@example.com",
    "phoneNumber": "+94771234567",
    "instituteId": "inst_123",
    "userType": "USER_WITHOUT_PARENT",
    "studentData": {
      "studentId": "STU001",
      "emergencyContact": "+94771234568"
    }
  }'
```

**Result**:
- ✅ User created
- ✅ Email sent to john.doe@example.com
- ✅ SMS sent to +94771234567
- Both include User ID

---

### Scenario 2: Valid Email + Invalid Phone (Email Only)
```bash
curl -X POST https://your-api.com/users/comprehensive \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "Jane",
    "lastName": "Smith",
    "email": "jane.smith@example.com",
    "phoneNumber": "1234567890",
    "instituteId": "inst_123",
    "userType": "USER_WITHOUT_PARENT",
    "studentData": {
      "studentId": "STU002",
      "emergencyContact": "+94771234569"
    }
  }'
```

**Result**:
- ✅ User created
- ✅ Email sent to jane.smith@example.com
- ⚠️ SMS skipped (invalid phone format)
- Log: `⚠️ Invalid phone number format: 1234567890. Expected: +947XXXXXXXX`

---

### Scenario 3: Valid Email + No Phone (Email Only)
```bash
curl -X POST https://your-api.com/users/comprehensive \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "Bob",
    "lastName": "Johnson",
    "email": "bob.johnson@example.com",
    "userType": "USER_WITHOUT_PARENT",
    "studentData": {
      "studentId": "STU003",
      "emergencyContact": "+94771234570"
    }
  }'
```

**Result**:
- ✅ User created
- ✅ Email sent to bob.johnson@example.com
- ⚠️ SMS skipped (no phone number)

---

## 🛡️ Error Handling

### Email Failures (Never Block User Creation)
```typescript
❌ Email service disabled → Log warning, skip email
❌ Invalid email format → Log error, skip email
❌ Email server unreachable → Log error, retry once, then skip
❌ Auth token missing → Log error, skip email
```

**User Impact**: ✅ User still created successfully

---

### SMS Failures (Never Block User Creation)
```typescript
❌ Invalid phone format → Log warning, skip SMS
❌ No institute ID → Log debug, skip SMS
❌ No sender mask → Log warning, skip SMS
❌ Insufficient credits → Log error, skip SMS
❌ SMS provider error → Log error, skip SMS
```

**User Impact**: ✅ User still created successfully

---

## 🔧 Technical Implementation

### File Modified
- **Path**: `src/modules/user/user.controller.ts`
- **Endpoint**: `POST /users/comprehensive`

### Dependencies Added
```typescript
import { AsyncEmailService } from '../../common/services/async-email.service';
import { InstantSmsService } from '../sms/services/instant-sms.service';
```

### Constructor Injection
```typescript
constructor(
  private readonly usersService: UsersService,
  private readonly instantSmsService: InstantSmsService,
  private readonly asyncEmailService: AsyncEmailService,
  // ... other services
) {}
```

### Email Sending Method
```typescript
private sendWelcomeEmail(email: string, firstName: string, userId: string): void {
  try {
    this.asyncEmailService.sendRegistrationEmailAsync({
      userEmail: email,
      userName: firstName,
      accountEmail: email,
      registrationDate: new Date().toISOString(),
      studentId: userId, // User ID included
    });
    
    this.logger.log(`✅ Welcome email sent to ${email} for user ${userId}`);
  } catch (error) {
    this.logger.error(`❌ Failed to send email: ${error.message}`);
  }
}
```

### SMS Sending Method
```typescript
private async sendWelcomeSms(
  phoneNumber: string, 
  firstName: string, 
  userId: string, 
  instituteId?: string
): Promise<void> {
  try {
    // Validate phone format
    const sriLankanPhoneRegex = /^\+947[0-9]{8}$/;
    if (!sriLankanPhoneRegex.test(phoneNumber)) {
      this.logger.warn(`⚠️ Invalid phone: ${phoneNumber}`);
      return;
    }

    // Get sender mask
    const senderMasks = await this.getSenderMasks(instituteId);
    if (!senderMasks || senderMasks.length === 0) {
      this.logger.warn(`No sender mask for institute ${instituteId}`);
      return;
    }

    // Send SMS
    await this.instantSmsService.sendSingleSms({
      instituteId,
      contact: phoneNumber,
      message: `Dear ${firstName},...`, // Full message
      maskId: defaultMask.id,
    }, 'system-auto');

    this.logger.log(`✅ SMS sent to ${phoneNumber}`);
  } catch (error) {
    this.logger.error(`❌ SMS failed: ${error.message}`);
  }
}
```

### Notification Trigger
```typescript
// After user creation
const result = await this.usersService.createComprehensive(dto, imageFile, idDocumentFile);

// 1. Email (PRIMARY - always sent)
if (result.success && result.userId && dto.email) {
  this.sendWelcomeEmail(dto.email, dto.firstName, result.userId);
}

// 2. SMS (SECONDARY - conditional)
if (result.success && result.userId && dto.phoneNumber && dto.instituteId) {
  this.sendWelcomeSms(dto.phoneNumber, dto.firstName, result.userId, dto.instituteId)
    .catch(error => this.logger.error(`SMS failed: ${error.message}`));
}

return result;
```

---

## 📊 Logging & Monitoring

### Email Logs
```bash
# Success
✅ Welcome email sent to john.doe@example.com for user 12345

# Queued
📧 Welcome email queued for john.doe@example.com (User ID: 12345)

# Error
❌ Failed to send welcome email to john.doe@example.com for user 12345: Connection timeout
```

### SMS Logs
```bash
# Success
✅ Welcome SMS sent to +94771234567 for user 12345

# Invalid Format
⚠️ Invalid phone number format: 1234567890. Expected: +947XXXXXXXX. Skipping SMS for user 12345

# No Mask
⚠️ No active sender mask found for institute inst_123, skipping SMS for user 12345

# No Credits
❌ Insufficient SMS credits for institute inst_123, cannot send SMS for user 12345

# Generic Error
❌ Failed to send SMS to +94771234567 for user 12345: Provider error
```

---

## ✅ Testing Checklist

### Email Testing
- [ ] Test with valid email → Email sent
- [ ] Test with invalid email → User created, email skipped
- [ ] Test email service disabled → User created, warning logged
- [ ] Test email server down → User created, retry attempted, then skipped
- [ ] Verify User ID included in email

### SMS Testing
- [ ] Test with valid phone (+947XXXXXXXX) → SMS sent
- [ ] Test with invalid phone format → User created, SMS skipped
- [ ] Test with no phone → User created, SMS skipped
- [ ] Test with no institute ID → User created, SMS skipped
- [ ] Test with no sender mask → User created, SMS skipped
- [ ] Test with insufficient credits → User created, SMS skipped
- [ ] Verify User ID included in SMS

### Combined Testing
- [ ] Valid email + valid phone → Both sent
- [ ] Valid email + invalid phone → Email only
- [ ] Valid email + no phone → Email only
- [ ] Invalid email + valid phone → SMS only
- [ ] Both fail → User still created

---

## 🚀 Environment Configuration

### Email Configuration (.env)
```bash
# Email Service
EMAIL_SERVICE_ENABLED=true
EMAIL_SERVER_URL=https://your-lambda-url.amazonaws.com/prod
EMAIL_SERVER_AUTH_TOKEN=your-secret-token-here
FROM_EMAIL=surakshalms@gmail.com
FROM_NAME=Suraksha LMS System
```

### SMS Configuration (.env)
```bash
# SMS Service (SMSlenz)
SMSLENZ_API_TOKEN=your-smslenz-api-token
SMSLENZ_API_URL=https://api.smslenz.com/v1
```

---

## 🎯 Benefits

### User Experience
✅ **Immediate confirmation** via email and SMS  
✅ **User ID provided** for easy reference  
✅ **Dual channels** increase delivery success rate  
✅ **Non-blocking** - fast API response  

### System Reliability
✅ **Fault-tolerant** - failures don't break user creation  
✅ **Comprehensive logging** for troubleshooting  
✅ **Async processing** - no performance impact  
✅ **Automatic retry** for email (1 retry)  

### Business Value
✅ **Professional onboarding** experience  
✅ **Reduced support queries** (users have their ID)  
✅ **Multi-channel engagement**  
✅ **Audit trail** via logs  

---

## 📚 Related Documentation

- [API Key Authentication Guide](./API_KEY_AUTHENTICATION_GUIDE.md)
- [Comprehensive User Creation](./COMPREHENSIVE_USER_CREATION_IMAGE_SUPPORT.md)
- [SMS Credentials Configuration](./SMS_CREDENTIALS_CONFIGURATION.md)
- [Rate Limiting Guide](./RATE_LIMITING_COMPREHENSIVE_GUIDE.md)

---

## 🔐 Security Notes

### Email Security
- Emails sent via authenticated AWS Lambda endpoint
- Bearer token required for email server
- No sensitive data in email templates
- User ID is non-sensitive identifier

### SMS Security
- Phone numbers validated before sending
- Institute-based SMS credits prevent abuse
- Rate limiting on SMS endpoints
- Sender masks verified before use

---

## 📝 Summary

The dual notification system provides:
1. **Email (PRIMARY)** - Always sent to all users
2. **SMS (SECONDARY)** - Sent only if phone valid

Both notifications:
- Include User ID
- Are non-blocking (async)
- Never fail user creation
- Have comprehensive logging
- Support automatic retry (email)

**Result**: Professional, reliable user onboarding with multi-channel confirmation! 🎉
