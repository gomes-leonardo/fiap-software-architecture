/**
 * Consulta publica de OS, pelo HTTP e contra Postgres real.
 *
 * O ponto central e a resposta de recusa: cliente inexistente e CPF que nao
 * corresponde precisam ser indistinguiveis, senao a diferenca confirma que um
 * clientId existe sem que se conheca o CPF dele.
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import * as request from 'supertest';
import { setupTestDb, teardownTestDb, truncateAllTables } from '../../helpers/test-db.helper';
import { ClientOrmEntity } from '@infrastructure/database/typeorm/entities/client.orm-entity';
import { ServiceOrderOrmEntity } from '@infrastructure/database/typeorm/entities/service-order.orm-entity';
import { ClientTypeOrmRepository } from '@infrastructure/database/typeorm/repositories/client.typeorm-repository';
import { ServiceOrderTypeOrmRepository } from '@infrastructure/database/typeorm/repositories/service-order.typeorm-repository';
import { ClientRepository } from '@domain/client/client-repository.port';
import { ServiceOrderRepository } from '@domain/service-order/service-order-repository.port';
import { Client } from '@domain/client/client.entity';
import { ServiceOrder } from '@domain/service-order/service-order.entity';
import { FindClientUseCase } from '@application/client/find-client.use-case';
import { FindServiceOrderUseCase } from '@application/service-order/find-service-order.use-case';
import { ConsultController } from '@interfaces/http/consult/consult.controller';
import {
  InMemoryRateLimitStore,
  RateLimitGuard,
  RateLimitStore,
} from '@interfaces/http/guards/rate-limit.guard';

const CPF_A = '529.982.247-25';
const CPF_B = '111.444.777-35';
const UNKNOWN_CLIENT = '00000000-0000-4000-8000-000000000000';

describe('Consulta publica de OS (HTTP)', () => {
  let dataSource: DataSource;
  let app: INestApplication;
  let clients: ClientTypeOrmRepository;
  let orders: ServiceOrderTypeOrmRepository;

  beforeAll(async () => {
    dataSource = await setupTestDb();
    clients = new ClientTypeOrmRepository(dataSource.getRepository(ClientOrmEntity));
    orders = new ServiceOrderTypeOrmRepository(dataSource.getRepository(ServiceOrderOrmEntity));

    const moduleRef = await Test.createTestingModule({
      controllers: [ConsultController],
      providers: [
        FindClientUseCase,
        FindServiceOrderUseCase,
        RateLimitGuard,
        { provide: RateLimitStore, useValue: new InMemoryRateLimitStore(1000, 60_000) },
        { provide: ClientRepository, useValue: clients },
        { provide: ServiceOrderRepository, useValue: orders },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  }, 60000);

  afterAll(async () => {
    await app.close();
    await teardownTestDb();
  });

  beforeEach(async () => {
    await truncateAllTables(dataSource);
  });

  async function seedClientWithOrder(
    cpf: string,
  ): Promise<{ client: Client; order: ServiceOrder }> {
    const client = new Client({ name: 'Cliente', cpfCnpj: cpf });
    await clients.save(client);
    const order = new ServiceOrder({ clientId: client.id, description: 'Revisão' });
    await orders.save(order);
    return { client, order };
  }

  it('devolve as OS do cliente quando o CPF corresponde', async () => {
    const { client, order } = await seedClientWithOrder(CPF_A);

    const response = await request(app.getHttpServer())
      .get(`/consult/${client.id}`)
      .query({ cpf: CPF_A })
      .expect(200);

    expect(response.body.map((so: { id: string }) => so.id)).toEqual([order.id]);
  });

  it('responde igual para CPF errado e para cliente inexistente', async () => {
    const { client } = await seedClientWithOrder(CPF_A);

    const wrongCpf = await request(app.getHttpServer())
      .get(`/consult/${client.id}`)
      .query({ cpf: CPF_B });
    const unknownClient = await request(app.getHttpServer())
      .get(`/consult/${UNKNOWN_CLIENT}`)
      .query({ cpf: CPF_B });

    expect(wrongCpf.status).toBe(404);
    expect(unknownClient.status).toBe(404);
    expect(wrongCpf.body).toEqual(unknownClient.body);
  });
});
