import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { InstituteDriveTokenEntity } from './entities/institute-drive-token.entity';
import { InstituteDriveFileEntity } from './entities/institute-drive-file.entity';
import { InstituteDriveService } from './services/institute-drive.service';
import { InstituteDriveController } from './institute-drive.controller';
import { TokenEncryptionService } from '../user-drive-access/services/token-encryption.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([InstituteDriveTokenEntity, InstituteDriveFileEntity]),
    HttpModule.register({ timeout: 30000, maxRedirects: 3 }),
  ],
  controllers: [InstituteDriveController],
  providers: [InstituteDriveService, TokenEncryptionService],
  exports: [InstituteDriveService],
})
export class InstituteDriveModule {}
