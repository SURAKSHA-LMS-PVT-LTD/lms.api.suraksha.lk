/**
 * INSTITUTE CLASS EXAMS MODULE - USAGE EXAMPLES
 * 
 * This file contains practical examples of how to use the institute_class_exams module
 * for managing term tests with Google Sheets integration.
 */

import { ExamType } from '../enums/exam.enum';

// ====================================
// 1. CREATE TERM TEST EXAMPLES
// ====================================

/**
 * Example 1: Create a hybrid exam for Grade 10 students
 * This combines online and physical components
 */
export const createGrade10TermTest = {
  title: "Mathematics Term Test - Q1",
  description: "First quarter mathematics examination for Grade 10",
  instituteId: "inst_789",
  classId: "class_123",
  examType: ExamType.HYBRID,
  startDate: "2024-03-15T09:00:00.000Z",
  endDate: "2024-03-15T11:00:00.000Z"
};

/**
 * Example 2: Create online exam for Grade 8 students  
 * This will be conducted entirely online
 */
export const createGrade8OnlineExam = {
  title: "Science Online Assessment",
  description: "Interactive online science assessment",
  instituteId: "inst_789", 
  classId: "class_456",
  examType: ExamType.ONLINE,
  startDate: "2024-03-20T14:00:00.000Z",
  endDate: "2024-03-20T15:30:00.000Z"
};

/**
 * Example 3: Create physical exam for Grade 12 students
 * This will be conducted in traditional classroom setting
 */
export const createGrade12PhysicalExam = {
  title: "Physics Board Preparation Test",
  description: "Board examination preparation test for physics",
  instituteId: "inst_789",
  classId: "class_789", 
  examType: ExamType.PHYSICAL,
  startDate: "2024-04-01T10:00:00.000Z",
  endDate: "2024-04-01T13:00:00.000Z"
};

// ====================================
// 2. MARK ENTRY EXAMPLES
// ====================================

/**
 * Individual mark entry example
 */
export const singleMarkEntry = {
  examId: "exam_123",
  studentId: "stu_001",
  subjectName: "Mathematics", 
  marksObtained: 85,
  totalMarks: 100,
  remarks: "Good understanding of concepts"
};

/**
 * Bulk mark entry example for multiple students in same subject
 */
export const bulkMarkEntryMath = {
  examId: "exam_123",
  marks: [
    {
      examId: "exam_123",
      studentId: "stu_001",
      subjectName: "Mathematics",
      marksObtained: 85,
      totalMarks: 100,
      remarks: "Excellent work"
    },
    {
      examId: "exam_123", 
      studentId: "stu_002",
      subjectName: "Mathematics",
      marksObtained: 92,
      totalMarks: 100,
      remarks: "Outstanding performance"
    },
    {
      examId: "exam_123",
      studentId: "stu_003", 
      subjectName: "Mathematics",
      marksObtained: 78,
      totalMarks: 100,
      remarks: "Good effort, needs practice"
    }
  ]
};

/**
 * Bulk mark entry for multiple subjects
 */
export const bulkMarkEntryMultiSubject = {
  examId: "exam_123",
  marks: [
    // Mathematics marks
    {
      examId: "exam_123",
      studentId: "stu_001",
      subjectName: "Mathematics",
      marksObtained: 85,
      totalMarks: 100
    },
    {
      examId: "exam_123",
      studentId: "stu_001", 
      subjectName: "Physics",
      marksObtained: 88,
      totalMarks: 100
    },
    {
      examId: "exam_123",
      studentId: "stu_001",
      subjectName: "Chemistry", 
      marksObtained: 82,
      totalMarks: 100
    },
    // Next student
    {
      examId: "exam_123",
      studentId: "stu_002",
      subjectName: "Mathematics",
      marksObtained: 92,
      totalMarks: 100
    },
    {
      examId: "exam_123",
      studentId: "stu_002",
      subjectName: "Physics",
      marksObtained: 89,
      totalMarks: 100  
    },
    {
      examId: "exam_123",
      studentId: "stu_002",
      subjectName: "Chemistry",
      marksObtained: 95,
      totalMarks: 100
    }
  ]
};

// ====================================
// 3. API USAGE EXAMPLES
// ====================================

/**
 * Complete flow example using Axios (frontend) or HTTP client
 */
export const completeExamFlowExample = `
// 1. Create term test (Admin)
const createResponse = await axios.post('/institute-class-exams', {
  title: "Mathematics Term Test",
  instituteId: "inst_123",
  classId: "class_456", 
  examType: "HYBRID",
  startDate: "2024-03-15T09:00:00.000Z",
  endDate: "2024-03-15T11:00:00.000Z"
});

const examId = createResponse.data.data.id;

// 2. Enter marks (Teacher)
await axios.post(\`/institute-class-exams/\${examId}/marks\`, {
  studentId: "stu_001",
  subjectName: "Mathematics",
  marksObtained: 85,
  totalMarks: 100
});

// 3. Bulk enter marks (Teacher)
await axios.post(\`/institute-class-exams/\${examId}/marks/bulk\`, {
  marks: [
    { studentId: "stu_002", subjectName: "Mathematics", marksObtained: 92, totalMarks: 100 },
    { studentId: "stu_003", subjectName: "Mathematics", marksObtained: 78, totalMarks: 100 }
  ]
});

// 4. Publish results (Admin)
await axios.post(\`/institute-class-exams/\${examId}/publish-results\`, {
  sendNotifications: true
});

// 5. Get public URL for students
const publicUrlResponse = await axios.get(\`/institute-class-exams/\${examId}/public-url\`);
const publicUrl = publicUrlResponse.data.data.publicUrl;
`;

