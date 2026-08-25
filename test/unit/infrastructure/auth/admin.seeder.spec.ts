/**
 * Duas coisas estao sob teste aqui, e as duas eram falhas reais:
 *
 * 1. O seed de conveniencia (`admin@oficina.com` / `admin123`, credenciais que
 *    estao no README) rodava sem checar ambiente — inclusive com
 *    `NODE_ENV=production`.
 * 2. Ele era disparado do construtor do controller sem `await`, entao qualquer
 *    rejeicao virava `unhandledRejection`. Os testes abaixo so conseguem
 *    afirmar o que afirmam porque `onModuleInit` devolve a promise ao chamador.
 */
import { ConfigService } from '@nestjs/config';
import { AdminRepository } from '@domain/admin/admin-repository.port';
import { Admin } from '@domain/admin/admin.entity';
import { AdminSeeder, DEV_ADMIN } from '@infrastructure/auth/admin.seeder';

function configWith(values: Record<string, string | undefined>): ConfigService {
  return {
    get: jest.fn((key: string, fallback?: string) => values[key] ?? fallback),
  } as unknown as ConfigService;
}

function repositoryWith(existing: string[] = []) {
  const saved: Admin[] = [];
  const repository = {
    save: jest.fn(async (admin: Admin) => {
      saved.push(admin);
    }),
    existsByEmail: jest.fn(async (email: string) => existing.includes(email)),
    findByEmail: jest.fn(),
    findById: jest.fn(),
  } as unknown as AdminRepository;

  return { repository, saved };
}

describe('AdminSeeder', () => {
  describe('em producao', () => {
    it('nao cria o admin de desenvolvimento', async () => {
      const { repository } = repositoryWith();
      const seeder = new AdminSeeder(configWith({ NODE_ENV: 'production' }), repository);

      await seeder.onModuleInit();

      expect(repository.save).not.toHaveBeenCalled();
    });

    it('nem sequer consulta o email de conveniencia', async () => {
      const { repository } = repositoryWith();
      const seeder = new AdminSeeder(configWith({ NODE_ENV: 'production' }), repository);

      await seeder.onModuleInit();

      expect(repository.existsByEmail).not.toHaveBeenCalled();
    });
  });

  describe('fora de producao', () => {
    it.each([
      ['development', 'development'],
      ['test', 'test'],
      ['NODE_ENV ausente', undefined],
    ])('cria o admin de desenvolvimento — %s', async (_caso, nodeEnv) => {
      const { repository, saved } = repositoryWith();
      const seeder = new AdminSeeder(configWith({ NODE_ENV: nodeEnv }), repository);

      await seeder.onModuleInit();

      expect(saved).toHaveLength(1);
      expect(saved[0].email).toBe(DEV_ADMIN.email);
      await expect(saved[0].verifyPassword(DEV_ADMIN.password)).resolves.toBe(true);
    });

    it('nao duplica quando o admin ja existe', async () => {
      const { repository } = repositoryWith([DEV_ADMIN.email]);
      const seeder = new AdminSeeder(configWith({ NODE_ENV: 'development' }), repository);

      await seeder.onModuleInit();

      expect(repository.save).not.toHaveBeenCalled();
    });
  });

  /**
   * O caminho de entrada do sistema depois que `POST /auth/register` passou a
   * exigir um admin autenticado: sem isto, um ambiente de producao novo ficaria
   * sem nenhuma forma de criar o primeiro administrador.
   */
  describe('bootstrap por variavel de ambiente', () => {
    const BOOTSTRAP = {
      ADMIN_BOOTSTRAP_EMAIL: 'dono@empresa.com',
      ADMIN_BOOTSTRAP_PASSWORD: 'senha-forte-do-dono',
    };

    it('cria o primeiro admin em producao', async () => {
      const { repository, saved } = repositoryWith();
      const seeder = new AdminSeeder(
        configWith({ NODE_ENV: 'production', ...BOOTSTRAP }),
        repository,
      );

      await seeder.onModuleInit();

      expect(saved).toHaveLength(1);
      expect(saved[0].email).toBe('dono@empresa.com');
      await expect(saved[0].verifyPassword('senha-forte-do-dono')).resolves.toBe(true);
    });

    it('substitui o admin de conveniencia tambem fora de producao', async () => {
      const { repository, saved } = repositoryWith();
      const seeder = new AdminSeeder(
        configWith({ NODE_ENV: 'development', ...BOOTSTRAP }),
        repository,
      );

      await seeder.onModuleInit();

      expect(saved.map((admin) => admin.email)).toEqual(['dono@empresa.com']);
    });

    it('usa ADMIN_BOOTSTRAP_NAME quando informado', async () => {
      const { repository, saved } = repositoryWith();
      const seeder = new AdminSeeder(
        configWith({ ...BOOTSTRAP, ADMIN_BOOTSTRAP_NAME: 'Dona da Oficina' }),
        repository,
      );

      await seeder.onModuleInit();

      expect(saved[0].name).toBe('Dona da Oficina');
    });

    it('e idempotente: nao recria o admin a cada boot', async () => {
      const { repository } = repositoryWith(['dono@empresa.com']);
      const seeder = new AdminSeeder(
        configWith({ NODE_ENV: 'production', ...BOOTSTRAP }),
        repository,
      );

      await seeder.onModuleInit();

      expect(repository.save).not.toHaveBeenCalled();
    });

    it.each([
      ['so o email', { ADMIN_BOOTSTRAP_EMAIL: BOOTSTRAP.ADMIN_BOOTSTRAP_EMAIL }],
      ['so a senha', { ADMIN_BOOTSTRAP_PASSWORD: BOOTSTRAP.ADMIN_BOOTSTRAP_PASSWORD }],
    ])('ignora bootstrap incompleto e nao cria nada em producao — %s', async (_caso, partial) => {
      const { repository } = repositoryWith();
      const seeder = new AdminSeeder(
        configWith({ NODE_ENV: 'production', ...partial }),
        repository,
      );

      await seeder.onModuleInit();

      expect(repository.save).not.toHaveBeenCalled();
    });
  });

  /**
   * Antes, o seed corria solto a partir do construtor: uma falha de banco ou uma
   * senha invalida sumia num `unhandledRejection` e a aplicacao seguia servindo
   * requisicoes. Agora o erro chega ao Nest e derruba a inicializacao.
   */
  describe('propagacao de erro', () => {
    it('propaga falha do repositorio em vez de engolir a rejeicao', async () => {
      const { repository } = repositoryWith();
      (repository.save as jest.Mock).mockRejectedValue(new Error('banco fora do ar'));
      const seeder = new AdminSeeder(configWith({ NODE_ENV: 'development' }), repository);

      await expect(seeder.onModuleInit()).rejects.toThrow('banco fora do ar');
    });

    it('propaga senha de bootstrap invalida', async () => {
      const { repository } = repositoryWith();
      const seeder = new AdminSeeder(
        configWith({
          NODE_ENV: 'production',
          ADMIN_BOOTSTRAP_EMAIL: 'dono@empresa.com',
          ADMIN_BOOTSTRAP_PASSWORD: 'curta',
        }),
        repository,
      );

      await expect(seeder.onModuleInit()).rejects.toThrow(/at least 6 characters/);
      expect(repository.save).not.toHaveBeenCalled();
    });
  });
});
