import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InstituteClassLecturesService } from './institute_class_lectures.service';
import { InstituteClassLecturesController } from './institute_class_lectures.controller';
import { InstituteClassLectureEntity } from './entities/institute_class_lecture.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([InstituteClassLectureEntity]),
  ],
  controllers: [InstituteClassLecturesController],
  providers: [InstituteClassLecturesService],
  exports: [InstituteClassLecturesService],
})
export class InstituteClassLecturesModule {}
