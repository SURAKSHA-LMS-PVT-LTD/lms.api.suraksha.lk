# Service Timestamp Fix Tracker - 100% Coverage Required

## Status: IN PROGRESS

### ✅ COMPLETED (Timestamps Added)
1. `src/modules/user/user.service.ts` - User, Student, Parent, ReasonOfParentSkip
2. `src/modules/payment/services/payment.service.ts` - Payment 
3. `src/modules/institute/institute.service.ts` - Institute
4. `src/modules/user-card-management/services/card-order.service.ts` - Order

### 🔧 IN PROGRESS (Need Import + Timestamps)

#### Card Management Module
5. `src/modules/user-card-management/services/card-payment.service.ts`
   - Line 53: payment creation
   
6. `src/modules/user-card-management/services/card.service.ts`
   - Line 17: card creation

#### Payment Module
7. `src/modules/payment/services/institute-payment.service.ts`
   - Line 171: payment creation
   - Line 959: submission creation

8. `src/modules/payment/services/institute-class-subject-payment.service.ts`
   - Line 53: payment creation
   - Line 222: submission creation

#### Student/Parent Module
9. `src/modules/student/student.service.ts`
   - Line 197: student creation
   - Line 489: student creation

10. `src/modules/parent/parent.service.ts`
    - Line 98: parent creation
    - Line 268: parent creation

#### Subject Module
11. `src/modules/subject/subject.service.ts`
    - Line 34: subject creation
    - Line 64: subject creation

12. `src/modules/subject/services/student-subject.service.ts`
    - Line 57: assignment creation
    - Line 116: assignment creation

#### SMS Module  
13. `src/modules/sms/services/sms.service.ts`
    - Line 436: submission creation
    - Line 835: credentials creation

14. `src/modules/sms/services/sender-mask.service.ts`
    - Line 106: mask creation

15. `src/modules/sms/services/instant-sms.service.ts`
    - Line 68: campaign creation
    - Line 131: campaign creation
    - Line 380: credit creation
    - Line 417: credit creation

#### Structured Lectures
16. `src/modules/structured-lectures/structured-lectures.service.ts`
    - Line 56: lecture creation
    - Line 72: lecture creation
    - Line 247: lecture creation

#### Institute Users/Classes
17. `src/modules/institute_mudules/institue_user/institue_user.service.ts`
    - Line 197: institute user creation
    - Multiple assignment creations

18. `src/modules/institute_mudules/institue_class/institue_class.service.ts`
    - Line 33: class creation

19. `src/modules/institute_mudules/institue_lectures/institue_lectures.service.ts`
    - Line 24: lecture creation

#### Institute Class Subject Modules
20. `src/modules/institute_class_subject_modules/institute_class_subject_students/institute_class_subject_students.service.ts`
    - Multiple student enrollment creations

21. `src/modules/institute_class_subject_modules/institute_class_subject_lectures/institute_class_subject_lectures.service.ts`
    - Line 57: lecture creation
    - Line 388: lecture creation

22. `src/modules/institute_class_subject_modules/institute_class_subject_exams/institute_class_subject_exams.service.ts`
    - Line 99: exam creation

23. `src/modules/institute_class_subject_modules/institute_class_subject_homeworks/institute_class_subject_homeworks.service.ts`
    - Line 51: homework creation

24. `src/modules/institute_class_subject_modules/institute_class_subject_homeworks_submissions/institute_class_subject_homeworks_submissions.service.ts`
    - Line 36: submission creation
    - Line 379: submission creation

25. `src/modules/institute_class_subject_modules/institute_class_subject_resaults/institute_class_subject_resaults.service.ts`
    - Line 33: result creation
    - Line 255: result creation

#### Organization Module
26. `src/modules/organization/organization.service.ts`
    - Line 351: organization creation
    - Line 375: org user creation
    - Line 390: system user creation
    - Line 400: org user creation
    - Line 1199: institute user creation
    - Line 1358: institute user creation

#### Transportation Module
27. `src/modules/private-transportation/services/bookhire.service.ts`
    - Line 27: bookhire creation

28. `src/modules/private-transportation/services/bookhire-owner.service.ts`
    - Line 52: owner creation

29. `src/modules/private-transportation/services/student-bookhire-enrollment.service.ts`
    - Line 49: enrollment creation

#### Other Modules
30. `src/modules/advertisement/advertisement.service.ts`
    - Line 106: advertisement creation

31. `src/modules/institute_class_modules/institute_class_student/institute_class_student.service.ts`
    - Multiple enrollment creations

32. `src/modules/institute_class_exams/services/institute-class-exam.service.ts`
    - Line 36: exam creation

33. `src/modules/institute/services/optimized-institute.service.ts`
    - Line 198: institute creation

34. `src/modules/user/services/user-fcm-token.service.ts`
    - Line 46: FCM token creation

### Pattern to Apply to Each File:

```typescript
// 1. Add import at top:
import { now } from '../../../common/utils/timezone.util';

// 2. Before .create():
const timestamp = now();

// 3. In .create() call:
const entity = repository.create({
  // ... existing fields
  createdAt: timestamp,
  updatedAt: timestamp
});
```

### For Update Operations:
```typescript
entity.someField = newValue;
entity.updatedAt = now();
await repository.save(entity);
```

## Goal: 100% Coverage = All 34+ services fixed
