import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { DesignTemplateEntity } from './entities/design-template.entity';
import { DesignGenerationRecordEntity } from './entities/design-generation-record.entity';
import { InstituteDesignsService } from './institute-designs.service';
import { InstituteDesignsController } from './institute-designs.controller';
import { NotificationCreditsModule } from '../notification-credits/notification-credits.module';
import { FeaturesModule } from '../features/features.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([DesignTemplateEntity, DesignGenerationRecordEntity]),
    NotificationCreditsModule,
    FeaturesModule,
  ],
  controllers: [InstituteDesignsController],
  providers: [InstituteDesignsService],
  exports: [InstituteDesignsService],
})
export class InstituteDesignsModule {}
