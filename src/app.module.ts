import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_FILTER } from '@nestjs/core';
import { getTypeOrmConfig } from '@infrastructure/database/typeorm/config/typeorm.config';
import { AuthModule } from '@interfaces/http/auth/auth.module';
import { ClientModule } from '@interfaces/http/client/client.module';
import { ServiceOrderModule } from '@interfaces/http/service-order/service-order.module';
import { PartModule } from '@interfaces/http/part/part.module';
import { ServiceModule } from '@interfaces/http/service/service.module';
import { VehicleModule } from '@interfaces/http/vehicle/vehicle.module';
import { BudgetModule } from '@interfaces/http/budget/budget.module';
import { ConsultModule } from '@interfaces/http/consult/consult.module';
import { HealthModule } from '@interfaces/http/health/health.module';
import { WebhookModule } from '@interfaces/http/webhook/webhook.module';
import { MeModule } from '@interfaces/http/me/me.module';
import { GlobalExceptionFilter } from '@interfaces/http/filters/global-exception.filter';
import { ObservabilityModule } from '@infrastructure/observability/observability.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot(getTypeOrmConfig()),
    AuthModule,
    ClientModule,
    ServiceOrderModule,
    PartModule,
    ServiceModule,
    VehicleModule,
    BudgetModule,
    ConsultModule,
    HealthModule,
    WebhookModule,
    MeModule,
    ObservabilityModule,
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
  ],
})
export class AppModule {}
