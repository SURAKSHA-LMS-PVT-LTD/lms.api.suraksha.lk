import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StudyMaterialEntity } from './entities/study_material.entity';
import { StudyMaterialsService } from './study_materials.service';
import { StudyMaterialsController } from './study_materials.controller';

@Module({
  imports: [TypeOrmModule.forFeature([StudyMaterialEntity])],
  controllers: [StudyMaterialsController],
  providers: [StudyMaterialsService],
  exports: [StudyMaterialsService],
})
export class StudyMaterialsModule {}
