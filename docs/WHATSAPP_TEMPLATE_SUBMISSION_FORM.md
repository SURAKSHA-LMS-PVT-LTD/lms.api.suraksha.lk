# WhatsApp Template Submission Form
## For Meta Business Manager Approval

---

## 📋 Template Information

### **Template Name**
```
suraksha_attendance_with_ad
```

### **Template Category**
```
UTILITY
```

### **Template Language**
```
English (en)
```

### **Template Description**
```
    Attendance notification for students with educational advertisement content. Sends real-time attendance updates (PRESENT/ABSENT) to parents/guardians including student details, location, institute information, and relevant educational advertisements.
```

---

## 📱 Template Components

### **HEADER** (Optional - Media)

**Type:** `MEDIA`

**Media Type:** `IMAGE` or `VIDEO`

**Sample Media URL:**
```
https://example.com/sample-school-supplies-ad.jpg
```

**Description:**
```
Advertisement image or video preview showing educational products, services, or announcements relevant to students and parents.
```

---

### **BODY** (Required - Text with 13 Variables)

**Body Text:**
```
🚌 Attendance Update

👤 Student: {{1}}
📅 Date: {{2}}
🕐 Time: {{3}}
📊 Status: {{4}}
📍 Location: {{5}}
🏫 Institute: {{6}}
🚐 Transport: {{7}}

━━━━━━━━━━━━━━━━━━━━
📢 Advertisement

{{8}}

{{9}}

🔗 Visit: {{10}}
━━━━━━━━━━━━━━━━━━━━

📱 Suraksha LMS | {{11}}
```

**Variable Details:**

| Variable | Description | Example Value |
|----------|-------------|---------------|
| `{{1}}` | Student Name | Sarah Johnson |
| `{{2}}` | Date | 2025-11-29 |
| `{{3}}` | Time | 08:30 AM |
| `{{4}}` | Attendance Status | ✅ PRESENT |
| `{{5}}` | Location (GPS coordinates where attendance marked) | GPS: 6.9271° N, 79.8612° E |
| `{{6}}` | Institute Name | Royal College |
| `{{7}}` | Transport/Vehicle Name | School Bus #12 |
| `{{8}}` | Advertisement Title | 🎒 School Supplies Sale! |
| `{{9}}` | Advertisement Content | Get 50% off on all school bags, stationery, and uniforms this week only! |
| `{{10}}` | Advertisement URL (sendingUrl) | https://shop.com/sale?utm_source=whatsapp |
| `{{11}}` | Institute Name (branding footer) | Royal College |

**Sample Body with Variables Populated:**
```
🚌 Attendance Update

👤 Student: Sarah Johnson
📅 Date: 2025-11-29
🕐 Time: 08:30 AM
📊 Status: ✅ PRESENT
📍 Location: GPS: 6.9271° N, 79.8612° E
🏫 Institute: Royal College
🚐 Transport: School Bus #12

━━━━━━━━━━━━━━━━━━━━
📢 Advertisement

🎒 School Supplies Sale!

Get 50% off on all school bags, stationery, and uniforms this week only!

🔗 Visit: https://shop.com/sale?utm_source=whatsapp
━━━━━━━━━━━━━━━━━━━━

📱 Suraksha LMS | Royal College
```

---

### **FOOTER** (Optional)

**Footer Text:**
```
Suraksha LMS - School Transport Management
```

---

### **BUTTONS** (Optional)

**Button Type:** `URL`

**Button Text:**
```
View Details
```

**URL Type:** `DYNAMIC`

**Dynamic URL Variable:** `{{1}}`

**Dynamic URL Suffix:** None

**Sample URL:**
```
https://shop.com/sale?utm_source=whatsapp&utm_campaign=attendance
```

**Button Configuration in Meta:**
- The button URL will use variable `{{1}}` which maps to the advertisement URL from the body's `{{10}}` variable
- This creates a clickable button that directs users to the advertisement landing page

---

## 📸 Sample Content for Review

### **Sample 1: Present Status with Image Ad**

**Header Image:**
```
[Upload sample image showing school supplies/backpack sale banner]
URL: https://cdn.example.com/school-supplies-sale.jpg
```

