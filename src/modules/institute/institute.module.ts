// src/modules/institute/institute.module.ts
import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InstitutesService } from './institute.service';
import { InstitutesController } from './institute.controller';
import { PublicInstitutesController } from './public-institute.controller';
import { InstituteCalendarController } from './institute-calendar.controller';
import { InstituteClassCalendarController } from './institute-class-calendar.controller';
import { InstituteClassSubjectCalendarController } from './institute-class-subject-calendar.controller';
import { InstituteEntity } from './entities/institute.entity';
import { InstituteOperatingConfigEntity } from './entities/institute-operating-config.entity';
import { InstituteCalendarDayEntity } from './entities/institute-calendar-day.entity';
import { InstituteCalendarEventEntity } from './entities/institute-calendar-event.entity';
import { InstituteClassCalendarEntity } from './entities/institute-class-calendar.entity';
import { InstitueClassService } from '../institute_mudules/institue_class/institue_class.service';
import { InstituteClassEntity } from '../institute_mudules/institue_class/entities/institue_class.entity';
import { InstituteClassRepository } from '../institute_mudules/institue_class/repositories/institute-class.repository';
import { InstituteCalendarService } from './services/institute-calendar.service';
import { CalendarDayCacheService } from './services/calendar-day-cache.service';
import { CacheModule } from '../../common/modules/cache.module';
import { CloudStorageService } from '../../common/services/cloud-storage.service';

// ── Public self-registration (/forms/:token) ──────────────────────────────────
import { InstituteRegistrationLinkEntity } from './entities/institute-registration-link.entity';
import { InstituteClassSubjectEntity } from '../institute_class_modules/institute_class_subject/entities/institute_class_subject.entity';
import { InstituteUserEntity } from '../institute_mudules/institue_user/entities/institue_user.entity';
import { UserEntity } from '../user/entities/user.entity';
import { StudentEntity } from '../student/entities/student.entity';
import { InstituteSelfRegistrationService } from './services/institute-self-registration.service';
import { PublicRegistrationController } from './public-registration.controller';
import { InstituteRegistrationLinksController } from './institute-registration-links.controller';
import { UsersModule } from '../user/user.module';
import { FeaturesModule } from '../features/features.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      InstituteEntity,
      InstituteClassEntity,
      InstituteOperatingConfigEntity,
      InstituteCalendarDayEntity,
      InstituteCalendarEventEntity,
      InstituteClassCalendarEntity,
      // Self-registration
      InstituteRegistrationLinkEntity,
      InstituteClassSubjectEntity,
      InstituteUserEntity,
      UserEntity,
      StudentEntity,
    ]),
    CacheModule,
    forwardRef(() => UsersModule), // InstituteAdminUserService + UserOtpService
    FeaturesModule, // smart-cards feature gate for public form config
  ],
  controllers: [
    InstitutesController,
    PublicInstitutesController,
    InstituteCalendarController,
    InstituteClassCalendarController,
    InstituteClassSubjectCalendarController,
    PublicRegistrationController,
    InstituteRegistrationLinksController,
  ],
  providers: [
    InstitutesService,
    InstitueClassService,
    InstituteClassRepository,
    InstituteCalendarService,
    CalendarDayCacheService,
    CloudStorageService,
    InstituteSelfRegistrationService,
  ],
  exports: [InstitutesService, InstituteCalendarService, CalendarDayCacheService], // Export calendar services for attendance module
})
export class InstituteModule {}
