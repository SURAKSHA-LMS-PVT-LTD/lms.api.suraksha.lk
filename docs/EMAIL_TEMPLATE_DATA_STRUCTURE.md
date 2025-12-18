# Email Template Data Structure - Complete Guide

## 📧 Email Template Types & Data Fields

### **4 Email Templates Required**

1. `attendance_institute_with_ads` - School/class attendance with advertisement
2. `attendance_institute_no_ads` - School/class attendance without advertisement
3. `attendance_bookhire_with_ads` - Transport/vehicle attendance with advertisement
4. `attendance_bookhire_no_ads` - Transport/vehicle attendance without advertisement

---

## **1. Institute Attendance With Ads**

### Template Name
`attendance_institute_with_ads`

### When Used
- Regular school/class attendance
- Subscription plan: PREMIUM, PLATINUM, or custom with ads enabled
- Advertisement available and platform includes 'email'

### Data Fields Available

```typescript
{
  // Parent Information
  parentName: "Mr. John Johnson",           // or "Parent/Guardian"
  
  // Student Information
  studentName: "Sarah Johnson",
  studentId: "STU-12345",
  status: "Present",                        // or "Absent"
  
  // Attendance Details
  date: "2025-11-29",
  time: "08:30 AM",
  place: "Trinity College - Grade 10A - Mathematics",
  markedBy: "System Administrator",
  locale: "en",
  
  // Institute Information
  instituteName: "Trinity College",
  
  // Status Message (Natural Language)
  statusMessage: "Your child Sarah Johnson arrived at Trinity College at 08:30 AM on 2025-11-29.",
  // or for absent:
  // "Your child Sarah Johnson was absent from Trinity College at 08:30 AM on 2025-11-29."
  
  // Advertisement Data
  adTitle: "Summer Camp 2024",
  adContent: "Join our exciting summer camp! Activities include sports, arts, and more.",
  adImageUrl: "https://cdn.example.com/summer-camp.jpg",
  adLinkUrl: "https://example.com/summer-camp",
  adButtonText: "Learn More",
  adMediaType: "image",                     // or "video", "pdf", "document"
  adSupportedPlatforms: "email, whatsapp"   // Optional
}
```

### Email Structure

```html
<!DOCTYPE html>
<html>
<head>
  <style>
    /* Professional email styling */
  </style>
</head>
<body>
  <div class="email-container">
    
    <!-- Header -->
    <div class="header">
      <h2>📚 Attendance Notification</h2>
    </div>
    
    <!-- Main Content -->
    <div class="content">
      <p>Dear {{parentName}},</p>
      
      <p class="status-message">{{statusMessage}}</p>
      
      <div class="attendance-details">
        <p><strong>Student:</strong> {{studentName}} ({{studentId}})</p>
        <p><strong>Status:</strong> {{status}}</p>
        <p><strong>Date:</strong> {{date}} at {{time}}</p>
        <p><strong>Location:</strong> {{place}}</p>
        <p><strong>Institute:</strong> {{instituteName}}</p>
      </div>
    </div>
    
    <!-- ADVERTISEMENT SECTION -->
    <div class="ad-section">
      <h3>🎯 Advertisement</h3>
      
      <!-- Ad Image (if available) -->
      {{#if adImageUrl}}
      <img src="{{adImageUrl}}" alt="{{adTitle}}" class="ad-image">
      {{/if}}
      
      <!-- Ad Title -->
      <h4>{{adTitle}}</h4>
      
      <!-- Ad Content -->
      <p>{{adContent}}</p>
      
      <!-- Ad Button (if link available) -->
      {{#if adLinkUrl}}
      <a href="{{adLinkUrl}}" class="ad-button">{{adButtonText}}</a>
      {{/if}}
    </div>
    
    <!-- Footer -->
    <div class="footer">
      <p>Best regards,<br>
      {{instituteName}}<br>
      Suraksha LMS</p>
    </div>
    
  </div>
</body>
</html>
```

---

## **2. Institute Attendance Without Ads**

### Template Name
`attendance_institute_no_ads`

