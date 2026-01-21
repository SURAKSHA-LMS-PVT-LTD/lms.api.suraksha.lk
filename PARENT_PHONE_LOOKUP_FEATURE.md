# 📱 Parent Phone Number Lookup Feature

## ✨ New Feature: Automatic Parent Linking by Phone Number

When creating a comprehensive user (student), the system now **automatically finds and links parents** if you provide their phone numbers instead of IDs.

---

## 🚀 How It Works

### Enhanced ID Field Detection (NEW ⚡)

The system now **intelligently detects** if ID fields contain phone numbers:

**Example**: If you mistakenly send:
```json
{
  "studentData": {
    "fatherId": "71234567",  // Looks like phone, not ID!
    "motherId": "772222222"
  }
}
```

**System automatically**:
1. Detects these look like phone numbers (numeric, length ≠ 6)
2. Converts to proper format: `+9471234567`, `+94772222222`
3. Looks up users by phone number
4. Replaces with actual user IDs

**Rules**:
- ✅ Numeric strings with length ≠ 6 → Treated as phone numbers
- ✅ Automatically adds `+94` prefix if missing
- ✅ Validates user type and parent record
- ❌ Length = 6 → Treated as actual ID (not converted)

### Before (Old Way - Still Supported)
You had to **manually find the parent's user ID** first:
```json
{
  "studentData": {
    "fatherId": "manually-found-uuid-1234567890",
    "motherId": "manually-found-uuid-0987654321"
  }
}
```

### Now (New Way - Automatic)
Simply provide the **phone number**, system does the lookup:
```json
{
  "studentData": {
    "fatherPhoneNumber": "+94771234567",
    "motherPhoneNumber": "+94772222222",
    "guardianPhoneNumber": "+94773333333"
  }
}
```

---

## 📋 Feature Details

### What Happens Behind the Scenes

**STEP 1: Detect Phone Numbers in ID Fields**

1. **ID Field Provided**: `fatherId: "71234567"`
2. **Detection**: System checks if it's numeric and length ≠ 6
3. **Conversion**: Adds `+94` prefix → `+94771234567`
4. **Lookup**: Searches user by phone number
5. **Validation**: Checks user type and parent record
6. **Replace**: Sets `fatherId` to actual user ID (UUID)

**STEP 2: Phone Number Field Lookup**

1. **Phone Number Provided**: `fatherPhoneNumber: "+94771234567"`

2. **System Searches**: Looks for user with matching phone number in database

3. **Validation Checks**:
   - ✅ User exists with that phone number
   - ✅ User is active (`isActive: true`)
   - ✅ User has correct type (`USER` or `USER_WITHOUT_STUDENT`)
   - ✅ User has a parent record in `parents` table

4. **Auto-Link**: If all checks pass → Sets `fatherId` to that user's ID

5. **Warnings**: If validation fails → Logs warning but continues (parent field remains `null`)

### Validation Rules

| Condition | Result |
|-----------|--------|
| ✅ Phone number matches + valid type + parent record exists | **Parent linked successfully** |
| ⚠️ Phone number not found | Warning logged, parent field = `null` |
| ⚠️ User found but wrong type (e.g., `USER_WITHOUT_PARENT`) | Warning logged, parent field = `null` |
| ⚠️ User found but no parent record | Warning logged, parent field = `null` |
| ⚡ ID field contains phone number (e.g., "71234567") | **Auto-converted and looked up** |
| ⚠️ Both ID and phone provided | **ID takes priority**, phone ignored |

---

## 📖 Usage Examples
ID Field Contains Phone Number (Auto-Detection)
```json
{
  "firstName": "John",
  "lastName": "Doe",
  "userType": "USER_WITHOUT_PARENT",
  
  "studentData": {
    "fatherId": "71234567",      // System detects this is phone, not ID!
    "motherId": "772222222",     // Auto-converts to +94772222222
    "guardianId": "773333333"    // Auto-converts to +94773333333
  }
}
```

