# 🚀 User Cache Implementation Guide

## Overview

Comprehensive user caching system that automatically handles:
1. **Advertisement Matching** - User demographics, occupation, location for ad targeting
2. **Attendance Marking** - Institute enrollments with profile images and verification status
3. **Smart Invalidation** - Auto-refresh on user creation, enrollment, image verification

## Cache Structure

### 1. Full User Profile Cache
**Key:** `user:{userId}:full`  
**TTL:** 2 hours (7200 seconds)  
**Content:**
```typescript
{
  // Basic Identity
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber?: string;
  
  // Demographics (for ad matching)
  userType: string;              // STUDENT, PARENT, TEACHER
  subscriptionPlan?: string;     // FREE, BASIC, PREMIUM
  dateOfBirth?: string;
  age?: number;
  gender?: string;
  
  // Location (for geo-targeted ads)
  city?: string;
  district?: string;
  province?: string;
  country?: string;
  
  // Professional (for parent ad targeting)
  occupation?: string;           // "Software Engineer", "Doctor"
  workplace?: string;            // "Tech Company Ltd"
  educationLevel?: string;
  
  // Medical (for students)
  emergencyContact?: string;
  medicalConditions?: string;
  allergies?: string;
  
  // Images
  imageUrl?: string;             // Global profile image
  
  // Institute Enrollments (CRITICAL for attendance)
  institutes: [
    {
      instituteId: string;
      userIdByInstitute?: string;  // "STU2024001"
      instituteUserType: string;   // STUDENT, TEACHER, etc.
      status: string;              // ACTIVE, PENDING, INACTIVE
      
      // Image Priority Logic
      imageUrl: string;            // Final resolved image URL
      instituteUserImageUrl?: string;  // Institute-specific image
      globalImageUrl?: string;     // Fallback global image
      imageVerificationStatus: string; // VERIFIED, PENDING, REJECTED
      
      verifiedAt?: string;
      isAdmin: boolean;
      enrolledAt: string;
    }
  ]
}
```

## Auto-Invalidation Triggers

### 1. User Creation
**Location:** `user.service.ts` → `create()`  
**Action:** Warm cache immediately after user creation

```typescript
// After user creation (line ~220)
const savedEntity = await transactionQueryRunner.manager.save(UserEntity, user);

// 🔥 CACHE: Warm user cache immediately
try {
  await this.userCacheManager.getUserWithInstitutes(savedEntity.id);
} catch (cacheError) {
  // Don't fail user creation if cache warming fails
}
```

### 2. User Update
**Location:** `user.service.ts` → `update()`  
**Action:** Already implemented (line 948)

```typescript
// 🔄 CRITICAL FIX: Refresh user cache after profile update
try {
  await this.userManagementService.refreshUserCache(id);
} catch (cacheError) {
  // Don't fail the update if cache refresh fails
}
```

### 3. Institute Enrollment
**Location:** `institue_user.service.ts` → `assignUserToInstitute()`, `assignUserByPhone()`, etc.  
**Action:** Refresh user cache to include new enrollment

```typescript
// After enrollment save
await this.instituteUserRepository.save(instituteUser);

// 🔥 CACHE: Refresh user cache to include new institute
try {
  await this.userCacheManager.refreshUserCacheOnEnrollment(userId);
} catch (cacheError) {
  // Don't fail enrollment if cache refresh fails
}
```

### 4. Image Verification
**Location:** `institue_user.service.ts` → `verifyImageUpload()`, `rejectImageUpload()`  
**Action:** Update only institute-specific data without full rebuild

```typescript
// After image verification
await this.instituteUserRepository.update(
  { userId, instituteId },
  { 
    imageVerificationStatus: ImageVerificationStatus.VERIFIED,
    imageVerifiedBy: verifiedBy,
  }
);

// 🔥 CACHE: Update institute enrollment cache
try {
  await this.userCacheManager.updateInstituteEnrollmentCache(
    userId,
    instituteId,
    {
      imageVerificationStatus: 'VERIFIED',
      imageUrl: instituteUserImageUrl, // Updated image URL
      updatedAt: new Date().toISOString(),
    }
  );
} catch (cacheError) {
  // Don't fail verification if cache update fails
}
```

### 5. Status Changes
**Location:** `institue_user.service.ts` → `updateStatus()`  
**Action:** Refresh enrollment cache

```typescript
// After status update
await this.instituteUserRepository.update(
  { userId, instituteId },
  { status: newStatus }
);

// 🔥 CACHE: Update status in cache
try {
  await this.userCacheManager.updateInstituteEnrollmentCache(
    userId,
    instituteId,
    { status: newStatus }
  );
} catch (cacheError) {
  // Don't fail status update if cache fails
}
```

## Usage Examples

### For Advertisement Matching

