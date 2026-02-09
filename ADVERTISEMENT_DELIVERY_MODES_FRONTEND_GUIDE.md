# 📡 Advertisement Delivery Modes — Frontend Implementation Guide

> **Version:** 2.0 (Decoupled Architecture)
> **Last Updated:** 2026-02-09
> **Backend API Base:** `/api/advertisements`
> **Auth:** JWT Bearer Token (SUPERADMIN role required for management)

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Key Design Principle](#2-key-design-principle)
3. [SupportivePlatform Enum Reference](#3-supportiveplatform-enum-reference)
4. [API Endpoints Reference](#4-api-endpoints-reference)
5. [Create Advertisement with Delivery Modes](#5-create-advertisement-with-delivery-modes)
6. [Update Advertisement Delivery Modes](#6-update-advertisement-delivery-modes)
7. [Manual Send (No Channel Override)](#7-manual-send-no-channel-override)
8. [Bulk Send](#8-bulk-send)
9. [Dry-Run (Check Sending) API](#9-dry-run-check-sending-api)
10. [Frontend UI Components Guide](#10-frontend-ui-components-guide)
11. [Channel Picker Component](#11-channel-picker-component)
12. [Cost Estimation Display](#12-cost-estimation-display)
13. [Response Handling & Error States](#13-response-handling--error-states)
14. [TypeScript Interfaces for Frontend](#14-typescript-interfaces-for-frontend)
15. [React Component Examples](#15-react-component-examples)
16. [Complete Flow Diagrams](#16-complete-flow-diagrams)

---

## 1. Architecture Overview

The advertisement system uses a **decoupled delivery model**. The advertisement entity's `supportivePlatforms` array is the **sole authority** that determines which channels an ad is delivered through.

```
┌──────────────────────────────────────────────────────────┐
│  ADVERTISEMENT ENTITY (source of truth)                   │
│                                                            │
│  supportivePlatforms: ["sms", "whatsapp", "mobile-push"] │
│  ↑ This array = the ONLY thing that controls delivery     │
└──────────────────────────┬───────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────┐
│  MANUAL SEND REQUEST                                      │
│                                                            │
│  advertisementId: "ad-001"                                │
│  targetType: "all_users"                                  │
│  message: "Check this out!"                               │
│                                                            │
│  ❌ NO channels field — channels come from the ad itself  │
└──────────────────────────┬───────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────┐
│  ALL targeted users receive the ad                        │
│  via the channels defined on the ad entity                │
│                                                            │
│  ❌ NO subscription plan filtering                        │
│  ❌ NO plan → channel matrix                              │
│  Subscription plan is used ONLY for marks, attendance etc │
└──────────────────────────────────────────────────────────┘
```

---

## 2. Key Design Principle

### ✅ What Controls Delivery Channels

| What | Controls Delivery? | Purpose |
|------|-------------------|---------|
| `advertisement.supportivePlatforms` | **✅ YES — sole authority** | Array on the ad entity defining which channels to deliver through |

### ❌ What Does NOT Control Delivery Channels

| What | Controls Delivery? | Actual Purpose |
|------|-------------------|----------------|
| `user.subscriptionPlan` | **❌ NO** | Used for marks, attendance features, billing — NOT ad delivery |
| `notification-packages.config` | **❌ NO** | Used for attendance notification routing — NOT ad delivery |
| `ManualSendDto.channels` | **❌ REMOVED** | Field no longer exists — channels come from ad entity |

### Rule (Simple)

> **When you send an ad → the ad's `supportivePlatforms` array determines which channels are used → ALL targeted users receive it regardless of their subscription plan.**

---

## 3. SupportivePlatform Enum Reference

### Enum Values

| Enum Value | API String Value | Display Label | Icon | Description |
|------------|-----------------|---------------|------|-------------|
| `SMS` | `"sms"` | SMS | 📱 | Standard text message |
| `WHATSAPP` | `"whatsapp"` | WhatsApp | 💬 | WhatsApp Business API message |
| `TELEGRAM` | `"telegram"` | Telegram | ✈️ | Telegram Bot message |
| `EMAIL` | `"email"` | Email | 📧 | Email notification |
| `MOBILE_PUSH` | `"mobile-push"` | Mobile Push | 📲 | Firebase push notification to mobile app |
| `WEB_PUSH` | `"web-push"` | Web Push | 🌐 | Browser push notification |

### Cost Per Message (Estimates)

| Channel | Base Cost | With Media |
|---------|-----------|------------|
| SMS | ₨0.01 | ₨0.01 (no media support) |
| WhatsApp | ₨0.005 | ₨0.0075 |
| Telegram | ₨0.001 | ₨0.0012 |
| Email | ₨0.0005 | ₨0.00055 |
| Mobile Push | ₨0.0001 | ₨0.0001 |
| Web Push | ₨0.0001 | ₨0.0001 |

---

## 4. API Endpoints Reference

### Advertisement CRUD

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/advertisements` | SUPERADMIN | Create ad with `supportivePlatforms` |
| `GET` | `/api/advertisements` | SUPERADMIN | List all ads (paginated) |
| `GET` | `/api/advertisements/active` | Authenticated | Get active ads |
| `GET` | `/api/advertisements/:id` | SUPERADMIN | Get single ad |
| `PUT` | `/api/advertisements/:id` | SUPERADMIN | Update ad (incl. `supportivePlatforms`) |
| `DELETE` | `/api/advertisements/:id` | SUPERADMIN | Delete ad |

### Advertisement Delivery

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/advertisements/send-manually` | SUPERADMIN | Send ad (channels from ad entity) |
| `POST` | `/api/advertisements/bulk-send` | SUPERADMIN | Bulk send multiple ads |
| `POST` | `/api/advertisements/check-sending` | SUPERADMIN | Dry-run preview (no actual send) |
| `GET` | `/api/advertisements/analytics/manual-sends` | SUPERADMIN | Send analytics |

### Tracking

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/advertisements/:id/impression` | Authenticated | Record impression |
| `POST` | `/api/advertisements/:id/click` | Authenticated | Record click |

---

## 5. Create Advertisement with Delivery Modes

### Request

```http
POST /api/advertisements
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

```json
{
  "title": "Premium Tutoring Service",
  "accessKey": "premium-tutor-2025",
  "description": "Expert mathematics tutoring for O/L and A/L students",
  "mediaUrl": "/advertisements/premium-tutor-banner.jpg",
  "mediaType": "image",
  "landingUrl": "https://example.com/premium-tutoring",
  "sendingUrl": "https://example.com/api/ad-content/premium-tutor",

  "supportivePlatforms": ["sms", "whatsapp", "telegram", "email", "mobile-push"],

  "targetUserTypes": ["USER", "USER_WITHOUT_PARENT"],
  "targetGenders": ["MALE", "FEMALE"],
  "targetProvinces": ["WESTERN", "CENTRAL", "SOUTHERN"],
  "targetDistricts": ["COLOMBO", "KANDY", "GALLE"],
  "minBornYear": 2005,
  "maxBornYear": 2012,

  "displayDuration": 30,
  "priority": 7,
  "isActive": true,
  "startDate": "2025-02-01T00:00:00Z",
  "endDate": "2025-06-30T23:59:59Z",
  "maxSendings": 5000,
  "cascadeToParents": true,

  "budget": 10000.00,
  "costPerClick": 0.50,
  "costPerImpression": 0.05,
  "createdBy": "admin-user-id"
}
```

### ⚠️ Important: `supportivePlatforms` is Required for Delivery

If an ad has an empty `supportivePlatforms` array, the backend will reject manual send with:
```json
{
  "statusCode": 400,
  "message": "Advertisement has no delivery channels (supportivePlatforms) configured"
}
```

### Response

```json
{
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "title": "Premium Tutoring Service",
  "accessKey": "premium-tutor-2025",
  "supportivePlatforms": ["sms", "whatsapp", "telegram", "email", "mobile-push"],
  "mediaType": "image",
  "isActive": true,
  "impressions": 0,
  "clicks": 0,
  "sends": 0,
  "createdAt": "2025-01-15T10:30:00.000Z",
  "updatedAt": "2025-01-15T10:30:00.000Z"
}
```

---

## 6. Update Advertisement Delivery Modes

### Request

```http
PUT /api/advertisements/:id
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

```json
{
  "supportivePlatforms": ["whatsapp", "telegram", "mobile-push"]
}
```

> Only the fields you send will be updated. All other fields remain unchanged.

### Use Case: Change delivery channels mid-campaign

An admin can update `supportivePlatforms` at any time. The next manual send will use the updated channels.

---

## 7. Manual Send (No Channel Override)

The `channels` field has been **removed** from the manual send request. Delivery channels are read directly from the advertisement's `supportivePlatforms` array.

### Request

```http
POST /api/advertisements/send-manually
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

#### Example 1: Send to all users

```json
{
  "advertisementId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "targetType": "all_users",
  "message": "🎓 Limited time offer on premium tutoring!"
}
```

> The ad's `supportivePlatforms` (e.g. `["sms", "whatsapp", "mobile-push"]`) determines delivery channels. ALL active users receive it.

#### Example 2: Send to specific institutes

```json
{
  "advertisementId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "targetType": "institute_users",
  "instituteIds": ["inst-001", "inst-002", "inst-003"],
  "message": "Special announcement for your institute!"
}
```

#### Example 3: Send to specific users

```json
{
  "advertisementId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "targetType": "specific_users",
  "specificUserIds": ["user-001", "user-002", "user-003"],
  "message": "Exclusive offer just for you!"
}
```

#### Example 4: Send to parent users

```json
{
  "advertisementId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "targetType": "parent_users",
  "message": "Dear parent, check out these learning resources!"
}
```

#### Example 5: Send to subscription plan users

```json
{
  "advertisementId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "targetType": "subscription_plan_users",
  "subscriptionPlans": ["PRO_WHATSAPP", "PRO_SMS", "DYNAMAD"]
}
```

> Note: `subscriptionPlans` here is used as a **targeting filter** (to select which users to target). It does NOT affect which channels are used for delivery.

### Target Types Reference

| `targetType` Value | Required Fields | Description |
|--------------------|-----------------|-------------|
| `"all_users"` | — | All active users |
| `"specific_users"` | `specificUserIds` | Hand-picked user IDs |
| `"institute_users"` | `instituteIds` | All users in given institutes |
| `"subscription_plan_users"` | `subscriptionPlans` | Users on specific plans (targeting only, not channel filtering) |
| `"parent_users"` | — | All parent-type users |
| `"student_users"` | — | All student-type users |

### Response

```json
{
  "success": true,
  "message": "Advertisement sent to 1250 users via [sms, whatsapp, mobile-push]",
  "data": {
    "campaignId": "manual-1705312200000-admin-user-id",
    "totalTargeted": 2000,
    "totalSent": 1250,
    "totalFailed": 50,
    "failedUsers": ["user-404", "user-500"],
    "sentUsers": ["user-001", "user-002", "..."],
    "packageBreakdown": {
      "FREE": {
        "targeted": 800,
        "sent": 700,
        "failed": 100
      },
      "PRO_WHATSAPP": {
        "targeted": 500,
        "sent": 450,
        "failed": 50
      },
      "DYNAMAD": {
        "targeted": 200,
        "sent": 200,
        "failed": 0
      },
      "PRO_EMAIL": {
        "targeted": 500,
        "sent": 500,
        "failed": 0
      }
    }
  }
}
```

> **Note:** `packageBreakdown` shows user counts by subscription plan for **analytics only**. ALL plans receive ads — there is no plan-based filtering. Failures are due to delivery errors (invalid contact info, network issues, etc.), NOT plan restrictions.

---

## 8. Bulk Send

### Request

```http
POST /api/advertisements/bulk-send
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

```json
{
  "campaigns": [
    {
      "advertisementId": "ad-001",
      "targetType": "all_users",
      "message": "Campaign 1: General announcement"
    },
    {
      "advertisementId": "ad-002",
      "targetType": "parent_users",
      "message": "Campaign 2: Parent-specific content"
    },
    {
      "advertisementId": "ad-003",
      "targetType": "institute_users",
      "instituteIds": ["inst-001"],
      "message": "Campaign 3: Institute announcement"
    }
  ],
  "scheduledTime": "2025-02-01T09:00:00Z"
}
```

> Each campaign's ad has its own `supportivePlatforms` — different ads can deliver through different channels in the same bulk send.

### Response

Returns an array of `ManualSendResponseDto` — one per campaign:

```json
[
  {
    "success": true,
    "message": "Advertisement sent to 5000 users via [telegram, mobile-push]",
    "data": { "campaignId": "manual-...", "totalTargeted": 8000, "totalSent": 5000, "totalFailed": 200 }
  },
  {
    "success": true,
    "message": "Advertisement sent to 1200 users via [sms, whatsapp, email]",
    "data": { "campaignId": "manual-...", "totalTargeted": 1500, "totalSent": 1200, "totalFailed": 50 }
  },
  {
    "success": false,
    "message": "Failed to send advertisement: Advertisement not found",
    "data": { "campaignId": "failed-...", "totalTargeted": 0, "totalSent": 0, "totalFailed": 0 }
  }
]
```

---

## 9. Dry-Run (Check Sending) API

Preview what would happen before actually sending. **No messages are delivered.**

### Request

```http
POST /api/advertisements/check-sending
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

```json
{
  "advertisementId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "targetType": "all_users"
}
```

### Response

```json
{
  "success": true,
  "message": "Advertisement sending check completed",
  "data": {
    "advertisement": {
      "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "title": "Premium Tutoring Service",
      "mediaUrl": "/advertisements/premium-tutor-banner.jpg",
      "mediaType": "image",
      "isActive": true,
      "supportivePlatforms": ["sms", "whatsapp", "mobile-push"]
    },
    "targeting": {
      "totalUsers": 8000,
      "students": 5000,
      "parents": 3000,
      "byInstitute": {
        "inst-001": 2000,
        "inst-002": 1500,
        "unknown": 4500
      },
      "bySubscriptionPlan": {
        "FREE": 3000,
        "PRO_WHATSAPP": 2000,
        "DYNAMAD": 500,
        "BASIC": 1500,
        "PRO_EMAIL": 1000
      }
    },
    "delivery": {
      "platforms": ["sms", "whatsapp", "mobile-push"],
      "eligibleUsers": 8000,
      "ineligibleUsers": 0,
      "packageBreakdown": {
        "FREE": { "targeted": 3000, "sent": 0, "failed": 0 },
        "PRO_WHATSAPP": { "targeted": 2000, "sent": 0, "failed": 0 },
        "DYNAMAD": { "targeted": 500, "sent": 0, "failed": 0 },
        "BASIC": { "targeted": 1500, "sent": 0, "failed": 0 },
        "PRO_EMAIL": { "targeted": 1000, "sent": 0, "failed": 0 }
      }
    },
    "execution": {
      "estimatedDBQueries": 3,
      "estimatedExecutionTime": "160 minutes",
      "deliveryMode": "batch"
    }
  }
}
```

> **Key difference from v1:** `eligibleUsers === totalUsers` and `ineligibleUsers === 0` because there is no subscription plan filtering. ALL targeted users will receive the ad.

### Frontend Tip

> Call `check-sending` BEFORE `send-manually`. Show results in a confirmation dialog so the admin can review user counts and delivery channels before committing.

---

## 10. Frontend UI Components Guide

### 10.1 Advertisement Create/Edit Form — Channel Picker Section

```
┌──────────────────────────────────────────────────────┐
│  📡 Delivery Channels (supportivePlatforms)          │
│  Select which channels this ad will be delivered     │
│  through when sent                                    │
│                                                       │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐           │
│  │ 📱 SMS   │  │ 💬 WA    │  │ ✈️ TG    │           │
│  │ [✓]      │  │ [✓]      │  │ [✓]      │           │
│  └──────────┘  └──────────┘  └──────────┘           │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐           │
│  │ 📧 Email │  │ 📲 Mobile│  │ 🌐 Web   │           │
│  │ [✓]      │  │ Push [✓] │  │ Push [ ] │           │
│  └──────────┘  └──────────┘  └──────────┘           │
│                                                       │
│  Quick Select: [All] [Push Only] [Messaging] [Clear] │
│                                                       │
│  ⚠️ At least one channel required for delivery       │
└──────────────────────────────────────────────────────┘
```

### 10.2 Manual Send Form — Simplified (No Channel Selection)

```
┌──────────────────────────────────────────────────────┐
│  📤 Send Advertisement Manually                      │
│                                                       │
│  Advertisement: [Premium Tutoring Service ▾]          │
│  Channels:      📱 SMS, 💬 WhatsApp, 📲 Push        │
│                 (from ad's supportivePlatforms)       │
│                                                       │
│  Target Type:   [● All Users    ○ Specific Users     │
│                  ○ Institute    ○ Subscription Plan   │
│                  ○ Parents      ○ Students         ]  │
│                                                       │
│  Custom Message: [________________________]           │
│                                                       │
│  [Preview / Dry-Run]  [Send Now]                     │
└──────────────────────────────────────────────────────┘
```

> **Note:** There is no channel picker in the send form. Channels are displayed as read-only info from the selected ad's `supportivePlatforms`. To change channels, the admin must edit the ad.

### 10.3 Send Preview / Dry-Run Results

```
┌──────────────────────────────────────────────────────┐
│  📊 Sending Preview Results                          │
│                                                       │
│  📡 Delivery via: SMS, WhatsApp, Mobile Push         │
│                                                       │
│  👥 Total Users:       8,000                         │
│  ✅ All Eligible:      8,000 (no plan filtering)     │
│                                                       │
│  📦 Users by Plan (analytics only):                  │
│  ┌─────────────┬──────────┐                          │
│  │ Plan        │ Count    │                          │
│  ├─────────────┼──────────┤                          │
│  │ FREE        │ 3,000    │                          │
│  │ PRO_WHATSAPP│ 2,000    │                          │
│  │ BASIC       │ 1,500    │                          │
│  │ PRO_EMAIL   │ 1,000    │                          │
│  │ DYNAMAD     │ 500      │                          │
│  └─────────────┴──────────┘                          │
│                                                       │
│  💰 Estimated Cost: ₨128.80                          │
│  ⏱ Estimated Time: ~160 minutes (batch mode)         │
│                                                       │
│         [Cancel]  [Confirm & Send]                    │
└──────────────────────────────────────────────────────┘
```

---

## 11. Channel Picker Component

### React/Next.js Implementation

```tsx
// types/advertisement.ts

export enum SupportivePlatform {
  SMS = 'sms',
  WHATSAPP = 'whatsapp',
  TELEGRAM = 'telegram',
  EMAIL = 'email',
  MOBILE_PUSH = 'mobile-push',
  WEB_PUSH = 'web-push',
}

export interface ChannelOption {
  value: SupportivePlatform;
  label: string;
  icon: string;
  description: string;
  costPerMessage: number;
  color: string;
}
```

### Channel Options Config

```tsx
// config/channelOptions.ts

import { SupportivePlatform, ChannelOption } from '../types/advertisement';

/**
 * Channel options for the CREATE/EDIT ad form.
 * These are the ad's supportivePlatforms — the ONLY thing that controls delivery channels.
 */
export const CHANNEL_OPTIONS: ChannelOption[] = [
  {
    value: SupportivePlatform.SMS,
    label: 'SMS',
    icon: '📱',
    description: 'Standard text message delivery',
    costPerMessage: 0.01,
    color: '#4CAF50',
  },
  {
    value: SupportivePlatform.WHATSAPP,
    label: 'WhatsApp',
    icon: '💬',
    description: 'WhatsApp Business message with media support',
    costPerMessage: 0.005,
    color: '#25D366',
  },
  {
    value: SupportivePlatform.TELEGRAM,
    label: 'Telegram',
    icon: '✈️',
    description: 'Telegram bot message with rich media',
    costPerMessage: 0.001,
    color: '#0088cc',
  },
  {
    value: SupportivePlatform.EMAIL,
    label: 'Email',
    icon: '📧',
    description: 'Email notification with HTML content',
    costPerMessage: 0.0005,
    color: '#EA4335',
  },
  {
    value: SupportivePlatform.MOBILE_PUSH,
    label: 'Mobile Push',
    icon: '📲',
    description: 'Firebase push notification to mobile app',
    costPerMessage: 0.0001,
    color: '#FF9800',
  },
  {
    value: SupportivePlatform.WEB_PUSH,
    label: 'Web Push',
    icon: '🌐',
    description: 'Browser push notification',
    costPerMessage: 0.0001,
    color: '#2196F3',
  },
];

/** Quick-select presets */
export const CHANNEL_PRESETS = {
  all: Object.values(SupportivePlatform),
  pushOnly: [SupportivePlatform.MOBILE_PUSH, SupportivePlatform.WEB_PUSH],
  messaging: [SupportivePlatform.SMS, SupportivePlatform.WHATSAPP, SupportivePlatform.TELEGRAM],
  digital: [SupportivePlatform.EMAIL, SupportivePlatform.MOBILE_PUSH, SupportivePlatform.WEB_PUSH],
};
```

### Reusable ChannelPicker Component

```tsx
// components/ChannelPicker.tsx

import React from 'react';
import { SupportivePlatform, ChannelOption } from '../types/advertisement';
import { CHANNEL_PRESETS } from '../config/channelOptions';

interface ChannelPickerProps {
  options: ChannelOption[];
  selected: SupportivePlatform[];
  onChange: (selected: SupportivePlatform[]) => void;
  showCost?: boolean;
  disabled?: boolean;
  readOnly?: boolean;  // For display-only in send form
}

export function ChannelPicker({
  options,
  selected,
  onChange,
  showCost = false,
  disabled = false,
  readOnly = false,
}: ChannelPickerProps) {
  const toggleChannel = (value: SupportivePlatform) => {
    if (disabled || readOnly) return;

    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value));
    } else {
      onChange([...selected, value]);
    }
  };

  return (
    <div className="channel-picker">
      <div className="channel-picker__header">
        <span className="channel-picker__label">📡 Delivery Channels</span>
        {!readOnly && (
          <div className="channel-picker__actions">
            <button type="button" onClick={() => onChange(CHANNEL_PRESETS.all)} disabled={disabled}>
              All
            </button>
            <button type="button" onClick={() => onChange(CHANNEL_PRESETS.pushOnly)} disabled={disabled}>
              Push Only
            </button>
            <button type="button" onClick={() => onChange(CHANNEL_PRESETS.messaging)} disabled={disabled}>
              Messaging
            </button>
            <button type="button" onClick={() => onChange([])} disabled={disabled}>
              Clear
            </button>
          </div>
        )}
      </div>

      <div className="channel-picker__grid">
        {options.map((option) => {
          const isSelected = selected.includes(option.value);
          return (
            <button
              key={option.value}
              type="button"
              className={`channel-chip ${isSelected ? 'channel-chip--active' : ''} ${readOnly ? 'channel-chip--readonly' : ''}`}
              onClick={() => toggleChannel(option.value)}
              disabled={disabled || readOnly}
              style={{
                borderColor: isSelected ? option.color : undefined,
                backgroundColor: isSelected ? `${option.color}15` : undefined,
              }}
            >
              <span className="channel-chip__icon">{option.icon}</span>
              <span className="channel-chip__label">{option.label}</span>
              {isSelected && <span className="channel-chip__check">✓</span>}
              {showCost && (
                <span className="channel-chip__cost">
                  ₨{option.costPerMessage}/msg
                </span>
              )}
            </button>
          );
        })}
      </div>

      {!readOnly && selected.length === 0 && (
        <p className="channel-picker__warning">
          ⚠️ At least one delivery channel is required
        </p>
      )}
    </div>
  );
}
```

---

## 12. Cost Estimation Display

### Cost Config

```tsx
// config/deliveryCosts.ts

import { SupportivePlatform } from '../types/advertisement';

export const DELIVERY_COSTS: Record<SupportivePlatform, { baseCost: number; mediaMultiplier: number }> = {
  [SupportivePlatform.SMS]:         { baseCost: 0.01,   mediaMultiplier: 0 },      // SMS cannot send media
  [SupportivePlatform.WHATSAPP]:    { baseCost: 0.005,  mediaMultiplier: 1.5 },
  [SupportivePlatform.TELEGRAM]:    { baseCost: 0.001,  mediaMultiplier: 1.2 },
  [SupportivePlatform.EMAIL]:       { baseCost: 0.0005, mediaMultiplier: 1.1 },
  [SupportivePlatform.MOBILE_PUSH]: { baseCost: 0.0001, mediaMultiplier: 1.0 },
  [SupportivePlatform.WEB_PUSH]:    { baseCost: 0.0001, mediaMultiplier: 1.0 },
};

/**
 * Estimate total cost for sending ad to N users via given channels.
 * Channels come from the ad's supportivePlatforms.
 */
export function estimateSendCost(
  platforms: SupportivePlatform[],
  userCount: number,
  hasMedia: boolean
): { totalCost: number; breakdown: Record<string, number> } {
  const breakdown: Record<string, number> = {};
  let totalCost = 0;

  for (const platform of platforms) {
    const config = DELIVERY_COSTS[platform];
    if (!config) continue;

    const multiplier = hasMedia && config.mediaMultiplier > 0 ? config.mediaMultiplier : 1;
    const cost = config.baseCost * multiplier * userCount;

    breakdown[platform] = cost;
    totalCost += cost;
  }

  return { totalCost, breakdown };
}
```

---

## 13. Response Handling & Error States

### Error Responses

| HTTP Code | Scenario | Frontend Action |
|-----------|----------|-----------------|
| `400` | No `supportivePlatforms` configured on ad | Show "Configure delivery channels first" |
| `400` | Missing required targeting fields | Show form validation errors |
| `401` | Not authenticated | Redirect to login |
| `403` | Not SUPERADMIN | Show "Access Denied" message |
| `404` | Advertisement not found | Show "Ad not found" toast |
| `500` | Server error during send | Show error with retry option |

### Error Response Format

```json
{
  "statusCode": 400,
  "message": "Advertisement has no delivery channels (supportivePlatforms) configured"
}
```

### Handling Partial Failures

When `totalFailed > 0`, failures are due to delivery errors (bad contact info, network), NOT plan restrictions:

```tsx
if (response.data.totalFailed > 0) {
  showWarning(
    `Sent to ${response.data.totalSent} users, ` +
    `but ${response.data.totalFailed} failed due to delivery errors. ` +
    `Check failed user IDs for details.`
  );
}
```

---

## 14. TypeScript Interfaces for Frontend

```tsx
// types/advertisement.ts

// ============================================
// ENUMS
// ============================================

export enum SupportivePlatform {
  SMS = 'sms',
  WHATSAPP = 'whatsapp',
  TELEGRAM = 'telegram',
  EMAIL = 'email',
  MOBILE_PUSH = 'mobile-push',
  WEB_PUSH = 'web-push',
}

export enum MediaType {
  IMAGE = 'image',
  VIDEO = 'video',
  AUDIO = 'audio',
  PDF = 'pdf',
}

export enum ManualSendTargetType {
  ALL_USERS = 'all_users',
  SPECIFIC_USERS = 'specific_users',
  INSTITUTE_USERS = 'institute_users',
  SUBSCRIPTION_PLAN_USERS = 'subscription_plan_users',
  PARENT_USERS = 'parent_users',
  STUDENT_USERS = 'student_users',
}

// ============================================
// CREATE / UPDATE DTOs
// ============================================

export interface CreateAdvertisementRequest {
  title: string;
  accessKey: string;
  description?: string;
  mediaUrl: string;
  mediaType: MediaType;
  landingUrl?: string;
  sendingUrl?: string;

  /** 🎯 DELIVERY MODES — the ONLY thing that controls which channels the ad is delivered through */
  supportivePlatforms: SupportivePlatform[];

  // Targeting
  targetInstituteIds?: string[];
  targetCities?: string[];
  targetProvinces?: string[];
  targetDistricts?: string[];
  minBornYear?: number;
  maxBornYear?: number;
  targetGenders?: string[];
  targetOccupations?: string[];
  targetUserTypes?: string[];
  targetSubscriptionPlans?: string[];

  // Campaign
  displayDuration?: number;
  priority?: number;
  isActive?: boolean;
  startDate: string;
  endDate: string;
  maxSendings?: number;
  cascadeToParents?: boolean;

  // Budget
  budget?: number;
  costPerClick?: number;
  costPerImpression?: number;
  createdBy?: string;
}

export interface UpdateAdvertisementRequest {
  title?: string;
  accessKey?: string;
  description?: string;
  mediaUrl?: string;
  mediaType?: MediaType;
  landingUrl?: string;
  sendingUrl?: string;

  /** 🎯 Update delivery channels */
  supportivePlatforms?: SupportivePlatform[];

  targetInstituteIds?: string[];
  targetCities?: string[];
  targetProvinces?: string[];
  targetDistricts?: string[];
  minBornYear?: number;
  maxBornYear?: number;
  targetGenders?: string[];
  targetOccupations?: string[];
  targetUserTypes?: string[];
  targetSubscriptionPlans?: string[];
  displayDuration?: number;
  priority?: number;
  isActive?: boolean;
  startDate?: string;
  endDate?: string;
  maxSendings?: number;
  cascadeToParents?: boolean;
  budget?: number;
  costPerClick?: number;
  costPerImpression?: number;
}

// ============================================
// RESPONSE DTOs
// ============================================

export interface AdvertisementResponse {
  id: string;
  title: string;
  accessKey: string;
  description?: string;
  mediaUrl?: string;
  landingUrl?: string;
  sendingUrl?: string;

  /** 🎯 Delivery channels — sole authority for channel routing */
  supportivePlatforms: SupportivePlatform[];

  mediaType: MediaType;
  targetInstituteIds: string[];
  targetCities: string[];
  targetProvinces: string[];
  targetDistricts: string[];
  minBornYear?: number;
  maxBornYear?: number;
  targetGenders: string[];
  targetOccupations: string[];
  targetUserTypes: string[];
  targetSubscriptionPlans: string[];
  displayDuration: number;
  priority: number;
  isActive: boolean;
  maxSendings: number;
  cascadeToParents: boolean;
  startDate: string;
  endDate: string;
  impressions: number;
  clicks: number;
  sends: number;
  costPerClick?: number;
  costPerImpression?: number;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdvertisementListResponse {
  advertisements: AdvertisementResponse[];
  total: number;
  totalPages: number;
  currentPage: number;
  limit: number;
}

// ============================================
// MANUAL SEND DTOs (no channels field)
// ============================================

export interface ManualSendRequest {
  advertisementId: string;
  targetType: ManualSendTargetType;
  specificUserIds?: string[];
  instituteIds?: string[];
  subscriptionPlans?: string[];  // For targeting only, NOT channel filtering
  message?: string;
  // ❌ No "channels" field — channels come from ad.supportivePlatforms
}

export interface BulkSendRequest {
  campaigns: ManualSendRequest[];
  scheduledTime?: string;
}

export interface PackageBreakdown {
  [planName: string]: {
    targeted: number;
    sent: number;
    failed: number;
  };
}

export interface ManualSendResponse {
  success: boolean;
  message: string;  // e.g. "Advertisement sent to 1250 users via [sms, whatsapp, mobile-push]"
  data: {
    campaignId: string;
    totalTargeted: number;
    totalSent: number;
    totalFailed: number;
    failedUsers: string[];
    sentUsers: string[];
    packageBreakdown: PackageBreakdown;  // Analytics only, not filtering
  };
}

// ============================================
// CHECK SENDING (DRY-RUN) DTOs
// ============================================

export interface CheckSendingResponse {
  success: boolean;
  message: string;
  data: {
    advertisement: {
      id: string;
      title: string;
      mediaUrl: string;
      mediaType: string;
      isActive: boolean;
      supportivePlatforms: SupportivePlatform[];  // Shows which channels will be used
    };
    targeting: {
      totalUsers: number;
      students: number;
      parents: number;
      byInstitute: Record<string, number>;
      bySubscriptionPlan: Record<string, number>;  // Analytics only
    };
    delivery: {
      platforms: SupportivePlatform[];  // From ad entity
      eligibleUsers: number;            // Always === totalUsers (no filtering)
      ineligibleUsers: number;          // Always 0
      packageBreakdown: PackageBreakdown;
    };
    execution: {
      estimatedDBQueries: number;
      estimatedExecutionTime: string;
      deliveryMode: string;
    };
  };
}
```

---

## 15. React Component Examples

### 15.1 Advertisement Form with Channel Picker

```tsx
// components/AdvertisementForm.tsx

import React, { useState } from 'react';
import { ChannelPicker } from './ChannelPicker';
import { CHANNEL_OPTIONS } from '../config/channelOptions';
import { SupportivePlatform, CreateAdvertisementRequest } from '../types/advertisement';

interface AdvertisementFormProps {
  initialData?: Partial<CreateAdvertisementRequest>;
  onSubmit: (data: CreateAdvertisementRequest) => Promise<void>;
  isEditing?: boolean;
}

export function AdvertisementForm({ initialData, onSubmit, isEditing }: AdvertisementFormProps) {
  const [formData, setFormData] = useState<Partial<CreateAdvertisementRequest>>({
    supportivePlatforms: [],
    ...initialData,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handlePlatformChange = (platforms: SupportivePlatform[]) => {
    setFormData((prev) => ({ ...prev, supportivePlatforms: platforms }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.supportivePlatforms?.length) {
      alert('Please select at least one delivery channel');
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit(formData as CreateAdvertisementRequest);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      {/* ... other form fields (title, description, media, targeting, etc.) ... */}

      {/* 🎯 DELIVERY CHANNELS SECTION */}
      <section className="form-section">
        <h3>📡 Delivery Channels</h3>
        <p className="form-help">
          Select which channels this advertisement will be delivered through.
          These channels apply to ALL targeted users regardless of subscription plan.
        </p>

        <ChannelPicker
          options={CHANNEL_OPTIONS}
          selected={formData.supportivePlatforms || []}
          onChange={handlePlatformChange}
          showCost={true}
          disabled={isSubmitting}
        />
      </section>

      <button type="submit" disabled={isSubmitting}>
        {isEditing ? 'Update Advertisement' : 'Create Advertisement'}
      </button>
    </form>
  );
}
```

### 15.2 Manual Send Dialog (Simplified — No Channel Picker)

```tsx
// components/ManualSendDialog.tsx

import React, { useState } from 'react';
import { ChannelPicker } from './ChannelPicker';
import { CHANNEL_OPTIONS } from '../config/channelOptions';
import {
  ManualSendRequest,
  ManualSendTargetType,
  CheckSendingResponse,
  ManualSendResponse,
  AdvertisementResponse,
} from '../types/advertisement';
import { estimateSendCost } from '../config/deliveryCosts';

interface ManualSendDialogProps {
  advertisement: AdvertisementResponse;
  onClose: () => void;
  onSend: (request: ManualSendRequest) => Promise<ManualSendResponse>;
  onCheckSending: (request: ManualSendRequest) => Promise<CheckSendingResponse>;
}

export function ManualSendDialog({
  advertisement, onClose, onSend, onCheckSending,
}: ManualSendDialogProps) {
  const [targetType, setTargetType] = useState<ManualSendTargetType>(ManualSendTargetType.ALL_USERS);
  const [message, setMessage] = useState('');
  const [specificUserIds, setSpecificUserIds] = useState<string[]>([]);
  const [instituteIds, setInstituteIds] = useState<string[]>([]);
  const [subscriptionPlans, setSubscriptionPlans] = useState<string[]>([]);

  const [preview, setPreview] = useState<CheckSendingResponse | null>(null);
  const [result, setResult] = useState<ManualSendResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'configure' | 'preview' | 'result'>('configure');

  // Delivery channels come from the ad — read-only display
  const deliveryChannels = advertisement.supportivePlatforms;

  const buildRequest = (): ManualSendRequest => ({
    advertisementId: advertisement.id,
    targetType,
    message: message || undefined,
    specificUserIds: targetType === ManualSendTargetType.SPECIFIC_USERS ? specificUserIds : undefined,
    instituteIds: targetType === ManualSendTargetType.INSTITUTE_USERS ? instituteIds : undefined,
    subscriptionPlans: targetType === ManualSendTargetType.SUBSCRIPTION_PLAN_USERS ? subscriptionPlans : undefined,
    // ❌ No channels field — backend reads from ad.supportivePlatforms
  });

  const handlePreview = async () => {
    setLoading(true);
    try {
      const checkResult = await onCheckSending(buildRequest());
      setPreview(checkResult);
      setStep('preview');
    } catch (error: any) {
      alert(`Preview failed: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async () => {
    setLoading(true);
    try {
      const sendResult = await onSend(buildRequest());
      setResult(sendResult);
      setStep('result');
    } catch (error: any) {
      alert(`Send failed: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const hasMedia = !!advertisement.mediaUrl;
  const costEstimate = preview
    ? estimateSendCost(deliveryChannels, preview.data.delivery.eligibleUsers, hasMedia)
    : null;

  return (
    <div className="dialog-overlay">
      <div className="dialog">
        <h2>📤 Send: {advertisement.title}</h2>

        {step === 'configure' && (
          <>
            {/* Display delivery channels (read-only from ad) */}
            <div className="form-group">
              <label>📡 Delivery Channels (from ad configuration)</label>
              <ChannelPicker
                options={CHANNEL_OPTIONS}
                selected={deliveryChannels}
                onChange={() => {}}
                readOnly={true}
                showCost={true}
              />
              <p className="form-hint">
                To change delivery channels, edit the advertisement.
              </p>
            </div>

            {/* Target Type Selector */}
            <div className="form-group">
              <label>Target Audience</label>
              <select value={targetType} onChange={(e) => setTargetType(e.target.value as ManualSendTargetType)}>
                <option value="all_users">All Users</option>
                <option value="specific_users">Specific Users</option>
                <option value="institute_users">Institute Users</option>
                <option value="subscription_plan_users">By Subscription Plan</option>
                <option value="parent_users">All Parents</option>
                <option value="student_users">All Students</option>
              </select>
            </div>

            {/* Conditional targeting fields */}
            {targetType === ManualSendTargetType.SPECIFIC_USERS && (
              <div className="form-group">
                <label>User IDs (comma-separated)</label>
                <textarea
                  value={specificUserIds.join(', ')}
                  onChange={(e) => setSpecificUserIds(e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                  placeholder="user-001, user-002, user-003"
                />
              </div>
            )}

            {targetType === ManualSendTargetType.INSTITUTE_USERS && (
              <div className="form-group">
                <label>Institute IDs</label>
                <textarea
                  value={instituteIds.join(', ')}
                  onChange={(e) => setInstituteIds(e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                  placeholder="inst-001, inst-002"
                />
              </div>
            )}

            {/* Custom Message */}
            <div className="form-group">
              <label>Custom Message (optional)</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Custom message to include with the advertisement..."
                maxLength={500}
              />
            </div>

            <div className="dialog-actions">
              <button onClick={onClose}>Cancel</button>
              <button onClick={handlePreview} disabled={loading}>
                {loading ? 'Loading...' : '🔍 Preview'}
              </button>
            </div>
          </>
        )}

        {step === 'preview' && preview && (
          <>
            <div className="preview-stats">
              <div className="stat">
                <span className="stat-label">Total Users</span>
                <span className="stat-value">{preview.data.targeting.totalUsers.toLocaleString()}</span>
              </div>
              <div className="stat">
                <span className="stat-label">Delivery Channels</span>
                <span className="stat-value">{deliveryChannels.join(', ')}</span>
              </div>
            </div>

            {/* Plan Breakdown (analytics only) */}
            <h4>📦 Users by Subscription Plan</h4>
            <table className="preview-table">
              <thead>
                <tr><th>Plan</th><th>Users</th></tr>
              </thead>
              <tbody>
                {Object.entries(preview.data.targeting.bySubscriptionPlan).map(([plan, count]) => (
                  <tr key={plan}><td>{plan}</td><td>{count}</td></tr>
                ))}
              </tbody>
            </table>

            {costEstimate && (
              <div className="cost-estimate">
                <h4>💰 Estimated Cost</h4>
                {Object.entries(costEstimate.breakdown).map(([channel, cost]) => (
                  <div key={channel} className="cost-row">
                    <span>{channel}</span>
                    <span>₨{cost.toFixed(2)}</span>
                  </div>
                ))}
                <div className="cost-row cost-row--total">
                  <span>Total</span>
                  <span>₨{costEstimate.totalCost.toFixed(2)}</span>
                </div>
              </div>
            )}

            <div className="dialog-actions">
              <button onClick={() => setStep('configure')}>← Back</button>
              <button className="btn-primary" onClick={handleSend} disabled={loading}>
                {loading ? 'Sending...' : `✅ Confirm & Send to ${preview.data.targeting.totalUsers.toLocaleString()} users`}
              </button>
            </div>
          </>
        )}

        {step === 'result' && result && (
          <>
            <div className={`result-banner ${result.success ? 'result--success' : 'result--error'}`}>
              {result.success ? '✅' : '❌'} {result.message}
            </div>

            {result.success && (
              <div className="result-stats">
                <div>Campaign ID: <code>{result.data.campaignId}</code></div>
                <div>Sent: <strong>{result.data.totalSent}</strong></div>
                <div>Failed: <strong>{result.data.totalFailed}</strong></div>
              </div>
            )}

            <div className="dialog-actions">
              <button onClick={onClose}>Close</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
```

### 15.3 API Service Layer

```tsx
// services/advertisementApi.ts

import {
  CreateAdvertisementRequest,
  UpdateAdvertisementRequest,
  AdvertisementResponse,
  AdvertisementListResponse,
  ManualSendRequest,
  ManualSendResponse,
  BulkSendRequest,
  CheckSendingResponse,
} from '../types/advertisement';

const API_BASE = '/api/advertisements';

async function fetchWithAuth(url: string, options: RequestInit = {}) {
  const token = localStorage.getItem('accessToken');
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(error.message || `HTTP ${response.status}`);
  }

  return response.json();
}

export const advertisementApi = {
  // CRUD
  create: (data: CreateAdvertisementRequest): Promise<AdvertisementResponse> =>
    fetchWithAuth(API_BASE, { method: 'POST', body: JSON.stringify(data) }),

  list: (page = 1, limit = 10): Promise<AdvertisementListResponse> =>
    fetchWithAuth(`${API_BASE}?page=${page}&limit=${limit}`),

  getById: (id: string): Promise<AdvertisementResponse> =>
    fetchWithAuth(`${API_BASE}/${id}`),

  update: (id: string, data: UpdateAdvertisementRequest): Promise<AdvertisementResponse> =>
    fetchWithAuth(`${API_BASE}/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  delete: (id: string): Promise<void> =>
    fetchWithAuth(`${API_BASE}/${id}`, { method: 'DELETE' }),

  // Delivery — no channels in request, they come from ad.supportivePlatforms
  sendManually: (data: ManualSendRequest): Promise<ManualSendResponse> =>
    fetchWithAuth(`${API_BASE}/send-manually`, { method: 'POST', body: JSON.stringify(data) }),

  sendBulk: (data: BulkSendRequest): Promise<ManualSendResponse[]> =>
    fetchWithAuth(`${API_BASE}/bulk-send`, { method: 'POST', body: JSON.stringify(data) }),

  checkSending: (data: ManualSendRequest): Promise<CheckSendingResponse> =>
    fetchWithAuth(`${API_BASE}/check-sending`, { method: 'POST', body: JSON.stringify(data) }),

  // Tracking
  recordImpression: (id: string): Promise<void> =>
    fetchWithAuth(`${API_BASE}/${id}/impression`, { method: 'POST' }),

  recordClick: (id: string): Promise<void> =>
    fetchWithAuth(`${API_BASE}/${id}/click`, { method: 'POST' }),
};
```

---

## 16. Complete Flow Diagrams

### 16.1 Create Ad with Delivery Modes

```
Admin Dashboard
      │
      ▼
┌─────────────────┐     ┌─────────────────────────────┐
│  Fill Ad Form    │────▶│  Select Delivery Channels   │
│  title, media,   │     │  ☑ SMS  ☑ WhatsApp  ☑ TG  │
│  targeting, etc  │     │  ☑ Email  ☑ Mobile Push     │
│                  │     │  supportivePlatforms array  │
└─────────────────┘     └──────────────┬──────────────┘
                                        │
                                        ▼
                              POST /api/advertisements
                              body: { supportivePlatforms: [...], ... }
                                        │
                                        ▼
                              Ad created & stored in DB
                              supportivePlatforms saved
```

### 16.2 Manual Send Flow

```
┌───────────┐     ┌──────────────┐     ┌─────────────────┐
│ Select Ad │────▶│ View ad's    │────▶│ Pick Target     │
│           │     │ channels     │     │ Type & Filters  │
│           │     │ (read-only)  │     │                 │
└───────────┘     └──────────────┘     └────────┬────────┘
                                                 │
                                                 ▼
                                       POST /check-sending
                                       (no channels in body)
                                                 │
                                                 ▼
                                       ┌─────────────────┐
                                       │ Preview:        │
                                       │ 8,000 users     │
                                       │ via SMS, WA,    │
                                       │ Push            │
                                       │ ₨128.80 est.   │
                                       └────────┬────────┘
                                                │
                                     ┌──────────┴──────────┐
                                     │                      │
                               [Cancel]              [Confirm]
                                     │                      │
                                     ▼                      ▼
                               Back to form        POST /send-manually
                                                   (no channels in body)
                                                            │
                                                            ▼
                                                   ┌────────────────┐
                                                   │ Result:        │
                                                   │ 7,800 sent     │
                                                   │ 200 failed     │
                                                   │ (delivery err) │
                                                   └────────────────┘
```

### 16.3 How Delivery Channels Work (Simplified)

```
Advertisement Entity
├── supportivePlatforms: ["sms", "whatsapp", "mobile-push"]
│
│   When "Send Manually" is triggered:
│
├── Step 1: Get targeted users (by targetType filter)
│   └── Returns 8,000 active users
│
├── Step 2: ALL 8,000 users are eligible (no plan filtering)
│
├── Step 3: Send to each user via ["sms", "whatsapp", "mobile-push"]
│   └── AttendanceNotificationService handles actual dispatch
│
└── Step 4: Record results
    ├── sent: 7,800
    └── failed: 200 (network/contact errors)

❌ Subscription plan is NOT checked
❌ No channel intersection with plan
❌ No isAds flag filtering
✅ All targeted users get the ad
✅ Channels come ONLY from ad.supportivePlatforms
```

---

## Appendix: CSS Styling

```css
.channel-picker {
  margin: 1rem 0;
  padding: 1rem;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  background: #fafafa;
}

.channel-picker__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.75rem;
}

.channel-picker__label {
  font-weight: 600;
  font-size: 0.95rem;
}

.channel-picker__actions button {
  margin-left: 0.5rem;
  padding: 0.25rem 0.75rem;
  font-size: 0.8rem;
  border: 1px solid #ccc;
  border-radius: 4px;
  background: white;
  cursor: pointer;
}

.channel-picker__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 0.5rem;
}

.channel-chip {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  background: white;
  cursor: pointer;
  transition: all 0.2s ease;
  font-size: 0.9rem;
}

.channel-chip:hover:not(.channel-chip--readonly) {
  border-color: #999;
  transform: translateY(-1px);
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.channel-chip--active {
  border-width: 2px;
  font-weight: 500;
}

.channel-chip--readonly {
  cursor: default;
  opacity: 0.85;
}

.channel-chip__icon {
  font-size: 1.2rem;
}

.channel-chip__check {
  margin-left: auto;
  color: #4CAF50;
  font-weight: bold;
}

.channel-chip__cost {
  font-size: 0.75rem;
  color: #666;
  margin-left: auto;
}

.channel-picker__warning {
  margin-top: 0.5rem;
  color: #f57c00;
  font-size: 0.85rem;
}

.form-hint {
  font-size: 0.8rem;
  color: #888;
  margin-top: 0.25rem;
  font-style: italic;
}
```

---

**End of Guide v2.0** | Decoupled Architecture — ad.supportivePlatforms is the sole delivery authority
