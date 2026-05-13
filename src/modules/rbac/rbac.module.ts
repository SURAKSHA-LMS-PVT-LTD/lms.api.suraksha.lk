import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../../auth/auth.module';
import { InstituteUserTypeEntity } from './entities/institute-user-type.entity';
import { InstituteFeaturePermissionEntity } from './entities/institute-feature-permission.entity';
import { UserTypesService } from './services/user-types.service';
import { FeaturePermissionsService } from './services/feature-permissions.service';
import { RbacContextService } from './services/rbac-context.service';
import { RbacController } from './rbac.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      InstituteUserTypeEntity,
      InstituteFeaturePermissionEntity,
    ]),
    AuthModule,
  ],
  controllers: [RbacController],
  providers: [UserTypesService, FeaturePermissionsService, RbacContextService],
  exports: [UserTypesService, FeaturePermissionsService, RbacContextService],
})
export class RbacModule {}
