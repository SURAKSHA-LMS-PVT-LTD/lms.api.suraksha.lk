# Institute Class Subject Payment - Bank Details Implementation

## 📝 Overview
Added bank details fields to the institute class subject/monthly payment feature to capture banking information for payment transfers.

## 🔄 Changes Made

### 1. **Update DTO - Create Payment Form**
**File**: `src/modules/payment/dto/create-institute-class-subject-payment.dto.ts`

Added three new required fields to the payment creation form:
```typescript
@ApiProperty({ 
  description: 'Bank name for payment transfer',
  example: 'Bank of Ceylon',
  maxLength: 100
})
@IsNotEmpty()
@IsString()
@MaxLength(100)
bankName: string;

@ApiProperty({ 
  description: 'Account holder name',
  example: 'Sri Lanka Institute',
  maxLength: 150
})
@IsNotEmpty()
@IsString()
@MaxLength(150)
accountHolderName: string;

@ApiProperty({ 
  description: 'Account holder number / Account ID',
  example: '1234567890123456',
  maxLength: 50
})
@IsNotEmpty()
@IsString()
@MaxLength(50)
accountHolderNumber: string;
```

### 2. **Update Entity - Database Schema**
**File**: `src/modules/payment/entities/institute-class-subject-payment.entity.ts`

Added three new columns to store bank details:
```typescript
@Column({ name: 'bank_name', type: 'varchar', length: 100, nullable: false })
bankName: string;

@Column({ name: 'account_holder_name', type: 'varchar', length: 150, nullable: false })
accountHolderName: string;

@Column({ name: 'account_holder_number', type: 'varchar', length: 50, nullable: false })
accountHolderNumber: string;
```

### 3. **Update Response DTO**
**File**: `src/modules/payment/dto/institute-class-subject-payment-response.dto.ts`

Added bank details fields to the response:
```typescript
@ApiProperty({ description: 'Bank name for payment transfer' })
bankName: string;

@ApiProperty({ description: 'Account holder name' })
accountHolderName: string;

@ApiProperty({ description: 'Account holder number / Account ID' })
accountHolderNumber: string;
```

### 4. **Create Database Migration**
**File**: `src/migrations/1763000000000-addBankDetailsToPayments.ts`

Migration adds three columns to `institute_class_subject_payments` table:
- `bank_name` (VARCHAR 100, NOT NULL)
- `account_holder_name` (VARCHAR 150, NOT NULL)
- `account_holder_number` (VARCHAR 50, NOT NULL)

### 5. **Update Service**
**File**: `src/modules/payment/services/institute-class-subject-payment.service.ts`

Updated the `createPayment()` method to include bank details in payment creation:
```typescript
const payment = this.paymentRepository.create({
  // ... existing fields ...
  bankName: createPaymentDto.bankName,
  accountHolderName: createPaymentDto.accountHolderName,
  accountHolderNumber: createPaymentDto.accountHolderNumber,
  // ... rest of fields ...
});
```

## 📋 API Changes

### Create Payment Endpoint - Request Body
**POST** `/institute-class-subject-payments`

```json
{
  "title": "Monthly Tuition Fee",
  "description": "Monthly tuition fee for Mathematics class",
  "targetType": "PARENTS",
  "priority": "MANDATORY",
  "amount": 5000.00,
  "lastDate": "2024-02-15T23:59:59Z",
  "notes": "Please pay by 15th of each month",
  "bankName": "Bank of Ceylon",
  "accountHolderName": "Sri Lanka Institute",
  "accountHolderNumber": "1234567890123456"
}
```

### Get Payment Endpoint - Response Body
**GET** `/institute-class-subject-payments/:paymentId`

```json
{
  "id": "1",
  "instituteId": "109",
  "classId": "1003",
  "subjectId": "10",
  "title": "Monthly Tuition Fee",
  "description": "Monthly tuition fee for Mathematics class",
  "targetType": "PARENTS",
  "priority": "MANDATORY",
  "amount": 5000.00,
  "lastDate": "2024-02-15T23:59:59Z",
  "status": "ACTIVE",
  "notes": "Please pay by 15th of each month",
  "bankName": "Bank of Ceylon",
  "accountHolderName": "Sri Lanka Institute",
  "accountHolderNumber": "1234567890123456",
  "createdAt": "2024-01-15T10:30:00Z",
  "updatedAt": "2024-01-15T10:30:00Z"
}
```

## 🚀 Deployment Steps

1. **Apply Migration**:
   ```bash
   npm run migration:run
   ```

2. **Verify Schema**:
   ```bash
   npm run migration:show
   ```

3. **Rebuild Application**:
   ```bash
   npm run build
   ```

4. **Start Application**:
   ```bash
   npm run start:dev
   ```

## 📊 Data Validation

| Field | Type | Length | Required | Format |
|-------|------|--------|----------|--------|
| bankName | String | Max 100 | Yes | Bank name (e.g., "Bank of Ceylon") |
| accountHolderName | String | Max 150 | Yes | Account holder name (e.g., "Sri Lanka Institute") |
| accountHolderNumber | String | Max 50 | Yes | Account/reference number (e.g., "1234567890123456") |

## ✅ Testing Checklist

- [ ] Test payment creation with bank details
- [ ] Verify bank details appear in GET payment response
- [ ] Confirm database migration applies without errors
- [ ] Test payment submission with bank details
- [ ] Verify data integrity in database
- [ ] Test pagination with new fields
- [ ] Ensure backward compatibility with existing code

## 🔐 Security Notes

- Bank details are stored in the database and returned in payment responses
- Ensure proper access control is maintained on payment endpoints
- No encryption added - consider encryption if sensitive data needs additional protection
- Account numbers should be validated format on submission

## 📱 Frontend Integration

The frontend should now:

1. **Create Payment Form**:
   - Add three input fields for bank details
   - Make them required fields
   - Validate input length and format

2. **Display Payment Details**:
   - Show bank name, account holder name, and account number
   - Display these in payment submission/verification forms
   - Show in payment receipts/confirmations

3. **Example Form Fields**:
   ```
   - Bank Name: [text input, max 100 chars]
   - Account Holder Name: [text input, max 150 chars]
   - Account Holder Number: [text input, max 50 chars]
   ```

## 📚 Related Files

- `src/modules/payment/entities/institute-class-subject-payment.entity.ts` - Entity model
- `src/modules/payment/dto/create-institute-class-subject-payment.dto.ts` - Create DTO
- `src/modules/payment/dto/institute-class-subject-payment-response.dto.ts` - Response DTO
- `src/modules/payment/services/institute-class-subject-payment.service.ts` - Business logic
- `src/migrations/1763000000000-addBankDetailsToPayments.ts` - Database migration

---

**Last Updated**: 2026-04-24
**Version**: 1.0
**Status**: ✅ Ready for deployment
