import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WhatsAppMessageTemplateEntity } from './entities/whatsapp-message-template.entity';
import { WhatsAppCampaignEntity } from './entities/whatsapp-campaign.entity';
import { WhatsAppBroadcastService } from './whatsapp-broadcast.service';
import { WhatsAppBroadcastController } from './whatsapp-broadcast.controller';
import { AttendanceModule } from '../attendance/attendance.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([WhatsAppMessageTemplateEntity, WhatsAppCampaignEntity]),
    AttendanceModule, // for AttendanceNotificationService (session window helpers)
  ],
  controllers: [WhatsAppBroadcastController],
  providers: [WhatsAppBroadcastService],
})
export class WhatsAppBroadcastModule {}
