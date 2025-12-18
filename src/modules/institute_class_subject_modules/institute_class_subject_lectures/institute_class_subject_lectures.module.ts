import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InstituteClassSubjectLecturesService } from './institute_class_subject_lectures.service';
import { InstituteClassSubjectLecturesController } from './institute_class_subject_lectures.controller';
import { InstituteClassSubjectLecture } from './entities/institute_class_subject_lecture.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([InstituteClassSubjectLecture]),
  ],
  controllers: [InstituteClassSubjectLecturesController],
  providers: [InstituteClassSubjectLecturesService],
  exports: [InstituteClassSubjectLecturesService],
})
export class InstituteClassSubjectLecturesModule {}
