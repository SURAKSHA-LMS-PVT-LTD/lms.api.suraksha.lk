# Frontend Integration Guide - Consolidated Address Field (Latitude/Longitude)

## Overview

The attendance API has been updated to consolidate latitude and longitude into a single `address` object. This guide shows how to update your frontend to work with this new structure.

---

## Data Structure Change

### Before (Legacy - Still Supported)
```json
{
  "latitude": 6.927079,
  "longitude": 80.771141,
  "location": "Classroom A"
}
```

### After (New - Recommended)
```json
{
  "address": {
    "latitude": 6.927079,
    "longitude": 80.771141
  },
  "location": "Classroom A"
}
```

---

## API Endpoints

### 1. Mark Attendance (Single)
**POST** `/attendance/mark`

#### Request Payload (New Format)
```typescript
{
  "studentId": "STU001",
  "studentName": "John Doe",
  "instituteId": "INST001",
  "instituteName": "Primary School",
  "date": "2026-03-16",
  "status": "present",
  "address": {
    "latitude": 6.927079,
    "longitude": 80.771141
  },
  "location": "Classroom A",
  "markingMethod": "manual"
}
```

#### Response (Backward Compatible)
```typescript
{
  "success": true,
  "message": "Attendance marked successfully",
  "data": {
    "attendanceId": "...",
    "studentId": "STU001",
    "date": "2026-03-16",
    "status": "present",
    // ✅ New format - use this
    "address": {
      "latitude": 6.927079,
      "longitude": 80.771141
    },
    // ✅ Legacy fields (available for backward compatibility)
    "latitude": 6.927079,
    "longitude": 80.771141,
    "location": "Classroom A",
    "markedAt": "2026-03-16T10:30:00Z"
  }
}
```

### 2. Mark Bulk Attendance
**POST** `/attendance/mark-bulk`

#### Request Payload (New Format)
```typescript
{
  "instituteId": "INST001",
  "instituteName": "Primary School",
  "classId": "CLASS001",
  "className": "Grade 1",
  "date": "2026-03-16",
  "location": "Classroom A",
  "address": {
    "latitude": 6.927079,
    "longitude": 80.771141
  },
  "students": [
    {
      "studentId": "STU001",
      "studentName": "John Doe",
      "status": "present"
    },
    {
      "studentId": "STU002",
      "studentName": "Jane Smith",
      "status": "absent"
    }
  ]
}
```

### 3. Get Student Attendance
**POST** `/attendance/student`

#### Response (Backward Compatible)
```typescript
{
  "success": true,
  "message": "Student attendance retrieved successfully",
  "pagination": {...},
  "data": [
    {
      "attendanceId": "...",
      "studentId": "STU001",
      "date": "2026-03-16",
      "status": "present",
      // ✅ New format
      "address": {
        "latitude": 6.927079,
        "longitude": 80.771141
      },
      // ✅ Legacy fields (for backward compatibility)
      "latitude": 6.927079,
      "longitude": 80.771141,
      "location": "Classroom A",
      "markedAt": "2026-03-16T10:30:00Z"
    }
  ]
}
```

### 4. Get My Attendance
**GET** `/attendance/my?startDate=2026-03-01&endDate=2026-03-31`

#### Response (Backward Compatible)
```typescript
{
  "success": true,
  "message": "Attendance history retrieved successfully",
  "pagination": {...},
  "data": [
    {
      "date": "2026-03-16",
      "status": "present",
      "instituteId": "INST001",
      "instituteName": "Primary School",
      // ✅ New format
      "address": {
        "latitude": 6.927079,
        "longitude": 80.771141
      },
      // ✅ Legacy fields (for backward compatibility)
      "latitude": 6.927079,
      "longitude": 80.771141,
      "location": "Classroom A",
      "markedAt": "2026-03-16T10:30:00Z"
    }
  ]
}
```

---

## Frontend Code Examples

### React/TypeScript Example

#### 1. Sending Attendance with Location (Mark Single)

