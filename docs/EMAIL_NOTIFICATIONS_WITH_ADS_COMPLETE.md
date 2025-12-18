# Email Notifications with Advertisements - Complete Guide

## 📧 What Can Be Sent Through Email When Attendance is Marked with Ads

### **Email Content Components**

When attendance is marked and an advertisement is included, the email notification contains the following:

---

## **1. Attendance Information** 📝

### Student Details
- **Student Name**: `Sarah Johnson`
- **Student ID**: `STU-12345`
- **Attendance Status**: `PRESENT` or `ABSENT`
- **Date**: `2025-11-29`
- **Time**: `08:30 AM`

### Location Information
- **Place/Location**: `Colombo International School - Grade 10A - Mathematics`
- **Institute Name**: `Colombo International School` (if available)
- **Class/Subject**: Extracted from location

### Parent Information
- **Parent Name**: `Mr. John Johnson` / `Parent/Guardian`
- **Parent Email**: Recipient email address

---

## **2. Advertisement Components** 🎯

When `isAds=true` for the subscription plan, the email includes:

### Ad Title
- **Field**: `advertisementData.title`
- **Example**: `"Grade 10 Mathematics Tuition - Limited Seats"`
- **HTML Tag**: `<h3>` or `<h2>`
- **Purpose**: Eye-catching headline

### Ad Content/Description
- **Field**: `advertisementData.content`
- **Example**: `"Join our award-winning mathematics program. Expert tutors, small class sizes, 95% A+ success rate."`
- **HTML Tag**: `<p>` with formatting
- **Purpose**: Detailed information about the offering

### Ad Image
- **Field**: `advertisementData.mediaUrl`
- **Format**: Full URL to image (JPEG, PNG, GIF)
- **Example**: `https://storage.googleapis.com/ads/math-tuition-banner.jpg`
- **HTML Tag**: `<img src="..." alt="..." />`
- **Purpose**: Visual appeal and branding
- **Size**: Responsive (fits email width)

### Ad Link/Landing URL
- **Field**: `advertisementData.mediaUrl` (currently) or `sendingUrl` (new)
- **Example**: `https://tuitioncenter.lk/enroll?ref=attendance-2025`
- **HTML Tag**: `<a href="...">Learn More</a>`
- **Purpose**: Click-through to advertiser's website
- **Button Text**: `"Learn More"` / `"Enroll Now"` / `"Visit Website"`

### Sending URL (New Feature) 🆕
- **Field**: `advertisementData.sendingUrl`
- **Purpose**: Alternative/specific landing page for email clicks
- **Example**: `https://example.com/email-campaign/summer-2025`
- **Use Case**: Track email-specific conversions

---

## **3. Email Templates** 📬

### Template Types (Automatic Selection)

#### A. **Institute Attendance with Ads**
**Template**: `attendance_institute_with_ads`

**When Used**: Regular school/class attendance + ad-enabled subscription

**Structure**:
```
┌────────────────────────────────────────┐
│ 📚 Attendance Notification             │
├────────────────────────────────────────┤
│ Dear Parent/Guardian,                  │
│                                        │
│ Sarah Johnson was marked PRESENT       │
│ Date: 2025-11-29 at 08:30 AM          │
│ Location: Colombo International School │
│           Grade 10A - Mathematics      │
├────────────────────────────────────────┤
│ 🎯 ADVERTISEMENT SECTION               │
│                                        │
│ [Image: Math Tuition Banner]          │
│                                        │
│ Grade 10 Mathematics Tuition          │
│ Limited Seats Available!              │
│                                        │
│ Join our award-winning program.       │
│ Expert tutors, small classes.         │
│                                        │
│ [Learn More Button] → Landing URL     │
├────────────────────────────────────────┤
│ Best regards,                          │
│ School Administration                  │
└────────────────────────────────────────┘
```

#### B. **Institute Attendance without Ads**
**Template**: `attendance_institute_no_ads`

**When Used**: Regular attendance + FREE/BASIC subscription (no ads)

**Structure**: Same as above but NO advertisement section

#### C. **Vehicle/Bookhire Attendance with Ads**
**Template**: `attendance_bookhire_with_ads`

