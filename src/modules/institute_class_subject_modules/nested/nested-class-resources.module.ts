import { Module } from '@nestjs/common';
import { InstituteClassSubjectLecturesModule } from '../institute_class_subject_lectures/institute_class_subject_lectures.module';
import { InstituteClassSubjectExamsModule } from '../institute_class_subject_exams/institute_class_subject_exams.module';
import { InstituteClassSubjectHomeworksModule } from '../institute_class_subject_homeworks/institute_class_subject_homeworks.module';
import { InstituteClassSubjectHomeworksSubmissionsModule } from '../institute_class_subject_homeworks_submissions/institute_class_subject_homeworks_submissions.module';
import { InstituteClassSubjectResaultsModule } from '../institute_class_subject_resaults/institute_class_subject_resaults.module';
import { ClassLecturesController } from './class-lectures.controller';
import { ClassExamsController } from './class-exams.controller';
import { ClassHomeworksController } from './class-homeworks.controller';
import { ClassHomeworkSubmissionsController } from './class-homework-submissions.controller';
import { ClassResultsController } from './class-results.controller';

/**
 * NestedClassResourcesModule
 *
 * Exposes RESTful routes scoped under the institute → class hierarchy:
 *
 *   POST/GET   /institutes/:instituteId/classes/:classId/lectures
 *   GET/PATCH/DELETE /institutes/:instituteId/classes/:classId/lectures/:id
 *
 *   POST/GET   /institutes/:instituteId/classes/:classId/exams
 *   GET/PATCH/DELETE /institutes/:instituteId/classes/:classId/exams/:id
 *
 *   POST/GET   /institutes/:instituteId/classes/:classId/homeworks
 *   GET/PATCH/DELETE /institutes/:instituteId/classes/:classId/homeworks/:id
 *
 *   POST/GET   /institutes/:instituteId/classes/:classId/homeworks/:homeworkId/submissions
 *   GET/PATCH/DELETE /institutes/:instituteId/classes/:classId/homeworks/:homeworkId/submissions/:id
 *
 *   POST/GET   /institutes/:instituteId/classes/:classId/results
 *   GET/PATCH/DELETE /institutes/:instituteId/classes/:classId/results/:id
 */
@Module({
  imports: [
    InstituteClassSubjectLecturesModule,
    InstituteClassSubjectExamsModule,
    InstituteClassSubjectHomeworksModule,
    InstituteClassSubjectHomeworksSubmissionsModule,
    InstituteClassSubjectResaultsModule,
  ],
  controllers: [
    ClassLecturesController,
    ClassExamsController,
    ClassHomeworksController,
    ClassHomeworkSubmissionsController,
    ClassResultsController,
  ],
})
export class NestedClassResourcesModule {}