**Before (Legacy):**
```typescript
async function markAttendance(studentId: string, latitude: number, longitude: number) {
  const payload = {
    studentId,
    studentName: "John Doe",
    instituteId: "INST001",
    instituteName: "Primary School",
    date: new Date().toISOString().split('T')[0],
    status: "present",
    latitude,      // ❌ Old way
    longitude,     // ❌ Old way
    location: "Classroom A"
  };

  const response = await fetch('/attendance/mark', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  return response.json();
}
```

**After (New - Recommended):**
```typescript
async function markAttendance(studentId: string, latitude: number, longitude: number) {
  const payload = {
    studentId,
    studentName: "John Doe",
    instituteId: "INST001",
    instituteName: "Primary School",
    date: new Date().toISOString().split('T')[0],
    status: "present",
    address: {      // ✅ New way
      latitude,
      longitude
    },
    location: "Classroom A"
  };

  const response = await fetch('/attendance/mark', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  return response.json();
}
```

#### 2. Sending Bulk Attendance with Location

**Before (Legacy):**
```typescript
async function markBulkAttendance(
  students: StudentAttendance[],
  latitude: number,
  longitude: number
) {
  const payload = {
    instituteId: "INST001",
    instituteName: "Primary School",
    classId: "CLASS001",
    className: "Grade 1",
    date: new Date().toISOString().split('T')[0],
    latitude,           // ❌ Old way
    longitude,          // ❌ Old way
    location: "Classroom A",
    students
  };

  const response = await fetch('/attendance/mark-bulk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  return response.json();
}
```

**After (New - Recommended):**
```typescript
async function markBulkAttendance(
  students: StudentAttendance[],
  latitude: number,
  longitude: number
) {
  const payload = {
    instituteId: "INST001",
    instituteName: "Primary School",
    classId: "CLASS001",
    className: "Grade 1",
    date: new Date().toISOString().split('T')[0],
    address: {          // ✅ New way
      latitude,
      longitude
    },
    location: "Classroom A",
    students
  };

  const response = await fetch('/attendance/mark-bulk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  return response.json();
}
```

#### 3. Reading Attendance Records (Handle Both Formats)

**Best Practice - Handle Both Formats for Compatibility:**
```typescript
interface AttendanceRecord {
  date: string;
  status: string;
  // New format
  address?: {
    latitude?: number;
    longitude?: number;
  };
  // Legacy fields (for backward compatibility)
  latitude?: number;
  longitude?: number;
  location?: string;
}

function getCoordinates(record: AttendanceRecord) {
  // Try new format first
  if (record.address?.latitude !== undefined && record.address?.longitude !== undefined) {
    return {
      latitude: record.address.latitude,
      longitude: record.address.longitude,
      source: 'new'
    };
  }

  // Fall back to legacy format
  if (record.latitude !== undefined && record.longitude !== undefined) {
    return {
      latitude: record.latitude,
      longitude: record.longitude,
      source: 'legacy'
    };
  }

  return null;
}

// Usage
async function displayAttendanceRecords() {
  const response = await fetch('/attendance/my');
  const data = await response.json();

  data.data.forEach((record: AttendanceRecord) => {
    const coords = getCoordinates(record);
    if (coords) {
      console.log(`📍 Location: ${record.location}`);
      console.log(`   Latitude: ${coords.latitude}, Longitude: ${coords.longitude}`);
      console.log(`   (Using ${coords.source} format)`);

      // Show on map
      showOnMap(coords.latitude, coords.longitude);
    }
  });
}
```

#### 4. React Component Example

