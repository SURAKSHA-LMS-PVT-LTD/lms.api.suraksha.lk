import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StructuredLecturesController } from './structured-lectures.controller';
import { StructuredLecturesAliasController } from './structured-lectures-alias.controller';
import { LecturesShortpathController } from './lectures-shortpath.controller';
import { StructuredLecturesService } from './structured-lectures.service';
import { StructuredLectureEntity } from './entities/structured-lecture.entity';
import { CloudStorageService } from '../../common/services/cloud-storage.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([StructuredLectureEntity])
  ],
  controllers: [StructuredLecturesController, StructuredLecturesAliasController, LecturesShortpathController],
  providers: [
    StructuredLecturesService,
    CloudStorageService
  ],
  exports: [StructuredLecturesService]
})
export class StructuredLecturesModule {}