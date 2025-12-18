import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EnhancedAdvertisingController } from './enhanced-advertising.controller';
import { EnhancedAdvertisingService } from './services/enhanced-advertising.service';
import { AdvertisementEntity } from './entities/advertisement.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([AdvertisementEntity]),
  ],
  controllers: [EnhancedAdvertisingController],
  providers: [EnhancedAdvertisingService],
  exports: [EnhancedAdvertisingService],
})
export class EnhancedAdvertisingModule {}