```typescript
import React, { useState, useEffect } from 'react';

interface AttendanceRecord {
  date: string;
  status: string;
  address?: { latitude?: number; longitude?: number };
  latitude?: number;
  longitude?: number;
  location?: string;
  markedAt?: string;
}

const AttendanceViewer: React.FC = () => {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAttendance();
  }, []);

  const fetchAttendance = async () => {
    try {
      const response = await fetch('/attendance/my?startDate=2026-03-01&endDate=2026-03-31');
      const data = await response.json();
      setRecords(data.data);
    } catch (error) {
      console.error('Failed to fetch attendance:', error);
    } finally {
      setLoading(false);
    }
  };

  const getCoordinates = (record: AttendanceRecord) => {
    // Try new format first
    if (record.address?.latitude !== undefined) {
      return {
        latitude: record.address.latitude,
        longitude: record.address.longitude
      };
    }

    // Fall back to legacy format
    if (record.latitude !== undefined) {
      return {
        latitude: record.latitude,
        longitude: record.longitude
      };
    }

    return null;
  };

  if (loading) return <div>Loading...</div>;

  return (
    <div className="attendance-list">
      {records.map((record, idx) => {
        const coords = getCoordinates(record);
        return (
          <div key={idx} className="attendance-card">
            <p><strong>Date:</strong> {record.date}</p>
            <p><strong>Status:</strong> {record.status}</p>
            {record.location && <p><strong>Location:</strong> {record.location}</p>}
            {coords && (
              <div className="location-coordinates">
                <p>📍 {coords.latitude.toFixed(4)}, {coords.longitude.toFixed(4)}</p>
              </div>
            )}
            {record.markedAt && <p><small>Marked: {new Date(record.markedAt).toLocaleString()}</small></p>}
          </div>
        );
      })}
    </div>
  );
};

export default AttendanceViewer;
```

#### 5. Getting User Location (with Geolocation API)

```typescript
async function getCurrentLocation(): Promise<{ latitude: number; longitude: number } | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      console.error('Geolocation not supported');
      resolve(null);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        });
      },
      (error) => {
        console.error('Geolocation error:', error);
        resolve(null);
      },
      {
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 0
      }
    );
  });
}

// Usage: Mark attendance with current location
async function markAttendanceWithCurrentLocation() {
  const location = await getCurrentLocation();

  const payload = {
    studentId: "STU001",
    studentName: "John Doe",
    instituteId: "INST001",
    instituteName: "Primary School",
    date: new Date().toISOString().split('T')[0],
    status: "present",
    address: location ? {
      latitude: location.latitude,
      longitude: location.longitude
    } : undefined,  // Optional, if location denied
    location: "Classroom A"
  };

  const response = await fetch('/attendance/mark', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  return response.json();
}
```

---

## Angular/TypeScript Example

```typescript
// attendance.service.ts
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

interface AttendancePayload {
  studentId: string;
  instituteId: string;
  instituteName: string;
  date: string;
  status: string;
  address?: {
    latitude?: number;
    longitude?: number;
  };
  location?: string;
}

interface AttendanceRecord {
  date: string;
  status: string;
  address?: { latitude?: number; longitude?: number };
  latitude?: number;  // Legacy
  longitude?: number; // Legacy
  location?: string;
}

@Injectable({ providedIn: 'root' })
export class AttendanceService {
  private apiUrl = '/attendance';

  constructor(private http: HttpClient) {}

  markAttendance(payload: AttendancePayload) {
    return this.http.post(`${this.apiUrl}/mark`, payload);
  }

  getMyAttendance(startDate: string, endDate: string) {
    return this.http.get<{ data: AttendanceRecord[] }>(
      `${this.apiUrl}/my?startDate=${startDate}&endDate=${endDate}`
    );
  }

  // Helper: Extract coordinates from record (handles both formats)
  getCoordinates(record: AttendanceRecord) {
    if (record.address?.latitude !== undefined) {
      return {
        latitude: record.address.latitude,
        longitude: record.address.longitude
      };
    }
    if (record.latitude !== undefined) {
      return {
        latitude: record.latitude,
        longitude: record.longitude
      };
    }
    return null;
  }

  // Helper: Get current location
  getCurrentLocation(): Promise<{ latitude: number; longitude: number } | null> {
    return new Promise((resolve) => {
      if ('geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            resolve({
              latitude: position.coords.latitude,
              longitude: position.coords.longitude
            });
          },
          () => resolve(null)
        );
      } else {
        resolve(null);
      }
    });
  }
}

// attendance.component.ts
import { Component, OnInit } from '@angular/core';
import { AttendanceService } from './attendance.service';

@Component({
  selector: 'app-attendance',
  templateUrl: './attendance.component.html',
  styleUrls: ['./attendance.component.css']
})
export class AttendanceComponent implements OnInit {
  attendanceRecords: any[] = [];

  constructor(private attendanceService: AttendanceService) {}

  ngOnInit() {
    this.loadAttendance();
  }

  async loadAttendance() {
    const startDate = '2026-03-01';
    const endDate = '2026-03-31';
    this.attendanceService.getMyAttendance(startDate, endDate).subscribe(
      (response) => {
        this.attendanceRecords = response.data;
      }
    );
  }

  async markAttendance() {
    const location = await this.attendanceService.getCurrentLocation();

    const payload = {
      studentId: 'STU001',
      instituteId: 'INST001',
      instituteName: 'Primary School',
      date: new Date().toISOString().split('T')[0],
      status: 'present',
      address: location ? {
        latitude: location.latitude,
        longitude: location.longitude
      } : undefined,
      location: 'Classroom A'
    };

    this.attendanceService.markAttendance(payload).subscribe(
      (response) => {
        console.log('Attendance marked:', response);
        this.loadAttendance();
      }
    );
  }

  getCoordinates(record: any) {
    return this.attendanceService.getCoordinates(record);
  }
}
```

