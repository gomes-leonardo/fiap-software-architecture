import { OnModuleInit } from '@nestjs/common';
import { Meter, metrics } from '@opentelemetry/api';
import { ServiceOrderStatus } from '@domain/service-order/service-order-status.enum';
import { logger } from '@infrastructure/logging/logger';
import { ServiceOrderMetricsQuery, STALLED_STATUSES } from './service-order-metrics.query';

const CACHE_MS = 60_000;
const QUERY_TIMEOUT_MS = 5_000;
const VOLUME_DAYS = 7;
const DURATION_WINDOW_DAYS = 7;
const STALLED_THRESHOLD_HOURS = 2;
const ALL_STATUSES = Object.values(ServiceOrderStatus);

export interface BusinessSnapshot {
  createdByDaysAgo: number[];
  durations: Map<string, { seconds: number; samples: number }>;
  stalled: Map<string, number>;
}

/**
 * Gauges de negocio dos paineis da direcao (#62) e do alerta de OS parada
 * (#64), lidos do banco no maximo uma vez por minuto por replica.
 *
 * Todo gauge tem um conjunto FIXO de rotulos. O exportador Prometheus do OTel
 * e cumulativo: uma serie observada uma vez continua sendo exportada com o
 * ultimo valor mesmo quando deixa de ser observada. Rotulo que muda (uma data)
 * deixaria series velhas para sempre. Pelo mesmo motivo, uma falha na consulta
 * nao apaga as series: quem diz se os numeros valem e
 * `soat_business_metrics_up`, e paineis e alertas filtram por ele.
 */
export class BusinessMetrics implements OnModuleInit {
  private cached: { at: number; snapshot: BusinessSnapshot } | null = null;
  private inFlight: Promise<BusinessSnapshot | null> | null = null;
  private lastLoadOk = false;

  constructor(
    private readonly query: ServiceOrderMetricsQuery,
    private readonly meter: Meter = metrics.getMeter('soat-app'),
    private readonly now: () => number = Date.now,
  ) {}

  onModuleInit(): void {
    this.meter
      .createObservableGauge('soat_business_metrics_up', {
        description: '1 quando a ultima leitura das metricas de negocio funcionou, 0 quando falhou',
      })
      .addCallback(async (result) => {
        await this.snapshot();
        result.observe(this.lastLoadOk ? 1 : 0);
      });

    this.meter
      .createObservableGauge('soat_service_orders_created_by_day', {
        description: 'OS abertas por dia de Sao Paulo; days_ago=0 e hoje, ate 6',
      })
      .addCallback(async (result) => {
        const snapshot = await this.snapshot();
        snapshot?.createdByDaysAgo.forEach((count, daysAgo) =>
          result.observe(count, { days_ago: String(daysAgo) }),
        );
      });

    this.meter
      .createObservableGauge('soat_service_orders_avg_status_duration_seconds', {
        description:
          'Tempo medio em cada status, passagens encerradas nos ultimos 7 dias; ' +
          'so tem significado quando status_samples > 0',
        unit: 's',
      })
      .addCallback(async (result) => {
        const snapshot = await this.snapshot();
        snapshot?.durations.forEach(({ seconds }, status) => result.observe(seconds, { status }));
      });

    this.meter
      .createObservableGauge('soat_service_orders_status_samples', {
        description: 'Passagens encerradas por status nos ultimos 7 dias, base da media',
      })
      .addCallback(async (result) => {
        const snapshot = await this.snapshot();
        snapshot?.durations.forEach(({ samples }, status) => result.observe(samples, { status }));
      });

    this.meter
      .createObservableGauge('soat_service_orders_stalled', {
        description: 'OS em AGUARDANDO_APROVACAO ou EM_DIAGNOSTICO sem transicao ha mais de 2h',
      })
      .addCallback(async (result) => {
        const snapshot = await this.snapshot();
        snapshot?.stalled.forEach((count, status) => result.observe(count, { status }));
      });
  }

  async snapshot(): Promise<BusinessSnapshot | null> {
    const now = this.now();
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

  private async load(now: number): Promise<BusinessSnapshot | null> {
    try {
      const snapshot = await withTimeout(this.read(new Date(now)), QUERY_TIMEOUT_MS);
      this.cached = { at: now, snapshot };
      this.lastLoadOk = true;
      return snapshot;
    } catch (err) {
      this.lastLoadOk = false;
      logger.error({ err }, 'business metrics query failed');
      return null;
    }
  }

  private async read(at: Date): Promise<BusinessSnapshot> {
    const [days, durations, stalled] = await Promise.all([
      this.query.createdByDay(VOLUME_DAYS, at),
      this.query.averageStatusDuration(DURATION_WINDOW_DAYS, at),
      this.query.stalled(STALLED_THRESHOLD_HOURS, at),
    ]);

    const byStatus = new Map(durations.map((d) => [d.status, d]));
    const stalledByStatus = new Map(stalled.map((s) => [s.status, s.count]));
    return {
      // A consulta devolve do mais antigo para hoje; days_ago conta de hoje para tras.
      createdByDaysAgo: days.map((day) => day.count).reverse(),
      durations: new Map(
        ALL_STATUSES.map((status) => [
          status,
          {
            seconds: byStatus.get(status)?.seconds ?? 0,
            samples: byStatus.get(status)?.samples ?? 0,
          },
        ]),
      ),
      stalled: new Map(
        STALLED_STATUSES.map((status) => [status, stalledByStatus.get(status) ?? 0]),
      ),
    };
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timeout de ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
