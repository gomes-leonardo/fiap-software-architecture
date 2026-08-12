import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServiceOrderController } from './service-order.controller';
import { CreateServiceOrderUseCase } from '@application/service-order/create-service-order.use-case';
import { ChangeServiceOrderStatusUseCase } from '@application/service-order/change-service-order-status.use-case';
import { FindServiceOrderUseCase } from '@application/service-order/find-service-order.use-case';
import { AverageExecutionTimeUseCase } from '@application/service-order/average-execution-time.use-case';
import { OperationalReportUseCase } from '@application/service-order/operational-report.use-case';
import { ServiceOrderRepository } from '@domain/service-order/service-order-repository.port';
import { ServiceOrderTypeOrmRepository } from '@infrastructure/database/typeorm/repositories/service-order.typeorm-repository';
import { ServiceOrderOrmEntity } from '@infrastructure/database/typeorm/entities/service-order.orm-entity';
import { ClientModule } from '../client/client.module';
import { PartModule } from '../part/part.module';

@Module({
  imports: [TypeOrmModule.forFeature([ServiceOrderOrmEntity]), ClientModule, PartModule],
  controllers: [ServiceOrderController],
  providers: [
    CreateServiceOrderUseCase,
    ChangeServiceOrderStatusUseCase,
    FindServiceOrderUseCase,
    AverageExecutionTimeUseCase,
    OperationalReportUseCase,
    {
      provide: ServiceOrderRepository,
      useClass: ServiceOrderTypeOrmRepository,
    },
  ],
  exports: [ServiceOrderRepository, FindServiceOrderUseCase],
})
export class ServiceOrderModule {}
