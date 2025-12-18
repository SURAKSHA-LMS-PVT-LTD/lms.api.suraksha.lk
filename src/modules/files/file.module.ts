import { Module } from '@nestjs/common';
import { FileController } from './file.controller';
import { FileProxyService } from '../../common/services/file-proxy.service';
@Module({
  controllers: [FileController],
  providers: [FileProxyService],
  exports: [FileProxyService],
})
export class FileModule {}
