/**
 * `POST /auth/register` nao tinha guard nenhum: qualquer pessoa com acesso de
 * rede criava a propria conta de administrador, fazia login e passava a ler
 * CPF/CNPJ de todos os clientes, veiculos, OS e estoque.
 *
 * A prova disso e o pipeline HTTP real — guard, strategy e ValidationPipe no
 * caminho — e nao a presenca de um decorator. Por isso este spec sobe um app
 * Nest de verdade: o repositorio e falso (nao ha banco aqui), mas a
 * autenticacao e a mesma que roda em producao.
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';

import { AdminRepository } from '@domain/admin/admin-repository.port';
import { Admin } from '@domain/admin/admin.entity';
import { JwtStrategy } from '@infrastructure/auth/jwt.strategy';
import { AuthController } from '@interfaces/http/auth/auth.controller';
import { DomainExceptionFilter } from '@interfaces/http/filters/domain-exception.filter';

const SECRET = 'segredo-de-teste-do-auth-controller';
const EXISTING_ADMIN = {
  name: 'Admin Existente',
  email: 'admin@oficina.com',
  password: 'admin123',
};

class InMemoryAdminRepository extends AdminRepository {
  readonly admins: Admin[] = [];

  async save(admin: Admin): Promise<void> {
    this.admins.push(admin);
  }

  async findByEmail(email: string): Promise<Admin | null> {
    return this.admins.find((admin) => admin.email === email) ?? null;
  }

  async findById(id: string): Promise<Admin | null> {
    return this.admins.find((admin) => admin.id === id) ?? null;
  }

  async existsByEmail(email: string): Promise<boolean> {
    return this.admins.some((admin) => admin.email === email);
  }
}

describe('AuthController (HTTP)', () => {
  let app: INestApplication;
  let repository: InMemoryAdminRepository;
  let jwtService: JwtService;

  beforeEach(async () => {
    repository = new InMemoryAdminRepository();
    await repository.save(await Admin.create(EXISTING_ADMIN));

    const moduleRef = await Test.createTestingModule({
      imports: [PassportModule, JwtModule.register({ secret: SECRET })],
      controllers: [AuthController],
      providers: [
        JwtStrategy,
        { provide: ConfigService, useValue: { get: () => SECRET } },
        { provide: AdminRepository, useValue: repository },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    jwtService = moduleRef.get(JwtService);
    // Mesmas configuracoes globais do main.ts: sem elas o teste passaria por um
    // pipeline que nao e o que roda em producao.
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new DomainExceptionFilter());
    await app.init();
  });

  afterEach(async () => {
    await app?.close();
  });

  function login(password = EXISTING_ADMIN.password) {
    return request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: EXISTING_ADMIN.email, password });
  }

  const NEW_ADMIN = { name: 'Novo Admin', email: 'novo@oficina.com', password: 'senha-nova' };

  describe('POST /auth/register exige um admin autenticado', () => {
    it('recusa quem nao apresenta token', async () => {
      await request(app.getHttpServer()).post('/auth/register').send(NEW_ADMIN).expect(401);

      expect(repository.admins).toHaveLength(1);
    });

    it.each([
      ['header sem o prefixo Bearer', SECRET],
      ['token que nao e um JWT', 'Bearer nao-e-um-jwt'],
      ['token assinado com outro segredo', `Bearer ${signedWithForeignSecret()}`],
    ])('recusa: %s', async (_caso, authorization) => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .set('Authorization', authorization)
        .send(NEW_ADMIN)
        .expect(401);

      expect(repository.admins).toHaveLength(1);
    });

    it('recusa token expirado', async () => {
      const expired = jwtService.sign(
        { sub: 'id', email: EXISTING_ADMIN.email, role: 'admin' },
        { expiresIn: '-1s' },
      );

      await request(app.getHttpServer())
        .post('/auth/register')
        .set('Authorization', `Bearer ${expired}`)
        .send(NEW_ADMIN)
        .expect(401);
    });

    it('aceita o token que o proprio login devolve', async () => {
      const { body: session } = await login().expect(200);

      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .set('Authorization', `Bearer ${session.access_token}`)
        .send(NEW_ADMIN)
        .expect(201);

      expect(response.body).toEqual({
        id: expect.any(String),
        name: NEW_ADMIN.name,
        email: NEW_ADMIN.email,
      });

      const created = await repository.findByEmail(NEW_ADMIN.email);
      await expect(created?.verifyPassword(NEW_ADMIN.password)).resolves.toBe(true);
    });

    it('recusa email duplicado, ja autenticado', async () => {
      const { body: session } = await login();

      await request(app.getHttpServer())
        .post('/auth/register')
        .set('Authorization', `Bearer ${session.access_token}`)
        .send(EXISTING_ADMIN)
        .expect(400);
    });
  });

  /**
   * O guard esta no metodo, nao na classe: se subisse para o controller,
   * `login` passaria a exigir o token que ele mesmo emite e ninguem mais
   * entraria no sistema.
   */
  describe('POST /auth/login continua publico', () => {
    it('responde 200 com o token para credenciais validas', async () => {
      const response = await login().expect(200);

      expect(response.body.access_token).toEqual(expect.any(String));
    });

    it('recusa senha errada com 401', async () => {
      await login('senha-errada').expect(401);
    });
  });

  function signedWithForeignSecret(): string {
    return new JwtService({ secret: 'segredo-de-um-atacante' }).sign({
      sub: 'id-forjado',
      email: 'atacante@oficina.com',
      role: 'admin',
    });
  }
});
