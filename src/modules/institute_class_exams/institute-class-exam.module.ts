import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';

// Controllers
import { InstituteClassExamController } from './controllers/institute-class-exam.controller';

// Services
import { InstituteClassExamService } from './services/institute-class-exam.service';

// Repositories
import { InstituteClassExamRepository } from './repositories/institute-class-exam.repository';

// Entities
import { InstituteClassExamEntity } from './entities/institute-class-exam.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([InstituteClassExamEntity]),
    ConfigModule, // For accessing environment variables
  ],
  controllers: [
    InstituteClassExamController,
  ],
  providers: [
    // Main services
    InstituteClassExamService,
    
    // Repositories
    InstituteClassExamRepository,
  ],
  exports: [
    // Export services that might be used by other modules
    InstituteClassExamService,
    InstituteClassExamRepository,
  ],
})
export class InstituteClassExamModule {}
