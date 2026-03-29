import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InstituteHouseEntity } from './entities/institute_house.entity';
import { InstituteHouseMemberEntity } from './entities/institute_house_member.entity';
import { InstituteEntity } from '../../institute/entities/institute.entity';
import { InstituteUserEntity } from '../institue_user/entities/institue_user.entity';
import { UserEntity } from '../../user/entities/user.entity';
import { InstituteHouseService } from './institute_house.service';
import { InstituteHouseController } from './institute_house.controller';
import { CommonModule } from '../../../common/common.module';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { CloudStorageService } from '../../../common/services/cloud-storage.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      InstituteHouseEntity,
      InstituteHouseMemberEntity,
      InstituteEntity,
      InstituteUserEntity,
      UserEntity,
    ]),
    CommonModule,
  ],
  controllers: [InstituteHouseController],
  providers: [InstituteHouseService, JwtAuthGuard, CloudStorageService],
  exports: [InstituteHouseService],
})
export class InstituteHouseModule {}