**Result**: System automatically converts to phone numbers and looks up users.

**Backend Logs**:
```
🔄 fatherId looks like phone number (71234567), converting to: +9471234567
✅ Father converted from phone +9471234567 to User ID abc-123-uuid
🔄 motherId looks like phone number (772222222), converting to: +94772222222
✅ Mother converted from phone +94772222222 to User ID def-456-uuid
```

---

### Example 3: Link Father and Mother by Phone Number Fields
### Example 1: Link Father and Mother by Phone
```json
{
  "firstName": "John",
  "lastName": "Doe",
  "nameWithInitials": "J. Doe",
  "email": "john.doe@student.com",
  "phoneNumber": "+94771234567",
  "userType": "USER_WITHOUT_PARENT",
  "dateOfBirth": "2010-05-15",
  
  "studentData": {
    "studentId": "STU-2024-001",
    "emergencyContact": "+94771234567",
    "bloodGroup": "O+",
    
    "fatherPhoneNumber": "+94771111111",
    "motherPhoneNumber": "+94772222222"
  }
}
```

**Result**: System finds father and mother by phone, links them automatically.

---

### Example 2: Mix of ID and Phone Number
```json
{
  "studentData": {
    "fatherId": "known-father-uuid-12345",  // Direct ID (takes priority)
    "motherPhoneNumber": "+94772222222",    // System will lookup mother
    "guardianPhoneNumber": null              // No guardian
  }
}
```

**Result**: 
- Father linked by ID (direct)
- Mother linked by phone lookup
- Guardian = `null`

---

### Example 4: Parent Not Found - Uses Skip Reason
```json
{
  "studentData": {
    "fatherPhoneNumber": "+94771111111",      // System will try to find
    "fatherSkipReason": null,                 // No skip reason needed if found
    
    "motherPhoneNumber": "+94779999999",      // Phone doesn't exist in system
    "motherSkipReason": "Mother not registered yet",
    
    "guardianPhoneNumber": null,
    "guardianSkipReason": "No guardian assigned"
  }
}
```

**Result**:
- Father: Linked if found by phone, otherwise `null`
- Mother: `null` + skip reason saved
- Guardian: `null` + skip reason saved

---

## 🔍 Backend Logs

When using phone number lookup, you'll see helpful logs:

### Success:
```
🔄 fatherId looks like phone number (71234567), converting to: +9471234567
✅ Father converted from phone +9471234567 to User ID abc-123-uuid
✅ Father found by phone +94771234567: User ID abc123-uuid
✅ Mother found by phone +94772222222: User ID def456-uuid
```

### Warnings:
```
🔄 fatherId looks like phone number (71234567), converting to: +9471234567
⚠️ No valid parent user found with phone +9471234567
⚠️ No user found with father phone number: +94771111111
⚠️ User found with phone +94772222222 but has invalid type: USER_WITHOUT_PARENT
⚠️ User found with phone +94773333333 but no parent record exists
```

---

## ✅ Valid Parent User Types

Parents can only be linked if they have one of these user types:

| User Type | Can Be Parent? | Description |
|-----------|----------------|-------------|
| `USER` | ✅ Yes | User who is both student AND parent |
| `USER_WITHOUT_STUDENT` | ✅ Yes | User who is parent only (not a student) |
| `USER_WITHOUT_PARENT` | ❌ No | User who is student only (cannot be parent) |

---Send Data in Any Format - System Handles It!
✅ **Phone in ID field**: System auto-detects and converts
```json
"fatherId": "71234567"  // Automatically treated as phone
```

✅ **Phone in phone field**: Direct lookup
```json
"fatherPhoneNumber": "+94771234567"
```

✅ **3. Phone Number Format is Flexible
```json
"fatherId": "abc-123-def-456-uuid"
```

### 2. 
✅ **Also Good**: Local format (auto-converted)
```json
"fatherId": "771234567"  // System adds +94 prefix
```

