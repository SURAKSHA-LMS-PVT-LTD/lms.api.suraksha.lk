# SMS Credentials Configuration Guide

## 📋 Overview

The LMS SMS system is configured to **always use system-wide credentials** from the `.env` file for sending messages. Institute-specific settings are only used for **sender masks** (sender IDs).

---

## 🔧 Configuration

### **Environment Variables (.env)**

```env
# SMS Provider Credentials (SMSlenz.lk)
SMSLENZ_USER_ID=580
SMSLENZ_API_KEY=6c175156-cf89-401f-83ca-fbe024dcef96

# Always use system credentials (DO NOT CHANGE)
USE_SYSTEM_SMS_CREDENTIALS=true
```

### **What These Settings Mean:**

| Setting | Value | Purpose |
|---------|-------|---------|
| `SMSLENZ_USER_ID` | `580` | Your SMSlenz.lk account user ID |
| `SMSLENZ_API_KEY` | `6c175156-cf89-401f-83ca-fbe024dcef96` | Your SMSlenz.lk API key |
| `USE_SYSTEM_SMS_CREDENTIALS` | `true` | Use `.env` credentials for ALL institutes |

---

## 🎯 How SMS Sending Works

### **Credential Flow:**

```
┌─────────────────────────────────────────────────────────────┐
│  SMS Request from Institute                                 │
└───────────────────┬─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────┐
│  System checks:                                             │
│  ✅ Institute has approved sender mask in database          │
│  ✅ Institute has sufficient SMS credits in database        │
└───────────────────┬─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────┐
│  System sends SMS using:                                    │
│  📡 Provider credentials: From .env (SMSLENZ_USER_ID, etc)  │
│  🎭 Sender mask: From institute settings in database        │
│  💳 Credits deducted: From institute's credit balance       │
└─────────────────────────────────────────────────────────────┘
```

### **What's Used from Database:**

1. ✅ **Sender Mask (maskId)** - e.g., "SURAKSHA", "ACADEMY", etc.
2. ✅ **SMS Credits** - Institute's available credit balance
3. ✅ **Credit Limits** - Daily/monthly sending limits

### **What's NEVER Used from Database:**

1. ❌ `sms_user_id` column - NOT USED
2. ❌ `sms_api_key` column - NOT USED
3. ❌ Institute-specific provider credentials - NOT SUPPORTED

---

## 📊 Database Schema

### **institute_sms_credentials Table:**

```sql
-- USED COLUMNS:
institute_id                 -- Institute identifier
sender_masks                 -- JSON array of approved sender IDs
current_credits              -- Available SMS credits
total_purchased              -- Total credits purchased
total_used                   -- Total credits consumed
daily_limit                  -- Daily sending limit
monthly_limit                -- Monthly sending limit
is_active                    -- Enable/disable SMS for institute

-- NOT USED COLUMNS (Legacy):
sms_user_id                  -- ❌ IGNORED - System uses .env credentials
sms_api_key                  -- ❌ IGNORED - System uses .env credentials
```

---

## 🎭 Sender Mask Management

### **Adding a Sender Mask for an Institute:**

```http
POST /sms/sender-masks/create
Authorization: Bearer <admin_token>

{
  "instituteId": "1",
  "maskId": "SURAKSHA",
  "displayName": "Suraksha LMS",
  "phoneNumber": "+94761234567",
  "isActive": true
}
```

### **How Sender Masks Work:**

- Each institute can have **multiple approved sender masks**
- When sending SMS, the system uses the **first active mask** from the institute's list
- Sender masks must be **pre-approved by SMSlenz.lk**
- Format: 3-11 alphanumeric characters (e.g., "SURAKSHA", "ACADEMY")

---

## 💳 Credit Management

### **Credit Flow:**

1. **Institute purchases credits** → Admin approves payment
2. **Credits added to database** → `current_credits` column updated
3. **Institute sends SMS** → Credits deducted AFTER successful delivery
4. **Credit balance tracked** → Real-time balance in database

### **Credit Checks:**

```typescript
// ✅ System checks BEFORE sending:
- Institute has sufficient credits in database
- Institute's sender mask is approved
- Daily/monthly limits not exceeded (if configured)

// ✅ System uses DURING sending:
- Provider credentials from .env
- Sender mask from institute settings
- Message content and recipient list

// ✅ System updates AFTER sending:
- Credits deducted only for successful sends
- Usage statistics updated
- Delivery status recorded
```

