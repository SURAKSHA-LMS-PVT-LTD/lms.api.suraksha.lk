import { ExamType, ExamStatus, ClassSection } from '../enums/exam.enum';

export interface CreateExamRequest {
  title: string;
  description?: string;
  instituteId: string;
  classId: string;
  examType: ExamType;
  startDate: Date;
  endDate: Date;
}

export interface ExamResponse {
  id: string;
  title: string;
  description?: string;
  instituteId: string;
  classId: string;
  examType: ExamType;
  status: ExamStatus;
  startDate: Date;
  endDate: Date;
  isResultsPublished: boolean;
  resultsPublishedDate?: Date;
  totalStudents: number;
  marksEnteredCount: number;
  completionPercentage?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface MarkEntryRequest {
  examId: string;
  studentId: string;
  subjectName: string;
  marksObtained: number;
  totalMarks?: number;
  remarks?: string;
}

export interface BulkMarkEntryRequest {
  examId: string;
  marks: MarkEntryRequest[];
}

export interface ExamResultSummary {
  examId: string;
  totalStudents: number;
  averageMarks: number;
  highestMarks: number;
  lowestMarks: number;
  passPercentage: number;
  subjectWiseStats: {
    [subjectName: string]: {
      average: number;
      highest: number;
      lowest: number;
      passRate: number;
    };
  };
}

export interface StudentResult {
  studentId: string;
  studentName: string;
  totalMarks: number;
  obtainedMarks: number;
  percentage: number;
  rank: number;
  subjects: {
    subjectName: string;
    marksObtained: number;
    totalMarks: number;
    percentage: number;
    remarks?: string;
  }[];
}