❌ **Bad**: 6-digit numbers (treated as IDs, not converted)
```json
"fatherId": "123456"  // Assumed to be actual ID
```

### 4on
"fatherPhoneNumber": "+94771234567"
```

❌ **Avoid**: Manually searching for IDs unless necessary
```json
"fatherId": "manually-looked-up-uuid"
```
5
### 2. Always Normalize Phone Numbers
✅ **Good**: 🔄 fatherId looks like phone number` (auto-detection)
- Look for `✅ Father converted from phone` (successful conversion)
- Look for `✅ Father found by phone` (direct phone lookup)
```json
"fatherPhoneNumber": "+94771234567"
```

❌ **Bad**: Local format (may not match)
```json
"fatherPhoneNumber": "0771234567"
```

### 3. Provide Skip Reasons When Applicable
If parent doesn't exist yet:
```json
{
  "fatherPhoneNumber": "+94771234567",
  "fatherSkipReason": "Father account will be created later"
}
```

### 4. Check Backend Logs
Monitor logs to ensure parents are being linked correctly:
- Look for `✅ Father found by phone`
- Watch for `⚠️` warnings if linking fails

---s**: 
  - STEP 2.1: Detect phone numbers in ID fields (NEW)
  - STEP 2.2: Lookup by phone number fields

### Query Details
For each parent ID/phone provided:
1. **If ID field looks like phone** (numeric, length ≠ 6):
   - Add `+94` prefix if not present
   - Query `users` table by phone number
   - Validate and convert to actual user ID
2. **If dedicated phone field provided**:
   - Query `users` table for matching phone number
3. Select only `id` and `userType` fields (optimized)
4. Validate user type in application logic
5. Check `parents` table for parent record existence
6. Set resolved ID if all validations pass

### Detection Logic
```typescript
// Treats as phone if:
- Value is numeric (digits and + only)
- Length is NOT 6 (6-digit values treated as actual IDs)
- Examples: "System treating phone number as ID

**Check:**
- Is the phone number exactly 6 digits? (System treats 6-digit values as actual IDs)
- Use 7+ digits or include `+` prefix to ensure phone detection

### Problem: 71234567" ✅ "772222222" ✅ "123456" ❌
5. Check if ID field contains phone number - look for `🔄` logs

### Problem: Phone number auto-detection not working

**Check:**
- Is the value numeric? (Only digits and `+` allowed)
- Is the length ≠ 6? (6-digit values are treated as actual IDs, not converted)
- Look for `🔄 fatherId looks like phone number` in logs
```
### Query Details
For each parent phone number provided:
1. Query `users` table for matching phone number
2. Select only `id` and `userType` fields (optimized)
3. Validate user type in application logic
4. Check `parents` table for parent record existence
5. Set resolved ID if all validations pass

---

## 📚 Related Documentation

- [IMPLEMENTATION-COMPLETE.md](./IMPLEMENTATION-COMPLETE.md) - Complete API implementation guide
- [comprehensive-user-create-example.json](./comprehensive-user-create-example.json) - Full API example
- [PARENT_SKIP_REASON_GUIDE.md](./PARENT_SKIP_REASON_GUIDE.md) - Parent skip reason feature

---

## 🐛 Troubleshooting

### Problem: Parent not linking even though phone number is correct

**Check:**
1. Is the parent user active? (`isActive: true`)
2. Does the parent have correct user type? (`USER` or `USER_WITHOUT_STUDENT`)
3. Does a parent record exist in `parents` table for that user?
4. Is the phone number in the same format in the database? (e.g., `+94771234567`)

### Problem: No logs appearing

**Check:**
- Backend logs are enabled
- Log level is set appropriately (INFO or DEBUG)
- Check console output for `✅` or `⚠️` messages

---

**Feature Status**: ✅ Implemented and Working
**Date**: January 21, 2026
**Version**: Production Ready
