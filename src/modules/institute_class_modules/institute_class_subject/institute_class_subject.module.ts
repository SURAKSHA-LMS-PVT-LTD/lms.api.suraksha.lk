import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InstituteClassSubjectService } from './institute_class_subject.service';
import { InstituteClassSubjectController, InstituteClassSubjectGlobalController } from './institute_class_subject.controller';
import { InstituteClassSubjectEntity } from './entities/institute_class_subject.entity';
import { InstituteClassSubjectRepository } from './repositories/institute-class-subject.repository';
import {
  InstituteClassSubjectValidationPipe,
  BulkInstituteClassSubjectValidationPipe,
  InstituteClassSubjectParamsValidationPipe,
} from './pipes/institute-class-subject-validation.pipe';
import { CacheModule } from '../../../common/modules/cache.module';
import { CloudStorageService } from '../../../common/services/cloud-storage.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([InstituteClassSubjectEntity]),
    CacheModule,
  ],
  controllers: [
    InstituteClassSubjectController,
    InstituteClassSubjectGlobalController,
  ],
  providers: [
    InstituteClassSubjectService,
    InstituteClassSubjectRepository,
    CloudStorageService,
    // Pipes
    InstituteClassSubjectValidationPipe,
    BulkInstituteClassSubjectValidationPipe,
    InstituteClassSubjectParamsValidationPipe,
  ],
  exports: [
    InstituteClassSubjectService,
    InstituteClassSubjectRepository,
  ],
})
export class InstituteClassSubjectModule {}