---

## Vue.js Example

```typescript
// attendanceService.ts
import axios from 'axios';

const API_URL = '/attendance';

export interface AttendanceRecord {
  date: string;
  status: string;
  address?: { latitude?: number; longitude?: number };
  latitude?: number;
  longitude?: number;
  location?: string;
}

export const attendanceService = {
  markAttendance(payload: any) {
    return axios.post(`${API_URL}/mark`, payload);
  },

  getMyAttendance(startDate: string, endDate: string) {
    return axios.get(`${API_URL}/my`, {
      params: { startDate, endDate }
    });
  },

  getCoordinates(record: AttendanceRecord) {
    if (record.address?.latitude !== undefined) {
      return {
        latitude: record.address.latitude,
        longitude: record.address.longitude
      };
    }
    if (record.latitude !== undefined) {
      return {
        latitude: record.latitude,
        longitude: record.longitude
      };
    }
    return null;
  },

  getCurrentLocation(): Promise<{ latitude: number; longitude: number } | null> {
    return new Promise((resolve) => {
      navigator.geolocation?.getCurrentPosition(
        (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
        () => resolve(null)
      );
    });
  }
};

// AttendanceView.vue
<template>
  <div class="attendance-container">
    <button @click="markAttendance" :disabled="isMarking">
      {{ isMarking ? 'Marking...' : 'Mark Attendance' }}
    </button>

    <div class="attendance-list">
      <div v-for="record in records" :key="record.date" class="attendance-card">
        <p><strong>Date:</strong> {{ record.date }}</p>
        <p><strong>Status:</strong> {{ record.status }}</p>
        <p v-if="record.location"><strong>Location:</strong> {{ record.location }}</p>
        <div v-if="getCoordinates(record)" class="coordinates">
          📍 {{ getCoordinates(record).latitude.toFixed(4) }},
          {{ getCoordinates(record).longitude.toFixed(4) }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { attendanceService } from './attendanceService';

const records = ref<any[]>([]);
const isMarking = ref(false);

onMounted(() => {
  fetchAttendance();
});

const fetchAttendance = async () => {
  const response = await attendanceService.getMyAttendance('2026-03-01', '2026-03-31');
  records.value = response.data.data;
};

const markAttendance = async () => {
  isMarking.value = true;
  const location = await attendanceService.getCurrentLocation();

  const payload = {
    studentId: 'STU001',
    instituteId: 'INST001',
    instituteName: 'Primary School',
    date: new Date().toISOString().split('T')[0],
    status: 'present',
    address: location ? {
      latitude: location.latitude,
      longitude: location.longitude
    } : undefined,
    location: 'Classroom A'
  };

  await attendanceService.markAttendance(payload);
  isMarking.value = false;
  await fetchAttendance();
};

const getCoordinates = (record: any) => attendanceService.getCoordinates(record);
</script>
```

