import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrganizationService } from './organization.service';
import { OrganizationController } from './organization.controller';
import { OrganizationEntity } from './entities/organization.entity';
import { OrganizationUserEntity } from './entities/organization-user.entity';
import { CauseEntity } from './entities/cause.entity';
import { UserEntity } from '../user/entities/user.entity';
import { InstituteEntity } from '../institute/entities/institute.entity';
import { InstituteUserEntity } from '../institute_mudules/institue_user/entities/institue_user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      OrganizationEntity,
      OrganizationUserEntity,
      CauseEntity,
      UserEntity,
      InstituteEntity,
      InstituteUserEntity,
    ]),
  ],
  controllers: [OrganizationController],
  providers: [OrganizationService],
  exports: [OrganizationService],
})
export class OrganizationModule {}
