import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IdCardGeneratorService } from './services/id-card-generator.service';
import { IdCardController } from './controllers/id-card.controller';
import { UserEntity } from '../user/entities/user.entity';
@Module({
  imports: [
    TypeOrmModule.forFeature([UserEntity])],
  controllers: [IdCardController],
  providers: [IdCardGeneratorService],
  exports: [IdCardGeneratorService],
})
export class IdCardModule {}