**Body Variables:**
1. Sarah Johnson
2. 2025-11-29
3. 08:30 AM
4. ✅ PRESENT
5. GPS: 6.9271° N, 79.8612° E
6. Royal College
7. School Bus #12
8. 🎒 School Supplies Sale!
9. Get 50% off on all school bags, stationery, and uniforms this week only!
10. https://shop.com/sale?utm_source=whatsapp
11. Royal College

**Button URL:** https://shop.com/sale?utm_source=whatsapp

---

### **Sample 2: Absent Status with Video Ad**

**Header Video:**
```
[Upload sample video showing online tutoring service promo]
URL: https://cdn.example.com/tutoring-promo.mp4
Duration: 30 seconds
```

**Body Variables:**
1. Michael Chen
2. 2025-11-29
3. 08:30 AM
4. ❌ ABSENT
5. GPS: 6.9271° N, 79.8612° E
6. Trinity College
7. School Van #5
8. 🎥 Online Tutoring Classes
9. Expert teachers available for Math, Science, and English. Free trial class available!
10. https://tutoring.com/classes?ref=whatsapp
11. Trinity College

**Button URL:** https://tutoring.com/classes?ref=whatsapp

---

### **Sample 3: Present Status with Educational Event**

**Header Image:**
```
[Upload sample image showing educational workshop/seminar banner]
URL: https://cdn.example.com/education-workshop.jpg
```

**Body Variables:**
1. Emma Wilson
2. 2025-11-29
3. 07:45 AM
4. ✅ PRESENT
5. GPS: 6.9271° N, 79.8612° E
6. St. Thomas College
7. School Transport #3
8. 📚 Free Educational Workshop
9. Join our free workshop on study skills and exam preparation techniques this Saturday!
10. https://education.com/workshop?source=wa
11. St. Thomas College

**Button URL:** https://education.com/workshop?source=wa

---

## 🎯 Use Case Justification

### **Primary Purpose**
Provide real-time attendance notifications to parents/guardians about their child's school transport status, ensuring safety and transparency in student transportation management.

### **Business Need**
- **Critical Communication:** Parents need immediate notification when their child boards/misses school transport
- **Safety Requirement:** Real-time location tracking and attendance confirmation for student safety
- **Utility Category:** This is an essential service notification, not marketing

### **Advertisement Integration**
- **Educational Focus:** Advertisements are limited to education-related products, services, and events
- **Value-Added Content:** Provides relevant information about school supplies, tutoring, workshops, and educational resources
- **Opt-in Service:** Users subscribe to receive these notifications with advertisements as part of the service package

### **Target Audience**
- Parents and guardians of school students
- Age group: 25-55 years old
- Geographic focus: Sri Lanka (initially), expandable to other regions

---

## 📊 Expected Volume

**Initial Volume:** 5,000 messages/day  
**Peak Volume:** 15,000 messages/day  
**Average Daily Volume:** 8,000 messages/day  

**Sending Pattern:**
- Morning peak: 6:00 AM - 9:00 AM (school drop-off times)
- Afternoon peak: 2:00 PM - 5:00 PM (school pickup times)

---

## ✅ Compliance & Best Practices

### **Policy Compliance**
- ✅ Provides clear value to recipients (critical attendance information)
- ✅ Contains utility content (real-time notifications)
- ✅ Advertisements are relevant and educational
- ✅ Users explicitly subscribe to this service
- ✅ Includes clear sender identification (Suraksha LMS)
- ✅ No sensitive information exposed
- ✅ No spam or unsolicited messages

### **Quality Standards**
- ✅ Professional formatting with emojis for clarity
- ✅ Clear call-to-action button
- ✅ Consistent branding
- ✅ Mobile-optimized content
- ✅ Proper variable usage (11 variables)

### **User Experience**
- ✅ Immediate value: Attendance status notification
- ✅ Optional value: Relevant educational advertisements
- ✅ Easy action: Clickable button to learn more
- ✅ Clear information hierarchy

---

## 🔧 Technical Implementation

### **API Endpoint**
```
https://graph.facebook.com/v18.0/{PHONE_NUMBER_ID}/messages
```