### When Used
- Regular school/class attendance
- Subscription plan: FREE or BASIC (no ads)
- No advertisement section

### Data Fields Available

```typescript
{
  // Parent Information
  parentName: "Mr. John Johnson",
  
  // Student Information
  studentName: "Sarah Johnson",
  studentId: "STU-12345",
  status: "Present",                        // or "Absent"
  
  // Attendance Details
  date: "2025-11-29",
  time: "08:30 AM",
  place: "Trinity College - Grade 10A - Mathematics",
  markedBy: "System Administrator",
  locale: "en",
  
  // Institute Information
  instituteName: "Trinity College",
  
  // Status Message
  statusMessage: "Your child Sarah Johnson arrived at Trinity College at 08:30 AM on 2025-11-29."
}
```

### Email Structure

```html
<!DOCTYPE html>
<html>
<body>
  <div class="email-container">
    
    <!-- Header -->
    <div class="header">
      <h2>📚 Attendance Notification</h2>
    </div>
    
    <!-- Main Content -->
    <div class="content">
      <p>Dear {{parentName}},</p>
      
      <p class="status-message">{{statusMessage}}</p>
      
      <div class="attendance-details">
        <p><strong>Student:</strong> {{studentName}} ({{studentId}})</p>
        <p><strong>Status:</strong> {{status}}</p>
        <p><strong>Date:</strong> {{date}} at {{time}}</p>
        <p><strong>Location:</strong> {{place}}</p>
        <p><strong>Institute:</strong> {{instituteName}}</p>
      </div>
    </div>
    
    <!-- NO ADVERTISEMENT SECTION -->
    
    <!-- Footer -->
    <div class="footer">
      <p>Best regards,<br>
      {{instituteName}}<br>
      Suraksha LMS</p>
    </div>
    
  </div>
</body>
</html>
```

---

## **3. Transport/Vehicle Attendance With Ads**

### Template Name
`attendance_bookhire_with_ads`

### When Used
- Transport/bus/van attendance
- Student boarding or alighting from vehicle
- Subscription plan with ads enabled
- Advertisement available

### Data Fields Available

```typescript
{
  // Parent Information
  parentName: "Mrs. Emily Chen",
  
  // Student Information
  studentName: "Michael Chen",
  studentId: "STU-67890",
  status: "Present",                        // or "Absent"
  
  // Attendance Details
  date: "2025-11-29",
  time: "07:30 AM",
  place: "School Bus #12 - WP CAB-1234",
  markedBy: "System Administrator",
  locale: "en",
  
  // Transport Information
  bookhireName: "School Bus #12",
  vehicleNumber: "WP CAB-1234",
  driverName: "Transport Staff",
  pickupStatus: "boarded",                  // or "did not board"
  
  // Status Message (Natural Language)
  statusMessage: "Your child Michael Chen boarded School Bus #12 (WP CAB-1234) at 07:30 AM on 2025-11-29.",
  // or for absent:
  // "Your child Michael Chen did not board School Bus #12 (WP CAB-1234) at 07:30 AM on 2025-11-29."
  
  // Advertisement Data
  adTitle: "School Supplies Sale!",
  adContent: "Get 50% off on all school bags, stationery, and uniforms this week only!",
  adImageUrl: "https://cdn.example.com/school-supplies.jpg",
  adLinkUrl: "https://shop.com/sale",
  adButtonText: "Learn More",
  adMediaType: "image",
  adSupportedPlatforms: "email, whatsapp, sms"
}
```

### Email Structure

