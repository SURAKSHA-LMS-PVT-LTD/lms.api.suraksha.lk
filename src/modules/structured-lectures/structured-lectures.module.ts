import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StructuredLecturesController } from './structured-lectures.controller';
import { StructuredLecturesService } from './structured-lectures.service';
import { StructuredLectureEntity } from './entities/structured-lecture.entity';
import { CloudStorageService } from '../../common/services/cloud-storage.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([StructuredLectureEntity])
  ],
  controllers: [StructuredLecturesController],
  providers: [
    StructuredLecturesService,
    CloudStorageService
  ],
  exports: [StructuredLecturesService]
})
export class StructuredLecturesModule {}