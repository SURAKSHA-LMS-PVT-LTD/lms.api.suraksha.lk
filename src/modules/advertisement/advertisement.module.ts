import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdvertisementController } from './advertisement.controller';
import { AdvertisementService } from './advertisement.service';
import { AdvertisementMatchingService } from './advertisement-matching.service';
import { AdvertisementEntity } from './entities/advertisement.entity';
import { UserEntity } from '../user/entities/user.entity';
import { StudentEntity } from '../student/entities/student.entity';
import { ParentEntity } from '../parent/entities/parent.entity';
import { CloudStorageService } from '../../common/services/cloud-storage.service';
import { AdvertisementDeliveryService } from './services/advertisement-delivery.service';
import { AdvertisementCacheService } from './services/advertisement-cache.service';
import { SmsModule } from '../sms/sms.module';
import { CacheModule } from '../../common/modules/cache.module';
import { AttendanceModule } from '../attendance/attendance.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AdvertisementEntity,
      UserEntity,
      StudentEntity,
      ParentEntity
    ]),
    SmsModule,
    CacheModule, // For advertisement caching with 12-hour TTL + daily 5 AM refresh
    forwardRef(() => require('../attendance/attendance.module').AttendanceModule),
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