**When Used**: Transport/bus attendance + ad-enabled subscription

**Structure**:
```
┌────────────────────────────────────────┐
│ 🚌 Transport Attendance Update         │
├────────────────────────────────────────┤
│ Dear Parent/Guardian,                  │
│                                        │
│ Sarah Johnson was picked up            │
│ Date: 2025-11-29 at 07:15 AM          │
│ Vehicle: WP CAB-1234                   │
│ Route: Morning Route A                 │
├────────────────────────────────────────┤
│ 🎯 ADVERTISEMENT SECTION               │
│                                        │
│ [Image: School Supplies Ad]           │
│                                        │
│ Back to School Essentials             │
│ 20% Off This Week!                    │
│                                        │
│ [Shop Now Button]                      │
├────────────────────────────────────────┤
│ Transport Service Team                 │
└────────────────────────────────────────┘
```

#### D. **Vehicle Attendance without Ads**
**Template**: `attendance_bookhire_no_ads`

**When Used**: Transport attendance + no ads subscription

---

## **4. Email Template Data Object** 💾

### Complete Data Structure Sent to Email Service

```typescript
{
  // Parent Information
  parentName: "Mr. John Johnson",
  
  // Student Information
  studentName: "Sarah Johnson",
  studentId: "STU-12345",
  status: "Present",  // or "Absent"
  
  // Attendance Details
  date: "2025-11-29",
  time: "08:30 AM",
  place: "Colombo International School - Grade 10A",
  markedBy: "System Administrator",
  locale: "en",
  
  // Institute Information (optional)
  instituteName: "Colombo International School",
  
  // Vehicle/Transport Information (optional)
  bookhireName: "Morning Route A",
  vehicleNumber: "WP CAB-1234",
  driverName: "Transport Staff",
  pickupStatus: "picked up",  // or "dropped off"
  
  // Advertisement Data (only if ads enabled)
  adTitle: "Grade 10 Mathematics Tuition",
  adContent: "Join our award-winning program...",
  adImageUrl: "https://storage.googleapis.com/ads/banner.jpg",
  adLinkUrl: "https://tuitioncenter.lk/enroll",
  adButtonText: "Learn More"
}
```

---

## **5. Platform-Specific Filtering** 🎯

### How Email Filtering Works

```typescript
// Advertisement specifies supported platforms
advertisement.supportivePlatforms = ['email', 'whatsapp'];

// User's subscription provides channels
subscriptionChannels = ['whatsapp', 'email', 'sms', 'telegram'];

// System filters to only supported platforms
actualChannels = ['whatsapp', 'email'];  // SMS and Telegram skipped

// Result: Email WILL be sent (included in supportivePlatforms)
```

### Email-Specific Ad Example

```json
{
  "title": "Professional Course Catalog",
  "description": "Download our 50-page course guide...",
  "mediaUrl": "https://cdn.com/catalog-cover.jpg",
  "sendingUrl": "https://institute.com/catalog-download",
  "supportivePlatforms": ["email"],  // Email ONLY
  "targetSubscriptionPlans": ["PREMIUM", "PLATINUM"]
}
```

**Result**: 
- ✅ Email sent with ad
- 🚫 WhatsApp skipped (not in supportivePlatforms)
- 🚫 SMS skipped
- 🚫 Telegram skipped

---

## **6. Email Content Examples** 📄

### Example 1: Email with Image Advertisement

