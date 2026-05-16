import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FeatureCatalog } from './entities/feature-catalog.entity';
import { InstituteFeatureToggles } from './entities/institute-feature-toggles.entity';
import { UpdateFeatureTogglesDto } from './dto/feature.dto';

@Injectable()
export class FeaturesService {
  constructor(
    @InjectRepository(FeatureCatalog)
    private readonly featureCatalogRepository: Repository<FeatureCatalog>,
    @InjectRepository(InstituteFeatureToggles)
    private readonly instituteFeatureTogglesRepository: Repository<InstituteFeatureToggles>,
  ) {}

  async getFeaturesForInstitute(instituteId: string | number): Promise<any> {
    const allFeatures = await this.featureCatalogRepository.find();

    // institute_feature_toggles.institute_id is still a numeric BIGINT column (not yet migrated to UUID).
    // UUID institute IDs cannot be cast to a number, so skip the toggle lookup for them and
    // return all features enabled by default (they have no toggle rows anyway).
    const numericId = typeof instituteId === 'number' ? instituteId : Number(instituteId);
    const instituteToggles = isNaN(numericId)
      ? []
      : await this.instituteFeatureTogglesRepository.find({ where: { instituteId: numericId } });

    const features = allFeatures.map(feature => {
        const toggle = instituteToggles.find(t => t.featureKey === feature.key);
        return {
            ...feature,
            enabled: toggle ? toggle.enabled : true, // Default to enabled if no explicit toggle
        };
    });

    return features.reduce((acc, feature) => {
        acc[feature.key] = {
            enabled: feature.enabled,
            scope: feature.scope,
            pricing: feature.pricing,
        };
        return acc;
    }, {});
  }

  async updateFeaturesForInstitute(instituteId: string | number, updateDto: UpdateFeatureTogglesDto): Promise<void> {
    const entries = Object.entries(updateDto.features);
    if (entries.length === 0) return;

    // Bulk upsert — one query per changed feature using INSERT ... ON DUPLICATE KEY UPDATE
    const em = this.instituteFeatureTogglesRepository.manager;
    await Promise.all(
      entries.map(([key, enabled]) =>
        em.query(
          `INSERT INTO institute_feature_toggles (institute_id, feature_key, enabled, enabled_source, enabled_at, created_at, updated_at)
           VALUES (?, ?, ?, 'ADMIN', NOW(), NOW(), NOW())
           ON DUPLICATE KEY UPDATE enabled = VALUES(enabled), updated_at = NOW()`,
          [instituteId, key, enabled ? 1 : 0],
        ),
      ),
    );
  }

  async getFeatureCatalog(): Promise<FeatureCatalog[]> {
      return this.featureCatalogRepository.find();
  }
}
