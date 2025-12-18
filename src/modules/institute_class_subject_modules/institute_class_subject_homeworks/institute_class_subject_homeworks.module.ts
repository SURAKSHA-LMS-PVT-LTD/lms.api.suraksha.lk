import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InstituteClassSubjectHomeworksService } from './institute_class_subject_homeworks.service';
import { InstituteClassSubjectHomeworksController } from './institute_class_subject_homeworks.controller';
import { InstituteClassSubjectHomework } from './entities/institute_class_subject_homework.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      InstituteClassSubjectHomework,
    ]),
  ],
  controllers: [InstituteClassSubjectHomeworksController],
  providers: [InstituteClassSubjectHomeworksService],
  exports: [InstituteClassSubjectHomeworksService],
})
export class InstituteClassSubjectHomeworksModule {}
