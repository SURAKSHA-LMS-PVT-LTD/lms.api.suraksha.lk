require('dotenv').config();
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('./dist/app.module');
const { UserTypesService } = require('./dist/modules/rbac/services/user-types.service');

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const userTypesService = app.get(UserTypesService);
  const result = await userTypesService.list('0868d4dd-37ad-4e2c-86a4-28a4801ebcd6');
  console.log(result);
  await app.close();
}
bootstrap().catch(console.error);
