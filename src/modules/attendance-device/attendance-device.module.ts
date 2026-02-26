import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AttendanceDeviceEntity } from './entities/attendance-device.entity';
import { AttendanceDeviceConfigEntity } from './entities/attendance-device-config.entity';
import { AttendanceDeviceEventBindingEntity } from './entities/attendance-device-event-binding.entity';
import { AttendanceDeviceSessionEntity } from './entities/attendance-device-session.entity';
import { AttendanceDeviceAuditLogEntity } from './entities/attendance-device-audit-log.entity';
import { AttendanceDeviceService } from './services/attendance-device.service';
import { SystemAdminDeviceController } from './controllers/system-admin-device.controller';
import { InstituteDeviceController } from './controllers/institute-device.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AttendanceDeviceEntity,
      AttendanceDeviceConfigEntity,
      AttendanceDeviceEventBindingEntity,
      AttendanceDeviceSessionEntity,
      AttendanceDeviceAuditLogEntity,
    ]),
  ],
  controllers: [SystemAdminDeviceController, InstituteDeviceController],
  providers: [AttendanceDeviceService],
  exports: [AttendanceDeviceService],
})
export class AttendanceDeviceModule {}
