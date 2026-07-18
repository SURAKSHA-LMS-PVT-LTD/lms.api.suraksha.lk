# Live Lecture Recording - Complete Implementation Guide

## Overview
This guide documents critical features for live lecture recording, login handling, activity tracking, and watch history management across custom domains and subdomains.

## 1. Multi-Domain Login Architecture

### 1.1 Custom Domain / Subdomain Recording Access

**Flow:**
- Custom domain or subdomain → Show institute-specific video login page
- If user is enrolled → Allow access
- If user is any Suraksha LMS user → Allow access (second tab option)
- Guest access → Requires: name only (optional: phone, school, email)

**API Endpoints:**
```typescript
// Check access for recording
GET /lecture-tracking/recording/access/:urlId
// Returns:
{
  lectureId,
  title,
  accessLevel: 'enrolled' | 'suraksha_user' | 'guest',
  hasAccess: boolean,
  recordingUrl?: string, // Only if hasAccess=true
  instituteName,
  subdomain,
  customDomain
}
```

**Frontend Flow:**
1. Parse URL to detect subdomain/custom domain
2. If custom/subdomain → Show institute login form
3. If logged in globally → Show "Switch to Suraksha LMS" option
4. If guest → Show guest form (name required, email/phone optional)

### 1.2 Guest Access Mode
- Email field: **optional** (currently being enforced, should be optional)
- Phone field: **optional**
- Name field: **required**
- School field: **optional**

**Update in schema:**
```sql
-- Guest info should NOT have NOT NULL constraints on email
ALTER TABLE lecture_recording_sessions 
MODIFY COLUMN guest_email VARCHAR(255) NULL,
MODIFY COLUMN guest_phone VARCHAR(50) NULL;
```

---

## 2. Recording Player - Wall-Clock Time Tracking

### 2.1 Problem Fixed
- **Before**: Only showed video playback time (e.g., "13.86 seconds")
- **After**: Shows exact wall-clock time when user interacted

### 2.2 API Changes

**Recording Session Start:**
```typescript
POST /lecture-tracking/recording/session/start
Body: {
  lectureId: string,
  instituteId?: string,        // For determining user enrollment
  classId?: string,
  subjectId?: string,
  guestName?: string,
  guestEmail?: string,
  guestPhone?: string
}
Response: {
  sessionId,
  lectureId,
  userType: 'enrolled' | 'suraksha_user' | 'guest'  // NEW
}
```

**Record Activities with Wall-Clock Time:**
```typescript
POST /lecture-tracking/recording/heartbeat
Body: {
  sessionId: string,
  activities: Array<{
    type: 'PLAY' | 'PAUSE' | 'SEEK' | 'HEARTBEAT' | 'SPEED_CHANGE' | 'QUALITY_CHANGE' | 'FULLSCREEN_TOGGLE' | 'SUBTITLE_TOGGLE',
    videoTimestamp: number,    // Video playback time in seconds
    wallTime?: number | string, // Wall-clock time (ISO string or milliseconds)
    metadata?: {
      quality?: '1080p' | '720p' | '360p',
      speed?: 1 | 1.25 | 1.5 | 2,
      // Any other metadata
    }
  }>
}
```

**Example Usage (Frontend):**
```typescript
// When user plays video
await fetch('/lecture-tracking/recording/heartbeat', {
  method: 'POST',
  body: JSON.stringify({
    sessionId,
    activities: [
      {
        type: 'PLAY',
        videoTimestamp: 125.34, // Video is at 2:05
        wallTime: new Date().toISOString(), // Current wall time
        metadata: { quality: '1080p', speed: 1 }
      }
    ]
  })
});
```

### 2.3 Database Schema
```sql
-- lecture_recording_activities table
ALTER TABLE lecture_recording_activities ADD COLUMN:
- wall_clock_timestamp TIMESTAMP NULL  -- When user took action
- metadata JSON NULL                     -- Additional metadata (quality, speed, etc)

-- lecture_recording_sessions table
ALTER TABLE lecture_recording_sessions ADD COLUMN:
- user_type ENUM('enrolled', 'suraksha_user', 'guest') DEFAULT 'guest'
- backup_status ENUM('pending', 'completed', 'failed') DEFAULT 'pending'
- last_sync_time TIMESTAMP NULL
```

---

## 3. Activity Timeline & Watch History

### 3.1 Get Recording Session Timeline
**Endpoint:**
```typescript
GET /lecture-tracking/recording/session/{sessionId}/timeline
Response: {
  sessionId,
  userId,
  userType: 'enrolled' | 'suraksha_user' | 'guest',
  guestName,
  startTime,
  endTime,
  backupStatus: 'pending' | 'completed' | 'failed',
  lastSyncTime,
  totalWatchedSeconds,
  lastPositionSeconds,
  timeline: [
    {
      id,
      type: 'PLAY' | 'PAUSE' | 'SEEK' | ...,
      videoTime,      // Where in video user was
      wallTime,       // When user took action
      durationUntilNextMs,  // How long until next action (watch time)
      metadata: { quality, speed, ... },
      createdAt
    },
    // ... more activities
  ],
  activityCount
}
```