---

## Backward Compatibility Checklist

✅ **Your frontend will work with:**
- Old separate `latitude`/`longitude` fields (extracted from response)
- New consolidated `address` object (recommended)
- Mixed format during transition period

✅ **Migration Path:**
1. **Phase 1:** Add support for reading from `address` object
2. **Phase 2:** Update all code to send `address` object
3. **Phase 3:** Remove legacy `latitude`/`longitude` handling

---

## Common Patterns

### Handling Null/Undefined Coordinates

```typescript
function hasValidCoordinates(record: AttendanceRecord): boolean {
  const coords = getCoordinates(record);
  return coords !== null &&
         coords.latitude !== undefined &&
         coords.longitude !== undefined;
}

// Usage
records.forEach(record => {
  if (hasValidCoordinates(record)) {
    console.log('Show on map');
  } else {
    console.log('No GPS coordinates available');
  }
});
```

### Converting Decimal to DMS (Degrees, Minutes, Seconds)

```typescript
function decimalToDMS(decimal: number): string {
  const degrees = Math.floor(Math.abs(decimal));
  const minutes = Math.floor((Math.abs(decimal) - degrees) * 60);
  const seconds = ((Math.abs(decimal) - degrees) * 60 - minutes) * 60;

  return `${degrees}° ${minutes}' ${seconds.toFixed(2)}"`;
}

// Usage
const coords = getCoordinates(record);
if (coords) {
  console.log(`Latitude: ${decimalToDMS(coords.latitude)}`);
  console.log(`Longitude: ${decimalToDMS(coords.longitude)}`);
}
```

### Distance Calculation (Haversine Formula)

```typescript
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Usage: Check if attendance was marked within 100m of classroom
const classroomCoords = { latitude: 6.927079, longitude: 80.771141 };
const recordCoords = getCoordinates(record);

if (recordCoords) {
  const distance = calculateDistance(
    recordCoords.latitude,
    recordCoords.longitude,
    classroomCoords.latitude,
    classroomCoords.longitude
  );

  if (distance <= 0.1) { // 0.1 km = 100m
    console.log('✅ Marked from classroom');
  } else {
    console.log('⚠️ Marked from outside classroom (distance: ' + distance.toFixed(2) + 'km)');
  }
}
```

---

## Testing

### Unit Tests (Jest)

```typescript
describe('AttendanceCoordinates', () => {
  it('should read from new address format', () => {
    const record = {
      address: { latitude: 6.927079, longitude: 80.771141 }
    };
    const coords = getCoordinates(record);
    expect(coords).toEqual({ latitude: 6.927079, longitude: 80.771141 });
  });

  it('should read from legacy format', () => {
    const record = {
      latitude: 6.927079,
      longitude: 80.771141
    };
    const coords = getCoordinates(record);
    expect(coords).toEqual({ latitude: 6.927079, longitude: 80.771141 });
  });

  it('should prefer new format over legacy', () => {
    const record = {
      address: { latitude: 6.9, longitude: 80.7 },
      latitude: 5.0,
      longitude: 75.0
    };
    const coords = getCoordinates(record);
    expect(coords).toEqual({ latitude: 6.9, longitude: 80.7 });
  });

  it('should return null when no coordinates', () => {
    const record = { date: '2026-03-16' };
    const coords = getCoordinates(record);
    expect(coords).toBeNull();
  });
});
```

---

## Summary

| Aspect | Details |
|--------|---------|
| **Consolidation** | `latitude` + `longitude` → `address.latitude` + `address.longitude` |
| **Backward Compatibility** | ✅ Both formats work, new one recommended |
| **Migration Approach** | Gradual - start reading new format, then sending it |
| **Breaking Changes** | ❌ None - fully backward compatible |
| **Response Format** | Both `address` object and legacy separate fields included |

---

## Need Help?

See the main backend guide: `ATTENDANCE_SYSTEM_COMPLETE_GUIDE.md`
