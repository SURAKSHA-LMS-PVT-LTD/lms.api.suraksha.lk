import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InstitueUserService } from './institue_user.service';
import { InstitueUserController } from './institue_user.controller';
import { InstituteUserEntity } from './entities/institue_user.entity';
import { UserEntity } from '../../user/entities/user.entity';
import { StudentEntity } from '../../student/entities/student.entity';
import { ParentEntity } from '../../parent/entities/parent.entity';
import { InstituteEntity } from '../../institute/entities/institute.entity';
import { InstituteClassStudentEntity } from '../../institute_class_modules/institute_class_student/entities/institute_class_student.entity';
import { InstituteClassSubjectStudent } from '../../institute_class_subject_modules/institute_class_subject_students/entities/institute_class_subject_student.entity';
import { UserImageEntity } from '../../user/entities/user-image.entity';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { CommonModule } from '../../../common/common.module';
import { CacheModule } from '../../../common/modules/cache.module';
import { UsersModule } from '../../user/user.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      InstituteUserEntity,
      UserEntity,
      StudentEntity,
      ParentEntity,
      InstituteEntity,
      InstituteClassStudentEntity,
      InstituteClassSubjectStudent,
      UserImageEntity,
    ]),
    CommonModule,
    CacheModule,
    forwardRef(() => UsersModule)
  ],
  controllers: [InstitueUserController],
  providers: [
    InstitueUserService,
    JwtAuthGuard,
    // UsersService is provided by UsersModule (imported above) — no need to re-declare
  ],
  exports: [InstitueUserService]
})
export class InstitueUserModule {}