```html
<!DOCTYPE html>
<html>
<body>
  <div class="email-container">
    
    <!-- Header -->
    <div class="header">
      <h2>🚌 Transport Attendance Update</h2>
    </div>
    
    <!-- Main Content -->
    <div class="content">
      <p>Dear {{parentName}},</p>
      
      <p class="status-message">{{statusMessage}}</p>
      
      <div class="attendance-details">
        <p><strong>Student:</strong> {{studentName}} ({{studentId}})</p>
        <p><strong>Status:</strong> {{status}}</p>
        <p><strong>Date:</strong> {{date}} at {{time}}</p>
        <p><strong>Vehicle:</strong> {{bookhireName}}</p>
        <p><strong>Vehicle Number:</strong> {{vehicleNumber}}</p>
        <p><strong>Pickup Status:</strong> {{pickupStatus}}</p>
      </div>
    </div>
    
    <!-- ADVERTISEMENT SECTION -->
    <div class="ad-section">
      <h3>🎯 Advertisement</h3>
      
      {{#if adImageUrl}}
      <img src="{{adImageUrl}}" alt="{{adTitle}}" class="ad-image">
      {{/if}}
      
      <h4>{{adTitle}}</h4>
      <p>{{adContent}}</p>
      
      {{#if adLinkUrl}}
      <a href="{{adLinkUrl}}" class="ad-button">{{adButtonText}}</a>
      {{/if}}
    </div>
    
    <!-- Footer -->
    <div class="footer">
      <p>Best regards,<br>
      Transport Service Team<br>
      Suraksha LMS</p>
    </div>
    
  </div>
</body>
</html>
```

---

## **4. Transport/Vehicle Attendance Without Ads**

### Template Name
`attendance_bookhire_no_ads`

### When Used
- Transport attendance
- FREE or BASIC subscription (no ads)

### Data Fields Available

```typescript
{
  // Parent Information
  parentName: "Mrs. Emily Chen",
  
  // Student Information
  studentName: "Michael Chen",
  studentId: "STU-67890",
  status: "Present",
  
  // Attendance Details
  date: "2025-11-29",
  time: "07:30 AM",
  place: "School Bus #12 - WP CAB-1234",
  markedBy: "System Administrator",
  locale: "en",
  
  // Transport Information
  bookhireName: "School Bus #12",
  vehicleNumber: "WP CAB-1234",
  driverName: "Transport Staff",
  pickupStatus: "boarded",
  
  // Status Message
  statusMessage: "Your child Michael Chen boarded School Bus #12 (WP CAB-1234) at 07:30 AM on 2025-11-29."
}
```

### Email Structure

```html
<!DOCTYPE html>
<html>
<body>
  <div class="email-container">
    
    <!-- Header -->
    <div class="header">
      <h2>🚌 Transport Attendance Update</h2>
    </div>
    
    <!-- Main Content -->
    <div class="content">
      <p>Dear {{parentName}},</p>
      
      <p class="status-message">{{statusMessage}}</p>
      
      <div class="attendance-details">
        <p><strong>Student:</strong> {{studentName}} ({{studentId}})</p>
        <p><strong>Status:</strong> {{status}}</p>
        <p><strong>Date:</strong> {{date}} at {{time}}</p>
        <p><strong>Vehicle:</strong> {{bookhireName}}</p>
        <p><strong>Vehicle Number:</strong> {{vehicleNumber}}</p>
        <p><strong>Pickup Status:</strong> {{pickupStatus}}</p>
      </div>
    </div>
    
    <!-- NO ADVERTISEMENT SECTION -->
    
    <!-- Footer -->
    <div class="footer">
      <p>Best regards,<br>
      Transport Service Team<br>
      Suraksha LMS</p>
    </div>
    
  </div>
</body>
</html>
```

---

## **Key Differences Between Templates**

### **Institute vs Transport**

| Field | Institute Templates | Transport Templates |
|-------|-------------------|---------------------|
| **Header Icon** | 📚 | 🚌 |
| **Title** | "Attendance Notification" | "Transport Attendance Update" |
| **Institute Name** | ✅ Yes | ❌ No |
| **Vehicle Info** | ❌ No | ✅ Yes (bookhireName, vehicleNumber) |
| **Status Message** | "arrived at / was absent from" | "boarded / did not board" |
| **Footer Signature** | Institute Name | "Transport Service Team" |

### **With Ads vs Without Ads**