**Frontend Display (Timeline View):**
```
Timeline Bar (like GitHub commits):
─────────────────────────────────────────
0:00  1:00  2:00  3:00  4:00  5:00
  ●      ●●    ●            ●●
  
Click on marker to see:
- Action type (PLAY, PAUSE, SEEK)
- Exact wall time: "May 9, 2:45 PM"
- How long user watched: "Paused for 2m 34s"
- Video quality/speed metadata
```

### 3.2 Get Recording Watch History (Grouped by User Type)
**Endpoint:**
```typescript
GET /lecture-tracking/recording/{lectureId}/watch-history?userType=all
// userType: 'enrolled' | 'suraksha_user' | 'guest' | 'all'

Response: {
  enrolled: [
    {
      sessionId,
      userId,
      userName,
      userEmail,
      startTime,
      endTime,
      totalWatchedSeconds,
      lastPositionSeconds,
      durationMinutes,  // Total time (including pauses)
      activityCount,    // Number of user interactions
      backupStatus,
      ipAddress
    }
  ],
  suraksha_user: [ /* same structure */ ],
  guest: [ /* same structure */ ]
}
```

**Frontend Display:**
```
Recording Viewers
─────────────────────────────────────────
CLASS STUDENTS (4 viewers):
 ✓ Ahmed Hassan      Watched 45:23   |  Full watch
 ✓ Mariam Ali        Watched 12:45   |  Partial
 - Sana Khan         Not watched

SURAKSHA LMS USERS (2 viewers):
 • John Smith (john@example.com)  Watched 30:15

GUESTS (1 viewer):
 ◯ Farha              Watched 8:34 (guest)
```

---

## 4. Backup Status & Manual Sync

### 4.1 Backup Status Display
**Do NOT show to users:**
- Internal heartbeat data
- Sync protocol details

**DO show to users:**
- Green checkmark: "✅ Backup Complete"
- Yellow spinner: "⏳ Syncing..."
- Red X: "❌ Sync Failed"

**Example UI:**
```
Recording Activity Status:
──────────────────────────
Activities recorded: 23 events
Last backup: 2:45 PM (just now)    [✅ Complete]
Sync status: All caught up

Manual sync button: [🔄 Sync Now] (if backup is pending)
```

### 4.2 Manual Sync Endpoint
**Endpoint:**
```typescript
POST /lecture-tracking/recording/session/{sessionId}/sync
Response: {
  success: true,
  sessionId,
  backupStatus: 'completed',
  syncedAt,
  message: 'Activities synchronized successfully'
}
```

**Auto-Sync (Automatic):**
```typescript
// Called periodically (every 30 seconds or on session end)
POST /lecture-tracking/recording/auto-sync  // Admin endpoint
Response: {
  synced: 5,
  syncedAt: '2025-05-09T14:45:30Z'
}
```

---

## 5. Activity Visualization (GitHub-like)

### 5.1 Timeline View Components

**Data Structure:**
```typescript
interface ActivityTimeline {
  type: 'PLAY' | 'PAUSE' | 'SEEK' | 'SPEED_CHANGE' | 'QUALITY_CHANGE';
  videoTime: number;      // Position in video (seconds)
  wallTime: string;       // ISO timestamp
  durationUntilNext: number; // Milliseconds until next action
  metadata?: {
    quality?: string;
    speed?: number;
  };
}
```

**Frontend Component Example:**
```tsx
// RecordingActivityTimeline.tsx
export const RecordingActivityTimeline = ({ timeline, recordingDuration }) => {
  return (
    <div className="timeline-container">
      {/* Timeline bar */}
      <div className="timeline-bar">
        <svg width="100%" height="40">
          {/* Time markers: 0:00, 1:00, 2:00, etc */}
          {timeline.map((activity, idx) => (
            <g key={activity.id}>
              {/* Vertical line for each activity */}
              <line x={activity.videoTime / recordingDuration * 100}% y="0" />
              {/* Color by type: PLAY=blue, PAUSE=red, SEEK=green */}
              <circle cx={...} cy={20} r={4} fill={getColorByType(activity.type)} />
            </g>
          ))}
        </svg>
      </div>

      {/* Activity list */}
      <div className="activity-list">
        {timeline.map(activity => (
          <div className="activity-row" key={activity.id}>
            <span className="time">{formatTime(activity.videoTime)}</span>
            <span className="action">{activity.type}</span>
            <span className="wall-time">{activity.wallTime}</span>
            <span className="duration">
              {formatMs(activity.durationUntilNext)} until next action
            </span>
            {activity.metadata?.quality && (
              <span className="quality">{activity.metadata.quality}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
```

---

## 6. Frontend Integration Steps

### 6.1 Recording Player Updates

