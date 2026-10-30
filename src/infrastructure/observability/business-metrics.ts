import { Injectable, OnModuleInit } from '@nestjs/common';
import { metrics, ObservableResult } from '@opentelemetry/api';
import { logger } from '@infrastructure/logging/logger';
import { ServiceOrderMetricsQuery } from './service-order-metrics.query';

const CACHE_MS = 60_000;
const VOLUME_DAYS = 7;
const DURATION_WINDOW_DAYS = 7;
const STALLED_THRESHOLD_HOURS = 2;

interface Snapshot {
  createdByDay: Awaited<ReturnType<ServiceOrderMetricsQuery['createdByDay']>>;
  durations: Awaited<ReturnType<ServiceOrderMetricsQuery['averageStatusDuration']>>;
  stalled: Awaited<ReturnType<ServiceOrderMetricsQuery['stalled']>>;
}

/**
 * Gauges de negocio dos paineis da direcao (#62) e do alerta de OS parada
 * (#64). O coletor le a cada intervalo de exportacao; o SQL roda no maximo uma
 * vez por minuto por replica. Se a consulta falhar, a serie some naquela
 * coleta: o painel mostra "sem dados", que nao se confunde com zero.
 */
@Injectable()
export class BusinessMetrics implements OnModuleInit {
  private cached: { at: number; snapshot: Snapshot } | null = null;
  private inFlight: Promise<Snapshot | null> | null = null;

  constructor(private readonly query: ServiceOrderMetricsQuery) {}

  onModuleInit(): void {
    const meter = metrics.getMeter('soat-app');

    meter
      .createObservableGauge('soat_service_orders_created_by_day', {
        description: 'OS abertas por dia (America/Sao_Paulo), ultimos 7 dias',
      })
      .addCallback(async (result) => {
        const snapshot = await this.snapshot();
        snapshot?.createdByDay.forEach(({ date, count }) => result.observe(count, { date }));
      });

    meter
      .createObservableGauge('soat_service_orders_avg_status_duration_seconds', {
        description: 'Tempo medio em cada status, passagens encerradas nos ultimos 7 dias',
        unit: 's',
      })
      .addCallback(async (result) => {
        const snapshot = await this.snapshot();
        snapshot?.durations.forEach(({ status, seconds }) => result.observe(seconds, { status }));
      });

    meter
      .createObservableGauge('soat_service_orders_stalled', {
        description: 'OS em AGUARDANDO_APROVACAO ou EM_DIAGNOSTICO sem transicao ha mais de 2h',
      })
      .addCallback(async (result: ObservableResult) => {
        const snapshot = await this.snapshot();
        snapshot?.stalled.forEach(({ status, count }) => result.observe(count, { status }));
      });
  }

  async snapshot(now: number = Date.now()): Promise<Snapshot | null> {
    if (this.cached && now - this.cached.at < CACHE_MS) {
      return this.cached.snapshot;
    }
    if (!this.inFlight) {
      this.inFlight = this.load(now).finally(() => {
        this.inFlight = null;
      });
    }
    return this.inFlight;
  }

  private async load(now: number): Promise<Snapshot | null> {
    try {
      const at = new Date(now);
      const snapshot: Snapshot = {
        createdByDay: await this.query.createdByDay(VOLUME_DAYS, at),
        durations: await this.query.averageStatusDuration(DURATION_WINDOW_DAYS, at),
        stalled: await this.query.stalled(STALLED_THRESHOLD_HOURS, at),
      };
      this.cached = { at: now, snapshot };
      return snapshot;
    } catch (err) {
      logger.error({ err }, 'business metrics query failed');
      return null;
    }
  }
}
