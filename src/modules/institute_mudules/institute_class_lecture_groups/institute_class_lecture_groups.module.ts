import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InstituteClassLectureGroupsService } from './institute_class_lecture_groups.service';
import { InstituteClassLectureGroupsController } from './institute_class_lecture_groups.controller';
import { InstituteClassLectureGroupEntity } from './entities/institute_class_lecture_group.entity';

@Module({
  imports: [TypeOrmModule.forFeature([InstituteClassLectureGroupEntity])],
  controllers: [InstituteClassLectureGroupsController],
  providers: [InstituteClassLectureGroupsService],
  exports: [InstituteClassLectureGroupsService],
})
export class InstituteClassLectureGroupsModule {}