---

## 🔒 Security Benefits

### **Why Use System Credentials?**

1. ✅ **Centralized Control** - One set of credentials for all institutes
2. ✅ **Security** - No API keys stored in database
3. ✅ **Simplicity** - No need to configure credentials per institute
4. ✅ **Cost Tracking** - Single SMSlenz account with clear billing
5. ✅ **Auditability** - All SMS sent from one provider account

### **Institute Isolation:**

- Each institute has **separate credit balance** in database
- Each institute uses **their own sender mask**
- Each institute has **their own sending limits**
- SMS usage is **tracked per institute**

---

## 🚀 SMS Sending Flow

### **Example: Bulk SMS to Students**

```http
POST /sms/send-bulk?instituteId=1
Authorization: Bearer <token>

{
  "recipientTypes": ["STUDENTS"],
  "classIds": ["1"],
  "messageTemplate": "Class will start at 8 AM tomorrow",
  "maskId": "SURAKSHA",
  "isNow": true
}
```

### **What Happens:**

1. ✅ System validates institute has sender mask "SURAKSHA" in database
2. ✅ System checks institute has sufficient credits in database
3. ✅ System fetches recipients (students in class 1)
4. ✅ System sends SMS using:
   - **Provider:** SMSlenz.lk (credentials from `.env`)
   - **Sender ID:** "SURAKSHA" (from institute database)
   - **Message:** "Class will start at 8 AM tomorrow"
5. ✅ System deducts credits from institute's balance
6. ✅ System records delivery status

---

## 📝 Configuration Checklist

### **Initial Setup:**

- [ ] Set `SMSLENZ_USER_ID` in `.env`
- [ ] Set `SMSLENZ_API_KEY` in `.env`
- [ ] Set `USE_SYSTEM_SMS_CREDENTIALS=true` in `.env`
- [ ] Restart server to apply changes

### **Per Institute Setup:**

- [ ] Create institute SMS credentials record in database
- [ ] Add at least one approved sender mask
- [ ] Set initial credit balance (via admin approval)
- [ ] Activate SMS (`is_active = true`)

### **Testing:**

- [ ] Send test SMS to verify credentials work
- [ ] Check sender mask appears correctly
- [ ] Verify credits are deducted after send
- [ ] Check delivery status in logs

---

## 🛠️ Troubleshooting

### **Error: "SMS provider credentials not configured"**

**Problem:** `.env` file missing SMS credentials

**Solution:**
```env
SMSLENZ_USER_ID=580
SMSLENZ_API_KEY=6c175156-cf89-401f-83ca-fbe024dcef96
```

### **Error: "No approved sender masks configured"**

**Problem:** Institute has no sender masks in database

**Solution:** Add sender mask via admin API or database:
```sql
UPDATE institute_sms_credentials 
SET sender_masks = '[{"maskId": "SURAKSHA", "displayName": "Suraksha LMS", "phoneNumber": "+94761234567", "isActive": true}]'
WHERE institute_id = 1;
```

### **Error: "Insufficient SMS credits"**

**Problem:** Institute's credit balance is too low

**Solution:** Add credits via admin approval:
```sql
UPDATE institute_sms_credentials 
SET current_credits = current_credits + 1000
WHERE institute_id = 1;
```

---

## 📚 Related Documentation

- **SMS API Guide:** `docs/SMS_API_DOCUMENTATION.md`
- **SMS Security:** `docs/SMS_SECURITY_IMPLEMENTATION_COMPLETE.md`
- **Environment Setup:** `docs/ENVIRONMENT_SETUP.md`

---

## 📞 Support

For SMSlenz.lk account issues:
- Website: https://smslenz.lk
- Support: support@smslenz.lk
- Documentation: https://smslenz.lk/docs/api

For LMS SMS system issues:
- Check server logs for error messages
- Verify `.env` credentials are correct
- Ensure institute has sender mask configured
- Confirm institute has sufficient credits

---

**Last Updated:** October 27, 2025  
**Version:** 2.0  
**Credential Strategy:** Always use system credentials from `.env`, only sender mask from database
