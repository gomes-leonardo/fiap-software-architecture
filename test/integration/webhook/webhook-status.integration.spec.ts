/**
 * O webhook e a unica porta do sistema que aceita mudanca de status sem login.
 * Este teste sobe o HTTP de verdade — guard, ValidationPipe e filtro de
 * excecao no caminho — contra um Postgres de verdade, porque tudo o que
 * importa aqui e comportamento de borda: quem entra, quem toma 401, e se a
 * matriz de transicao continua valendo para quem vem de fora.
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import * as request from 'supertest';

import { setupTestDb, teardownTestDb, truncateAllTables } from '../../helpers/test-db.helper';
import { ServiceOrderOrmEntity } from '@infrastructure/database/typeorm/entities/service-order.orm-entity';
import { ServiceOrderTypeOrmRepository } from '@infrastructure/database/typeorm/repositories/service-order.typeorm-repository';
import { ServiceOrderRepository } from '@domain/service-order/service-order-repository.port';
import { ServiceOrder } from '@domain/service-order/service-order.entity';
import { ServiceOrderStatus } from '@domain/service-order/service-order-status.enum';
import { ChangeServiceOrderStatusUseCase } from '@application/service-order/change-service-order-status.use-case';
import { WebhookController } from '@interfaces/http/webhook/webhook.controller';
import { DomainExceptionFilter } from '@interfaces/http/filters/domain-exception.filter';

const SECRET = 'segredo-do-webhook-para-teste';
const CLIENT_ID = '11111111-1111-4111-8111-111111111111';

describe('Webhook status update (HTTP)', () => {
  let dataSource: DataSource;
  let app: INestApplication;
  let repository: ServiceOrderTypeOrmRepository;

  beforeAll(async () => {
    dataSource = await setupTestDb();
    repository = new ServiceOrderTypeOrmRepository(dataSource.getRepository(ServiceOrderOrmEntity));

    const moduleRef = await Test.createTestingModule({
      controllers: [WebhookController],
      providers: [
        ChangeServiceOrderStatusUseCase,
        { provide: ServiceOrderRepository, useValue: repository },
        { provide: ConfigService, useValue: { get: () => SECRET } },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    // Mesmas configuracoes globais do main.ts: sem elas o teste passaria por um
    // pipeline que nao e o que roda em producao.
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new DomainExceptionFilter());
    await app.init();
  }, 60000);

  afterAll(async () => {
    await app?.close();
    await teardownTestDb();
  });

  beforeEach(async () => {
    await truncateAllTables(dataSource);
  });

  async function seedOrder(): Promise<ServiceOrder> {
    // Nasce em RECEBIDA, que e onde o construtor coloca toda OS nova.
    const order = new ServiceOrder({ clientId: CLIENT_ID, description: 'OS semeada' });
    await repository.save(order);
    return order;
  }

  function post(orderId: string) {
    return request(app.getHttpServer()).post(`/webhooks/service-orders/${orderId}/status`);
  }

  it('aceita o segredo no header e aplica a transicao', async () => {
    const order = await seedOrder();

    const response = await post(order.id)
      .set('Authorization', `Bearer ${SECRET}`)
      .send({ status: ServiceOrderStatus.EM_DIAGNOSTICO, changedBy: 'gateway-email' });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe(ServiceOrderStatus.EM_DIAGNOSTICO);

    const persisted = await repository.findById(order.id);
    expect(persisted!.status).toBe(ServiceOrderStatus.EM_DIAGNOSTICO);
  });

  it('aceita o segredo no corpo, para integracoes que nao mandam header', async () => {
    const order = await seedOrder();

    const response = await post(order.id).send({
      status: ServiceOrderStatus.EM_DIAGNOSTICO,
      changedBy: 'gateway-email',
      token: SECRET,
    });

    expect(response.status).toBe(200);
  });

  it('responde 401 e nao muda nada quando o segredo esta errado', async () => {
    const order = await seedOrder();

    const response = await post(order.id)
      .set('Authorization', 'Bearer segredo-errado')
      .send({ status: ServiceOrderStatus.EM_DIAGNOSTICO, changedBy: 'invasor' });

    expect(response.status).toBe(401);

    const persisted = await repository.findById(order.id);
    expect(persisted!.status).toBe(ServiceOrderStatus.RECEBIDA);
  });

  it('responde 401 quando nao vem credencial nenhuma', async () => {
    const order = await seedOrder();

    const response = await post(order.id).send({
      status: ServiceOrderStatus.EM_DIAGNOSTICO,
      changedBy: 'anonimo',
    });

    expect(response.status).toBe(401);
  });

  /**
   * O ponto da issue: vir de um sistema externo nao compra o direito de pular
   * etapa. RECEBIDA -> EM_EXECUCAO nao existe na matriz de transicao.
   */
  it('responde 400 numa transicao ilegal, com o segredo correto', async () => {
    const order = await seedOrder();

    const response = await post(order.id)
      .set('Authorization', `Bearer ${SECRET}`)
      .send({ status: ServiceOrderStatus.EM_EXECUCAO, changedBy: 'gateway-email' });

    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/Invalid transition/);

    const persisted = await repository.findById(order.id);
    expect(persisted!.status).toBe(ServiceOrderStatus.RECEBIDA);
  });

  it('responde 400 quando a OS nao existe', async () => {
    const response = await post('00000000-0000-4000-8000-000000000000')
      .set('Authorization', `Bearer ${SECRET}`)
      .send({ status: ServiceOrderStatus.EM_DIAGNOSTICO, changedBy: 'gateway-email' });

    expect(response.status).toBe(400);
  });

  it('responde 400 quando o status enviado nao existe no enum', async () => {
    const order = await seedOrder();

    const response = await post(order.id)
      .set('Authorization', `Bearer ${SECRET}`)
      .send({ status: 'INVENTADO', changedBy: 'gateway-email' });

    expect(response.status).toBe(400);
  });

  /**
   * A autenticacao roda antes da validacao do corpo: um payload invalido
   * apresentado sem credencial tem que sair como 401, nunca como 400 — senao o
   * proprio codigo de status vira um oraculo sobre o formato aceito.
   */
  it('prioriza o 401 sobre o 400 quando o corpo tambem esta invalido', async () => {
    const order = await seedOrder();

    const response = await post(order.id).send({ status: 'INVENTADO' });

    expect(response.status).toBe(401);
  });
});
