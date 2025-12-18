# Advertisement Platform-Specific Sending Logic

## Overview
Advertisements can now specify which platforms they support for sending notifications. This enables advertisers to choose specific channels (SMS, WhatsApp, Telegram, Email, Mobile Push, Web Push) for their campaigns, ensuring ads are only sent through appropriate platforms.

## New Fields

### 1. `sendingUrl` (VARCHAR 500)
- **Purpose**: Direct URL for the advertisement content
- **Usage**: Custom landing page or campaign URL
- **Example**: `https://example.com/campaign/summer-2025`

### 2. `supportivePlatforms` (SET Enum)
- **Purpose**: Specifies which platforms can send this advertisement
- **Type**: Array of platform values
- **Options**:
  - `sms` - SMS text messages
  - `whatsapp` - WhatsApp messages
  - `telegram` - Telegram messages
  - `email` - Email notifications
  - `mobile-push` - Mobile push notifications
  - `web-push` - Web browser push notifications
- **Default**: Empty array (supports all platforms)

## Platform-Specific Sending Logic

### How It Works

When an advertisement is selected for sending:

1. **Get Subscription Channels**: Fetch channels based on user's subscription plan
   ```typescript
   // Example: PREMIUM plan has [whatsapp, email, sms, telegram]
   let channels = ['whatsapp', 'email', 'sms', 'telegram'];
   ```

2. **Apply Platform Filter**: If ad has `supportivePlatforms` defined, filter channels
   ```typescript
   if (ad.supportivePlatforms && ad.supportivePlatforms.length > 0) {
     // Ad only supports SMS and WhatsApp
     // Filter: [whatsapp, email, sms, telegram] → [whatsapp, sms]
     channels = channels.filter(ch => ad.supportivePlatforms.includes(ch));
   }
   ```

3. **Send Notifications**: Only send through filtered channels

### Examples

#### Example 1: SMS-Only Advertisement
```json
{
  "title": "Quick SMS Alert - Stock Update",
  "supportivePlatforms": ["sms"],
  "description": "Flash sale - 50% off!"
}
```

**Result**: 
- User subscription: PREMIUM (WhatsApp, Email, SMS, Telegram)
- **Actual sending**: SMS only ✅
- Other channels skipped 🚫

#### Example 2: WhatsApp + Email Campaign
```json
{
  "title": "Rich Media Educational Course",
  "supportivePlatforms": ["whatsapp", "email"],
  "mediaUrl": "https://example.com/course-banner.jpg"
}
```

**Result**:
- User subscription: PLATINUM (All channels)
- **Actual sending**: WhatsApp + Email ✅
- SMS, Telegram, Push skipped 🚫

#### Example 3: All Platforms (Default)
```json
{
  "title": "Universal Announcement",
  "supportivePlatforms": [],  // Empty = all platforms
  "description": "Important school notice"
}
```

**Result**:
- User subscription: PREMIUM (WhatsApp, Email, SMS, Telegram)
- **Actual sending**: All 4 channels ✅

## Database Schema

### Migration
```sql
ALTER TABLE `advertisements` 
ADD COLUMN `sendingUrl` VARCHAR(500) NULL;

ALTER TABLE `advertisements` 
ADD COLUMN `supportivePlatforms` 
SET('sms', 'whatsapp', 'telegram', 'email', 'mobile-push', 'web-push') NULL;
```

### Entity Definition
```typescript
@Column({ 
  type: 'set',
  enum: SupportivePlatform,
  nullable: true
})
supportivePlatforms?: SupportivePlatform[];
```

## API Usage

### Create Advertisement with Platform Restrictions
```http
POST /api/advertisements
Content-Type: application/json

{
  "title": "SMS Flash Sale",
  "accessKey": "ADV-2025-SMS-001",
  "description": "Limited time offer!",
  "sendingUrl": "https://shop.com/flash-sale",
  "supportivePlatforms": ["sms"],
  "targetSubscriptionPlans": ["FREE", "BASIC", "PREMIUM"],
  "startDate": "2025-12-01T00:00:00Z",
  "endDate": "2025-12-31T23:59:59Z",
  "maxSendings": 10000
}
```

### Update Platform Support
```http
PUT /api/advertisements/{id}
Content-Type: application/json

{
  "supportivePlatforms": ["sms", "whatsapp", "email"]
}
```

## Use Cases

### 1. **SMS-Only Campaigns**
- Short, urgent messages
- No media content needed
- Cost-effective for bulk sending
- Example: Flash sales, OTP verification ads

### 2. **WhatsApp + Email (Rich Media)**
- High-quality images/videos
- Detailed content
- Professional appearance
- Example: Course promotions, event invitations

### 3. **Telegram Exclusive**
- Tech-savvy audience
- Bot interactions
- Community engagement
- Example: Developer tools, tech products

### 4. **Email Only (Formal)**
- Detailed documentation
- PDF attachments
- Professional communication
- Example: Educational materials, certificates

### 5. **Push Notifications**
- Mobile app users
- Real-time alerts
- In-app engagement
- Example: Breaking news, time-sensitive offers

### 6. **Multi-Platform (Default)**
- Maximum reach
- All available channels
- Comprehensive coverage
- Example: Critical announcements, school notices

