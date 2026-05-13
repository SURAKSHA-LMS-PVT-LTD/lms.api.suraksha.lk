import { Controller, Get, Patch, Body, Param, UseGuards } from '@nestjs/common';
import { FeaturesService } from './features.service';
import { UpdateFeatureTogglesDto } from './dto/feature.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';

@Controller()
@UseGuards(JwtAuthGuard)
export class FeaturesController {
  constructor(private readonly featuresService: FeaturesService) {}

  @Get('features/catalog')
  getCatalog() {
    return this.featuresService.getFeatureCatalog();
  }

  // Legacy route
  @Get('features/institute/:id')
  getInstituteFeatureTogglesLegacy(@Param('id') id: string) {
    return this.featuresService.getFeaturesForInstitute(+id);
  }

  // Route used by FeaturesContext: GET /institutes/:id/features
  @Get('institutes/:id/features')
  async getInstituteFeatures(@Param('id') id: string) {
    const features = await this.featuresService.getFeaturesForInstitute(+id);
    return { features };
  }

  @Patch('institutes/:id/features')
  @UseGuards(JwtAuthGuard)
  updateInstituteFeatures(
    @Param('id') id: string,
    @Body() updateFeatureDto: UpdateFeatureTogglesDto,
  ) {
    return this.featuresService.updateFeaturesForInstitute(+id, updateFeatureDto);
  }
}
