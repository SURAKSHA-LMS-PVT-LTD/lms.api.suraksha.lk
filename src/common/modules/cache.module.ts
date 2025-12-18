import { Module } from '@nestjs/common';
import { CacheModule as NestCacheModule } from '@nestjs/cache-manager';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';

// Entities
import { UserEntity } from '../../modules/user/entities/user.entity';
import { StudentEntity } from '../../modules/student/entities/student.entity';
import { ParentEntity } from '../../modules/parent/entities/parent.entity';
import { InstituteUserEntity } from '../../modules/institute_mudules/institue_user/entities/institue_user.entity';
import { InstituteClassEntity } from '../../modules/institute_mudules/institue_class/entities/institue_class.entity';
import { InstituteClassSubjectEntity } from '../../modules/institute_class_modules/institute_class_subject/entities/institute_class_subject.entity';

// Services
import { CacheService } from '../services/cache.service';
import { UserManagementService } from '../services/cache-user-management.service';
import { CacheValidationService } from '../services/cache-validation.service';
import { AdminAccessControlService } from '../services/admin-access-control.service';
import { LayerManagementService } from '../services/layer-management.service';
import { CloudStorageService } from '../services/cloud-storage.service';

// Guards
import { ParentAccessGuard } from '../decorators/validate-parent-access.decorator';
import { EnhancedGlobalUserTypeGuard } from '../guards/enhanced-global-user-type.guard';
import { CacheValidationGuard } from '../guards/cache-validation.guard';

// Config
import cacheConfig from '../../config/cache.config';

@Module({
  imports: [
    // Configuration module with cache config
    ConfigModule.forFeature(cacheConfig),
    
    // NestJS Cache Manager - provides CACHE_MANAGER token
    NestCacheModule.register({
      ttl: 3600, // 1 hour default TTL
      max: 100, // Maximum number of items in cache
      isGlobal: false,
    }),
    
    // TypeORM entities for cache services
    TypeOrmModule.forFeature([
      UserEntity,
      StudentEntity,
      ParentEntity,
      InstituteUserEntity,
      InstituteClassEntity,
      InstituteClassSubjectEntity,
    ]),
    
    // ✅ SIMPLIFIED: Use only CacheService Redis client - no dual Redis connections
  ],
  providers: [
    CacheService,
    UserManagementService,
    CacheValidationService,
    AdminAccessControlService,
    LayerManagementService,
    CloudStorageService,
    ParentAccessGuard,
    EnhancedGlobalUserTypeGuard,
    CacheValidationGuard,
  ],
  controllers: [],
  exports: [
    NestCacheModule, // Re-export to make CACHE_MANAGER available to consumers
    CacheService,
    UserManagementService,
    CacheValidationService,
    AdminAccessControlService,
    LayerManagementService,
    CloudStorageService,
    ParentAccessGuard,
    EnhancedGlobalUserTypeGuard,
    CacheValidationGuard,
  ],
})
export class CacheModule {}
