import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';

import { CardGenerationJobEntity } from './entities/card-generation-job.entity';
import { ServerSideCardGenerationService } from './server-side-card-generation.service';
import { ServerSideCardGenerationController } from './server-side-card-generation.controller';
import { CardRendererService } from './card-renderer.service';
import { LocalPdfGenerationService } from './local-pdf-generation.service';
import { InstituteDesignsModule } from '../institute-designs/institute-designs.module';
import { NotificationCreditsModule } from '../notification-credits/notification-credits.module';

/**
 * Server-Side Card Generation Module
 *
 * Self-contained — depends only on InstituteDesignsModule (for billing) and
 * NotificationCreditsModule (for refunds). Everything else is internal.
 *
 * Migration path to microservice:
 *   1. Move this directory to a separate NestJS app
 *   2. Replace InstituteDesignsModule import with an HTTP/gRPC client that
 *      calls the designs service's commitGeneration endpoint
 *   3. Replace NotificationCreditsModule import with a credits client
 *   4. No other changes needed — the entity, service, and controller stay as-is
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([CardGenerationJobEntity]),
    InstituteDesignsModule,
    NotificationCreditsModule,
  ],
  controllers: [ServerSideCardGenerationController],
  providers: [ServerSideCardGenerationService, CardRendererService, LocalPdfGenerationService],
  exports: [ServerSideCardGenerationService],
})
export class ServerSideCardGenerationModule {}
