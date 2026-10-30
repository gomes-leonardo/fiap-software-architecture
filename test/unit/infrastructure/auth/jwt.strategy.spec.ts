import { UnauthorizedException } from '@nestjs/common';
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

  describe('validate', () => {
    const strategy = new JwtStrategy(configWith({ JWT_SECRET: SECRET }));

    it('expoe o token de admin como o usuario da requisicao', () => {
      expect(
        strategy.validate({ sub: 'id-1', email: 'a@oficina.com', role: 'admin', iss: 'soat-app' }),
      ).toEqual({ userId: 'id-1', email: 'a@oficina.com', role: 'admin' });
    });

    it('aceita token de cliente emitido pela autenticacao por CPF', () => {
      expect(strategy.validate({ sub: 'c-1', role: 'client', iss: 'soat-auth-lambda' })).toEqual({
        userId: 'c-1',
        email: undefined,
        role: 'client',
      });
    });

    it('aceita token de admin sem iss, emitido antes da Fase 3', () => {
      expect(strategy.validate({ sub: 'id-1', email: 'a@oficina.com', role: 'admin' }).role).toBe(
        'admin',
      );
    });

    it.each([
      ['papel desconhecido', { sub: 'x', role: 'superuser', iss: 'soat-app' }],
      ['sem sub', { sub: '', role: 'admin', iss: 'soat-app' }],
      ['cliente sem iss', { sub: 'c-1', role: 'client' }],
      ['cliente se dizendo emitido pela app', { sub: 'c-1', role: 'client', iss: 'soat-app' }],
      ['admin emitido pela funcao de CPF', { sub: 'c-1', role: 'admin', iss: 'soat-auth-lambda' }],
    ])('recusa %s', (_caso, payload) => {
      expect(() => strategy.validate(payload)).toThrow(UnauthorizedException);
    });
  });
});
