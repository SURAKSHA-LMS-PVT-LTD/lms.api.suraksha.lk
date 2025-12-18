# Instant SMS Module - Simplified Implementation

## Overview

This is a **simplified, production-ready SMS module** for sending instant SMS messages through the LMS system. It integrates with **SMSlenz** (Sri Lankan SMS gateway) but is designed to be provider-agnostic.

### Key Features ✨

- ✅ **Instant sending only** (no scheduling complexity)
- ✅ **Same message for all recipients** (no template variables)
- ✅ **Credits deducted BEFORE sending** (prevents race conditions)
- ✅ **Async processing** (don't block API responses)
- ✅ **Status tracking** (PENDING → SENDING → SUCCESS/FAILED)
- ✅ **Phone number deduplication** (using Set)
- ✅ **Provider-agnostic architecture** (easy to switch providers)

### What Was Removed 🚫

Based on your requirements, we removed:
- ❌ Scheduling logic (only instant send)
- ❌ Template variables like `{{firstName}}` (same message for all)
- ❌ Phone number masking for SMS sending (unnecessary)
- ❌ Complex verification stages

## Architecture

```
src/modules/sms/
├── interfaces/
│   └── sms-provider.interface.ts    # Provider abstraction
├── providers/
│   └── smslenz.provider.ts          # SMSlenz implementation
├── entities/
│   ├── sms-campaign.entity.ts       # Campaign tracking
│   └── sms-credit.entity.ts         # Credit management
├── dto/
│   └── instant-sms.dto.ts           # Request/response DTOs
├── services/
│   └── instant-sms.service.ts       # Business logic
├── controllers/
│   └── instant-sms.controller.ts    # API endpoints
└── instant-sms.module.ts            # Module configuration
```

## Setup Instructions

### 1. Add Environment Variables

Add these to your `.env` file:

```bash
# SMSlenz API Credentials
SMSLENZ_USER_ID=your_user_id_here
SMSLENZ_API_KEY=your_api_key_here
SMSLENZ_SENDER_ID=SMSlenzDEMO

# SMS Provider (for future extensibility)
SMS_PROVIDER=smslenz

# Cost per message (default: 1 credit)
SMS_COST_PER_MESSAGE=1
```

Get your credentials from: https://smslenz.lk/api

### 2. Run Database Migration

```bash
npm run migration:run
```

This creates two tables:
- `sms_campaigns` - Tracks all SMS campaigns
- `sms_credits` - Manages credit balance per institute

### 3. Import Module

Add to `app.module.ts`:

```typescript
import { InstantSmsModule } from './modules/sms/instant-sms.module';

@Module({
  imports: [
    // ... other modules
    InstantSmsModule,
  ],
})
export class AppModule {}
```

### 4. Initialize Credits

Before sending SMS, institutes need credits:

```bash
POST /sms/instant/credits/topup
{
  "instituteId": "1",
  "amount": 1000
}
```

## API Endpoints

### 1. Send Single SMS

```bash
POST /sms/instant/send-single
Authorization: Bearer <jwt_token>

{
  "instituteId": "1",
  "senderId": "SMSlenzDEMO",
  "contact": "+94761234567",
  "message": "Your class starts at 10 AM tomorrow"
}
```

**Response:**
```json
{
  "success": true,
  "message": "SMS sending initiated",
  "campaignId": "12345",
  "totalRecipients": 1,
  "creditsDeducted": 1,
  "status": "SENDING"
}
```

### 2. Send Bulk SMS

```bash
POST /sms/instant/send-bulk
Authorization: Bearer <jwt_token>

{
  "instituteId": "1",
  "message": "Important: School will be closed tomorrow",
  "classIds": ["1", "2"],
  "userTypes": ["STUDENT", "TEACHER"],
  "statuses": ["ACTIVE"]
}
```

**OR with manual contacts:**
```json
{
  "instituteId": "1",
  "message": "Important announcement",
  "contacts": ["+94761234567", "+94771234567"]
}
```

**Response:**
```json
{
  "success": true,
  "message": "Bulk SMS sending initiated",
  "campaignId": "12346",
  "totalRecipients": 150,
  "creditsDeducted": 150,
  "status": "SENDING"
}
```

### 3. Check Credit Balance

```bash
GET /sms/instant/credits/:instituteId
Authorization: Bearer <jwt_token>
```

**Response:**
```json
{
  "instituteId": "1",
  "balance": 5000.50,
  "totalPurchased": 10000,
  "totalUsed": 4999.50,
  "lastTopupAt": "2024-10-14T10:30:00Z"
}
```

### 4. Get Campaign Status

```bash
GET /sms/instant/campaign/:campaignId
Authorization: Bearer <jwt_token>
```

**Response:**
```json
{
  "id": "12345",
  "instituteId": "1",
  "status": "SUCCESS",
  "totalRecipients": 150,
  "successfulSends": 150,
  "failedSends": 0,
  "creditsDeducted": 150,
  "message": "Important announcement",
  "createdAt": "2024-10-14T10:30:00Z",
  "sentAt": "2024-10-14T10:30:05Z"
}
```

## How It Works

### Credit Deduction Flow

```
1. User initiates SMS
2. System calculates required credits
3. Credits deducted FIRST (with transaction lock)
4. If insufficient credits → Fail immediately
5. If sufficient → Create campaign (status: PENDING)
6. Return response to user (don't wait for sending)
7. Send SMS asynchronously
8. Update campaign status based on provider response
```

### Phone Number Extraction

When sending bulk SMS with filters:

```typescript
// Example: Get all active students in classes 1 and 2
{
  "classIds": ["1", "2"],
  "userTypes": ["STUDENT"],
  "statuses": ["ACTIVE"]
}

// System extracts phone numbers:
1. Query institute_user table with filters
2. Join with user table to get phone numbers
3. Format numbers to +947XXXXXXXX
4. Deduplicate using Set
5. Return unique phone numbers
```

### Status Lifecycle

```
PENDING → SENDING → SUCCESS
                 ↘ FAILED
                 ↘ PARTIALLY_FAILED (bulk only)
```

## Provider Integration

### Current Provider: SMSlenz

SMSlenz API documentation: https://smslenz.lk/api

**Supported Operations:**
- Send single SMS
- Send bulk SMS
- Check account status

**Phone Number Format:**
- Sri Lankan numbers only
- Format: `+947XXXXXXXX`
- Example: `+94761234567`

### Adding New Providers

The module is provider-agnostic. To add a new provider:

1. Create provider file in `providers/`:
```typescript
// providers/twilio.provider.ts
export class TwilioProvider implements ISmsProvider {
  async sendSms(request: SendSmsRequest): Promise<SmsProviderResponse> {
    // Implement Twilio integration
  }
  // ... other methods
}
```

2. Update module providers:
```typescript
providers: [
  InstantSmsService,
  // Switch provider based on env
  process.env.SMS_PROVIDER === 'twilio' 
    ? TwilioProvider 
    : SmslenzProvider,
]
```

## Cost Calculation

```typescript
// Single SMS
credits = SMS_COST_PER_MESSAGE * 1

// Bulk SMS
credits = SMS_COST_PER_MESSAGE * number_of_recipients

// Example:
// If SMS_COST_PER_MESSAGE=1 and sending to 150 recipients
// Total credits = 1 * 150 = 150
```

## Error Handling

### Insufficient Credits
```json
{
  "statusCode": 400,
  "message": "Insufficient SMS credits. Required: 150, Available: 100"
}
```

### Invalid Phone Number
```json
{
  "statusCode": 400,
  "message": "Invalid phone number format. Expected: +947XXXXXXXX"
}
```

### No Recipients Found
```json
{
  "statusCode": 400,
  "message": "No valid recipients found with given filters"
}
```

## Testing

### 1. Test with SMSlenz Demo Sender

Use the demo sender ID for testing:
```json
{
  "senderId": "SMSlenzDEMO"
}
```

### 2. Check Campaign Status

After sending, check the campaign:
```bash
GET /sms/instant/campaign/:campaignId
```

### 3. Monitor Credits

Check credit deduction:
```bash
GET /sms/instant/credits/:instituteId
```

## Performance Considerations

### Async Processing

The module doesn't block API responses:
```
API Response Time: ~50-100ms (just creates campaign)
Actual SMS Sending: Happens in background
```

### Transaction Locking

Credit deduction uses pessimistic locking to prevent race conditions:
```typescript
.setLock('pessimistic_write') // Prevents concurrent deductions
```

### Phone Deduplication

Uses JavaScript Set for O(1) deduplication:
```typescript
const phoneSet = new Set<string>();
// Automatic deduplication
phoneSet.add('+94761234567');
phoneSet.add('+94761234567'); // Ignored
```

## Database Schema

### sms_campaigns
```sql
id: bigint (PK)
institute_id: bigint
sender_id: varchar(20)
message: text
type: enum('SINGLE', 'BULK')
status: enum('PENDING', 'SENDING', 'SUCCESS', 'FAILED')
total_recipients: int
successful_sends: int
failed_sends: int
credits_deducted: decimal(10,2)
provider_campaign_id: varchar(50)
provider_name: varchar(50)
provider_response: json
error_message: text
initiated_by: bigint
created_at: timestamp
updated_at: timestamp
sent_at: timestamp
```

### sms_credits
```sql
institute_id: bigint (PK)
balance: decimal(10,2)
total_purchased: decimal(10,2)
total_used: decimal(10,2)
last_topup_amount: decimal(10,2)
last_topup_at: timestamp
created_at: timestamp
updated_at: timestamp
```

## Security

### JWT Authentication
All endpoints require valid JWT token with institute access.

### Credit Verification
Credits are verified and deducted atomically before sending.

### Phone Number Validation
All phone numbers are validated before sending.

## Monitoring

### Campaign Tracking
Every SMS is tracked in `sms_campaigns` table with:
- Status updates
- Provider responses
- Error messages
- Delivery timestamps

### Credit Tracking
Credit usage is tracked in `sms_credits` table with:
- Balance
- Total purchased
- Total used
- Last topup details

## Future Enhancements

Potential features to add later:
- 📅 Scheduled SMS (if needed)
- 📊 Delivery reports
- 📈 Analytics dashboard
- 🔔 Webhook notifications
- 🌐 Multi-language support
- 📝 Message templates (if needed)

## Support

For SMSlenz-specific issues:
- Documentation: https://smslenz.lk/api
- Support: support@smslenz.lk
- WhatsApp: Available on their website

For module-specific issues:
- Check logs in NestJS console
- Review campaign status in database
- Verify environment configuration

---

**Module Status:** ✅ Production Ready  
**Last Updated:** October 14, 2025  
**Version:** 1.0.0
