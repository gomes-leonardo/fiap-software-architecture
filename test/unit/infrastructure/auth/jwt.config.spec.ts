/**
 * O que este arquivo protege: a aplicacao nao pode subir sem `JWT_SECRET`.
 *
 * O default que existia (`'dev-secret-key-do-not-use-in-production'`) esta
 * publicado neste repositorio. Com ele, uma instalacao sem a variavel subia
 * normalmente e assinava tokens de admin que qualquer pessoa consegue forjar —
 * sem erro, sem log, sem sintoma. Os testes abaixo descrevem o comportamento
 * oposto: falta o segredo, o boot morre com uma mensagem que diz o que fazer.
 */
import { ConfigService } from '@nestjs/config';
import { buildJwtModuleOptions, resolveJwtSecret } from '@infrastructure/auth/jwt.config';

const SECRET = 'segredo-de-teste-bem-longo';

function configWith(values: Record<string, string | undefined>): ConfigService {
  return {
    get: jest.fn((key: string, fallback?: string) => values[key] ?? fallback),
  } as unknown as ConfigService;
}

describe('resolveJwtSecret', () => {
  it('devolve o segredo configurado', () => {
    expect(resolveJwtSecret(configWith({ JWT_SECRET: SECRET }))).toBe(SECRET);
  });

  it.each([
    ['ausente', undefined],
    ['string vazia', ''],
  ])('estoura quando JWT_SECRET esta %s', (_caso, secret) => {
    expect(() => resolveJwtSecret(configWith({ JWT_SECRET: secret }))).toThrow(/JWT_SECRET/);
  });

  /**
   * Um erro de boot so serve se disser o que fazer: quem le o log e a pessoa
   * que precisa criar o `.env`.
   */
  it('diz como corrigir na propria mensagem', () => {
    expect(() => resolveJwtSecret(configWith({}))).toThrow(/\.env/);
  });

  /**
   * Nenhum default: passar um fallback para `config.get` reintroduziria
   * exatamente a falha que este modulo existe para impedir.
   */
  it('nao aceita default vindo do ConfigService', () => {
    const config = configWith({});

    expect(() => resolveJwtSecret(config)).toThrow();
    expect(config.get).toHaveBeenCalledWith('JWT_SECRET');
  });
});

describe('buildJwtModuleOptions', () => {
  it('assina com o segredo configurado', () => {
    const options = buildJwtModuleOptions(configWith({ JWT_SECRET: SECRET }));

    expect(options.secret).toBe(SECRET);
  });

  it('usa JWT_EXPIRES_IN quando definido', () => {
    const options = buildJwtModuleOptions(
      configWith({ JWT_SECRET: SECRET, JWT_EXPIRES_IN: '15m' }),
    );

    expect(options.signOptions?.expiresIn).toBe('15m');
  });

  it('expira em 1h por default — expiracao tem default, segredo nao', () => {
    const options = buildJwtModuleOptions(configWith({ JWT_SECRET: SECRET }));

    expect(options.signOptions?.expiresIn).toBe('1h');
  });

  it('estoura sem JWT_SECRET, derrubando o registro do JwtModule', () => {
    expect(() => buildJwtModuleOptions(configWith({ JWT_EXPIRES_IN: '1h' }))).toThrow(/JWT_SECRET/);
  });
});
