/**
 * Metricas dos paineis da direcao contra Postgres real, com fixtures de datas
 * e historicos conhecidos. Os valores esperados foram contados a mao a partir
 * das fixtures abaixo, nao pela mesma formula que a consulta usa.
 *
 * "Agora" e 2026-10-29 15:00 UTC, 12:00 em Sao Paulo.
 */
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import {
  seedClient,
  setupTestDb,
  teardownTestDb,
  truncateAllTables,
} from '../../helpers/test-db.helper';
import { ServiceOrderMetricsQuery } from '@infrastructure/observability/service-order-metrics.query';

const NOW = new Date('2026-10-29T15:00:00Z');
const CLIENT = randomUUID();

type Step = [status: string, at: string];

async function seedOrder(
  ds: DataSource,
  createdAt: string,
  steps: Step[],
  deleted = false,
): Promise<void> {
  const history = steps.map(([toStatus, changedAt], i) => ({
    fromStatus: i === 0 ? null : steps[i - 1][0],
    toStatus,
    changedAt,
    changedBy: 'admin',
  }));
  await ds.query(
    `INSERT INTO "service_orders"
       ("id", "client_id", "description", "status", "status_history", "created_at", "deleted_at")
     VALUES ($1, $2, 'OS', $3, $4::jsonb, $5, $6)`,
    [
      randomUUID(),
      CLIENT,
      steps[steps.length - 1][0],
      JSON.stringify(history),
      createdAt,
      deleted ? '2026-10-29T10:00:00' : null,
    ],
  );
}

describe('Metricas de negocio de OS', () => {
  let dataSource: DataSource;
  let query: ServiceOrderMetricsQuery;

  beforeAll(async () => {
    dataSource = await setupTestDb();
    query = new ServiceOrderMetricsQuery(dataSource);
    await truncateAllTables(dataSource);
    await seedClient(dataSource, CLIENT);

    // Hoje, 09:00 em SP. Diagnostico de 2h encerrado; aguardando ha 30 min.
    await seedOrder(dataSource, '2026-10-29T12:00:00', [
      ['RECEBIDA', '2026-10-29T12:00:00Z'],
      ['EM_DIAGNOSTICO', '2026-10-29T12:30:00Z'],
      ['AGUARDANDO_APROVACAO', '2026-10-29T14:30:00Z'],
    ]);
    // 02:30 UTC de hoje e 23:30 de ontem em SP: conta no dia 28.
    await seedOrder(dataSource, '2026-10-29T02:30:00', [['RECEBIDA', '2026-10-29T02:30:00Z']]);
    // Dia 25, ciclo completo ate a entrega.
    await seedOrder(dataSource, '2026-10-25T15:00:00', [
      ['RECEBIDA', '2026-10-25T15:00:00Z'],
      ['EM_DIAGNOSTICO', '2026-10-25T16:00:00Z'],
      ['AGUARDANDO_APROVACAO', '2026-10-25T20:00:00Z'],
      ['EM_EXECUCAO', '2026-10-26T10:00:00Z'],
      ['FINALIZADA', '2026-10-26T13:00:00Z'],
      ['ENTREGUE', '2026-10-27T13:00:00Z'],
    ]);
    // Fora da janela de 7 dias, e parada em diagnostico desde o dia 11.
    await seedOrder(dataSource, '2026-10-10T15:00:00', [
      ['RECEBIDA', '2026-10-10T15:00:00Z'],
      ['EM_DIAGNOSTICO', '2026-10-11T15:00:00Z'],
    ]);
    // Excluida: nao aparece em nada, apesar de recente e parada.
    await seedOrder(
      dataSource,
      '2026-10-29T08:00:00',
      [
        ['RECEBIDA', '2026-10-27T08:00:00Z'],
        ['EM_DIAGNOSTICO', '2026-10-27T09:00:00Z'],
      ],
      true,
    );
  }, 60000);

  afterAll(async () => {
    await teardownTestDb();
  });

  it('conta OS por dia de Sao Paulo, com zero nos dias sem OS', async () => {
    expect(await query.createdByDay(7, NOW)).toEqual([
      { date: '2026-10-23', count: 0 },
      { date: '2026-10-24', count: 0 },
      { date: '2026-10-25', count: 1 },
      { date: '2026-10-26', count: 0 },
      { date: '2026-10-27', count: 0 },
      { date: '2026-10-28', count: 1 },
      { date: '2026-10-29', count: 1 },
    ]);
  });

  it('confere com a contagem SQL direta do mesmo intervalo', async () => {
    const [{ count }] = await dataSource.query(
      `SELECT count(*)::int AS count FROM service_orders
       WHERE deleted_at IS NULL AND created_at >= '2026-10-23T03:00:00'`,
    );
    const total = (await query.createdByDay(7, NOW)).reduce((sum, day) => sum + day.count, 0);
    expect(total).toBe(count);
  });

  it('calcula o tempo medio das passagens encerradas na janela', async () => {
    expect(await query.averageStatusDuration(7, NOW)).toEqual([
      { status: 'AGUARDANDO_APROVACAO', seconds: 14 * 3600 },
      { status: 'EM_DIAGNOSTICO', seconds: 3 * 3600 },
      { status: 'EM_EXECUCAO', seconds: 3 * 3600 },
      { status: 'FINALIZADA', seconds: 24 * 3600 },
      { status: 'RECEBIDA', seconds: 45 * 60 },
    ]);
  });

  it('conta OS paradas ha mais de 2h nos status que esperam alguem', async () => {
    expect(await query.stalled(2, NOW)).toEqual([
      { status: 'AGUARDANDO_APROVACAO', count: 0 },
      { status: 'EM_DIAGNOSTICO', count: 1 },
    ]);
  });
});
