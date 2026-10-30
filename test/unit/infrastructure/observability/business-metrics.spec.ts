import { MeterProvider, MetricReader, DataPointType } from '@opentelemetry/sdk-metrics';
import { BusinessMetrics } from '@infrastructure/observability/business-metrics';
import type { ServiceOrderMetricsQuery } from '@infrastructure/observability/service-order-metrics.query';

class TestReader extends MetricReader {
  protected async onForceFlush(): Promise<void> {}
  protected async onShutdown(): Promise<void> {}
}

const WEEK = [
  '2026-10-23',
  '2026-10-24',
  '2026-10-25',
  '2026-10-26',
  '2026-10-27',
  '2026-10-28',
  '2026-10-29',
];

/** Valor de cada serie da metrica, chaveado pelos atributos. */
async function collect(reader: TestReader, name: string): Promise<Record<string, number>> {
  const { resourceMetrics } = await reader.collect();
  const metric = resourceMetrics.scopeMetrics
    .flatMap((scope) => scope.metrics)
    .find((m) => m.descriptor.name === name);
  if (!metric || metric.dataPointType !== DataPointType.GAUGE) return {};
  return Object.fromEntries(
    metric.dataPoints.map((point) => [JSON.stringify(point.attributes), point.value as number]),
  );
}

describe('BusinessMetrics', () => {
  let clock: number;
  let failing: boolean;
  let reader: TestReader;

  const query = {
    createdByDay: jest.fn(async () => {
      if (failing) throw new Error('banco fora');
      return WEEK.map((date, i) => ({ date, count: i === 6 ? 5 : i }));
    }),
    averageStatusDuration: jest.fn(async () => [
      { status: 'EM_DIAGNOSTICO', seconds: 7200, samples: 3 },
    ]),
    stalled: jest.fn(async () => [{ status: 'EM_DIAGNOSTICO', count: 2 }]),
  } as unknown as ServiceOrderMetricsQuery;

  beforeEach(() => {
    clock = Date.UTC(2026, 9, 29, 15);
    failing = false;
    reader = new TestReader();
    const provider = new MeterProvider({ readers: [reader] });
    new BusinessMetrics(query, provider.getMeter('test'), () => clock).onModuleInit();
  });

  it('expoe os 7 dias com days_ago fixo, de hoje (0) para tras', async () => {
    expect(await collect(reader, 'soat_service_orders_created_by_day')).toEqual({
      '{"days_ago":"0"}': 5,
      '{"days_ago":"1"}': 5,
      '{"days_ago":"2"}': 4,
      '{"days_ago":"3"}': 3,
      '{"days_ago":"4"}': 2,
      '{"days_ago":"5"}': 1,
      '{"days_ago":"6"}': 0,
    });
  });

  it('expoe os oito status, com zero amostras onde nao ha passagem encerrada', async () => {
    const samples = await collect(reader, 'soat_service_orders_status_samples');
    expect(Object.keys(samples)).toHaveLength(8);
    expect(samples['{"status":"EM_DIAGNOSTICO"}']).toBe(3);
    expect(samples['{"status":"EM_EXECUCAO"}']).toBe(0);
    expect(
      (await collect(reader, 'soat_service_orders_avg_status_duration_seconds'))[
        '{"status":"EM_DIAGNOSTICO"}'
      ],
    ).toBe(7200);
  });

  it('completa os dois status de OS parada mesmo quando a consulta so traz um', async () => {
    expect(await collect(reader, 'soat_service_orders_stalled')).toEqual({
      '{"status":"AGUARDANDO_APROVACAO"}': 0,
      '{"status":"EM_DIAGNOSTICO"}': 2,
    });
  });

  it('marca up=0 quando a consulta falha, e a serie de dias continua com 7 pontos', async () => {
    expect(await collect(reader, 'soat_business_metrics_up')).toEqual({ '{}': 1 });

    failing = true;
    clock += 61_000;

    expect(await collect(reader, 'soat_business_metrics_up')).toEqual({ '{}': 0 });
    expect(Object.keys(await collect(reader, 'soat_service_orders_created_by_day'))).toHaveLength(
      7,
    );
  });

  it('consulta o banco no maximo uma vez por minuto', async () => {
    jest.mocked(query.createdByDay).mockClear();
    await collect(reader, 'soat_business_metrics_up');
    clock += 30_000;
    await collect(reader, 'soat_business_metrics_up');

    expect(query.createdByDay).toHaveBeenCalledTimes(1);
  });
});
