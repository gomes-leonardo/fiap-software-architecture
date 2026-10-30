import { Module } from '@nestjs/common';
import { MeController } from './me.controller';
import { ClientModule } from '../client/client.module';
import { VehicleModule } from '../vehicle/vehicle.module';
import { ServiceOrderModule } from '../service-order/service-order.module';

@Module({
  imports: [ClientModule, VehicleModule, ServiceOrderModule],
  controllers: [MeController],
})
export class MeModule {}