```typescript
// In advertisement-matching.service.ts
async getMatchedAdvertisements(userId: string): Promise<AdvertisementMatch[]> {
  // ✅ Get cached user profile (includes occupation, location, demographics)
  const userProfile = await this.userCacheManager.getUserForAdMatching(userId);
  
  if (!userProfile) {
    throw new NotFoundException('User not found');
  }
  
  // Use cached data for matching
  const matches = advertisements.map(ad => 
    this.calculateMatchScore(ad, {
      userType: userProfile.userType,
      subscriptionPlan: userProfile.subscriptionPlan,
      occupation: userProfile.occupation,      // ✅ Cached from parent table
      city: userProfile.city,
      district: userProfile.district,
      age: userProfile.age,
      gender: userProfile.gender,
    })
  );
  
  return matches;
}
```

### For Attendance Marking

```typescript
// In attendance.service.ts
async markAttendance(dto: MarkAttendanceDto): Promise<any> {
  // ✅ Get user's enrollment with correct image URL
  const enrollment = await this.userCacheManager.getUserInstituteEnrollment(
    dto.studentId,
    dto.instituteId
  );
  
  if (!enrollment) {
    throw new NotFoundException('Student not enrolled in institute');
  }
  
  // Use correct image based on verification status
  const imageUrl = enrollment.imageUrl; // Already resolved by cache manager
  const isVerified = enrollment.imageVerificationStatus === 'VERIFIED';
  
  // Mark attendance with correct image
  const result = await this.dynamoAttendanceService.markAttendance({
    ...dto,
    studentName: `${enrollment.firstName} ${enrollment.lastName}`,
    imageUrl: imageUrl,
    imageVerificationStatus: enrollment.imageVerificationStatus,
  });
  
  return result;
}
```

### For Bulk Cache Warming (Background Jobs)

```typescript
// In jobs/cache-warmup-job.ts
async warmUserCaches(): Promise<void> {
  // Get all active students
  const activeStudents = await this.userRepository.find({
    where: { 
      userType: UserType.STUDENT,
      isActive: true,
    },
    select: ['id'],
  });
  
  const userIds = activeStudents.map(u => u.id);
  
  // Warm cache for all users in batches
  await this.userCacheManager.warmCacheForUsers(userIds);
  
  console.log(`✅ Warmed cache for ${userIds.length} users`);
}
```

## Implementation Checklist

### Phase 1: Core Integration ✅
- [x] Create `UserCacheManagerService`
- [x] Export from `CommonModule`
- [x] Re-enable Redis in `CacheService`

### Phase 2: Auto-Invalidation Hooks
- [ ] Add cache warming in `user.service.ts` → `create()` (after line 220)
- [ ] Add enrollment refresh in `institue_user.service.ts` → `assignUserToInstitute()`
- [ ] Add enrollment refresh in `institue_user.service.ts` → `assignUserByPhone()`
- [ ] Add enrollment refresh in `institue_user.service.ts` → `assignUserByEmail()`
- [ ] Add enrollment refresh in `institue_user.service.ts` → `assignUserById()`
- [ ] Add image update in `institue_user.service.ts` → `verifyImageUpload()`
- [ ] Add image update in `institue_user.service.ts` → `rejectImageUpload()`

### Phase 3: Service Integration
- [ ] Update `advertisement-matching.service.ts` to use cached user data
- [ ] Update `attendance.service.ts` to use cached enrollment data
- [ ] Update any other services that need user profile data

### Phase 4: Background Jobs
- [ ] Create `jobs/user-cache-warmup-job.ts` for daily cache warming
- [ ] Add to cron schedule or Cloud Scheduler

## Performance Benefits

### Advertisement Matching
**Before:** 
- Query user table → Query parent table → Query student table
- ~50ms per user lookup
- For 200 ads × 1 user = 50ms × 200 = 10 seconds

**After:**
- Redis cache hit → 1ms
- For 200 ads × 1 user = 1ms (cached lookup reused)
- **50x faster**

### Attendance Marking
**Before:**
- Query user table → Query institute_user table → Resolve image URLs
- ~30ms per attendance mark
- For 100 students = 3 seconds

**After:**
- Redis cache hit → 1ms
- For 100 students = 100ms
- **30x faster**

## Cache Hit Rate Expectations

- **User Profile:** >90% hit rate (users rarely change profile)
- **Institute Enrollments:** >95% hit rate (enrollments change rarely)
- **Image URLs:** >98% hit rate (images change very rarely)

## Monitoring

Check cache performance:
```bash
# Redis CLI
redis-cli -h redis-14461.c10.us-east-1-2.ec2.cloud.redislabs.com -p 14461 -a Skaveesha1355660@

# Check keys
KEYS user:*:full

# Check specific user cache
GET user:123:full

# Check cache size
DBSIZE

# Check memory usage
INFO memory
```

## Next Steps

1. **Test locally** with Redis enabled
2. **Add cache warming hooks** to user/enrollment creation
3. **Update advertisement matching** to use cached data
4. **Update attendance marking** to use cached enrollment data
5. **Deploy to production** and monitor cache hit rates
6. **Create background job** for cache warming during off-peak hours