## Notification Flow

```
┌─────────────────────────────────────────────────────────────┐
│ 1. User Attendance Marked                                   │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. Get Subscription Channels                                │
│    PREMIUM: [whatsapp, email, sms, telegram]                │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. Select Matching Advertisement                            │
│    Ad: "SMS Flash Sale"                                     │
│    supportivePlatforms: ["sms"]                             │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. Apply Platform Filter                                    │
│    [whatsapp, email, sms, telegram]  →  [sms]              │
│    Filtered: 4 channels → 1 channel                         │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. Send Notification                                        │
│    ✅ SMS: Sent with advertisement                          │
│    🚫 WhatsApp: Skipped (not in supportivePlatforms)        │
│    🚫 Email: Skipped (not in supportivePlatforms)           │
│    🚫 Telegram: Skipped (not in supportivePlatforms)        │
└─────────────────────────────────────────────────────────────┘
```

## Logging Examples

### Platform Filtering Applied
```
🎯 Platform filtering: 4 → 1 channels (Ad supports: sms)
📢 Selected ad: ADV-SMS-001
✅ Sent 1/4 notifications (65ms)
✅ SMS: Sent with advertisement
⏭️ WhatsApp skip: Not in supportivePlatforms
⏭️ Email skip: Not in supportivePlatforms  
⏭️ Telegram skip: Not in supportivePlatforms
```

### No Filtering (All Platforms)
```
📢 Selected ad: ADV-UNIVERSAL-001
✅ Sent 4/4 notifications (120ms)
✅ WhatsApp: Sent
✅ Email: Sent
✅ SMS: Sent
✅ Telegram: Sent
```

## Benefits

### 1. **Cost Optimization**
- Send SMS only when needed (SMS has per-message cost)
- Use free channels (WhatsApp, Email, Telegram) for rich content
- Reduce unnecessary channel usage

### 2. **Content Appropriateness**
- SMS: Short text messages (160 chars)
- WhatsApp: Rich media with images/videos
- Email: Detailed content with formatting
- Push: Quick alerts

### 3. **Targeted Delivery**
- Tech products → Telegram
- Formal education → Email
- Quick alerts → SMS
- Visual content → WhatsApp

### 4. **Campaign Control**
- Advertisers choose their preferred platforms
- No wasted impressions on unsuitable channels
- Better ROI tracking per platform

### 5. **User Experience**
- Appropriate content for each platform
- No SMS flooding for image-heavy ads
- Better message formatting per channel

## Migration Steps

1. **Update Database**
   ```bash
   npm run migration:run
   # Or manually:
   mysql -h <host> -u root -p < scripts/add-sending-url-to-advertisements.sql
   ```

2. **Existing Advertisements**
   - `supportivePlatforms` will be `NULL` (empty array)
   - Behavior: Send through all available channels (backward compatible)

3. **New Advertisements**
   - Specify `supportivePlatforms` array in create request
   - Empty array = all platforms (default)
   - Specified platforms = restricted sending

## Testing

### Test Case 1: SMS-Only Ad
```typescript
// Create SMS-only advertisement
const ad = {
  supportivePlatforms: ['sms'],
  // ... other fields
};

// Mark attendance for PREMIUM user (has WhatsApp, SMS, Email, Telegram)
// Expected: SMS notification only
// Actual: ✅ SMS sent, others skipped
```

### Test Case 2: Empty Platforms (All Channels)
```typescript
// Create advertisement with no platform restrictions
const ad = {
  supportivePlatforms: [],  // Empty = all platforms
  // ... other fields
};

// Mark attendance for PREMIUM user
// Expected: All 4 channels
// Actual: ✅ WhatsApp, SMS, Email, Telegram all sent
```

### Test Case 3: Multi-Platform
```typescript
// Create WhatsApp + Email campaign
const ad = {
  supportivePlatforms: ['whatsapp', 'email'],
  // ... other fields
};

// Mark attendance for PLATINUM user (has all 6 channels)
// Expected: WhatsApp + Email only
// Actual: ✅ WhatsApp, Email sent. SMS, Telegram, Push skipped
```

## Best Practices

1. **SMS Campaigns**: Use for time-sensitive, short messages
2. **WhatsApp + Email**: Use for rich media content
3. **All Platforms**: Use for critical announcements
4. **Single Platform**: Use for platform-specific content
5. **Empty Array**: Default behavior, maximum reach

## Troubleshooting

### Issue: Ad not sending on any platform
**Cause**: `supportivePlatforms` contains invalid values
**Solution**: Use only valid enum values: sms, whatsapp, telegram, email, mobile-push, web-push

### Issue: Ad sending on platforms not specified
**Cause**: `supportivePlatforms` is NULL or empty
**Solution**: Empty array means all platforms. Specify exact platforms to restrict.

### Issue: Platform filtering not working
**Cause**: Advertisement has no `supportivePlatforms` defined
**Solution**: Set `supportivePlatforms` array in advertisement DTO

## Conclusion

The `supportivePlatforms` feature provides fine-grained control over advertisement delivery channels, enabling cost optimization, content appropriateness, and better targeting. Empty arrays default to all platforms for backward compatibility, while specified platforms restrict sending to only those channels.
