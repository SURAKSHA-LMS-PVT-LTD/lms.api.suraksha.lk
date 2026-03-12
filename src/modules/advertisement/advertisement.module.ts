import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdvertisementController } from './advertisement.controller';
import { AdvertisementService } from './advertisement.service';
import { AdvertisementMatchingService } from './advertisement-matching.service';
import { AdvertisementEntity } from './entities/advertisement.entity';
import { UserEntity } from '../user/entities/user.entity';
import { StudentEntity } from '../student/entities/student.entity';
import { ParentEntity } from '../parent/entities/parent.entity';
import { InstituteUserEntity } from '../institute_mudules/institue_user/entities/institue_user.entity';
import { CloudStorageService } from '../../common/services/cloud-storage.service';
import { AdvertisementDeliveryService } from './services/advertisement-delivery.service';
import { AdvertisementCacheService } from './services/advertisement-cache.service';
import { SmsModule } from '../sms/sms.module';
import { CacheModule } from '../../common/modules/cache.module';
// Static import with forwardRef to resolve circular dependency (BUG-3 fix)
import { AttendanceModule } from '../attendance/attendance.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AdvertisementEntity,
      UserEntity,
      StudentEntity,
      ParentEntity,
      InstituteUserEntity,
    ]),
    SmsModule,
    CacheModule, // For advertisement caching with 12-hour TTL + daily 5 AM refresh
    forwardRef(() => AttendanceModule),
  ],
  controllers: [AdvertisementController],
  providers: [
    AdvertisementService, 
    AdvertisementMatchingService,
    AdvertisementDeliveryService,
    AdvertisementCacheService,
    CloudStorageService,
  ],
  exports: [
    AdvertisementService, 
    AdvertisementMatchingService, 
    AdvertisementDeliveryService,
    AdvertisementCacheService
  ],
})
export class AdvertisementModule {}
