import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Card } from './entities/card.entity';
import { UserIdCardOrder } from './entities/user-id-card-order.entity';
import { CardPayment } from './entities/card-payment.entity';
import { UserEntity } from '../user/entities/user.entity';
import { CardService } from './services/card.service';
import { CardOrderService } from './services/card-order.service';
import { CardPaymentService } from './services/card-payment.service';
import { UserCardOrderController } from './controllers/user-card-order.controller';
import { AdminCardOrderController } from './controllers/admin-card-order.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Card,
      UserIdCardOrder,
      CardPayment,
      UserEntity,
    ]),
  ],
  controllers: [
    UserCardOrderController,
    AdminCardOrderController,
  ],
  providers: [
    CardService,
    CardOrderService,
    CardPaymentService,
  ],
  exports: [
    CardService,
    CardOrderService,
    CardPaymentService,
  ],
})
export class UserCardManagementModule {}
