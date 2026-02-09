# Advertisement `modeOfSending` — Frontend Migration Guide

> **Date:** February 2026  
> **API Version:** v2.x  
> **Breaking:** No (backward-compatible — `modeOfSending` is optional)  
> **Priority:** HIGH — delivery now depends on this column

---

## Table of Contents

1. [What Changed](#1-what-changed)
2. [Why This Matters](#2-why-this-matters)
3. [New Enum: `SendingMode`](#3-new-enum-sendingmode)
4. [API Changes](#4-api-changes)
   - [Create Advertisement](#41-create-advertisement)
   - [Update Advertisement](#42-update-advertisement)
   - [Get Advertisement (Response)](#43-get-advertisement-response)
   - [Check Sending (Dry-Run)](#44-check-sending-dry-run)
   - [Manual Send Response](#45-manual-send-response)
5. [Frontend Implementation Steps](#5-frontend-implementation-steps)
   - [TypeScript Types](#51-typescript-types)
   - [Create/Edit Form](#52-createedit-form)
   - [Advertisement List/Detail View](#53-advertisement-listdetail-view)
   - [Dry-Run Check View](#54-dry-run-check-view)
6. [Migration Checklist](#6-migration-checklist)
7. [Database Migration](#7-database-migration)

---

## 1. What Changed

A new field **`modeOfSending`** has been added to the advertisement system. This field is a **SET/array** that determines which delivery channels are **actually used** when sending an advertisement to users.

### Before (old behavior)
- `supportivePlatforms` was used for both **display** AND **delivery** channel selection
- If `supportivePlatforms` was empty, all channels were used

### After (new behavior)
- **`modeOfSending`** is the **PRIMARY** delivery channel selector
- `supportivePlatforms` is now a **FALLBACK** (used only if `modeOfSending` is empty)
- Priority chain: `modeOfSending` → `supportivePlatforms` → all channels

---

## 2. Why This Matters

| Aspect | `supportivePlatforms` | `modeOfSending` |
|--------|----------------------|-----------------|
| **Purpose** | Which platforms the ad *supports* (display/analytics) | Which channels to *actually use* when sending |
| **Controls delivery?** | Only as fallback | **YES — primary** |
| **Example** | `['sms', 'whatsapp', 'email', 'mobile-push']` | `['sms', 'email']` |
| **Effect** | Ad is *compatible* with all 4 platforms | Ad is *sent* via SMS and Email only |

**Use case:** An ad may support WhatsApp, SMS, Email, and Push (for display purposes), but the admin only wants to **deliver** it via SMS and Email. Set `modeOfSending: ['sms', 'email']`.

---

## 3. New Enum: `SendingMode`

```typescript
enum SendingMode {
  SMS = 'sms',
  EMAIL = 'email',
  WHATSAPP = 'whatsapp',
  TELEGRAM = 'telegram',
  PUSH_WEB = 'push-web',
  PUSH_MOBILE = 'push-mobile'
}
```

> **Note:** These values are similar to `SupportivePlatform` but use different naming for push notifications:
> - `SupportivePlatform`: `mobile-push`, `web-push`
> - `SendingMode`: `push-mobile`, `push-web`

---

## 4. API Changes

### 4.1 Create Advertisement

**`POST /api/advertisements`**

#### Request Body — New Field

```jsonc
{
  "title": "Summer Tuition Offer",
  "accessKey": "ADV-2026-001",
  "description": "Special rates for new students",
  "mediaUrl": "https://storage.example.com/ads/summer.jpg",
  "mediaType": "image",
  "supportivePlatforms": ["sms", "whatsapp", "email", "mobile-push"],
  
  // ✅ NEW FIELD — Controls which channels actually deliver the ad
  "modeOfSending": ["sms", "email"],
  
  "startDate": "2026-03-01T00:00:00Z",
  "endDate": "2026-06-30T23:59:59Z",
  // ... other fields unchanged
}
```

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `modeOfSending` | `SendingMode[]` | No | `[]` (empty = use `supportivePlatforms` as fallback) | Actual delivery channels |

### 4.2 Update Advertisement

**`PUT /api/advertisements/:id`**

```jsonc
{
  // ✅ Can update modeOfSending independently
  "modeOfSending": ["sms", "whatsapp", "push-mobile"]
}
```

### 4.3 Get Advertisement (Response)

**`GET /api/advertisements/:id`** and **`GET /api/advertisements`**

#### Response Body — New Field

```jsonc
{
  "id": "abc-123-def",
  "title": "Summer Tuition Offer",
  "supportivePlatforms": ["sms", "whatsapp", "email", "mobile-push"],
  
  // ✅ NEW FIELD in response
  "modeOfSending": ["sms", "email"],
  
  "mediaType": "image",
  "isActive": true,
  // ... rest unchanged
}
```

### 4.4 Check Sending (Dry-Run)

**`POST /api/advertisements/check-sending`**

The response now includes `modeOfSending` in the advertisement section AND uses the effective delivery channels (modeOfSending with supportivePlatforms fallback) in `delivery.platforms`:

```jsonc
{
  "success": true,
  "message": "Advertisement sending check completed",
  "data": {
    "advertisement": {
      "id": "abc-123-def",
      "title": "Summer Tuition Offer",
      "supportivePlatforms": ["sms", "whatsapp", "email"],
      "modeOfSending": ["sms", "email"]  // ✅ NEW
    },
    "delivery": {
      "platforms": ["sms", "email"],  // ✅ Now reflects modeOfSending (not supportivePlatforms)
      "eligibleUsers": 150,
      "ineligibleUsers": 0
    }
  }
}
```

### 4.5 Manual Send Response

**`POST /api/advertisements/send-manual`**

The response message now shows the effective delivery channels:

```
"message": "Advertisement sent to 120 users via [sms, email]"
```

---

## 5. Frontend Implementation Steps

### 5.1 TypeScript Types

Add the new enum and update your advertisement interfaces:

```typescript
// types/advertisement.ts

export enum SendingMode {
  SMS = 'sms',
  EMAIL = 'email',
  WHATSAPP = 'whatsapp',
  TELEGRAM = 'telegram',
  PUSH_WEB = 'push-web',
  PUSH_MOBILE = 'push-mobile',
}

// Keep existing SupportivePlatform enum unchanged
export enum SupportivePlatform {
  SMS = 'sms',
  WHATSAPP = 'whatsapp',
  TELEGRAM = 'telegram',
  EMAIL = 'email',
  MOBILE_PUSH = 'mobile-push',
  WEB_PUSH = 'web-push',
}

export interface Advertisement {
  id: string;
  title: string;
  accessKey: string;
  description?: string;
  mediaUrl?: string;
  landingUrl?: string;
  sendingUrl?: string;
  supportivePlatforms: SupportivePlatform[];
  modeOfSending: SendingMode[];    // ✅ ADD THIS
  mediaType: MediaType;
  // ... rest of your existing fields
}

export interface CreateAdvertisementPayload {
  title: string;
  accessKey: string;
  description?: string;
  mediaUrl?: string;
  supportivePlatforms?: SupportivePlatform[];
  modeOfSending?: SendingMode[];   // ✅ ADD THIS
  // ... rest of your existing fields
}

export interface UpdateAdvertisementPayload {
  title?: string;
  description?: string;
  supportivePlatforms?: SupportivePlatform[];
  modeOfSending?: SendingMode[];   // ✅ ADD THIS
  // ... rest of your existing fields
}
```

### 5.2 Create/Edit Form

Add a multi-select for `modeOfSending` alongside the existing `supportivePlatforms` selector:

```tsx
// components/AdvertisementForm.tsx

const SENDING_MODE_OPTIONS = [
  { value: 'sms', label: 'SMS', icon: '💬' },
  { value: 'email', label: 'Email', icon: '📧' },
  { value: 'whatsapp', label: 'WhatsApp', icon: '📱' },
  { value: 'telegram', label: 'Telegram', icon: '✈️' },
  { value: 'push-web', label: 'Web Push', icon: '🌐' },
  { value: 'push-mobile', label: 'Mobile Push', icon: '📲' },
];

// In your form JSX:
<FormSection title="Delivery Configuration">
  {/* Existing supportivePlatforms selector */}
  <MultiSelect
    label="Supported Platforms (Display/Compatibility)"
    name="supportivePlatforms"
    options={SUPPORTIVE_PLATFORM_OPTIONS}
    value={formData.supportivePlatforms}
    onChange={handleChange}
    helperText="Which platforms this ad is compatible with"
  />

  {/* ✅ NEW: modeOfSending selector */}
  <MultiSelect
    label="Delivery Channels (Actual Sending)"
    name="modeOfSending"
    options={SENDING_MODE_OPTIONS}
    value={formData.modeOfSending}
    onChange={handleChange}
    helperText="Which channels to actually use when sending this ad. Leave empty to use Supported Platforms as fallback."
  />
</FormSection>
```

**Validation tip:** If `modeOfSending` is empty AND `supportivePlatforms` is empty, show a warning:
> "No delivery channels configured. The ad won't be sent through any channel."

### 5.3 Advertisement List/Detail View

Display the effective delivery channels:

```tsx
// components/AdvertisementDetail.tsx

const effectiveChannels = ad.modeOfSending?.length > 0 
  ? ad.modeOfSending 
  : ad.supportivePlatforms;

return (
  <div>
    <h3>Delivery Channels</h3>
    
    {/* Show which channels will actually be used */}
    <ChipGroup label="Active Delivery">
      {effectiveChannels.map(channel => (
        <Chip key={channel} color="primary">{channel}</Chip>
      ))}
    </ChipGroup>
    
    {/* Show source indicator */}
    <small>
      {ad.modeOfSending?.length > 0 
        ? '✅ Using modeOfSending (explicit)' 
        : '⚠️ Falling back to supportivePlatforms'}
    </small>

    {/* Optionally show both for admin visibility */}
    <details>
      <summary>Full Platform Config</summary>
      <p>Supported Platforms: {ad.supportivePlatforms.join(', ') || 'none'}</p>
      <p>Mode of Sending: {ad.modeOfSending.join(', ') || 'none (using fallback)'}</p>
    </details>
  </div>
);
```

### 5.4 Dry-Run Check View

Update the check-sending result display:

```tsx
// components/SendCheckResult.tsx

<ResultSection title="Delivery">
  <InfoRow label="Effective Channels" value={data.delivery.platforms.join(', ')} />
  <InfoRow label="Eligible Users" value={data.delivery.eligibleUsers} />
  
  {/* Show the source */}
  <InfoRow 
    label="Channel Source" 
    value={
      data.advertisement.modeOfSending?.length > 0 
        ? 'modeOfSending (explicit)' 
        : 'supportivePlatforms (fallback)'
    } 
  />
</ResultSection>
```

---

## 6. Migration Checklist

Use this checklist to track your frontend migration:

- [ ] **Types:** Add `SendingMode` enum to your types file
- [ ] **Types:** Add `modeOfSending` field to `Advertisement`, `CreateAdvertisementPayload`, and `UpdateAdvertisementPayload` interfaces
- [ ] **Create Form:** Add `modeOfSending` multi-select input
- [ ] **Edit Form:** Add `modeOfSending` multi-select input (pre-populated from API)
- [ ] **Detail View:** Display `modeOfSending` alongside `supportivePlatforms`
- [ ] **List View:** Optionally show effective delivery channels in table columns
- [ ] **Dry-Run Check:** Update to show `modeOfSending` in results
- [ ] **Validation:** Warn if both `modeOfSending` AND `supportivePlatforms` are empty
- [ ] **API Service:** Ensure create/update API calls include `modeOfSending` in payload
- [ ] **Test:** Create ad with `modeOfSending: ['sms']` and verify only SMS is used for delivery

---

## 7. Database Migration

The backend migration is at:
```
src/migrations/1738000000000-AddModeOfSendingToAdvertisements.ts
```

**To run it:**
```bash
npx typeorm migration:run -d src/data-source.ts
```

**To revert:**
```bash
npx typeorm migration:revert -d src/data-source.ts
```

**What it does:**
- Adds a `SET('sms','email','whatsapp','telegram','push-web','push-mobile')` column called `modeOfSending` to the `advertisements` table
- Column is `NULL`-able (empty = use `supportivePlatforms` as fallback)
- Placed after the `supportivePlatforms` column
- Idempotent: safe to run multiple times (checks if column exists)

> **Note:** If your environment uses TypeORM `synchronize: true` (development), the column is auto-created. The migration is required for production environments with `synchronize: false`.

---

## Quick Summary

| What | Where | Action |
|------|-------|--------|
| New enum | Frontend types | Add `SendingMode` |
| New field | Create/Update DTOs | Add `modeOfSending?: SendingMode[]` |
| New field | Response DTOs | Expect `modeOfSending: SendingMode[]` |
| Delivery logic | Backend (transparent) | `modeOfSending` > `supportivePlatforms` > all |
| Migration | Database | Run migration script |
| Forms | Create/Edit ad UI | Add multi-select for delivery channels |
| Display | List/Detail views | Show effective channels |
