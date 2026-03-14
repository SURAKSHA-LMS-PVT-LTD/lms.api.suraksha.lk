import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Card } from './entities/card.entity';
import { UserIdCardOrder } from './entities/user-id-card-order.entity';
import { CardPayment } from './entities/card-payment.entity';
import { UserEntity } from '../user/entities/user.entity';
import { UserImageEntity } from '../user/entities/user-image.entity';
import { CardService } from './services/card.service';
import { CardOrderService } from './services/card-order.service';
import { CardPaymentService } from './services/card-payment.service';
import { PaymentSlipUploadService } from './services/payment-slip-upload.service';
import { CloudStorageService } from '../../common/services/cloud-storage.service';
import { UserCardOrderController } from './controllers/user-card-order.controller';
import { AdminCardOrderController } from './controllers/admin-card-order.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Card,
      UserIdCardOrder,
      CardPayment,
      UserEntity,
      UserImageEntity,
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
    PaymentSlipUploadService,
    CloudStorageService,
  ],
  exports: [
    CardService,
    CardOrderService,
    CardPaymentService,
    PaymentSlipUploadService,
  ],
})
export class UserCardManagementModule {}
