import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IdCardGeneratorService } from './services/id-card-generator.service';
import { StudentIdCardService } from './services/student-id-card.service';
import { IdCardController } from './controllers/id-card.controller';
import { UserEntity } from '../user/entities/user.entity';
import { StudentEntity } from '../student/entities/student.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserEntity, StudentEntity])
  ],
  controllers: [IdCardController],
  providers: [IdCardGeneratorService, StudentIdCardService],
  exports: [IdCardGeneratorService, StudentIdCardService],
})
export class IdCardModule {}
