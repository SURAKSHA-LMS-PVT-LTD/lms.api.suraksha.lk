import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SmartCardEntity } from './entities/smart-card.entity';
import { SmartCardAssignmentEntity } from './entities/smart-card-assignment.entity';
import { UserEntity } from '../user/entities/user.entity';
import { InstituteUserEntity } from '../institute_mudules/institue_user/entities/institue_user.entity';
import { SmartCardsService } from './smart-cards.service';
import { AdminSmartCardsController, InstituteSmartCardsController } from './smart-cards.controller';
import { FeaturesModule } from '../features/features.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([SmartCardEntity, SmartCardAssignmentEntity, UserEntity, InstituteUserEntity]),
    FeaturesModule,
  ],
  controllers: [AdminSmartCardsController, InstituteSmartCardsController],
  providers: [SmartCardsService],
  exports: [SmartCardsService],
})
export class SmartCardsModule {}
