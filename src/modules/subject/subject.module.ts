import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SubjectService } from './subject.service';
import { SubjectController } from './subject.controller';
import { SubjectEntity } from './entities/subject.entity';
import { InstituteClassSubjectStudent } from '../institute_class_subject_modules/institute_class_subject_students/entities/institute_class_subject_student.entity';
import { SubjectRepository } from './repositories/subject.repository';
import { BasketSubjectService } from './services/basket-subject.service';
import { StudentSubjectService } from './services/student-subject.service';
import { AuthModule } from '../../auth/auth.module';
import { UsersModule } from '../user/user.module';
@Module({
  imports: [
    TypeOrmModule.forFeature([SubjectEntity, InstituteClassSubjectStudent]),
    AuthModule,
    UsersModule
  ],
  controllers: [SubjectController],
  providers: [SubjectService, SubjectRepository, BasketSubjectService, StudentSubjectService],
  exports: [SubjectService, SubjectRepository, BasketSubjectService, StudentSubjectService, TypeOrmModule],
})
export class SubjectModule {}
