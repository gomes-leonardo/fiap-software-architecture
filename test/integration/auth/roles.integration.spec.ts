/**
 * Autorizacao por papel, pela aplicacao real: AppModule inteiro, guards de
 * verdade e Postgres de Testcontainers. Os tokens sao assinados aqui com o
 * mesmo segredo e no mesmo formato que a funcao de autenticacao por CPF e o
 * login de admin usam (ver "Contratos compartilhados" no plano da Fase 3).
 */
import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import type { Server } from 'http';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import * as request from 'supertest';
import { startPostgresContainer } from '../../helpers/test-db.helper';
import type { TestPostgres } from '../../helpers/test-db.helper';

const SECRET = 'roles-integration-secret';
const CLIENT_A = randomUUID();
const CLIENT_B = randomUUID();
const ORDER_A = randomUUID();
const ORDER_B = randomUUID();
const ADMIN_ID = randomUUID();

const ADMIN_ROUTES = [
  '/clients',
  '/vehicles',
  '/services',
  '/parts',
  '/service-orders',
  `/budgets/service-order/${ORDER_A}`,
];

describe('Autorizacao por papel', () => {
  let postgres: TestPostgres;
  let app: INestApplication;
  let http: Server;
  let jwt: JwtService;

  const adminToken = () =>
    jwt.sign(
      { sub: ADMIN_ID, email: 'admin@oficina.com', role: 'admin' },
      { secret: SECRET, issuer: 'soat-app' },
    );
  const clientToken = (clientId: string) =>
    jwt.sign({ sub: clientId, role: 'client' }, { secret: SECRET, issuer: 'soat-auth-lambda' });

  beforeAll(async () => {
    postgres = await startPostgresContainer();
    process.env.NODE_ENV = 'test';
    process.env.DB_HOST = postgres.host;
    process.env.DB_PORT = String(postgres.port);
    process.env.DB_NAME = postgres.database;
    process.env.DB_USER = postgres.username;
    process.env.DB_PASS = postgres.password;
    process.env.JWT_SECRET = SECRET;
    process.env.WEBHOOK_SECRET = 'roles-integration-webhook';
    // Vazias de proposito: um .env local com bootstrap de admin nao pode
    // mudar o que o teste sobe (process.env vence o .env).
    process.env.ADMIN_BOOTSTRAP_EMAIL = '';
    process.env.ADMIN_BOOTSTRAP_PASSWORD = '';

    const { AppModule } = await import('../../../src/app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
    http = app.getHttpServer();
    jwt = new JwtService();

    const ds = app.get(DataSource);
    await ds.query(
      `INSERT INTO "clients" ("id", "name", "cpf_cnpj") VALUES ($1, 'Ana', '52998224725'), ($2, 'Bruno', '11144477735')`,
      [CLIENT_A, CLIENT_B],
    );
    await ds.query(
      `INSERT INTO "vehicles" ("id", "plate", "brand", "model", "year", "owner_client_id")
       VALUES ($1, 'AAA1A11', 'Fiat', 'Uno', 2010, $2), ($3, 'BBB2B22', 'VW', 'Gol', 2012, $4)`,
      [randomUUID(), CLIENT_A, randomUUID(), CLIENT_B],
    );
    await ds.query(
      `INSERT INTO "service_orders" ("id", "client_id", "description", "status")
       VALUES ($1, $2, 'OS da Ana', 'RECEBIDA'), ($3, $4, 'OS do Bruno', 'RECEBIDA')`,
      [ORDER_A, CLIENT_A, ORDER_B, CLIENT_B],
    );
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    await postgres?.container.stop();
  });

  describe('cliente', () => {
    it('ve as proprias ordens de servico, e so elas', async () => {
      const response = await request(http)
        .get('/me/service-orders')
        .set('Authorization', `Bearer ${clientToken(CLIENT_A)}`)
        .expect(200);

      expect(response.body.map((so: { id: string }) => so.id)).toEqual([ORDER_A]);
    });

    it('ve os proprios veiculos, e so eles', async () => {
      const response = await request(http)
        .get('/me/vehicles')
        .set('Authorization', `Bearer ${clientToken(CLIENT_B)}`)
        .expect(200);

      expect(response.body.map((v: { plate: string }) => v.plate)).toEqual(['BBB2B22']);
    });

    it('recebe 403, e nao 401, ao tentar criar administrador', async () => {
      await request(http)
        .post('/auth/register')
        .set('Authorization', `Bearer ${clientToken(CLIENT_A)}`)
        .send({ name: 'Intruso', email: 'intruso@x.com', password: 'Senha-forte-123' })
        .expect(403);
    });

    it.each(ADMIN_ROUTES)('recebe 403 em %s', async (route) => {
      await request(http)
        .get(route)
        .set('Authorization', `Bearer ${clientToken(CLIENT_A)}`)
        .expect(403);
    });

    it('perde o acesso quando e inativado, mesmo com token valido', async () => {
      const ds = app.get(DataSource);
      await ds.query(`UPDATE "clients" SET "status" = 'INATIVO' WHERE "id" = $1`, [CLIENT_A]);
      try {
        await request(http)
          .get('/me/service-orders')
          .set('Authorization', `Bearer ${clientToken(CLIENT_A)}`)
          .expect(403);
      } finally {
        await ds.query(`UPDATE "clients" SET "status" = 'ATIVO' WHERE "id" = $1`, [CLIENT_A]);
      }
    });
  });

  describe('admin', () => {
    it.each(ADMIN_ROUTES)('continua passando em %s', async (route) => {
      await request(http).get(route).set('Authorization', `Bearer ${adminToken()}`).expect(200);
    });

    it('continua criando administrador', async () => {
      await request(http)
        .post('/auth/register')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ name: 'Novo Admin', email: 'novo@oficina.com', password: 'Senha-forte-123' })
        .expect(201);
    });

    it('nao usa as rotas do cliente', async () => {
      await request(http)
        .get('/me/service-orders')
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(403);
    });
  });

  describe('sem token valido', () => {
    it.each([...ADMIN_ROUTES, '/me/service-orders', '/me/vehicles'])(
      'responde 401 em %s sem token',
      async (route) => {
        await request(http).get(route).expect(401);
      },
    );

    it('responde 401 a token assinado com outro segredo', async () => {
      const forged = jwt.sign(
        { sub: CLIENT_A, role: 'client' },
        { secret: 'outro-segredo', issuer: 'soat-auth-lambda' },
      );
      await request(http).get('/me/vehicles').set('Authorization', `Bearer ${forged}`).expect(401);
    });

    it('responde 401 a token de cliente que se diz emitido pela aplicacao', async () => {
      const token = jwt.sign(
        { sub: CLIENT_A, role: 'client' },
        { secret: SECRET, issuer: 'soat-app' },
      );
      await request(http).get('/me/vehicles').set('Authorization', `Bearer ${token}`).expect(401);
    });
  });
});
