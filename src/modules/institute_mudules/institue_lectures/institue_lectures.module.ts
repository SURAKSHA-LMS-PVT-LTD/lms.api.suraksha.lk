import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InstitueLecturesService } from './institue_lectures.service';
import { InstitueLecturesController } from './institue_lectures.controller';
import { InstituteLectureEntity } from './entities/institue_lecture.entity';
import { InstituteLectureRepository } from './repositories/institute-lecture.repository';
import { LectureExistsPipe } from './pipes/lecture-exists.pipe';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { INSTITUTE_LECTURE_REPOSITORY } from './constants/institute-lecture.constants';

@Module({
  imports: [
    TypeOrmModule.forFeature([InstituteLectureEntity]),
  ],
  controllers: [InstitueLecturesController],
  providers: [
    InstitueLecturesService,
    {
      provide: INSTITUTE_LECTURE_REPOSITORY,
      useClass: InstituteLectureRepository,
    },
    InstituteLectureRepository,
    JwtAuthGuard,
    LectureExistsPipe,
  ],
  exports: [
    InstitueLecturesService,
    INSTITUTE_LECTURE_REPOSITORY,
    InstituteLectureRepository,
  ],
})
export class InstitueLecturesModule {}
