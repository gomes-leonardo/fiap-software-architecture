/**
 * INTEGRATION TEST — listagem de OS ativas
 *
 * A ordenacao roda no banco (CASE de prioridade + created_at). Provar a regra
 * exige Postgres real: um repositorio mockado devolveria a ordem que o proprio
 * teste montou, sem exercitar o SQL.
 */
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { setupTestDb, teardownTestDb, truncateAllTables } from '../../helpers/test-db.helper';
import { ServiceOrderOrmEntity } from '@infrastructure/database/typeorm/entities/service-order.orm-entity';
import { ServiceOrderTypeOrmRepository } from '@infrastructure/database/typeorm/repositories/service-order.typeorm-repository';
import { ServiceOrder } from '@domain/service-order/service-order.entity';
import { ServiceOrderStatus } from '@domain/service-order/service-order-status.enum';

describe('ServiceOrder Active Listing Integration', () => {
  let dataSource: DataSource;
  let repository: ServiceOrderTypeOrmRepository;

  // A coluna client_id e uuid, entao o valor precisa ser um UUID real
  const CLIENT = randomUUID();

  /**
   * O dominio so aceita transicoes legais, entao nao da para nascer uma OS ja
   * em EM_EXECUCAO: e preciso caminhar a matriz ate o status desejado.
   */
  function buildWithStatus(status: ServiceOrderStatus, description: string): ServiceOrder {
    const so = new ServiceOrder({ clientId: CLIENT, description });
    if (status === ServiceOrderStatus.RECEBIDA) return so;

    so.changeStatus(ServiceOrderStatus.EM_DIAGNOSTICO, 'admin-1');
    if (status === ServiceOrderStatus.EM_DIAGNOSTICO) return so;

    so.changeStatus(ServiceOrderStatus.AGUARDANDO_APROVACAO, 'admin-1');
    if (status === ServiceOrderStatus.AGUARDANDO_APROVACAO) return so;

    if (status === ServiceOrderStatus.ENCERRADA_SEM_EXECUCAO) {
      so.changeStatus(ServiceOrderStatus.ENCERRADA_SEM_EXECUCAO, 'admin-1');
      return so;
    }

    so.setBudget(randomUUID());
    so.changeStatus(ServiceOrderStatus.EM_EXECUCAO, 'admin-1');
    if (status === ServiceOrderStatus.EM_EXECUCAO) return so;

    if (status === ServiceOrderStatus.PAUSADO) {
      so.changeStatus(ServiceOrderStatus.PAUSADO, 'admin-1');
      return so;
    }

    so.changeStatus(ServiceOrderStatus.FINALIZADA, 'admin-1');
    if (status === ServiceOrderStatus.FINALIZADA) return so;

    so.changeStatus(ServiceOrderStatus.ENTREGUE, 'admin-1');
    return so;
  }

  /**
   * O save() nao carrega created_at (toOrmEntity nao copia o campo e o DEFAULT
   * do banco vence), entao o timestamp e cravado por UPDATE apos a insercao.
   */
  async function seed(
    status: ServiceOrderStatus,
    description: string,
    createdAt: Date,
  ): Promise<ServiceOrder> {
    const so = buildWithStatus(status, description);
    await repository.save(so);
    await dataSource.getRepository(ServiceOrderOrmEntity).update(so.id, { createdAt });
    return so;
  }

  beforeAll(async () => {
    dataSource = await setupTestDb();
    const ormRepo = dataSource.getRepository(ServiceOrderOrmEntity);
    repository = new ServiceOrderTypeOrmRepository(ormRepo);
  }, 60000);

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    await truncateAllTables(dataSource);
  });

  it('should actually persist the seeded created_at', async () => {
    const seededAt = new Date('2024-01-01T10:00:00Z');
    const so = await seed(ServiceOrderStatus.RECEBIDA, 'os-semeada', seededAt);

    const row = await dataSource
      .getRepository(ServiceOrderOrmEntity)
      .findOne({ where: { id: so.id } });

    expect(row!.createdAt.toISOString()).toBe(seededAt.toISOString());
  });

  it('should order active orders by status priority', async () => {
    // Inseridas fora de ordem de proposito: a ordem de insercao nao pode ser
    // confundida com a ordem esperada.
    await seed(ServiceOrderStatus.PAUSADO, 'pausado', new Date('2024-01-01T10:00:00Z'));
    await seed(ServiceOrderStatus.EM_DIAGNOSTICO, 'diagnostico', new Date('2024-01-02T10:00:00Z'));
    await seed(ServiceOrderStatus.EM_EXECUCAO, 'execucao', new Date('2024-01-03T10:00:00Z'));
    await seed(ServiceOrderStatus.RECEBIDA, 'recebida', new Date('2024-01-04T10:00:00Z'));
    await seed(
      ServiceOrderStatus.AGUARDANDO_APROVACAO,
      'aguardando',
      new Date('2024-01-05T10:00:00Z'),
    );

    const result = await repository.findAllActive();

    expect(result.map((so) => so.description)).toEqual([
      'execucao',
      'aguardando',
      'diagnostico',
      'recebida',
      'pausado',
    ]);
  });

  it('should order orders of the same status from the oldest to the newest', async () => {
    // A mais nova entra primeiro; a mais antiga, por ultimo. Assim a ordem
    // esperada nao coincide nem com a ordem de insercao nem com a de hidratacao.
    await seed(ServiceOrderStatus.EM_EXECUCAO, 'execucao-nova', new Date('2024-06-01T10:00:00Z'));
    await seed(ServiceOrderStatus.EM_EXECUCAO, 'execucao-antiga', new Date('2024-01-01T10:00:00Z'));

    const result = await repository.findAllActive();

    expect(result.map((so) => so.description)).toEqual(['execucao-antiga', 'execucao-nova']);
  });

  it('should exclude terminal statuses without affecting findAll', async () => {
    await seed(ServiceOrderStatus.FINALIZADA, 'finalizada', new Date('2024-01-01T10:00:00Z'));
    await seed(ServiceOrderStatus.ENTREGUE, 'entregue', new Date('2024-01-02T10:00:00Z'));
    await seed(
      ServiceOrderStatus.ENCERRADA_SEM_EXECUCAO,
      'encerrada',
      new Date('2024-01-03T10:00:00Z'),
    );
    await seed(ServiceOrderStatus.RECEBIDA, 'recebida', new Date('2024-01-04T10:00:00Z'));

    const active = await repository.findAllActive();
    const all = await repository.findAll();

    expect(active.map((so) => so.description)).toEqual(['recebida']);
    // findAll() alimenta o relatorio operacional e precisa continuar trazendo tudo
    expect(all).toHaveLength(4);
  });
});