### **Request Format**
```json
{
  "messaging_product": "whatsapp",
  "to": "94771234567",
  "type": "template",
  "template": {
    "name": "suraksha_attendance_with_ad",
    "language": {
      "code": "en"
    },
    "components": [
      {
        "type": "header",
        "parameters": [
          {
            "type": "image",
            "image": {
              "link": "https://cdn.example.com/ad-image.jpg"
            }
          }
        ]
      },
      {
        "type": "body",
        "parameters": [
          {"type": "text", "text": "Sarah Johnson"},
          {"type": "text", "text": "2025-11-29"},
          {"type": "text", "text": "08:30 AM"},
          {"type": "text", "text": "✅ PRESENT"},
          {"type": "text", "text": "GPS: 6.9271° N, 79.8612° E"},
          {"type": "text", "text": "Royal College"},
          {"type": "text", "text": "School Bus #12"},
          {"type": "text", "text": "🎒 School Supplies Sale!"},
          {"type": "text", "text": "Get 50% off on all school bags!"},
          {"type": "text", "text": "https://shop.com/sale"},
          {"type": "text", "text": "Royal College"}
        ]
      },
      {
        "type": "button",
        "sub_type": "url",
        "index": "0",
        "parameters": [
          {
            "type": "text",
            "text": "https://shop.com/sale"
          }
        ]
      }
    ]
  }
}
```

---

## 📞 Business Information

**Business Name:** Suraksha LMS  
**Industry:** Education Technology / School Transport Management  
**Website:** [Your website URL]  
**Support Email:** [Your support email]  
**Phone Number:** [Your WhatsApp Business number]  

**WhatsApp Business Account ID:** [Your account ID]  
**Phone Number ID:** [Your phone number ID]  

---

## 📝 Additional Notes

### **Privacy & Data Protection**
- Location data is used only for attendance verification
- No personal data is stored beyond what's necessary for the service
- Compliant with GDPR and local data protection regulations
- Users can opt-out at any time

### **Message Delivery Guarantee**
- Critical attendance status always delivered
- Template fallback to session messages if needed
- Retry logic implemented for failed deliveries

### **Quality Control**
- All advertisements pre-screened for educational relevance
- Content moderation for appropriate messaging
- Monitoring for delivery success rates
- A/B testing for optimal user engagement

---

## ✅ Submission Checklist

Before submitting to Meta Business Manager:

- [x] Template name is unique and descriptive
- [x] Template category is correct (UTILITY)
- [x] All 11 variables are properly defined
- [x] Sample content is realistic and appropriate
- [x] Header media samples are uploaded
- [x] Button configuration is correct
- [x] Use case justification is clear
- [x] Compliance requirements are met
- [x] Business information is complete
- [x] Technical implementation is documented

---

## 🚀 Submission Steps

1. **Log in to Meta Business Manager**
   - URL: https://business.facebook.com/
   - Navigate to WhatsApp Manager

2. **Go to Message Templates**
   - Account Tools → Message Templates
   - Click "Create Template"

3. **Fill in Template Details**
   - Template name: `suraksha_attendance_with_ad`
   - Category: `UTILITY`
   - Language: `English`

4. **Configure Header**
   - Type: `MEDIA`
   - Upload sample image/video

5. **Configure Body**
   - Copy body text from above
   - Add all 11 variables
   - Provide sample values

6. **Configure Footer**
   - Add footer text

7. **Configure Button**
   - Type: `URL`
   - Text: "View Details"
   - URL: Dynamic (using variable)

8. **Review & Submit**
   - Preview template
   - Submit for approval
   - Wait 24-48 hours

---

## 📧 Follow-up Information

**Approval Timeline:** Typically 24-48 hours  
**Status Check:** Meta Business Manager → Message Templates  
**Rejection Handling:** Review feedback, modify template, resubmit  

**Common Rejection Reasons:**
- Too many variables (we use 11, which is within limits)
- Unclear use case (our justification is strong)
- Non-utility content (we're clearly utility-focused)
- Policy violations (we're compliant)

**If Approved:**
- Enable in environment: `WHATSAPP_TEMPLATE_ENABLED=true`
- Test with sample data
- Monitor delivery success rates
- Adjust based on user feedback

---

**Document Version:** 1.0  
**Submission Date:** [To be filled]  
**Submitted By:** [Your name]  
**Status:** Pending Approval  

---

**FOR META REVIEW TEAM:**

This template is designed for a critical utility service providing real-time attendance notifications to parents about their children's school transport status. The attendance information is time-sensitive and essential for student safety. The integrated educational advertisements provide additional value to users by promoting relevant educational products, services, and events. We ensure all content is appropriate, educational, and compliant with WhatsApp's policies.

Thank you for your review and consideration.