**HTML Structure**:
```html
<!DOCTYPE html>
<html>
<head>
  <style>
    .ad-section {
      border: 2px solid #007bff;
      border-radius: 8px;
      padding: 20px;
      margin: 20px 0;
      background: #f8f9fa;
    }
    .ad-image {
      max-width: 100%;
      height: auto;
      border-radius: 4px;
    }
    .ad-button {
      display: inline-block;
      padding: 12px 24px;
      background: #007bff;
      color: white;
      text-decoration: none;
      border-radius: 4px;
      margin-top: 15px;
    }
  </style>
</head>
<body>
  <h2>📚 Attendance Notification</h2>
  
  <p>Dear Mr. John Johnson,</p>
  
  <div class="attendance-info">
    <p><strong>Sarah Johnson</strong> was marked <strong>PRESENT</strong></p>
    <p>📅 Date: 2025-11-29 at 08:30 AM</p>
    <p>📍 Location: Colombo International School - Grade 10A</p>
  </div>
  
  <!-- ADVERTISEMENT SECTION -->
  <div class="ad-section">
    <img src="https://storage.googleapis.com/ads/math-tuition.jpg" 
         alt="Math Tuition Advertisement" 
         class="ad-image">
    
    <h3>Grade 10 Mathematics Tuition</h3>
    <p>Join our award-winning mathematics program. Expert tutors, 
       small class sizes, 95% A+ success rate. Limited seats available!</p>
    
    <a href="https://tuitioncenter.lk/enroll?ref=email-att-2025" 
       class="ad-button">Enroll Now</a>
  </div>
  
  <p>Best regards,<br>School Administration</p>
</body>
</html>
```

### Example 2: Email with Text-Only Advertisement

```html
<div class="ad-section">
  <h3>🎓 Summer Coding Bootcamp</h3>
  <p><strong>Limited Time Offer - 30% Off!</strong></p>
  <p>Learn Python, JavaScript, and Web Development in just 8 weeks. 
     Beginner-friendly curriculum with hands-on projects.</p>
  <ul>
    <li>✅ Live Online Classes</li>
    <li>✅ Certificate Upon Completion</li>
    <li>✅ Career Support Included</li>
  </ul>
  <a href="https://codingschool.com/bootcamp" class="ad-button">
    Register Today
  </a>
</div>
```

### Example 3: Email with PDF/Document Advertisement

```html
<div class="ad-section">
  <h3>📖 Free Educational Resources</h3>
  <p>Download our comprehensive study guides for Grade 10 students!</p>
  
  <img src="https://storage.googleapis.com/ads/study-guide-cover.jpg" 
       alt="Study Guide Cover" 
       style="max-width: 200px;">
  
  <p><strong>Includes:</strong></p>
  <ul>
    <li>Mathematics Formula Sheets</li>
    <li>Science Revision Notes</li>
    <li>Past Paper Solutions</li>
  </ul>
  
  <a href="https://edusite.com/downloads?source=email" class="ad-button">
    Download Free (PDF)
  </a>
</div>
```

---

## **7. Technical Implementation** 🔧

### Email Sending Flow

```
1. Attendance Marked
   ↓
2. Check Subscription Plan
   - FREE/BASIC: No ads
   - PREMIUM/PLATINUM: With ads
   ↓
3. Fetch Matching Advertisement
   - Multi-factor scoring
   - Best match selected
   ↓
4. Check supportivePlatforms
   - If 'email' in array: ✅ Proceed
   - If not in array: 🚫 Skip email
   ↓
5. Determine Email Template
   - attendance_institute_with_ads
   - attendance_institute_no_ads
   - attendance_bookhire_with_ads
   - attendance_bookhire_no_ads
   ↓
6. Build Template Data
   - Attendance info
   - Advertisement data
   - Parent/student details
   ↓
7. Send to Email Service (Lambda)
   - Fire-and-forget async
   - 1-5ms response time
   - Background processing
   ↓
8. Email Service Renders HTML
   - Uses template engine
   - Injects ad components
   - Sends via SES/SMTP
```

### Performance

- **API Response**: 1-5ms (fire-and-forget)
- **Email Delivery**: 500-2000ms (background)
- **No Blocking**: API doesn't wait for email
- **No Redis/Queue**: Pure Node.js async

---

## **8. Advertisement Data Fields in Email** 📊

| Field | Source | HTML Element | Example | Required |
|-------|--------|--------------|---------|----------|
| **Title** | `adTitle` | `<h3>` | "Grade 10 Math Tuition" | ✅ Yes |
| **Content** | `adContent` | `<p>` | "Expert tutors..." | ✅ Yes |
| **Image URL** | `adImageUrl` | `<img src>` | "https://cdn.com/ad.jpg" | ⚠️ Optional |
| **Link URL** | `adLinkUrl` | `<a href>` | "https://site.com/enroll" | ⚠️ Optional |
| **Button Text** | `adButtonText` | `<a>` text | "Learn More" | ⚠️ Optional |
| **Sending URL** | `sendingUrl` | `<a href>` | "https://site.com/email-campaign" | 🆕 New |
| **Media Type** | `mediaType` | Determines format | "image", "pdf", "video" | ⚠️ Optional |

