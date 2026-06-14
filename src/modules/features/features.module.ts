import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FeaturesService } from './features.service';
import { FeaturesController } from './features.controller';
import { FeatureCatalog } from './entities/feature-catalog.entity';
import { InstituteFeatureToggles } from './entities/institute-feature-toggles.entity';
import { AuthModule } from '../../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([FeatureCatalog, InstituteFeatureToggles]),
    AuthModule,
  ],
  controllers: [FeaturesController],
  providers: [FeaturesService],
  exports: [FeaturesService],
})
export class FeaturesModule {}
