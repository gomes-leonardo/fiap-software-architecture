import { Module } from '@nestjs/common';
import { BusinessMetrics } from './business-metrics';
import { ServiceOrderMetricsQuery } from './service-order-metrics.query';

@Module({
  providers: [
    ServiceOrderMetricsQuery,
    {
      // Factory porque o construtor tambem aceita meter e relogio, que so os
      // testes trocam; o Nest nao injeta interfaces.
      provide: BusinessMetrics,
      useFactory: (query: ServiceOrderMetricsQuery) => new BusinessMetrics(query),
      inject: [ServiceOrderMetricsQuery],
    },
  ],
})
export class ObservabilityModule {}
