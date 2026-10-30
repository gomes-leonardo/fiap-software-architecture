import { Module } from '@nestjs/common';
import { BusinessMetrics } from './business-metrics';
import { ServiceOrderMetricsQuery } from './service-order-metrics.query';

@Module({
  providers: [ServiceOrderMetricsQuery, BusinessMetrics],
})
export class ObservabilityModule {}
