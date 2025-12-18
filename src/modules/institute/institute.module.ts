// src/modules/institute/institute.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InstitutesService } from './institute.service';
import { InstitutesController } from './institute.controller';
import { InstituteEntity } from './entities/institute.entity';
import { InstitueClassService } from '../institute_mudules/institue_class/institue_class.service';
import { InstituteClassEntity } from '../institute_mudules/institue_class/entities/institue_class.entity';
import { InstituteClassRepository } from '../institute_mudules/institue_class/repositories/institute-class.repository';
import { CacheModule } from '../../common/modules/cache.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([InstituteEntity, InstituteClassEntity]),
    CacheModule
  ],
  controllers: [InstitutesController],
  providers: [InstitutesService, InstitueClassService, InstituteClassRepository],
  exports: [InstitutesService], // Export service if other modules need it
})
export class InstituteModule {}
