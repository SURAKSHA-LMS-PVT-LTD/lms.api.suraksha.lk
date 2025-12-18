import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InstitueClassService } from './institue_class.service';
import { InstitueClassController } from './institue_class.controller';
import { InstituteClassEntity } from './entities/institue_class.entity';
import { InstituteClassRepository } from './repositories/institute-class.repository';
import { InstituteClassStudentModule } from '../../institute_class_modules/institute_class_student/institute_class_student.module';
import { ClassExistsPipe } from './pipes/class-exists.pipe';
import { UniqueClassCodePipe } from './pipes/unique-class-code.pipe';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { AccessValidationService } from '../../../auth/services/access-validation.service';
import { INSTITUTE_CLASS_REPOSITORY } from './constants/institute-class.constants';
import { AuthModule } from '../../../auth/auth.module';
import { JwtModule } from '@nestjs/jwt';
import { CacheModule } from '../../../common/modules/cache.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([InstituteClassEntity]),
    CacheModule,
    InstituteClassStudentModule,
    AuthModule,
    JwtModule,
  ],
  controllers: [InstitueClassController],
  providers: [
    InstitueClassService,
    {
      provide: INSTITUTE_CLASS_REPOSITORY,
      useClass: InstituteClassRepository,
    },
    InstituteClassRepository,
    JwtAuthGuard,
    AccessValidationService,
    ClassExistsPipe,
    UniqueClassCodePipe,
  ],
  exports: [
    InstitueClassService,
    INSTITUTE_CLASS_REPOSITORY,
    InstituteClassRepository,
  ],
})
export class InstitueClassModule {}