| Feature | With Ads | Without Ads |
|---------|----------|-------------|
| **Advertisement Section** | ✅ Yes | ❌ No |
| **Ad Image** | ✅ Optional | ❌ No |
| **Ad Title** | ✅ Yes | ❌ No |
| **Ad Content** | ✅ Yes | ❌ No |
| **Call-to-Action Button** | ✅ Optional | ❌ No |
| **Email Size** | Larger (~50-100KB) | Smaller (~10-20KB) |
| **Load Time** | Slower (images) | Faster |

---

## **Advertisement Data Fields Explained**

### **Required Fields**

```typescript
adTitle: string         // Advertisement headline
adContent: string       // Advertisement description/details
```

### **Optional Fields**

```typescript
adImageUrl: string      // Image/media URL (optional but recommended)
adLinkUrl: string       // Click-through URL (sendingUrl preferred)
adButtonText: string    // Button text (default: "Learn More")
adMediaType: string     // "image", "video", "pdf", "document"
adSupportedPlatforms: string  // "email, whatsapp, sms, telegram"
```

### **URL Priority Logic**

```typescript
// Backend automatically chooses the best URL
adLinkUrl = advertisementData.sendingUrl?.trim() || advertisementData.mediaUrl || '';

// sendingUrl: Preferred for click tracking
// mediaUrl: Fallback if sendingUrl not available
// empty string: No link/button shown
```

---

## **Email Styling Best Practices**

### **Advertisement Section CSS**

```css
.ad-section {
  border: 2px solid #007bff;
  border-radius: 8px;
  padding: 20px;
  margin: 20px 0;
  background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
}

.ad-image {
  max-width: 100%;
  height: auto;
  border-radius: 4px;
  margin-bottom: 15px;
}

.ad-button {
  display: inline-block;
  padding: 12px 24px;
  background: #007bff;
  color: white;
  text-decoration: none;
  border-radius: 4px;
  margin-top: 15px;
  font-weight: bold;
}

.ad-button:hover {
  background: #0056b3;
}
```

### **Mobile Responsive**

```css
@media only screen and (max-width: 600px) {
  .ad-section {
    padding: 15px;
  }
  
  .ad-button {
    display: block;
    text-align: center;
  }
}
```

---

## **Testing & Validation**

### **Test Data for Institute Attendance**

```json
{
  "parentName": "Mr. Test Parent",
  "studentName": "Test Student",
  "studentId": "TEST-001",
  "status": "Present",
  "date": "2025-11-29",
  "time": "08:30 AM",
  "place": "Test School - Grade 10A",
  "instituteName": "Test School",
  "statusMessage": "Your child Test Student arrived at Test School at 08:30 AM on 2025-11-29.",
  "adTitle": "Test Advertisement",
  "adContent": "This is a test advertisement content.",
  "adImageUrl": "https://via.placeholder.com/600x400",
  "adLinkUrl": "https://example.com",
  "adButtonText": "Learn More"
}
```

### **Test Data for Transport Attendance**

```json
{
  "parentName": "Mrs. Test Parent",
  "studentName": "Test Student",
  "studentId": "TEST-002",
  "status": "Present",
  "date": "2025-11-29",
  "time": "07:30 AM",
  "place": "School Bus #1 - TEST-123",
  "bookhireName": "School Bus #1",
  "vehicleNumber": "TEST-123",
  "pickupStatus": "boarded",
  "statusMessage": "Your child Test Student boarded School Bus #1 (TEST-123) at 07:30 AM on 2025-11-29.",
  "adTitle": "Test Transport Ad",
  "adContent": "This is a test ad for transport.",
  "adImageUrl": "https://via.placeholder.com/600x400",
  "adLinkUrl": "https://example.com"
}
```

---

## **Summary**

✅ **4 templates required** - Institute/Transport × With/Without Ads  
✅ **Natural language messages** - "boarded", "arrived at", "was absent from"  
✅ **Advertisement support** - Title, content, image, link, button  
✅ **Auto-detection** - System chooses correct template automatically  
✅ **Platform filtering** - Only sends if 'email' in supportivePlatforms  
✅ **Responsive design** - Mobile-friendly email layout  
✅ **Fire-and-forget** - Fast API response, background email delivery