**In playback component (e.g., VideoPlayer.tsx):**
```typescript
class RecordingPlayer {
  private sessionId: string;
  private activityBuffer: ActivityEvent[] = [];
  private lastSyncTime: Date;

  async startSession(lectureId: string, instituteId: string, classId?: string) {
    const response = await fetch('/lecture-tracking/recording/session/start', {
      method: 'POST',
      body: JSON.stringify({
        lectureId,
        instituteId,
        classId,
        guestName: this.guestName // If guest
      })
    });
    this.sessionId = response.sessionId;
    this.userType = response.userType;
  }

  async onPlay() {
    this.recordActivity('PLAY', this.videoPlayer.currentTime);
  }

  async onPause() {
    this.recordActivity('PAUSE', this.videoPlayer.currentTime);
  }

  async onSeek(newTime: number) {
    this.recordActivity('SEEK', newTime);
  }

  async onQualityChange(newQuality: string) {
    this.recordActivity('QUALITY_CHANGE', this.videoPlayer.currentTime, {
      quality: newQuality
    });
  }

  private recordActivity(type: string, videoTime: number, metadata?: any) {
    this.activityBuffer.push({
      type,
      videoTimestamp: videoTime,
      wallTime: new Date().toISOString(),
      metadata
    });
    
    // Auto-sync every 30 seconds or 50 activities
    if (this.activityBuffer.length >= 50 || this.shouldSync()) {
      this.syncActivities();
    }
  }

  private async syncActivities() {
    if (!this.activityBuffer.length) return;
    
    await fetch('/lecture-tracking/recording/heartbeat', {
      method: 'POST',
      body: JSON.stringify({
        sessionId: this.sessionId,
        activities: this.activityBuffer
      })
    });
    
    this.activityBuffer = [];
    this.lastSyncTime = new Date();
  }

  async endSession() {
    await this.syncActivities(); // Final sync
    await fetch(`/lecture-tracking/recording/session/end`, {
      method: 'POST',
      body: JSON.stringify({
        sessionId: this.sessionId,
        lastPositionSeconds: this.videoPlayer.currentTime
      })
    });
  }
}
```

### 6.2 Watch History View

```tsx
// RecordingWatchHistory.tsx
export const RecordingWatchHistory = ({ lectureId, userType = 'all' }) => {
  const [data, setData] = React.useState(null);

  React.useEffect(() => {
    fetch(`/lecture-tracking/recording/${lectureId}/watch-history?userType=${userType}`)
      .then(r => r.json())
      .then(setData);
  }, [lectureId, userType]);

  return (
    <div className="watch-history">
      <section>
        <h3>Class Students ({data?.enrolled?.length || 0})</h3>
        {data?.enrolled?.map(viewer => (
          <div key={viewer.sessionId} className="viewer-card">
            <span className="name">{viewer.userName}</span>
            <span className="status">
              {viewer.backupStatus === 'completed' ? '✅' : '⏳'} Watched {viewer.totalWatchedSeconds}s
            </span>
          </div>
        ))}
      </section>

      <section>
        <h3>Suraksha LMS Users ({data?.suraksha_user?.length || 0})</h3>
        {data?.suraksha_user?.map(viewer => (...))}
      </section>

      <section>
        <h3>Guests ({data?.guest?.length || 0})</h3>
        {data?.guest?.map(viewer => (...))}
      </section>
    </div>
  );
};
```

---

## 7. Testing Checklist

- [ ] Record activities with wall-clock timestamps
- [ ] Verify timeline shows correct durations between actions
- [ ] Test custom domain redirect to institute login
- [ ] Test guest access with name-only requirement
- [ ] Verify watch history grouped by user type
- [ ] Test manual sync endpoint
- [ ] Test auto-sync (30-second interval)
- [ ] Verify backup status UI
- [ ] Test activity metadata (quality, speed)
- [ ] Verify guest email/phone are optional

---

## 8. Migration & Deployment

**Run migration:**
```bash
npm run migration:run
# Applies: EnhanceRecordingTrackingSchema migration
```

**Environment Variables:**
- No new environment variables required
- Existing recording feature flags still apply

---

## Database Changes Summary

### New Columns
```sql
lecture_recording_activities:
- wall_clock_timestamp TIMESTAMP NULL
- metadata JSON NULL

lecture_recording_sessions:
- user_type ENUM('enrolled', 'suraksha_user', 'guest')
- backup_status ENUM('pending', 'completed', 'failed')
- last_sync_time TIMESTAMP NULL
```

### New Indexes
- `IDX_recording_activities_wall_clock`
- `IDX_recording_sessions_user_type`
- `IDX_recording_sessions_backup_status`
- `IDX_recording_sessions_lecture_user_type`

---

## API Summary

### Public (No Auth)
- `GET /lecture-tracking/recording/access/:urlId` - Validate recording access
- `POST /lecture-tracking/recording/session/start` - Start session
- `POST /lecture-tracking/recording/session/end` - End session
- `POST /lecture-tracking/recording/heartbeat` - Record activities
- `GET /lecture-tracking/recording/session/:sessionId/timeline` - Get activity timeline
- `GET /lecture-tracking/recording/:lectureId/watch-history` - Get watch history
- `POST /lecture-tracking/recording/session/:sessionId/sync` - Manual sync

### Authenticated (JWT)
- `POST /lecture-tracking/recording/auto-sync` - Admin: Auto-sync pending

---

**Last Updated:** May 9, 2025  
**Implementation Status:** Backend complete, frontend integration needed