// ====================================
// 4. GOOGLE SHEETS TEMPLATE STRUCTURE
// ====================================

/**
 * Expected Google Sheets template structure
 */
export const templateStructureExample = `
Template Structure:
==================

Sheet Names:
- A (Class Section A)
- B (Class Section B) 
- C (Class Section C)
- D (Class Section D)
- E (Class Section E)
- F (Class Section F)
- G (Class Section G)
- H (Class Section H)
- I (Class Section I)
- J (Class Section J)
- Summary
- Basket Summary

Class Section Sheet Layout (A, B, C, etc.):
============================================
Row 1-7: Headers and metadata
Row 8 onwards: Student data

Column Structure:
- B8: First Student ID
- C8: First Student Name  
- D8: First Student Roll Number (optional)
- E8 onwards: Subject columns (Math, Physics, Chemistry, etc.)
- Last columns: Total, Percentage, Rank

Example:
B8: STU001    C8: John Doe     D8: 101    E8: [Math marks]    F8: [Physics marks]
B9: STU002    C9: Jane Smith   D9: 102    E9: [Math marks]    F9: [Physics marks]
B10: STU003   C10: Bob Johnson D10: 103   E10: [Math marks]   F10: [Physics marks]

Summary Sheet:
==============
- Overall class statistics
- Subject-wise analysis
- Top performers
- Grade distribution

Basket Summary Sheet:
=====================
- Cross-section comparison
- Overall exam statistics
- Institute-level metrics
`;

// ====================================
// 5. ERROR HANDLING EXAMPLES
// ====================================

/**
 * Common error scenarios and handling
 */
export const errorHandlingExamples = `
// 1. Exam not found
try {
  await examService.getExamById('invalid_exam_id');
} catch (error) {
  // error.message: 'Exam not found'
  // error.status: 404
}

// 2. Student not found in class
try {
  await examService.enterMarks({
    examId: 'valid_exam_id',
    studentId: 'invalid_student_id',
    subjectName: 'Mathematics',
    marksObtained: 85
  });
} catch (error) {
  // error.message: 'Student not found in this class'
}

// 3. Exam not active for mark entry
try {
  await examService.enterMarks({
    examId: 'completed_exam_id',
    studentId: 'stu_001', 
    subjectName: 'Mathematics',
    marksObtained: 85
  });
} catch (error) {
  // error.message: 'Exam is not active for mark entry'
}

// 4. Google Sheets API failure
try {
  await examService.createTermTest(createExamDto);
} catch (error) {
  // error.message: 'Google Sheets operation failed'
  // Check Google API credentials and permissions
}
`;

// ====================================
// 6. INTEGRATION WITH EXISTING MODULES
// ====================================

/**
 * How to integrate with existing institute and class modules
 */
export const integrationExample = `
// In your main app.module.ts
import { InstituteClassExamModule } from './modules/institute_class_exams';

@Module({
  imports: [
    // ... other modules
    InstituteClassExamModule,
  ],
})
export class AppModule {}

// In institute module, add exam relation
@Entity('institutes')
export class InstituteEntity {
  // ... existing fields
  
  @OneToMany(() => InstituteClassExamEntity, exam => exam.institute)
  exams: InstituteClassExamEntity[];
}

// In class module, add exam relation  
@Entity('institute_classes')
export class InstituteClassEntity {
  // ... existing fields
  
  @OneToMany(() => InstituteClassExamEntity, exam => exam.class)
  exams: InstituteClassExamEntity[];
}
`;

// ====================================
// 7. POSTMAN COLLECTION EXAMPLES
// ====================================

export const postmanExamples = {
  "info": {
    "name": "Institute Class Exams API",
    "description": "API collection for managing institute class examinations"
  },
  "item": [
    {
      "name": "Create Term Test",
      "request": {
        "method": "POST",
        "header": [
          {
            "key": "Content-Type",
            "value": "application/json"
          }
        ],
        "body": {
          "mode": "raw", 
          "raw": JSON.stringify(createGrade10TermTest)
        },
        "url": {
          "raw": "{{BASE_URL}}/institute-class-exams",
          "host": ["{{BASE_URL}}"],
          "path": ["institute-class-exams"]
        }
      }
    },
    {
      "name": "Enter Single Mark",
      "request": {
        "method": "POST",
        "header": [
          {
            "key": "Content-Type", 
            "value": "application/json"
          }
        ],
        "body": {
          "mode": "raw",
          "raw": JSON.stringify(singleMarkEntry)
        },
        "url": {
          "raw": "{{BASE_URL}}/institute-class-exams/{{EXAM_ID}}/marks",
          "host": ["{{BASE_URL}}"],
          "path": ["institute-class-exams", "{{EXAM_ID}}", "marks"]
        }
      }
    },
    {
      "name": "Bulk Enter Marks",
      "request": {
        "method": "POST",
        "header": [
          {
            "key": "Content-Type",
            "value": "application/json"
          }
        ],
        "body": {
          "mode": "raw",
          "raw": JSON.stringify(bulkMarkEntryMath)
        },
        "url": {
          "raw": "{{BASE_URL}}/institute-class-exams/{{EXAM_ID}}/marks/bulk",
          "host": ["{{BASE_URL}}"],
          "path": ["institute-class-exams", "{{EXAM_ID}}", "marks", "bulk"]
        }
      }
    }
  ]
};

export default {
  createGrade10TermTest,
  createGrade8OnlineExam,
  createGrade12PhysicalExam,
  singleMarkEntry,
  bulkMarkEntryMath,
  bulkMarkEntryMultiSubject,
  completeExamFlowExample,
  templateStructureExample,
  errorHandlingExamples,
  integrationExample,
  postmanExamples
};
