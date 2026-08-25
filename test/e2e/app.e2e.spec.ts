/**
 * O unico teste que sobe o `AppModule` inteiro: todos os modulos, com o
 * ValidationPipe e o filtro de excecao globais, contra um Postgres de verdade.
 * E onde da para afirmar coisas sobre a aplicacao como um todo — quais rotas
 * exigem token e quais nao — em vez de sobre um controller isolado.
 *
 * O banco vem de um container efemero (o mesmo helper dos testes de
 * integracao). Antes esta suite dependia de um Postgres ja rodando na maquina
 * em `localhost:5432`, o que a deixava sem rodar em lugar nenhum: ela nao esta
 * no CI, e quem clonava o repo nao tinha esse banco no ar.
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';

import { setupTestDb, teardownTestDb } from '../helpers/test-db.helper';

const SEEDED_ADMIN = { email: 'admin@oficina.com', password: 'admin123' };
const NEW_ADMIN = { name: 'Segundo Admin', email: 'segundo@oficina.com', password: 'senha-nova' };

describe('App (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const dataSource = await setupTestDb();
    const options = dataSource.options as PostgresConnectionOptions;

    // `getTypeOrmConfig()` e avaliado quando o `AppModule` e carregado, e
    // `JWT_SECRET` deixou de ter default — as duas coisas precisam estar no
    // ambiente antes do import, que por isso e dinamico.
    process.env.DB_HOST = String(options.host);
    process.env.DB_PORT = String(options.port);
    process.env.DB_USER = String(options.username);
    process.env.DB_PASS = String(options.password);
    process.env.DB_NAME = String(options.database);
    process.env.JWT_SECRET = 'segredo-de-teste-e2e';

    const { AppModule } = await import('../../src/app.module');

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    // Mesmo pipeline do main.ts.
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
  }, 120000);

  afterAll(async () => {
    await app?.close();
    await teardownTestDb();
  }, 60000);

  function login(credentials: { email: string; password: string }) {
    return request(app.getHttpServer()).post('/auth/login').send(credentials);
  }

  async function adminToken(): Promise<string> {
    const response = await login(SEEDED_ADMIN).expect(200);
    return response.body.access_token;
  }

  describe('Auth flow', () => {
    /**
     * O admin so existe porque o `AdminSeeder` rodou no boot: fora de producao
     * ele cria as credenciais de conveniencia documentadas no README.
     */
    it('POST /auth/login devolve 200 e um JWT para o admin semeado', async () => {
      const response = await login(SEEDED_ADMIN).expect(200);

      expect(response.body.access_token).toEqual(expect.any(String));
    });

    it('POST /auth/login recusa credenciais invalidas com 401', () => {
      return login({ email: SEEDED_ADMIN.email, password: 'senha-errada' }).expect(401);
    });
  });

  /**
   * A falha critica que este PR fecha: sem guard, qualquer pessoa criava a
   * propria conta de administrador e passava a ler os dados pessoais de todos
   * os clientes.
   */
  describe('POST /auth/register', () => {
    it('recusa com 401 quem nao apresenta token', () => {
      return request(app.getHttpServer()).post('/auth/register').send(NEW_ADMIN).expect(401);
    });

    it('recusa com 401 um token invalido', () => {
      return request(app.getHttpServer())
        .post('/auth/register')
        .set('Authorization', 'Bearer token-forjado')
        .send(NEW_ADMIN)
        .expect(401);
    });

    it('cria um admin utilizavel quando quem chama ja e admin', async () => {
      const token = await adminToken();

      await request(app.getHttpServer())
        .post('/auth/register')
        .set('Authorization', `Bearer ${token}`)
        .send(NEW_ADMIN)
        .expect(201);

      // A conta criada e real: ela loga e recebe o proprio token.
      const session = await login({
        email: NEW_ADMIN.email,
        password: NEW_ADMIN.password,
      }).expect(200);
      expect(session.body.access_token).toEqual(expect.any(String));
    });

    it('recusa email duplicado com 400', async () => {
      const token = await adminToken();

      await request(app.getHttpServer())
        .post('/auth/register')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Outro Nome', ...SEEDED_ADMIN })
        .expect(400);
    });
  });

  describe('Protected routes', () => {
    it.each(['/clients', '/service-orders', '/parts'])('GET %s exige token', (route) => {
      return request(app.getHttpServer()).get(route).expect(401);
    });

    it('GET /clients responde quando o token e valido', async () => {
      const token = await adminToken();

      return request(app.getHttpServer())
        .get('/clients')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
    });
  });

  describe('Public consult route', () => {
    it('GET /consult/:id nao exige auth', () => {
      return request(app.getHttpServer())
        .get('/consult/some-client-id?cpf=12345678901')
        .expect((res) => {
          expect(res.status).not.toBe(401);
        });
    });
  });
});
