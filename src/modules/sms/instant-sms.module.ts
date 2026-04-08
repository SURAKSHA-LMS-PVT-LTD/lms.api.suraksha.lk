import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { SmsCampaignEntity } from './entities/sms-campaign.entity';
import { SenderMaskEntity } from './entities/sender-mask.entity';
import { InstituteUserEntity } from '../institute_mudules/institue_user/entities/institue_user.entity';
import { UserEntity } from '../user/entities/user.entity';
import { InstantSmsService } from './services/instant-sms.service';
import { SenderMaskValidationService } from './services/sender-mask-validation.service';
import { InstantSmsController } from './controllers/instant-sms.controller';
import { SenderMaskController } from './controllers/sender-mask.controller';
import { SmslenzProvider } from './providers/smslenz.provider';
import { NotificationCreditsModule } from '../notification-credits/notification-credits.module';

/**
 * Instant SMS Module
 * 
 * Simplified SMS module for instant sending only:
 * - No scheduling logic
 * - No template variables
 * - Same message for all recipients
 * - Credits deducted before sending (via centralized InstituteCreditsService)
 * - Async processing with status updates
 */
@Module({
  imports: [
    ConfigModule,
    NotificationCreditsModule,
    TypeOrmModule.forFeature([
      SmsCampaignEntity,
      SenderMaskEntity,
      InstituteUserEntity,
      UserEntity,
    ]),
  ],
  controllers: [InstantSmsController, SenderMaskController],
  providers: [
    InstantSmsService,
    SenderMaskValidationService,
    SmslenzProvider,
  ],
  exports: [InstantSmsService, SenderMaskValidationService, SmslenzProvider],
})
export class InstantSmsModule {}
