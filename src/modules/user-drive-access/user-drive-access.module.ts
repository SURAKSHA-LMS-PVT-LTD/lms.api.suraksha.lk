import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { UserDriveTokenEntity } from './entities/user-drive-token.entity';
import { UserDriveFileEntity } from './entities/user-drive-file.entity';
import { UserDriveAccessService } from './services/user-drive-access.service';
import { TokenEncryptionService } from './services/token-encryption.service';
import { UserDriveAccessController } from './user-drive-access.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserDriveTokenEntity, UserDriveFileEntity]),
    HttpModule.register({
      timeout: 30000,      // 30s timeout for Drive API calls
      maxRedirects: 3,
    }),
  ],
  controllers: [UserDriveAccessController],
  providers: [UserDriveAccessService, TokenEncryptionService],
  exports: [UserDriveAccessService], // Export for use in homework module, etc.
})
export class UserDriveAccessModule {}