---

## **9. Email vs Other Channels** 📱

### What Makes Email Special for Ads

| Feature | Email | WhatsApp | SMS | Telegram |
|---------|-------|----------|-----|----------|
| **Rich HTML** | ✅ Yes | ⚠️ Limited | ❌ No | ⚠️ Basic |
| **Images** | ✅ Embedded | ✅ Attached | ❌ No | ✅ Attached |
| **Formatting** | ✅ Full CSS | ⚠️ Markdown | ❌ Plain | ⚠️ Markdown |
| **Links** | ✅ Multiple | ✅ Yes | ⚠️ One | ✅ Yes |
| **Buttons** | ✅ Styled | ❌ Text only | ❌ No | ⚠️ Inline |
| **PDF Attachments** | ✅ Yes | ✅ Yes | ❌ No | ✅ Yes |
| **Professional Look** | ✅ Best | ⚠️ Good | ❌ Poor | ⚠️ Good |
| **Cost** | 💰 Free | 💰 Free | 💰💰 Paid | 💰 Free |

### Best Use Cases for Email Ads

1. **Detailed Content**: Course descriptions, catalogs, brochures
2. **Visual Design**: Professional layouts, branding, multiple images
3. **Multiple Links**: Different call-to-action buttons
4. **Formal Communication**: B2B, educational institutions, certificates
5. **Long-form Content**: Articles, guides, reports
6. **Print-Ready**: PDF downloads, printable materials

---

## **10. Configuration** ⚙️

### Environment Variables

```env
# Email Service Configuration
EMAIL_SERVER_URL=https://your-lambda-function.amazonaws.com/send-email
EMAIL_API_URL=https://alternative-email-api.com/send
EMAIL_SERVER_AUTH_TOKEN=your-auth-token
AWS_LAMBDA_API_KEY=your-api-key

# Advertisement Configuration
IS_ADS_FROM_DB=true  # Fetch ads from database
DEFAULT_AD_URL=https://storage.googleapis.com/default-ad.jpg
DEFAULT_AD_TITLE=Your Company Name
DEFAULT_AD_CONTENT=Professional education services
DEFAULT_AD_SENDING_URL=https://yourcompany.com/landing

# Subscription Plan Configuration (in notification-packages.config)
PREMIUM.isAds=true  # Enable ads for PREMIUM
PREMIUM.channels=[email,whatsapp,sms,telegram]
```

### Advertisement Example with Email Support

```json
{
  "title": "Professional Development Course",
  "description": "Advance your career with our certified program",
  "mediaUrl": "https://cdn.com/course-banner.jpg",
  "sendingUrl": "https://institute.com/enroll?utm_source=email",
  "supportivePlatforms": ["email", "whatsapp"],
  "targetSubscriptionPlans": ["PREMIUM", "PLATINUM"],
  "targetUserTypes": ["USER"],
  "priority": 8,
  "startDate": "2025-01-01",
  "endDate": "2025-12-31",
  "maxSendings": 50000
}
```

---

## **Summary** ✨

### What Can Be Sent in Email with Ads:

✅ **Attendance Information**: Student, status, date, time, location  
✅ **Advertisement Title**: Eye-catching headline  
✅ **Advertisement Description**: Detailed content (unlimited length)  
✅ **Advertisement Image**: Full-width responsive image  
✅ **Multiple Links**: Landing URL, sending URL, buttons  
✅ **Rich HTML Formatting**: Colors, fonts, styling  
✅ **Professional Layout**: Branded templates  
✅ **Call-to-Action Buttons**: Styled, clickable  
✅ **Platform-Specific Content**: Email-optimized ads  
✅ **Tracking URLs**: UTM parameters for analytics  

### Performance:
- **Non-blocking**: Fire-and-forget async sending
- **Fast API**: 1-5ms response time
- **Reliable**: Background retry logic
- **Scalable**: No Redis/Queue dependency
