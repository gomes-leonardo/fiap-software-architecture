import { ConfigService } from '@nestjs/config';
import { JwtStrategy } from '@infrastructure/auth/jwt.strategy';

const SECRET = 'segredo-de-teste-bem-longo';

function configWith(values: Record<string, string | undefined>): ConfigService {
  return {
    get: jest.fn((key: string, fallback?: string) => values[key] ?? fallback),
  } as unknown as ConfigService;
}

describe('JwtStrategy', () => {
  /**
   * A strategy e instanciada pelo container do Nest durante o boot. Estourar
   * aqui e o que impede a aplicacao de comecar a validar tokens contra um
   * segredo que nao foi escolhido por ninguem.
   */
  it('nao pode ser construida sem JWT_SECRET', () => {
    expect(() => new JwtStrategy(configWith({}))).toThrow(/JWT_SECRET/);
  });

  it('e construida quando o segredo existe', () => {
    expect(() => new JwtStrategy(configWith({ JWT_SECRET: SECRET }))).not.toThrow();
  });

  it('expoe o payload do token como o usuario da requisicao', () => {
    const strategy = new JwtStrategy(configWith({ JWT_SECRET: SECRET }));

    expect(strategy.validate({ sub: 'id-1', email: 'admin@oficina.com', role: 'admin' })).toEqual({
      userId: 'id-1',
      email: 'admin@oficina.com',
      role: 'admin',
    });
  });
});
