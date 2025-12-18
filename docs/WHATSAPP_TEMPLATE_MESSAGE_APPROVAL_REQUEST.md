# WhatsApp Template Message Approval Request

## Overview
This document provides the template structure to submit to **Meta Business** for WhatsApp Business API approval. Use this for **PREMIUM WhatsApp-only subscriptions** where template messages are required.

---

## 🎯 Template Purpose
**Attendance notifications with advertisements for Suraksha LMS**

---

## 📋 Template Details

### **Template Name**
```
suraksha_attendance_with_ad
```

### **Template Category**
```
UTILITY
```
*Reason: Provides essential attendance updates to parents/guardians*

### **Template Language**
```
English (en)
```

---

## 📱 Template Structure

### **Header (Optional - Media)**
- **Type**: IMAGE or VIDEO
- **Media URL**: Dynamic (advertisement media)
- **Description**: Advertisement image or video preview

### **Body (Required)**
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
📍 Ad Location: {{11}}
━━━━━━━━━━━━━━━━━━━━

📱 Suraksha LMS | {{12}} | {{13}}
```

### **Body Variables (13 placeholders)**
1. `{{1}}` - **Student Name** (e.g., "John Doe")
2. `{{2}}` - **Date** (e.g., "2025-11-29")
3. `{{3}}` - **Time** (e.g., "08:30 AM")
4. `{{4}}` - **Status** (e.g., "✅ PRESENT" or "❌ ABSENT")
5. `{{5}}` - **Location** (e.g., "GPS: 6.9271° N, 79.8612° E")
6. `{{6}}` - **Institute Name** (e.g., "Royal College")
7. `{{7}}` - **Transport Name** (e.g., "School Bus #12")
8. `{{8}}` - **Advertisement Title** (e.g., "🎒 School Supplies Sale!")
9. `{{9}}` - **Advertisement Content** (e.g., "Get 50% off on all school bags this week!")
10. `{{10}}` - **Advertisement URL** (e.g., "https://shop.com/sale?utm_source=whatsapp")
11. `{{11}}` - **Ad Location** (e.g., "Colombo District")
12. `{{12}}` - **Institute Name** (repeated for footer)
13. `{{13}}` - **Location** (repeated for footer)

### **Footer (Optional)**
```
Suraksha LMS - School Transport Management
```

### **Buttons (Optional)**
- **Type**: URL Button
- **Text**: "View Details"
- **URL**: `{{10}}` (Advertisement sending URL)

---

## 🔧 Implementation Code

### **TypeScript Implementation**
```typescript
private async sendWhatsAppTemplateMessage(
  phoneNumber: string,
  data: AttendanceNotificationData
): Promise<{ success: boolean; deliveryId?: string; error?: string }> {
  try {
    const statusIcon = data.attendanceStatus === 'PRESENT' ? '✅' : '❌';
    const statusText = data.attendanceStatus === 'PRESENT' ? 'PRESENT' : 'ABSENT';
    const adUrl = data.advertisementData?.sendingUrl || data.advertisementData?.mediaUrl || '';
    
    const templateData = {
      messaging_product: 'whatsapp',
      to: phoneNumber.replace('+', ''),
      type: 'template',
      template: {
        name: 'suraksha_attendance_with_ad',
        language: {
          code: 'en'
        },
        components: [
          // Header with media (if available)
          ...(data.advertisementData?.mediaUrl ? [{
            type: 'header',
            parameters: [
              {
                type: data.advertisementData.mediaType === 'video' ? 'video' : 'image',
                [data.advertisementData.mediaType === 'video' ? 'video' : 'image']: {
                  link: data.advertisementData.mediaUrl
                }
              }
            ]
          }] : []),
          
          // Body with all variables
          {
            type: 'body',
            parameters: [
              { type: 'text', text: data.studentName },                          // {{1}}
              { type: 'text', text: data.date },                                 // {{2}}
              { type: 'text', text: data.time },                                 // {{3}}
              { type: 'text', text: `${statusIcon} ${statusText}` },            // {{4}}
              { type: 'text', text: data.location || 'Not specified' },         // {{5}}
              { type: 'text', text: data.instituteName || 'School' },           // {{6}}
              { type: 'text', text: data.bookhireName || 'Transport' },         // {{7}}
              { type: 'text', text: data.advertisementData?.title || '' },      // {{8}}
              { type: 'text', text: data.advertisementData?.content || '' },    // {{9}}
              { type: 'text', text: adUrl },                                     // {{10}}
              { type: 'text', text: data.location || 'N/A' },                   // {{11}}
              { type: 'text', text: data.instituteName || 'School' },           // {{12}}
              { type: 'text', text: data.location || 'N/A' }                    // {{13}}
            ]
          },
          
          // Button (optional - if URL available)
          ...(adUrl ? [{
            type: 'button',
            sub_type: 'url',
            index: '0',
            parameters: [
              {
                type: 'text',
                text: adUrl
              }
            ]
          }] : [])
        ]
      }
    };

    const response = await fetch(
      `https://graph.facebook.com/v18.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(templateData)
      }
    );

    const result = await response.json();

    if (response.ok && result.messages) {
      this.logger.log(`✅ WhatsApp template message sent`);
      return {
        success: true,
        deliveryId: result.messages[0]?.id
      };
    }

    this.logger.error(`❌ Template message failed: ${result.error?.message}`);
    return {
      success: false,
      error: result.error?.message || 'Template message failed'
    };

  } catch (error) {
    this.logger.error(`❌ WhatsApp template error: ${error.message}`);
    return {
      success: false,
      error: (error as Error).message
    };
  }
}
```

---

## 📝 Submission Process

### **Step 1: Access Meta Business Manager**
1. Go to: https://business.facebook.com/
2. Navigate to **WhatsApp Manager**
3. Select your **WhatsApp Business Account**

### **Step 2: Create Template**
1. Go to **Account Tools** → **Message Templates**
2. Click **Create Template**
3. Choose template name: `suraksha_attendance_with_ad`
4. Select category: **UTILITY**
5. Select language: **English**

### **Step 3: Configure Header**
1. **Type**: Media
2. **Media Type**: Image or Video (select based on your needs)
3. **Sample**: Upload a sample advertisement image/video

### **Step 4: Configure Body**
1. Copy the body text from above
2. Add 11 variables using the `{{}}` syntax
3. Provide sample values for each variable:
   - Student Name: "John Doe"
   - Date: "2025-11-29"
   - Time: "08:30 AM"
   - Status: "✅ PRESENT"
   - Location: "GPS: 6.9271° N, 79.8612° E"
   - Institute: "Royal College"
   - Transport: "School Bus #12"
   - Ad Title: "🎒 School Supplies Sale!"
   - Ad Content: "Get 50% off on all school bags!"
   - Ad URL: "https://shop.com/sale"
   - Institute (footer): "Royal College"

### **Step 5: Configure Footer (Optional)**
```
Suraksha LMS - School Transport Management
```

### **Step 6: Configure Buttons (Optional)**
1. **Button Type**: URL
2. **Button Text**: "View Details"
3. **URL Type**: Dynamic
4. **URL Variable**: Use variable {{10}} (advertisement URL)

### **Step 7: Submit for Review**
1. Review your template
2. Click **Submit**
3. Wait for Meta approval (typically 24-48 hours)

---

## ⚙️ Environment Configuration

### **Required Environment Variables**
```bash
# WhatsApp Business API Configuration
WHATSAPP_ACCESS_TOKEN=your_access_token_here
WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id_here
WHATSAPP_TEMPLATE_ENABLED=true

# Enable template messages for WhatsApp-only subscriptions
TEMPLATE_WHATSAPP_ENABLED=true
```

---

## 🎯 Subscription Plan Logic

### **PREMIUM (WhatsApp-only)**
- **Channels**: WhatsApp only
- **Message Type**: Template message (requires approval)
- **Cost**: Per template message charges apply
- **Use Case**: Parents who prefer WhatsApp-only communication

### **PLATINUM (Multiple channels)**
- **Channels**: SMS, WhatsApp, Telegram, Email, Push
- **Message Type**: Session message (free within 24hr window)
- **Cost**: Free for session messages
- **Use Case**: Comprehensive notification package

### **Logic Flow**
```typescript
const isWhatsAppOnly = subscriptionPlan === 'PREMIUM' && 
                      channels.length === 1 && 
                      channels[0] === 'whatsapp';

if (isWhatsAppOnly && process.env.WHATSAPP_TEMPLATE_ENABLED === 'true') {
  // Use template message
  await sendWhatsAppTemplateMessage(phoneNumber, data);
} else {
  // Use session message (free)
  await sendWhatsAppSessionMessage(phoneNumber, message, advertisementData);
}
```

---

## 📊 Message Format Examples

### **Example 1: Present Attendance with Advertisement**
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

Get 50% off on all school bags, stationery, and uniforms this week only! Visit our store or shop online.

🔗 Visit: https://shop.com/sale?utm_source=whatsapp&utm_campaign=attendance
📍 Ad Location: Colombo District
━━━━━━━━━━━━━━━━━━━━

📱 Suraksha LMS | Royal College | Colombo
```

### **Example 2: Absent Attendance with Video Ad**
```
🚌 Attendance Update

👤 Student: Michael Chen
📅 Date: 2025-11-29
🕐 Time: 08:30 AM
📊 Status: ❌ ABSENT
📍 Location: GPS: 6.9271° N, 79.8612° E
🏫 Institute: Trinity College
🚐 Transport: School Van #5

━━━━━━━━━━━━━━━━━━━━
📢 Advertisement

🎥 Online Tutoring Classes

Expert teachers available for Math, Science, and English. Free trial class available! Watch our video to learn more.

🔗 Visit: https://tutoring.com/classes?ref=wa
📍 Ad Location: Kandy District
━━━━━━━━━━━━━━━━━━━━

📱 Suraksha LMS | Trinity College | Kandy
```

---

## 🔍 Testing & Validation

### **Test Template Before Production**
```bash
# Test with sample data
curl -X POST "https://graph.facebook.com/v18.0/PHONE_NUMBER_ID/messages" \
  -H "Authorization: Bearer ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "messaging_product": "whatsapp",
    "to": "94771234567",
    "type": "template",
    "template": {
      "name": "suraksha_attendance_with_ad",
      "language": { "code": "en" },
      "components": [
        {
          "type": "body",
          "parameters": [
            {"type": "text", "text": "Test Student"},
            {"type": "text", "text": "2025-11-29"},
            {"type": "text", "text": "08:30 AM"},
            {"type": "text", "text": "✅ PRESENT"},
            {"type": "text", "text": "Test Location"},
            {"type": "text", "text": "Test School"},
            {"type": "text", "text": "Test Bus"},
            {"type": "text", "text": "Test Ad Title"},
            {"type": "text", "text": "Test Ad Content"},
            {"type": "text", "text": "https://test.com"},
            {"type": "text", "text": "Test Location"},
            {"type": "text", "text": "Test School"},
            {"type": "text", "text": "Test Location"}
          ]
        }
      ]
    }
  }'
```

---

## 📈 Cost Analysis

### **Template Messages (PREMIUM WhatsApp-only)**
- **Cost**: ~$0.005 - $0.01 per message (varies by country)
- **Use When**: WhatsApp is the ONLY channel
- **Benefit**: Guaranteed delivery, professional appearance

### **Session Messages (PLATINUM/Multi-channel)**
- **Cost**: FREE within 24-hour customer service window
- **Use When**: User has multiple notification channels
- **Benefit**: Cost-effective, interactive, rich media support

### **Cost Optimization Strategy**
```
If user has PLATINUM → Use session messages (FREE)
If user has PREMIUM with WhatsApp-only → Use templates (paid, but required)
If user has other channels → Use session messages (FREE)
```

---

## 🚀 Deployment Checklist

- [ ] Submit template to Meta Business Manager
- [ ] Wait for template approval (24-48 hours)
- [ ] Set `WHATSAPP_TEMPLATE_ENABLED=true` in environment
- [ ] Set `WHATSAPP_ACCESS_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID`
- [ ] Test template with sample data
- [ ] Monitor template delivery success rate
- [ ] Configure fallback to session messages if template fails
- [ ] Update subscription plan logic in code
- [ ] Document template usage in API docs

---

## 📞 Support & Resources

- **Meta WhatsApp Business API**: https://developers.facebook.com/docs/whatsapp/cloud-api/
- **Template Guidelines**: https://developers.facebook.com/docs/whatsapp/message-templates/guidelines
- **Meta Business Support**: https://business.facebook.com/business/help

---

## 🔄 Template Update Process

If you need to modify the template:
1. Create a **new template version** (don't edit approved template)
2. Submit new version for approval
3. Once approved, update template name in code
4. Deprecate old template after testing new version

---

**Document Version**: 1.0  
**Last Updated**: November 29, 2025  
**Author**: Suraksha LMS Development Team
