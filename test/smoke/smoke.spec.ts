/**
 * SMOKE TEST — ultimo gate antes do deploy.
 *
 * Sobe o `AppModule` real contra um Postgres de Testcontainers e verifica o
 * caminho critico por HTTP: a aplicacao inicializa, conecta no banco, autentica
 * e responde nos endpoints que nao podem estar quebrados em runtime.
 *
 * O que este arquivo NAO faz: regra de negocio. Isso ja e coberto pelos testes
 * unitarios (`test/unit`) e de integracao (`test/integration`). Aqui so
 * interessa "subiu e responde" — por isso as assercoes ficam no status HTTP e
 * no formato minimo da resposta.
 *
 * Os casos rodam em ordem, como um unico fluxo: o login gera o token usado no
 * CRUD, e o cliente criado no CRUD e o alvo da consulta publica.
 */
import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { Server } from 'http';
import * as request from 'supertest';
import { Admin } from '@domain/admin/admin.entity';
import { AdminRepository } from '@domain/admin/admin-repository.port';
import { startPostgresContainer } from '../helpers/test-db.helper';
import type { TestPostgres } from '../helpers/test-db.helper';

const ADMIN_EMAIL = 'admin@oficina.com';
const ADMIN_PASSWORD = 'admin123';
const SMOKE_CLIENT_CPF = '529.982.247-25';
const UNKNOWN_CLIENT_ID = '00000000-0000-0000-0000-000000000000';

const BOOT_TIMEOUT_MS = 180_000;

describe('Smoke — aplicacao real com banco', () => {
  let postgres: TestPostgres;
  let app: INestApplication;
  let httpServer: Server;
  let accessToken: string;
  let clientId: string;

  beforeAll(async () => {
    postgres = await startPostgresContainer();
    pointEnvironmentAt(postgres);

    // Import dinamico de proposito: `AppModule` chama `getTypeOrmConfig()` no
    // momento em que e avaliado, entao as variaveis `DB_*` precisam ja apontar
    // para o container antes deste import.
    const { AppModule } = await import('../../src/app.module');

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleRef.createNestApplication();
    applyBootstrapConfiguration(app);
    await app.init();

    httpServer = app.getHttpServer();
    await ensureDefaultAdmin(app);
  }, BOOT_TIMEOUT_MS);

  afterAll(async () => {
    await app?.close();
    await postgres?.container.stop();
  });

  it('GET /health responde 200 com status ok', async () => {
    const response = await request(httpServer).get('/health').expect(200);

    expect(response.body.status).toBe('ok');
  });

  it('POST /auth/login autentica o admin e devolve um JWT valido', async () => {
    const response = await request(httpServer)
      .post('/auth/login')
      .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
      .expect(200);

    expect(typeof response.body.access_token).toBe('string');

    // Valida a assinatura com o mesmo segredo que a aplicacao usa: um token
    // sintaticamente parecido com JWT nao prova que o modulo esta configurado.
    const payload = app
      .get(JwtService)
      .verify<{ sub: string; email: string }>(response.body.access_token);
    expect(payload.email).toBe(ADMIN_EMAIL);

    accessToken = response.body.access_token;
  });

  it('POST /clients cria um cliente autenticado (201)', async () => {
    const response = await request(httpServer)
      .post('/clients')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: 'Cliente Smoke',
        cpfCnpj: SMOKE_CLIENT_CPF,
        email: 'smoke@oficina.com',
        phone: '(11) 99999-0000',
      })
      .expect(201);

    expect(response.body.id).toBeDefined();

    clientId = response.body.id;
  });

  it('GET /clients lista os clientes (200)', async () => {
    const response = await request(httpServer)
      .get('/clients')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body.some((client: { id: string }) => client.id === clientId)).toBe(true);
  });

  it('GET /consult/:clientId responde 200 para o cliente e o CPF corretos', async () => {
    const response = await request(httpServer)
      .get(`/consult/${clientId}`)
      .query({ cpf: SMOKE_CLIENT_CPF })
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);
  });

  it('GET /consult/:clientId responde 404 para cliente inexistente, nunca 500', async () => {
    await request(httpServer)
      .get(`/consult/${UNKNOWN_CLIENT_ID}`)
      .query({ cpf: SMOKE_CLIENT_CPF })
      .expect(404);
  });

  it('GET /api-docs serve o Swagger UI', async () => {
    const response = await request(httpServer).get('/api-docs').expect(200);

    expect(response.headers['content-type']).toContain('text/html');
  });
});

/**
 * Aponta a configuracao da aplicacao para o container efemero. `JWT_SECRET` e
 * `WEBHOOK_SECRET` entram aqui porque o `AppModule` real depende delas: sem a
 * segunda, o guard de webhook falha fechado no boot da configuracao.
 */
function pointEnvironmentAt(postgres: TestPostgres): void {
  process.env.NODE_ENV = 'test';
  process.env.DB_HOST = postgres.host;
  process.env.DB_PORT = String(postgres.port);
  process.env.DB_NAME = postgres.database;
  process.env.DB_USER = postgres.username;
  process.env.DB_PASS = postgres.password;
  process.env.JWT_SECRET = 'smoke-test-jwt-secret';
  process.env.WEBHOOK_SECRET = 'smoke-test-webhook-secret';
}

/**
 * Espelha o bootstrap de `src/main.ts`.
 *
 * O pipe de validacao e o Swagger sao registrados na aplicacao, nao no
 * `AppModule`, entao nao vem de graca no `createNestApplication`. Sem isso o
 * smoke test validaria uma aplicacao diferente da que roda em producao — e
 * `GET /api-docs`, que e um dos criterios, nem existiria.
 */
function applyBootstrapConfiguration(app: INestApplication): void {
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Auto Repair Shop OS Management')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  SwaggerModule.setup('api-docs', app, SwaggerModule.createDocument(app, swaggerConfig));
}

/**
 * Garante que o admin padrao existe antes do login.
 *
 * A aplicacao semeia esse admin no construtor do `AuthController`, sem esperar
 * a promessa — pode nao ter terminado quando o primeiro teste roda. Esperamos o
 * seed aparecer e, se ele nao vier, semeamos aqui: o smoke test nao pode
 * depender de um usuario que so existe em algumas maquinas.
 */
async function ensureDefaultAdmin(app: INestApplication): Promise<void> {
  const admins = app.get(AdminRepository);

  for (let attempt = 0; attempt < 25; attempt++) {
    if (await admins.existsByEmail(ADMIN_EMAIL)) {
      return;
    }
    await delay(200);
  }

  await admins.save(
    await Admin.create({ name: 'Admin Smoke', email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
