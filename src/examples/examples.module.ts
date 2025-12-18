import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [] // Controllers removed due to access control cleanup
})
export class ExamplesModule {}
